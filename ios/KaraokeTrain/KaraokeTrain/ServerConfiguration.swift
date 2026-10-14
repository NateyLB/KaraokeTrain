import Foundation

nonisolated enum ServerConfiguration {
    static let web = Bundle.main.object(forInfoDictionaryKey: "KaraokeServerURL") as? String ?? "http://localhost:3000"
    // Used only by the earlier on-device processing adapter until processing is chosen.
    static let legacyDownloader = Bundle.main.object(forInfoDictionaryKey: "KaraokeBackendURL") as? String ?? "http://localhost:4000"
    static let legacyDevelopmentSecret = Bundle.main.object(forInfoDictionaryKey: "KaraokeAPISecret") as? String ?? ""
}
