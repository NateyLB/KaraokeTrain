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
        let invalidNumber = Data(#"{"lyricsOffset":"NaN","vocalsVolume":"Infinity"}"#.utf8)
        let sanitized = try JSONDecoder().decode(PartySettings.self, from: invalidNumber)
        assert(sanitized.lyricsOffset == nil && sanitized.vocalsVolume == nil)
        let dj = try JSONDecoder().decode(DJResponse.self, from: Data(#"{"message":"Try these", "recommended_queries":["Artist Song"]}"#.utf8))
        assert(dj.recommended_queries == ["Artist Song"])
        print("PASS: web-compatible search routing, DJ payload, remote commands and numeric/string settings")
    }
}
