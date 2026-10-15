# Secure remote access proposal

October 15, 2026. The owner approved account-free device pairing and scoped guest
invitations, and explicitly authorized Cloudflare administrator credential setup.
Implementation and local verification are complete; private launch-agent services
are installed. Public tunnel activation is still pending manual certificate delivery after two callback failures.
Read [REMOTE_ACCESS.md](REMOTE_ACCESS.md) for the current deployment checkpoint.

## Proposed first deployment

Use `https://app.karaoketrain.com` for the web app and its existing `/api` routes.
The native app uses the same origin. A permanent Cloudflare Tunnel connects that
hostname to one production Next.js process on the Mac mini. Public DNS already
delegates `karaoketrain.com` to Cloudflare; `app.karaoketrain.com` and
`api.karaoketrain.com` currently return NXDOMAIN. These were public DNS checks,
not authenticated inspection of the domain's configuration.

The owner has asked for hosting without app sign-in. The earlier Google/Firebase
account proposal was not approved; do not introduce it. Hosting on the Mac mini
does not require adding user accounts.

Revised recommendation: account-free device pairing and scoped guest invitations.
The owner authorizes a phone/browser once using a short-lived, single-use pairing
link or QR code generated locally on the Mac. Redeeming it creates a revocable
device credential. Store only its hash on the server, use Keychain on iOS and a
Secure/HttpOnly cookie in the browser, and never embed a shared administrative
secret in a build. Pairing grants host privileges only when explicitly issued by
the owner. Guests use expiring room-scoped invitations with limited permissions;
a room code alone does not authorize host actions. This credential system is now approved, implemented and locally tested.

An alternative for personal testing is a private device network, such as
Cloudflare One Client or Tailscale. Each device needs the network client and
initial enrollment, with possible later renewal. KaraokeTrain itself needs no
login screen. Restrict network access to the intended service and approved
devices; do not grant the rest of the home network by default.

| Service | Access |
| --- | --- |
| Web app and API | HTTPS through the permanent tunnel; paired devices and scoped room invitations |
| Downloader on port 4000 | Mac mini loopback only, existing server-side bearer secret |
| Demucs, Qwen and alignment workers | Local server processes; no public listener |
| GCS bucket | Private; credentials stay on the Mac mini |
| Maintenance and administration | Local owner access or explicitly authorized owner device only |

Keep the apex domain available for a future landing page. A separate API
hostname is unnecessary while web and native share the existing server.

## Findings that must be addressed before public ingress

The current Next.js API has validation and some rate limits but no user identity
or authorization. `/api/stems` proxies private audio for any valid job ID, and
room codes currently provide access without membership or host permissions.
Exposing the current API would also expose processing and lyric-maintenance
actions. TLS and a tunnel do not supply these missing permissions.

The downloader already requires a secret, but currently listens on all network
interfaces. The web app runs a development server on port 3000. The iOS app has
several independent HTTP/media transports and constructs an HTTP server URL in
its current build configuration. None currently implements shared user sign-in.

## Implementation after approval

1. If the owner selects account-free pairing, implement local pairing issuance,
   short-lived single-use redemption, durable hashed device credentials, expiry
   and revocation. Rate-limit pairing attempts. Browser requests use a secure,
   HttpOnly session cookie; native API requests use revocable device tokens.
   Protect cookie mutations against CSRF and keep invitation secrets out of
   logs, referrers and ongoing URLs. Centralize native credential handling so
   search, room SSE, processing and recording downloads share the same behavior.
2. Make room creation record its authorized host. Issue room-scoped membership
   when an invited guest joins; a four-character code is a discovery mechanism.
   Define host and guest permissions and protect every API route accordingly.
   Bind processing admission and quotas to authorized devices/rooms. Keep bulk cache
   maintenance restricted to the owner.
3. Authorize audio before streaming. Use a supported native authenticated media
   transport, or issue a short-lived scoped media URL after authorization. Do not
   embed a Cloudflare service token, downloader secret or GCS key in the app or
   a permanent media URL. Verify token expiry, seeking and recording exports.
4. Keep long processing in the existing bounded scheduler, and return job handles
   promptly. Convert synchronous long lyric repairs to status polling so an edge
   HTTP timeout does not look like a failed job or start duplicate work.
5. Prepare a production build and supervised Mac mini services, with automatic
   restart, private configuration, bounded logs and health checks. Bind backend
   listeners to loopback. Keep development separate from the public origin.
   Review trusted proxy/IP handling and bypass shared CDN caching for protected
   API/media responses. Room state remains process-local for this first version;
   a restart still loses rooms, so the deployment must be coordinated.
6. Configure the named tunnel and hostname only after the local authorization
   checks pass. No router port forwarding is needed. Test from the iPhone on
   cellular: pairing, denied access, catalog, cached ranged playback, room SSE,
   queue controls, new processing, revocation and expired credentials. Deploy with
   a rollback path, retaining the existing local configuration.

## Review boundaries

The owner previously requested approval for major architecture changes. The
Google/Firebase proposal is superseded by the no-app-sign-in preference. The owner approved account-free pairing and public tunnel setup; a later explicit
approval also covers starting Cloudflare administrator authentication and storing
its certificate privately. Cloudflare account/domain setup
still requires an authorized administrator session once; this is separate from
KaraokeTrain app sign-in. No secret values should be pasted into chat. No paid
services or plan upgrades are part of this proposal.

## Primary documentation

- [Cloudflare routing and public hostnames](https://developers.cloudflare.com/tunnel/concepts/routing/)
- [Cloudflare private web applications and outbound tunnels](https://developers.cloudflare.com/cloudflare-one/setup/secure-private-apps/private-web-app/)
- [Temporary tunnel limitations, including unsupported SSE](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Cloudflare Access service credentials](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
- [Cloudflare private hostname routing and device enrollment](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/connect-private-hostname/)
- Bundled Next.js 16 deployment and self-hosting guides were read before preparing
  this plan. Use the installed documentation again before implementation.
