import Foundation

@main
struct ServerEventsSmoke {
    static func main() throws {
        for ending in ["\n", "\r\n", "\r"] {
            let stream = "\u{feff}: ping\(ending)event: room\(ending)data: {\"text\":\(ending)data: \"你好 🎤\"}\(ending)\(ending): ping\(ending)\(ending)data: second\(ending)\(ending)"
            var decoder = ServerEventDecoder()
            let events = try stream.utf8.compactMap { try decoder.consume($0) }
            assert(events.map { String(decoding: $0, as: UTF8.self) } == ["{\"text\":\n\"你好 🎤\"}", "second"])
        }
        var decoder = ServerEventDecoder(maximumBytes: 16)
        do {
            for byte in "data: ".utf8 + Array(repeating: UInt8(65), count: 30) { _ = try decoder.consume(byte) }
            assertionFailure("Unterminated events must be bounded")
        } catch let error as URLError { assert(error.code == .dataLengthExceedsMaximum) }
        var multiline = ServerEventDecoder(maximumBytes: 16)
        do {
            for byte in String(repeating: "data: abc\n", count: 10).utf8 { _ = try multiline.consume(byte) }
            assertionFailure("Multiline events must be bounded")
        } catch let error as URLError { assert(error.code == .dataLengthExceedsMaximum) }
        print("PASS: SSE split UTF-8, multiline frames, heartbeats, BOM, CR/LF variants and bounded incomplete events")
    }
}
