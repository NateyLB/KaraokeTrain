import Foundation
import CoreML
import Darwin

nonisolated enum BenchmarkMode: String, CaseIterable, Identifiable, Sendable {
    case cpu = "CPU", gpu = "CPU + GPU", all = "All available"
    var id: String { rawValue }
    var units: MLComputeUnits {
        switch self { case .cpu: .cpuOnly; case .gpu: .cpuAndGPU; case .all: .all }
    }
}

private actor BenchmarkOutput {
    private var samples = 0
    private var peak: Float = 0
    func consume(_ data: Data) {
        samples += data.count / MemoryLayout<Float>.stride
        data.withUnsafeBytes { bytes in
            for offset in stride(from: 0, to: bytes.count, by: 4) {
                peak = max(peak, abs(bytes.loadUnaligned(fromByteOffset: offset, as: Float.self)))
            }
        }
    }
    var summary: String { "Output samples: \(samples); peak: \(peak)" }
}

nonisolated enum DemucsBenchmark {
    static func run(_ mode: BenchmarkMode, audioSeconds: Int = 10) async throws -> String {
        guard Bundle.main.url(forResource: "HTDemucs_CoreML", withExtension: "mlmodelc") != nil else {
            throw StemSeparatorError.invalid("The Core ML model is not bundled. Restore the existing HTDemucs_CoreML.mlpackage using ios/MODEL_SETUP.md before benchmarking.")
        }
        guard [10, 30].contains(audioSeconds) else { throw StemSeparatorError.invalid("Choose a 10- or 30-second benchmark.") }
        let frames = audioSeconds * 44_100
        let stereo = (0..<frames * 2).map { index -> Float in
            let time = Double(index / 2) / 44_100
            return Float(0.15 * sin(2 * .pi * 220 * time) + 0.05 * sin(2 * .pi * 440 * time))
        }
        let pcm = stereo.withUnsafeBytes { Data($0) }
        let separator = StemSeparator(computeUnits: mode.units)
        let output = BenchmarkOutput()
        let thermal = ProcessInfo.processInfo.thermalState.rawValue
        let started = ProcessInfo.processInfo.systemUptime
        let timing = try await separator.separate(totalFrames: frames, mean: 0, standardDeviation: 0.25, fetch: { index in
            let start = index * 396_900
            let end = min(frames, start + 441_000)
            return pcm.subdata(in: start * 8..<end * 8)
        }, upload: { _, data in await output.consume(data) }, progress: { _ in })
        let seconds = ProcessInfo.processInfo.systemUptime - started
        let metrics = StemSeparationMetrics(modelLoadSeconds: timing.modelLoadSeconds, predictions: timing.predictions, elapsedSeconds: seconds)
        return StemBenchmarkReport(compute: mode.rawValue, audioSeconds: audioSeconds, metrics: metrics,
            outputSummary: await output.summary, thermalBefore: thermalLabel(thermal),
            thermalAfter: thermalLabel(ProcessInfo.processInfo.thermalState.rawValue),
            operatingSystem: ProcessInfo.processInfo.operatingSystemVersionString,
            hardware: hardwareIdentifier(), physicalMemory: ProcessInfo.processInfo.physicalMemory).text
    }

    private static func thermalLabel(_ value: Int) -> String {
        switch ProcessInfo.ThermalState(rawValue: value) {
        case .nominal: "nominal (\(value))"
        case .fair: "fair (\(value))"
        case .serious: "serious (\(value))"
        case .critical: "critical (\(value))"
        default: "unknown (\(value))"
        }
    }

    private static func hardwareIdentifier() -> String {
        #if targetEnvironment(simulator)
        return "Simulator: " + (ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? "unknown") + "; timings and memory belong to the Mac"
        #else
        var info = utsname()
        guard uname(&info) == 0 else { return "unknown" }
        return withUnsafeBytes(of: &info.machine) { bytes in
            String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self)
        }
        #endif
    }
}
