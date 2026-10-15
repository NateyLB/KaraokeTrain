import Foundation
import CoreTransferable
import UniformTypeIdentifiers

/// Explicit text-file transfer avoids treating the report's first colon as a URL scheme.
nonisolated struct BenchmarkReportFile: Transferable, Sendable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .utf8PlainText) { report in
            SentTransferredFile(report.url)
        }
    }

    static func create(_ text: String, root: URL = FileManager.default.temporaryDirectory) throws -> Self {
        let directory = root.appendingPathComponent("KaraokeTrainBenchmarks", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        // Sharing services can read after the view closes. Keep files for a day.
        for file in (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey, .isRegularFileKey])) ?? [] {
            guard file.lastPathComponent.hasPrefix("KaraokeTrain-benchmark-"), file.pathExtension == "txt",
                  let values = try? file.resourceValues(forKeys: [.creationDateKey, .isRegularFileKey]), values.isRegularFile == true,
                  let created = values.creationDate, Date().timeIntervalSince(created) > 86400 else { continue }
            try? FileManager.default.removeItem(at: file)
        }
        let url = directory.appendingPathComponent("KaraokeTrain-benchmark-\(UUID().uuidString).txt")
        try text.write(to: url, atomically: true, encoding: .utf8)
        return Self(url: url)
    }
}
