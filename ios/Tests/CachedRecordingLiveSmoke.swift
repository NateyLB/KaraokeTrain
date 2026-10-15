import AVFoundation
import Foundation

/// Read-only cached media export; synthetic microphone, no hardware capture.
@main struct CachedRecordingLiveSmoke {
    static func main() async throws {
        guard CommandLine.arguments.count == 3 else { throw RecordingError("Supply server URL and an existing cached job ID.") }
        let folder = try RecordingFiles.directory()
        defer { try? FileManager.default.removeItem(at: folder) }
        let mic = folder.appendingPathComponent("microphone.caf")
        do {
            let format = RecordingAudioRenderer.format
            let file = try AVAudioFile(forWriting: mic, settings: RecordingFiles.pcmSettings(format))
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 48000)!
            buffer.frameLength = 48000
            for channel in 0..<2 { buffer.floatChannelData![channel].initialize(repeating: 0, count: 48000) }
            try file.write(from: buffer)
        }
        let service = ServerSongService(baseURL: CommandLine.arguments[1]), job = CommandLine.arguments[2]
        let segment = RecordingSegment(jobID: job, start: 0, duration: 1, songStart: 30, vocalsGain: 0.4)
        let output = try await RecordingExporter.export(folder: folder, microphone: mic, segments: [segment], duration: 1,
            camera: nil, mediaURL: { try service.audioURL(jobID: $0) }, progress: { _ in })
        let asset = AVURLAsset(url: output)
        let duration = try await asset.load(.duration).seconds
        precondition(abs(duration - 1) < 0.05)
        print("PASS: live cached multiplex AAC download, decode, vocal mix and M4A recording export; no capture or processing")
    }
}
