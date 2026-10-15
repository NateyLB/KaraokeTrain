import Foundation
import Combine

/// Revision tokens are opaque: current servers send "engine:timestamp" strings,
/// while older cached metadata may contain JSON numbers.
nonisolated struct LyricsRevision: Codable, Equatable {
    let rawValue: String

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if let text = try? value.decode(String.self) {
            rawValue = text
        } else if let integer = try? value.decode(Int64.self) {
            rawValue = String(integer)
        } else {
            rawValue = String(try value.decode(Double.self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        try value.encode(rawValue)
    }
}

nonisolated struct JobStatus: Codable {
    let status: String
    let progress: Double?
    let message: String?
    let error: String?
    let cached: Bool?
    let lyricsRevision: LyricsRevision?
}

/// Represents a song in the queue as returned by the Next.js API
nonisolated struct PartySong: Codable, Identifiable {
    var id: String { queueId ?? "\(jobId)-\(addedAt)" }
    let queueId: String?
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
        case videoId, title, artist, thumbnail, art, duration, jobId, queueId, addedAt, isNativeHost, jobStatus
    }

    nonisolated init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        videoId = try values.decode(String.self, forKey: .videoId)
        queueId = try values.decodeIfPresent(String.self, forKey: .queueId)
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
        try values.encodeIfPresent(queueId, forKey: .queueId)
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
    let isNativeHost: Bool?
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
    let micEnabled: Bool?
    let micVolume: Double?
    let echoOn: Bool?
    let autoTuneOn: Bool?
    let isVideoVisible: Bool?
    let lastUpdatedBy: String?
    let timestamp: Double?

    enum CodingKeys: String, CodingKey {
        case isPlaying, lyricsOffset, firstValidTime, vocalsEnabled, vocalsVolume, micEnabled, micVolume, echoOn, autoTuneOn, isVideoVisible, lastUpdatedBy, timestamp
    }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        func number(_ key: CodingKeys) -> Double? {
            let value = (try? values.decode(Double.self, forKey: key)) ?? (try? values.decode(String.self, forKey: key)).flatMap(Double.init)
            return value.flatMap { $0.isFinite ? $0 : nil }
        }
        isPlaying = try values.decodeIfPresent(Bool.self, forKey: .isPlaying)
        vocalsEnabled = try values.decodeIfPresent(Bool.self, forKey: .vocalsEnabled)
        micEnabled = try values.decodeIfPresent(Bool.self, forKey: .micEnabled)
        echoOn = try values.decodeIfPresent(Bool.self, forKey: .echoOn)
        autoTuneOn = try values.decodeIfPresent(Bool.self, forKey: .autoTuneOn)
        isVideoVisible = try values.decodeIfPresent(Bool.self, forKey: .isVideoVisible)
        lastUpdatedBy = try values.decodeIfPresent(String.self, forKey: .lastUpdatedBy)
        lyricsOffset = number(.lyricsOffset); firstValidTime = number(.firstValidTime)
        vocalsVolume = number(.vocalsVolume); timestamp = number(.timestamp)
        micVolume = number(.micVolume)
    }
}

@MainActor
class PartyViewModel: ObservableObject {
    enum ConnectionStatus { case disconnected, connecting, connected, reconnecting }
    var djContext: Data? { try? JSONEncoder().encode(partyState) }
    @Published var partyState: PartyState?
    @Published var roomCode: String = ""
    @Published var errorMessage: String? = nil
    @Published var isHosting: Bool = false
    @Published var isConnecting = false
    @Published private(set) var connectionStatus: ConnectionStatus = .disconnected
    private var settingsTask: Task<Void, Never>?
    private var pendingSettings: [String: Any] = [:]
    private var connectionGeneration = UUID()
    private var eventsTask: Task<Void, Never>?
    private let serverBaseURL: String
    private let session: URLSession

    init(serverBaseURL: String = ServerConfiguration.web, session: URLSession = .shared) {
        self.serverBaseURL = serverBaseURL
        self.session = session
    }

    func updateSettings(_ settings: [String: Any], sender: String) {
        settingsTask?.cancel()
        pendingSettings.merge(settings) { _, new in new }
        let room = roomCode
        let generation = connectionGeneration
        settingsTask = Task {
            do {
                try await Task.sleep(for: .milliseconds(300))
                guard roomCode == room, connectionGeneration == generation else { return }
                let pending = pendingSettings
                pendingSettings = [:]
                try await sendCommand(action: "updateSettings", payload: ["sender": sender, "settings": pending])
            } catch {
                if !Task.isCancelled { errorMessage = error.localizedDescription }
            }
        }
    }

    /// Generates a random 4-character alphanumeric room code
    private func generateRoomCode() -> String {
        let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return String((0..<4).map { _ in letters.randomElement()! })
    }

    /// Hosts use the same room and server-owned processing contract as the web client.
    func hostParty() async -> Bool {
        guard !isConnecting else { return false }
        leaveParty()
        isConnecting = true
        defer { isConnecting = false }
        roomCode = generateRoomCode()
        isHosting = true
        errorMessage = nil
        await fetchPartyState()
        guard partyState != nil else {
            errorMessage = errorMessage ?? "Could not connect to the karaoke server. Check the server address and network."
            leaveParty()
            return false
        }
        startEvents()
        return true
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
        startEvents()
        return true
    }

    /// Leaving invalidates all earlier responses, even if the same room is rejoined.
    func leaveParty() {
        settingsTask?.cancel(); settingsTask = nil
        pendingSettings = [:]
        connectionGeneration = UUID()
        eventsTask?.cancel(); eventsTask = nil
        connectionStatus = .disconnected
        self.roomCode = ""
        self.partyState = nil
        self.isHosting = false
    }

    /// Shares the web room's SSE contract; no polling delay or overlapping requests.
    private func startEvents() {
        eventsTask?.cancel()
        let room = roomCode, generation = connectionGeneration, session = session
        guard let url = URL(string: "\(serverBaseURL)/api/party/stream?id=\(room)") else { return }
        connectionStatus = .connecting
        eventsTask = Task { [weak self] in
            while !Task.isCancelled, self?.connectionGeneration == generation {
                do {
                    var request = URLRequest(url: url)
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    request.cachePolicy = .reloadIgnoringLocalCacheData
                    request.timeoutInterval = 3600
                    let (bytes, response) = try await session.bytes(for: ServerAccess.authorize(request))
                    guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
                    var decoder = ServerEventDecoder()
                    for try await byte in bytes {
                        try Task.checkCancellation()
                        guard self?.connectionGeneration == generation else { return }
                        if let data = try decoder.consume(byte) {
                            let state = try JSONDecoder().decode(PartyState.self, from: data)
                            guard state.id == room else { throw URLError(.badServerResponse) }
                            self?.accept(state)
                            self?.connectionStatus = .connected
                            self?.errorMessage = nil
                        }
                    }
                } catch {
                    guard !Task.isCancelled, self?.connectionGeneration == generation else { return }
                    self?.errorMessage = "Room connection lost. Reconnecting…"
                }
                guard !Task.isCancelled, self?.connectionGeneration == generation else { return }
                self?.connectionStatus = .reconnecting
                do { try await Task.sleep(for: .seconds(2)) } catch { return }
            }
        }
    }

    private func accept(_ state: PartyState) {
        guard state.id == roomCode else { return }
        if (state.updatedAt ?? 0) >= (partyState?.updatedAt ?? 0) { partyState = state }
    }

    /// Fetches the latest queue and state from the backend
    private func fetchPartyState() async {
        guard !roomCode.isEmpty else { return }
        let generation = connectionGeneration
        let requestedRoom = roomCode
        guard let url = URL(string: "\(serverBaseURL)/api/party?id=\(roomCode)") else { return }

        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 12

            let (data, response) = try await session.data(for: ServerAccess.authorize(request))
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }

            let decoder = JSONDecoder()
            let state = try decoder.decode(PartyState.self, from: data)
            guard roomCode == requestedRoom, connectionGeneration == generation else { return }
            accept(state)
            errorMessage = nil

        } catch {
            guard roomCode == requestedRoom, connectionGeneration == generation else { return }
            errorMessage = "Room connection lost: \(error.localizedDescription)"
        }
    }

    /// Sends a command (like add, next, remove) to the backend
    func sendCommand(action: String, payload: [String: Any]) async throws {
        guard !roomCode.isEmpty else { throw URLError(.notConnectedToInternet) }
        let requestedRoom = roomCode
        let generation = connectionGeneration
        guard let url = URL(string: "\(serverBaseURL)/api/party") else { throw URLError(.badURL) }

        var body = payload
        body["action"] = action
        body["id"] = roomCode
        if ["next", "previous"].contains(action), body["expectedCurrentQueueId"] == nil {
            body["expectedCurrentQueueId"] = partyState?.currentSong?.queueId as Any? ?? NSNull()
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: ServerAccess.authorize(request))
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            if (response as? HTTPURLResponse)?.statusCode == 409,
               let snapshot = json?["party"], let snapshotData = try? JSONSerialization.data(withJSONObject: snapshot),
               let state = try? JSONDecoder().decode(PartyState.self, from: snapshotData), roomCode == requestedRoom,
               connectionGeneration == generation { accept(state) }
            throw StemSeparatorError.invalid(json?["error"] as? String ?? "The web server rejected the room command.")
        }
        let state = try JSONDecoder().decode(PartyState.self, from: data)
        if roomCode == requestedRoom, connectionGeneration == generation { accept(state) }
    }

    deinit { settingsTask?.cancel(); eventsTask?.cancel() }
}
