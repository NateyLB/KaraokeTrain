import AVFoundation
import Foundation

nonisolated final class AudioCaptureBus: @unchecked Sendable {
    typealias RawHandler = @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void
    private let lock = NSLock()
    private var raw: [RawHandler] = []
    private var analysis: (@Sendable (PitchReading) -> Void)?
    private var analysisPending = false
    private let queue = DispatchQueue(label: "karaoke.pitch", qos: .userInitiated)

    func configure(raw: [RawHandler], analysis: (@Sendable (PitchReading) -> Void)?) {
        lock.lock(); defer { lock.unlock() }
        self.raw = raw; self.analysis = analysis
    }

    func receive(_ buffer: AVAudioPCMBuffer, when: AVAudioTime) {
        guard lock.try() else { return }
        let raw = self.raw
        let analysis = analysisPending ? nil : self.analysis
        if analysis != nil { analysisPending = true }
        lock.unlock()
        for handler in raw { handler(buffer, when) }
        guard let analysis else { return }
        guard let channel = buffer.floatChannelData?[0] else {
            lock.lock(); analysisPending = false; lock.unlock(); return
        }
        let count = min(Int(buffer.frameLength), 4096)
        let samples = Array(UnsafeBufferPointer(start: channel, count: count))
        let rate = buffer.format.sampleRate
        queue.async { [weak self] in
            let reading = PitchDetector.analyze(samples, sampleRate: rate)
            analysis(reading)
            if let self { self.lock.lock(); self.analysisPending = false; self.lock.unlock() }
        }
    }
}

@MainActor
protocol MicrophoneCaptureService: AnyObject {
    func acquire(id: UUID, monitor: Bool, raw: AudioCaptureBus.RawHandler?,
                 analysis: (@MainActor (PitchReading) -> Void)?, stopped: @escaping @MainActor (String?) -> Void) async throws
    func release(id: UUID)
    func configure(volume: Double, echo: Bool, autoTune: Bool, noiseCancellation: Bool) throws
}
