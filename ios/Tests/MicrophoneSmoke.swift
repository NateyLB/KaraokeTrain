import AVFoundation
import Foundation

@MainActor final class FakeCapture: MicrophoneCaptureService {
    var pending: [UUID: CheckedContinuation<Void, Error>] = [:]
    var active: Set<UUID> = []
    var stopped: [UUID: @MainActor (String?) -> Void] = [:]
    var configuredVolume = 0.0
    var failEffects = false
    func acquire(id: UUID, monitor: Bool, raw: AudioCaptureBus.RawHandler?, analysis: (@MainActor (PitchReading) -> Void)?, stopped: @escaping @MainActor (String?) -> Void) async throws {
        self.stopped[id] = stopped
        try await withCheckedThrowingContinuation { pending[id] = $0 }
        active.insert(id)
    }
    func release(id: UUID) { active.remove(id); stopped[id] = nil }
    func configure(volume: Double, echo: Bool, autoTune: Bool, noiseCancellation: Bool) throws {
        if failEffects { throw CocoaError(.fileWriteUnknown) }
        configuredVolume = volume
    }
    func resolve(_ id: UUID, denied: Bool = false) {
        let continuation = pending.removeValue(forKey: id)!
        if denied { continuation.resume(throwing: CocoaError(.fileReadNoPermission)) }
        else { continuation.resume() }
    }
}

@main struct MicrophoneSmoke {
    @MainActor static func main() async throws {
        for frequency in [65.41, 110.0, 220.0, 440.0, 987.77] {
            let samples = (0..<4096).map { Float(0.3 * sin(2 * .pi * frequency * Double($0) / 48000) + 0.1) }
            let pitch = PitchDetector.analyze(samples, sampleRate: 48000)
            precondition(abs(1200 * log2(pitch.frequency! / frequency)) < 2, "Inaccurate pitch at \(frequency)")
        }
        precondition(PitchDetector.analyze([Float](repeating: 0, count: 4096), sampleRate: 48000).frequency == nil)
        precondition(PitchDetector.analyze([Float](repeating: 0.5, count: 4096), sampleRate: 48000).frequency == nil)
        precondition(PitchDetector.analyze([.nan, 0], sampleRate: 48000).frequency == nil)
        precondition(PitchReading(frequency: 440, rms: 0.2).name == "A4")
        let runtime = FakeCapture()
        let mic = MicrophoneModel(runtime: runtime)
        mic.setEnabled(true)
        await Task.yield()
        let first = runtime.pending.keys.first!
        mic.stop()
        runtime.resolve(first)
        try await Task.sleep(for: .milliseconds(20))
        precondition(!mic.enabled && !mic.isListening && runtime.active.isEmpty, "Late permission enabled capture")
        mic.setEnabled(true); await Task.yield()
        runtime.resolve(runtime.pending.keys.first!, denied: true)
        try await Task.sleep(for: .milliseconds(20))
        precondition(!mic.enabled && mic.error != nil)
        mic.setEnabled(true); await Task.yield()
        let third = runtime.pending.keys.first!
        runtime.resolve(third)
        try await Task.sleep(for: .milliseconds(20))
        precondition(mic.isListening && runtime.active == [third])
        mic.volume = 0.4
        precondition(runtime.configuredVolume == 0.4)
        let other = UUID(); runtime.active.insert(other)
        runtime.stopped[third]?("Route disconnected")
        precondition(!mic.enabled && mic.error == "Route disconnected" && runtime.active == [other])
        precondition(runtime.configuredVolume == 0)
        mic.setEnabled(true); await Task.yield()
        let fourth = runtime.pending.keys.first!
        runtime.resolve(fourth)
        try await Task.sleep(for: .milliseconds(20))
        runtime.failEffects = true
        mic.echo = true
        precondition(!mic.enabled && mic.error != nil && runtime.active == [other])
        print("Microphone pitch, late permission, denial, effects, route and lease isolation checks passed")
    }
}
