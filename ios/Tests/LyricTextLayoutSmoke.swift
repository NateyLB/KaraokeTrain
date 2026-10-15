import Foundation
import CoreText
import CoreGraphics

@main
struct LyricTextLayoutSmoke {
    static func main() {
        let font = CTFontCreateWithName("Helvetica" as CFString, 28, nil)
        let line = LyricTimeline([LyricLine(time: 0, text: "held", words: [LyricWord(word: "held", start: 0, end: 4)])]).lines[0]
        let layout = LyricTextLayout(line: line, width: 300, font: font, accent: CGColor(red: 0.5, green: 0, blue: 1, alpha: 1))
        let width = layout.fragments[0].reduce(CGFloat(0)) { $0 + $1.rect.width }
        assert(layout.highlightRects(at: -1).isEmpty)
        let partial = layout.highlightRects(at: 1.5).reduce(CGFloat(0)) { $0 + $1.width }
        assert(abs(partial / width - 0.375) < 0.0001)
        assert(abs(layout.highlightRects(at: 4).reduce(CGFloat(0)) { $0 + $1.width } - width) < 0.0001)
        let wrapped = LyricTextLayout(line: LyricTimeline([LyricLine(time: 0, text: "supercalifragilistic", words: [LyricWord(word: "supercalifragilistic", start: 0, end: 4)])]).lines[0], width: 70, font: font, accent: CGColor(gray: 0.5, alpha: 1))
        assert(wrapped.fragments[0].count > 1)
        let full = wrapped.fragments[0].reduce(CGFloat(0)) { $0 + $1.rect.width }
        assert(abs(wrapped.highlightRects(at: 2).reduce(CGFloat(0)) { $0 + $1.width } / full - 0.5) < 0.0001)
        let native = LyricTextLayout(line: LyricTimeline([LyricLine(time: 0, text: "你好", words: [LyricWord(word: "你", start: 0, end: 2), LyricWord(word: "好", start: 2, end: 4)])]).lines[0], width: 200, font: font, accent: CGColor(gray: 0.5, alpha: 1))
        assert(native.text == "你好")
        let rtl = LyricTextLayout(line: LyricTimeline([LyricLine(time: 0, text: "مرحبا", words: [LyricWord(word: "مرحبا", start: 0, end: 4)])]).lines[0], width: 200, font: font, accent: CGColor(gray: 0.5, alpha: 1))
        assert(!rtl.fragments[0].isEmpty && !rtl.highlightRects(at: 2).isEmpty)
        assert(rtl.fragments[0][0].rightToLeft)
        assert(abs(rtl.highlightRects(at: 2)[0].maxX - rtl.fragments[0][0].rect.maxX) < 0.001)
        print("PASS: sub-character lyric fill, wrapped words, continuous sustained timing, CJK spacing and RTL text geometry")
    }
}
