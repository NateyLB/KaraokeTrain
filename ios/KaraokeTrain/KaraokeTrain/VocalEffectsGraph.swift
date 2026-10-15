import AVFoundation

/// Gain and effects share one owned chain for monitoring and microphone recording.
@MainActor
final class VocalEffectsGraph {
    let gain = AVAudioMixerNode()
    let echo = AVAudioUnitDelay()
    let pitch = AVAudioUnitTimePitch()
    let output = AVAudioMixerNode()

    init(engine: AVAudioEngine) throws {
        for node in [gain, echo, pitch, output] { engine.attach(node) }
        echo.delayTime = 0.3
        echo.feedback = 40
        echo.wetDryMix = 0
        try AudioEngineConnections.connect(gain, to: echo, in: engine)
        try AudioEngineConnections.connect(echo, to: pitch, in: engine)
        try AudioEngineConnections.connect(pitch, to: output, in: engine)
        try AudioEngineConnections.connect(output, to: engine.mainMixerNode, in: engine)
    }

    func configure(volume: Double, echo enabled: Bool, correctionCents: Double) {
        gain.outputVolume = Float(volume.isFinite ? min(1, max(0, volume)) : 0)
        echo.wetDryMix = enabled ? 40 : 0
        pitch.pitch = Float(correctionCents.isFinite ? min(50, max(-50, correctionCents)) : 0)
    }
}
