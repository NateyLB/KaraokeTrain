import Foundation
import CoreText
import CoreGraphics
#if canImport(UIKit)
import UIKit
#else
import AppKit
#endif

/// Caches wrapping and glyph positions; playback changes only the clipping rectangles.
nonisolated final class LyricTextLayout {
    struct Fragment {
        let rect: CGRect
        let rightToLeft: Bool
    }
    let size: CGSize
    let text: String
    let words: [LyricWord]
    let fragments: [[Fragment]]
    private let whiteFrame: CTFrame
    private let accentFrame: CTFrame

    init(line: LyricTimeline.Line, width: CGFloat, font: CTFont, accent: CGColor) {
        words = line.words
        var text = ""
        var ranges: [NSRange] = []
        for (index, word) in words.enumerated() {
            ranges.append(NSRange(location: text.utf16.count, length: word.word.utf16.count))
            text += word.word
            text += LyricTimeline.separator(word.word, before: index + 1 < words.count ? words[index + 1].word : nil)
        }
        if words.isEmpty { text = line.text }
        self.text = text
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        paragraph.lineSpacing = 4
        let attributes: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            .paragraphStyle: paragraph,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 1, alpha: 1),
        ]
        let white = NSAttributedString(string: text, attributes: attributes)
        let setter = CTFramesetterCreateWithAttributedString(white as CFAttributedString)
        let availableWidth = max(1, width.isFinite ? width : 1)
        let measured = CTFramesetterSuggestFrameSizeWithConstraints(setter, CFRange(), nil,
            CGSize(width: availableWidth, height: .greatestFiniteMagnitude), nil)
        size = CGSize(width: availableWidth, height: max(1, ceil(measured.height) + 2))
        let path = CGPath(rect: CGRect(origin: .zero, size: size), transform: nil)
        whiteFrame = CTFramesetterCreateFrame(setter, CFRange(), path, nil)
        let colored = NSMutableAttributedString(attributedString: white)
        colored.addAttribute(NSAttributedString.Key(kCTForegroundColorAttributeName as String), value: accent,
                             range: NSRange(location: 0, length: colored.length))
        accentFrame = CTFramesetterCreateFrame(CTFramesetterCreateWithAttributedString(colored as CFAttributedString), CFRange(), path, nil)

        let lines = CTFrameGetLines(whiteFrame) as! [CTLine]
        var origins = [CGPoint](repeating: .zero, count: lines.count)
        CTFrameGetLineOrigins(whiteFrame, CFRange(), &origins)
        fragments = ranges.map { range in
            lines.enumerated().compactMap { index, line in
                let lineRange = CTLineGetStringRange(line)
                let overlap = NSIntersectionRange(range, NSRange(location: lineRange.location, length: lineRange.length))
                guard overlap.length > 0 else { return nil }
                let start = CTLineGetOffsetForStringIndex(line, overlap.location, nil)
                let end = CTLineGetOffsetForStringIndex(line, NSMaxRange(overlap), nil)
                var ascent: CGFloat = 0, descent: CGFloat = 0
                _ = CTLineGetTypographicBounds(line, &ascent, &descent, nil)
                return Fragment(rect: CGRect(x: origins[index].x + min(start, end),
                    y: origins[index].y - descent, width: abs(end - start), height: ascent + descent), rightToLeft: end < start)
            }
        }
    }

    func highlightRects(at time: Double) -> [CGRect] {
        words.enumerated().flatMap { index, word -> [CGRect] in
            let pieces = fragments[index]
            var remaining = pieces.reduce(CGFloat(0)) { $0 + $1.rect.width } * CGFloat(LyricTimeline.wordProgress(word, at: time))
            return pieces.compactMap { piece in
                let width = min(piece.rect.width, remaining)
                remaining -= width
                guard width > 0 else { return nil }
                return CGRect(x: piece.rightToLeft ? piece.rect.maxX - width : piece.rect.minX,
                              y: piece.rect.minY, width: width, height: piece.rect.height)
            }
        }
    }

    func draw(in context: CGContext, at time: Double, highlight: Bool) {
        context.saveGState()
        defer { context.restoreGState() }
        context.textMatrix = .identity
        context.translateBy(x: 0, y: size.height)
        context.scaleBy(x: 1, y: -1)
        CTFrameDraw(highlight ? accentFrame : whiteFrame, context)
        guard highlight else { return }
        let rects = highlightRects(at: time)
        guard !rects.isEmpty else { return }
        context.clip(to: rects)
        CTFrameDraw(whiteFrame, context)
    }
}
