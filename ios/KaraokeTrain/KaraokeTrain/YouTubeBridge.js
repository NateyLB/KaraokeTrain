/* Shared with the bridge regression tests; bundled as an iOS resource. */
(function () {
    'use strict';
    const config = window.karaokeVideoConfig;
    let player;
    let ready = false;
    let wantedTime = 0;
    let wantedPlaying = false;
    let appliedPlaying = null;
    function notify(type, code) {
        window.webkit.messageHandlers.karaokeVideo.postMessage({ videoId: config.videoId, type, code: code || 0 });
    }
    function apply(force) {
        if (!ready) return;
        player.mute();
        const state = player.getPlayerState();
        // Seeking/reissuing play every half second can keep a slow connection
        // perpetually buffering. Only correct drift when playing, or when paused.
        if (force || state === 1 || !wantedPlaying) {
            const actual = player.getCurrentTime();
            if (Number.isFinite(actual) && Math.abs(actual - wantedTime) > (wantedPlaying ? 1.5 : 0.25)) {
                player.seekTo(wantedTime, true);
            }
        }
        if (force || appliedPlaying !== wantedPlaying) {
            appliedPlaying = wantedPlaying;
            if (wantedPlaying) player.playVideo(); else player.pauseVideo();
        }
    }
    window.syncPlayback = function (time, playing) {
        if (!Number.isFinite(time) || time < 0) return;
        wantedTime = time;
        wantedPlaying = Boolean(playing);
        apply(false);
    };
    window.onYouTubeIframeAPIReady = function () {
        player = new YT.Player('player', {
            width: '100%', height: '100%', videoId: config.videoId,
            playerVars: { autoplay: 0, controls: 0, playsinline: 1, rel: 0, origin: config.origin },
            events: {
                onReady: function () { ready = true; notify('ready'); apply(true); },
                onStateChange: function (event) { if (event.data === 1) notify('playing'); },
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
