import AVFoundation
import Foundation

@main struct RecordingSmoke {
    static func main() async throws {
        let folder = try RecordingFiles.directory()
        defer { try? FileManager.default.removeItem(at: folder) }
        var timeline = RecordingTimeline()
        func state(_ time: Double, _ playing: Bool = true, gain: Double = 1, job: String = "a") -> RecordingTransport {
            RecordingTransport(jobID: job, songTime: time, playing: playing, vocalsGain: gain)
        }
        timeline.update(at: 0, state: state(0))
        timeline.update(at: 0.5, state: state(0.5, false))
        timeline.update(at: 1, state: state(2, gain: 0))
        timeline.update(at: 1.5, state: state(4, gain: 0.5, job: "b"))
        timeline.finish(at: 2)
        precondition(timeline.segments.count == 3)
        precondition(timeline.segments[0].duration == 0.5 && timeline.segments[1].start == 1)
        precondition(timeline.segments[1].songStart == 2 && timeline.segments[1].vocalsGain == 0)
        precondition(timeline.segments[2].jobID == "b")
        let mic = folder.appendingPathComponent("mic.caf"), a = folder.appendingPathComponent("a.caf"), b = folder.appendingPathComponent("b.caf")
        try write(mic, seconds: 2, left: 0.05, right: 0.05)
        try write(a, seconds: 3, left: 0.1, right: 0.2)
        try write(b, seconds: 5, left: 0.3, right: 0.4)
        let output = folder.appendingPathComponent("mix.caf")
        try RecordingAudioRenderer.render(microphone: mic, sources: ["a": a, "b": b], segments: timeline.segments, duration: 2, to: output)
        let result = try AVAudioFile(forReading: output)
        for (time, expected): (Double, Float) in [(0.25, 0.35), (0.75, 0.05), (1.25, 0.15), (1.75, 0.55)] {
            result.framePosition = Int64(time * 48000)
            let sample = AVAudioPCMBuffer(pcmFormat: result.processingFormat, frameCapacity: 1)!
            try result.read(into: sample, frameCount: 1)
            precondition(abs(sample.floatChannelData![0][0] - expected) < 0.0001)
            precondition(abs(sample.floatChannelData![1][0] - expected) < 0.0001)
        }
        precondition(result.length == 96000)
        let mono = folder.appendingPathComponent("mono.caf"), converted = folder.appendingPathComponent("converted.caf")
        let monoFormat = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        do {
            let file = try AVAudioFile(forWriting: mono, settings: RecordingFiles.pcmSettings(monoFormat))
            let buffer = AVAudioPCMBuffer(pcmFormat: monoFormat, frameCapacity: 4410)!
            buffer.frameLength = 4410
            buffer.floatChannelData![0].initialize(repeating: 0.2, count: 4410)
            try file.write(from: buffer)
        }
        try RecordingAudioRenderer.normalize(mono, to: converted, multiplex: false)
        let normalized = try AVAudioFile(forReading: converted)
        precondition(normalized.processingFormat == RecordingAudioRenderer.format)
        precondition(abs(normalized.length - 4800) < 2)
        let buffer = AVAudioPCMBuffer(pcmFormat: normalized.processingFormat, frameCapacity: 4800)!
        try normalized.read(into: buffer)
        precondition(abs(buffer.floatChannelData![0][2000] - 0.2) < 0.001)
        precondition(abs(buffer.floatChannelData![1][2000] - 0.2) < 0.001)
        do { try RecordingAudioRenderer.normalize(mono, to: folder.appendingPathComponent("bad.caf"), multiplex: true); preconditionFailure("Accepted mono stems") } catch {}
        let captureURL = folder.appendingPathComponent("captured.caf")
        let writer = MicrophoneRecordingWriter(url: captureURL, epoch: 1000)
        let capture = AVAudioPCMBuffer(pcmFormat: RecordingAudioRenderer.format, frameCapacity: 480)!
        capture.frameLength = 480
        for channel in 0..<2 { capture.floatChannelData![channel].initialize(repeating: 0.3, count: 480) }
        writer.receive(capture, time: AVAudioTime(hostTime: AVAudioTime.hostTime(forSeconds: 1000.1)))
        try await Task.sleep(for: .milliseconds(5))
        writer.receive(capture, time: AVAudioTime(hostTime: AVAudioTime.hostTime(forSeconds: 1000.11)))
        try await Task.sleep(for: .milliseconds(5))
        writer.receive(capture, time: AVAudioTime(hostTime: AVAudioTime.hostTime(forSeconds: 1000.105)))
        _ = try await writer.finish()
        let captured = try AVAudioFile(forReading: captureURL)
        precondition(abs(captured.length - 5760) <= 1, "Capture gap or overlapping samples duplicated")
        let exportFolder = try RecordingFiles.directory()
        defer { try? FileManager.default.removeItem(at: exportFolder) }
        let download: @Sendable (URL, URL) async throws -> URL = { source, destination in
            try FileManager.default.copyItem(at: source.lastPathComponent == "a" ? a : b, to: destination)
            return destination
        }
        let encoded = try await RecordingExporter.export(folder: exportFolder, microphone: mic, segments: timeline.segments, duration: 2,
            camera: nil, mediaURL: { URL(fileURLWithPath: $0) }, download: download, progress: { _ in })
        let encodedAsset = AVURLAsset(url: encoded)
        let encodedDuration = try await encodedAsset.load(.duration).seconds
        precondition(abs(encodedDuration - 2) < 0.05, "Encoded output duration incorrect")
        let encodedTracks = try await encodedAsset.loadTracks(withMediaType: .audio)
        precondition(encodedTracks.count == 1)
        let video = folder.appendingPathComponent("camera.mov")
        try await writeVideo(video)
        let videoFolder = try RecordingFiles.directory()
        defer { try? FileManager.default.removeItem(at: videoFolder) }
        let movie = try await RecordingExporter.export(folder: videoFolder, microphone: mic, segments: timeline.segments, duration: 2,
            camera: RecordedCamera(url: video, startOffset: 0.2), mediaURL: { URL(fileURLWithPath: $0) }, download: download, progress: { _ in })
        let movieAsset = AVURLAsset(url: movie)
        let movieDuration = try await movieAsset.load(.duration).seconds
        let videoTracks = try await movieAsset.loadTracks(withMediaType: .video)
        let audioTracks = try await movieAsset.loadTracks(withMediaType: .audio)
        precondition(abs(movieDuration - 2) < 0.05 && videoTracks.count == 1 && audioTracks.count == 1)
        let reader = try AVAssetReader(asset: movieAsset)
        let frames = AVAssetReaderTrackOutput(track: videoTracks[0], outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        reader.add(frames); precondition(reader.startReading())
        var firstVisible: Double?
        while let sample = frames.copyNextSampleBuffer(), let pixel = CMSampleBufferGetImageBuffer(sample) {
            CVPixelBufferLockBaseAddress(pixel, .readOnly)
            let row = CVPixelBufferGetBaseAddress(pixel)!.advanced(by: CVPixelBufferGetBytesPerRow(pixel) * 32).assumingMemoryBound(to: UInt8.self)
            let white = row[32 * 4] > 128
            CVPixelBufferUnlockBaseAddress(pixel, .readOnly)
            if white { firstVisible = CMSampleBufferGetPresentationTimeStamp(sample).seconds; break }
        }
        reader.cancelReading()
        precondition(firstVisible != nil && abs(firstVisible! - 0.2) < 0.05, "Camera host-clock offset was lost")
        print("PASS: recording pauses, seeks, song changes, vocal mix, mic-only gaps, exact duration and 44.1kHz mono conversion")
        print("PASS: timestamped microphone gaps/overlap and complete M4A export")
        print("PASS: synthetic camera MP4 export retains video offset, mixed audio and full duration")
    }
    static func write(_ url: URL, seconds: Double, left: Float, right: Float) throws {
        let format = RecordingAudioRenderer.format
        let file = try AVAudioFile(forWriting: url, settings: RecordingFiles.pcmSettings(format))
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096)!
        var frames = Int(seconds * 48000)
        while frames > 0 {
            let count = min(frames, 4096); buffer.frameLength = AVAudioFrameCount(count)
            buffer.floatChannelData![0].initialize(repeating: left, count: count)
            buffer.floatChannelData![1].initialize(repeating: right, count: count)
            try file.write(from: buffer); frames -= count
        }
    }
    static func writeVideo(_ url: URL) async throws {
        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 64, AVVideoHeightKey: 64])
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        writer.add(input)
        guard writer.startWriting() else { throw writer.error! }
        writer.startSession(atSourceTime: .zero)
        for index in 0..<10 {
            let deadline = Date().addingTimeInterval(5)
            while !input.isReadyForMoreMediaData, Date() < deadline { try await Task.sleep(for: .milliseconds(1)) }
            var pixel: CVPixelBuffer?
            precondition(CVPixelBufferCreate(kCFAllocatorDefault, 64, 64, kCVPixelFormatType_32BGRA, nil, &pixel) == kCVReturnSuccess)
            let buffer = pixel!
            CVPixelBufferLockBaseAddress(buffer, [])
            memset(CVPixelBufferGetBaseAddress(buffer), 255, CVPixelBufferGetBytesPerRow(buffer) * 64)
            CVPixelBufferUnlockBaseAddress(buffer, [])
            precondition(adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(index), timescale: 10)))
        }
        writer.endSession(atSourceTime: CMTime(value: 1, timescale: 1))
        input.markAsFinished()
        await withCheckedContinuation { continuation in writer.finishWriting { continuation.resume() } }
        guard writer.status == .completed else { throw writer.error! }
    }
}
