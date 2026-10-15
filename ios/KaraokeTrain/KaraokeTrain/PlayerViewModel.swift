import Foundation
import AVFoundation
import Combine
import UIKit

@MainActor
class PlayerViewModel: ObservableObject {
    @Published var currentTrack: Track?
    @Published var isPlaying = false { didSet { emitTransport() } }
    @Published var isBuffering = false
    @Published private(set) var isReadyForPlayback = false
    @Published var isProcessing = false
    @Published var processingStatus = ""
    @Published var processingProgress = 0.0
    @Published var processingError: String?
    @Published var lyricsError: String?
    @Published private(set) var lyricsSource = "Loading…"
    @Published var lyrics: [LyricLine] = [] {
        didSet { lyricTimeline = LyricTimeline(lyrics) }
    }
    @Published private(set) var lyricTimeline = LyricTimeline([])
    @Published var lyricVersions: [LyricsVersion] = []
    @Published var selectedLyricsIndex = 0 {
        didSet { if lyricVersions.indices.contains(selectedLyricsIndex) { lyrics = lyricVersions[selectedLyricsIndex].lyrics } }
    }
    @Published var currentSongTime = 0.0
    @Published var songDuration = 1.0
    @Published var lyricsOffset = 0.0
    @Published var vocalsVolume: Float = 1 {
        didSet { applyVocalMix() }
    }
    @Published var vocalsEnabled = true { didSet { applyVocalMix() } }
    // Config
    private let webServerURL = ServerConfiguration.web


    var serverURL: String { webServerURL }
    private var currentJobID: String?
    private var lyricsTask: Task<Void, Never>?
    private var lyricsRefreshPending = false
    @Published private(set) var isRetryingLyrics = false
    private var player: AVPlayer?
    private var tapContext: AudioMixer.TapContext?
    private var timeObserverToken: Any?
    private var endObserver: NSObjectProtocol?
    private var itemStatusObserver: NSKeyValueObservation?
    private var playbackStatusObserver: NSKeyValueObservation?
    private var processingTask: Task<Void, Never>?
    private var generation = UUID()
    var onSongEnded: (() -> Void)?
    var onTransport: ((RecordingTransport) -> Void)?
    private var isSeeking = false
    private var seekGeneration = UUID()
    private var audioObservers: [NSObjectProtocol] = []
    init() {
        audioObservers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue else { return }
            Task { @MainActor [weak self] in self?.setPlaying(false) }
        })
        audioObservers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            guard (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue else { return }
            Task { @MainActor [weak self] in self?.setPlaying(false) }
        })
    }
    var recordingTransport: RecordingTransport {
        let time = player?.currentTime().seconds ?? 0
        return RecordingTransport(jobID: isReadyForPlayback ? currentJobID : nil,
                                  songTime: time.isFinite ? max(0, time) : 0,
                                  playing: !isSeeking && player?.timeControlStatus == .playing,
                                  vocalsGain: vocalsEnabled ? Double(vocalsVolume) : 0)
    }
    private func emitTransport() { onTransport?(recordingTransport) }

    private func applyVocalMix() {
        tapContext?.vocalsVolume = vocalsEnabled ? vocalsVolume : 0
        emitTransport()
    }

    func playTrack(_ track: Track, jobID: String? = nil) {
        stop()
        currentTrack = track
        currentJobID = jobID ?? track.videoId
        lyrics = []
        lyricsSource = "Loading…"
        lyricVersions = []
        selectedLyricsIndex = 0
        lyricsOffset = 0
        currentSongTime = 0
        songDuration = max(1, Double(track.duration))
        processingError = nil
        lyricsError = nil
        isProcessing = true
        UIApplication.shared.isIdleTimerDisabled = true
        let token = generation
        let service = ServerSongService(baseURL: webServerURL)
        let selectedJobID = currentJobID ?? track.videoId
        processingTask = Task { [weak self] in
            do {
                let prepared = try await service.waitForSong(jobID: selectedJobID) { [weak self] status, progress in
                    await self?.updateProgress(status, progress, token: token)
                }
                try Task.checkCancellation()
                guard let self, self.generation == token else { return }
                self.lyricsError = prepared.lyricsWarning
                if let data = prepared.lyrics {
                    do { try self.acceptLyrics(data) }
                    catch { self.lyricsError = "Could not load synced lyrics. Audio is available." }
                }
                self.processingStatus = "Loading cached audio…"
                let url = try service.audioURL(jobID: selectedJobID)
                try await self.setupPlayer(with: url, token: token)
                try Task.checkCancellation()
                guard self.generation == token else { return }
                self.isProcessing = false
                self.processingProgress = 1
                self.processingStatus = "Ready"
                self.isReadyForPlayback = true
                // A fresh queue entry is ready and paused, matching the web host.
                self.player?.pause()
                self.isPlaying = false
            } catch {
                guard let self, self.generation == token, !Task.isCancelled else { return }
                self.stopAudio()
                self.isProcessing = false
                self.processingError = error.localizedDescription
            }
            if self?.generation == token {
                UIApplication.shared.isIdleTimerDisabled = self?.isPlaying == true
                self?.processingTask = nil
            }
        }
    }

    private func updateProgress(_ status: String, _ value: Double, token: UUID) {
        guard generation == token else { return }
        processingStatus = status
        processingProgress = value
    }

    private func acceptLyrics(_ data: Data) throws {
        let document = try LyricDocument(data: data)
        let previousLabel = lyricVersions.indices.contains(selectedLyricsIndex) ? lyricVersions[selectedLyricsIndex].label : nil
        let selection = document.selection(previousLabel: previousLabel, previousIndex: selectedLyricsIndex, hasPrevious: !lyricVersions.isEmpty)
        lyricVersions = document.versions
        lyricsSource = document.sourceLabel
        selectedLyricsIndex = selection
        lyrics = lyricVersions.indices.contains(selection) ? lyricVersions[selection].lyrics : []
    }

    func retryLyrics() { loadLyrics(repair: true) }
    func refreshLyrics() {
        if lyricsTask != nil { lyricsRefreshPending = true }
        else { loadLyrics(repair: false) }
    }

    private func loadLyrics(repair: Bool) {
        guard let jobID = currentJobID, lyricsTask == nil, isReadyForPlayback else { return }
        let token = generation
        let service = ServerSongService(baseURL: webServerURL)
        isRetryingLyrics = repair
        lyricsTask = Task { [weak self] in
            do {
                let data: Data
                if repair { data = try await service.repairLyrics(jobID: jobID) }
                else {
                    let saved = try await service.waitForSong(jobID: jobID) { _, _ in }
                    guard let lyrics = saved.lyrics else { throw URLError(.cannotParseResponse) }
                    data = lyrics
                }
                try Task.checkCancellation()
                guard let self, self.generation == token else { return }
                try self.acceptLyrics(data)
                self.lyricsError = self.lyrics.isEmpty ? "No synced lyrics available." : nil
            } catch {
                guard !Task.isCancelled, self?.generation == token else { return }
                self?.lyricsError = error.localizedDescription
            }
            if let self, self.generation == token {
                self.isRetryingLyrics = false; self.lyricsTask = nil
                if self.lyricsRefreshPending { self.lyricsRefreshPending = false; self.loadLyrics(repair: false) }
            }
        }
    }

    func cancelProcessing() {
        stop()
        processingError = "Stopped waiting for this song. Preparation can continue on the server; retry when ready."
    }

    func handleBackground() {
        if isProcessing { cancelProcessing() }
    }

    func stop() {
        generation = UUID()
        processingTask?.cancel()
        processingTask = nil
        lyricsTask?.cancel(); lyricsTask = nil
        lyricsRefreshPending = false
        isRetryingLyrics = false
        isProcessing = false
        UIApplication.shared.isIdleTimerDisabled = false
        stopAudio()
    }

    private func stopAudio() {
        emitTransport()
        isSeeking = false
        isReadyForPlayback = false
        itemStatusObserver = nil
        playbackStatusObserver = nil
        isBuffering = false
        player?.pause()
        if let timeObserverToken { player?.removeTimeObserver(timeObserverToken) }
        timeObserverToken = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil
        player?.replaceCurrentItem(with: nil)
        player = nil
        tapContext = nil
        isPlaying = false
    }

    private func setupPlayer(with url: URL, token: UUID) async throws {
        let asset = AVURLAsset(url: url, options: [AVURLAssetHTTPCookiesKey: ServerAccess.cookies(for: url)])
        let (tracks, duration) = try await withTaskCancellationHandler {
            let tracks = try await asset.loadTracks(withMediaType: .audio)
            let duration = try await asset.load(.duration)
            return (tracks, duration)
        } onCancel: { asset.cancelLoading() }
        try Task.checkCancellation()
        guard generation == token else { throw CancellationError() }
        guard let track = tracks.first else { throw StemSeparatorError.invalid("No audio track in cached file.") }
        let context = AudioMixer.TapContext()
        context.vocalsVolume = vocalsEnabled ? vocalsVolume : 0
        guard let tap = AudioMixer.createTap(context: context) else {
            throw StemSeparatorError.invalid("Could not initialize the vocal mixer.")
        }
        let params = AVMutableAudioMixInputParameters(track: track)
        params.audioTapProcessor = tap
        let mix = AVMutableAudioMix()
        mix.inputParameters = [params]
        let item = AVPlayerItem(asset: asset)
        item.audioMix = mix
        tapContext = context
        songDuration = duration.seconds.isFinite && duration.seconds > 0 && duration.seconds <= 86_400
            ? duration.seconds : songDuration
        let audioPlayer = AVPlayer(playerItem: item)
        player = audioPlayer
        itemStatusObserver = item.observe(\.status, options: [.new]) { [weak self] observed, _ in
            guard observed.status == .failed else { return }
            let message = observed.error?.localizedDescription ?? "The audio stream failed. Check the server connection."
            Task { @MainActor [weak self] in
                guard let self, self.generation == token else { return }
                self.player?.pause()
                self.isPlaying = false
                self.isBuffering = false
                self.isReadyForPlayback = false
                self.processingError = message
            }
        }
        playbackStatusObserver = audioPlayer.observe(\.timeControlStatus, options: [.new]) { [weak self] observed, _ in
            let waiting = observed.timeControlStatus == .waitingToPlayAtSpecifiedRate
            Task { @MainActor [weak self] in
                guard let self, self.generation == token else { return }
                self.isBuffering = waiting
                self.emitTransport()
            }
        }
        let deadline = Date().addingTimeInterval(60)
        while item.status == .unknown && Date() < deadline {
            try await Task.sleep(for: .milliseconds(100))
        }
        try Task.checkCancellation()
        guard generation == token else { throw CancellationError() }
        guard item.status == .readyToPlay else {
            throw item.error ?? StemSeparatorError.invalid("Audio stream did not become ready.")
        }
        timeObserverToken = audioPlayer.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1.0 / 30, preferredTimescale: 600),
                                                                queue: .main) { [weak self] time in
            Task { @MainActor [weak self] in
                guard let self, self.generation == token, time.seconds.isFinite else { return }
                self.currentSongTime = max(0, time.seconds)
                self.emitTransport()
            }
        }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.generation == token else { return }
                self.isPlaying = false
                self.onSongEnded?()
            }
        }
    }

    func togglePlayPause() {
        guard !isProcessing, let player else { return }
        if isPlaying { player.pause() } else { player.play() }
        isPlaying.toggle()
    }

    func setPlaying(_ playing: Bool) {
        guard isReadyForPlayback, let player else { return }
        if playing { player.play() } else { player.pause() }
        isPlaying = playing
    }

    func seek(to time: Double) {
        guard !isProcessing, time.isFinite, let player else { return }
        let target = min(max(0, time), songDuration)
        emitTransport()
        isSeeking = true
        emitTransport()
        let token = generation
        let seekToken = UUID(); seekGeneration = seekToken
        player.seek(to: CMTime(seconds: target, preferredTimescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.generation == token, self.seekGeneration == seekToken else { return }
                self.isSeeking = false
                self.emitTransport()
            }
        }
        currentSongTime = target
    }

    deinit {
        for observer in audioObservers { NotificationCenter.default.removeObserver(observer) }
        processingTask?.cancel()
        lyricsTask?.cancel()
        if let timeObserverToken { player?.removeTimeObserver(timeObserverToken) }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    }
}
