# Mac mini remote access

The owner approved account-free device pairing and expiring guest invitations on
October 15, 2026. No Firebase or Google app sign-in is used. The Mac mini keeps
the downloader, Demucs, Qwen and private GCS credentials.

## Current deployment checkpoint

The secured production API and downloader are installed as user launch agents on
`127.0.0.1:3100` and `127.0.0.1:4100`. They start when the Mac user logs in and
restart on failure. The API prevents idle sleep while it runs. The development
server on port 3000 is preserved. Neither new listener is directly public.

`https://app.karaoketrain.com` became live on October 19, 2026 after the owner
completed CLI login successfully. Its dedicated `karaoketrain-mac-mini` named
tunnel is installed as a user launch agent, with four connected Cloudflare
connections at activation. Only this hostname routes to port 3100; unmatched
hostnames return 404. The downloader remains private on loopback port 4100.
The account certificate, tunnel credential and actual ingress configuration
are kept in the ignored `.runtime/cloudflared` directory with private permissions.

Public HTTPS checks passed for health, 13 anonymous API denials, single-use
pairing, cookie CSRF, guest room scopes, all 103 catalog entries, cached
processing bypass, a private GCS audio byte range and active SSE revocation.
Temporary test credentials and invitations were removed after verification.
The production build includes the LRCLIB wording publication safeguard in
`91cb6c3`. The prior build is retained privately for rollback. The public browser
displays the expected **Pair this device** screen. A physical iPhone/cellular
playback and recording check remains pending.

The native source supports pairing by scanning a QR code or pasting a link,
Keychain storage, authenticated room/search/processing/recording requests, and
AVFoundation media cookies scoped to the paired HTTPS origin. Debug and Release
simulator builds pass. An updated build still needs installation and a physical
iPhone/cellular test; the old phone build does not contain these changes.

## Credentials and permissions

- Pairing links contain 256-bit random secrets in URL fragments. They last ten
  minutes and can be redeemed once. Host/owner credentials last 180 days and can
  be revoked. The first owner credential is issued by a local CLI, not by a
  public bootstrap endpoint. Paired owners can issue host credentials.
- Guests redeem a room invitation that lasts two hours and permits at most 32
  redemptions. Their credentials permit room reads, catalog/search and adding
  songs to that room. They cannot host, control playback/settings/queue order,
  stream private stems, request lyric repairs, use DJ generation or administer
  devices. New uncached queue additions are limited per credential; cached
  additions retain the normal queue/request limits.
- Removing guest access changes the room's invitation generation, invalidating
  old links and guest credentials. Revoking a host also removes its invitations
  and owned rooms. Active SSE connections recheck access on every snapshot and
  heartbeat, with at most four connections per device.
- The server stores credential hashes in `.runtime/access/state.json`, protected
  by file permissions and serialized atomic writes. Browser credentials use
  Secure/HttpOnly/Strict cookies and session-bound CSRF headers on mutations.
  Native credentials use Keychain and exact-origin bearer headers; AVFoundation
  gets an explicit HTTPS media cookie. Tokens never appear in media URLs.
- Production fails closed without `ACCESS_MODE=paired` and a valid HTTPS
  `PUBLIC_ORIGIN`. Every protected API has a route-level guard. Authenticated
  responses bypass shared caching. No app credentials belong in a build,
  Cloudflare service token, public bucket or Git.

## Local operations

Private production settings are in ignored `.env.production.local`; existing
service credentials remain in `.env.local`. The production build uses
`.next-production`, separate from the running development app.

```sh
npm run build:server
node tools/mac-services.mjs --install
```

Installation refuses to replace an existing launch-agent definition. Prepared
definitions are saved under `.runtime/launchagents`; inspect changes before
replacing installed files. The labels are `com.karaoketrain.remote.api`,
`com.karaoketrain.remote.downloader` and, after tunnel activation,
`com.karaoketrain.remote.tunnel`. Use `launchctl print gui/UID/LABEL` to inspect a
service and `launchctl kickstart -k gui/UID/LABEL` to restart it, substituting the
Mac user's numeric UID and the exact label. Restarting the API loses in-memory
rooms and jobs. Device credentials survive.

Each service has private output/error logs in `.runtime/logs`, rotated at 5 MiB
with one previous file per stream. The supervisor owns a separate process group
and stops subprocesses when the service exits. The development and production
apps share a Mac processing lease so heavy workers cannot overlap over the same
audio workspace. A crash can leave this lease intentionally closed. After
confirming that its recorded process is stopped, run:

```sh
npm run access -- recover-worker-lock
```

The recovery command refuses a live or invalid PID. Credential-store lock
recovery is separately available through `recover-lock`; do not delete a live
writer's lock.

## Cloudflare activation and owner pairing

The domain already delegates public DNS to Cloudflare. After the administrator
authorization completes, keep the origin certificate and tunnel credentials in
`.runtime/cloudflared` with private permissions. `cloudflared login` may write
its certificate to `~/.cloudflared/cert.pem`; move the newly generated file into
the project's private directory without overwriting any pre-existing credential.

Inspect existing tunnels before creating a named `karaoketrain-mac-mini` tunnel.
If automatic login does not deliver a certificate, use the [Cloudflare
certificate download page](https://dash.cloudflare.com/argotunnel) in the
authorized browser and save the downloaded `cert.pem` privately on the Mac. A
[Cloudflare maintainer documents this fallback](https://github.com/cloudflare/cloudflared/issues/264).
Never paste the certificate contents into chat.

Use [the configuration template](../ops/cloudflared.example.yml), substituting
the actual UUID and private credential path. Only `app.karaoketrain.com` routes
to port 3100; the final ingress rule returns 404. Keep the downloader un-routed.
Validate the tunnel configuration, create the exact DNS route, and install its
launch agent with `node tools/mac-services.mjs --tunnel --install`. Never put a
tunnel token in command output, Git or the iOS app.

To issue an owner pairing locally:

```sh
npm run access -- pair --role owner --name "Owner phone"
```

The CLI prints private file paths and expiry, not the secret. Scan
`.runtime/access/pairing.png` in the updated native app, or use
`.runtime/access/pairing-link.txt` in a browser. Issue a fresh link if ten minutes
have elapsed. Paired owners use **Devices & invitations** on the web to manage
devices; hosts create guest links there or from the native room's invite button.
Nothing sends an invitation to another person automatically.

## Verification

`npm test` passes 93 JavaScript and 28 Python checks. Lint, the production build,
the native regression suite, and iOS Debug/Release simulator builds pass. The
production dependency audit reports zero known vulnerabilities. Live tests use
an isolated production process and temporary credentials:

```sh
node --env-file=.env.local --env-file=.env.production.local tools/check-remote-access.mjs
```

To check the installed server through Cloudflare, add `--public`. It requires
the paired production environment, creates temporary owner/guest credentials
and a random room, then removes only its own credentials and invitations. It
does not restart the public server. SSE checks parse complete events rather
than assuming each network chunk contains one event.

They verify denied anonymous routes, single-use pairing, secure cookie flags,
CSRF, room-scoped guests, revocation of an active SSE connection, all 103 saved
catalog titles, cached processing bypass, and a real private GCS byte range.
They do not process new songs or publish lyric metadata. The unpaired production
web screen was also checked in the in-app browser.

Physical iPhone QR/camera operation, Keychain behavior, native streaming and
recording against public TLS, and cellular connectivity remain pending. The
separate cache-lyrics refresh is also incomplete; its staged results and original
wording backups remain in [CACHE_LYRICS_REFRESH.md](CACHE_LYRICS_REFRESH.md).
