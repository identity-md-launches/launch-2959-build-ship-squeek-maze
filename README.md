# Squeek Maze Sprint

A playable, 60-second hamster maze game. Collect 72 yellow Squeeks, dodge four moving hazards, and chase a personal best. The first screen is the game. Keyboard, a touch direction pad, and swipe-and-hold controls all work without an account or wallet.

The interface uses charcoal surfaces, signal yellow, cyan telemetry, locally bundled Silkscreen display type, and original pixel artwork. It respects reduced motion. Game points have no financial value. The game only reads public data; it does not interact with or attempt to influence the real hamster.

## Install, run, and rebuild

Use Node.js 24 or newer and npm. No environment file, private credential, backend, or wallet project ID is required.

```sh
npm ci
npm run dev
```

Create and preview the complete static export:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Vite prints the preview address. `dist/index.html`, its JavaScript/CSS, WOFF2 font, favicon, Open Graph PNG, font license, and source download are the deployable site. `base: './'` makes the export work at an IPFS gateway subpath. No server routing or external font service is needed. An offline game still requires that the static site was loaded; there is deliberately no service worker or persistent asset cache.

`npm run build` first creates a complete source download at `public/source.zip`, then exports it with the site. The ZIP includes source, tests, scripts, manifest, lockfile, public assets, README, design documentation, and validation records. It excludes dependencies, generated export, browser caches, screenshot binaries, and the self-referential export-size report. Rebuild after changing source or documentation to refresh the download. The original source is MIT licensed; Silkscreen retains its OFL license.

## Squeekchain integration

All requests are credential-free GETs to the [official public API](https://docs.squeekchain.com/developers/api/). The API currently serves Sepolia; the UI displays the network returned by the API rather than assuming a network.

| Endpoint | Supported schema | Data used |
| --- | --- | --- |
| [`/v1/status`](https://api.squeekchain.com/v1/status) | 1 | `measurement.rpmMilli`, `coreStatus`, `provenance`, `freshness`, `observedAt`, `receivedAt`, `staleAfterSeconds`, installation identity |
| [`/v1/core`](https://api.squeekchain.com/v1/core) | 1 | Squeek block height, genesis timestamp, round duration, block units, latest source hash, and `BatchSettled` history |
| [`/v1/economy/state`](https://api.squeekchain.com/v1/economy/state) | 2 | `lifecycle.currentRound`, network, installation identity, and safe-block timestamp |

`src/api.ts` checks schemas and required fields, rejects inconsistent installations/networks, and rejects chain snapshots older than ten minutes. Chain data is the API's confirmation-delayed view: its round is the round at its safe Ethereum block, not a round invented from the browser clock. The [official core documentation](https://docs.squeekchain.com/developers/core/) defines round 1 as beginning at genesis.

### A stable board for the entire round

Squeek blocks are accounted for by settlements; the official API does **not** expose an independent hash for each Squeek block. The game reads the latest settlement source hash at run start and shows it in **Source & data**. For a fair board that cannot change partway through a round, it selects the latest `BatchSettled` event whose Ethereum timestamp is at or before that round's start:

```text
roundStart = genesisTimestamp + (currentRound - 1) × roundDuration
seed = "squeek-maze-sprint:v1:" + installationId + ":" + currentRound + ":" + roundAnchorHash
```

This uses the latest available settlement anchor **at the round boundary**, instead of the changing Ethereum tip. The dialog displays both the latest source hash and the fixed anchor in full. If the API history cannot supply a valid anchor, it enables the labelled offline demo instead of inventing a hash. After a run starts, its identity and maze remain fixed even if the API advances to the next round.

`src/maze.ts` uses FNV-1a and Mulberry32 with explicit 32-bit arithmetic. A depth-first maze generator carves a 21×21 board, adds 23 loops, and deterministically lays out 72 collectibles and four legal patrol routes. All collectibles are reachable. No browser randomness affects the board. Version the seed prefix when changing the generator.

### The wheel changes real gameplay

During a run, status refreshes approximately every five seconds, after the preceding request completes. The ready screen refreshes the complete chain snapshot every third poll, and every Start action fetches all three endpoints again.

- Fresh hardware RPM above zero: the player moves **10% faster** (`140ms / 1.1` per grid step).
- Fresh hardware RPM at zero: hazards take **35% longer** per step (`440ms × 1.35`).
- Missing, stale, unhealthy, simulated, replayed, or derived observations: neutral speeds. The last observation timestamp is preserved as historical information, with an unavailable status.

The client checks both observation and receipt times, the API's freshness flag, a maximum 120-second sensor age, and successful polling within the past 15 seconds. API-generated timestamps are never relabelled as observation times. The displayed timestamp is UTC. The official endpoint is linked from the panel and provenance dialog.

Requests time out after six seconds. HTTP failures, unsupported schemas, invalid JSON, unavailable responses, missing anchors, and network failures produce an explicit **Offline demo** with a fixed practice seed and no fictional round, height, hash, or wheel activity. Demo scores are stored separately. If only the wheel signal fails during a live run, its board stays fixed and movement becomes neutral. Retry controls and automatic polling allow recovery. `Retry-After` on 429/503 responses is respected.

## Rules and results

Hold arrows or WASD; on touchscreens, hold a direction button or swipe and hold on the board. P, Escape, and Pause stop the timer. Switching tabs pauses the run. Opened dialogs also pause it; resume explicitly afterwards.

A Squeek adds 10 points, a hazard removes 25 with a floor of zero, and clearing the board adds 100 and refills collectibles. Bumps grant a 1.8-second shield. Penalties never create a hidden debt against future pickups. Runs finish after 60 seconds of active play.

Best scores are stored by API round and installation, with separate demo records, under `squeek-maze-sprint:best:v1` in localStorage. At most 100 records remain. Storage denial/corruption does not prevent playing or sharing. Scores are local and editable by the browser owner; there is no global leaderboard or trusted competition. Live modifiers can vary between runs.

Results support native text sharing, clipboard copying, a selectable-text fallback, and a real 1200×630 PNG download. The PNG records the score, collection count, bumps, round/data mode, and settlement anchor. No rewards, assets, or tokens are awarded.

## Validation

```sh
npm test
npm run typecheck
npx playwright install chromium
npm run build
npm run test:browser -- --project=chromium
npm run check:api
npm run check:export
```

Browser tests manage a temporary foreground preview themselves and validate the built export at `/preview/`. The full suite also defines a WebKit project, runnable with `npx playwright install webkit` and `npm run test:browser -- --project=webkit` on a host with its system libraries. Browser downloads and test outputs belong in a disposable location; for this assignment they used `PLAYWRIGHT_BROWSERS_PATH=test/scratch/browsers`.

Optional asset and fresh-data screenshot reproduction:

```sh
npm run assets
npm run build
npm run capture
```

`assets` regenerates the Open Graph PNG with Chromium. `capture` forwards **unmodified current official API responses** from the validation driver because direct external browser HTTPS was unavailable in this environment. That forwarding is exclusively a local validation tool; the production browser client calls the official API directly. Screenshots never use the frozen unit/browser fixtures. The 60-second interaction check uses Playwright's clock instead of waiting in real time.

Recorded checks: **20 unit tests**, **12 Chromium interaction tests** (including landscape-phone and touch-tablet layouts), production build and TypeScript check, **16/16 taste@1 checks**, and targeted axe scans. See [artifacts/validation.md](artifacts/validation.md) for actual results, fixes, review coverage, and limitations. [DESIGN.md](DESIGN.md) documents the final implementation. The report is worker evidence, not independent certification.

## Submission and publication

The complete source, lockfile, and production `dist/` are the submission deliverables. The requested site label is **`squeek-maze-sprint`**. The public GitHub repository, IPFS pin, and ENS assignment are external publication steps; no repository URL, CID, or resolved ENS name is claimed here. The site includes a functioning source ZIP download while those identifiers are assigned.

The allowed submission remains below 8 MiB. `.gitignore` has this explicit path budget:

| Ignored path | Purpose | Submitted bytes |
| --- | --- | --- |
| `**/node_modules/` | Generated installed dependencies at every depth | 0 |
| `/.cache/` | Local tool/package caches | 0 |
| `/test/scratch/` | Disposable tests, browser downloads, traces, and probe output | 0 |

No ignore rule hides `dist/`, source, public runtime assets, manifests, or lockfiles. No dependency archives, vendored registry, or submodule are delivered.
