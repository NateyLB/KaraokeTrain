import UIKit

/// iOS may grant time to finish an export, but can revoke it at any point.
@MainActor
final class RecordingBackgroundTask {
    private var identifier = UIBackgroundTaskIdentifier.invalid
    private var token: UUID?
    func begin(expired: @escaping @MainActor () -> Void) -> UUID {
        if let token { end(token) }
        let token = UUID(); self.token = token
        identifier = UIApplication.shared.beginBackgroundTask(withName: "Save karaoke recording") { [weak self] in
            Task { @MainActor [weak self] in
                guard self?.token == token else { return }
                expired(); self?.end(token)
            }
        }
        return token
    }
    func end(_ token: UUID) {
        guard self.token == token else { return }
        if identifier != .invalid { UIApplication.shared.endBackgroundTask(identifier) }
        identifier = .invalid; self.token = nil
    }
}
