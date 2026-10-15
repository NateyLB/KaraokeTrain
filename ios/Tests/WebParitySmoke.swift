import Foundation

// Only supplies the unrelated separation error to compile the real party/search models on macOS.
enum StemSeparatorError: Error { case invalid(String) }

@main
struct WebParitySmoke {
    static func main() throws {
        for query in ["Recommend a duet", "what should we sing", "ABBA?", "one two three four five six", "Play something fun"] {
            assert(SearchRouting.asksDJ(query), query)
        }
        for query in ["ABBA Dancing Queen", "The Who", "Goodbye Yellow Brick Road", "  Adele Hello  "] {
            assert(!SearchRouting.asksDJ(query), query)
        }
        let payload = #"{"id":"TEST","isNativeHost":true,"currentSong":null,"queue":[],"settings":{"isPlaying":true,"lyricsOffset":"1.25","firstValidTime":3.5,"vocalsEnabled":false,"vocalsVolume":0.6,"isVideoVisible":false,"lastUpdatedBy":"remote","timestamp":1234},"remoteCommand":{"action":"next","timestamp":1235}}"#
        let party = try JSONDecoder().decode(PartyState.self, from: Data(payload.utf8))
        assert(party.settings?.lyricsOffset == 1.25)
        assert(party.settings?.isVideoVisible == false)
        assert(party.remoteCommand?.action == "next")
        assert(party.history == nil)
        let currentContract = Data(#"{"id":"TEST","currentSong":{"queueId":"first","videoId":"abcdefghijk","jobId":"abcdefghijk","title":"Song","artist":"Artist","art":"https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg","addedAt":10,"jobStatus":{"status":"ready","progress":100,"cached":true,"lyricsRevision":123}},"queue":[{"queueId":"second","videoId":"abcdefghijk","title":"Song","artist":"Artist","addedAt":10}],"settings":{"micEnabled":true,"micVolume":0.4,"echoOn":true,"autoTuneOn":false}}"#.utf8)
        let webParty = try JSONDecoder().decode(PartyState.self, from: currentContract)
        assert(webParty.isNativeHost == nil)
        assert(webParty.currentSong?.id == "first" && webParty.queue[0].id == "second")
        assert(webParty.currentSong?.jobStatus?.lyricsRevision?.rawValue == "123")
        assert(webParty.currentSong?.jobStatus?.cached == true)
        assert(webParty.settings?.micEnabled == true && webParty.settings?.micVolume == 0.4)
        assert(webParty.settings?.echoOn == true && webParty.settings?.autoTuneOn == false)
        let roundTrip = try JSONDecoder().decode(PartyState.self, from: JSONEncoder().encode(webParty))
        assert(roundTrip.currentSong?.queueId == "first")
        assert(roundTrip.currentSong?.jobStatus?.lyricsRevision == webParty.currentSong?.jobStatus?.lyricsRevision)
        let currentRevision = "3:1791960133232"
        var cachedPayload = try JSONSerialization.jsonObject(with: currentContract) as! [String: Any]
        var cachedSong = cachedPayload["currentSong"] as! [String: Any]
        cachedSong["jobStatus"] = ["status": "ready", "cached": true, "lyricsRevision": currentRevision]
        cachedPayload["currentSong"] = cachedSong
        cachedPayload["queue"] = [cachedSong.merging(["queueId": "second"]) { _, new in new }]
        cachedPayload["history"] = [cachedSong.merging(["queueId": "previous"]) { _, new in new }]
        let cachedParty = try JSONDecoder().decode(PartyState.self, from: JSONSerialization.data(withJSONObject: cachedPayload))
        assert(cachedParty.currentSong?.jobStatus?.lyricsRevision?.rawValue == currentRevision)
        assert(cachedParty.queue.first?.jobStatus?.lyricsRevision?.rawValue == currentRevision)
        assert(cachedParty.history?.first?.jobStatus?.lyricsRevision?.rawValue == currentRevision)
        let cachedRoundTrip = try JSONDecoder().decode(PartyState.self, from: JSONEncoder().encode(cachedParty))
        assert(cachedRoundTrip.currentSong?.jobStatus?.lyricsRevision == cachedParty.currentSong?.jobStatus?.lyricsRevision)
        let newRevision = try JSONDecoder().decode(LyricsRevision.self, from: Data(#""3:1791960133233""#.utf8))
        assert(newRevision != cachedParty.currentSong?.jobStatus?.lyricsRevision, "A lyric repair must still trigger refresh")
        for number in ["123.5", "9007199254740993"] {
            let revision = try JSONDecoder().decode(LyricsRevision.self, from: Data(number.utf8))
            assert(revision.rawValue == number, "Legacy numeric revisions must retain their identity")
        }
        for revision in ["", ",\"lyricsRevision\":null"] {
            let legacy = try JSONDecoder().decode(JobStatus.self, from: Data("{\"status\":\"ready\"\(revision)}".utf8))
            assert(legacy.lyricsRevision == nil)
        }
        for revision in ["true", "{}", "[]"] {
            do {
                _ = try JSONDecoder().decode(JobStatus.self, from: Data("{\"status\":\"ready\",\"lyricsRevision\":\(revision)}".utf8))
                assertionFailure("Malformed revision was accepted")
            } catch is DecodingError { }
        }
        let track = try JSONDecoder().decode(Track.self, from: Data(#"{"videoId":"abcdefghijk","title":"Song","artist":"Artist","art":"cover"}"#.utf8))
        assert(track.thumbnail == "cover")
        let invalidNumber = Data(#"{"lyricsOffset":"NaN","vocalsVolume":"Infinity"}"#.utf8)
        let sanitized = try JSONDecoder().decode(PartySettings.self, from: invalidNumber)
        assert(sanitized.lyricsOffset == nil && sanitized.vocalsVolume == nil)
        let dj = try JSONDecoder().decode(DJResponse.self, from: Data(#"{"message":"Try these", "recommended_queries":["Artist Song"]}"#.utf8))
        assert(dj.recommended_queries == ["Artist Song"])
        print("PASS: cached string/legacy numeric revisions, room/queue/history decoding, lyric refresh identity, catalog art, search routing, DJ and settings")
    }
}
