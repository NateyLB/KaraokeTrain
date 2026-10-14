import Foundation

nonisolated struct SongServiceError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

nonisolated struct ServerSongService: Sendable {
    typealias Transport = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)
    let baseURL: String
    var pollInterval: Duration = .seconds(2)
    var timeout: TimeInterval = 20 * 60
    var transport: Transport = { request in
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return (data, response)
    }

    private func url(_ path: String, query: [URLQueryItem]) throws -> URL {
        guard var components = URLComponents(string: baseURL + path) else { throw URLError(.badURL) }
        components.queryItems = query.isEmpty ? nil : query
        guard let url = components.url else { throw URLError(.badURL) }
        return url
    }

    private func send(_ request: URLRequest) async throws -> Data {
        try Task.checkCancellation()
        let (data, response) = try await transport(request)
        try Task.checkCancellation()
        guard (200..<300).contains(response.statusCode) else {
            let error = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw SongServiceError(message: error ?? "Song service unavailable (\(response.statusCode)).")
        }
        return data
    }

    func audioURL(jobID: String) throws -> URL {
        try url("/api/stems", query: [.init(name: "jobId", value: jobID), .init(name: "stem", value: "multiplex")])
    }

    /// Queue addition already admits work on the server. Waiting must never start a second job.
    func waitForSong(jobID: String, progress: @Sendable (String, Double) async -> Void) async throws -> PreparedSong {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            var request = URLRequest(url: try url("/api/separate/status", query: [.init(name: "jobId", value: jobID)]))
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 15
            let data = try await send(request)
            guard let status = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let phase = status["status"] as? String else { throw URLError(.cannotParseResponse) }
            if ["ready", "done"].contains(phase) {
                return try preparedSong(lyrics: status["lyrics"], source: status["lyricsSource"] as? String)
            }
            if phase == "error" { throw SongServiceError(message: status["error"] as? String ?? "Song processing failed. Please retry.") }
            guard ["pending", "processing"].contains(phase) else { throw URLError(.cannotParseResponse) }
            let value = (status["progress"] as? Double) ?? 0
            await progress(status["message"] as? String ?? "Preparing your song…", value.isFinite ? min(1, max(0, value / 100)) : 0)
            try await Task.sleep(for: pollInterval)
        }
        throw SongServiceError(message: "Song preparation took too long. Please retry; completed audio will be reused.")
    }

    private func preparedSong(lyrics: Any?, source: String?) throws -> PreparedSong {
        let lines = lyrics as? [Any] ?? []
        let data = try JSONSerialization.data(withJSONObject: ["lyrics": lines, "source": source ?? "unavailable"])
        return PreparedSong(lyrics: data, lyricsWarning: lines.isEmpty ? "No synced lyrics available. Retry lyrics when ready." : nil)
    }

    /// Explicit user retry only; the server deduplicates and bypasses work for cached audio.
    func retry(_ track: Track) async throws {
        var request = URLRequest(url: try url("/api/separate/start", query: [
            .init(name: "videoId", value: track.videoId), .init(name: "title", value: track.title), .init(name: "artist", value: track.artist),
        ]))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        _ = try await send(request)
    }

    func repairLyrics(jobID: String) async throws -> Data {
        var request = URLRequest(url: try url("/api/lyrics/sync", query: []))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["jobId": jobID])
        request.timeoutInterval = 30 * 60
        return try await send(request)
    }
}
