import SwiftUI

struct RoomInvitationView: View {
    let roomID: String
    @State private var invitation: URL?
    @State private var qr: UIImage?
    @State private var error: String?
    @State private var busy = false
    var body: some View {
        VStack(spacing: 20) {
            Text("Invite guests to \(roomID)").font(.title2.bold())
            Text("Guests can see this room and add songs. Invitations expire after two hours.").multilineTextAlignment(.center)
            if let qr { Image(uiImage: qr).resizable().interpolation(.none).frame(width: 280, height: 280) }
            if let invitation { ShareLink("Share invitation", item: invitation) }
            if let error { Text(error).foregroundStyle(.red) }
            Button(busy ? "Creating invitation…" : "Create guest invitation") { Task { await create() } }.disabled(busy)
        }.padding(24)
    }
    @MainActor private func create() async {
        busy = true; error = nil; defer { busy = false }
        do {
            guard let url = URL(string: ServerConfiguration.web + "/api/access/manage") else { throw URLError(.badURL) }
            var request = URLRequest(url: url); request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["action": "invite", "roomId": roomID])
            let (data, response) = try await URLSession.shared.data(for: ServerAccess.authorize(request))
            let result = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let value = result?["url"] as? String, let link = URL(string: value) else {
                throw NSError(domain: "Invitation", code: 1, userInfo: [NSLocalizedDescriptionKey: result?["error"] as? String ?? "Could not create an invitation."])
            }
            invitation = link
            if let image = (result?["qr"] as? String)?.split(separator: ",", maxSplits: 1).last,
               let data = Data(base64Encoded: String(image)) { qr = UIImage(data: data) }
        } catch { self.error = error.localizedDescription }
    }
}
