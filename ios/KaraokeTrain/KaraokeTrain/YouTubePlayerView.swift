import SwiftUI
import WebKit

/// Audio time is the clock. YouTube stays muted; failures remain visible.
struct YouTubePlayerView: UIViewRepresentable {
    let videoId: String
    let isPlaying: Bool
    let currentTime: Double
    var onError: (String?) -> Void = { _ in }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(context.coordinator, name: "karaokeVideo")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.scrollView.isScrollEnabled = false
        // Permit YouTube's own play gesture when WebKit blocks scripted playback.
        view.isUserInteractionEnabled = true
        view.backgroundColor = .black
        view.isOpaque = false
        context.coordinator.webView = view
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        let coordinator = context.coordinator
        coordinator.onError = onError
        coordinator.time = currentTime.isFinite ? max(0, currentTime) : 0
        coordinator.playing = isPlaying
        guard videoId.range(of: #"^[a-zA-Z0-9_-]{11}$"#, options: .regularExpression) != nil else {
            coordinator.report("Invalid YouTube video ID.")
            return
        }
        if coordinator.videoId != videoId {
            coordinator.videoId = videoId
            coordinator.ready = false
            coordinator.report(nil)
            // YouTube requires an HTTPS app-identity Referer for WebView clients.
            // A LAN HTTP server address is not the app identity and is not needed
            // to load this local document.
            guard let bundleID = Bundle.main.bundleIdentifier?.lowercased(),
                  let scriptURL = Bundle.main.url(forResource: "YouTubeBridge", withExtension: "js"),
                  let script = try? String(contentsOf: scriptURL, encoding: .utf8),
                  let document = try? YouTubeDocument.make(videoID: videoId, bundleID: bundleID, script: script) else {
                coordinator.report("The YouTube player resource is missing from this build.")
                return
            }
            view.loadHTMLString(document.html, baseURL: document.origin)
            coordinator.startTimeout()
        } else if coordinator.ready &&
                    (coordinator.lastPlaying != isPlaying || abs(coordinator.time - coordinator.lastTime) >= 0.5) {
            coordinator.synchronize()
        }
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        coordinator.timeout?.cancel()
        view.stopLoading()
        view.navigationDelegate = nil
        view.configuration.userContentController.removeScriptMessageHandler(forName: "karaokeVideo")
        coordinator.webView = nil
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?
        var onError: (String?) -> Void = { _ in }
        var videoId: String?
        var ready = false
        var time = 0.0
        var playing = false
        var lastTime = -1.0
        var lastPlaying = false
        var timeout: Task<Void, Never>?

        func report(_ message: String?) {
            let id = videoId
            Task { @MainActor [weak self] in
                guard let self, self.videoId == id else { return }
                self.onError(message)
            }
        }

        func startTimeout() {
            timeout?.cancel()
            timeout = Task { @MainActor [weak self] in
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
                guard let self, !self.ready else { return }
                self.report("YouTube did not become ready. Check the connection and retry video.")
            }
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame,
                  let body = message.body as? [String: Any], body["videoId"] as? String == videoId,
                  let type = body["type"] as? String else { return }
            switch type {
            case "ready":
                ready = true
                timeout?.cancel()
                lastTime = -1
                report(nil)
                synchronize() // Send the latest state, not the state at HTML load time.
            case "playing": report(nil)
            case "blocked": report("YouTube blocked automatic playback. Tap the video to start it.")
            case "network": timeout?.cancel(); report("Could not load YouTube. Check the internet connection and retry video.")
            case "error":
                timeout?.cancel()
                let code = body["code"] as? Int ?? 0
                switch code {
                case 100: report("This YouTube video is unavailable or private. Choose another song.")
                case 101, 150: report("The video owner does not allow embedded playback. Choose another version.")
                case 153: report("YouTube rejected the player identity (153). Check this build's bundle identifier.")
                default: report("YouTube playback failed (code \(code)). Retry video or choose another version.")
                }
            default: break
            }
        }

        func synchronize() {
            guard ready, let webView else { return }
            lastTime = time
            lastPlaying = playing
            let id = videoId
            webView.evaluateJavaScript("window.syncPlayback(\(time), \(playing ? "true" : "false"));") { [weak self] _, error in
                guard let self, self.videoId == id, error != nil else { return }
                self.report("Could not communicate with the YouTube player. Retry video.")
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
        private func failed(_ error: Error) {
            if (error as NSError).code == NSURLErrorCancelled { return }
            timeout?.cancel()
            report("YouTube could not load: \(error.localizedDescription)")
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            ready = false
            timeout?.cancel()
            report("The video process stopped. Retry video; separated audio remains available.")
        }
    }
}
