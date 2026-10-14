import SwiftUI

struct SearchView: View {
    let partyViewModel: PartyViewModel?
    let onDismiss: (() -> Void)?
    let managesOrientation: Bool

    init(partyViewModel: PartyViewModel? = nil, onDismiss: (() -> Void)? = nil, managesOrientation: Bool = true) {
        self.partyViewModel = partyViewModel
        self.onDismiss = onDismiss
        self.managesOrientation = managesOrientation
    }

    var body: some View {
        ZStack {
            KaraokeBackground()
            VStack(spacing: 0) {
                if onDismiss != nil {
                    HStack {
                        Spacer()
                        Button { onDismiss?() } label: {
                            Image(systemName: "xmark")
                                .font(.subheadline.weight(.bold))
                                .frame(width: 36, height: 36)
                                .background(.white.opacity(0.08))
                                .clipShape(Circle())
                        }
                        .foregroundStyle(.white)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                }
                SongBrowserView(partyViewModel: partyViewModel, defaultCatalogOpen: true, onQueued: onDismiss)
            }
        }
        .navigationBarHidden(true)
        .background(OrientationLifecycle(mask: managesOrientation ? .allButUpsideDown : .landscape))
    }
}

/// Web-style search and catalog browser, usable in both portrait and landscape.
struct SongBrowserView: View {
    let partyViewModel: PartyViewModel?
    let defaultCatalogOpen: Bool
    let onQueued: (() -> Void)?
    let heading: String?

    @StateObject private var searchModel = SongSearchModel()
    @StateObject private var voice = VoiceSearchModel()
    @Environment(\.scenePhase) private var scenePhase
    @State private var query = ""
    @State private var catalog: [Track] = []
    @State private var isLoadingCatalog = true
    @State private var isCatalogOpen: Bool
    @State private var browserError: String?
    @State private var isQueuing = false
    @FocusState private var isSearchFocused: Bool

    private let primary = Color(red: 139 / 255, green: 92 / 255, blue: 246 / 255)
    private let secondary = Color(red: 236 / 255, green: 72 / 255, blue: 153 / 255)
    private let serverURL = ServerConfiguration.web

    init(partyViewModel: PartyViewModel?, defaultCatalogOpen: Bool, onQueued: (() -> Void)? = nil, heading: String? = nil) {
        self.partyViewModel = partyViewModel
        self.defaultCatalogOpen = defaultCatalogOpen
        self.onQueued = onQueued
        self.heading = heading
        _isCatalogOpen = State(initialValue: defaultCatalogOpen)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if heading != "" {
            Text(heading ?? (searchModel.hasSearched ? "Search results" : "Search for a song to begin"))
                .font(.title3.weight(.bold))
                .foregroundStyle(.white.opacity(0.7))
            }
            searchField

            if let error = voice.error ?? searchModel.error ?? browserError {
                Text(error).font(.caption).foregroundStyle(.orange)
            }

            if searchModel.isSearching {
                VStack {
                    ProgressView().tint(primary).padding(.vertical, 30)
                    Text(searchModel.isAskingDJ ? "The DJ is reading the room..." : "Searching YouTube...")
                        .foregroundStyle(.secondary).font(.subheadline)
                }.frame(maxWidth: .infinity)
            } else if let response = searchModel.djResponse {
                djCard(response)
            } else if !searchModel.hasSearched {
                catalogSection
            } else if searchModel.results.isEmpty {
                Text("No results found. Try a different search.")
                    .font(.subheadline).foregroundStyle(.secondary).padding(.vertical, 24)
            } else {
                resultsList(searchModel.results)
            }
        }
        .frame(maxWidth: 640, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .onAppear(perform: loadCatalog)
        .onChange(of: voice.transcript) { _, text in query = text }
        .onChange(of: scenePhase) { _, phase in if phase != .active { voice.stop() } }
        .onDisappear { voice.stop() }
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(.white.opacity(0.55))
            TextField("Search or ask the DJ...", text: $query)
                .focused($isSearchFocused)
                .foregroundStyle(.white)
                .textInputAutocapitalization(.never)
                .submitLabel(.search)
                .onSubmit { search() }
            if !query.isEmpty {
                Button {
                    query = ""
                    searchModel.clear()
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.white.opacity(0.45))
                }
            }
            Button { voice.toggle() } label: {
                Image(systemName: voice.isListening ? "mic.fill" : "mic")
                    .foregroundStyle(voice.isListening ? .red : .gray).frame(width: 28, height: 36)
            }.accessibilityLabel(voice.isListening ? "Stop voice search" : "Voice search")
            Button("Go", action: search)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .padding(.vertical, 9)
                .background(LinearGradient(colors: [primary, secondary], startPoint: .leading, endPoint: .trailing))
                .clipShape(Capsule())
                .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || searchModel.isSearching)
        }
        .padding(.leading, 16)
        .padding(.trailing, 5)
        .padding(.vertical, 5)
        .background(.white.opacity(0.07))
        .overlay(Capsule().stroke(isSearchFocused ? primary : .white.opacity(0.14)))
        .clipShape(Capsule())
    }

    private var catalogSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { isCatalogOpen.toggle() }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "music.note").foregroundStyle(primary)
                    Text("Ready to Sing").font(.headline)
                    Spacer()
                    Text(isLoadingCatalog ? "Loading..." : "\(catalog.count) songs")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.55))
                    Image(systemName: isCatalogOpen ? "chevron.down" : "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white.opacity(0.55))
                }
                .foregroundStyle(.white)
            }
            .buttonStyle(.plain)

            if isCatalogOpen {
                if isLoadingCatalog {
                    ProgressView().tint(primary).frame(maxWidth: .infinity).padding(.vertical, 28)
                } else if catalog.isEmpty {
                    Text("Search for any song to add it to the queue.")
                        .foregroundStyle(.white.opacity(0.48))
                        .padding(.vertical, 18)
                } else {
                    resultsList(catalog, cached: true)
                }
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }

    private func resultsList(_ tracks: [Track], cached: Bool = false) -> some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(tracks) { track in
                    Button { queue(track) } label: { SongResultRow(track: track, cached: cached) }
                        .buttonStyle(.plain)
                        .disabled(isQueuing)
                }
            }
        }
        .frame(minHeight: 0, maxHeight: .infinity)
        .scrollDismissesKeyboard(.interactively)
    }

    private func search() {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        voice.stop()
        searchModel.search(trimmed, context: partyViewModel?.djContext)
    }

    private func djCard(_ response: DJResponse) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Label("Session DJ", systemImage: "sparkles").font(.headline)
                Text(response.message).font(.subheadline)
                ForEach(Array((response.recommended_queries ?? []).enumerated()), id: \.offset) { _, recommendation in
                    Button(recommendation) {
                        query = recommendation
                        searchModel.search(recommendation, forceYouTube: true)
                    }
                    .font(.subheadline).padding(10).background(primary.opacity(0.2)).clipShape(Capsule())
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20).background(primary.opacity(0.1))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(primary.opacity(0.3)))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }.foregroundStyle(.white)
    }

    private func queue(_ track: Track) {
        guard let partyViewModel else {
            browserError = "Create or join a room before adding a song."
            return
        }
        guard !isQueuing else { return }
        isQueuing = true
        browserError = nil
        Task {
            defer { isQueuing = false }
            let song: [String: Any] = [
                "videoId": track.videoId,
                "title": track.title,
                "artist": track.artist,
                "art": track.thumbnail
            ]
            do {
                try await partyViewModel.sendCommand(action: "add", payload: ["song": song])
                query = ""
                searchModel.clear()
                isSearchFocused = false
                onQueued?()
            } catch { browserError = "Could not add song: \(error.localizedDescription)" }
        }
    }

    private func loadCatalog() {
        guard isLoadingCatalog, let url = URL(string: "\(serverURL)/api/catalog") else { return }
        URLSession.shared.dataTask(with: url) { data, response, error in
            let decoded = data.flatMap { try? JSONDecoder().decode([Track].self, from: $0) } ?? []
            DispatchQueue.main.async {
                catalog = decoded
                isLoadingCatalog = false
                if error != nil || (response as? HTTPURLResponse)?.statusCode != 200 {
                    browserError = "Could not load Ready to Sing. Check the server connection."
                }
            }
        }.resume()
    }
}

private struct SongResultRow: View {
    let track: Track
    var cached = false

    var body: some View {
        HStack(spacing: 14) {
            AsyncImage(url: URL(string: track.thumbnail)) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Color.white.opacity(0.08)
                    .overlay(Image(systemName: "music.note").foregroundStyle(.white.opacity(0.4)))
            }
            .frame(width: 58, height: 42)
            .clipShape(RoundedRectangle(cornerRadius: 5))
            VStack(alignment: .leading, spacing: 3) {
                Text(track.title).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(1)
                Text(track.artist).font(.caption).foregroundStyle(.white.opacity(0.58)).lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.white.opacity(0.5))
        }
        .padding(11)
        .background(.white.opacity(0.05))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.13)))
        .overlay(alignment: .leading) {
            if cached { Rectangle().fill(Color(red: 139/255, green: 92/255, blue: 246/255)).frame(width: 3) }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct KaraokeBackground: View {
    var body: some View {
        RadialGradient(
            colors: [Color(red: 16 / 255, green: 8 / 255, blue: 36 / 255), Color(red: 10 / 255, green: 5 / 255, blue: 20 / 255)],
            center: .topLeading,
            startRadius: 50,
            endRadius: 800
        )
        .ignoresSafeArea()
    }
}
