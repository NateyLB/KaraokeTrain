import AVFoundation
import Foundation

nonisolated struct RecordedCamera: Sendable {
    let url: URL
    let startOffset: Double
}

nonisolated enum RecordingExporter {
    static func export(folder: URL, microphone: URL, segments: [RecordingSegment], duration: Double,
                       camera: RecordedCamera?, mediaURL: @Sendable (String) throws -> URL,
                       download: @Sendable (URL, URL) async throws -> URL = { source, destination in try await RecordingMediaDownload(destination: destination).run(source) },
                       progress: @escaping @Sendable (String) async -> Void) async throws -> URL {
        var sources: [String: URL] = [:]
        for jobID in Set(segments.map(\.jobID)).sorted() {
            try Task.checkCancellation()
            await progress("Fetching cached song \(sources.count + 1)…")
            let index = sources.count
            let localURL = folder.appendingPathComponent("source-\(index).media")
            try? FileManager.default.removeItem(at: localURL)
            let downloaded = try await download(mediaURL(jobID), localURL)
            let pcm = folder.appendingPathComponent("source-\(index).caf")
            try RecordingAudioRenderer.normalize(downloaded, to: pcm, multiplex: true)
            try FileManager.default.removeItem(at: downloaded)
            sources[jobID] = pcm
        }
        await progress("Mixing microphone and music…")
        let normalizedMic = folder.appendingPathComponent("mic-normalized.caf")
        try RecordingAudioRenderer.normalize(microphone, to: normalizedMic, multiplex: false)
        let mixed = folder.appendingPathComponent("mixed.caf")
        try RecordingAudioRenderer.render(microphone: normalizedMic, sources: sources, segments: segments, duration: duration, to: mixed)
        for url in sources.values { try? FileManager.default.removeItem(at: url) }
        try? FileManager.default.removeItem(at: normalizedMic)
        await progress(camera == nil ? "Saving audio…" : "Saving camera video…")
        let composition = AVMutableComposition()
        let audio = AVURLAsset(url: mixed)
        guard let source = try await audio.loadTracks(withMediaType: .audio).first,
              let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw RecordingError("Could not prepare recorded audio.") }
        try track.insertTimeRange(CMTimeRange(start: .zero, duration: CMTime(seconds: duration, preferredTimescale: 48000)), of: source, at: .zero)
        if let camera {
            let asset = AVURLAsset(url: camera.url)
            guard let source = try await asset.loadTracks(withMediaType: .video).first,
                  let video = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw RecordingError("The camera recording has no video.") }
            let available = try await asset.load(.duration).seconds
            let offset = max(0, camera.startOffset)
            let length = min(available, duration - offset)
            guard length > 0 else { throw RecordingError("The camera did not start before recording ended.") }
            try video.insertTimeRange(CMTimeRange(start: .zero, duration: CMTime(seconds: length, preferredTimescale: 600)), of: source,
                                      at: CMTime(seconds: offset, preferredTimescale: 600))
            video.preferredTransform = try await source.load(.preferredTransform)
        }
        let destination = folder.appendingPathComponent(camera == nil ? "KaraokeTrain.m4a" : "KaraokeTrain.mp4")
        try? FileManager.default.removeItem(at: destination)
        guard let exporter = AVAssetExportSession(asset: composition, presetName: camera == nil ? AVAssetExportPresetAppleM4A : AVAssetExportPresetHighestQuality) else { throw RecordingError("This device cannot export the recording.") }
        if #available(iOS 18, macOS 15, *) {
            try await exporter.export(to: destination, as: camera == nil ? .m4a : .mp4)
        } else {
            let holder = ExportCancellation(exporter)
            try await withTaskCancellationHandler {
                exporter.outputURL = destination; exporter.outputFileType = camera == nil ? .m4a : .mp4
                await withCheckedContinuation { continuation in exporter.exportAsynchronously { continuation.resume() } }
                guard exporter.status == .completed else { throw exporter.error ?? RecordingError("Recording export did not complete.") }
            } onCancel: { holder.cancel() }
        }
        try Task.checkCancellation()
        try RecordingFiles.checkBudget(folder)
        return destination
    }
}

private nonisolated final class ExportCancellation: @unchecked Sendable {
    let exporter: AVAssetExportSession
    init(_ exporter: AVAssetExportSession) { self.exporter = exporter }
    func cancel() {
        if #available(iOS 27, macOS 27, *) { return }
        else { exporter.cancelExport() }
    }
}
