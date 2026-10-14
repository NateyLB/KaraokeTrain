import Foundation
import Combine

nonisolated struct JobStatus: Codable {
    let status: String
    let progress: Double?
}

/// Represents a song in the queue as returned by the Next.js API
nonisolated struct PartySong: Codable, Identifiable {
    var id: String { "\(jobId)-\(addedAt)" }
    let videoId: String
    let title: String
    let artist: String
    let thumbnail: String
    let duration: Double
    let jobId: String
    let addedAt: Double
    let isNativeHost: Bool?
    let jobStatus: JobStatus?

    private enum CodingKeys: String, CodingKey {
        case videoId, title, artist, thumbnail, art, duration, jobId, addedAt, isNativeHost, jobStatus
    }

    nonisolated init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        videoId = try values.decode(String.self, forKey: .videoId)
        title = try values.decode(String.self, forKey: .title)
        artist = try values.decode(String.self, forKey: .artist)
        thumbnail = try values.decodeIfPresent(String.self, forKey: .thumbnail)
            ?? values.decodeIfPresent(String.self, forKey: .art)
            ?? ""
        duration = try values.decodeIfPresent(Double.self, forKey: .duration) ?? 0
        jobId = try values.decodeIfPresent(String.self, forKey: .jobId) ?? videoId
        addedAt = try values.decodeIfPresent(Double.self, forKey: .addedAt) ?? 0
        isNativeHost = try values.decodeIfPresent(Bool.self, forKey: .isNativeHost)
        jobStatus = try values.decodeIfPresent(JobStatus.self, forKey: .jobStatus)
    }

    nonisolated func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(videoId, forKey: .videoId)
        try values.encode(title, forKey: .title)
        try values.encode(artist, forKey: .artist)
        try values.encode(thumbnail, forKey: .art)
        try values.encode(duration, forKey: .duration)
        try values.encode(jobId, forKey: .jobId)
        try values.encode(addedAt, forKey: .addedAt)
        try values.encodeIfPresent(isNativeHost, forKey: .isNativeHost)
        try values.encodeIfPresent(jobStatus, forKey: .jobStatus)
    }
}

/// Represents the overall Party state from the Next.js API
nonisolated struct PartyState: Codable {
    let id: String
    let isNativeHost: Bool
    let currentSong: PartySong?
    let queue: [PartySong]
    let updatedAt: Double?
    let settings: PartySettings?
    let history: [PartySong]?
    let remoteCommand: PartyRemoteCommand?
}

nonisolated struct PartyRemoteCommand: Codable, Equatable {
    let action: String
    let timestamp: Double
}

nonisolated struct PartySettings: Codable, Equatable {
    let isPlaying: Bool?
    let lyricsOffset: Double?
    let firstValidTime: Double?
    let vocalsEnabled: Bool?
    let vocalsVolume: Double?
    let isVideoVisible: Bool?
    let lastUpdatedBy: String?
    let timestamp: Double?

    enum CodingKeys: String, CodingKey {
        case isPlaying, lyricsOffset, firstValidTime, vocalsEnabled, vocalsVolume, isVideoVisible, lastUpdatedBy, timestamp
    }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        func number(_ key: CodingKeys) -> Double? {
            let value = (try? values.decode(Double.self, forKey: key)) ?? (try? values.decode(String.self, forKey: key)).flatMap(Double.init)
            return value.flatMap { $0.isFinite ? $0 : nil }
        }
        isPlaying = try values.decodeIfPresent(Bool.self, forKey: .isPlaying)
        vocalsEnabled = try values.decodeIfPresent(Bool.self, forKey: .vocalsEnabled)
        isVideoVisible = try values.decodeIfPresent(Bool.self, forKey: .isVideoVisible)
        lastUpdatedBy = try values.decodeIfPresent(String.self, forKey: .lastUpdatedBy)
        lyricsOffset = number(.lyricsOffset); firstValidTime = number(.firstValidTime)
        vocalsVolume = number(.vocalsVolume); timestamp = number(.timestamp)
    }
}

@MainActor
class PartyViewModel: ObservableObject {
    var djContext: Data? { try? JSONEncoder().encode(partyState) }
    @Published var partyState: PartyState?
    @Published var roomCode: String = ""
    @Published var errorMessage: String? = nil
    @Published var isHosting: Bool = false
    @Published var isConnecting = false
    private var pollingInFlight = false
    private var settingsTask: Task<Void, Never>?
    private var pendingSettings: [String: Any] = [:]

    func updateSettings(_ settings: [String: Any], sender: String) {
        settingsTask?.cancel()
        pendingSettings.merge(settings) { _, new in new }
        let room = roomCode
        settingsTask = Task {
            do {
                try await Task.sleep(for: .milliseconds(300))
                guard roomCode == room else { return }
                let pending = pendingSettings
                pendingSettings = [:]
                try await sendCommand(action: "updateSettings", payload: ["sender": sender, "settings": pending])
            } catch {
                if !Task.isCancelled { errorMessage = error.localizedDescription }
            }
        }
    }

    // The IP address of the Mac running the Next.js server
    // (We can move this to an Info.plist or config file later!)
    /// Override KaraokeServerURL in Info.plist for another dev machine or deployment.
    private let serverBaseURL = Bundle.main.object(forInfoDictionaryKey: "KaraokeServerURL") as? String
        ?? "http://10.0.0.60:3000"

    private var pollingTimer: AnyCancellable?

    /// Generates a random 4-character alphanumeric room code
    private func generateRoomCode() -> String {
        let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return String((0..<4).map { _ in letters.randomElement()! })
    }

    /// Don't navigate to a room until both services and native-host registration work.
    func hostParty() async -> Bool {
        guard !isConnecting else { return false }
        leaveParty()
        isConnecting = true
        defer { isConnecting = false }
        roomCode = generateRoomCode()
        isHosting = true
        errorMessage = nil
        do {
            let backend = Bundle.main.object(forInfoDictionaryKey: "KaraokeBackendURL") as? String ?? "http://10.0.0.60:4000"
            guard let url = URL(string: backend + "/health") else { throw URLError(.badURL) }
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 12
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let health = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  health["service"] as? String == "karaoke-downloader" else {
                throw StemSeparatorError.invalid("The backend is not ready. Run npm start from the project folder to start both services.")
            }
            try await sendCommand(action: "setNativeHost", payload: ["isNative": true])
            guard partyState?.isNativeHost == true else { throw URLError(.badServerResponse) }
            startPolling()
            return true
        } catch {
            errorMessage = "Could not connect to the karaoke servers. Run npm start on the Mac, check Wi-Fi and the server addresses in Info.plist.\n\(error.localizedDescription)"
            leaveParty()
            return false
        }
    }

    func joinParty(code: String) async -> Bool {
        guard !isConnecting else { return false }
        let normalized = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard normalized.range(of: #"^[A-Z0-9]{4}$"#, options: .regularExpression) != nil else {
            errorMessage = "Enter a four-character room code."
            return false
        }
        leaveParty()
        isConnecting = true
        defer { isConnecting = false }
        roomCode = normalized
        isHosting = false
        errorMessage = nil
        await fetchPartyState()
        guard partyState != nil else {
            errorMessage = errorMessage ?? "Could not connect to this room. Check the web server and room code."
            leaveParty()
            return false
        }
        startPolling()
        return true
    }

    /// Leaves the current party and stops polling
    func leaveParty() {
        settingsTask?.cancel(); settingsTask = nil
        pendingSettings = [:]
        pollingTimer?.cancel()
        pollingTimer = nil
        self.roomCode = ""
        self.partyState = nil
        self.isHosting = false
    }

    /// Polls the Next.js backend every 2 seconds
    private func startPolling() {
        pollingTimer?.cancel()
        pollingTimer = Timer.publish(every: 2.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                Task {
                    await self?.fetchPartyState()
                }
            }
    }

    /// Fetches the latest queue and state from the backend
    private func fetchPartyState() async {
        guard !roomCode.isEmpty, !pollingInFlight else { return }
        pollingInFlight = true
        defer { pollingInFlight = false }
        let requestedRoom = roomCode
        guard let url = URL(string: "\(serverBaseURL)/api/party?id=\(roomCode)") else { return }

        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 12

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }

            let decoder = JSONDecoder()
            let state = try decoder.decode(PartyState.self, from: data)
            guard roomCode == requestedRoom else { return }
            if (state.updatedAt ?? 0) >= (partyState?.updatedAt ?? 0) { partyState = state }
            errorMessage = nil

        } catch {
            guard roomCode == requestedRoom else { return }
            errorMessage = "Room connection lost: \(error.localizedDescription)"
        }
    }

    /// Sends a command (like add, next, remove) to the backend
    func sendCommand(action: String, payload: [String: Any]) async throws {
        guard !roomCode.isEmpty else { throw URLError(.notConnectedToInternet) }
        if action == "add", isHosting, partyState?.isNativeHost != true {
            throw StemSeparatorError.invalid("The native room is still connecting. Try again once connected.")
        }
        let requestedRoom = roomCode
        guard let url = URL(string: "\(serverBaseURL)/api/party") else { throw URLError(.badURL) }

        var body = payload
        body["action"] = action
        body["id"] = roomCode

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            throw StemSeparatorError.invalid(json?["error"] as? String ?? "The web server rejected the room command.")
        }
        let state = try JSONDecoder().decode(PartyState.self, from: data)
        if roomCode == requestedRoom, (state.updatedAt ?? 0) >= (partyState?.updatedAt ?? 0) { partyState = state }
    }
}
