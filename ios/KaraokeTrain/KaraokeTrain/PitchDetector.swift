import Foundation
import Accelerate

nonisolated struct PitchReading: Equatable, Sendable {
    let frequency: Double?
    let rms: Float
    var volume: Double { min(1, max(0, Double(rms) * 3.5)) }
    var midi: Double? { frequency.map { 69 + 12 * log2($0 / 440) } }
    var cents: Double? { midi.map { ($0 - $0.rounded()) * 100 } }
    var name: String? {
        guard let midi else { return nil }
        let note = Int(midi.rounded())
        let names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
        return "\(names[((note % 12) + 12) % 12])\(note / 12 - 1)"
    }
}

/// Normalized autocorrelation runs off the render thread, with Accelerate dot products.
nonisolated enum PitchDetector {
    static func analyze(_ input: [Float], sampleRate: Double) -> PitchReading {
        guard input.count >= 128, sampleRate.isFinite, sampleRate > 0,
              input.allSatisfy(\.isFinite) else { return PitchReading(frequency: nil, rms: 0) }
        var rms: Float = 0, mean: Float = 0
        vDSP_rmsqv(input, 1, &rms, vDSP_Length(input.count))
        guard rms >= 0.025 else { return PitchReading(frequency: nil, rms: rms) }
        vDSP_meanv(input, 1, &mean, vDSP_Length(input.count))
        let samples = input.map { $0 - mean }
        var energy = [Double](repeating: 0, count: samples.count + 1)
        for index in samples.indices { energy[index + 1] = energy[index] + Double(samples[index] * samples[index]) }
        let first = max(2, Int(sampleRate / 1500)), last = min(samples.count / 2 - 1, Int(sampleRate / 60))
        guard first < last, energy.last! > 0.0001 else { return PitchReading(frequency: nil, rms: rms) }
        var correlation = [Float](repeating: 0, count: last + 2)
        samples.withUnsafeBufferPointer { buffer in
            for lag in first - 1...last + 1 {
                let count = samples.count - lag
                var dot: Float = 0
                vDSP_dotpr(buffer.baseAddress!, 1, buffer.baseAddress! + lag, 1, &dot, vDSP_Length(count))
                let denominator = sqrt(energy[count] * (energy[samples.count] - energy[lag]))
                correlation[lag] = denominator > 0 ? Float(Double(dot) / denominator) : 0
            }
        }
        for lag in first...last where correlation[lag] > 0.8 && correlation[lag] > correlation[lag - 1] && correlation[lag] >= correlation[lag + 1] {
            let before = Double(correlation[lag - 1]), center = Double(correlation[lag]), after = Double(correlation[lag + 1])
            let denominator = before - 2 * center + after
            let offset = abs(denominator) > 1e-9 ? max(-1, min(1, 0.5 * (before - after) / denominator)) : 0
            return PitchReading(frequency: sampleRate / (Double(lag) + offset), rms: rms)
        }
        return PitchReading(frequency: nil, rms: rms)
    }
}
