import Foundation

enum StemSeparatorError: LocalizedError {
    case invalid(String)
    var errorDescription: String? { if case .invalid(let message) = self { message } else { nil } }
}

@main
struct RoomConnectionSmoke {
    @MainActor static func main() async throws {
        let server = CommandLine.arguments.dropFirst().first ?? "http://localhost:3000"
        let model = PartyViewModel(serverBaseURL: server)
        guard await model.hostParty() else { throw StemSeparatorError.invalid(model.errorMessage ?? "Host failed") }
        assert(model.isHosting && model.partyState?.id == model.roomCode)
        model.leaveParty()
        guard await model.joinParty(code: "NSSE") else { throw StemSeparatorError.invalid(model.errorMessage ?? "Join failed") }
        defer { model.leaveParty() }
        let deadline = Date().addingTimeInterval(10)
        while model.connectionStatus != .connected, Date() < deadline { try await Task.sleep(for: .milliseconds(25)) }
        assert(model.connectionStatus == .connected)
        // A separate HTTP client changes an isolated test room; only SSE can notify the model.
        let volume = model.partyState?.settings?.vocalsVolume == 0.57 ? 0.58 : 0.57
        var request = URLRequest(url: URL(string: server + "/api/party")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["id":"NSSE", "action":"updateSettings", "sender":"host", "settings":["vocalsVolume":volume]])
        let started = Date()
        let (_, response) = try await URLSession.shared.data(for: request)
        assert((response as? HTTPURLResponse)?.statusCode == 200)
        while model.partyState?.settings?.vocalsVolume != volume, Date().timeIntervalSince(started) < 5 {
            try await Task.sleep(for: .milliseconds(10))
        }
        assert(model.partyState?.settings?.vocalsVolume == volume)
        model.leaveParty()
        assert(model.connectionStatus == .disconnected && model.partyState == nil)
        print("PASS: shared-API native host, join, live room SSE update and cancellation (isolated test rooms)")
    }
}
