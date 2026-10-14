import SwiftUI

/// Compact mobile layout from the web PlayerControls: buttons above the seek bar.
struct PlaybackControlsView: View {
    @ObservedObject var player: PlayerViewModel
    @Binding var hideVideo: Bool
    let previous: () -> Void
    let next: () -> Void
    private let primary = Color(red: 139/255, green: 92/255, blue: 246/255)
    private let pink = Color(red: 236/255, green: 72/255, blue: 153/255)
    private var firstTime: Double { player.lyricTimeline.lines.first?.start ?? 0 }

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                icon("backward.end.fill", "Previous song", previous)
                Button(action: player.togglePlayPause) {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                        .frame(width: 42, height: 42)
                        .background(LinearGradient(colors: [primary, pink], startPoint: .leading, endPoint: .trailing))
                        .clipShape(Circle())
                }.accessibilityLabel(player.isPlaying ? "Pause" : "Play")
                icon("forward.end.fill", "Next song", next)
                Spacer(minLength: 4)
                if player.lyricVersions.count > 1 {
                    Menu {
                        Picker("Lyrics", selection: $player.selectedLyricsIndex) {
                            ForEach(player.lyricVersions.indices, id: \.self) { index in
                                Text(player.lyricVersions[index].label ?? "Version \(index + 1)").tag(index)
                            }
                        }
                    } label: { Image(systemName: "character.bubble").frame(width: 36, height: 36) }
                    .accessibilityLabel("Switch lyrics language")
                }
                icon(player.vocalsVolume > 0 ? "speaker.wave.2.fill" : "speaker.slash.fill", "Toggle vocals") {
                    player.vocalsVolume = player.vocalsVolume > 0 ? 0 : 1
                }
                icon(hideVideo ? "video.slash" : "video", "Toggle video") { hideVideo.toggle() }
                Button("Align") { player.lyricsOffset = player.currentSongTime - firstTime }
                    .font(.caption.bold()).padding(8).background(.white.opacity(0.05)).clipShape(Capsule())
                HStack(spacing: 4) {
                    Button("−") { player.lyricsOffset -= 0.5 }.frame(width: 24, height: 36)
                    Text(String(format: "%.1fs", player.lyricsOffset + firstTime))
                        .font(.caption.monospacedDigit()).frame(minWidth: 36)
                    Button("+") { player.lyricsOffset += 0.5 }.frame(width: 24, height: 36)
                    Button("Reset") { player.lyricsOffset = 0 }.font(.caption2.bold()).foregroundStyle(pink)
                }.padding(.horizontal, 6).background(.white.opacity(0.05)).clipShape(Capsule())
            }
            HStack(spacing: 10) {
                Text(time(player.currentSongTime))
                Slider(value: Binding(get: { min(max(0, player.currentSongTime), max(1, player.songDuration)) },
                                      set: player.seek), in: 0...max(1, player.songDuration))
                    .tint(primary).accessibilityLabel("Song position")
                Text(time(player.songDuration))
            }.font(.caption2.monospacedDigit()).foregroundStyle(.gray)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(Color(red: 10/255, green: 10/255, blue: 15/255).opacity(0.95))
    }

    private func icon(_ symbol: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 14)).frame(width: 36, height: 36)
                .background(.white.opacity(0.05)).clipShape(Circle())
        }.accessibilityLabel(label)
    }
    private func time(_ seconds: Double) -> String {
        let bounded = seconds.isFinite ? Int(min(86400, max(0, seconds))) : 0
        return String(format: "%d:%02d", bounded / 60, bounded % 60)
    }
}
