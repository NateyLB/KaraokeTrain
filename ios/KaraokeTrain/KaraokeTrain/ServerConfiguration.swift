import Foundation

nonisolated enum ServerConfiguration {
    static let web = Bundle.main.object(forInfoDictionaryKey: "KaraokeServerURL") as? String ?? "http://localhost:3000"
}
