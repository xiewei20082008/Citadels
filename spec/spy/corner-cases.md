# Spy corner cases

Scope: potential game bugs and AI turn/round bugs for the Spy in this repository. These are review and test scenarios, not confirmed defects. The Spy is implemented as character 18, rank 2; this document remains a regression checklist.

## Rule baseline

See [goal.md](goal.md) and the publisher's [Citadels rulebook](https://coolplay.rs/wp-content/uploads/2024/03/Citadels_pravila-Eng.pdf), printed pages 4, 8, 10-11. The two-card cap is this project's custom rule. Deck exhaustion follows the existing engine's partial-draw behavior.

For match count `M`, target gold `G`, and deck size `D` immediately before resolution:

```text
goldStolen = min(M, G)
cardsGained = min(M, 2, D)
```

Count actual card instances in the target's hand, including duplicate districts. Do not use `colorCount()`: that helper counts city districts and treats School of Magic specially for income.

## Game resolution

| ID | Scenario | Expected result / potential bug to prevent |
| --- | --- | --- |
| G01 | Zero matches, nonempty target hand | Reveal privately, transfer nothing, and consume the ability. Do not allow another guess after seeing the hand. |
| G02 | Target hand is empty | A legal other-player target yields zero rewards and completes normally. Do not copy the Wizard's nonempty-hand restriction. |
| G03 | Three matches, one gold, ample deck | Steal one gold and gain two cards. Card gains must not be reduced to the gold stolen. |
| G04 | Three matches, zero gold, ample deck | Steal zero gold and gain two cards. A penniless opponent remains legal. |
| G05 | Five matches, seven gold, ample deck | Steal five gold and gain two cards. The cap applies only to cards. |
| G06 | Two matches, ample gold, one card left | Steal two gold and gain one card; no retry, fabricated card, or unresolved choice. |
| G07 | Matches exist, deck empty | Resolve the hand inspection and gold transfer; gain zero cards. |
| G08 | Two copies of the same matching district | Count both cards, rather than distinct district names. |
| G09 | School of Magic or Haunted City is in hand | Use its printed purple type. City income/scoring exceptions must not change its type in hand. |
| G10 | Matching districts in the target's city but none in hand | Gain nothing. Inspect only the hand at resolution time. |
| G11 | Library or Observatory belongs to the Spy | Gain Spy cards directly; do not invoke the ordinary resource draw/keep workflow or increase the Spy cap. |
| G12 | Spy also gains cards through gathering resources or Smithy | Those sources retain their own rules and do not consume the Spy allowance. |
| G13 | Inspect a target with an unrevealed or killed character | Player targeting remains legal; do not import Thief restrictions on character ranks. The target's character identity stays hidden. |
| G14 | Spy was killed or was not drafted | No Spy turn or ability action becomes available. |
| G15 | Two- or three-player game, same player has another character | Gold and hand are shared; the second character's turn cannot invoke Spy again. Self-targeting is still illegal. |
| G16 | Use before resources, after resources, or after building | Each timing is legal while otherwise free to act. Gathering resources remains mandatory; the normal build limit remains in force. |
| G17 | Double-click or replay the same ability action | First valid action resolves once; subsequent submission is rejected without extra inspection or rewards. |
| G18 | Missing/invalid color, self-target, invalid player ID, wrong actor or phase | Return an error without mutating state, consuming the ability, emitting events, or exposing a hand. Validate all inputs before resolution. |
| G19 | A keep choice or Magistrate/Graveyard interrupt is active | Finish the existing decision first. A Spy action must not bypass `currentActor()` or clear pending work. |
| G20 | Spy's own first paid build triggers a warrant | Preserve normal confiscation handling; after the response, resume the same turn with its Spy usage state intact. |
| G21 | Save/reload or host recovery immediately after inspection | Restore gold, cards, usage flag, and any private inspection state consistently. Do not replay rewards or leave a hidden modal blocking the turn. |
| G22 | Target builds, swaps, loses, or gains cards after inspection | An earlier observation must not expose the target's continuously updated hand. Never move or duplicate a card just to display it. |

## Privacy and multiplayer

| ID | Scenario | Expected result / potential bug to prevent |
| --- | --- | --- |
| P01 | Choose target and type through separate UI steps | Neither step exposes the hand until both choices are committed. After inspection, changing the type or target is forbidden. |
| P02 | Other players, spectators, or network peers receive `viewFor()` | They receive no private card identities through hand fields, inspection snapshots, pending choices, events, logs, or hints. |
| P03 | Host broadcasts a Spy event | Public reward counts may be visible; the full inspected hand and newly drawn card identities must remain private. Current `viewFor()` copies the event list, so private payloads need explicit filtering. |
| P04 | Spy view contains a hand snapshot | Treat it as knowledge, not a second physical card zone. Count physical cards only once in conservation checks. |
| P05 | A remote client submits forged match count, reward amount, or cards | Host derives all effects from authoritative state. Clients supply only the allowed choices. |
| P06 | Reconnect, AI takeover, or advisor requests a view | Give the same seat only the knowledge allowed by the chosen inspection-memory policy; never pass the authoritative state to the AI or advisor. |
| P07 | A stale request arrives in a later Spy turn | A per-turn used flag alone cannot reject a request from an earlier turn. Consider round/turn identity for network submissions and test delayed delivery. |

## AI decisions and complete rounds

| ID | Scenario | Expected result / potential bug to prevent |
| --- | --- | --- |
| A01 | Hidden hands or deck order change while permitted observations stay identical | AI input stays identical; with the same random stream, its choice stays identical. Extend the existing twin-world fairness checks. |
| A02 | Predict district types | Use known deck multiplicities, public cards, own cards, and legitimate observations. Remaining unseen cards are not the same as the actual deck. |
| A03 | Estimate capped rewards | Evaluate `E[min(M, G)]` and `E[min(M, 2, D)]`, not `min(E[M], cap)`. For `P(M=0)=P(M=4)=0.5`, ample gold/deck, expected cards are 1, not 2. |
| A04 | Compare rich small hands with poor large hands | Score gold and cards independently. A zero-gold target can be best; a larger hand is not automatically better after the card cap. |
| A05 | All targets have empty hands, or deck and target gold are exhausted | Choose a legal zero-reward inspection or skip the optional ability, then gather resources/build/end. Do not repeatedly propose an unusable action. |
| A06 | Several combinations tie or all scores are zero | Return a legal opponent and one of the five valid colors, or skip. Avoid undefined targets, invalid colors, NaN scores, or accidental self-targeting. |
| A07 | Spy steals gold and draws a buildable card | Re-evaluate resource and build decisions from the resulting view. Do not use a plan cached before the reward. |
| A08 | Spy reaches its second character's turn or a new round starts | Reset ability availability for the appropriate character turn; prevent repeat use on another role and stale target/inspection state in a later round. |
| A09 | Search reconstructs a world containing legitimately observed cards | `determinize()` preserves observations without putting the same card into another hand or the deck. Its existing special handling is for a Wizard peek; Spy knowledge needs its own treatment if retained. |
| A10 | Search simulates other players after a Spy inspection | Each policy gets its own `viewFor()`; an opponent cannot inherit the simulated Spy's private knowledge. |
| A11 | Fairness harness redeals hidden cards after inspection | Preserve cards still legitimately known under the memory policy. A naive shuffle of every opponent hand can invalidate the test world. |
| A12 | AI primary action is rejected, or inspection requires acknowledgement | `safeAction()` must handle any new pending state and make progress. `scheduleAI()` currently commits only a successful primary/fallback action; if both fail, no state change schedules another move. |
| A13 | AI action throws, a target disappears from cached state, or takeover occurs | Verify the controller handles the failure and resumes with a fresh permitted view. Do not let an inspection UI acknowledgement freeze an AI seat. |
| A14 | Lookahead runs out of rollout budget or hits its 400-action bound | Prefer an atomic Spy resolution or a bounded acknowledgement. No inspection loop or false reward from repeatedly evaluating the same action. |
| A15 | Threat and information terms dominate scoring | Define scales/weights; disruption should reflect actual gold removed and opportunity, and information value should not invent resource rewards or hidden certainty. |
| A16 | All-AI games across supported player counts and custom casts | Games terminate, every action is legal, no player has negative gold, and every physical card UID appears in exactly one physical zone. Include pending/interrupt cards where applicable. |

## Integration checks

- `js/data.js`: unique character ID, rank 2, valid custom selection; reject casts containing both Spy and Thief. Audit hard-coded rank-versus-character-ID assumptions.
- `js/engine.js`: authoritative validation, atomic rewards, once-per-turn usage, private views, and actual stolen/drawn counts in statistics and events.
- `js/ai.js` and `js/search.js`: draft valuation, candidate target/type pairs, fallback behavior, determinization, and rollout privacy.
- `js/main.js`, `js/ui.js`, and `js/scene.js`: target/type selection, private hand inspection, AI pacing, event playback, reconnection, and mobile display.
- `js/i18n.js`, every `js/lang/*.js`, and character visuals/icons: complete labels and rules text, including the custom cap.
- Saves: assess whether new state makes existing saves incompatible; bump `VERSION` when required by repository guidance.

## Implemented design choices

1. Inspection memory: a private, historical snapshot in `turn.spyPeek` lasts until that character's turn ends. Other seats and spectators never receive it. Save/reload preserves it; no persistent opponent-hand memory is kept.
2. Information value: a bounded heuristic of `0.15 * min(handSize, 6) / 6`; it is not a promise of additional resources or persistent future-round knowledge.
3. Threat value and weights: unit weights for expected gold/cards; threat contributes up to 35% of expected stolen gold, based on the existing AI threat difference. Equal utilities use stable seat/color order. Full formulas are in `goal.md`.
4. Interaction contract: atomic resolution plus a closable/reopenable informational panel. No engine acknowledgement is required, so AI, reconnection, and takeover use the normal turn flow.

## Suggested validation when implementing

Focused engine/AI coverage lives in `test/spy.test.mjs`. The engine suite and pressure suite include Spy and Spy/Magistrate casts; pressure candidates include target/type actions. Twin-world sampling preserves the inspecting player's known cards. The manual fixture `test/spy-ui.html` renders the real HUD over an engine fixture without loading the 3D renderer.

Run the existing engine and Magistrate suites, followed by pressure games across 2-7 players and Spy casts. If search or scoring changes, also compare AI behavior and duel results. Check host/peer inspection privacy, save/reload, AI takeover, and the 393x852 mobile layout manually. Engine-view privacy tests do not substitute for a live two-browser network check.

Implementation validation: Spy and Magistrate focused suites passed. With `SEARCH.on = false`, the engine suite completed 324 games with zero AI fallbacks, and the pressure suite completed 600 games with 38,595 identical-view comparisons and 6,478 random moves, with all invariants intact. A 100-game heuristic duel sanity run returned 47% for the identically configured tuned side (95% margin: 9.8 percentage points); this is not a Spy balance comparison. Separate full-lookahead smoke games completed at 2 and 7 players, exercising Spy 11 times in total. Desktop and 393x852 HUD checks covered target/type commitment, the penniless-target draw, private snapshot display/reopening, and continued resource gathering. Full Monte Carlo versions of the broad suites were stopped for runtime; live two-browser multiplayer was not exercised.
