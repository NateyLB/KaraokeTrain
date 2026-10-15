import AVFoundation
import Foundation

@main struct VocalEffectsSmoke {
    @MainActor static func main() throws {
        let dry = try render(volume: 1, echo: false), quiet = try render(volume: 0.25, echo: false)
        let muted = try render(volume: 0, echo: true), echoed = try render(volume: 1, echo: true)
        let active = 2000..<6000, tail = 24000..<40000
        func energy(_ signal: [Float], _ range: Range<Int>) -> Double { range.reduce(0) { $0 + Double(signal[$1] * signal[$1]) } }
        let ratio = energy(quiet, active) / energy(dry, active)
        precondition(abs(ratio - 0.0625) < 0.005, "Microphone gain is incorrect")
        precondition(muted.allSatisfy { abs($0) < 0.00001 }, "Muted microphone is audible")
        precondition(energy(echoed, tail) > 0.001, "Echo has no delayed tail")
        precondition(energy(dry, tail) < 0.00001, "Dry audio leaked into delayed tail")
        print("PASS: offline microphone gain, mute and real delayed echo through the owned effects graph")
    }
    @MainActor static func render(volume: Double, echo: Bool) throws -> [Float] {
        let engine = AVAudioEngine(), player = AVAudioPlayerNode()
        let graph = try VocalEffectsGraph(engine: engine)
        let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!
        engine.attach(player); try AudioEngineConnections.connect(player, to: graph.gain, in: engine, format: format)
        graph.configure(volume: volume, echo: echo, correctionCents: 0)
        let source = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 48000)!
        source.frameLength = 48000
        for channel in 0..<2 { for index in 0..<48000 { source.floatChannelData![channel][index] = index < 9600 ? Float(0.2 * sin(2 * .pi * 440 * Double(index) / 48000)) : 0 } }
        try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 4096)
        player.scheduleBuffer(source)
        try engine.start()
        if #available(macOS 27, *) { try player.playAudio() } else { player.play() }
        defer { player.stop(); engine.stop() }
        let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096)!
        var result: [Float] = []
        while result.count < 48000 {
            let status = try engine.renderOffline(AVAudioFrameCount(min(4096, 48000 - result.count)), to: output)
            precondition(status == .success)
            result.append(contentsOf: UnsafeBufferPointer(start: output.floatChannelData![0], count: Int(output.frameLength)))
        }
        return result
    }
}
