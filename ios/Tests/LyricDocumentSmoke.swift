import Foundation

@main
struct LyricDocumentSmoke {
    static func main() throws {
        let json = #"{"source":"lrclib_qwen_aligned_multi","lyrics":[{"label":"Original","lyrics":[{"time":99,"text":"held","words":[{"word":"held","start":2,"end":8}]}]},{"label":"Romanized","lyrics":[{"time":2,"text":"held"}]}]}"#
        let document = try LyricDocument(data: Data(json.utf8))
        assert(document.versions[0].lyrics[0].time == 2)
        assert(document.versions[0].lyrics[0].words?[0].end == 8)
        assert(document.selection(previousLabel: nil, previousIndex: 0, hasPrevious: false) == 1)
        assert(document.selection(previousLabel: "Original", previousIndex: 1, hasPrevious: true) == 0)
        assert(document.selection(previousLabel: "Removed version", previousIndex: 100, hasPrevious: true) == 1)
        assert(document.sourceLabel == "LRCLIB + Qwen AI")
        let single = try LyricDocument(data: Data(#"{"source":"qwen_transcription","lyrics":[{"time":2,"text":" "},{"time":-3,"text":"valid words","words":[{"word":"valid","start":3,"end":5},{"word":"bad","start":5,"end":4}]}]}"#.utf8))
        assert(single.versions[0].lyrics.count == 1)
        assert(single.versions[0].lyrics[0].time == 3)
        assert(single.versions[0].lyrics[0].words?.count == 1)
        let empty = try LyricDocument(data: Data(#"{"source":"unavailable","lyrics":[]}"#.utf8))
        assert(empty.selection(previousLabel: nil, previousIndex: -20, hasPrevious: true) == 0)
        print("PASS: lyric repairs retain language choice and authoritative word timing, with safe empty/malformed timing")
    }
}
