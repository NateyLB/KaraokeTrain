import Combine
import Foundation

@MainActor
final class MicrophoneModel: ObservableObject {
    @Published private(set) var enabled = false
    @Published private(set) var isListening = false
    @Published private(set) var isRequesting = false
    @Published private(set) var error: String?
    @Published private(set) var reading = PitchReading(frequency: nil, rms: 0)
    @Published var volume = 1.0 { didSet { applyEffects() } }
    @Published var echo = false { didSet { applyEffects() } }
    @Published var autoTune = false { didSet { applyEffects() } }
    @Published var noiseCancellation = true { didSet { applyEffects() } }
    private let runtime: any MicrophoneCaptureService
    private var lease: UUID?
    private var task: Task<Void, Never>?

    init(runtime: any MicrophoneCaptureService) { self.runtime = runtime }
    #if os(iOS)
    convenience init() { self.init(runtime: AudioCaptureRuntime.shared) }
    #endif

    func setEnabled(_ enabled: Bool) {
        guard enabled else { stop(); return }
        guard !self.enabled else { return }
        self.enabled = true
        isRequesting = true
        error = nil
        let id = UUID(), runtime = runtime
        lease = id
        task = Task { [weak self] in
            do {
                try await runtime.acquire(id: id, monitor: true, raw: nil, analysis: { [weak self] value in
                    if self?.lease == id { self?.reading = value }
                }, stopped: { [weak self] message in
                    guard self?.lease == id else { return }
                    self?.stop()
                    self?.error = message
                })
                guard !Task.isCancelled, self?.lease == id else { runtime.release(id: id); return }
                self?.isListening = true
                self?.isRequesting = false
                self?.applyEffects()
            } catch {
                guard self?.lease == id, !Task.isCancelled else { return }
                self?.stop()
                self?.error = error.localizedDescription
            }
            if self?.lease == id { self?.task = nil }
        }
    }

    func stop() {
        task?.cancel(); task = nil
        if let lease { runtime.release(id: lease) }
        lease = nil
        enabled = false
        isListening = false
        isRequesting = false
        reading = PitchReading(frequency: nil, rms: 0)
        try? runtime.configure(volume: 0, echo: echo, autoTune: autoTune, noiseCancellation: noiseCancellation)
    }

    private func applyEffects() {
        do { try runtime.configure(volume: enabled ? volume : 0, echo: echo, autoTune: autoTune, noiseCancellation: noiseCancellation) }
        catch { self.error = error.localizedDescription; stop() }
    }

    deinit {
        task?.cancel()
        if let lease {
            let runtime = runtime
            Task { @MainActor in runtime.release(id: lease) }
        }
    }
}
