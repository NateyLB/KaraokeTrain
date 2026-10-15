import SwiftUI
import CoreText

struct WordHighlightText: UIViewRepresentable {
    let line: LyricTimeline.Line
    let time: Double
    let highlight: Bool

    func makeUIView(context: Context) -> LyricTextView { LyricTextView() }
    func updateUIView(_ view: LyricTextView, context: Context) {
        view.update(line: line, time: time, highlight: highlight)
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: LyricTextView, context: Context) -> CGSize? {
        uiView.textSize(width: proposal.width ?? 280)
    }
}

final class LyricTextView: UIView {
    private var line: LyricTimeline.Line?
    private var layout: LyricTextLayout?
    private var layoutWidth: CGFloat = -1
    private var time: Double = 0
    private var highlight = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        isAccessibilityElement = true
        accessibilityTraits = .staticText
        registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (view: LyricTextView, _: UITraitCollection) in
            view.layout = nil
            view.invalidateIntrinsicContentSize()
            view.setNeedsLayout()
        }
    }
    required init?(coder: NSCoder) { fatalError("Use init(frame:)") }

    func update(line: LyricTimeline.Line, time: Double, highlight: Bool) {
        if self.line != line {
            self.line = line
            layout = nil
            accessibilityLabel = line.text
            invalidateIntrinsicContentSize()
        }
        self.time = time
        self.highlight = highlight
        setNeedsDisplay()
    }

    func textSize(width: CGFloat) -> CGSize {
        rebuild(width: width)
        return layout?.size ?? CGSize(width: width, height: 1)
    }

    private func rebuild(width: CGFloat) {
        guard let line, layout == nil || abs(layoutWidth - width) > 0.5 else { return }
        layoutWidth = width
        let base = UIFont.systemFont(ofSize: 28, weight: .medium)
        let descriptor = base.fontDescriptor.withDesign(.rounded) ?? base.fontDescriptor
        let font = UIFontMetrics(forTextStyle: .title2).scaledFont(for: UIFont(descriptor: descriptor, size: 28))
        layout = LyricTextLayout(line: line, width: width, font: font as CTFont,
                                accent: UIColor(red: 139/255, green: 92/255, blue: 246/255, alpha: 1).cgColor)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        rebuild(width: bounds.width)
        setNeedsDisplay()
    }
    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext() else { return }
        rebuild(width: bounds.width)
        layout?.draw(in: context, at: time, highlight: highlight)
    }
}
