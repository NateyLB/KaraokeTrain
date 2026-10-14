import Foundation

@main
struct OverlapSmoke {
    static func main() {
        for total in [2, 396_899, 396_900, 396_901, 441_000, 441_001, 1_190_703] {
            var assembler = DemucsOverlap()
            var delivered = 0
            for start in stride(from: 0, to: total, by: 396_900) {
                let valid = min(441_000, total - start)
                let predicted = (0..<valid * 2).map { sample in value(start * 2 + sample) }
                let result = assembler.append(predicted, validFrames: valid)
                for (index, actual) in result.enumerated() {
                    precondition(actual.isFinite)
                    precondition(abs(actual - value(start * 2 + index)) < 0.000001, "Boundary corruption")
                }
                delivered += result.count / 2
            }
            precondition(delivered == total, "Dropped or duplicated frames")
        }
        print("PASS: Swift overlap-add preserves all stereo samples across seven boundary cases.")
    }
    static func value(_ index: Int) -> Float { Float((index % 199) - 99) / 100 }
}
