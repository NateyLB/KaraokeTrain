import Foundation
import Combine
import Speech
import AVFoundation

@MainActor
final class VoiceSearchModel: ObservableObject {
    @Published private(set) var isListening = false
    @Published private(set) var transcript = ""
    @Published private(set) var error: String?
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var recognition: SFSpeechRecognitionTask?
    private var installedTap = false
    private var generation = UUID()
    private var requestingPermission = false
    private var previousSession: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?

    func toggle() {
        if isListening || requestingPermission { stop(); return }
        error = nil
        generation = UUID()
        let token = generation
        requestingPermission = true
        Task {
            let speech = await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
            }
            let microphone = await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
            }
            guard generation == token else { return }
            requestingPermission = false
            guard speech == .authorized && microphone else {
                error = "Enable microphone and speech recognition in Settings to use voice search."
                return
            }
            do {
                guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
                    throw NSError(domain: "VoiceSearch", code: 1, userInfo: [NSLocalizedDescriptionKey: "Speech recognition is currently unavailable."])
                }
                let session = AVAudioSession.sharedInstance()
                previousSession = (session.category, session.mode, session.categoryOptions)
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .mixWithOthers])
                try session.setActive(true)
                let input = engine.inputNode
                let format = input.outputFormat(forBus: 0)
                guard format.sampleRate > 0, format.channelCount > 0 else { throw CocoaError(.featureUnsupported) }
                let request = SFSpeechAudioBufferRecognitionRequest()
                request.shouldReportPartialResults = true
                self.request = request
                input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
                installedTap = true
                transcript = ""
                isListening = true
                recognition = recognizer.recognitionTask(with: request) { [weak model = self] result, failure in
                    let text = result?.bestTranscription.formattedString
                    let final = result?.isFinal == true
                    let message = failure?.localizedDescription
                    Task { @MainActor [weak model] in
                        guard let model, model.generation == token else { return }
                        if let text { model.transcript = text }
                        if let message { model.error = message }
                        if final || message != nil { model.stop() }
                    }
                }
                engine.prepare()
                try engine.start()
            } catch {
                self.error = error.localizedDescription
                stop()
            }
        }
    }

    func stop() {
        generation = UUID()
        requestingPermission = false
        engine.stop()
        if installedTap { engine.inputNode.removeTap(onBus: 0); installedTap = false }
        request?.endAudio(); request = nil
        recognition?.cancel(); recognition = nil
        isListening = false
        if let (category, mode, options) = previousSession {
            try? AVAudioSession.sharedInstance().setCategory(category, mode: mode, options: options)
            previousSession = nil
        }
    }
}
