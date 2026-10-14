import Foundation

nonisolated enum YouTubeDocument {
    static func make(videoID: String, bundleID: String, script: String) throws -> (html: String, origin: URL) {
        guard videoID.range(of: #"^[a-zA-Z0-9_-]{11}$"#, options: .regularExpression) != nil,
              bundleID.range(of: #"^[A-Za-z0-9.-]+$"#, options: .regularExpression) != nil,
              let origin = URL(string: "https://" + bundleID.lowercased()) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        let data = try JSONSerialization.data(withJSONObject: ["videoId": videoID, "origin": origin.absoluteString])
        guard let config = String(data: data, encoding: .utf8) else { throw CocoaError(.fileReadCorruptFile) }
        return ("""
        <!DOCTYPE html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="referrer" content="strict-origin-when-cross-origin">
        <style>html,body{margin:0;width:100%;height:100%;background:black;overflow:hidden}#player{width:100%;height:100%;border:0}</style>
        </head><body><div id="player"></div>
        <script>window.karaokeVideoConfig=\(config);</script>
        <script>\(script)</script></body></html>
        """, origin)
    }
}
