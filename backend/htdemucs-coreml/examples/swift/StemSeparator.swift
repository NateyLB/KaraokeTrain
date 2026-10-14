// StemSeparator.swift
//
// Minimal example showing how to load HTDemucs_CoreML.mlpackage in Swift,
// chunk a stereo audio file, run inference per chunk, and reassemble the
// four stems via overlap-add.
//
// Drop the .mlpackage into your Xcode target's Resources, then call:
//
//     let separator = try StemSeparator()
//     let stems = try await separator.separate(fileURL: someURL) { progress in
//         print("\(Int(progress * 100))%")
//     }
//     // stems[.vocals], stems[.drums], stems[.bass], stems[.other]
//
// This is a pared-down reference. Real apps usually want:
//   - Resampling to 44.1 kHz before chunking (AVAudioConverter).
//   - Triangular overlap-add windowing (this file uses linear taper for brevity).
//   - Cancellation / progress on a Task.
//
// License: MIT (same as the rest of this repo).

import AVFoundation
import CoreML

public enum StemKind: Int, CaseIterable {
    case vocals = 0
    case drums  = 1
    case bass   = 2
    case other  = 3
}

public enum StemSeparatorError: LocalizedError {
    case modelNotFound
    case unsupportedFormat
    case inferenceFailed(String)

    public var errorDescription: String? {
        switch self {
        case .modelNotFound:        return "HTDemucs_CoreML.mlpackage not found in bundle."
        case .unsupportedFormat:    return "Audio must be 44.1 kHz stereo Float32."
        case .inferenceFailed(let m): return "Inference failed: \(m)"
        }
    }
}

public final class StemSeparator {

    // The converter bakes a fixed segment length into the model. Defaults
    // match `python convert.py` (10 s @ 44.1 kHz). If you converted with
    // --segment 7, change segmentSamples to 308700, etc.
    private let segmentSamples = 441_000
    private let overlapSamples = 44_100   // 1 s overlap-add
    private let sampleRate     = 44_100.0

    private let model: MLModel
    private let inferenceLock = NSLock()  // MLModel.prediction is not thread-safe.

    public init() throws {
        guard let url = Bundle.main.url(
            forResource: "HTDemucs_CoreML", withExtension: "mlpackage"
        ) ?? Bundle.main.url(
            forResource: "HTDemucs_CoreML", withExtension: "mlmodelc"
        ) else {
            throw StemSeparatorError.modelNotFound
        }

        let config = MLModelConfiguration()
        config.computeUnits = .cpuAndGPU   // do NOT use .all -- ANE is unstable here
        self.model = try MLModel(contentsOf: url, configuration: config)
    }

    /// Separate a file into four stems, returning each as an
    /// AVAudioPCMBuffer at 44.1 kHz / stereo / Float32.
    public func separate(
        fileURL: URL,
        progress: @Sendable @escaping (Double) -> Void = { _ in }
    ) async throws -> [StemKind: AVAudioPCMBuffer] {
        let mix = try loadAndResample(fileURL: fileURL)
        return try await Task.detached(priority: .userInitiated) {
            try self.runChunked(mix: mix, progress: progress)
        }.value
    }

    // MARK: - Loading & resampling

    private func loadAndResample(fileURL: URL) throws -> AVAudioPCMBuffer {
        let file = try AVAudioFile(forReading: fileURL)
        let target = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: 2,
            interleaved: false
        )!
        guard let converter = AVAudioConverter(from: file.processingFormat, to: target) else {
            throw StemSeparatorError.unsupportedFormat
        }

        let outFrames = AVAudioFrameCount(
            Double(file.length) * sampleRate / file.processingFormat.sampleRate
        )
        guard let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: outFrames) else {
            throw StemSeparatorError.unsupportedFormat
        }

        let input = AVAudioPCMBuffer(pcmFormat: file.processingFormat,
                                     frameCapacity: AVAudioFrameCount(file.length))!
        try file.read(into: input)

        var consumed = false
        var error: NSError?
        converter.convert(to: out, error: &error) { _, status in
            if consumed { status.pointee = .endOfStream; return nil }
            consumed = true
            status.pointee = .haveData
            return input
        }
        if let error { throw StemSeparatorError.inferenceFailed(error.localizedDescription) }
        return out
    }

    // MARK: - Chunked inference + overlap-add

    private func runChunked(
        mix: AVAudioPCMBuffer,
        progress: @Sendable @escaping (Double) -> Void
    ) throws -> [StemKind: AVAudioPCMBuffer] {
        let total = Int(mix.frameLength)
        let stride = segmentSamples - overlapSamples
        let chunks = max(1, Int(ceil(Double(total) / Double(stride))))

        // Output buffers (one per stem).
        var outputs: [StemKind: UnsafeMutablePointer<Float>] = [:]
        var weights = [Float](repeating: 0, count: total)
        defer { outputs.values.forEach { $0.deallocate() } }

        for kind in StemKind.allCases {
            outputs[kind] = UnsafeMutablePointer<Float>.allocate(capacity: total * 2)
            outputs[kind]!.initialize(repeating: 0, count: total * 2)
        }

        // Triangular fade window for overlap-add.
        var window = [Float](repeating: 1, count: segmentSamples)
        for i in 0..<overlapSamples {
            let w = Float(i) / Float(overlapSamples)
            window[i] = w
            window[segmentSamples - 1 - i] = w
        }

        for c in 0..<chunks {
            let start = c * stride
            let chunk = sliceChunk(mix: mix, start: start)
            let stemChunks = try predict(chunk: chunk)

            for kind in StemKind.allCases {
                guard let dst = outputs[kind] else { continue }
                let src = stemChunks[kind]!
                for f in 0..<segmentSamples {
                    let global = start + f
                    if global >= total { break }
                    let w = window[f]
                    dst[global * 2 + 0] += src[f * 2 + 0] * w
                    dst[global * 2 + 1] += src[f * 2 + 1] * w
                    if kind == .vocals {  // accumulate window only once
                        weights[global] += w
                    }
                }
            }
            progress(Double(c + 1) / Double(chunks))
        }

        // Normalize by accumulated window weights.
        for kind in StemKind.allCases {
            guard let dst = outputs[kind] else { continue }
            for f in 0..<total {
                let w = max(weights[f], 1e-6)
                dst[f * 2 + 0] /= w
                dst[f * 2 + 1] /= w
            }
        }

        // Wrap into AVAudioPCMBuffers.
        let outFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: 2,
            interleaved: false
        )!
        var result: [StemKind: AVAudioPCMBuffer] = [:]
        for kind in StemKind.allCases {
            let buf = AVAudioPCMBuffer(pcmFormat: outFormat,
                                       frameCapacity: AVAudioFrameCount(total))!
            buf.frameLength = AVAudioFrameCount(total)
            let src = outputs[kind]!
            for f in 0..<total {
                buf.floatChannelData![0][f] = src[f * 2 + 0]
                buf.floatChannelData![1][f] = src[f * 2 + 1]
            }
            result[kind] = buf
        }
        return result
    }

    // MARK: - Single-chunk prediction

    private func predict(chunk: [Float]) throws -> [StemKind: [Float]] {
        precondition(chunk.count == segmentSamples * 2,
                     "chunk must be \(segmentSamples * 2) interleaved floats")

        let array = try MLMultiArray(
            shape: [1, 2, NSNumber(value: segmentSamples)],
            dataType: .float32
        )
        // Deinterleave into (1, 2, N).
        let ptr = array.dataPointer.bindMemory(to: Float.self, capacity: array.count)
        for f in 0..<segmentSamples {
            ptr[0 * segmentSamples + f] = chunk[f * 2 + 0]
            ptr[1 * segmentSamples + f] = chunk[f * 2 + 1]
        }

        inferenceLock.lock()
        defer { inferenceLock.unlock() }

        let provider = try MLDictionaryFeatureProvider(dictionary: ["audio": array])
        let result = try model.prediction(from: provider)
        guard let out = result.featureValue(for: "sources")?.multiArrayValue else {
            throw StemSeparatorError.inferenceFailed("missing 'sources' output")
        }

        // Output shape: (1, 4, 2, segmentSamples). Order: [vocals, drums, bass, other].
        var stems: [StemKind: [Float]] = [:]
        let outPtr = out.dataPointer.bindMemory(to: Float.self, capacity: out.count)
        for kind in StemKind.allCases {
            var samples = [Float](repeating: 0, count: segmentSamples * 2)
            let stemBase = kind.rawValue * 2 * segmentSamples
            for f in 0..<segmentSamples {
                samples[f * 2 + 0] = outPtr[stemBase + 0 * segmentSamples + f]
                samples[f * 2 + 1] = outPtr[stemBase + 1 * segmentSamples + f]
            }
            stems[kind] = samples
        }
        return stems
    }

    private func sliceChunk(mix: AVAudioPCMBuffer, start: Int) -> [Float] {
        let total = Int(mix.frameLength)
        var out = [Float](repeating: 0, count: segmentSamples * 2)
        let l = mix.floatChannelData![0]
        let r = mix.floatChannelData![1]
        for f in 0..<segmentSamples {
            let g = start + f
            if g < total {
                out[f * 2 + 0] = l[g]
                out[f * 2 + 1] = r[g]
            }
        }
        return out
    }
}
