import SwiftUI
import Combine
import VisionKit
import Vision
import AVFoundation

@MainActor
final class ServerConnectionModel: ObservableObject {
    @Published var connected = false
    @Published var checking = false
    @Published var error: String?
    @Published var role = "host"
    @Published var initialRoom: String?
    @Published var generation = UUID()

    func check() async {
        guard !checking else { return }
        checking = true; defer { checking = false }
        do {
            guard let url = URL(string: ServerConfiguration.web + "/api/access/session") else { throw URLError(.badURL) }
            var request = URLRequest(url: url); request.timeoutInterval = 10
            let (data, response) = try await URLSession.shared.data(for: ServerAccess.authorize(request))
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let state = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                connected = false; return
            }
            role = state["role"] as? String ?? "host"
            connected = true; error = nil
        } catch { self.error = "Could not reach the server. Check its connection or pair this phone." }
    }

    func pair(_ link: String) async {
        guard !checking else { return }
        checking = true; error = nil; defer { checking = false }
        do {
            let pairing = try ServerAccess.pairingURL(link)
            guard let url = URL(string: pairing.origin + "/api/access/redeem") else { throw URLError(.badURL) }
            var request = URLRequest(url: url); request.httpMethod = "POST"; request.timeoutInterval = 20
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["token": pairing.token, "client": "native", "name": UIDevice.current.name])
            // An existing credential is reused only for the exact same HTTPS origin.
            request = ServerAccess.authorize(request)
            let (data, response) = try await URLSession.shared.data(for: request)
            let result = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard (response as? HTTPURLResponse)?.statusCode == 200, let token = result?["deviceToken"] as? String,
                  let role = result?["role"] as? String, let expiry = result?["expiresAt"] as? Double else {
                throw NSError(domain: "Pairing", code: 1, userInfo: [NSLocalizedDescriptionKey: result?["error"] as? String ?? "This link could not be used."])
            }
            try ServerAccess.save(DeviceCredential(origin: pairing.origin, token: token, role: role, expiresAt: expiry))
            self.role = role; initialRoom = result?["roomId"] as? String
            generation = UUID(); connected = true
        } catch { self.error = error.localizedDescription }
    }
}

struct ServerConnectionView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = ServerConnectionModel()
    @State private var showPairing = false
    var body: some View {
        Group {
            if model.connected {
                HomeView(initialRoom: model.initialRoom).id(model.generation).environmentObject(model)
                    .overlay(alignment: .topLeading) { Button("Connection") { showPairing = true }.padding() }
            } else { ConnectionPairingForm(model: model) }
        }
        .task { await model.check() }
        .sheet(isPresented: $showPairing) { ConnectionPairingForm(model: model) }
        .onChange(of: model.generation) { _, _ in showPairing = false }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await model.check() } } }
    }
}

struct ConnectionPairingForm: View {
    @ObservedObject var model: ServerConnectionModel
    @State private var link = ""
    @State private var scan = false
    @State private var cameraError: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("Connect to KaraokeTrain") {
                    Text("Scan the pairing QR code from your Mac, or paste a pairing or guest invitation link. No account is needed.")
                    SecureField("Pairing or invitation link", text: $link).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Scan QR code") {
                        Task {
                            guard await AVCaptureDevice.requestAccess(for: .video), DataScannerViewController.isSupported,
                                  DataScannerViewController.isAvailable else { cameraError = "Camera scanning is unavailable. Paste the link instead."; return }
                            scan = true
                        }
                    }
                    Button(model.checking ? "Connecting…" : "Connect") { Task { await model.pair(link); link = "" } }
                        .disabled(model.checking || link.isEmpty)
                }
                if let error = model.error ?? cameraError { Text(error).foregroundStyle(.red) }
                Section { Text(ServerConfiguration.web).font(.footnote); Button("Retry server connection") { Task { await model.check() } } }
            }.navigationTitle("Server connection")
                .sheet(isPresented: $scan) { PairingCodeScanner { value in link = value; scan = false } }
        }
    }
}

struct PairingCodeScanner: UIViewControllerRepresentable {
    var found: (String) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(found: found) }
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced, recognizesMultipleItems: false, isGuidanceEnabled: true, isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        do { try scanner.startScanning() } catch { /* The form retains the paste-link alternative. */ }
        return scanner
    }
    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}
    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator: Coordinator) { controller.stopScanning() }
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var completed = false
        let found: (String) -> Void
        init(found: @escaping (String) -> Void) { self.found = found }
        func dataScanner(_ scanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !completed else { return }
            for item in addedItems {
                if case .barcode(let barcode) = item, let value = barcode.payloadStringValue {
                    completed = true; scanner.stopScanning(); found(value); return
                }
            }
        }
    }
}
