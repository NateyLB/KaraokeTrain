import CoreTransferable
import Foundation
import UniformTypeIdentifiers

@main struct BenchmarkReportSmoke {
    static func main() throws {
        let quick = StemSeparationMetrics(modelLoadSeconds: 1, predictions: [
            StemPredictionMetrics(validFrames: 441000, inputSeconds: 0.1, inferenceSeconds: 7, outputSeconds: 0.2),
            StemPredictionMetrics(validFrames: 44100, inputSeconds: 0.1, inferenceSeconds: 6, outputSeconds: 0.1),
        ], elapsedSeconds: 15.473)
        let text = render(quick, seconds: 10)
        precondition(text.contains("Sample real-time factor: 1.547"))
        precondition(text.contains("Model input evaluated: 20 s (9.000 s padding; windows overlap)"))
        precondition(text.contains("Warm full-window inference: not measured"))
        precondition(text.contains("Physical memory: 11514 MiB total; model memory usage is not measured."))
        let warm = StemSeparationMetrics(modelLoadSeconds: 1, predictions: [
            StemPredictionMetrics(validFrames: 441000, inputSeconds: 0, inferenceSeconds: 7, outputSeconds: 0),
            StemPredictionMetrics(validFrames: 441000, inputSeconds: 0, inferenceSeconds: 4, outputSeconds: 0),
            StemPredictionMetrics(validFrames: 441000, inputSeconds: 0, inferenceSeconds: 6, outputSeconds: 0),
            StemPredictionMetrics(validFrames: 132300, inputSeconds: 0, inferenceSeconds: 1, outputSeconds: 0),
        ], elapsedSeconds: 19)
        let warmText = render(warm, seconds: 30)
        precondition(warmText.contains("Warm full-window inference median: 5.000 s (2 measured)"))
        precondition(warmText.contains("Warm inference-only factor per 9 s hop: 0.556"))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let payload = "Compute: CPU + GPU\nThermal state: 0 → 0\n日本語"
        let file = try BenchmarkReportFile.create(payload, root: root)
        precondition(file.url.isFileURL && file.url.pathExtension == "txt")
        let saved = try String(contentsOf: file.url, encoding: .utf8)
        precondition(saved == payload && !saved.contains("%20"))
        let types = BenchmarkReportFile.exportedContentTypes()
        precondition(types.contains(.utf8PlainText) && !types.contains(.url), "Report transfer advertised a URL instead of text")
        print("PASS: benchmark padding and startup caveats, warm full-window timing, RAM labels and UTF-8 .txt sharing")
    }
    static func render(_ metrics: StemSeparationMetrics, seconds: Int) -> String {
        StemBenchmarkReport(compute: "CPU + GPU", audioSeconds: seconds, metrics: metrics, outputSummary: "Output checked",
            thermalBefore: "nominal", thermalAfter: "nominal", operatingSystem: "test", hardware: "test", physicalMemory: 11514 * 1048576).text
    }
}
