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

Add `--analyze` to prepare transcripts and alignment diagnostics locally without publishing metadata or transcripts to GCS. These entries are marked `analyzed`, with `transcription.candidate.json` saved in the snapshot. A subsequent run without `--analyze` processes them for publication, reusing local independent transcripts. This mode was verified against the live bucket: the pilot's metadata hash stayed identical to its backup.

Use `--ids VIDEO_ID,OTHER_ID` to limit a pilot or retry to specific snapshot entries. Unknown or empty selections are rejected before processing. This allows verified entries to be published while other candidates remain staged for review; the run still accounts for the entire inventory.

Use `--preview` to recompute candidate alignment from completed local transcripts and compare its wording with the snapshot. It writes `alignment.candidate.json` per prepared title and `preview-summary.json` with staged IDs safe to publish under the existing wording policy. It never supplies audio to the worker, loads an ASR model or publishes to storage. Prepared text and timing are inspected with the actual engine, rather than a second implementation. The initial preview covered 65 prepared titles without errors; only the already-verified LRCLIB title was safe among the staged candidates, because other realignments also changed wording.

Whisper-only and missing transcripts are regenerated with independent Qwen ASR and Qwen forced alignment. Existing Qwen text is reused. A separate audio timing pass may refine word boundaries when its confidence and coverage checks pass; rejected evidence leaves the Qwen alignment intact. A timing worker error holds the title for review rather than publishing a partial pass.

For LRCLIB entries, the saved original-language text is checked against independent Qwen evidence. Verified word intervals retain all saved lyric versions and timestamps. Drift triggers alignment using the existing validated-reference engine. A failed text match is held, with the candidate transcript saved locally for inspection; the batch does not silently substitute a different lyric source.

Every publication checks that metadata still matches its snapshot, saves the full Qwen transcript and then updates lyric metadata and revision. A newer edit produces a conflict instead of being overwritten. Repeating a successfully published request with the same run ID is idempotent. To intentionally recheck a completed title after an engine fix, prepare a new snapshot and keep the previous one for rollback.

## October 15, 2026 run

The original snapshot is `2026-10-15T16-21-28-308Z` (103 titles). Its first two Whisper upgrades exposed a NumPy integer JSON serialization error in timing diagnostics. Their Qwen text was saved, but the optional timing pass failed. Processing stopped after those two titles; the serialization regression is fixed and timing failures now block publication.

The replacement snapshot is `2026-10-15T16-41-53-202Z`, also covering all 103 titles. It retried those timing passes using their existing Qwen text. Twenty titles were published before pausing, including all five original Whisper upgrades and all four missing/unavailable entries across the two runs.

A subsequent targeted pass completed the remaining two Qwen-only entries and published the verified Jon Pardi entry, bringing publication to 23 titles. All originally non-LRCLIB entries are complete. `Day After Day` passed timing refinement with 86.9% word coverage and reduced collapsed intervals from 82 to 2. Both verified LRCLIB entries retain their saved text and timestamps exactly. Preparation of the remaining reference-based entries continues in analysis-only mode.

The first held LRCLIB result exposed a greedy repeated-section matching error. On the saved independent transcript, the old matcher found 165 matching words; a monotonic comparison finds 271. Engine version 4 now uses a shared monotonic matcher for reference validation, cached timing checks and confidence-bounded timing refinement. Cached timing uses timestamps only to break equally strong text matches; its total time bonus cannot outweigh one matching token.

The engine's existing hybrid alignment can replace unsupported reference lines with Qwen text. The owner approved adding a separate Qwen forced-alignment pass to preserve verified LRCLIB wording. Implement and test this pass before publishing the remaining staged candidates. Analysis has stopped cleanly after another 55 titles were staged (78 prepared total, including the 23 publications); STOP remains present and no lock remains. Keep the original snapshot as the reference for original LRCLIB wording, because earlier published hybrid results can contain Qwen substitutions. See the active journal and report for current progress. Both snapshots are retained.

Two prepared candidates need reference-text review: `0qaxkig-x7s` (I Still Feel Her III) and `psy0SmI1Lf8` (Common Jasmine Orange). The first saved reference matches only 8–9% of either independent Qwen or Whisper transcript. The owner approved Qwen fallback for clear reference mismatches, after trying to find a correct fresh LRCLIB reference. These titles have not been republished. Fresh exact-match LRCLIB lookups returned no candidates; later broader lookups hit the provider's rate limit and were stopped.

A third wrong saved reference was found for `b7k0a5hYnSI` (Unwritten): the old reference contains remix/guest verses. A fresh exact LRCLIB reference matches 96% of the Qwen transcript and is staged in `fresh-candidates.json` in that title's active-run directory. Generic title-decoration cleanup now removes `(as featured …)` so this lookup works without song-specific rules. That cleanup and its passing regression test remain uncommitted. The original saved references remain backed up.
