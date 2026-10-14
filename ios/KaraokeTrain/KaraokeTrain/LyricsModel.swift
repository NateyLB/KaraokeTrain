import Foundation

nonisolated struct LyricsResponse: Codable {
    let source: String
    let lyrics: [LyricLine]
}

nonisolated struct LyricWord: Codable, Identifiable, Hashable {
    let word: String
    let start: Double?
    let end: Double?

    var id: String { "\(word)-\(start ?? 0)-\(end ?? 0)" }
}

nonisolated struct LyricLine: Codable, Identifiable, Hashable {
    let time: Double
    let text: String
    let words: [LyricWord]?

    var id: Double { time }
}

nonisolated struct LyricsVersion: Codable, Identifiable {
    let label: String?
    let lyrics: [LyricLine]

    var id: String { label ?? "Unknown" }
}

nonisolated struct MultiLyricsResponse: Codable {
    let source: String
    let lyrics: [LyricsVersion]
}
