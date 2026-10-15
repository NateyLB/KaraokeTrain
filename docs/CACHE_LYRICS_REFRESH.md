# Refreshing cached lyrics

Cache maintenance uses the existing processing scheduler and `/api/lyrics/sync` endpoint. It reads the saved multiplex audio's isolated vocal channel, so it does not download YouTube media or separate stems again. Keep the local API running with the normal GCS configuration and Qwen/Whisper environments installed.

Create a new snapshot before changing the bucket:

```sh
node --env-file=.env.local tools/refresh-lyrics-cache.mjs --prepare
```

The command prints a new `uploads/.lyric-refresh/RUN_ID` directory. It backs up metadata and full transcripts for every catalog entry, including JSON `null` when no transcript exists. Backup errors prevent processing. The directory is ignored by Git and contains song lyrics; retain it locally until the changes have been reviewed.

Start or resume that snapshot:

```sh
node --env-file=.env.local tools/refresh-lyrics-cache.mjs --run uploads/.lyric-refresh/RUN_ID
```

Use `--limit 1` for a pilot. Processing is sequential and shares admission with interactive processing. `results.json` checkpoints each title, `REPORT.md` summarizes the run, and `metadata.after.json` / `transcription.after.json` verify successful publication. To stop safely, create a file named `STOP` inside the run directory or send SIGINT; the current song finishes first. Remove `STOP` before resuming. Completed titles are skipped. A process lock prevents two runners from sharing one run.

Whisper-only and missing transcripts are regenerated with independent Qwen ASR and Qwen forced alignment. Existing Qwen text is reused. A separate audio timing pass may refine word boundaries when its confidence and coverage checks pass; rejected evidence leaves the Qwen alignment intact. A timing worker error holds the title for review rather than publishing a partial pass.

For LRCLIB entries, the saved original-language text is checked against independent Qwen evidence. Verified word intervals retain all saved lyric versions and timestamps. Drift triggers alignment using the existing validated-reference engine. A failed text match is held, with the candidate transcript saved locally for inspection; the batch does not silently substitute a different lyric source.

Every publication checks that metadata still matches its snapshot, saves the full Qwen transcript and then updates lyric metadata and revision. A newer edit produces a conflict instead of being overwritten. Repeating a successfully published request with the same run ID is idempotent. To intentionally recheck a completed title after an engine fix, prepare a new snapshot and keep the previous one for rollback.

## October 15, 2026 run

The original snapshot is `2026-10-15T16-21-28-308Z` (103 titles). Its first two Whisper upgrades exposed a NumPy integer JSON serialization error in timing diagnostics. Their Qwen text was saved, but the optional timing pass failed. Processing stopped after those two titles; the serialization regression is fixed and timing failures now block publication.

The replacement snapshot is `2026-10-15T16-41-53-202Z`, also covering all 103 titles. It retries those timing passes using their existing Qwen text before processing the remaining titles. See that directory's journal and report for current progress. Both snapshots are retained.
