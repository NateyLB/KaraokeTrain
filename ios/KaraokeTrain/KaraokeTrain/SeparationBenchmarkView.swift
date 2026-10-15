import SwiftUI
import UIKit

/// Debug-only entry point; normal playback always uses the server API.
struct SeparationBenchmarkView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var mode = BenchmarkMode.cpu
    @State private var audioSeconds = 10
    @State private var report = "Run on a physical iPhone. The 30-second sample separates model loading, first inference and warm full-window timings. Simulator timings describe the Mac. Generated audio does not measure musical quality."
    @State private var reportFile: BenchmarkReportFile?
    @State private var hasResult = false
    @State private var copied = false
    @State private var shareError: String?
    @State private var running = false
    @State private var task: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            Form {
                Picker("Compute units", selection: $mode) {
                    ForEach(BenchmarkMode.allCases) { Text($0.rawValue).tag($0) }
                }.disabled(running)
                Picker("Sample length", selection: $audioSeconds) {
                    Text("10 seconds · quick").tag(10)
                    Text("30 seconds · warm timings").tag(30)
                }.disabled(running)
                Button(running ? "Running…" : "Benchmark \(audioSeconds) seconds") {
                    running = true; hasResult = false; reportFile = nil; shareError = nil; copied = false
                    let selected = mode, duration = audioSeconds
                    task = Task {
                        defer { running = false; task = nil }
                        do { report = try await DemucsBenchmark.run(selected, audioSeconds: duration) }
                        catch { report = "KaraokeTrain benchmark did not complete\n" + error.localizedDescription }
                        hasResult = true
                        do { reportFile = try BenchmarkReportFile.create(report) }
                        catch { shareError = "Could not create the report file. Use Copy report instead." }
                    }
                }.disabled(running)
                if running { Button("Stop after current prediction") { task?.cancel() } }
                Text(report).font(.caption.monospaced()).textSelection(.enabled)
                Button(copied ? "Copied" : "Copy report") { UIPasteboard.general.string = report; copied = true }
                    .disabled(running || !hasResult)
                if let reportFile {
                    ShareLink("Share report (.txt)", item: reportFile, preview: SharePreview("KaraokeTrain stem benchmark"))
                }
                if let shareError { Text(shareError).font(.caption).foregroundStyle(.orange) }
            }
            .navigationTitle("Stem benchmark")
        }
        .onChange(of: scenePhase) { _, value in if value != .active { task?.cancel() } }
        .onDisappear { task?.cancel() }
    }
}
