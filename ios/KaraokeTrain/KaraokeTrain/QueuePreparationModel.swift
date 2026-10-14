import Foundation
import Combine

nonisolated struct PreparedSong: Sendable {
    let lyrics: Data?
    let lyricsWarning: String?
}

nonisolated struct SongPreparationState: Equatable, Sendable {
    enum Phase: String, Sendable { case pending, processing, ready, error }
    var phase: Phase
    var progress: Double = 0
    var message: String = ""
}

/// A selected server song is not necessarily playable (the web makes the same distinction).
nonisolated enum RoomReadiness {
    static func showsPlayback(currentID: String?, loadedID: String?, audioReady: Bool) -> Bool {
        currentID != nil && currentID == loadedID && audioReady
    }
}

/// One bounded native processing lane, independent of the active audio player.
/// Removing/reordering songs never starts a second Core ML job concurrently.
@MainActor
final class QueuePreparationModel: ObservableObject {
    typealias Progress = @Sendable (String, Double) async -> Void
    typealias Operation = @Sendable (Track, @escaping Progress) async throws -> PreparedSong
    @Published private(set) var states: [String: SongPreparationState] = [:]
    @Published private(set) var prepared: [String: PreparedSong] = [:]
    @Published private(set) var activeID: String?
    private var tracks: [Track] = []
    private var operation: Operation?
    private var task: Task<Void, Never>?
    private var suspended = false

    func reconcile(_ songs: [Track], operation: @escaping Operation) {
        self.operation = operation
        var seen = Set<String>()
        tracks = songs.filter { seen.insert($0.videoId).inserted }
        states = states.filter { seen.contains($0.key) }
        prepared = prepared.filter { seen.contains($0.key) }
        for song in tracks where states[song.videoId] == nil {
            states[song.videoId] = SongPreparationState(phase: .pending, message: "Waiting to process")
        }
        if let activeID, !seen.contains(activeID) { task?.cancel() }
        startNext()
    }

    func retry(_ id: String) {
        guard tracks.contains(where: { $0.videoId == id }) else { return }
        states[id] = SongPreparationState(phase: .pending, message: "Waiting to retry")
        prepared[id] = nil
        suspended = false
        startNext()
    }

    func cancel(_ id: String) {
        guard states[id] != nil else { return }
        states[id] = SongPreparationState(phase: .error, message: "Processing stopped. Retry to reuse completed GCS audio.")
        if activeID == id { task?.cancel() }
    }

    func suspend() {
        suspended = true
        if let activeID { cancel(activeID) }
    }

    func resume() { suspended = false; startNext() }

    func stop() {
        suspend()
        tracks = []
        states = [:]
        prepared = [:]
    }

    private func startNext() {
        guard !suspended, task == nil, let operation,
              let track = tracks.first(where: { states[$0.videoId]?.phase == .pending }) else { return }
        let id = track.videoId
        activeID = id
        states[id] = SongPreparationState(phase: .processing, message: "Checking GCS cache…")
        task = Task { [weak self] in
            do {
                let result = try await operation(track) { [weak self] message, progress in
                    await self?.update(id, message: message, progress: progress)
                }
                try Task.checkCancellation()
                if self?.states[id] != nil {
                    self?.prepared[id] = result
                    self?.states[id] = SongPreparationState(phase: .ready, progress: 1, message: "Ready")
                }
            } catch {
                if !Task.isCancelled, self?.states[id] != nil {
                    self?.states[id] = SongPreparationState(phase: .error, message: error.localizedDescription)
                }
            }
            guard let self else { return }
            self.activeID = nil
            self.task = nil
            self.startNext()
        }
    }

    private func update(_ id: String, message: String, progress: Double) {
        guard activeID == id, states[id]?.phase == .processing else { return }
        states[id] = SongPreparationState(phase: .processing,
            progress: progress.isFinite ? min(1, max(0, progress)) : 0, message: message)
    }

    deinit { task?.cancel() }
}
