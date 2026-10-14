import SwiftUI

struct LyricsView: View {
    @ObservedObject var viewModel: PlayerViewModel

    enum LyricStatus {
        case past, active, future
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .center, spacing: 12) {
                    ForEach(Array(viewModel.lyrics.enumerated()), id: \.offset) { index, line in
                        let status = getStatus(for: line)

                        if status == .active {
                            Text(getActiveAttributedString(for: line, time: viewModel.currentSongTime - viewModel.lyricsOffset))
                                .font(.system(size: 32, weight: .bold, design: .rounded))
                                .shadow(color: Color(red: 139/255, green: 92/255, blue: 246/255).opacity(0.8), radius: 15, x: 0, y: 0)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                                .id(index)
                                .animation(.spring(response: 0.4, dampingFraction: 0.7), value: status)
                        } else {
                            Text(line.text)
                                .font(.system(size: 20, weight: .semibold, design: .rounded))
                                .foregroundColor(status == .past ? .gray : .white)
                                .opacity(status == .past ? 0.4 : 0.7)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 4)
                                .id(index)
                                .animation(.spring(response: 0.4, dampingFraction: 0.7), value: status)
                        }
                    }
                }
                .padding(.vertical, 200) // Safe padding to allow center scrolling

                if viewModel.isProcessing {
                    VStack(spacing: 12) {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        Text("Loading Song...")
                            .foregroundColor(.gray)
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            // Background is completely transparent now!
            .onChange(of: viewModel.currentSongTime) { _, time in
                let adjustedTime = time - viewModel.lyricsOffset
                if let index = viewModel.lyrics.lastIndex(where: { $0.time <= adjustedTime }) {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        proxy.scrollTo(index, anchor: .center)
                    }
                }
            }
        }
    }

    private func getStatus(for line: LyricLine) -> LyricStatus {
        let adjustedTime = viewModel.currentSongTime - viewModel.lyricsOffset
        guard let index = viewModel.lyrics.firstIndex(where: { $0.id == line.id }) else { return .future }

        if line.time <= adjustedTime {
            if index == viewModel.lyrics.count - 1 { return .active }
            else if viewModel.lyrics[index + 1].time > adjustedTime { return .active }
            else { return .past }
        }
        return .future
    }

    private func getActiveAttributedString(for line: LyricLine, time: Double) -> AttributedString {
        var attrStr = AttributedString()
        let activeColor = Color.white
        let inactiveColor = Color(red: 139/255, green: 92/255, blue: 246/255)

        guard let words = line.words, !words.isEmpty else {
            var str = AttributedString(line.text)
            str.foregroundColor = activeColor
            return str
        }

        for (index, wObj) in words.enumerated() {
            var wordStr = AttributedString()
            let needsSpace = !wObj.word.hasSuffix(" ") && index < words.count - 1

            let wStart = wObj.start ?? 0
            let wEnd = wObj.end ?? 0
            let wDuration = max(0.01, wEnd - wStart)

            if time >= wEnd {
                var filledAttr = AttributedString(wObj.word)
                filledAttr.foregroundColor = activeColor
                wordStr = filledAttr
            } else if time >= wStart {
                let progress = (time - wStart) / wDuration
                let charsToFill = min(wObj.word.count, max(0, Int(progress * Double(wObj.word.count))))

                let wordString = wObj.word
                let filledText = String(wordString.prefix(charsToFill))
                let unfilledText = String(wordString.suffix(wordString.count - charsToFill))

                var filledAttr = AttributedString(filledText)
                filledAttr.foregroundColor = activeColor

                var unfilledAttr = AttributedString(unfilledText)
                unfilledAttr.foregroundColor = inactiveColor

                wordStr = filledAttr + unfilledAttr
            } else {
                var unfilledAttr = AttributedString(wObj.word)
                unfilledAttr.foregroundColor = inactiveColor
                wordStr = unfilledAttr
            }

            if needsSpace {
                var spaceAttr = AttributedString(" ")
                spaceAttr.foregroundColor = time >= wEnd ? activeColor : inactiveColor
                wordStr += spaceAttr
            }

            attrStr += wordStr
        }

        return attrStr
    }
}
