# connect.caudals.com

Event contact cards for the Caudals founders. A visitor scans a QR, taps an NFC
tag or opens a link and lands on a 3D card they can turn, tilt and flip. From
there they save the contact, call, open WhatsApp, email or LinkedIn, or send
their own details back over WhatsApp or email.

A static site: no database, no secrets at runtime, no calls to the main app.

## What is on the page

- **The card.** three.js renders a black ID-1 card (85.6 × 54 mm) with a
  holographic foil mark that breaks into colour where it catches the light,
  and a paper back with the QR and contact details. Drag to turn it, tap to
  flip it; on phones it follows the tilt (iOS asks for motion access from the
  "Move it with your phone" chip).
- **The flow.** Behind it, streamlines part around the card like water around
  a stone (*caudal* means flow): contours of a stream function for uniform
  flow past the projected card, plus slowly advected noise. Pulses travel
  along the lines; a fingertip opens a hole in the field.
- **Contact.** Save contact (vCard 3.0 with the Caudals mark as photo), then
  QR, WhatsApp, Email and LinkedIn tiles; the phone and email rows below call
  and write when tapped.
- **Send me your details.** A sheet that composes a message to the card owner
  and opens WhatsApp (`wa.me`) or the mail app (`mailto:`). Nothing reaches a
  server; the visitor's details are remembered in their own browser only.
- **QR presenter.** Full-screen white QR with a wake lock: the permanent link,
  or an offline QR that carries the contact itself. `#qr` opens it directly.
- **Share.** The system share sheet (AirDrop, Messages, WhatsApp…), or a
  copied link.
- **Offline.** A service worker precaches every card after the first visit;
  the cards can be added to the home screen.
- Light and dark follow the phone. Without WebGL, the flat CSS card stays.
  Reduced motion stops the drift, pulses and idle motion.

Bluetooth is not used: browsers on iOS have no Web Bluetooth, and AirDrop
through the share sheet covers phone-to-phone sharing.

## Routes

| Path | Serves |
| --- | --- |
| `/mario`, `/alonso` | 302 to `/{es,en}/{id}/`, from the first `Accept-Language` tag (Spanish by default). Permanent links for QR codes, NFC tags and Wallet passes. |
| `/{es,en}/{id}/` | The card page. |
| `/{es,en}/{id}/{name}.vcf` | The contact (`text/vcard`, opens the iOS contact sheet). |
| `/{es,en}/` and `/` | Team index. |
| `/{es,en}/setup/` and `/setup` | Owner setup: Wallet passes, QR shortcut, NFC. Unlinked, `noindex`. |
| `/healthz` | Liveness for Swarm. |

Everything is `noindex, nofollow`.

## Layout

```
src/data/        people and copy (es, en): the only place to edit content
src/shared/      vCard, visitor message and the logo mark (page + tests)
src/site/        build-time HTML, routes, QR and the /__media pages
src/client/      page behaviour and styles; scene/ holds the three.js stage
src/sw.js        offline cache (the build fills in the file list)
public/          favicon, icons and share images (generated, committed)
assets/          contact photo and Wallet artwork (generated, committed)
wallet/          passes.json: Wallet serials and install links (committed)
scripts/         media.mjs, wallet.mjs, screens.mjs, still.mjs
test/            node:test checks over dist/ and the shared logic
```

The Vite plugin in `vite.config.ts` renders every page from `src/site` at
build time and serves the same pages from the dev server. Card data lives in
`src/data/people.ts`; profile links mirror `lib/authors.ts` in the main app.

## Commands

```bash
npm install
npm run dev          # http://127.0.0.1:4190/mario
npm run build        # dist/
npm run preview      # dist/ on :4191, with the nginx short links
npm test             # after a build
npm run typecheck
npm run media        # re-render share images, icons and Wallet artwork
npm run wallet       # create or update the Wallet passes (see below)
```

`scripts/screens.mjs` and `scripts/still.mjs` take review screenshots with
Playwright against the dev server.

Changing a name, phone or email: edit `src/data/people.ts` (and the copy if
needed), run `npm run media`, `npm run wallet`, then deploy.

## Wallet passes

`npm run wallet` issues one pass per person and language through the
[WalletWallet](https://walletwallet.dev) API and records the serials and
install links in `wallet/passes.json`. A second run updates the existing
passes in place (PUT), and Wallet refreshes them on every device that added
them. `--dry-run` prints the requests, `--only=mario` and `--locale=es`
narrow them, `--new` issues fresh passes.

- The key is read from `WALLETWALLET_API_KEY` or
  `~/.config/caudals/walletwallet.env` (`WALLETWALLET_API_KEY=…`, mode 600). It
  is never committed or printed; a test fails if a key appears in the repo or
  the build.
- The account is on WalletWallet's Pro trial until 2026-11-12 (1,000 passes a
  month). Branding images, the poster artwork and in-place updates are Pro
  features: passes issued now keep their look, but updates after the trial
  need a paid plan or a new pass.
- Each pass shows the permanent link as a QR, the name, role, phone and email,
  with links on the back. iOS 27 and later draw the poster layout with the
  flow artwork; older iOS shows the classic black card.
- The signed `.pkpass` files land in `wallet/out/` (ignored).

## Setting up your phone

Open `connect.caudals.com/setup` on the phone.

1. **Wallet.** Tap *Add to Apple Wallet* under your name (Android: *Google
   Wallet*); it opens WalletWallet's install page for your pass. To show it,
   open Wallet and tap the pass. For one-gesture access, touch and hold the
   Lock Screen → Customize → add the Wallet control. The pass also appears on
   an Apple Watch paired with the phone.
2. **Home Screen.** Open your card in Safari → Share → Add to Home Screen.
3. **QR in one gesture.** Shortcuts → new shortcut → *Open URLs* with
   `https://connect.caudals.com/mario#qr`. Assign it to the Action button or to
   Settings → Accessibility → Touch → Back Tap → Double Tap.
4. **NFC.** Write `https://connect.caudals.com/mario` as a URL record to an
   NTAG213/215 sticker or card with the NFC Tools app and stick it on the
   phone case. iPhones (XS and later) and Android phones open it with a tap.
   On Android Chrome the setup page can write the tag itself.
5. **No signal.** In the QR presenter, *Offline* shows a code with the contact
   inside, which the other phone saves without internet.

## Deployment

`scripts/deploy-connect.sh` (repo root) runs `npm ci`, typecheck, build and
tests, uploads a release to `~/connect-releases/<tag>` on atlantic, builds
`caudals-connect:<tag>` from `infra/connect/Dockerfile` (nginx-unprivileged,
read-only), checks the config and routes in a throwaway container, rolls the
`caudals-connect` Swarm stack (start-first, automatic rollback), installs
`/etc/dokploy/traefik/dynamic/caudals-connect.yml` and probes the public URL.
It keeps the newest three releases and images.

Cloudflare proxies `connect.caudals.com` (A record to atlantic); Traefik
terminates TLS with Let's Encrypt.

## Acceptance

- `npm test` passes after `npm run build` (routes, links, QR decoding, vCard
  framing, CSP-safe markup, precache list, message composition, language
  negotiation, Wallet links, no key in the build).
- On an iPhone: the card renders and moves, tilt works after the motion chip,
  *Save contact* opens the contact sheet, WhatsApp and email open prefilled,
  the QR presenter scans from another phone in both modes, and the page
  reloads in airplane mode after one visit.
- Light and dark both render; without WebGL the flat card remains.
