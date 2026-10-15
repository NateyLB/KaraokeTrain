import AVFoundation
import Foundation

/// The app owns one hardware microphone, shared by singing and speech recognition.
@MainActor
final class AudioCaptureRuntime: MicrophoneCaptureService {
    static let shared = AudioCaptureRuntime()
    private struct Lease {
        let monitor: Bool
        let raw: AudioCaptureBus.RawHandler?
        let analysis: (@MainActor (PitchReading) -> Void)?
        let stopped: @MainActor (String?) -> Void
    }
    private let engine = AVAudioEngine()
    private var effects: VocalEffectsGraph?
    private let bus = AudioCaptureBus()
    private var leases: [UUID: Lease] = [:]
    private var permission: Task<Bool, Never>?
    private var tapped = false
    private var recordingTapped = false
    private var recordingWriter: MicrophoneRecordingWriter?
    private var volume = 0.0
    private var echo = false
    private var autoTune = false
    private var noiseCancellation = true
    private var correction = 0.0
    private var consumerGeneration = UUID()
    private var observers: [NSObjectProtocol] = []

    init() {
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue else { return }
            Task { @MainActor [weak self] in self?.stopAll(message: "Microphone paused by an audio interruption. Enable it again when ready.") }
        })
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            guard (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue else { return }
            Task { @MainActor [weak self] in self?.stopAll(message: "The audio device disconnected. Enable the microphone again when ready.") }
        })
        observers.append(NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, !self.leases.isEmpty, !self.engine.isRunning else { return }
                self.stopAll(message: "Audio settings changed. Enable the microphone again when ready.")
            }
        })
    }

    func acquire(id: UUID, monitor: Bool, raw: AudioCaptureBus.RawHandler? = nil,
                 analysis: (@MainActor (PitchReading) -> Void)? = nil,
                 stopped: @escaping @MainActor (String?) -> Void) async throws {
        leases[id] = Lease(monitor: monitor, raw: raw, analysis: analysis, stopped: stopped)
        if permission == nil {
            permission = Task {
                await withCheckedContinuation { continuation in
                    AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
                }
            }
        }
        let allowed = await permission!.value
        permission = nil
        guard leases[id] != nil else { throw CancellationError() }
        do {
            try Task.checkCancellation()
            guard allowed else { throw SongServiceError(message: "Enable microphone access in Settings to sing or use voice search.") }
            if !engine.isRunning { try startEngine() }
            updateConsumers()
        } catch {
            release(id: id)
            throw error
        }
    }

    func release(id: UUID) {
        leases[id] = nil
        if leases.isEmpty { stopEngine() }
        else { updateConsumers() }
    }

    func configure(volume: Double, echo: Bool, autoTune: Bool, noiseCancellation: Bool) throws {
        self.volume = volume; self.echo = echo; self.autoTune = autoTune
        let changed = self.noiseCancellation != noiseCancellation
        self.noiseCancellation = noiseCancellation
        if changed, engine.isRunning {
            do { stopEngine(restorePlayback: false); try startEngine(); updateConsumers() }
            catch { stopAll(message: error.localizedDescription); throw error }
        }
        effects?.configure(volume: volume, echo: echo, correctionCents: autoTune ? correction : 0)
    }

    func beginRecording(_ writer: MicrophoneRecordingWriter) throws {
        guard recordingWriter == nil, engine.isRunning else { throw RecordingError("The microphone is not ready to record.") }
        recordingWriter = writer
        installRecordingTap()
    }

    func endRecording() {
        if recordingTapped { effects?.pitch.removeTap(onBus: 0); recordingTapped = false }
        recordingWriter = nil
    }

    private func installRecordingTap() {
        guard !recordingTapped, let writer = recordingWriter, let pitch = effects?.pitch else { return }
        pitch.installTap(onBus: 0, bufferSize: 2048, format: nil) { buffer, time in writer.receive(buffer, time: time) }
        recordingTapped = true
    }

    private func startEngine() throws {
        do { try buildAndStartEngine() }
        catch { stopEngine(); throw error }
    }

    private func buildAndStartEngine() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: noiseCancellation ? .voiceChat : .default,
                                options: [.defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers])
        try session.setActive(true)
        if effects == nil { effects = try VocalEffectsGraph(engine: engine) }
        let input = engine.inputNode
        if input.isVoiceProcessingEnabled != noiseCancellation { try input.setVoiceProcessingEnabled(noiseCancellation) }
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { throw SongServiceError(message: "No microphone input is available.") }
        engine.disconnectNodeOutput(input)
        try AudioEngineConnections.connect(input, to: effects!.gain, in: engine, format: format)
        let bus = self.bus
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, time in bus.receive(buffer, when: time) }
        tapped = true
        effects?.configure(volume: volume, echo: echo, correctionCents: autoTune ? correction : 0)
        effects?.output.outputVolume = leases.values.contains(where: \.monitor) ? 1 : 0
        engine.prepare()
        try engine.start()
        installRecordingTap()
    }

    private func updateConsumers() {
        consumerGeneration = UUID()
        let token = consumerGeneration
        bus.configure(raw: leases.values.compactMap(\.raw), analysis: { [weak self] reading in
            Task { @MainActor [weak self] in
                guard let self, self.consumerGeneration == token else { return }
                self.correction = reading.cents.map { 0.5 * self.correction - 0.5 * $0 } ?? 0
                self.effects?.configure(volume: self.volume, echo: self.echo, correctionCents: self.autoTune ? self.correction : 0)
                for lease in self.leases.values { lease.analysis?(reading) }
            }
        })
        effects?.output.outputVolume = leases.values.contains(where: \.monitor) ? 1 : 0
    }

    private func stopEngine(restorePlayback: Bool = true) {
        consumerGeneration = UUID()
        bus.configure(raw: [], analysis: nil)
        engine.stop()
        if recordingTapped { effects?.pitch.removeTap(onBus: 0); recordingTapped = false }
        if tapped { engine.inputNode.removeTap(onBus: 0); tapped = false }
        correction = 0
        if restorePlayback {
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try? AVAudioSession.sharedInstance().setActive(true)
        }
    }

    private func stopAll(message: String?) {
        let stopped = leases.values.map(\.stopped)
        leases.removeAll()
        stopEngine()
        for callback in stopped { callback(message) }
    }

    deinit { for observer in observers { NotificationCenter.default.removeObserver(observer) } }
}
