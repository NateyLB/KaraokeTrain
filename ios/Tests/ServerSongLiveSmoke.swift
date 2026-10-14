import Foundation

@main
struct ServerSongLiveSmoke {
    static func main() async throws {
        guard CommandLine.arguments.count == 3 else { throw URLError(.badURL) }
        let service = ServerSongService(baseURL: CommandLine.arguments[1])
        let id = CommandLine.arguments[2]
        // Read-only: this ID must already have a ready job in the running server.
        let prepared = try await service.waitForSong(jobID: id) { _, _ in }
        assert(prepared.lyrics != nil)
        let url = try service.audioURL(jobID: id)
        var request = URLRequest(url: url)
        request.setValue("bytes=0-1023", forHTTPHeaderField: "Range")
        let (audio, response) = try await URLSession.shared.data(for: request)
        assert((response as? HTTPURLResponse)?.statusCode == 206 && audio.count == 1024)
        print("PASS: native shared song service reads cached lyrics and ranged GCS audio")
    }
}
