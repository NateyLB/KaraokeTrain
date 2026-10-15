import AVFoundation
import Foundation

/// Video-only capture leaves the shared microphone's AVAudioSession untouched.
nonisolated final class CameraRecordingService: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "karaoke.recording.camera", qos: .userInitiated)
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var firstTimestamp: CMTime?
    private var startOffset = 0.0
    private var epoch = 0.0
    private var failure: Error?
    private var prepared = false
    private var url: URL?

    func prepare() async throws {
        let allowed = await AVCaptureDevice.requestAccess(for: .video)
        try Task.checkCancellation()
        guard allowed else { throw RecordingError("Enable camera access in Settings, or choose audio recording.") }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async { [self] in
                do {
                    guard !prepared else { continuation.resume(); return }
                    session.beginConfiguration()
                    defer { session.commitConfiguration() }
                    session.automaticallyConfiguresApplicationAudioSession = false
                    if session.canSetSessionPreset(.hd1280x720) { session.sessionPreset = .hd1280x720 }
                    guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) else { throw RecordingError("No front camera is available. Choose audio recording instead.") }
                    let device = try AVCaptureDeviceInput(device: camera)
                    guard session.canAddInput(device) else { throw RecordingError("Could not open the camera.") }
                    session.addInput(device)
                    let output = AVCaptureVideoDataOutput()
                    output.alwaysDiscardsLateVideoFrames = true
                    output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
                    guard session.canAddOutput(output) else { throw RecordingError("Could not prepare camera capture.") }
                    session.addOutput(output)
                    output.setSampleBufferDelegate(self, queue: queue)
                    if let connection = output.connection(with: .video) {
                        if connection.isVideoRotationAngleSupported(0) { connection.videoRotationAngle = 0 }
                        if connection.isVideoMirroringSupported { connection.automaticallyAdjustsVideoMirroring = false; connection.isVideoMirrored = true }
                    }
                    prepared = true
                    continuation.resume()
                } catch { continuation.resume(throwing: error) }
            }
        }
    }

    func start(url: URL, epoch: Double) async {
        await withCheckedContinuation { continuation in
            queue.async { [self] in
                self.url = url; self.epoch = epoch
                session.startRunning()
                continuation.resume()
            }
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard failure == nil, let url, let pixel = CMSampleBufferGetImageBuffer(sampleBuffer),
              let clock = session.synchronizationClock else { return }
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let host = CMSyncConvertTime(timestamp, from: clock, to: CMClockGetHostTimeClock()).seconds
        guard host.isFinite, host - epoch < RecordingTimeline.maximumDuration else { return }
        do {
            if writer == nil {
                let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
                let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264,
                    AVVideoWidthKey: CVPixelBufferGetWidth(pixel), AVVideoHeightKey: CVPixelBufferGetHeight(pixel)])
                input.expectsMediaDataInRealTime = true
                guard writer.canAdd(input) else { throw RecordingError("Camera encoding is unavailable.") }
                writer.add(input)
                guard writer.startWriting() else { throw writer.error ?? RecordingError("Could not start camera recording.") }
                writer.startSession(atSourceTime: timestamp)
                self.writer = writer; self.input = input; firstTimestamp = timestamp
                startOffset = max(0, host - epoch)
            }
            if let input, input.isReadyForMoreMediaData, !input.append(sampleBuffer) {
                throw writer?.error ?? RecordingError("The camera stopped recording.")
            }
        } catch { failure = error }
    }

    func finish() async throws -> RecordedCamera {
        try await withCheckedThrowingContinuation { continuation in
            queue.async { [self] in
                let destination = url
                url = nil
                session.stopRunning()
                if let failure { writer?.cancelWriting(); continuation.resume(throwing: failure); return }
                guard let writer, let input, firstTimestamp != nil, let url = destination else { continuation.resume(throwing: RecordingError("The camera did not produce video.")); return }
                input.markAsFinished()
                let offset = startOffset
                writer.finishWriting {
                    if writer.status == .completed { continuation.resume(returning: RecordedCamera(url: url, startOffset: offset)) }
                    else { continuation.resume(throwing: writer.error ?? RecordingError("Camera export failed.")) }
                }
            }
        }
    }

    func cancel() async {
        await withCheckedContinuation { continuation in
            queue.async { [self] in session.stopRunning(); writer?.cancelWriting(); url = nil; continuation.resume() }
        }
    }
}
