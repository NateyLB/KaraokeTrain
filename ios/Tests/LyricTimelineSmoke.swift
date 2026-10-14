import Foundation

nonisolated struct TimelineFixture: Decodable {
    let name: String
    let lines: [LyricLine]
    let samples: [Sample]
    struct Sample: Decodable {
        let time: Double
        let index: Int
        let singing: Bool
        let rest: Bool
        let countdown: Int
        let finished: Bool
    }
}

@main
struct LyricTimelineSmoke {
    static func main() throws {
        let file = CommandLine.arguments.dropFirst().first ?? "tests/fixtures/lyric-timeline.json"
        let fixtures = try JSONDecoder().decode([TimelineFixture].self, from: Data(contentsOf: URL(fileURLWithPath: file)))
        var count = 0
        for fixture in fixtures {
            let timeline = LyricTimeline(fixture.lines)
            for sample in fixture.samples {
                let expected = LyricTimeline.PlaybackState(index: sample.index, singing: sample.singing,
                    rest: sample.rest, countdown: sample.countdown, finished: sample.finished)
                assert(timeline.state(at: sample.time) == expected, "\(fixture.name) at \(sample.time)")
                count += 1
            }
        }
        let word = LyricWord(word: "held", start: 2, end: 6)
        assert(LyricTimeline.wordProgress(word, at: 4) == 0.5)
        assert(LyricTimeline.wordProgress(word, at: 1) == 0)
        assert(LyricTimeline.wordProgress(word, at: 7) == 1)
        assert(LyricTimeline.wordProgress(LyricWord(word: "bad", start: 2, end: 2), at: 3) == 0)
        assert(LyricTimeline([]).state(at: .nan).index == -1)
        assert(LyricTimeline.separator("你", before: "好") == "")
        assert(LyricTimeline.separator("hello", before: "world") == " ")
        assert(LyricTimeline.separator("hello ", before: "world") == "")
        print("PASS: Swift matches \(count) web timeline states, sustained-word fill, seeking and native-language spacing")
    }
}
