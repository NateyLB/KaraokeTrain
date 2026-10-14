import SwiftUI
import CoreML

/// Debug-only entry point; normal playback always uses the server API.
struct SeparationBenchmarkView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var mode = BenchmarkMode.cpu
    @State private var report = "Add the existing HTDemucs_CoreML.mlpackage to the app target, then run on a physical iPhone. Simulator timings describe the Mac. This synthetic test measures speed, not musical separation quality."
    @State private var running = false
    @State private var task: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            Form {
                Picker("Compute units", selection: $mode) {
                    ForEach(BenchmarkMode.allCases) { Text($0.rawValue).tag($0) }
                }.disabled(running)
                Button(running ? "Running…" : "Benchmark 10 seconds") {
                    running = true
                    let selected = mode
                    task = Task {
                        defer { running = false; task = nil }
                        do { report = try await DemucsBenchmark.run(selected) }
                        catch { report = error.localizedDescription }
                    }
                }.disabled(running)
                if running { Button("Stop after current prediction") { task?.cancel() } }
                Text(report).font(.caption.monospaced()).textSelection(.enabled)
                ShareLink("Share report", item: report).disabled(running)
            }
            .navigationTitle("Stem benchmark")
        }
        .onChange(of: scenePhase) { _, value in if value != .active { task?.cancel() } }
        .onDisappear { task?.cancel() }
    }
}

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
    static func run(_ mode: BenchmarkMode) async throws -> String {
        guard Bundle.main.url(forResource: "HTDemucs_CoreML", withExtension: "mlmodelc") != nil else {
            throw StemSeparatorError.invalid("The Core ML model is not bundled. Restore the existing HTDemucs_CoreML.mlpackage using ios/MODEL_SETUP.md before benchmarking.")
        }
        let frames = 441_000
        let stereo = (0..<frames * 2).map { index -> Float in
            let time = Double(index / 2) / 44_100
            return Float(0.15 * sin(2 * .pi * 220 * time) + 0.05 * sin(2 * .pi * 440 * time))
        }
        let pcm = stereo.withUnsafeBytes { Data($0) }
        let separator = StemSeparator(computeUnits: mode.units)
        let output = BenchmarkOutput()
        let thermal = ProcessInfo.processInfo.thermalState.rawValue
        let started = ProcessInfo.processInfo.systemUptime
        try await separator.separate(totalFrames: frames, mean: 0, standardDeviation: 0.25, fetch: { index in
            let start = index * 396_900
            let end = min(frames, start + 441_000)
            return pcm.subdata(in: start * 8..<end * 8)
        }, upload: { _, data in await output.consume(data) }, progress: { _ in })
        let seconds = ProcessInfo.processInfo.systemUptime - started
        return """
        Compute: \(mode.rawValue)
        Synthetic audio: 10 seconds
        Total: \(String(format: "%.3f", seconds)) seconds
        Real-time factor: \(String(format: "%.3f", seconds / 10))
        \(await output.summary)
        Thermal state: \(thermal) → \(ProcessInfo.processInfo.thermalState.rawValue)
        OS: \(ProcessInfo.processInfo.operatingSystemVersionString)
        Physical memory: \(ProcessInfo.processInfo.physicalMemory / 1_048_576) MiB
        Includes cold model load, two overlapping predictions and output inspection.
        No download, transcription or GCS publication. Not a music-quality benchmark.
        """
    }
}
