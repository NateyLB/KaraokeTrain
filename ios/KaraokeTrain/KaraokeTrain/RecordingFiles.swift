import AVFoundation
import Foundation

nonisolated enum RecordingFiles {
    static func pcmSettings(_ format: AVAudioFormat) -> [String: Any] {
        var settings = format.settings
        settings[AVLinearPCMIsNonInterleaved] = false
        return settings
    }
    static let maximumBytes: Int64 = 2 * 1024 * 1024 * 1024
    static let maximumMediaBytes: Int64 = 512 * 1024 * 1024
    static func directory() throws -> URL {
        let parent = FileManager.default.temporaryDirectory.appendingPathComponent("KaraokeTrainRecordings", isDirectory: true)
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        // A terminated app can leave an unshared export; retain it for at most a day.
        for url in (try? FileManager.default.contentsOfDirectory(at: parent, includingPropertiesForKeys: [.creationDateKey])) ?? [] {
            if let date = try? url.resourceValues(forKeys: [.creationDateKey]).creationDate, Date().timeIntervalSince(date) > 86400 {
                try? FileManager.default.removeItem(at: url)
            }
        }
        let folder = parent.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try checkBudget(folder)
        return folder
    }
    static func checkBudget(_ folder: URL) throws {
        let values = try folder.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey, .volumeAvailableCapacityKey])
        let important = values.volumeAvailableCapacityForImportantUsage ?? 0
        let free = important > 0 ? important : values.volumeAvailableCapacity.map(Int64.init)
        if let free, free < 512 * 1024 * 1024 {
            throw RecordingError("Storage is low. Free some space before recording again.")
        }
        var bytes: Int64 = 0
        if let files = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: [.fileSizeKey]) {
            for case let url as URL in files {
                bytes += Int64((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
                if bytes > maximumBytes { throw RecordingError("This recording reached its temporary storage limit.") }
            }
        }
    }
}

nonisolated struct RecordingError: LocalizedError, Sendable {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

/// Download straight to disk, with per-file limits and cancellable URLSession ownership.
nonisolated final class RecordingMediaDownload: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    private let destination: URL
    private let lock = NSLock()
    private var continuation: CheckedContinuation<URL, Error>?
    private var session: URLSession?
    private var task: URLSessionDownloadTask?
    private var cancelled = false
    init(destination: URL) { self.destination = destination }

    func run(_ url: URL) async throws -> URL {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                lock.lock(); defer { lock.unlock() }
                guard !cancelled else { continuation.resume(throwing: CancellationError()); return }
                self.continuation = continuation
                let configuration = URLSessionConfiguration.ephemeral
                configuration.timeoutIntervalForRequest = 60
                configuration.timeoutIntervalForResource = 600
                let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
                self.session = session
                let task = session.downloadTask(with: url)
                self.task = task; task.resume()
            }
        } onCancel: { self.cancel() }
    }
    private func cancel() {
        lock.lock(); cancelled = true; let task = task; lock.unlock()
        task?.cancel()
    }
    private func complete(_ result: Result<URL, Error>) {
        lock.lock()
        let continuation = continuation, session = session
        self.continuation = nil; self.task = nil; self.session = nil
        lock.unlock()
        continuation?.resume(with: result)
        session?.finishTasksAndInvalidate()
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        if totalBytesWritten > RecordingFiles.maximumMediaBytes || totalBytesExpectedToWrite > RecordingFiles.maximumMediaBytes { downloadTask.cancel() }
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        do {
            guard let response = downloadTask.response as? HTTPURLResponse, response.statusCode == 200 else { throw RecordingError("Could not fetch cached audio for the recording.") }
            let size = Int64((try location.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0)
            guard size > 0, size <= RecordingFiles.maximumMediaBytes else { throw RecordingError("Cached audio exceeds the recording size limit.") }
            try FileManager.default.moveItem(at: location, to: destination)
            try RecordingFiles.checkBudget(destination.deletingLastPathComponent())
            complete(.success(destination))
        } catch { complete(.failure(error)) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error { complete(.failure(error)) }
    }
}
