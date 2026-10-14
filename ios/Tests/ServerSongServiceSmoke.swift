import Foundation

actor SongTransport {
    var requests: [URLRequest] = []
    var responses: [(Int, String)]
    init(_ responses: [(Int, String)]) { self.responses = responses }
    func send(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        let response = responses.isEmpty ? (200, #"{"status":"pending"}"#) : responses.removeFirst()
        return (Data(response.1.utf8), HTTPURLResponse(url: request.url!, statusCode: response.0, httpVersion: nil, headerFields: nil)!)
    }
}

@main
struct ServerSongServiceSmoke {
    static func main() async throws {
        let fake = SongTransport([(200, #"{"status":"pending","progress":0}"#),
                                  (200, #"{"status":"processing","progress":50}"#),
                                  (200, #"{"status":"ready","lyricsSource":"qwen_transcription","lyrics":[{"time":1,"text":"Hello"}]}"#)])
        var service = ServerSongService(baseURL: "http://localhost:3000", pollInterval: .milliseconds(1), transport: { try await fake.send($0) })
        let prepared = try await service.waitForSong(jobID: "abcdefghijk") { _, _ in }
        let lyrics = try JSONSerialization.jsonObject(with: prepared.lyrics!) as! [String: Any]
        assert(lyrics["source"] as? String == "qwen_transcription")
        let polls = await fake.requests
        assert(polls.count == 3 && polls.allSatisfy { $0.httpMethod == "GET" && $0.url?.path == "/api/separate/status" })
        assert(polls.allSatisfy { $0.value(forHTTPHeaderField: "Authorization") == nil })
        assert(prepared.lyricsWarning == nil)
        let cached = SongTransport([(200, #"{"status":"ready","lyrics":[]}"#)])
        service.transport = { try await cached.send($0) }
        let empty = try await service.waitForSong(jobID: "abcdefghijk") { _, _ in }
        assert(empty.lyricsWarning != nil)
        let cachedRequests = await cached.requests.count
        assert(cachedRequests == 1)
        let explicit = SongTransport([(200, #"{"job_id":"abcdefghijk","cached":true}"#), (200, #"{"source":"qwen_transcription","lyrics":[]}"#)])
        service.transport = { try await explicit.send($0) }
        try await service.retry(Track(videoId: "abcdefghijk", title: "Song & another=value", artist: "Artist"))
        _ = try await service.repairLyrics(jobID: "abcdefghijk")
        let requests = await explicit.requests
        assert(requests.map { $0.url!.path } == ["/api/separate/start", "/api/lyrics/sync"])
        assert(requests.allSatisfy { $0.httpMethod == "POST" })
        assert(URLComponents(url: requests[0].url!, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "title" })?.value == "Song & another=value")
        let body = try JSONDecoder().decode([String:String].self, from: requests[1].httpBody!)
        assert(body == ["jobId":"abcdefghijk"])
        let failed = SongTransport([(503, #"{"error":"Storage unavailable"}"#)])
        service.transport = { try await failed.send($0) }
        do { _ = try await service.waitForSong(jobID: "abcdefghijk") { _, _ in }; assertionFailure() }
        catch { assert(error.localizedDescription == "Storage unavailable") }
        let pending = SongTransport([])
        service.transport = { try await pending.send($0) }; service.pollInterval = .seconds(60)
        let waiting = service
        let task = Task { try await waiting.waitForSong(jobID: "abcdefghijk") { _, _ in } }
        while await pending.requests.isEmpty { await Task.yield() }
        task.cancel()
        do { _ = try await task.value; assertionFailure() } catch is CancellationError { }
        let pendingRequests = await pending.requests.count
        assert(pendingRequests == 1)
        print("PASS: server-owned processing, cached bypass, explicit retry/repair, URL encoding, failures and cancelled polling")
    }
}
