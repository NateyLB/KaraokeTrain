// macOS smoke test of the native GCS stream and the production audio mixer.
// Streams an existing cached song muted; does not save or modify media.
import Foundation
import AVFoundation

@main
struct StreamingPlaybackSmoke {
    @MainActor static func main() async {
        Task {
            try? await Task.sleep(for: .seconds(45))
            print("FAIL: audio playback timed out")
            exit(1)
        }
        do {
            guard CommandLine.arguments.count == 2, let url = URL(string: CommandLine.arguments[1]) else {
                throw CocoaError(.fileReadInvalidFileName)
            }
            let asset = AVURLAsset(url: url)
            let tracks = try await asset.loadTracks(withMediaType: .audio)
            guard let track = tracks.first else { throw CocoaError(.fileReadCorruptFile) }
            let context = AudioMixer.TapContext()
            guard let tap = AudioMixer.createTap(context: context) else { throw CocoaError(.fileReadCorruptFile) }
            let parameters = AVMutableAudioMixInputParameters(track: track)
            parameters.audioTapProcessor = tap
            let mix = AVMutableAudioMix()
            mix.inputParameters = [parameters]
            let item = AVPlayerItem(asset: asset)
            item.audioMix = mix
            let player = AVPlayer(playerItem: item)
            player.volume = 0
            while item.status == .unknown { try await Task.sleep(for: .milliseconds(100)) }
            guard item.status == .readyToPlay else { throw item.error ?? CocoaError(.fileReadCorruptFile) }
            player.play()
            while player.currentTime().seconds < 2 {
                if item.status == .failed { throw item.error ?? CocoaError(.fileReadCorruptFile) }
                try await Task.sleep(for: .milliseconds(100))
            }
            player.pause()
            guard context.validFormat else { throw CocoaError(.fileReadCorruptFile) }
            print("PASS: AVPlayer streamed GCS audio, advanced playback, and ran the native audio mixer")
            exit(0)
        } catch {
            print("FAIL: \(error.localizedDescription)")
            exit(1)
        }
    }
}
