import Foundation

nonisolated struct Track: Identifiable, Codable {
    var id: String { videoId }
    let videoId: String
    let title: String
    let artist: String
    let duration: Int
    let thumbnail: String

    private enum CodingKeys: String, CodingKey {
        case videoId, title, artist, duration, thumbnail, albumArt, art
    }

    init(videoId: String, title: String, artist: String, duration: Int = 0, thumbnail: String = "") {
        self.videoId = videoId
        self.title = title
        self.artist = artist
        self.duration = duration
        self.thumbnail = thumbnail
    }

    nonisolated init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        videoId = try values.decode(String.self, forKey: .videoId)
        title = try values.decode(String.self, forKey: .title)
        artist = try values.decode(String.self, forKey: .artist)
        duration = try values.decodeIfPresent(Int.self, forKey: .duration) ?? 0
        thumbnail = try values.decodeIfPresent(String.self, forKey: .thumbnail)
            ?? values.decodeIfPresent(String.self, forKey: .albumArt)
            ?? values.decodeIfPresent(String.self, forKey: .art)
            ?? ""
    }

    nonisolated func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(videoId, forKey: .videoId)
        try values.encode(title, forKey: .title)
        try values.encode(artist, forKey: .artist)
        try values.encode(duration, forKey: .duration)
        try values.encode(thumbnail, forKey: .thumbnail)
    }
}
// Lyrics models are in LyricsModel.swift
