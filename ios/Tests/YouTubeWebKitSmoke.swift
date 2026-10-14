// macOS WebKit smoke test of the exact HTML/bridge shipped in iOS.
// This is not a substitute for testing on an iPhone. No media files are saved;
// the WebView streams muted video using normal browser networking/cache.
import AppKit
import WebKit

@main
struct YouTubeWebKitSmoke {
    @MainActor static func main() throws {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        let delegate = Runner()
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}

@MainActor
final class Runner: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    var window: NSWindow?
    var webView: WKWebView?
    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let script = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
            let document = try YouTubeDocument.make(videoID: "M7lc1UVf-VE", bundleID: "KaraokeTrain.KaraokeTrain", script: script)
            let config = WKWebViewConfiguration()
            config.mediaTypesRequiringUserActionForPlayback = []
            config.userContentController.add(self, name: "karaokeVideo")
            let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 640, height: 360), configuration: config)
            view.navigationDelegate = self
            webView = view
            window = NSWindow(contentRect: view.frame, styleMask: [.titled, .closable], backing: .buffered, defer: false)
            window?.title = "Karaoke YouTube playback smoke test"
            window?.contentView = view
            window?.orderFront(nil)
            view.loadHTMLString(document.html, baseURL: document.origin)
            DispatchQueue.main.asyncAfter(deadline: .now() + 45) { self.finish("TIMEOUT: YouTube did not play", code: 1) }
        } catch { finish("ERROR: \(error)", code: 1) }
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        print("YouTube event: \(type), code: \(body["code"] ?? 0)")
        if type == "ready" { webView?.evaluateJavaScript("window.syncPlayback(0, true);") }
        if type == "playing" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.finish("PASS: live WebKit emitted playing", code: 0) }
        }
        if ["error", "network", "blocked"].contains(type) { finish("FAIL: \(body)", code: 1) }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish("Navigation error: \(error.localizedDescription)", code: 1)
    }
    func finish(_ message: String, code: Int32) {
        print(message)
        window?.orderOut(nil)
        webView?.stopLoading()
        exit(code)
    }
}
