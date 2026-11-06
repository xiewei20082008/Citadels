# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Citadels 3D: a browser card game (Three.js tabletop, vanilla ES modules, no build step). See [README.md](README.md).

## Run & test

```bash
node serve.mjs                 # http://localhost:5173 (ES modules need a server; file:// won't work)
node test/engine.test.mjs      # rules invariants over hundreds of AI games
node test/pressure.mjs 600     # fairness (hidden info), random-move fuzzing, AI behaviour stats
node test/ai-duel.mjs 400      # Cunning vs Normal win rate
```

Three.js and PeerJS load from CDNs (importmap in `index.html`), so the first load needs internet.

## Architecture rules

- **`js/engine.js` is pure and serializable.** `act(state, pid, action)` returns a new state or `{error}`;
  it never throws and never touches the DOM. Humans, AI and network peers all go through `act()`.
- **Hidden information lives in `viewFor(state, pid)`.** The AI (`js/ai.js`, `js/search.js`), peers and the
  UI only ever receive a view. Never pass the full state to the AI — `test/pressure.mjs` re-deals hidden
  info ("twin worlds") and fails if a view changes.
- **Multiplayer is host-authoritative** (`js/main.js` + `js/net.js`): the host runs `act()` and sends each
  seat its own `viewFor`. Peers only send actions.
- `js/main.js` is the controller (state flow, AI pacing, event playback, saves); `js/ui.js` renders the HUD
  from a view; `js/scene.js` renders the 3D table from a view and plays event effects.
- `js/settings.js` owns player preferences (`prefs`, saved in localStorage) and the ⚙️ panel used by both the lobby
  and the game; `js/sfx.js` synthesizes all sound, including the four generative music tracks (`TRACKS`).
- `js/tutorial.js` is the guided first game (spotlight + bubble, steps advance on the player's own actions).
  The engine keeps public per-player tallies (`p.st`, `p.played`) for the end-of-game recap.
- **UI text goes through `t(key)`.** A new key needs English + Chinese in `js/i18n.js` and a translation in every
  `js/lang/*.js` (zh-TW, ja, ko, es, fr, de, pt, ru, it); `test/engine.test.mjs` fails on a missing key or mismatched `{placeholder}`.
- Bump `VERSION` in `engine.js` when saved states become incompatible.

## UI checks

Verify mobile layouts at 393×852 (iPhone 15 Pro): everything must fit without scrolling. Prefer flex/grid
over fixed vh/px sizes.
