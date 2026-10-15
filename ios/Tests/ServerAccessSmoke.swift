import Foundation

@main struct ServerAccessSmoke {
    static func main() throws {
        let token = String(repeating: "a", count: 43)
        let credential = DeviceCredential(origin: "https://app.karaoketrain.com", token: token,
            role: "host", expiresAt: Date().timeIntervalSince1970 * 1000 + 100000)
        let own = URL(string: "https://app.karaoketrain.com/api/stems?jobId=example")!
        assert(ServerAccess.authorize(URLRequest(url: own), credential: credential).value(forHTTPHeaderField: "Authorization") == "Bearer \(token)")
        for remote in ["https://youtube.com/", "https://app.karaoketrain.com.evil.test/api", "http://app.karaoketrain.com/api", "https://app.karaoketrain.com:444/api"] {
            let url = URL(string: remote)!
            assert(ServerAccess.authorize(URLRequest(url: url), credential: credential).value(forHTTPHeaderField: "Authorization") == nil)
            assert(ServerAccess.cookies(for: url, credential: credential).isEmpty)
        }
        assert(ServerAccess.cookies(for: own, credential: credential).first?.isSecure == true)
        let parsed = try ServerAccess.pairingURL("https://app.karaoketrain.com/pair#token=\(token)")
        assert(parsed.origin == credential.origin && parsed.token == token)
        for invalid in ["http://app.karaoketrain.com/pair#token=\(token)", "https://user:pass@app.karaoketrain.com/pair#token=\(token)", "https://app.karaoketrain.com/other#token=\(token)"] {
            do { _ = try ServerAccess.pairingURL(invalid); assertionFailure("Invalid pairing accepted") } catch {}
        }
        print("Native credential origin, media cookie and pairing-link checks passed")
    }
}
