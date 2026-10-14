import Foundation
import CoreML
import os

nonisolated enum StemSeparatorError: LocalizedError {
    case invalid(String)
    var errorDescription: String? {
        switch self { case .invalid(let message): return message }
    }
}

/// The network predicts four sources; the transport carries only two mono signals
/// (instrumental left, vocals right), matching the web multiplex format.
public actor StemSeparator {
    public static let shared = StemSeparator()
    public static let segmentFrames = 441_000
    public static let hopFrames = 396_900
    private var model: MLModel?
    private var busy = false

    public init() {}

    private func loadModel() throws -> MLModel {
        if let model { return model }
        guard let url = Bundle.main.url(forResource: "HTDemucs_CoreML", withExtension: "mlmodelc") else {
            throw StemSeparatorError.invalid("The compiled Demucs model is missing from this build.")
        }
        let configuration = MLModelConfiguration()
        // Conservative first-device-test configuration. Never dispatch this
        // converted transformer to the Neural Engine or GPU in the background.
        configuration.computeUnits = .cpuOnly
        let loaded = try MLModel(contentsOf: url, configuration: configuration)
        guard let input = loaded.modelDescription.inputDescriptionsByName["audio"]?.multiArrayConstraint,
              input.shape.map(\.intValue) == [1, 2, Self.segmentFrames], input.dataType == .float32,
              let output = loaded.modelDescription.outputDescriptionsByName["sources"]?.multiArrayConstraint,
              output.shape.map(\.intValue) == [1, 4, 2, Self.segmentFrames],
              [.float16, .float32].contains(output.dataType) else {
            throw StemSeparatorError.invalid("Demucs model dimensions or data types do not match this app.")
        }
        model = loaded
        return loaded
    }

    /// GCS-backed source and sink. Only one model segment and one overlap tail
    /// are retained; no full-song buffers or local audio files.
    public func separate(
        totalFrames: Int, mean: Double, standardDeviation: Double,
        fetch: @Sendable (Int) async throws -> Data,
        upload: @Sendable (Int, Data) async throws -> Void,
        progress: @Sendable (Double) async -> Void
    ) async throws {
        guard !busy else {
            throw StemSeparatorError.invalid("The previous model segment is still stopping. Please retry shortly.")
        }
        busy = true
        defer { busy = false; model = nil }
        guard totalFrames > 1, totalFrames <= 44_100 * 15 * 60,
              Float(mean).isFinite, Float(standardDeviation).isFinite, Float(standardDeviation) > 0 else {
            throw StemSeparatorError.invalid("Invalid source audio metadata.")
        }
        try Task.checkCancellation()
        try checkResources()
        _ = try loadModel()
        var assembler = DemucsOverlap()
        let count = (totalFrames + Self.hopFrames - 1) / Self.hopFrames

        for index in 0..<count {
            try Task.checkCancellation()
            try checkResources()
            let start = index * Self.hopFrames
            let validFrames = min(Self.segmentFrames, totalFrames - start)
            let pcm = try await fetch(index)
            guard pcm.count == validFrames * 8 else {
                throw StemSeparatorError.invalid("The downloaded audio segment was incomplete.")
            }
            let predicted = try autoreleasepool {
                try predict(pcm: pcm, validFrames: validFrames, mean: Float(mean), std: Float(standardDeviation))
            }
            try Task.checkCancellation()
            let emitted = assembler.append(predicted, validFrames: validFrames)
            // Apple devices use little-endian IEEE Float32. No file-backed upload.
            let bytes = emitted.withUnsafeBytes { Data($0) }
            try await upload(index, bytes)
            await progress(Double(index + 1) / Double(count))
        }
    }

    private func checkResources() throws {
        guard ProcessInfo.processInfo.thermalState != .serious,
              ProcessInfo.processInfo.thermalState != .critical else {
            throw StemSeparatorError.invalid("This device is too warm for separation. Let it cool and retry.")
        }
        #if os(iOS) && !targetEnvironment(simulator)
        // A guardrail, not a guarantee: Core ML's peak working set varies by OS/device.
        guard ProcessInfo.processInfo.physicalMemory >= 6 * 1024 * 1024 * 1024,
              os_proc_available_memory() >= 2 * 1024 * 1024 * 1024 else {
            throw StemSeparatorError.invalid("Not enough memory available for this 10-second Demucs model. Close other apps and retry on a device with at least 6 GB RAM.")
        }
        #endif
    }

    private func predict(pcm: Data, validFrames: Int, mean: Float, std: Float) throws -> [Float] {
        let model = try loadModel()
        let input = try MLMultiArray(shape: [1, 2, NSNumber(value: Self.segmentFrames)], dataType: .float32)
        let inputStrides = input.strides.map(\.intValue)
        let ptr = input.dataPointer.assumingMemoryBound(to: Float.self)
        try pcm.withUnsafeBytes { raw in
            for channel in 0..<2 {
                for frame in 0..<Self.segmentFrames {
                    let value: Float = frame < validFrames
                        ? raw.loadUnaligned(fromByteOffset: (frame * 2 + channel) * 4, as: Float.self) : mean
                    let normalized = (value - mean) / std
                    guard normalized.isFinite else { throw StemSeparatorError.invalid("Invalid source audio sample.") }
                    ptr[channel * inputStrides[1] + frame * inputStrides[2]] = normalized
                }
            }
        }
        let result = try model.prediction(from: MLDictionaryFeatureProvider(dictionary: ["audio": input]))
        guard let output = result.featureValue(for: "sources")?.multiArrayValue,
              output.shape.map(\.intValue) == [1, 4, 2, Self.segmentFrames] else {
            throw StemSeparatorError.invalid("Demucs returned an unexpected output shape.")
        }
        let strides = output.strides.map(\.intValue)
        var stereo = [Float](repeating: 0, count: validFrames * 2)
        func extract(_ sample: (Int) -> Float) throws {
            for frame in 0..<validFrames {
                var vocals: Float = 0
                var instrumental: Float = 0
                for stem in 0..<4 {
                    let base = stem * strides[1] + frame * strides[3]
                    let value = ((sample(base) + sample(base + strides[2])) * 0.5) * std + mean
                    guard value.isFinite else { throw StemSeparatorError.invalid("Demucs produced invalid audio. Processing stopped.") }
                    if stem == 0 { vocals = value } else { instrumental += value }
                }
                guard instrumental.isFinite else { throw StemSeparatorError.invalid("Instrumental overflow.") }
                stereo[frame * 2] = instrumental
                stereo[frame * 2 + 1] = vocals
            }
        }
        switch output.dataType {
        case .float16:
            let values = output.dataPointer.assumingMemoryBound(to: Float16.self)
            try extract { Float(values[$0]) }
        case .float32:
            let values = output.dataPointer.assumingMemoryBound(to: Float.self)
            try extract { values[$0] }
        default:
            throw StemSeparatorError.invalid("Unsupported Demucs output numeric type.")
        }
        return stereo
    }
}
