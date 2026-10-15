import Foundation

nonisolated enum ServerConfiguration {
    static var web: String {
        if let paired = ServerAccess.credential()?.origin { return paired }
        #if DEBUG
        return Bundle.main.object(forInfoDictionaryKey: "KaraokeServerURL") as? String ?? "http://localhost:3000"
        #else
        return "https://app.karaoketrain.com"
        #endif
    }
}
