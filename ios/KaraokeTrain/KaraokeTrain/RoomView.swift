import SwiftUI

struct RoomView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var partyViewModel: PartyViewModel
    @StateObject private var playerViewModel = PlayerViewModel()
    @StateObject private var microphone = MicrophoneModel()
    @StateObject private var recording = RecordingModel()
    @State private var showRecording = false
    @State private var loadedSongID: String?
    @State private var lastRemoteSettings: Double = 0
    @State private var lastRemoteCommand: Double = 0
    @State private var remoteAppliedSnapshot: PlaybackSnapshot?
    @State private var hideVideo = false
    @State private var showSearch = false
    @State private var videoError: String?
    @State private var videoReloadID = UUID()
    @State private var showQueue = false
    @State private var isControlsVisible = true
    @State private var isMicExpanded = false
    @State private var isInfoOpen = false

    // Web app color palette
    let bgDark = Color(red: 10/255, green: 5/255, blue: 20/255)
    let bgStart = Color(red: 16/255, green: 8/255, blue: 36/255)
    let primaryAccent = Color(red: 139/255, green: 92/255, blue: 246/255)
    let secondaryAccent = Color(red: 236/255, green: 72/255, blue: 153/255)

    var body: some View {
        ZStack {
            // Background Gradient
            RadialGradient(
                gradient: Gradient(colors: [bgStart, bgDark]),
                center: .topLeading,
                startRadius: 50,
                endRadius: 800
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Top Header
                HStack(alignment: .center) {
                    Button(action: {
                        if recording.phase != .idle { showRecording = true; return }
                        playerViewModel.stop()
                        partyViewModel.leaveParty()
                        dismiss()
                    }) {
                        Image(systemName: "arrow.left")
                            .font(.title2)
                            .foregroundColor(.white)
                            .padding(12)
                            .background(Color.white.opacity(0.05))
                            .clipShape(Circle())
                    }

                    if showsPlayback, let currentSong = partyViewModel.partyState?.currentSong {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(currentSong.title)
                                .font(.headline)
                                .foregroundColor(.white)
                                .lineLimit(1)
                            Text(currentSong.artist)
                                .font(.subheadline)
                                .foregroundColor(.gray)
                                .lineLimit(1)
                        }
                        .padding(.leading, 8)
                    } else {
                        VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 0) {
                            Text("Room ")
                                .foregroundColor(.gray)
                            Text(partyViewModel.roomCode)
                                .foregroundColor(.white)
                                .bold()
                        }
                        Text("Join: \(playerViewModel.serverURL)/remote/\(partyViewModel.roomCode)")
                            .font(.caption2).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                        }
                    }

                    Spacer()

                    // Top Right Icons (Overlay Controls)
                        HStack(spacing: 8) {
                            if showsPlayback || recording.phase != .idle {
                            Button { showRecording.toggle(); isMicExpanded = false } label: {
                                Image(systemName: recording.phase == .recording ? "stop.circle.fill" : "record.circle")
                                    .foregroundStyle(recording.phase == .recording ? .red : .pink)
                                    .frame(width: 36, height: 36).background(.white.opacity(0.05)).clipShape(Circle())
                            }.accessibilityLabel("Record performance")
                            }
                            if showsPlayback {
                            // 0. Toggle Playback Controls
                            Button(action: {
                                withAnimation(.spring()) {
                                    isControlsVisible.toggle()
                                }
                            }) {
                                Image(systemName: "play.fill")
                                    .font(.system(size: 14, weight: .semibold))
                                    .frame(width: 36, height: 36)
                                    .foregroundColor(isControlsVisible ? primaryAccent : .gray)
                                    .background(Color.white.opacity(0.05))
                                    .clipShape(Circle())
                                    .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 1))
                            }

                            // 1. Mic Button
                            Button(action: {
                                withAnimation(.spring()) {
                                    isMicExpanded.toggle()
                                }
                            }) {
                                Image(systemName: isMicExpanded ? "mic.fill" : "mic.slash.fill")
                                    .font(.system(size: 14, weight: .semibold))
                                    .frame(width: 36, height: 36)
                                    .foregroundColor(isMicExpanded ? secondaryAccent : .gray)
                                    .background(Color.white.opacity(0.05))
                                    .clipShape(Circle())
                                    .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 1))
                            }

                            // 2. Search Button
                            Button(action: {
                                withAnimation(.spring()) {
                                    showSearch.toggle()
                                    showQueue = false
                                }
                            }) {
                                Image(systemName: "magnifyingglass")
                                    .font(.system(size: 14, weight: .semibold))
                                    .frame(width: 36, height: 36)
                                    .foregroundColor(showSearch ? primaryAccent : .white)
                                    .background(Color.white.opacity(0.05))
                                    .clipShape(Circle())
                                    .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 1))
                            }

                            }
                            // Queue/help remain available while the browser is showing.
                            // 3. Queue Button
                            Button(action: {
                                withAnimation(.spring()) {
                                    showQueue.toggle()
                                    showSearch = false
                                }
                            }) {
                                Image(systemName: "music.note.list")
                                    .font(.system(size: 14, weight: .semibold))
                                    .frame(width: 36, height: 36)
                                    .foregroundColor(showQueue ? secondaryAccent : .white)
                                    .background(Color.white.opacity(0.05))
                                    .clipShape(Circle())
                                    .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 1))
                                    .overlay(alignment: .topTrailing) {
                                        if displayQueueCount > 0 {
                                            Text("\(displayQueueCount)").font(.caption2.bold())
                                                .padding(4).background(primaryAccent).clipShape(Circle())
                                                .offset(x: 5, y: -5)
                                        }
                                    }
                            }

                            // 4. Info Button
                            Button(action: {
                                withAnimation(.spring()) {
                                    isInfoOpen.toggle()
                                }
                            }) {
                                Image(systemName: "questionmark")
                                    .font(.system(size: 14, weight: .semibold))
                                    .frame(width: 36, height: 36)
                                    .foregroundColor(isInfoOpen ? .white : .gray)
                                    .background(Color.white.opacity(0.05))
                                    .clipShape(Circle())
                                    .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 1))
                            }
                        }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(Color.clear)

                // Video Player Area (Only for Host)
                if partyViewModel.isHosting {
                    if showsPlayback, let currentSong = partyViewModel.partyState?.currentSong {

                        // Main Horizontal Layout
                        GeometryReader { geometry in
                            HStack(spacing: 20) {
                                // Left Side: Video
                                if !hideVideo {
                                    VStack {
                                        Spacer()
                                        ZStack {
                                            YouTubePlayerView(videoId: currentSong.videoId,
                                                              isPlaying: playerViewModel.isPlaying && !playerViewModel.isBuffering,
                                                              currentTime: playerViewModel.currentSongTime,
                                                              onError: { videoError = $0 },
                                                              onPlaybackRequested: { [weak player = playerViewModel] in player?.setPlaying($0) })
                                                .id(videoReloadID)
                                                .aspectRatio(16/9, contentMode: .fit)
                                                .cornerRadius(16)
                                                .shadow(color: Color.black.opacity(0.3), radius: 15, y: 5)

                                        }
                                        Spacer()
                                    }
                                    .frame(width: geometry.size.width * 0.45)
                                }

                                // Right Side: Lyrics
                                LyricsView(viewModel: playerViewModel)
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                        }

                        if isControlsVisible {
                            PlaybackControlsView(player: playerViewModel, hideVideo: $hideVideo,
                                                 previous: { roomCommand("previous") }, next: { roomCommand("next") })
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }

                    } else {
                        // Mirrors the web room's empty state: the browser is
                        // immediately available rather than hidden behind a button.
                        SongBrowserView(partyViewModel: partyViewModel, defaultCatalogOpen: true,
                                        heading: browserHeading)
                    }
                } else {
                    // Client Empty State
                    VStack(spacing: 20) {
                        Spacer()
                        Image(systemName: "iphone.radiowaves.left.and.right")
                            .font(.system(size: 60))
                            .foregroundColor(.gray.opacity(0.5))
                        Text("Connected to Room \(partyViewModel.roomCode)")
                            .font(.title2.bold())
                            .foregroundColor(.white)
                        Text("Look at the host screen for video and lyrics.")
                            .foregroundColor(.gray)

                        Button(action: {
                            withAnimation(.spring()) {
                                showSearch = true
                            }
                        }) {
                            Text("Search Songs")
                                .fontWeight(.bold)
                                .foregroundColor(.white)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 12)
                                .background(primaryAccent)
                                .cornerRadius(24)
                        }
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }

            // Overlays
            if showRecording {
                HStack {
                    Spacer()
                    VStack {
                        RecordingPanelView(model: recording, microphone: microphone, isPresented: $showRecording)
                            .padding(.top, 55).padding(.trailing, 12)
                        Spacer()
                    }
                }.zIndex(5)
            }
            if showQueue {
                GeometryReader { geometry in
                VStack {
                    Spacer()
                    QueueView(partyViewModel: partyViewModel, isPresented: $showQueue,
                              preparationStates: queueStates,
                              onRetry: retryPreparation)
                        .frame(height: max(180, geometry.size.height * 0.5))
                        .transition(.move(edge: .bottom))
                }
                }
                .zIndex(2)
                .edgesIgnoringSafeArea(.bottom)
            }

            if isMicExpanded {
                HStack {
                    Spacer()
                    VStack {
                        MicrophonePanelView(isMicExpanded: $isMicExpanded, viewModel: playerViewModel, microphone: microphone)
                            .padding(.top, 60)
                            .padding(.trailing, 20)
                        Spacer()
                    }
                }
                .zIndex(3)
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }

            if isInfoOpen {
                InfoModalView(isInfoOpen: $isInfoOpen)
                    .zIndex(4)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .navigationBarHidden(true)
        .background(OrientationLifecycle(mask: roomOrientation))
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 0) {
            if let error = partyViewModel.errorMessage {
                Text(error).font(.caption).foregroundStyle(.orange).padding(8)
            }
            if showsPlayback, let error = playerViewModel.lyricsError {
                HStack {
                    Text(error).font(.caption).lineLimit(3)
                    Spacer()
                    Button(playerViewModel.isRetryingLyrics ? "Retrying lyrics…" : "Retry lyrics") { playerViewModel.retryLyrics() }
                        .disabled(playerViewModel.isRetryingLyrics)
                }
                .padding(10).background(.black.opacity(0.8)).foregroundStyle(.orange)
            } else if showsPlayback, let videoError, !hideVideo {
                HStack {
                    Text(videoError).font(.caption).lineLimit(3)
                    Button("Retry video") { self.videoError = nil; videoReloadID = UUID() }
                }.padding(10).background(.black.opacity(0.8)).foregroundStyle(.orange)
            }
            }
        }
        .onChange(of: partyViewModel.partyState?.currentSong?.id, initial: true) { _, _ in
            playerViewModel.onTransport = { recording.update($0) }
            recording.transportSnapshot = { [weak player = playerViewModel] in
                player?.recordingTransport ?? RecordingTransport(jobID: nil, songTime: 0, playing: false, vocalsGain: 0)
            }
            let endedQueueID = partyViewModel.partyState?.currentSong?.queueId
            playerViewModel.onSongEnded = { [weak party = partyViewModel] in
                Task {
                    do { try await party?.sendCommand(action: "next", payload: ["expectedCurrentQueueId": endedQueueID as Any? ?? NSNull()]) }
                    catch { party?.errorMessage = error.localizedDescription }
                }
            }
            if let song = partyViewModel.partyState?.currentSong { playCurrentSong(song) }
            else { loadedSongID = nil; microphone.stop(); playerViewModel.stop() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                if recording.phase == .recording { recording.save(); showRecording = true }
                else if recording.phase == .preparing { recording.discard() }
                microphone.stop(); playerViewModel.handleBackground()
            }
            if phase == .active {
                DeviceOrientation.request(roomOrientation)
                if !playerViewModel.isReadyForPlayback, !playerViewModel.isProcessing,
                   let song = partyViewModel.partyState?.currentSong { playCurrentSong(song) }
            }
        }
        .onChange(of: playerViewModel.isProcessing) { _, _ in updateIdleTimer() }
        .onChange(of: playerViewModel.isPlaying) { _, _ in updateIdleTimer() }
        .onChange(of: recording.phase) { _, _ in updateIdleTimer() }
        .onChange(of: partyViewModel.partyState?.currentSong?.jobStatus?.lyricsRevision) { _, revision in
            if revision != nil, showsPlayback { playerViewModel.refreshLyrics() }
        }
        .onChange(of: playbackSnapshot) { _, value in
            if value == remoteAppliedSnapshot { remoteAppliedSnapshot = nil; return }
            guard showsPlayback else { return }
            partyViewModel.updateSettings(value.payload, sender: "host")
        }
        .onChange(of: partyViewModel.partyState?.settings) { _, settings in applyRemoteSettings(settings) }
        .onChange(of: showsPlayback) { _, ready in
            if ready { applyRemoteSettings(partyViewModel.partyState?.settings) }
        }
        .onChange(of: partyViewModel.partyState?.remoteCommand) { _, command in
            guard let command, command.timestamp > lastRemoteCommand else { return }
            lastRemoteCommand = command.timestamp
            switch command.action {
            case "next", "nextSong": roomCommand("next")
            case "previous", "previousSong": roomCommand("previous")
            case "alignStart": playerViewModel.lyricsOffset = playerViewModel.currentSongTime - (playerViewModel.lyricTimeline.lines.first?.start ?? 0)
            case "togglePlay": playerViewModel.togglePlayPause()
            case "toggleVideo": hideVideo.toggle()
            case "toggleMic": microphone.setEnabled(!microphone.enabled)
            default: break
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
            if playerViewModel.isProcessing { playerViewModel.cancelProcessing() }
        }
        .fullScreenCover(isPresented: $showSearch, onDismiss: { DeviceOrientation.request(roomOrientation) }) {
            SearchView(partyViewModel: partyViewModel, onDismiss: {
                showSearch = false
            })
        }
        .onDisappear {
            if !showSearch {
                recording.discard(); microphone.stop(); playerViewModel.stop()
                recording.transportSnapshot = nil
                playerViewModel.onTransport = nil; playerViewModel.onSongEnded = nil
            }
        }
    }

    private func playCurrentSong(_ partySong: PartySong) {
        loadedSongID = partySong.id
        videoError = nil
        let safeDuration = partySong.duration.isFinite ? Int(min(86_400, max(0, partySong.duration))) : 0
        let track = Track(videoId: partySong.videoId, title: partySong.title, artist: partySong.artist, duration: safeDuration, thumbnail: partySong.thumbnail)
        playerViewModel.playTrack(track, jobID: partySong.jobId)
    }

    private var showsPlayback: Bool {
        RoomReadiness.showsPlayback(currentID: partyViewModel.partyState?.currentSong?.id,
                                   loadedID: loadedSongID, audioReady: playerViewModel.isReadyForPlayback)
    }

    private var roomOrientation: UIInterfaceOrientationMask {
        showsPlayback && !showSearch ? .landscape : .allButUpsideDown
    }

    private var preparationSongs: [PartySong] {
        (partyViewModel.partyState?.currentSong.map { [$0] } ?? []) + (partyViewModel.partyState?.queue ?? [])
    }

    private var queueStates: [String: SongPreparationState] {
        guard let song = partyViewModel.partyState?.currentSong else { return [:] }
        if let error = playerViewModel.processingError {
            return [song.videoId: SongPreparationState(phase: .error, message: error)]
        }
        if song.jobStatus?.status == "ready", !showsPlayback {
            return [song.videoId: SongPreparationState(phase: .processing, progress: 0.98, message: "Loading cached audio…")]
        }
        return [:]
    }

    private var displayQueueCount: Int {
        (partyViewModel.partyState?.queue.count ?? 0) + (partyViewModel.partyState?.currentSong != nil && !showsPlayback ? 1 : 0)
    }

    private var browserHeading: String {
        if let song = partyViewModel.partyState?.currentSong, queueStates[song.videoId]?.phase == .error {
            return "Processing failed. Retry in the queue or try another song."
        }
        return displayQueueCount > 0 ? "Song processing! Add more to the queue" : "Search for a song to begin"
    }

    private func retryPreparation(_ id: String) {
        guard let song = preparationSongs.first(where: { $0.videoId == id }) else { return }
        Task {
            do {
                try await ServerSongService(baseURL: playerViewModel.serverURL).retry(
                    Track(videoId: song.videoId, title: song.title, artist: song.artist))
                if partyViewModel.partyState?.currentSong?.id == song.id { playCurrentSong(song) }
            } catch { partyViewModel.errorMessage = error.localizedDescription }
        }
    }

    private func updateIdleTimer() {
        UIApplication.shared.isIdleTimerDisabled = playerViewModel.isProcessing || playerViewModel.isPlaying || recording.phase == .recording || recording.phase == .exporting
    }

    private struct PlaybackSnapshot: Equatable {
        let playing: Bool
        let vocals: Float
        let vocalsEnabled: Bool
        let micEnabled: Bool
        let micVolume: Double
        let echo: Bool
        let autoTune: Bool
        let offset: Double
        let firstTime: Double
        let video: Bool
        var payload: [String: Any] {
            ["isPlaying": playing, "vocalsEnabled": vocalsEnabled, "vocalsVolume": Double(vocals),
             "micEnabled": micEnabled, "micVolume": micVolume, "echoOn": echo, "autoTuneOn": autoTune,
             "lyricsOffset": offset, "firstValidTime": firstTime, "isVideoVisible": video]
        }
    }
    private var playbackSnapshot: PlaybackSnapshot {
        PlaybackSnapshot(playing: playerViewModel.isPlaying, vocals: playerViewModel.vocalsVolume,
                         vocalsEnabled: playerViewModel.vocalsEnabled, micEnabled: microphone.enabled,
                         micVolume: microphone.volume, echo: microphone.echo, autoTune: microphone.autoTune,
                         offset: playerViewModel.lyricsOffset, firstTime: playerViewModel.lyricTimeline.lines.first?.start ?? 0, video: !hideVideo)
    }
    private func applyRemoteSettings(_ settings: PartySettings?) {
        guard showsPlayback, let settings, settings.lastUpdatedBy == "remote",
              let timestamp = settings.timestamp, timestamp > lastRemoteSettings else { return }
        lastRemoteSettings = timestamp
        if let playing = settings.isPlaying { playerViewModel.setPlaying(playing) }
        if let visible = settings.isVideoVisible { hideVideo = !visible }
        if let offset = settings.lyricsOffset { playerViewModel.lyricsOffset = offset }
        if let enabled = settings.vocalsEnabled { playerViewModel.vocalsEnabled = enabled }
        if let volume = settings.vocalsVolume { playerViewModel.vocalsVolume = Float(min(1, max(0, volume))) }
        if let volume = settings.micVolume { microphone.volume = min(1, max(0, volume)) }
        if let enabled = settings.echoOn { microphone.echo = enabled }
        if let enabled = settings.autoTuneOn { microphone.autoTune = enabled }
        if let enabled = settings.micEnabled { microphone.setEnabled(enabled) }
        remoteAppliedSnapshot = playbackSnapshot
    }
    private func roomCommand(_ action: String) {
        Task {
            do { try await partyViewModel.sendCommand(action: action, payload: [:]) }
            catch { partyViewModel.errorMessage = error.localizedDescription }
        }
    }

    private func formatTime(_ time: Double) -> String {
        guard !time.isNaN && time.isFinite else { return "0:00" }
        let bounded = Int(min(86_400, max(0, time)))
        let minutes = bounded / 60
        let seconds = bounded % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}
