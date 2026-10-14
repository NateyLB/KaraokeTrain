import SwiftUI

struct LyricsView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ObservedObject var viewModel: PlayerViewModel
    private var timeline: LyricTimeline { viewModel.lyricTimeline }

    var body: some View {
        let adjustedTime = viewModel.currentSongTime - viewModel.lyricsOffset
        let state = timeline.state(at: adjustedTime)
        GeometryReader { geometry in
            ScrollViewReader { proxy in
                ZStack(alignment: .top) {
                    if timeline.lines.isEmpty {
                        Text("No synced lyrics available.").foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        ScrollView(showsIndicators: false) {
                            VStack(spacing: 24) {
                                ForEach(timeline.lines) { line in
                                    let featured = line.id == state.index
                                    let highlight = featured && !state.rest && !state.finished
                                    LyricRowView(line: line, time: highlight ? adjustedTime : 0,
                                                 featured: featured, past: line.id < state.index,
                                                 highlight: highlight, finished: featured && state.finished,
                                                 reduceMotion: reduceMotion)
                                        .equatable()
                                        .id(line.id)
                                }
                            }
                            .padding(.vertical, geometry.size.height)
                        }
                        .mask(LinearGradient(stops: [.init(color: .clear, location: 0),
                                                     .init(color: .black, location: 0.15),
                                                     .init(color: .black, location: 0.7),
                                                     .init(color: .clear, location: 1)],
                                             startPoint: .top, endPoint: .bottom))
                    }
                    if state.rest, state.countdown > 0 {
                        Text("\(adjustedTime < (timeline.lines.first?.start ?? 0) ? "Vocals" : "Instrumental · Vocals") in \(state.countdown)s")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .onChange(of: timeline, initial: true) { _, _ in scroll(proxy, at: adjustedTime, animated: false) }
                .onChange(of: viewModel.lyricsOffset) { _, _ in scroll(proxy, at: adjustedTime, animated: false) }
                .onChange(of: viewModel.currentSongTime) { old, new in
                    let previous = timeline.state(at: old - viewModel.lyricsOffset)
                    if previous.index != state.index || abs(new - old) > 1 {
                        scroll(proxy, at: adjustedTime, animated: abs(new - old) <= 1)
                    }
                }
                .onChange(of: geometry.size) { _, _ in scroll(proxy, at: adjustedTime, animated: false) }
            }
        }
    }

    private func scroll(_ proxy: ScrollViewProxy, at time: Double, animated: Bool) {
        let index = timeline.state(at: time).index
        guard index >= 0 else { return }
        withAnimation(animated && !reduceMotion ? .easeOut(duration: 0.4) : nil) {
            proxy.scrollTo(index, anchor: UnitPoint(x: 0.5, y: 0.25))
        }
    }

}

/// Unchanged rows avoid rebuilding word strings on every playback tick.
private struct LyricRowView: View, Equatable {
    let line: LyricTimeline.Line
    let time: Double
    let featured: Bool
    let past: Bool
    let highlight: Bool
    let finished: Bool
    let reduceMotion: Bool
    private static let accent = Color(red: 139/255, green: 92/255, blue: 246/255)

    var body: some View {
        Text(attributedText)
            .font(.system(size: 28, weight: .medium, design: .rounded))
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 16)
            .opacity(featured ? (finished ? 0.5 : 1) : past ? 0.4 : 0.75)
            .scaleEffect(reduceMotion ? 1 : featured ? 1.05 : 0.82)
            .shadow(color: featured ? Self.accent.opacity(0.4) : .clear, radius: 12)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: featured)
    }

    private var attributedText: AttributedString {
        guard !line.words.isEmpty else { return AttributedString(line.text) }
        var result = AttributedString()
        for (index, word) in line.words.enumerated() {
            let count = highlight ? Int(LyricTimeline.wordProgress(word, at: time) * Double(word.word.count)) : word.word.count
            var filled = AttributedString(String(word.word.prefix(count)))
            filled.foregroundColor = .white
            var remaining = AttributedString(String(word.word.dropFirst(count)))
            remaining.foregroundColor = Self.accent
            result += filled + remaining
            let next = index + 1 < line.words.count ? line.words[index + 1].word : nil
            result += AttributedString(LyricTimeline.separator(word.word, before: next))
        }
        return result
    }
}
