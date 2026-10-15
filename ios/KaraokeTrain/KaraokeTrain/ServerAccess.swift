import Foundation
import Security

nonisolated struct DeviceCredential: Codable, Sendable {
    let origin: String
    let token: String
    let role: String
    let expiresAt: Double
}

/// Credentials are scoped to an exact HTTPS origin and never accompany YouTube requests.
nonisolated enum ServerAccess {
    private static let service = "KaraokeTrain.ServerAccess"
    static func origin(_ url: URL) -> String? {
        guard let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              let host = url.host?.lowercased(), url.user == nil, url.password == nil else { return nil }
        let port = url.port.map { ":\($0)" } ?? ""
        return "\(scheme)://\(host)\(port)"
    }

    static func credential() -> DeviceCredential? {
        #if os(iOS)
        var result: CFTypeRef?
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: "paired-device",
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(DeviceCredential.self, from: data)
        #else
        return nil // Host regression tools do not read a user's Keychain.
        #endif
    }

    static func save(_ credential: DeviceCredential) throws {
        #if os(iOS)
        let data = try JSONEncoder().encode(credential)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: "paired-device"]
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var addition = query; attributes.forEach { addition[$0.key] = $0.value }
            guard SecItemAdd(addition as CFDictionary, nil) == errSecSuccess else { throw URLError(.cannotWriteToFile) }
        } else if status != errSecSuccess { throw URLError(.cannotWriteToFile) }
        #endif
    }

    static func authorize(_ request: URLRequest, credential: DeviceCredential? = credential()) -> URLRequest {
        var request = request
        if let credential, let url = request.url, origin(url) == credential.origin,
           credential.origin.hasPrefix("https://"), credential.expiresAt > Date().timeIntervalSince1970 * 1000 {
            request.setValue("Bearer \(credential.token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    static func cookies(for url: URL, credential: DeviceCredential? = credential()) -> [HTTPCookie] {
        guard let credential, origin(url) == credential.origin, url.scheme == "https",
              credential.expiresAt > Date().timeIntervalSince1970 * 1000,
              let cookie = HTTPCookie(properties: [.name: "__Host-kt_device", .value: credential.token,
                .domain: url.host ?? "", .path: "/", .secure: "TRUE",
                .expires: Date(timeIntervalSince1970: credential.expiresAt / 1000)]) else { return [] }
        return [cookie]
    }

    static func pairingURL(_ value: String) throws -> (origin: String, token: String) {
        guard let url = URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme == "https", ["/pair", "/invite"].contains(url.path),
              let origin = origin(url), let fragment = url.fragment,
              let token = URLComponents(string: "https://pair.invalid/?" + fragment)?.queryItems?.first(where: { $0.name == "token" })?.value,
              token.range(of: #"^[A-Za-z0-9_-]{43}$"#, options: .regularExpression) != nil else { throw URLError(.badURL) }
        return (origin, token)
    }
}
