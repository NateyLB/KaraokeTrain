/* Shared with the bridge regression tests; bundled as an iOS resource. */
(function () {
    'use strict';
    const config = window.karaokeVideoConfig;
    let player;
    let ready = false;
    let wantedTime = 0;
    let wantedPlaying = false;
    let appliedPlaying = null;
    let revision = 0;
    let pausePending = false;
    let pauseRequest = null;
    function cancelPauseRequest() {
        if (pauseRequest !== null) clearTimeout(pauseRequest);
        pauseRequest = null;
    }
    function notify(type, code, details) {
        window.webkit.messageHandlers.karaokeVideo.postMessage(Object.assign({ videoId: config.videoId, type, code: code || 0 }, details));
    }
    function apply(force) {
        if (!ready) return;
        player.mute();
        const state = player.getPlayerState();
        // Seeking/reissuing play every half second can keep a slow connection
        // perpetually buffering. Only correct drift when playing, or when paused.
        // seekTo starts a cued/ended/buffering video. Defer that seek while
        // audio is paused; seeking an already-paused video preserves its state.
        if ((force || state === 1 || !wantedPlaying) && (wantedPlaying || state === 1 || state === 2)) {
            const actual = player.getCurrentTime();
            if (Number.isFinite(actual) && Math.abs(actual - wantedTime) > (wantedPlaying ? 1.5 : 0.25)) {
                player.seekTo(wantedTime, true);
            }
        }
        if (force || appliedPlaying !== wantedPlaying) {
            appliedPlaying = wantedPlaying;
            if (wantedPlaying) { pausePending = false; player.playVideo(); }
            else if (state === 1 || state === 3) {
                pausePending = true;
                player.pauseVideo();
            }
        }
    }
    window.syncPlayback = function (time, playing, nativeRevision = 0) {
        if (!Number.isFinite(time) || time < 0 || !Number.isSafeInteger(nativeRevision) || nativeRevision < revision) return;
        if (nativeRevision !== revision) cancelPauseRequest();
        wantedTime = time;
        wantedPlaying = Boolean(playing);
        revision = nativeRevision;
        apply(false);
    };
    function requestPlayback(playing) {
        wantedPlaying = playing;
        appliedPlaying = playing;
        notify('playbackRequested', 0, { playing, revision });
    }
    function stateChanged(event) {
        if (!ready) return;
        cancelPauseRequest();
        const state = event.data;
        if (state === 1) notify('playing');
        if ([2, 0, 5, -1].includes(state)) pausePending = false;
        // A playing event can arrive after a native pause command while the
        // iframe is finishing a seek/buffer. Complete that pause without echo.
        if (state === 1 && pausePending) { player.pauseVideo(); return; }
        if (state !== 1 && state !== 2) return;
        const playing = state === 1;
        if (playing === wantedPlaying) return; // Native command acknowledgment.
        if (playing) { requestPlayback(true); return; }
        // Seek/play commands can briefly report paused before buffering/playing.
        // Forward a stable pause, without turning that transition into a stop.
        const pausedRevision = revision;
        pauseRequest = setTimeout(function () {
            pauseRequest = null;
            if (ready && revision === pausedRevision && wantedPlaying && player.getPlayerState() === 2) requestPlayback(false);
        }, 80);
    }
    window.onYouTubeIframeAPIReady = function () {
        player = new YT.Player('player', {
            width: '100%', height: '100%', videoId: config.videoId,
            playerVars: { autoplay: 0, controls: 0, playsinline: 1, rel: 0, origin: config.origin },
            events: {
                onReady: function () { ready = true; notify('ready'); apply(true); },
                onStateChange: stateChanged,
                onError: function (event) { notify('error', event.data); },
                onAutoplayBlocked: function () { notify('blocked'); }
            }
        });
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = function () { notify('network'); };
    document.head.appendChild(script);
})();
