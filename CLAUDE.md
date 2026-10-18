# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for TP-Link and Mercusys routers
with the "LuCI" web page (`/webpages/index.html`, API under
`/cgi-bin/luci/;stok=…/`): a Node.js service (Node 22+, ESM, no build step)
that runs in its own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. Every minute by default it logs in to the web
page with the local password, reads a few forms and logs out. The protocol was
learned from the tplinkrouterc6u Python library (GPL-3.0, see NOTICE); the
client is a new implementation, never a translation of its code. Transport:
local only.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/tplink-api.test.js       # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect()
src/tplink-api.js       web page client: the four login flavours, one queued
                        session at a time, lockout guard, error kinds
src/crypto.js           RSA PKCS#1 v1.5 and OAEP (BigInt), AES-128-CBC, hashes
src/read.js             router answers -> plain snapshots (null, never 0, when unknown)
src/watcher.js          the timer loop: one session per round, slow forms every
                        10 min, pause of the readings
src/tracker.js          snapshots -> scene trigger transitions, presence (pure logic)
src/store.js            MAC addresses already met, in /data/known-hosts.json
src/events.js           scene trigger payloads and scene action outputs
src/device.js           router, Wi-Fi network and client devices, their states
src/widgets.js          overview, internet, Wi-Fi and network dashboard widgets
src/config.js           configuration (address, password, TLS, intervals, pause, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/helpers/fixtures.js            a fake router: the server side of the four login flavours
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (router `main`, Wi-Fi network `<host|guest|iot>_<2g|5g|6g>`,
  client MAC without separators: never a name), feature `category` / `type` /
  `unit` / `min` / `max` / `step`, the keys of `config_schema`, `actions`, the
  widgets and their settings, scene triggers (fields, options, variables) and
  scene actions (fields, outputs). `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs** come from the SDK constants and have an icon in
  the Gladys front (`test/devices.test.js` lists them). CPU and memory are
  `level-sensor` / `decimal` in %; the time connected is `duration` in hours.
  Do not change them without a migration.
- **`should_poll` stays false**: the router is read on the integration's own
  timer, one session for every device. It never resyncs on existing devices.
- **One administrator at a time.** The web page logs out whoever was there at
  each login (`confirm=true`). Never open a session per device or per request:
  every router access goes through `api.session()`, which queues them, and
  always logs out (except after a reboot). Keep the default interval at a
  minute and the pause working.
- **Lockout.** A refused password stops the logins for 15 minutes; a lock
  waits for the time the router gives. Detection tries the flavours from the
  most specific one and never tries again after a refusal of a known flavour.
- **Protocol changes.** A new firmware flavour goes into `tplink-api.js` AND
  the fake router of `test/helpers/fixtures.js`. Check the fake router against
  the real library when you can (its clients must log in to it): the fake is
  the only router the tests know.
- **Secrets.** The password is RSA-encrypted before it leaves, never logged,
  never in an URL. The status form carries the Wi-Fi keys
  (`*_psk_key`): never log an answer, never keep these fields.
- **Presence** is `presence-sensor` / `push`, like the Bluetooth presence of
  Gladys: 1 re-published every minute while the client is listed, 0 once,
  after the absence delay. A pause freezes it and gives every present client a
  fresh delay when it ends.
- **The first round is a baseline**: no scene event replays history after a
  restart or a configuration change. A change the integration makes itself
  never fires a scene trigger.
- **Optional forms** (perf, smart network, firmware, IPv4 settings) are skipped
  for an hour when the router refuses them; only the status form decides
  whether the round failed. Add a test with the real answer when a new shape
  shows up.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. Widget button labels hold 24
  characters, a status row 40 (label and value).
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. The name stays "TP-Link / Mercusys Router" (the Home Assistant name:
  the community tracker matches it). A field older cores do not know needs a
  higher `gladys_version` minimum: a widget button with a form would need
  5.2.0. Transport: `["local"]`.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
