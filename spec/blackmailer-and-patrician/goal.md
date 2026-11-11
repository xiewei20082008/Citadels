# Goal

Add Blackmailer (rank 2, an alternative to Thief or Spy) and complete its integration with Patrician (rank 4, an alternative to King). Patrician already exists as character ID 12; retain it. Blackmailer needs a new unique character ID, distinct from its rank and all existing IDs 1-20.

Follow the existing [Magistrate specification](../Magistrate/goal.md): explicit rules, private marker identity, host-validated decisions, and AI that uses only permitted information. See [corner-cases.md](corner-cases.md) for implementation risks and acceptance scenarios. This task specifies behavior; it does not claim either new implementation or passing tests.

## Rule sources

Checked on 2026-11-11 against the publisher's [2021 Citadels rulebook](https://coolplay.rs/wp-content/uploads/2024/03/Citadels_pravila-Eng.pdf), printed pages 3-4, 7, and 10-12, and [2016 Citadels rulebook](https://boardgame.bg/citadels%202016%20rules.pdf), printed pages 3, 10-12. The published baseline below is paraphrased. Timing contracts, action names, and AI heuristics below are project decisions, not extra published rules.

## Blackmailer: published baseline

During its turn, Blackmailer assigns two facedown threats to different characters: one flowered and one unmarked. Both are threatened; only the flowered marker can cause full theft. Exclude rank 1, killed characters, and bewitched characters. Warrants do not prevent threats.

On a threatened character's turn, gather resources first, then resolve the threat before abilities or construction. Only district effects used while gathering resources are available beforehand. A bribe transfers half the stash, rounded down, and removes the marker unseen. A one-gold stash can therefore pay zero. After refusal, Blackmailer may reveal the marker; revealing the flower takes the entire stash, while an unmarked reveal takes nothing. These rules come from [2021, printed page 11](https://coolplay.rs/wp-content/uploads/2024/03/Citadels_pravila-Eng.pdf).

## Patrician: published baseline

Patrician gains one card per noble district and must take the crown during its turn. An assassinated Patrician skips its turn but inherits the crown at round end. A bewitched Patrician still takes the crown. Rank 4 cannot be discarded faceup during selection. See [2016, printed pages 3 and 12](https://boardgame.bg/citadels%202016%20rules.pdf).

## Implementation contract

### Assignment and round state

- Assignment is optional and once per Blackmailer turn, before or after normal resource gathering/building when no decision is pending. Ending without assigning remains legal.
- Proposed action: `threats`, carrying two distinct configured character IDs, the flowered character ID, and the round/active character identity. Validate the complete payload before consuming the ability or publishing markers.
- Store threats by character ID, not player seat or raw rank. Resolve rank-based exclusions through `rankOf()`. Do not copy Thief's rank-2 exclusion: the printed threat exclusions do not ban Blackmailer's own character or another character owned by the same seat. A marker assigned after its character's turn has begun does not retroactively trigger a threat. The AI should prefer future opposing turns.
- Separate the two public targets from the private flower identity. Store per-marker resolution and reveal status; paying off one marker must not reveal either marker's face. A public unmarked reveal legitimately lets players infer where the flower was assigned.
- Reset assignments, decisions, and resolution flags in `startRound()`. Never transfer a marker to another rank-2 alternative or a character in a later round. Unchosen targets have no turn to interrupt.

### Threat resolution and turn continuation

Use explicit serializable stages: `gather resources -> finish resource choice -> choose bribe/refuse -> Blackmailer reveal/pass if refused -> resume character effects -> normal turn`.

- The threatened character remains `turn.pid`/`turn.charId` throughout. `currentActor()` selects the threatened player for resource/bribe choices and the Blackmailer beneficiary for reveal/pass. Preserve the original turn's mandatory resource flag, pending cards, ability flags, and building allowance.
- Complete a `draw`/`keep` choice, including Observatory or Library behavior, before opening the bribe choice. `T.income` alone does not prove that resource gathering has finished. At an empty deck, retain the existing legal gold-gathering fallback.
- Proposed actions: `threatResponse` with a boolean bribe choice, then `threatReveal` with a boolean reveal choice. Bind each to the decision ID, round, and threatened character/turn. The host calculates all gold amounts; clients send choices, never authoritative prices or marker faces.
- Compute a bribe as `floor(currentGold / 2)` after gathering resources. For a zero-gold stash, allow the same zero-cost bribe; this is an explicit project extension of the published one-gold example. Resolve transfers atomically. If both roles belong to one seat, the stash remains unchanged, while the decision still resolves once.
- A successful bribe closes the threat immediately with no Blackmailer response or face reveal. Refusal always offers the same reveal/pass choices for either marker. Reveal is legal for an unmarked threat too. Passing closes that threat without revealing it; there is no later retry during the turn.
- Until resolution, reject building, character abilities, Smithy, Laboratory, and ending the turn. Permit only the current stage's valid actions and the district effects of gathering resources. Block keyboard shortcuts and network submissions as well as visible buttons.
- Refactor `beginTurn()` so automatic character effects run once on continuation. For unthreatened turns, retain existing timing. For threatened turns, defer character income, Patrician/Architect draws, Abbot's tithe, Queen's bonus, and crown acquisition until the threat closes. This is the project's automatic timing policy within the published ability restrictions; do not introduce a general manual-income system.
- No payment to resolve a threat is a construction cost or tax. Keep transfers distinct from `gain()` bank income and from Magistrate refunds. Update theft/bribe statistics deliberately, without counting a player-to-player transfer twice or minting gold.
- Validate all responses before mutation in both `act()` and `actInPlace()`. Wrong-seat, stale, repeated, or malformed actions leave the decision and state intact. AI takeover and reconnect must resume the current stage without repeating resources, payment, or character effects.

Current integration hazards: `beginTurn()` grants resources immediately; `currentActor()` recognizes only the existing interrupt/draft/turn routing; the interrupt handler otherwise assumes Graveyard. `js/search.js` and several test helpers assume every interrupt contains a district card. A threat response has no card in transit. Update these assumptions rather than manufacturing a placeholder card.

### Patrician compatibility

- Retain ID 12, `crown: true`, existing preset membership, icon, translations, and rank-4 custom-selection rules. Do not add a second Patrician entry or also grant King's gold income.
- Keep the current `colorCount(p, 'yellow')` behavior, including School of Magic. Draw all available entitlement cards directly into the hand with the existing deck-exhaustion behavior. Library/Observatory modify the mandatory gathering action, not this separate character draw.
- On a threatened turn, neither noble cards nor the crown event occurs before the threat closes. Then grant them once, automatically, before normal turn actions. On an ordinary turn, preserve the current automatic start-of-turn behavior.
- The number of noble districts is evaluated when that automatic character draw resolves. Building or acquiring another noble district afterward provides no second draw that turn. This retains the engine's timing convention rather than the rulebook's more flexible optional income timing.
- At round end, the existing killed-rank-4 inheritance must still find Patrician through the rank, including when that round is the final round. No inheritance occurs for an unselected Patrician. Queen's existing rank-4 adjacency calculation must work with Patrician as well as King.

### Privacy, persistence, and multiplayer

- Only Blackmailer's beneficiary may see the unrevealed flower assignment. Opponents and spectators receive the same marker backs, canonical target ordering, and response schema for both marker identities. The threatened player does not inspect their marker before choosing.
- Public events report assignments and actual decisions/transfers. A bribe event must not include the hidden face, even if the marker has been removed. Reveal events expose only the chosen marker; hidden state must not leak through tooltips, action history, logs, reconnect payloads, or AI inputs.
- Preserve warrants and threats independently. A threat resolves before character effects/building; a later first paid build can separately open the existing Magistrate response. Do not overwrite either feature's state or change construction/tax settlement.
- Save the beneficiary, assignments, per-marker status, decision identity, stage, and continuation flags. Reconnecting receives a fresh permitted view and the correct actor. Migrate saves explicitly or bump `VERSION` when old states cannot safely supply the new fields.
- Witch and Gold Mine are future compatibility cases where absent from `js/data.js`. Do not add them in this feature. Future Witch support must preserve the printed split between the bewitched Blackmailer's role and the Witch receiving its ability, and preserve Patrician's crown exception.

## AI logic

These are proposed heuristics. They should produce legal, varied decisions without requiring hidden hands or measured opponent models.

### 1. Threat assignment

Estimate outcomes per possible holder using `holdProbs()` and public gold, city, hand count, and legitimate draft knowledge. The relevant stash is after expected mandatory resource gathering and before character income. A rich Merchant or Tax Collector cannot expose its later income to the threat; Patrician's cards arrive afterward too.

For each legal character, estimate:

`ThreatValue = sum(P(holder) * [P(bribe) * floor(expectedStash / 2) + P(refuse) * P(revealFlower) * expectedStash])`

This is a planning approximation: evaluate resource-choice outcomes separately when possible rather than rounding an averaged stash. Add a bounded opponent-threat preference using existing score estimates. Treat a decoy's refusal payoff as zero; a decoy can still earn a bribe.

Evaluate ordered pairs of distinct legal characters, assigning one as flower and the other as decoy. Prefer selected, upcoming opponent characters; do not confuse this strategy filter with engine legality. With no useful pair, choose a valid legal pair or skip the optional ability. Never return an incomplete assignment.

For modest variation, multiply each pair's estimated utility by one independently sampled uniform factor in `[0.88, 1.12]`, once per decision. Use a controllable AI random source and stable ID ordering for zero/tied scores. Do not expose the private engine seed or reroll inside a comparator.

### 2. Bribe, refusal, and reveal

- The threatened AI uses only public markers, reveals, permitted draft knowledge, and its own information. Estimate the probability that its threat is flowered; do not read the host's private identity. An unmarked public reveal can make the remaining threat certain.
- Compare the certain bribe cost with expected refusal loss and the effect on affordable builds. Prefer a zero-cost bribe. For equal strategic value, prefer bribing to make progress with a predictable budget. Recompute the normal resource choice under threat rather than always taking gold.
- The beneficiary normally reveals a refused flowered threat to take available opposing gold. With a decoy, normally pass to preserve uncertainty, while allowing both legal choices. Same-seat transfers have no resource profit. Once the decision closes, never reconsider it for that character.
- Patrician draft/resource valuation keeps its existing noble-card and crown value, but accounts for the threatened budget and deferred draw. Do not spend future noble cards, character income, tax collections, or expected bribes before those actions resolve.

### 3. Fallbacks and search

`safeAction()` must handle resource keeps, bribe/refuse, and reveal/pass before its generic income/end fallback. It must always finish a pending threat with a legal action. AI scheduling follows the decision-maker, even while another player's turn remains active.

`determinize()` preserves the beneficiary's known flower and samples hidden assignments for other players consistently with visible targets, reveals, and resolved markers. A paid or passed marker remains part of the original one-flower assignment; removing it does not make the remaining marker automatically flowered. Pass every rollout policy its own `viewFor()`, preserving the existing warrant privacy guarantee. Compare candidate actions under consistent sampled worlds and include bribe-funded later Blackmailer turns, lost building opportunities, completion, and final scoring in evaluation.

## Integration and delivery

Cover character data/custom selection; engine stages, actions, views, events and saves; AI draft/action/search policies; controller and host/peer routing; HUD, board markers, feedback and icon; English/Chinese and every `js/lang/*.js` translation. Existing presets remain intact. Preserve supported 2-7 player games, shared stashes in two-character games, and normal end-of-round completion.

Suggested validation when implementation is requested: focused threat/Patrician engine and AI scenarios, existing engine/Spy/Magistrate/Tax Collector-Marshal suites, privacy twin worlds, pressure games across supported player counts, lookahead smoke games, save/reconnect and live host/peer checks, plus desktop and 393x852 HUD review. This specification does not introduce runtime changes or automated tests.
