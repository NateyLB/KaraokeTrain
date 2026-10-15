import Foundation

/// Owns lyric decoding and language selection independently of audio playback.
nonisolated struct LyricDocument {
    let source: String
    let versions: [LyricsVersion]

    init(data: Data) throws {
        let decoded: [LyricsVersion]
        if let multi = try? JSONDecoder().decode(MultiLyricsResponse.self, from: data) {
            source = multi.source
            decoded = multi.lyrics
        } else {
            let single = try JSONDecoder().decode(LyricsResponse.self, from: data)
            source = single.source
            decoded = [LyricsVersion(label: "Default", lyrics: single.lyrics)]
        }
        versions = decoded.map { version in
            let lines = LyricTimeline(version.lyrics).lines.map {
                LyricLine(time: $0.start, text: $0.text, words: $0.words)
            }
            return LyricsVersion(label: version.label, lyrics: lines)
        }
    }

    func selection(previousLabel: String?, previousIndex: Int, hasPrevious: Bool) -> Int {
        if hasPrevious {
            if let previousLabel, let index = versions.firstIndex(where: { $0.label == previousLabel }) { return index }
            return min(max(0, previousIndex), max(0, versions.count - 1))
        }
        return versions.firstIndex(where: { $0.label?.contains("Romanized") == true }) ?? 0
    }

    var sourceLabel: String {
        switch source {
        case "qwen_transcription": "Qwen transcription"
        case let value where value.hasPrefix("lrclib_qwen_aligned"): "LRCLIB + Qwen AI"
        case "lrclib_aligned": "LRCLIB + Whisper AI"
        case "lrclib_aligned_multi": "LRCLIB (Multi-Version) + Whisper AI"
        case "whisper_fallback": "Whisper transcription"
        default: "No verified lyrics"
        }
    }
}
