# Squeek Maze Sprint design

## Overview

The product is a compact arcade game for keyboard and touch players. Its visual idea is a charcoal control panel around a pixel maze: yellow marks things to collect and the primary action; cyan identifies the observed wheel signal. The maze is the dominant surface. The first screen contains the game and Start action, with no landing page or hero.

The implementation lives in `src/styles.css`, `src/App.tsx`, and `src/components.tsx`. All artwork is original SVG/canvas code. The design uses the pinned Better Interface principles and its six-domain review; evidence and limitations are in `artifacts/validation.md`.

## Colors

Canonical UI values are semantic custom properties in `src/styles.css:10`, backed by the charcoal, yellow, cyan, and coral primitives. Keep UI colors in that system; SVG/canvas artwork uses the same palette as literal drawing values.

| Semantic token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `#111619` | Page and dark text on yellow controls |
| `--color-surface` | `#171e22` | Opaque start/result overlays and dialogs |
| `--color-raised` | `#1e282d` | Neutral controls, modifier strip, hover surface |
| `--color-control` | `#29373d` | Pressed and disabled control fill |
| `--color-border` | `#60747a` | Visible control, dialog and board boundaries |
| `--color-border-muted` | `#29373d` | Noninteractive separators and disabled boundaries |
| `--color-text` | `#eef2ef` | Primary text |
| `--color-muted` | `#a8b4b7` | Labels, instructions, secondary data |
| `--color-accent` | `#f4d45c` | Primary action, score, collectible diamonds |
| `--color-accent-hover` | `#ffe381` | Primary hover/press feedback |
| `--color-signal` | `#6bddda` | Fresh telemetry, source links, safe start square, shield |
| `--color-focus` | `#6bddda` | Two-pixel keyboard perimeter with four-pixel offset |
| `--color-danger` | `#ff928e` | Cross-marked hazards and final-ten-second timer |

The maze floor is `#131b1f`, wall fill `#29373d`, and wall stroke `#60747a`. The hamster uses `#dca477`, `#f1bd9b`, `#f5dfbd`, `#b87c58`, and dark facial details. These art colors are not general UI accents. Status text and geometric symbols carry meaning in addition to color. Measured contrast pairs are recorded in validation; no light theme is implemented.

## Typography

`--font-body` is the system sans stack `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. `--font-display` is `'Silkscreen', monospace`, loaded locally as WOFF2 from the pinned `@fontsource/silkscreen` dependency. Its OFL text is at `public/licenses/silkscreen-OFL.txt` and in the export. The display face supplies regular 400; system text uses 400/600, with 700 only in the tiny hazard symbol. No external font request occurs.

| Token | Default size | Use |
| --- | --- | --- |
| `--text-xs` | 12px / .75rem | Telemetry, provenance, legends, supporting labels |
| `--text-sm` | 14px / .875rem | Body UI, buttons, panel headings |
| `--text-base` | 16px / 1rem | Data subheadings, copy textarea, narrow result title |
| `--text-lg` | 24px / 1.5rem | Brand, overlay headings, wheel state, compact counters |
| `--text-xl` | 32px / 2rem | Desktop score/time and mobile result score |
| `--text-2xl` | 48px / 3rem | Desktop result score |

Body line height is 1.5; dialog prose 1.6; pixel headings 1.3 and counters 1.2. Tracking stays natural. Changing numbers use tabular figures. Headings balance; short prose uses pretty wrapping. Hashes use selectable monospace text with `overflow-wrap: anywhere`, and are never ellipsized. The copy fallback textarea is 16px to avoid input zoom on phones. Display typography is deliberately pixel inspired; prose remains sans serif.

## Layout

Spacing is based on four pixels, with `--space-1/2/3/4/6/8/10` = 4/8/12/16/24/32/40px. Header, brand, buttons, legend, panel, and dialog reuse those variables; compact adaptations also use 6, 10, 20, and 28px where density requires them. Controls have distinct rectangular shapes and aligned reading edges.

The app has a 1360px outer maximum and 40px desktop inset. `.game-shell` is at most `min(1088px, 100svh + 24px)`, with a flexible game column, 264px information rail, and 40px gap. `.arena` keeps a square aspect ratio, limited by available width and `100svh - 280px`. HUD counters flex and wrap at their actual content widths. The header also wraps under text enlargement. The footer uses the same maximum as the game.

| Breakpoint | Implemented behavior |
| --- | --- |
| At most 66rem | 28px outer inset, 240px rail, 28px column gap, smaller counters |
| At most 52.99rem | One column capped at 560px, 20px inset, full-width square board, rail hidden, 44×44 touch direction pad shown |
| At most 28rem | 16px inset, compact 76px header, icon-only source utility with retained accessible name, smaller overlays/counters |
| At most 22rem | 12px inset, smaller wordmark and optional collection detail omitted from compact chrome; observation time wraps when needed |
| Desktop at most 850px high | Tighter panel gaps and footer spacing |

The phone signal strip retains a text state and normally the original UTC observation time. The touch-help block shows the active gameplay modifier and a Retry control when unavailable. Source details remain accessible from the header even while the rail is hidden. SVG coordinates scale with the maze; keyboard directions always refer to physical movement.

Overlays are bounded by the arena with internal scrolling when enlarged text exceeds available space. Dialogs are at most 640px wide and `100svh - 48px` high, with normal vertical scrolling. Full IDs wrap. The 390px screenshot shows Start inside the board on the first viewport. Browser layout checks cover 320, 390, 768 and 1440px and 200% root text enlargement. Native browser zoom, physical devices, and RTL translation were not verified; English is the implemented language.

## Elevation & Depth

There are no box shadows, gradients, decorative cards, scanline effects, or glow layers. Tonal surfaces provide grouping. A one-pixel outline with five-pixel offset forms the board bezel. The ready/pause/result state dims the preview board with `#0b1014b8`; text sits on an opaque surface. Native dialog backdrops use `#080c10d9`, and `showModal()` makes background content inert.

## Shapes

Controls use four-pixel radii; the keyboard diagram uses three pixels, the arena and walls two, game overlays six, and dialogs eight. Collectibles are diamonds; coral hazards are larger diamonds with a dark cross; the start square and post-hit shield are cyan outlines. The pixel hamster has a distinct silhouette. Borders communicate structure and state rather than decorative elevation.

## Components

- `Icon` in `src/components.tsx`: one set of current-color, square-ended SVG utility icons. Decorative SVG is hidden from assistive technology. Text or a button name supplies the action.
- `HamsterPixels` / `HamsterMark`: reusable original pixel mascot. Use the mark for branding and the pixel group inside the maze, not as a decoration on unrelated content.
- `MazeBoard({ game, active, reduced })`: scaled 630×630 SVG with static walls and deterministic collectibles/patrols. The accessible image label reports position and remaining Squeeks. Essential movement continues as discrete steps under reduced motion.
- `Modal({ title, children, close })`: native dialog, labelled heading, close control, Escape/backdrop dismissal, explicit Tab wrapping and focus restoration. Opening help/data during play pauses the run; closing never silently resumes it.
- `.primary-button`: one yellow primary action per state. Start fetches a fresh snapshot and shows an honest pending label; Play again starts a new run. Neutral secondary actions share/copy or download the card.
- `.instrument-row`: stable score, active-time countdown, local round best and pause/resume. Counters wrap under enlargement rather than overlap.
- `.signal-strip`, `.modifier`, `.provenance`: fresh/unknown/demo states use explicit text, the original observation time and source link. No synthetic telemetry is presented as live.
- `.dpad` / `.direction-*`: four native 44px controls. Pointer capture supports held movement and cancellation. Single taps advance only when the movement cooldown permits; arrow/WASD keys provide the equivalent keyboard path.
- Result overlay / copy dialog in `src/App.tsx`: score and local storage feedback; native share, clipboard or selectable text; persistent download/error status. There is no global leaderboard.

In `prefers-reduced-motion: no-preference`, color transitions are 120ms, player steps 85ms, hazard steps 330ms, and primary press scale .96. Under reduced motion these CSS transitions and press scaling are absent. The game always has an explicit pause control and pauses when its tab is hidden. Hover styling is gated by `(hover: hover)`.

## Do's and Don'ts

Start additions with the existing shell, semantic color tokens, six-step type scale, and native buttons/dialogs. Keep the maze and primary action ahead of optional explanation. Use cyan only for signal/source/focus roles, yellow for the primary action and collection/score, and coral for hazards.

Keep exact hashes available and make data loss recoverable. Maintain the distinction between the API's delayed current round, the round anchor, a fresh hardware observation, and the offline demo. Do not add a landing hero, decorative cards, extra fonts, simulated live counters, wallet infrastructure, rewards, or an implied public leaderboard.

For another help view, reuse `Modal`, its heading/close pattern, and the existing body tokens. Preserve focus return and pausing, test at 320/390px and enlarged text, then rebuild the export and source download. Design guidance attribution and licenses are retained under `artifacts/`.
