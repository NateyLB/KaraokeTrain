import Foundation
import Combine
import Speech
import AVFoundation

/// A lease on the shared microphone; stopping search cannot stop singing/recording.
@MainActor
final class VoiceSearchModel: ObservableObject {
    @Published private(set) var isListening = false
    @Published private(set) var transcript = ""
    @Published private(set) var error: String?
    private let runtime = AudioCaptureRuntime.shared
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var recognition: SFSpeechRecognitionTask?
    private var task: Task<Void, Never>?
    private var lease: UUID?

    func toggle() {
        if lease != nil { stop(); return }
        error = nil
        let id = UUID(), runtime = runtime
        lease = id
        task = Task { [weak self] in
            let speech = await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
            }
            guard self?.lease == id, !Task.isCancelled else { return }
            do {
                guard speech == .authorized else {
                    throw SongServiceError(message: "Enable speech recognition in Settings to use voice search.")
                }
                guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
                    throw SongServiceError(message: "Speech recognition is currently unavailable.")
                }
                let request = SFSpeechAudioBufferRecognitionRequest()
                request.shouldReportPartialResults = true
                self?.request = request
                let receiver = SpeechBufferReceiver(request)
                try await runtime.acquire(id: id, monitor: false, raw: { buffer, _ in receiver.append(buffer) }, stopped: { [weak self] message in
                    guard self?.lease == id else { return }
                    self?.stop(); self?.error = message
                })
                guard self?.lease == id, !Task.isCancelled else { runtime.release(id: id); return }
                self?.transcript = ""
                self?.isListening = true
                self?.recognition = recognizer.recognitionTask(with: request) { [weak self] result, failure in
                    let text = result?.bestTranscription.formattedString
                    let final = result?.isFinal == true
                    let message = failure?.localizedDescription
                    Task { @MainActor [weak self] in
                        guard self?.lease == id else { return }
                        if let text { self?.transcript = text }
                        if let message { self?.error = message }
                        if final || message != nil { self?.stop() }
                    }
                }
            } catch {
                guard self?.lease == id, !Task.isCancelled else { return }
                self?.stop(); self?.error = error.localizedDescription
            }
            if self?.lease == id { self?.task = nil }
        }
    }

    func stop() {
        task?.cancel(); task = nil
        if let lease { runtime.release(id: lease) }
        lease = nil
        request?.endAudio(); request = nil
        recognition?.cancel(); recognition = nil
        isListening = false
    }

    deinit {
        task?.cancel(); request?.endAudio(); recognition?.cancel()
        if let lease { let runtime = runtime; Task { @MainActor in runtime.release(id: lease) } }
    }
}

/// SFSpeechAudioBufferRecognitionRequest accepts appended buffers from the input tap.
private nonisolated final class SpeechBufferReceiver: @unchecked Sendable {
    let request: SFSpeechAudioBufferRecognitionRequest
    init(_ request: SFSpeechAudioBufferRecognitionRequest) { self.request = request }
    func append(_ buffer: AVAudioPCMBuffer) { request.append(buffer) }
}
