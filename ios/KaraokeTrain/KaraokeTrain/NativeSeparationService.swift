import Foundation

nonisolated struct NativeJob: Decodable, Sendable {
    let id: String?
    let cached: Bool?
    let status: String?
    let error: String?
    let totalFrames: Int?
    let mean: Double?
    let std: Double?
    let segmentFrames: Int?
    let hopFrames: Int?
    let progress: Double?
}

nonisolated struct NativeAPI: Sendable {
    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.timeoutIntervalForResource = 180
        return URLSession(configuration: configuration)
    }()
    let backend: String
    let web: String
    let secret: String

    func request(_ path: String, method: String = "GET", body: Data? = nil,
                 binary: Bool = false, onWeb: Bool = false) throws -> URLRequest {
        guard !secret.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !secret.contains("$(") else {
            throw StemSeparatorError.invalid("Set KARAOKE_API_SECRET in LocalDevelopment.xcconfig, then rebuild the app.")
        }
        guard let url = URL(string: (onWeb ? web : backend) + path) else {
            throw StemSeparatorError.invalid("Invalid server address.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 120
        request.setValue("Bearer \(secret)", forHTTPHeaderField: "Authorization")
        if body != nil {
            request.setValue(binary ? "application/octet-stream" : "application/json", forHTTPHeaderField: "Content-Type")
        }
        request.httpBody = body
        return request
    }

    func send(_ request: URLRequest) async throws -> Data {
        // GET and chunk PUT are idempotent. Never duplicate job creation.
        let attempts = ["GET", "PUT"].contains(request.httpMethod ?? "") ? 3 : 1
        for attempt in 0..<attempts {
            do {
                try Task.checkCancellation()
                let (data, response) = try await Self.session.data(for: request)
                guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
                if response.statusCode >= 500 && attempt + 1 < attempts {
                    try await Task.sleep(for: .seconds(attempt + 1))
                    continue
                }
                guard (200..<300).contains(response.statusCode) else {
                    let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
                    throw StemSeparatorError.invalid(message ?? "Server request failed (\(response.statusCode)).")
                }
                return data
            } catch let error as URLError where error.code != .cancelled && attempt + 1 < attempts {
                try await Task.sleep(for: .seconds(attempt + 1))
            }
        }
        throw URLError(.cannotConnectToHost)
    }

    func job(_ path: String, method: String = "GET", payload: [String: String]? = nil) async throws -> NativeJob {
        let data = try payload.map { try JSONEncoder().encode($0) }
        return try await JSONDecoder().decode(NativeJob.self, from: send(request(path, method: method, body: data)))
    }
}

nonisolated enum NativeSeparationService {
    static func lyrics(track: Track, api: NativeAPI,
                       progress: @Sendable (String, Double) async -> Void) async throws -> Data {
        let body = try JSONEncoder().encode(["videoId": track.videoId])
        var data = try await api.send(api.request("/api/native/lyrics", method: "POST", body: body, onWeb: true))
        let deadline = Date().addingTimeInterval(25 * 60)
        while Date() < deadline {
            try Task.checkCancellation()
            let job = try JSONDecoder().decode(NativeJob.self, from: data)
            if job.status == "complete" { return data }
            if job.status == "error" { throw StemSeparatorError.invalid(job.error ?? "Lyrics failed.") }
            await progress("Transcribing and aligning lyrics…", (job.progress ?? 0) / 100)
            try await Task.sleep(for: .seconds(2))
            data = try await api.send(api.request("/api/native/lyrics?videoId=\(track.videoId)", onWeb: true))
        }
        throw StemSeparatorError.invalid("Lyrics timed out. Audio is cached; retry lyrics.")
    }

    static func prepare(track: Track, api: NativeAPI,
                        progress: @Sendable (String, Double) async -> Void) async throws {
        await progress("Checking GCS cache…", 0)
        let created = try await api.job("/native/jobs", method: "POST",
                                        payload: ["videoId": track.videoId, "title": track.title, "artist": track.artist])
        if created.cached == true { return }
        guard let id = created.id else { throw StemSeparatorError.invalid("Server did not return a processing session.") }
        do {
            await progress("Preparing audio in GCS…", 0.02)
            let ready = try await wait(id: id, until: "ready", api: api)
            guard let frames = ready.totalFrames, let mean = ready.mean, let std = ready.std,
                  ready.segmentFrames == 441_000, ready.hopFrames == 396_900 else {
                throw StemSeparatorError.invalid("Server and Demucs segment formats do not match.")
            }
            await progress("Loading Demucs on this device…", 0.05)
            let separator = StemSeparator.shared
            try await separator.separate(totalFrames: frames, mean: mean, standardDeviation: std) { index in
                try await api.send(api.request("/native/jobs/\(id)/input/\(index)"))
            } upload: { index, bytes in
                _ = try await api.send(api.request("/native/jobs/\(id)/chunks/\(index)", method: "PUT",
                                                   body: bytes, binary: true))
            } progress: { value in
                await progress("Separating and uploading… \(Int(value * 100))%", 0.05 + value * 0.85)
            }
            try Task.checkCancellation()
            await progress("Encoding stems in GCS…", 0.92)
            _ = try await api.job("/native/jobs/\(id)/finish", method: "POST")
            _ = try await wait(id: id, until: "complete", api: api)
            await progress("Audio saved to GCS", 1)
        } catch {
            // Cancellation must not prevent the cleanup request itself.
            Task {
                if let request = try? api.request("/native/jobs/\(id)", method: "DELETE") {
                    _ = try? await api.send(request)
                }
            }
            throw error
        }
    }

    private static func wait(id: String, until status: String, api: NativeAPI) async throws -> NativeJob {
        let deadline = Date().addingTimeInterval(30 * 60)
        while Date() < deadline {
            try Task.checkCancellation()
            let job = try await api.job("/native/jobs/\(id)")
            if job.status == status { return job }
            if ["error", "cancelled"].contains(job.status ?? "") {
                throw StemSeparatorError.invalid(job.error ?? "Processing was cancelled.")
            }
            try await Task.sleep(for: .seconds(2))
        }
        throw StemSeparatorError.invalid("Processing timed out. Please retry.")
    }
}
