import AVFoundation
import Combine
import Foundation

@MainActor
final class RecordingModel: ObservableObject {
    enum Phase { case idle, preparing, recording, exporting, ready }
    @Published private(set) var phase = Phase.idle
    @Published private(set) var elapsed = 0.0
    @Published private(set) var status = ""
    @Published private(set) var error: String?
    @Published private(set) var outputURL: URL?
    @Published private(set) var canRetry = false
    @Published private(set) var cameraFailed = false
    private(set) var camera: CameraRecordingService?
    private let runtime = AudioCaptureRuntime.shared
    private var folder: URL?
    private var writer: MicrophoneRecordingWriter?
    private var lease: UUID?
    private var epoch = 0.0
    private var timeline = RecordingTimeline()
    private var transport = RecordingTransport(jobID: nil, songTime: 0, playing: false, vocalsGain: 1)
    private var task: Task<Void, Never>?
    private var ticker: Task<Void, Never>?
    private var exportTask: Task<URL, Error>?
    private var generation = UUID()
    private var savedCamera: RecordedCamera?
    private let background = RecordingBackgroundTask()
    var transportSnapshot: (() -> RecordingTransport)?

    func update(_ state: RecordingTransport) {
        transport = state
        if phase == .recording { timeline.update(at: min(RecordingTimeline.maximumDuration, max(0, now - epoch)), state: state) }
    }

    func start(includeCamera: Bool, onReady: @escaping @MainActor () -> Void = {}) {
        guard phase == .idle else { return }
        let token = UUID(); generation = token
        phase = .preparing; error = nil; status = "Preparing recording…"
        let runtime = runtime
        task = Task { [weak self] in
            do {
                guard let self else { return }
                let folder = try RecordingFiles.directory(); self.folder = folder
                if includeCamera {
                    let camera = CameraRecordingService(); self.camera = camera
                    try await camera.prepare()
                }
                try Task.checkCancellation()
                guard self.generation == token else { return }
                let id = UUID(); self.lease = id
                try await runtime.acquire(id: id, monitor: false, stopped: { [weak self] message in
                    guard self?.lease == id else { return }
                    if self?.phase == .recording { self?.save() }
                    else { self?.discard() }
                    self?.error = message
                })
                try Task.checkCancellation()
                guard self.generation == token else { runtime.release(id: id); return }
                self.epoch = self.now; self.elapsed = 0; self.timeline = RecordingTimeline()
                let writer = MicrophoneRecordingWriter(url: folder.appendingPathComponent("microphone.caf"), epoch: self.epoch)
                self.writer = writer
                try runtime.beginRecording(writer)
                self.phase = .recording; self.status = "Recording"
                self.transport = self.transportSnapshot?() ?? self.transport
                self.timeline.update(at: 0, state: self.transport)
                onReady()
                if let camera = self.camera { await camera.start(url: folder.appendingPathComponent("camera.mov"), epoch: self.epoch) }
                guard self.generation == token, self.phase == .recording else { return }
                self.startTicker(token: token)
                self.task = nil
            } catch {
                guard self?.generation == token, !Task.isCancelled else { return }
                self?.error = error.localizedDescription
                self?.discard(preserveError: true)
            }
        }
    }

    private func startTicker(token: UUID) {
        ticker = Task { [weak self] in
            var storageCheck = 0
            while !Task.isCancelled {
                do { try await Task.sleep(for: .milliseconds(100)) } catch { return }
                guard let self, self.generation == token, self.phase == .recording else { return }
                self.elapsed = min(RecordingTimeline.maximumDuration, self.now - self.epoch)
                storageCheck += 1
                if storageCheck >= 50, let folder = self.folder {
                    storageCheck = 0
                    do { try RecordingFiles.checkBudget(folder) }
                    catch { self.error = error.localizedDescription; self.save(); return }
                }
                if self.elapsed >= RecordingTimeline.maximumDuration { self.save(); return }
            }
        }
    }

    func save() {
        guard phase == .recording, let folder, let writer else { return }
        phase = .exporting; status = "Finishing microphone recording…"
        ticker?.cancel(); ticker = nil
        elapsed = min(RecordingTimeline.maximumDuration, max(0, now - epoch))
        timeline.finish(at: elapsed)
        let camera = camera, token = generation
        runtime.endRecording()
        if let lease { runtime.release(id: lease); self.lease = nil }
        self.writer = nil
        let backgroundToken = background.begin { [weak self] in self?.pauseSave() }
        task = Task { [weak self] in
            defer { self?.background.end(backgroundToken) }
            do {
                let microphone = try await writer.finish()
                guard self?.generation == token else { return }
                self?.canRetry = true
                let video: RecordedCamera?
                do { video = try await camera?.finish() }
                catch { if self?.generation == token { self?.cameraFailed = true }; throw error }
                guard self?.generation == token else { return }
                self?.savedCamera = video
                try Task.checkCancellation()
                guard let result = try await self?.encode(folder: folder, microphone: microphone, video: video, token: token) else { return }
                guard self?.generation == token else { return }
                self?.outputURL = result; self?.phase = .ready; self?.status = "Ready to share"
            } catch {
                guard self?.generation == token else { return }
                if !Task.isCancelled { self?.error = error.localizedDescription }
                // Keep captured files so a connection failure can be retried.
                self?.phase = .ready; self?.status = Task.isCancelled ? "Save paused" : "Could not save recording"
            }
            if self?.generation == token { self?.task = nil; self?.exportTask = nil }
        }
    }

    func retrySave() {
        guard phase == .ready, canRetry, outputURL == nil, let folder else { return }
        let microphone = folder.appendingPathComponent("microphone.caf")
        let video = savedCamera, token = generation
        phase = .exporting; error = nil
        let backgroundToken = background.begin { [weak self] in self?.pauseSave() }
        task = Task { [weak self] in
            defer { self?.background.end(backgroundToken) }
            do {
                guard let result = try await self?.encode(folder: folder, microphone: microphone, video: video, token: token) else { return }
                guard self?.generation == token else { return }
                self?.outputURL = result; self?.status = "Ready to share"; self?.phase = .ready
            } catch {
                guard self?.generation == token else { return }
                if !Task.isCancelled { self?.error = error.localizedDescription }; self?.phase = .ready
                self?.status = Task.isCancelled ? "Save paused" : "Could not save recording"
            }
            if self?.generation == token { self?.task = nil; self?.exportTask = nil }
        }
    }

    private func encode(folder: URL, microphone: URL, video: RecordedCamera?, token: UUID) async throws -> URL {
        let service = ServerSongService(baseURL: ServerConfiguration.web)
        let segments = timeline.segments, duration = elapsed
        let worker = Task.detached(priority: .userInitiated) { [weak self] in
            try await RecordingExporter.export(folder: folder, microphone: microphone, segments: segments, duration: duration,
                camera: video, mediaURL: { try service.audioURL(jobID: $0) }, progress: { [weak self] in await self?.setStatus($0, token: token) })
        }
        exportTask = worker
        return try await withTaskCancellationHandler { try await worker.value } onCancel: { worker.cancel() }
    }

    private func setStatus(_ status: String, token: UUID) { if generation == token { self.status = status } }
    private func pauseSave() {
        guard phase == .exporting else { return }
        task?.cancel(); exportTask?.cancel()
        status = "Pausing save…"
        error = "iOS paused the export in the background. Keep the app open and tap Retry Save."
    }
    private var now: Double { AVAudioTime.seconds(forHostTime: mach_absolute_time()) }

    func discard(preserveError: Bool = false) {
        generation = UUID()
        ticker?.cancel(); ticker = nil
        task?.cancel(); exportTask?.cancel()
        runtime.endRecording()
        if let lease { runtime.release(id: lease) }; lease = nil
        let writer = writer, camera = camera, folder = folder, worker = exportTask, previous = task
        self.writer = nil; self.camera = nil; self.folder = nil; self.task = nil; exportTask = nil
        outputURL = nil; savedCamera = nil; canRetry = false; cameraFailed = false; phase = .idle; elapsed = 0; status = ""
        if !preserveError { error = nil }
        Task {
            // Cancellation from a task's own error handler must not await itself.
            if !preserveError { _ = await previous?.result }
            _ = await worker?.result
            _ = try? await writer?.finish()
            await camera?.cancel()
            if let folder { try? FileManager.default.removeItem(at: folder) }
        }
    }
}
