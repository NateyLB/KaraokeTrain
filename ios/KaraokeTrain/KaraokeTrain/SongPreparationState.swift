import Foundation

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
