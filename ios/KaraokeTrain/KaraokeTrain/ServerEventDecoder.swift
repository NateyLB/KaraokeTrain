import Foundation

/// Incremental SSE framing, including split UTF-8, multiline data and CR/LF variants.
/// Bounds retained bytes even if a server never finishes a line or event.
nonisolated struct ServerEventDecoder {
    private var line: [UInt8] = []
    private var data: [UInt8] = []
    private var hasData = false
    private var firstLine = true
    private var previousWasCR = false
    private let maximumBytes: Int

    init(maximumBytes: Int = 2 * 1024 * 1024) { self.maximumBytes = maximumBytes }

    mutating func consume(_ byte: UInt8) throws -> Data? {
        if byte == 10, previousWasCR { previousWasCR = false; return nil }
        previousWasCR = byte == 13
        if byte == 10 || byte == 13 { return try finishLine() }
        guard line.count + data.count < maximumBytes else { throw URLError(.dataLengthExceedsMaximum) }
        line.append(byte)
        return nil
    }

    private mutating func finishLine() throws -> Data? {
        if firstLine {
            firstLine = false
            if line.starts(with: [0xef, 0xbb, 0xbf]) { line.removeFirst(3) }
        }
        defer { line.removeAll(keepingCapacity: true) }
        if line.isEmpty {
            guard hasData else { return nil }
            let event = Data(data.dropLast()) // SSE removes the final data-field newline.
            data.removeAll(keepingCapacity: true)
            hasData = false
            return event
        }
        guard line.first != 58 else { return nil } // heartbeat/comment
        let colon = line.firstIndex(of: 58) ?? line.count
        guard line[..<colon].elementsEqual("data".utf8) else { return nil }
        var start = min(colon + 1, line.count)
        if start < line.count, line[start] == 32 { start += 1 }
        guard data.count + line.count - start + 1 <= maximumBytes else { throw URLError(.dataLengthExceedsMaximum) }
        data.append(contentsOf: line[start...])
        data.append(10)
        hasData = true
        return nil
    }
}
