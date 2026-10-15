import AVFoundation
import Foundation

/// A bounded handoff keeps file I/O off the hardware render callback.
nonisolated final class MicrophoneRecordingWriter: @unchecked Sendable {
    private let queue = DispatchQueue(label: "karaoke.recording.microphone", qos: .userInitiated)
    private let lock = NSLock()
    private var pending = 0
    private var accepting = true
    private var failure: Error?
    private var file: AVAudioFile?
    private let url: URL
    private let epoch: Double
    init(url: URL, epoch: Double) { self.url = url; self.epoch = epoch }

    func receive(_ input: AVAudioPCMBuffer, time: AVAudioTime) {
        guard lock.try() else { return }
        guard accepting, pending < 8 else {
            if accepting { failure = RecordingError("The device could not keep up with microphone recording.") }
            lock.unlock(); return
        }
        pending += 1
        guard !input.format.isInterleaved, input.format.commonFormat == .pcmFormatFloat32,
              let buffer = AVAudioPCMBuffer(pcmFormat: input.format, frameCapacity: input.frameLength),
              let source = input.floatChannelData, let target = buffer.floatChannelData else { failure = RecordingError("Unsupported microphone format."); pending -= 1; lock.unlock(); return }
        buffer.frameLength = input.frameLength
        for channel in 0..<Int(input.format.channelCount) {
            target[channel].update(from: source[channel], count: Int(input.frameLength))
        }
        let host = time.isHostTimeValid ? AVAudioTime.seconds(forHostTime: time.hostTime) : AVAudioTime.seconds(forHostTime: mach_absolute_time())
        let owned = RecordingPCMBuffer(buffer)
        queue.async { [self, owned] in
            let buffer = owned.buffer
            defer { completedBuffer() }
            do {
                if file == nil { file = try AVAudioFile(forWriting: url, settings: RecordingFiles.pcmSettings(buffer.format)) }
                guard let file else { return }
                let position = AVAudioFramePosition(max(0, host - epoch) * file.processingFormat.sampleRate)
                let maximum = AVAudioFramePosition(RecordingTimeline.maximumDuration * file.processingFormat.sampleRate)
                guard position < maximum else { return }
                if position > file.length {
                    try writeSilence(file, frames: min(position, maximum) - file.length)
                }
                // Ignore overlapping device timestamps; never duplicate captured samples.
                let overlap = max(0, file.length - position)
                if overlap >= AVAudioFramePosition(buffer.frameLength) { return }
                if overlap > 0 {
                    let count = Int(buffer.frameLength) - Int(overlap)
                    for channel in 0..<Int(buffer.format.channelCount) {
                        memmove(buffer.floatChannelData![channel], buffer.floatChannelData![channel] + Int(overlap), count * MemoryLayout<Float>.size)
                    }
                    buffer.frameLength = AVAudioFrameCount(count)
                }
                buffer.frameLength = min(buffer.frameLength, AVAudioFrameCount(maximum - file.length))
                try file.write(from: buffer)
            } catch { fail(error) }
        }
        lock.unlock()
    }
    private func fail(_ error: Error) { lock.lock(); if failure == nil { failure = error }; lock.unlock() }
    private func completedBuffer() { lock.lock(); pending -= 1; lock.unlock() }
    private func writeSilence(_ file: AVAudioFile, frames: AVAudioFramePosition) throws {
        guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 4096) else { throw RecordingError("Could not allocate recording buffer.") }
        var remaining = frames
        while remaining > 0 {
            buffer.frameLength = AVAudioFrameCount(min(4096, remaining))
            for channel in 0..<Int(buffer.format.channelCount) { buffer.floatChannelData![channel].initialize(repeating: 0, count: Int(buffer.frameLength)) }
            try file.write(from: buffer); remaining -= AVAudioFramePosition(buffer.frameLength)
        }
    }
    func finish() async throws -> URL {
        return try await withCheckedThrowingContinuation { continuation in
            lock.lock(); accepting = false
            queue.async { [self] in
                file = nil
                lock.lock(); let failure = failure; lock.unlock()
                if let failure { continuation.resume(throwing: failure) }
                else if !FileManager.default.fileExists(atPath: url.path) { continuation.resume(throwing: RecordingError("The microphone did not produce any audio.")) }
                else { continuation.resume(returning: url) }
            }
            lock.unlock()
        }
    }
}

/// Ownership is transferred once to the serial writer queue; the tap never mutates it.
private nonisolated final class RecordingPCMBuffer: @unchecked Sendable {
    let buffer: AVAudioPCMBuffer
    init(_ buffer: AVAudioPCMBuffer) { self.buffer = buffer }
}
