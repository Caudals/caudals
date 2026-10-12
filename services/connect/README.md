# Caudals Connect

Public, mobile-first event contact cards at **https://connect.caudals.com**.
Permanent links: `/mario` and `/alonso`; Spanish and English pages live at
`/{es,en}/{mario,alonso}`. The root is a two-person directory. Short links default
to Spanish; language switching stays on the same person's card.

## Event use

1. Open your personal link on your phone and add it to the home screen.
2. Tap **Mi QR / My QR**. The other person scans with their camera, then taps
   **Guardar contacto / Save contact** to import the vCard.
3. The same sheet has native sharing, copy-link fallback, and a downloadable QR
   image. Saving the image in Photos is the most dependable no-reception backup.
4. **Sin conexión / Offline contact** encodes the name, company, phone and email
   directly. The scanning phone needs a camera/reader that understands vCards.
5. An existing NFC card/tag can store the permanent HTTPS link as an NDEF URL.
   No NFC hardware is required or supplied. Bluetooth/AirDrop options come from
   the OS share sheet where available; the site does not implement peer pairing.

The “Keep it handy” sheet contains these setup instructions. Browser caching
requires opening the card online first. There is no recipient registration,
lead capture, database, cookie, analytics script or external QR service.

## Design and implementation

The public Paper system: warm paper, ink, original Caudals mark, Geist and
Newsreader. A typeset identity panel and hairline contact rows; primary contact
save plus a reachable QR action. QR sheets use a white quiet zone, screen wake
lock when supported, native dialog focus handling and reduced-motion support.

`src/content.mjs` is the contact/copy source; names and profile links mirror
`lib/authors.ts`. `build.mjs` generates complete HTML, social preview images,
vCard 3.0 files, QR SVG/PNG assets, per-person manifests and a versioned offline
cache. `src/client.js` adds dialogs/share/copy/cache registration. Contact links
and vCards work without JavaScript. Build-time React/Lucide render SVG icons;
neither React nor a third-party script ships to the browser.

All personal details are intentionally public, authorized by the founders for
sharing; noindex/robots prevent ordinary discovery, not access. Changing an
email/phone requires updating `content.mjs`, rebuilding and redeploying. The
permanent QR URL survives such changes; previously downloaded offline QRs and
saved address-book contacts retain their old data.

## Build and deploy

From the repository root (root dependencies must also be installed):

```sh
npm ci --prefix services/connect
npm --prefix services/connect run build
bash scripts/deploy-connect.sh
CONNECT_BASE_URL=https://connect.caudals.com npm --prefix services/connect test
```

For local work run `npm --prefix services/connect run dev` after building,
then `npm --prefix services/connect test` in another terminal. Preview binds
only to `127.0.0.1:4179`; production routing/headers are owned by Nginx.

The deploy script packages only the static output and `infra/connect`, builds a
versioned image on atlantic, validates Nginx, deploys `caudals-connect_web` on
`dokploy-network`, and atomically installs its own Traefik route file. It does
not deploy the main app or touch PostgreSQL. The runtime is an unprivileged,
digest-pinned Nginx container, no host port, 64 MiB memory cap. Cloudflare's
proxied `connect` A record points to atlantic. TLS uses the existing Let's
Encrypt resolver. No new paid hosting subscription.

Releases are retained under `/home/caudals/connect-releases/<release>`.
`/release.json` exposes the static version for acceptance. To roll back, deploy
the retained image with `CAUDALS_CONNECT_IMAGE=caudals-connect:<prior-release>`
and its retained stack file; preserve the contact data and permanent hostname.
Do not prune active/rollback images as part of a normal deploy.

## Acceptance, 2026-10-12

Live release `1754cd922a0f`, image `caudals-connect:8085050b50d82e10`.
All six automated checks passed against the public HTTPS hostname. The serving
container is healthy, the Swarm update completed at 1/1, and fetched contact,
QR, JavaScript and service-worker assets match local build SHA256 hashes.
Public mobile screenshots were reviewed with no browser console errors.
Unknown paths return 404; contact downloads use `text/vcard`. Email markup
opts out of Cloudflare's per-address obfuscation so mail links work without JS;
zone-wide settings remain untouched.

- Browser suite: Chromium and WebKit; both founders/languages; 320, 390, 768 and
  1440 px without horizontal overflow; dialogs/focus return; PNG downloads.
- Independent decoding of all 8 generated SVG/PNG QR assets; offline QR also
  decoded from a rendered 320 px-wide phone viewport.
- vCard CRLF/line folding and exact phones, emails, names and LinkedIn URLs.
- Native-share payload/cancellation and denied-clipboard fallback (browser
  mocks); no-JavaScript contact links; actual Chromium offline reload/navigation.
- WebKit cache population is verified, but its automated offline emulation
  fails before the service worker. **Physical iPhone/Android contact import,
  camera scanning, home-screen installation and native share sheet remain
  device acceptance checks**, not claimed as completed by desktop automation.

Use a short two-phone check before the event: scan each founder's QR, import the
contact, verify its details, then open the saved QR image in airplane mode.
