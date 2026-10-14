import Foundation

/// Native counterpart of lib/lyrics/timeline.js. Word times remain authoritative.
nonisolated struct LyricTimeline: Equatable {
    struct Line: Identifiable, Equatable {
        let id: Int
        let text: String
        let words: [LyricWord]
        let start: Double
        let end: Double
        let activation: Double
    }

    struct PlaybackState: Equatable {
        var index = -1
        var singing = false
        var rest = false
        var countdown = 0
        var finished = false
    }

    let lines: [Line]

    init(_ lyrics: [LyricLine]) {
        let prepared = lyrics.compactMap { line -> (text: String, words: [LyricWord], start: Double, end: Double?)? in
            guard !line.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            let words = (line.words ?? []).filter {
                guard let start = $0.start, let end = $0.end else { return false }
                return !$0.word.isEmpty && start.isFinite && end.isFinite && start >= 0 && end > start
            }.sorted { ($0.start ?? 0) < ($1.start ?? 0) }
            let start = words.first?.start ?? line.time
            guard start.isFinite, start >= 0 else { return nil }
            return (line.text, words, start, words.compactMap(\.end).max())
        }.sorted { $0.start < $1.start }

        lines = prepared.enumerated().map { index, line in
            let nextStart = index + 1 < prepared.count ? prepared[index + 1].start : nil
            let previousEnd = index > 0 ? (prepared[index - 1].end ?? line.start) : 0
            return Line(id: index, text: line.text, words: line.words, start: line.start,
                        end: max(line.start, line.end ?? nextStart ?? line.start + 5),
                        activation: min(line.start, max(line.start - 0.3, previousEnd)))
        }
    }

    func state(at time: Double) -> PlaybackState {
        guard !lines.isEmpty, time.isFinite else { return PlaybackState() }
        var low = 0, high = lines.count - 1, index = -1
        while low <= high {
            let middle = (low + high) / 2
            if lines[middle].activation <= time { index = middle; low = middle + 1 }
            else { high = middle - 1 }
        }
        func countdown(_ start: Double) -> Int { Int(min(86_400, max(0, ceil(start - time)))) }
        if index < 0 { return PlaybackState(index: 0, rest: true, countdown: countdown(lines[0].start)) }
        let line = lines[index]
        if index + 1 < lines.count {
            let next = lines[index + 1]
            if time > line.end + 0.5, next.start - line.end >= 2.5 {
                return PlaybackState(index: index + 1, rest: true, countdown: countdown(next.start))
            }
        }
        return PlaybackState(index: index, singing: time >= line.start && time < line.end,
                             finished: index == lines.count - 1 && time >= line.end)
    }

    static func wordProgress(_ word: LyricWord, at time: Double) -> Double {
        guard let start = word.start, let end = word.end,
              time.isFinite, start.isFinite, end.isFinite, end > start else { return 0 }
        return max(0, min(1, (time - start) / (end - start)))
    }

    static func separator(_ word: String, before next: String?) -> String {
        guard let next, let last = word.unicodeScalars.last, !CharacterSet.whitespacesAndNewlines.contains(last) else { return "" }
        func isNativeCharacter(_ scalar: Unicode.Scalar) -> Bool {
            (0x3040...0x30ff).contains(scalar.value) || (0x3400...0x9fff).contains(scalar.value)
        }
        if let first = next.unicodeScalars.first, isNativeCharacter(last), isNativeCharacter(first) { return "" }
        return " "
    }
}
