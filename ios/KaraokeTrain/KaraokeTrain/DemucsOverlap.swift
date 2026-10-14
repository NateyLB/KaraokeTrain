import Foundation

/// Small, deterministic overlap-add buffer. Independent of Core ML so boundaries
/// can be regression tested without loading the network.
nonisolated struct DemucsOverlap {
    let segment: Int
    let hop: Int
    private var tail: [Float]
    private var tailWeights: [Float]

    init(segment: Int = 441_000, hop: Int = 396_900) {
        precondition(segment > hop && hop >= segment - hop)
        self.segment = segment
        self.hop = hop
        tail = .init(repeating: 0, count: (segment - hop) * 2)
        tailWeights = .init(repeating: 0, count: segment - hop)
    }

    mutating func append(_ predicted: [Float], validFrames: Int) -> [Float] {
        precondition(validFrames > 0 && validFrames <= segment && predicted.count == validFrames * 2)
        let overlap = segment - hop
        var sums = predicted
        var weights = [Float](repeating: 0, count: validFrames)
        for frame in 0..<validFrames {
            // Strictly positive endpoints preserve first and last samples.
            let weight = Float(min(frame + 1, segment - frame, overlap)) / Float(overlap)
            weights[frame] = weight
            sums[frame * 2] *= weight
            sums[frame * 2 + 1] *= weight
            if frame < overlap {
                sums[frame * 2] += tail[frame * 2]
                sums[frame * 2 + 1] += tail[frame * 2 + 1]
                weights[frame] += tailWeights[frame]
            }
        }
        let count = min(hop, validFrames)
        var emitted = [Float](repeating: 0, count: count * 2)
        for frame in 0..<count {
            emitted[frame * 2] = sums[frame * 2] / weights[frame]
            emitted[frame * 2 + 1] = sums[frame * 2 + 1] / weights[frame]
        }
        tail = .init(repeating: 0, count: overlap * 2)
        tailWeights = .init(repeating: 0, count: overlap)
        for frame in count..<validFrames {
            let target = frame - count
            tail[target * 2] = sums[frame * 2]
            tail[target * 2 + 1] = sums[frame * 2 + 1]
            tailWeights[target] = weights[frame]
        }
        return emitted
    }
}
