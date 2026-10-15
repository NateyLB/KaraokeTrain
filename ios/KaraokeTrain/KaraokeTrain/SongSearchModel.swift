import Foundation
import Combine

nonisolated enum SearchRouting {
    static func asksDJ(_ query: String) -> Bool {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.contains("?") || text.split(whereSeparator: \.isWhitespace).count >= 6 ||
            text.range(of: #"^(what|can|should|could|would|recommend|suggest|how|give|some|play|any|good|who|need)\b"#,
                       options: [.regularExpression, .caseInsensitive]) != nil
    }
}

nonisolated struct DJResponse: Decodable {
    let message: String
    let recommended_queries: [String]?
}

/// Mirrors SearchBar.js routing and result states without creating an audio player.
@MainActor
final class SongSearchModel: ObservableObject {
    @Published private(set) var results: [Track] = []
    @Published private(set) var isSearching = false
    @Published private(set) var isAskingDJ = false
    @Published private(set) var hasSearched = false
    @Published private(set) var djResponse: DJResponse?
    @Published private(set) var error: String?
    private var task: Task<Void, Never>?
    private var generation = UUID()
    private let server = ServerConfiguration.web

    func clear() {
        task?.cancel(); task = nil; generation = UUID()
        results = []; djResponse = nil; error = nil
        hasSearched = false; isSearching = false; isAskingDJ = false
    }

    func search(_ query: String, forceYouTube: Bool = false, context: Data? = nil) {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { clear(); return }
        clear()
        hasSearched = true
        let askDJ = !forceYouTube && SearchRouting.asksDJ(query)
        isAskingDJ = askDJ; isSearching = true
        let token = generation
        task = Task {
            do {
                var components = URLComponents(string: server + (askDJ ? "/api/dj" : "/api/search"))
                if !askDJ { components?.queryItems = [URLQueryItem(name: "q", value: query)] }
                guard let url = components?.url else { throw URLError(.badURL) }
                var request = URLRequest(url: url)
                request.timeoutInterval = askDJ ? 90 : 30
                if askDJ {
                    var body = (context.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]) ?? [:]
                    body["prompt"] = query
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.httpBody = try JSONSerialization.data(withJSONObject: body)
                }
                let (data, response) = try await URLSession.shared.data(for: ServerAccess.authorize(request))
                try Task.checkCancellation()
                guard generation == token else { return }
                guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                    let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
                    throw NSError(domain: "SongSearch", code: 1, userInfo: [NSLocalizedDescriptionKey: message ?? "Search failed. Check the server and retry."])
                }
                if askDJ { djResponse = try JSONDecoder().decode(DJResponse.self, from: data) }
                else { results = try JSONDecoder().decode([Track].self, from: data) }
            } catch {
                guard !Task.isCancelled, generation == token else { return }
                self.error = error.localizedDescription
            }
            if generation == token { isSearching = false; isAskingDJ = false; task = nil }
        }
    }

    deinit { task?.cancel() }
}
