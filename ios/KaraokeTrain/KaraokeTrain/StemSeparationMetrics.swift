import Foundation

public nonisolated struct StemPredictionMetrics: Sendable {
    let validFrames: Int
    let inputSeconds: Double
    let inferenceSeconds: Double
    let outputSeconds: Double
}

public nonisolated struct StemSeparationMetrics: Sendable {
    let modelLoadSeconds: Double
    let predictions: [StemPredictionMetrics]
    let elapsedSeconds: Double
}

/// Formatting stays independent of Core ML so timing interpretation can be tested.
nonisolated struct StemBenchmarkReport {
    let compute: String
    let audioSeconds: Int
    let metrics: StemSeparationMetrics
    let outputSummary: String
    let thermalBefore: String
    let thermalAfter: String
    let operatingSystem: String
    let hardware: String
    let physicalMemory: UInt64

    var text: String {
        let inference = metrics.predictions.reduce(0) { $0 + $1.inferenceSeconds }
        let input = metrics.predictions.reduce(0) { $0 + $1.inputSeconds }
        let output = metrics.predictions.reduce(0) { $0 + $1.outputSeconds }
        let valid = metrics.predictions.reduce(0) { $0 + $1.validFrames }
        let padded = metrics.predictions.count * 441_000 - valid
        let warm = metrics.predictions.dropFirst().filter { $0.validFrames == 441_000 }.map(\.inferenceSeconds).sorted()
        let warmLine: String
        if !warm.isEmpty {
            let middle = warm.count / 2
            let median = warm.count % 2 == 0 ? (warm[middle - 1] + warm[middle]) / 2 : warm[middle]
            warmLine = "Warm full-window inference median: \(number(median)) s (\(warm.count) measured)\nWarm inference-only factor per 9 s hop: \(number(median / 9))"
        } else {
            warmLine = "Warm full-window inference: not measured; select the 30-second test."
        }
        let predictionLines = metrics.predictions.enumerated().map { index, prediction in
            "  \(index + 1): \(number(prediction.inferenceSeconds)) s inference; \(number(Double(prediction.validFrames) / 44_100)) s valid audio in a 10 s window"
        }.joined(separator: "\n")
        return """
        KaraokeTrain Core ML stem benchmark
        Allowed compute: \(compute)
        Synthetic audio: \(audioSeconds) seconds
        Separation elapsed: \(number(metrics.elapsedSeconds)) seconds
        Sample real-time factor: \(number(metrics.elapsedSeconds / Double(audioSeconds)))
        Model load: \(number(metrics.modelLoadSeconds)) s
        Prediction calls: \(metrics.predictions.count)
        Model input evaluated: \(metrics.predictions.count * 10) s (\(number(Double(padded) / 44_100)) s padding; windows overlap)
        Inference total: \(number(inference)) s
        Swift input preparation: \(number(input)) s
        Swift output extraction: \(number(output)) s
        \(predictionLines)
        \(warmLine)
        \(outputSummary)
        Thermal state: \(thermalBefore) → \(thermalAfter)
        Hardware identifier: \(hardware)
        OS: \(operatingSystem)
        Physical memory: \(physicalMemory / 1_048_576) MiB total; model memory usage is not measured.
        Fresh model instance per test; Core ML's system cache is not reset.
        Warm factor excludes load, Swift processing, overlap and transfers. It is not a full-song estimate.
        Compute settings permit devices; this report does not identify actual operation placement.
        No download, transcription or GCS publication. Generated audio; not a music-quality benchmark.
        """
    }
    private func number(_ value: Double) -> String {
        String(format: "%.3f", locale: Locale(identifier: "en_US_POSIX"), value)
    }
}
