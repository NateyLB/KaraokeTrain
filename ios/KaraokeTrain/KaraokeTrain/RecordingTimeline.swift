import Foundation

nonisolated struct RecordingTransport: Equatable, Sendable {
    let jobID: String?
    let songTime: Double
    let playing: Bool
    let vocalsGain: Double
}

nonisolated struct RecordingSegment: Equatable, Sendable {
    let jobID: String
    let start: Double
    var duration: Double
    let songStart: Double
    let vocalsGain: Double
}

/// Intervals use the player's actual clock. Buffering/paused intervals stay silent.
nonisolated struct RecordingTimeline: Sendable {
    static let maximumDuration = 15.0 * 60
    private(set) var segments: [RecordingSegment] = []
    private var previous: (time: Double, state: RecordingTransport)?

    mutating func update(at time: Double, state: RecordingTransport) {
        guard time.isFinite, time >= 0, state.songTime.isFinite, state.songTime >= 0,
              state.vocalsGain.isFinite else { return }
        let time = min(time, Self.maximumDuration)
        guard previous == nil || time >= previous!.time else { return }
        if let previous, previous.state.playing, let jobID = previous.state.jobID, time > previous.time {
            let duration = time - previous.time
            if let last = segments.last, last.jobID == jobID,
               abs(last.start + last.duration - previous.time) < 0.0001,
               abs(last.songStart + last.duration - previous.state.songTime) < 0.08,
               last.vocalsGain == previous.state.vocalsGain {
                segments[segments.count - 1].duration += duration
            } else {
                segments.append(RecordingSegment(jobID: jobID, start: previous.time, duration: duration,
                                                 songStart: previous.state.songTime, vocalsGain: min(1, max(0, previous.state.vocalsGain))))
            }
        }
        previous = (time, state)
    }

    mutating func finish(at time: Double) {
        guard let previous else { return }
        update(at: time, state: previous.state)
        self.previous = nil
    }
}
