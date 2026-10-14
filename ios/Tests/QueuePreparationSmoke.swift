import Foundation

actor ControlledPreparation {
    private var waiters: [String: CheckedContinuation<PreparedSong, Error>] = [:]
    private(set) var calls: [String] = []
    func run(_ track: Track, progress: QueuePreparationModel.Progress) async throws -> PreparedSong {
        calls.append(track.videoId)
        await progress("Separating and uploading…", 0.4)
        // Deliberately don't interrupt immediately: a Core ML prediction cannot be interrupted either.
        return try await withCheckedThrowingContinuation { waiters[track.videoId] = $0 }
    }
    func finish(_ id: String, fail: Bool = false) {
        let continuation = waiters.removeValue(forKey: id)
        if fail { continuation?.resume(throwing: CocoaError(.fileReadCorruptFile)) }
        else { continuation?.resume(returning: PreparedSong(lyrics: nil, lyricsWarning: nil)) }
    }
}

@main
struct QueuePreparationSmoke {
    @MainActor static func wait(_ predicate: () -> Bool) async throws {
        for _ in 0..<300 {
            if predicate() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        fatalError("Timed out waiting for queue state")
    }

    @MainActor static func main() async throws {
        let gate = ControlledPreparation()
        let model = QueuePreparationModel()
        let a = Track(videoId: "AAAAAAAAAAA", title: "A", artist: "Test")
        let b = Track(videoId: "BBBBBBBBBBB", title: "B", artist: "Test")
        let c = Track(videoId: "CCCCCCCCCCC", title: "C", artist: "Test")
        let d = Track(videoId: "DDDDDDDDDDD", title: "D", artist: "Test")
        let operation: QueuePreparationModel.Operation = { track, progress in
            try await gate.run(track, progress: progress)
        }
        model.reconcile([a, b, a], operation: operation)
        try await wait { model.states[a.id]?.progress == 0.4 }
        assert(model.states[b.id]?.phase == .pending)
        assert(!RoomReadiness.showsPlayback(currentID: "entry-a", loadedID: nil, audioReady: false))
        await gate.finish(a.id)
        try await wait { model.states[b.id]?.progress == 0.4 }
        assert(model.states[a.id]?.phase == .ready)
        assert(model.prepared[a.id] != nil)
        // Ready stems alone are not enough: AVPlayer must be ready for this exact queue entry.
        assert(!RoomReadiness.showsPlayback(currentID: "entry-a", loadedID: "entry-a", audioReady: false))
        assert(RoomReadiness.showsPlayback(currentID: "entry-a", loadedID: "entry-a", audioReady: true))
        assert(!RoomReadiness.showsPlayback(currentID: "entry-b", loadedID: "entry-a", audioReady: true))
        assert(!RoomReadiness.showsPlayback(currentID: nil, loadedID: nil, audioReady: true))
        model.reconcile([b, a], operation: operation)
        await gate.finish(b.id)
        try await wait { model.activeID == nil }
        let initialCalls = await gate.calls
        assert(initialCalls == [a.id, b.id], "Duplicate queue entries/reorder must reuse preparation")

        model.reconcile([a, b, c], operation: operation)
        try await wait { model.states[c.id]?.progress == 0.4 }
        model.reconcile([a, b, d], operation: operation)
        assert(model.states[d.id]?.phase == .pending, "Do not overlap work while cancellation drains")
        await gate.finish(c.id)
        try await wait { model.states[d.id]?.progress == 0.4 }
        assert(model.prepared[c.id] == nil, "Removed songs must not publish stale readiness")
        await gate.finish(d.id, fail: true)
        try await wait { model.states[d.id]?.phase == .error }
        assert(model.prepared[d.id] == nil)
        model.retry(d.id)
        try await wait { model.states[d.id]?.progress == 0.4 }
        model.suspend()
        await gate.finish(d.id)
        try await wait { model.activeID == nil }
        assert(model.states[d.id]?.phase == .error, "Background cancellation must stay retryable, not ready")
        model.retry(d.id)
        try await wait { model.states[d.id]?.progress == 0.4 }
        await gate.finish(d.id)
        try await wait { model.states[d.id]?.phase == .ready }
        model.stop()
        assert(model.states.isEmpty && model.prepared.isEmpty)
        print("PASS: readiness gate, progress, serial preparation, duplicate/reorder reuse, removal, stale completion, failure, cancellation and retry")
    }
}
