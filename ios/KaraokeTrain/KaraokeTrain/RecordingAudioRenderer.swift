import AVFoundation
import Foundation

/// Streamed PCM conversion and mixing use bounded buffers, independent of playback.
nonisolated enum RecordingAudioRenderer {
    static let rate = 48_000.0
    static let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!

    static func normalize(_ source: URL, to destination: URL, multiplex: Bool) throws {
        let input = try AVAudioFile(forReading: source, commonFormat: .pcmFormatFloat32, interleaved: false)
        guard !multiplex || input.processingFormat.channelCount == 2 else { throw RecordingError("Cached audio is not a stereo stem file.") }
        guard let converter = AVAudioConverter(from: input.processingFormat, to: format),
              let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096),
              let read = AVAudioPCMBuffer(pcmFormat: input.processingFormat, frameCapacity: 8192) else { throw RecordingError("Could not prepare audio conversion.") }
        let file = try AVAudioFile(forWriting: destination, settings: RecordingFiles.pcmSettings(format))
        var ended = false, readError: Error?
        while true {
            try Task.checkCancellation()
            var conversionError: NSError?
            let status = converter.convert(to: output, error: &conversionError) { frames, state in
                if ended { state.pointee = .endOfStream; return nil }
                do {
                    let remaining = input.length - input.framePosition
                    if remaining <= 0 { ended = true; state.pointee = .endOfStream; return nil }
                    try input.read(into: read, frameCount: min(frames, read.frameCapacity, AVAudioFrameCount(remaining)))
                    if read.frameLength == 0 { ended = true; state.pointee = .endOfStream; return nil }
                    state.pointee = .haveData; return read
                } catch { readError = error; ended = true; state.pointee = .endOfStream; return nil }
            }
            if let readError { throw readError }
            if let conversionError { throw conversionError }
            if output.frameLength > 0 { try file.write(from: output) }
            if status == .endOfStream { break }
            if status == .error { throw RecordingError("Audio conversion failed.") }
            if file.length % 262144 < 4096 { try RecordingFiles.checkBudget(destination.deletingLastPathComponent()) }
            guard file.length <= Int64(rate * 3600) else { throw RecordingError("Cached media is too long for recording export.") }
        }
    }

    static func render(microphone: URL, sources: [String: URL], segments: [RecordingSegment], duration: Double, to destination: URL) throws {
        guard duration.isFinite, duration > 0, duration <= RecordingTimeline.maximumDuration else { throw RecordingError("Invalid recording duration.") }
        var previousEnd = 0.0
        for segment in segments {
            guard segment.start.isFinite, segment.duration.isFinite, segment.songStart.isFinite, segment.vocalsGain.isFinite,
                  segment.start >= previousEnd - 0.0001, segment.duration > 0, (0...86400).contains(segment.songStart),
                  (0...1).contains(segment.vocalsGain), segment.start + segment.duration <= duration + 0.0001 else { throw RecordingError("Invalid recording timeline.") }
            previousEnd = segment.start + segment.duration
        }
        let mic = try AVAudioFile(forReading: microphone)
        let backing = try sources.mapValues { try AVAudioFile(forReading: $0) }
        guard mic.processingFormat == format, backing.values.allSatisfy({ $0.processingFormat == format }) else { throw RecordingError("Recording audio must be normalized before mixing.") }
        let file = try AVAudioFile(forWriting: destination, settings: RecordingFiles.pcmSettings(format))
        let total = Int64((duration * rate).rounded())
        guard let mix = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096),
              let read = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096) else { throw RecordingError("Could not allocate export buffers.") }
        var frame: Int64 = 0
        var segmentIndex = 0
        while frame < total {
            try Task.checkCancellation()
            let count = Int(min(4096, total - frame))
            mix.frameLength = AVAudioFrameCount(count)
            for channel in 0..<2 { mix.floatChannelData![channel].initialize(repeating: 0, count: count) }
            if frame < mic.length {
                mic.framePosition = frame
                try mic.read(into: read, frameCount: AVAudioFrameCount(min(Int64(count), mic.length - frame)))
                for channel in 0..<2 { mix.floatChannelData![channel].update(from: read.floatChannelData![channel], count: Int(read.frameLength)) }
            }
            while segmentIndex < segments.count, Int64(((segments[segmentIndex].start + segments[segmentIndex].duration) * rate).rounded()) <= frame { segmentIndex += 1 }
            var cursor = segmentIndex
            while cursor < segments.count, segments[cursor].start * rate < Double(frame + Int64(count)) {
                let segment = segments[cursor]
                cursor += 1
                let start = Int64((segment.start * rate).rounded()), end = Int64(((segment.start + segment.duration) * rate).rounded())
                let from = max(frame, start), through = min(frame + Int64(count), end)
                guard through > from else { continue }
                guard let source = backing[segment.jobID] else { throw RecordingError("A song needed for this recording is missing.") }
                let position = Int64((segment.songStart * rate).rounded()) + from - start
                guard position < source.length else { continue }
                source.framePosition = max(0, position)
                try source.read(into: read, frameCount: AVAudioFrameCount(min(through - from, source.length - position)))
                for offset in 0..<Int(read.frameLength) {
                    let value = read.floatChannelData![0][offset] + read.floatChannelData![1][offset] * Float(segment.vocalsGain)
                    let target = Int(from - frame) + offset
                    mix.floatChannelData![0][target] += value; mix.floatChannelData![1][target] += value
                }
            }
            // Match the live mix while keeping the encoded recording within range.
            for channel in 0..<2 { for index in 0..<count { mix.floatChannelData![channel][index] = min(1, max(-1, mix.floatChannelData![channel][index])) } }
            try file.write(from: mix)
            frame += Int64(count)
            if frame % 262144 < 4096 { try RecordingFiles.checkBudget(destination.deletingLastPathComponent()) }
        }
    }
}
