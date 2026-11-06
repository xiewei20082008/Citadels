# Citadels 3D · 富饶之城

**English** · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md) · [Italiano](README.it.md)

Build your city on a candle-lit 3D table: pick a secret character each round, outwit your rivals, and score the most points. Finishing first doesn't guarantee the win.

## ▶ [Play now](https://yulunwang.github.io/Citadels/)

**https://yulunwang.github.io/Citadels/**

Nothing to download or install: it runs in any desktop or phone browser. On a phone, use "Add to Home Screen" and it feels like an app.

## How to play

**Against the computer:** tap **Play vs AI**, choose how many opponents (1–6) and the difficulty, then begin.

**Online with friends**
1. Tap **Host online** to get a 6-character room code.
2. Your friends open the same link, tap **Join room** and enter the code.
3. Fill empty seats with **Add AI** if you like, then start.

New to Citadels? The home screen has **How to play**, and during a game the **Hint** button suggests your next move.

## Features

- **2–7 players**, solo or online.
- **Three AI levels:** Easy, Normal and Cunning. The AI only knows what it is allowed to know; it never sees your hand or hidden characters.
- **11 languages:** English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский and Italiano. Pick one in ⚙️ Settings at any time.
- **Settings (⚙️):** four generated music tracks (Candlelight, Moonlit Garden, Neon Citadel, Tavern Night) with volume, AI speed, a check before ending a turn with builds left, turn alerts (tab title flash, vibration), reduce motion and colour-blind card symbols.
- **Learn as you play:** a guided first game, a round-by-round feed of what everyone did (tap the round counter), every choice explained in numbers ("+2 gold, takes the Crown"), and an end-of-game recap with highlights.
- **Never lose a game:** solo games autosave, and online players who refresh go straight back to their seat.
- **Keys:** G gold · D draw · B build · A character ability · E end turn · H hint · 1–9 select a card.

## For developers

No build step: plain JavaScript (ES modules) and Three.js. Run locally:

```bash
node serve.mjs    # then open http://localhost:5173
```

Tests:

```bash
node test/engine.test.mjs     # rules self-check + every language covers every string
node test/pressure.mjs 600    # pressure test: fairness (AI can't see hidden info), random-move fuzzing, AI behaviour stats
node test/ai-duel.mjs 400     # Cunning vs Normal AI win rate
```

| File | Role |
|---|---|
| `js/engine.js` | Rules engine: `act(state, pid, action)` and `viewFor(state, pid)` (what each player may see) |
| `js/ai.js`, `js/search.js` | Computer players (they receive only `viewFor`) and the Cunning level's lookahead |
| `js/scene.js`, `js/models.js`, `js/materials.js` | 3D table, district models, materials |
| `js/ui.js`, `js/lobby.js`, `js/settings.js` | In-game interface and lobby |
| `js/main.js`, `js/net.js` | Game flow, saves, online play (PeerJS) |
| `js/i18n.js`, `js/lang/*.js` | Text: English and Chinese in `i18n.js`, one file per other language |
| `js/data.js`, `js/sfx.js` | Card data, sound |

**Adding a language:** copy `js/lang/fr.js`, translate the values (keep the `{placeholders}`), and register it in `LANGS` and `EXTRA` in `js/i18n.js`. `node test/engine.test.mjs` fails if a key or placeholder is missing.

Merging to `main` publishes the link above automatically, and every pull request gets its own preview link.
