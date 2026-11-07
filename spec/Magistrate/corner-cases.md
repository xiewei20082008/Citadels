# Magistrate corner cases

This document identifies potential game and AI bugs when implementing [goal.md](goal.md). These are implementation risks and acceptance scenarios, not claims of confirmed bugs. The Magistrate is character ID 17, rank 1, selectable in the custom character setup.

Rule expectations follow goal.md. Proposed implementation safeguards and unresolved design choices are labelled below. Interactions with characters or districts absent from the current game are future compatibility cases, not requirements to add those cards.

## 1. First paid build and confiscation eligibility

| Case | Expected behavior | Likely bug |
| --- | --- | --- |
| Target builds an ordinary paid district | Offer the Magistrate one confiscation decision before placing the district. | Place it in the target's city first, triggering effects that cannot safely be undone. |
| Magistrate declines the first paid district | Build normally; no later paid build that turn can be confiscated. | Treat declining as leaving the warrant available. |
| First paid district duplicates one in the Magistrate's city | Do not confiscate; the first paid opportunity is still spent. | Skip the duplicate and confiscate a later district. |
| Target builds a duplicate legally using Quarry or Wizard | Check duplicates against the Magistrate's city separately. Quarry does not permit the Magistrate to acquire duplicates. | Reuse the target's placement permission for the recipient. |
| First build is free through Framework or free Necropolis | Do not confiscate it; the next paid district remains available. | Track the first construction instead of the first paid construction. |
| Target attempts an invalid build | Reject it without spending the warrant opportunity, payment, cards, or building allowance. | Mark the first paid build before validating the action. |
| Target has only an unsigned warrant | Build normally; no confiscation decision. | Treat every visible warrant as signed. |
| Signed target never builds, or was not selected | No confiscation occurs. Reset warrants at the next round. | Apply the warrant to the next player, or carry it into another round. |

Keep a separate record of whether the first paid build has occurred. `turn.built` measures building-limit consumption and cannot represent this: exempt paid builds can leave it unchanged, while free builds can have different limit rules.

## 2. Payment and card ownership

| Case | Expected behavior | Likely bug |
| --- | --- | --- |
| Discounted district | Refund the actual gold paid, not the printed cost or a newly calculated cost. | Create gold by refunding the undiscounted price. |
| Thieves' Den paid with gold and cards | Refund only gold; payment cards remain discarded. | Restore discarded cards, refund their value as gold, or discard them twice. |
| Building card and payment cards | Each physical card UID occupies exactly one zone. The confiscated card goes directly to the Magistrate. | Duplicate the card in both cities or retain it in the target's hand. |
| Recipient has Factory or another cost modifier | Do not recalculate the target's original payment using the recipient's discounts. | Refund or charge a cost based on the wrong city. |
| Magistrate also owns the targeted character in a two-character game | Follow the chosen rules for own-character targeting; do not assume actor and recipient are different players. | Lose or duplicate gold/cards when both references point to the same player. |
| Recipient's gold is zero | Confiscation has no building cost. Any separate tax follows its own rule. | Reject confiscation as unaffordable or subtract a district cost. |

Proposed safeguard: preserve the validated construction context, including builder, character, card UID, actual gold paid, payment-card UIDs, payment method, and building-limit exemption. Resolve it once. Do not reconstruct payment from later state.

### Zero-gold payment ruling

The implementation uses the payment-method distinction recorded in goal.md for these cases:

- Thieves' Den paid entirely with cards.
- A normal construction whose discounts reduce gold due to zero, if such a combination exists.
- Own-character confiscation combined with either case above.

Ordinary cost-paid construction, including card-only payment or a zero cost after discounts, qualifies and spends the first-paid opportunity. Explicit cost waivers do not. A legally confiscatable first paid build may be taken even if its gold refund is zero, including an own-character target. This is an explicit implementation ruling, not a claim that the rulebook resolves every zero-gold case. Do not implement it as `goldPaid > 0`.

## 3. Building limits, completion, and effects

| Case | Expected behavior | Likely bug |
| --- | --- | --- |
| Architect, Scholar, or another multi-build turn | A confiscated ordinary build consumes one of the target's allowed builds. | Let the refunded gold also restore the building opportunity. |
| Trader's exempt trade district | Preserve its exemption while still treating a gold-paid build as the first paid build. | Count the confiscated trade district against the limit, or allow a second confiscation because `turn.built` stayed zero. |
| Wizard builds directly from another player's hand | Use the same confiscation path as ordinary construction and preserve its limit exemption. | Hook only the `build` action and miss `wizTake`. |
| Stables, if added | Confiscating it still allows the target another district that turn. | Apply the generic consumed-opportunity rule without its exception. |
| Target would reach the city-completion threshold | If confiscated, that district never completes the target's city. | Set `firstComplete`, emit completion, or start the final round for the wrong player. |
| Confiscation completes the Magistrate's city | Check completion for the Magistrate, during the target's turn. Preserve the normal end-of-round finish. | Check only the active player's city, end the game immediately, or reject acquisition because the recipient's turn ended. |
| Recipient already has a completed city | Do not import rank-8 completed-city protection as a confiscation restriction. | Reuse destruction/seizure checks that implement unrelated protections. |
| Build grants effects or changes scoring | Resolve placement effects for the actual recipient; do not briefly grant the target a district color, income, or scoring effect. | Trigger effects for both cities or retain temporary target benefits. |
| Tax Collector, if added | Apply the tax to the Magistrate according to the tax rules, once. | Charge both players or charge the original builder. |

Current integration risk: `place()` in `js/engine.js` sets the card's round, increments built statistics, emits a build event, and calls `checkComplete()`. Resolve ownership before calling it. Define recap statistics explicitly: a consumed build allowance and a district acquired are different facts. Avoid incrementing either player's statistics twice.

## 4. Turn control and interruption handling

The builder remains the active character while the Magistrate answers. The decision-maker temporarily changes; the active turn and its construction context must survive.

| Case | Required safeguard |
| --- | --- |
| Magistrate decides during another player's turn | Route the response through `currentActor()` and an explicit response state. The normal `turn.pid === pid` guard currently rejects other players. |
| Builder acts while confiscation is pending | Reject further builds, income, abilities, and ending the turn until the response resolves. |
| Wrong player sends a response | Reject it without changing state or revealing the signed warrant. |
| Repeated or stale response | Reject or safely ignore it; never refund or place a card twice. Bind the response to the current construction and round. |
| Own-character target | Allow the same player to resolve the response without recursively reopening it. |
| Wizard pending choice becomes a confiscation response | Preserve the taken card and resume the correct continuation; do not overwrite and lose the original pending context. |
| Magistrate disconnects or is replaced by AI | Use the normal actor replacement/timeout policy, with a valid confiscate-or-decline response. Do not auto-end the builder's turn. |
| Invalid response | The public `act()` path returns an error without modifying the input state. Validate before mutation in `actInPlace()` too, because simulations use it directly. |

Current integration points include `act()`, `actInPlace()`, `currentActor()`, the controller's AI scheduling, UI controls, and multiplayer action routing. A human-versus-human test alone will not exercise all of them.

## 5. Warrants, secrecy, and round lifecycle

- **Exactly three different characters:** reject repeated targets, missing markers, multiple signed markers, unknown IDs, and characters outside the configured cast. Invalid assignment must not consume the ability.
- **Character identity versus rank:** the game's IDs and ranks differ for alternate characters. Store and validate them consistently; do not interpret a new character ID as its rank. Keep the existing one-character-per-rank setup rule.
- **Timing:** assign during the Magistrate's turn, not while drafting. If assignment is optional, ending the turn without assigning must not deadlock. Whether to enforce assignment is a product choice to make explicitly.
- **Target restrictions:** do not copy the Thief's exclusions into warrant legality. Distinguish legal assignments from strategically useless ones, such as a known unselected character. Printed rules do not explicitly ban own-character targets.
- **Private marker identity:** `viewFor()` must expose the three marked characters but hide which is signed from opponents and spectators until revealed. The Magistrate must receive their own assignment.
- **No indirect disclosure:** public events, ordering of marker arrays, action history, logs, save exports sent to peers, and response metadata must not identify the signed warrant prematurely. A decision prompt must not reveal the signature to the builder merely because the private decision is pending; define how public waiting state is presented.
- **Round reset:** clear assignments, reveal status, and spent-opportunity state. Neither a same-rank replacement nor the same character next round inherits an old warrant.
- **Absent Magistrate:** if not chosen, do not assign automatically or carry over prior state.
- **Save/reconnect:** persist a pending construction and response without replaying the payment. Rebuild each seat's permitted view after reconnect. Bump `VERSION` if old saves cannot be safely migrated.

Privacy checks should compare two otherwise identical states with different signed/unsigned assignments. An opponent's view must remain identical until an authorized public reveal, apart from any explicitly designed public response timing. Response timing itself is a possible information leak requiring a UI/state design decision.

## 6. AI warrant assignment bugs

| Case | Correct AI behavior | Failure to catch |
| --- | --- | --- |
| Drafting already finished | Estimate who holds a character using permitted information and draft knowledge. | Model a future draft or read the actual unrevealed holder. |
| No visible opponent hand cards | Estimate expected value from public information. | Read hidden placeholders as real cards, producing undefined costs or `NaN`. |
| Different players have different resources | Estimate joint outcomes per possible holder. A useful formulation is `sum(P(holder) * P(paid build given holder) * expected value given holder)`. | Multiply independent averages and combine one player's gold with another player's hand size. |
| Character gains resources before building | Account for normal resource gathering and relevant character income/draws. | Assign zero building probability solely because current gold or hand size is zero. |
| Navigator or a character with no remaining construction opportunity | Give it no expected confiscation value unless a supported rule provides a build. | Target a high-income character that cannot build. |
| Several builds are possible | Estimate the first paid district, including defensive cheap builds. | Score the most valuable district the target might build later. |
| Likely district duplicates the Magistrate's city | Reduce expected confiscation value; still respect first-paid timing. | Count value from an unconfiscatable district or assume a later one can be taken. |
| Three assignments from one ranking | Apply independent uniform factors in `[0.88, 1.12]` once per assignment, then select three distinct characters from that ranking. | Reroll during sorting, randomize only the winner, or select a signed target again as a decoy. |
| All scores are zero or tied | Use a defined finite tie-break/fallback and return a valid assignment. Multiplicative noise does not break zero ties. | Divide by zero, select `undefined`, or repeatedly request an illegal assignment. |
| Fewer than three preferred targets | Fill remaining markers from legal targets, even if strategically useless. | Confuse the AI's preference filter with the engine's legal target set. |
| Re-evaluation or rejected action | Keep the same sampled ranking for that decision where practical. | Consume fresh random draws repeatedly until a preferred result appears. |

Use a controlled random source for reproducible tests. The current AI/search code uses `Math.random()`, while `viewFor()` masks the engine seed; do not expose that private seed to achieve reproducibility. Specify an AI random-source policy before expecting seeded replays to match.

## 7. AI confiscation and defensive play bugs

- **Decision ownership:** evaluate the Magistrate's city, hand, gold, and score when choosing confiscation, even though `turn.pid` belongs to the builder. Never run the builder's policy as the response policy.
- **Positive versus unconditional benefit:** normally confiscate a legal district. Define concrete reasons to decline, such as losing an existing Ivory Tower bonus or ending the round in a losing position. Those are strategy considerations, not engine legality restrictions.
- **Refund effects:** evaluation must remove the district from the target's projected city and return only actual gold paid. On multi-build turns that refund can fund a later build; consumed allowance still matters.
- **Own-character targeting:** excluding all owned characters is an AI strategy choice, not automatically a legality rule. A later owned character may provide a refund opportunity, subject to the payment ruling above.
- **Opponent warrant awareness:** an AI holding an unsigned warrant must not know it is safe. It can consider visible risk when ordering builds, but must not use the actual signed assignment. The Magistrate can use their own private knowledge.
- **Cheap first paid build:** a warned multi-build AI may protect a later expensive district by paying for a cheap one first. Its plan must remain affordable whether confiscation happens or is declined.
- **Free first build:** do not mistake a Framework-style free construction for protection of a later paid build.
- **No later retry:** after a decline or duplicate block, stop evaluating confiscation for that character's later paid builds.
- **Fallback progress:** `safeAction()` must return a legal response for every new warrant decision. Its current generic income/end fallback is insufficient for a pending confiscation response.

## 8. Search and simulation bugs

`js/search.js` reconstructs hidden cards and characters, then simulates a round with `actInPlace()`. Magistrate state must be included in that model.

- Preserve a known signed assignment when the searching player is the Magistrate. For another player, sample hidden warrant identities consistently with public markers and reveals; do not treat redacted state as no signed warrant.
- Preserve the construction card while it is in transit. `determinize()` currently marks city, own-hand, pending-card, and interrupt-card UIDs as known. A new location must not also be sampled into a hand or deck.
- Preserve paid gold, discarded payment cards, first-paid status, and the active response across clones. Rollouts must neither charge twice nor treat the pending build as a fresh action.
- Ensure rollout actor selection recognizes the Magistrate's response and resumes the builder afterward. A rollout that stops at the new pending choice undervalues confiscation and can hide deadlocks behind the step limit.
- Do not sample a different public marker set for each candidate action. Compare choices under consistent sampled worlds and response policies.
- Mask private warrant knowledge for each simulated policy if the goal is realistic defensive play. The current fast rollout passes a sampled full state directly to policies; adding a policy that reads the actual signed assignment would make simulated opponents unrealistically omniscient.
- Include recipient completion, lost scoring bonuses, refund-funded later builds, and final-round scoring in the outcome. Merely adding the district's printed cost can choose a losing confiscation.

## 9. Suggested acceptance scenarios

These are future implementation checks; no Magistrate code changes or automated tests are introduced by this document.

1. Ordinary paid build confiscated: exact refund, one recipient city, one consumed target allowance, one response.
2. Decline followed by a valuable second build: no second confiscation.
3. Duplicate first paid build followed by a legal second district: no second confiscation, even with Quarry.
4. Trader exempt paid build first, and Wizard direct paid build first: each offers confiscation without consuming an ordinary build allowance.
5. Factory discount and mixed gold/card Thieves' Den payment: refund exact gold; conserve every card UID.
6. Target at `goal - 1`, then Magistrate at `goal - 1`: completion belongs only to the actual recipient; finish at the normal round boundary.
7. Wrong-seat, duplicated, stale, and malformed responses: no state changes, repeated refunds, or turn advances.
8. Save and reconnect during a response, including AI takeover: complete once and resume the correct builder.
9. Swap hidden signed assignments: opponent/spectator views and AI inputs do not disclose the signature. With a controlled random stream, indistinguishable inputs produce the same policy behavior.
10. Zero scores, tied scores, and fewer than three useful targets: finite scoring and three distinct legal assignments using exactly one ±12% ranking.
11. Determinize a pending construction and run a full round: card conservation, valid actor routing, no deadlock, and no sampled duplicate of the pending card.
12. Start another round with and without a selected Magistrate: no warrants or first-paid status survive.

Add Framework, Necropolis, Stables, and Tax Collector interaction checks when those cards enter the supported game. Include zero-gold cases using the explicit payment ruling above when testing is requested.
