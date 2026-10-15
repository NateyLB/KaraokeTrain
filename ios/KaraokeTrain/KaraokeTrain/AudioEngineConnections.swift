import AVFoundation

@MainActor
enum AudioEngineConnections {
    static func connect(_ source: AVAudioNode, to destination: AVAudioNode, in engine: AVAudioEngine, format: AVAudioFormat? = nil) throws {
        if #available(iOS 27, macOS 27, *) { try engine.connectNode(source, to: destination, format: format) }
        else { engine.connect(source, to: destination, format: format) }
    }
}
