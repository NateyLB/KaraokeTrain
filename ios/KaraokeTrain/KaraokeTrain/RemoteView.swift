import SwiftUI

/// Portrait companion for a web or native karaoke host. This intentionally mirrors
/// the web app's /remote/[id] experience instead of reusing the landscape host UI.
struct RemoteView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var partyViewModel: PartyViewModel
    @State private var showSearch = false
    @State private var showQueue = false
    @State private var showInfo = false
    @State private var remoteVocals = 1.0
    @State private var adjustingVocals = false

    private let background = Color(red: 10 / 255, green: 5 / 255, blue: 20 / 255)
    private let primary = Color(red: 139 / 255, green: 92 / 255, blue: 246 / 255)
    private let secondary = Color(red: 236 / 255, green: 72 / 255, blue: 153 / 255)

    var body: some View {
        ZStack {
            RadialGradient(
                colors: [Color(red: 16 / 255, green: 8 / 255, blue: 36 / 255), background],
                center: .topLeading,
                startRadius: 40,
                endRadius: 700
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    header
                    SongBrowserView(partyViewModel: partyViewModel, defaultCatalogOpen: false, heading: "")
                        .frame(height: 340)
                    VStack(spacing: 20) {
                        controls
                        Divider().overlay(.white.opacity(0.1))
                        mixingControls
                    }
                    .padding(20).background(.white.opacity(0.04))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    if let error = partyViewModel.errorMessage { Text(error).font(.caption).foregroundStyle(.orange) }
                    Spacer(minLength: 100)
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
            }
            if showInfo { InfoModalView(isInfoOpen: $showInfo) }

            VStack {
                Spacer()
                queueHandle
            }
        }
        .navigationBarBackButtonHidden()
        .onAppear {
            DeviceOrientation.request(.portrait)
            remoteVocals = partyViewModel.partyState?.settings?.vocalsVolume ?? 1
        }
        .onChange(of: partyViewModel.partyState?.settings?.vocalsVolume) { _, value in
            if !adjustingVocals, let value { remoteVocals = min(1, max(0, value)) }
        }
        .sheet(isPresented: $showSearch) {
            SearchView(partyViewModel: partyViewModel) {
                showSearch = false
            }
        }
        .sheet(isPresented: $showQueue) {
            QueueView(partyViewModel: partyViewModel, isPresented: $showQueue)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private var header: some View {
        HStack {
            Button {
                partyViewModel.leaveParty()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.headline.weight(.bold))
                    .frame(width: 40, height: 40)
                    .background(.white.opacity(0.07))
                    .clipShape(Circle())
            }

            Spacer()
            Text(partyViewModel.connectionStatus == .connected ? "CONNECTED TO ROOM" : "CONNECTING TO ROOM")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white.opacity(0.6))
            Text(partyViewModel.roomCode)
                .font(.headline.weight(.heavy))
                .tracking(2)
                .foregroundStyle(primary)
            Spacer()
            Button { showInfo = true } label: { Image(systemName: "questionmark.circle").frame(width: 40, height: 40) }
        }
        .foregroundStyle(.white)
    }

    private var nowPlaying: some View {
        VStack(spacing: 8) {
            Image(systemName: "music.note")
                .font(.system(size: 28))
                .foregroundStyle(secondary)
            Text(partyViewModel.partyState?.currentSong?.title ?? "Nothing playing")
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
                .lineLimit(1)
            Text(partyViewModel.partyState?.currentSong?.artist ?? "Add a song to get started")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.58))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .padding(.horizontal, 18)
        .background(.white.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(.white.opacity(0.1)))
    }

    private var controls: some View {
        HStack(spacing: 28) {
            commandButton("backward.end.fill", label: "Previous") {
                sendRemoteCommand("previous")
            }
            Button {
                let nextValue = !(partyViewModel.partyState?.settings?.isPlaying ?? false)
                partyViewModel.updateSettings(["isPlaying": nextValue], sender: "remote")
            } label: {
                Image(systemName: (partyViewModel.partyState?.settings?.isPlaying ?? false) ? "pause.fill" : "play.fill")
                    .font(.title2)
                    .frame(width: 64, height: 64)
                    .background(LinearGradient(colors: [primary, secondary], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .clipShape(Circle())
                    .shadow(color: primary.opacity(0.5), radius: 12)
            }
            .accessibilityLabel("Play or pause")
            .disabled(partyViewModel.partyState?.currentSong?.jobStatus?.status != "ready")
            commandButton("forward.end.fill", label: "Next") {
                sendRemoteCommand("next")
            }
        }
        .foregroundStyle(.white)
        .padding(.vertical, 8)
    }

    private var addSong: some View {
        Button {
            showSearch = true
        } label: {
            Label("Search or ask the DJ", systemImage: "magnifyingglass")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(.white.opacity(0.07))
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(primary.opacity(0.5)))
        }
        .foregroundStyle(.white)
    }

    private var mixingControls: some View {
        VStack(spacing: 16) {
            Label("Mixing Console", systemImage: "slider.horizontal.3").font(.subheadline.bold())
            HStack {
                Button((partyViewModel.partyState?.settings?.isVideoVisible ?? true) ? "Hide Video" : "Show Video") {
                    partyViewModel.updateSettings(["isVideoVisible": !(partyViewModel.partyState?.settings?.isVideoVisible ?? true)], sender: "remote")
                }
                Button((partyViewModel.partyState?.settings?.vocalsEnabled ?? true) ? "Vocals On" : "Vocals Off") {
                    let enable = !(partyViewModel.partyState?.settings?.vocalsEnabled ?? true)
                    partyViewModel.updateSettings(["vocalsEnabled": enable, "vocalsVolume": enable ? 1.0 : 0.0], sender: "remote")
                }
            }.buttonStyle(.bordered).tint(primary).font(.caption.bold())
            HStack {
                Text("VOC").font(.caption).foregroundStyle(.gray)
                Slider(value: Binding(get: { remoteVocals }, set: {
                    remoteVocals = $0
                    partyViewModel.updateSettings(["vocalsVolume": $0, "vocalsEnabled": $0 > 0], sender: "remote")
                }), in: 0...1, onEditingChanged: { adjustingVocals = $0 })
                    .tint(secondary)
            }
            HStack {
                Text("Lyrics Sync").font(.caption)
                Button("Align Start") { sendRemoteCommand("alignStart") }.font(.caption.bold())
                Spacer()
                Button("−") { changeOffset(-0.5) }
                Text(String(format: "%.1fs", (partyViewModel.partyState?.settings?.lyricsOffset ?? 0) + (partyViewModel.partyState?.settings?.firstValidTime ?? 0)))
                    .font(.caption.monospacedDigit())
                Button("+") { changeOffset(0.5) }
            }
        }.foregroundStyle(.white)
    }

    private func changeOffset(_ change: Double) {
        partyViewModel.updateSettings(["lyricsOffset": (partyViewModel.partyState?.settings?.lyricsOffset ?? 0) + change], sender: "remote")
    }

    private var queueHandle: some View {
        Button {
            showQueue = true
        } label: {
            HStack {
                Label("Up Next", systemImage: "clock")
                Spacer()
                Text("\(partyViewModel.partyState?.queue.count ?? 0)")
                    .foregroundStyle(.white.opacity(0.6))
                Image(systemName: "chevron.up")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 18)
            .background(background.opacity(0.96))
        }
        .buttonStyle(.plain)
    }

    private func commandButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.title3)
                .frame(width: 44, height: 44)
                .background(.white.opacity(0.07))
                .clipShape(Circle())
        }
        .accessibilityLabel(label)
    }

    private func sendRemoteCommand(_ command: String) {
        Task {
            let queueAction = ["next", "previous"].contains(command)
            do { try await partyViewModel.sendCommand(
                action: queueAction ? command : "remoteControl",
                payload: queueAction ? [:] : ["command": command]
            ) } catch { partyViewModel.errorMessage = error.localizedDescription }
        }
    }
}
