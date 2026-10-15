#!/bin/sh
set -eu

native_test_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
native_repo_root=$(dirname "$native_test_root")
native_sources="$native_test_root/KaraokeTrain/KaraokeTrain"
native_output=$(mktemp -d "${TMPDIR:-/tmp}/karaoketrain-native-tests.XXXXXX")
trap 'rm -rf "$native_output"' EXIT HUP INT TERM

compile_and_run() {
    native_case=$1
    shift
    xcrun swiftc -module-cache-path "$native_output/modules" "$@" -o "$native_output/$native_case"
    "$native_output/$native_case"
}

cd "$native_repo_root"
node --test tests/youtube-bridge.test.mjs
compile_and_run access "$native_sources/ServerAccess.swift" "$native_test_root/Tests/ServerAccessSmoke.swift"
compile_and_run timeline "$native_sources/LyricsModel.swift" "$native_sources/LyricTimeline.swift" "$native_test_root/Tests/LyricTimelineSmoke.swift"
compile_and_run document "$native_sources/LyricsModel.swift" "$native_sources/LyricTimeline.swift" "$native_sources/LyricDocument.swift" "$native_test_root/Tests/LyricDocumentSmoke.swift"
compile_and_run glyphs "$native_sources/LyricsModel.swift" "$native_sources/LyricTimeline.swift" "$native_sources/LyricTextLayout.swift" "$native_test_root/Tests/LyricTextLayoutSmoke.swift"
compile_and_run events "$native_sources/ServerEventDecoder.swift" "$native_test_root/Tests/ServerEventsSmoke.swift"
compile_and_run contract "$native_sources/ServerAccess.swift" "$native_sources/ServerConfiguration.swift" "$native_sources/ServerEventDecoder.swift" "$native_sources/Models.swift" "$native_sources/PartyViewModel.swift" "$native_sources/SongSearchModel.swift" "$native_test_root/Tests/WebParitySmoke.swift"
compile_and_run service "$native_sources/ServerAccess.swift" "$native_sources/Models.swift" "$native_sources/SongPreparationState.swift" "$native_sources/ServerSongService.swift" "$native_test_root/Tests/ServerSongServiceSmoke.swift"
compile_and_run overlap "$native_sources/DemucsOverlap.swift" "$native_test_root/Tests/OverlapSmoke.swift"
compile_and_run benchmark "$native_sources/StemSeparationMetrics.swift" "$native_sources/BenchmarkReportFile.swift" "$native_test_root/Tests/BenchmarkReportSmoke.swift"
compile_and_run microphone "$native_sources/PitchDetector.swift" "$native_sources/AudioCaptureContracts.swift" "$native_sources/MicrophoneModel.swift" "$native_test_root/Tests/MicrophoneSmoke.swift"
compile_and_run effects "$native_sources/AudioEngineConnections.swift" "$native_sources/VocalEffectsGraph.swift" "$native_test_root/Tests/VocalEffectsSmoke.swift"
compile_and_run recording "$native_sources/ServerAccess.swift" "$native_sources/RecordingTimeline.swift" "$native_sources/RecordingFiles.swift" "$native_sources/RecordingAudioRenderer.swift" "$native_sources/MicrophoneRecordingWriter.swift" "$native_sources/RecordingExporter.swift" "$native_test_root/Tests/RecordingSmoke.swift"

if { [ "${1:-}" = "--live-api" ] || [ "${1:-}" = "--live-media" ]; } && [ "$#" -eq 3 ]; then
    if [ "$1" = "--live-api" ]; then
    xcrun swiftc -module-cache-path "$native_output/modules" "$native_sources/ServerAccess.swift" "$native_sources/ServerConfiguration.swift" "$native_sources/ServerEventDecoder.swift" "$native_sources/PartyViewModel.swift" "$native_test_root/Tests/RoomConnectionSmoke.swift" -o "$native_output/room"
    "$native_output/room" "$2"
    xcrun swiftc -module-cache-path "$native_output/modules" "$native_sources/ServerAccess.swift" "$native_sources/Models.swift" "$native_sources/SongPreparationState.swift" "$native_sources/ServerSongService.swift" "$native_test_root/Tests/ServerSongLiveSmoke.swift" -o "$native_output/song"
    "$native_output/song" "$2" "$3"
    fi
    xcrun swiftc -module-cache-path "$native_output/modules" "$native_sources/AudioMixer.swift" "$native_test_root/Tests/StreamingPlaybackSmoke.swift" -o "$native_output/audio"
    "$native_output/audio" "$2/api/stems?jobId=$3&stem=multiplex"
    xcrun swiftc -module-cache-path "$native_output/modules" "$native_sources/ServerAccess.swift" "$native_sources/Models.swift" "$native_sources/SongPreparationState.swift" "$native_sources/ServerSongService.swift" "$native_sources/RecordingTimeline.swift" "$native_sources/RecordingFiles.swift" "$native_sources/RecordingAudioRenderer.swift" "$native_sources/RecordingExporter.swift" "$native_test_root/Tests/CachedRecordingLiveSmoke.swift" -o "$native_output/cached-export"
    "$native_output/cached-export" "$2" "$3"
elif [ "$#" -ne 0 ]; then
    echo "Usage: $0 [--live-api|--live-media SERVER_URL CACHED_VIDEO_ID]" >&2
    exit 2
fi
