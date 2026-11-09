# Tax Collector and Marshal corner cases

Scope: implementation risks and acceptance scenarios for [goal.md](goal.md), not confirmed defects. Tax Collector is rank 9; Marshal is rank 8. Neither is present in the current `CHARS` list. Character IDs are implementation choices, never aliases for ranks.

## Rule baseline and boundaries

Use the publisher's [2021 rulebook](https://coolplay.rs/wp-content/uploads/2024/03/Citadels_pravila-Eng.pdf), printed pages 4, 8, 12-15, and the [2016 deluxe rulebook](https://images.zmangames.com/filer_public/82/aa/82aac2d6-2a19-4143-9690-eb16b82bd9af/citadels_deluxe_rulebook.pdf), printed pages 13-14. The linked goal distinguishes published rules, inferred consequences, project timing, and edition-dependent district choices.

All cases below are proposed tests. Future-only characters/districts do not need to be added to satisfy this feature. In particular, Keep and Great Wall expectations retain the project's existing Warlord-only text and must be reviewed if that text changes.

## Tax assessment and collection

| ID | Scenario | Expected result / bug to prevent |
| --- | --- | --- |
| T01 | Tax Collector absent from the configured cast | No tax or collection action. Do not tax merely because its definition exists in `CHARS`. |
| T02 | Configured but faceup discarded, facedown discarded, or unchosen | Tax every eligible construction; retain pool despite no collector turn. Do not reveal which hidden discard contains it. |
| T03 | Tax Collector assassinated | Continue assessment; skip collection and the killed role's turn. Keep the pool for a later round. |
| T04 | Builder has four gold and pays three | Place the district, then transfer the remaining one gold to the pool. |
| T05 | Builder has exactly three gold and pays three | Build is legal; charge zero. Do not demand four up front, create debt, or make gold negative. |
| T06 | Builder has five gold and builds two cost-two districts | First build leaves two after tax; second leaves zero, so total tax is one. Recompute after each build. |
| T07 | A legal free build leaves gold in the stash | Charge one. Future Framework/free Necropolis paths cannot bypass assessment. |
| T08 | Thieves' Den paid with cards, or a cost discounted to zero | Charge from remaining gold if available. Taxability is not `goldPaid > 0`. |
| T09 | Tax Collector constructs during its own turn | Charge zero, even after collecting a large pool. |
| T10 | Two-/three-player seat owns Tax Collector plus another role | Only Tax Collector's character turn is exempt. Shared stash does not grant permanent tax immunity. |
| T11 | Tax Collector collects a pool of seven | Player gains seven; pool becomes zero; total stash-plus-pool gold is conserved by the transfer. |
| T12 | Collect before resources, after resources, or after building | Legal while free to act; collection does not satisfy the mandatory resource action. |
| T13 | Empty pool; player voluntarily collects | Resolve once with zero transfer and consume collection. AI may skip this optional action. |
| T14 | Double-click, duplicate request, or collect again later that turn | Reject without additional gold or flag changes. |
| T15 | End turn without collecting | Pool remains. No automatic payout at end of turn or round. |
| T16 | New round or the owner's other character begins | Preserve pool; reset collection availability only for a new eligible Tax Collector turn. |
| T17 | Thief names Tax Collector | Resolve robbery against the existing player stash before the optional collection; pooled gold is not part of that stash. |
| T18 | Spy targets the future collector | Theft uses current stash only. Pool stays unchanged, including when the target has zero gold. |
| T19 | Last construction completes a city | Assess tax before normal continuation; the final round still calls rank 9. No immediate game end that loses the collection opportunity. |
| T20 | Game ends with an uncollected pool | Do not distribute it or add it to any player's stash-based scoring. |
| T21 | Alchemist added later | Refund construction payment only, never tax. Zero gold at assessment does not create a later tax after refund. |

## Magistrate and construction routing

| ID | Scenario | Expected result / bug to prevent |
| --- | --- | --- |
| C01 | Marked construction is awaiting warrant response | Do not charge tax yet. Preserve payment/card context across the interrupt. |
| C02 | Signed warrant confiscates; Magistrate has gold | Refund builder's actual gold, place with Magistrate, charge Magistrate once. Builder pays no tax for this construction. |
| C03 | Confiscation recipient has zero gold | Allow confiscation and assess zero tax; never require one gold as a prerequisite. |
| C04 | Unsigned warrant, decline, or duplicate block | Builder receives district and owes its normal tax. Do not charge the responding Magistrate merely because it answered. |
| C05 | Tax Collector's construction is confiscated | Magistrate owes the tax; Tax Collector's personal exemption does not travel with the card. |
| C06 | Same player owns Magistrate and the targeted character | Treat stash aliases safely. Refund once, assess once as Magistrate; owning Tax Collector does not waive this assessment. |
| C07 | Wizard constructs directly from an opponent's hand | Use the same warrant/tax path as ordinary construction. Keep its existing build-limit exemption. |
| C08 | Invalid build, invalid warrant response, or repeated response | No new tax, refund, placement, event, or consumed opportunity. |
| C09 | Save/reload while construction is pending | Resume with the correct actor and original payment. Tax settles once when ownership is final. |
| C10 | Tax is due on a build-limit-exempt district | Exemption affects building allowance only. Future Stables and current Trader builds remain taxable. |

Current integration: `construct()` may defer `place()` through `s.interrupt`. `warrantResponse` selects the final recipient. A tax hook only in the ordinary `build` action misses Wizard and confiscation; a hook in every city insertion taxes seizures incorrectly.

## Marshal eligibility and payment

| ID | Scenario | Expected result / bug to prevent |
| --- | --- | --- |
| M01 | Eligible district costs one, two, or three | Transfer its full applicable cost to the owner, then move that exact UID. A cost-three district is included. |
| M02 | District costs four or more | Reject even if Marshal has enough gold or the original builder received a discount. |
| M03 | Exactly enough gold for the seizure | Legal; stash may become zero. No additional construction tax. |
| M04 | Insufficient gold | Reject before subtracting, moving cards, consuming the ability, or emitting success. |
| M05 | Marshal or target owns Factory | Construction discounts do not alter seizure price or ceiling. |
| M06 | Attempt to reuse Warlord destruction price | A three-cost district costs three to seize, never two. Payment goes to its owner. |
| M07 | Self-target or UID belongs to a hand/deck/another city | Reject. Use opponent city membership, not a global card lookup. |
| M08 | Marshal already owns same district name | Reject even when physical UIDs differ or Marshal owns Quarry. |
| M09 | Target city at or above `cfg.goal` | Reject using the configured completion threshold, including goals seven and eight. |
| M10 | Marshal's own city is already complete | May acquire an otherwise eligible district; completed-city protection applies to the source. |
| M11 | Living Bishop protects target | Reject; Abbot does not confer Bishop protection. |
| M12 | Bishop assassinated | Bishop protection is absent. Other restrictions still apply. |
| M13 | Future bewitched Bishop | Protect Witch's city instead of Bishop's original city. Do not require Witch support now. |
| M14 | Keep at cost three | Under this project's retained Warlord-only wording, seizure is legal if otherwise eligible. Flag an edition-text update explicitly rather than inheriting Warlord's Keep ban. |
| M15 | Great Wall in the source city | Under retained project wording, no seizure surcharge or ceiling change. Do not call `destroyCost()`. |
| M16 | Future Artist: printed two beautified to three; printed three beautified to four | First remains eligible at price three; second is ineligible. Preserve beautification after transfer. |
| M17 | Second seizure, repeated request, or old-round request | Reject; neither income nor another construction restores the ability. |
| M18 | Tax Collector is configured and Marshal has spare gold | Seizure adds nothing to the tax pool. An ordinary build on that turn still pays its own tax. |

## Ownership, completion, and timing

| ID | Scenario | Expected result / bug to prevent |
| --- | --- | --- |
| O01 | Seize before versus after ordinary construction | Either order is legal if affordable; one seizure and the normal building allowance are independent. |
| O02 | Seized district is military | No second income award under proposed automatic turn-start income timing. Next eligible character turn counts the current city normally. |
| O03 | Marshal owns School of Magic at turn start | Include it in red income through `colorCount()`, once. No hard-coded red-only filter. |
| O04 | Seize from an incomplete city into a city at `goal - 1` | Check completion for Marshal only; retain normal end-of-round finish and rank-9 call. |
| O05 | Transfer a scoring district or a missing color | Recompute affected players' eventual scores and bonuses from the new cities. Do not cache the previous owner. |
| O06 | Seized card already has `round` or other metadata | Preserve its existing metadata. `place()` stamps the current round and increments built totals, so do not reuse it blindly. |
| O07 | Target has Graveyard | No destruction or recovery interrupt. Card never goes to a hand or deck. |
| O08 | Marshal holds a warrant and seizes before its first paid build | Seizure does not consume the first-paid-build opportunity or trigger confiscation. |
| O09 | Pending resource keep choice or warrant/Graveyard interrupt | Collection and seizure cannot bypass the pending actor/choice. Resolve it first. |
| O10 | Future Museum carries assigned cards | Attachments stay with the transferred district and count once in physical-card conservation. |
| O11 | Seizure event and end-game statistics | Record an acquisition, not new construction or destruction. Payment and district movement animate once. |
| O12 | Marshal not drafted or killed | No seizure or Marshal income. Pool taxation remains independent of Marshal's availability. |

## Host validation, privacy, and persistence

- Reject malformed actions, wrong seats, wrong phases, non-city UIDs, stale turns, and already-used abilities without mutating the input state. Validate before mutation in the in-place simulation path too.
- Clients supply choices only. Ignore or reject claimed seizure prices, tax amounts, pool balances, reward amounts, or claimed exemptions; derive them from authoritative state.
- Bind actions to round and active character identity, not just player ID. A seat can have two character turns, and a delayed request can arrive in a later round.
- `viewFor()` exposes the public pool but not the unrevealed collector's owner, hidden opposing characters, Spy snapshots, warrant signatures, or deck order.
- Save/reconnect/host recovery preserves the pool, ability usage, card ownership, and an in-progress warrant construction without replaying transfers. Define old-save migration or bump `VERSION`.
- Conservation checks distinguish ordinary bank income/spending from player-to-player and player-to-pool transfers. Seizure and collection conserve total player-plus-pool gold; construction payment still leaves that total normally.
- Every physical UID occupies one physical zone, including pending constructions. Public event snapshots and Spy inspection snapshots are observations, not extra cards.

## AI and full-round scenarios

| ID | Scenario | Expected behavior / bug to prevent |
| --- | --- | --- |
| A01 | Hidden hands, deck order, or unrevealed ownership change with identical permitted view | With controlled policy randomness, decisions remain identical. Extend twin-world fairness coverage. |
| A02 | Large visible pool, collector unchosen or killed | Do not award it to a hypothetical player or clear it during simulation. Future draft value can include the carried pool. |
| A03 | Tax Collector starts poor with a useful pool | Collect, refresh the permitted view, then reconsider resources/building; do not end based on old gold. |
| A04 | Two-character seat builds on its noncollector role | Budget taxes despite sharing a player record with Tax Collector. |
| A05 | Sequential build plan spends all funds | Deduct each intervening tax; do not submit a now-unaffordable later build or skip a legal exact-price first build. |
| A06 | Marshal can seize or build, but cannot afford both | Compare complete legal sequences and opponent funding, rather than independently spending the same gold twice. |
| A07 | No eligible district, no gold, or all utilities nonpositive | Skip seizure, complete resources/build/end, and terminate. No repeated rejected action or infinite optional-action loop. |
| A08 | Seizure completes the city while losing projected final score | Permit the action in the engine; AI may decline for strategic reasons. Legality is separate from utility. |
| A09 | Seizure payment funds an opponent's rank-9 build | Lookahead retains the payment and continues through rank 9 before scoring. |
| A10 | Normal plan rejected after state changes | `safeAction()` uses a fresh view and makes progress without bypassing an interrupt or fabricating a collection. |
| A11 | Determinization/cloning | Preserve public pool, moved UIDs, character ranks, pending construction, and used flags. Do not sample a city card into another physical zone. |
| A12 | Rollout reaches round boundary | Carry tax pool, reset turn flags, clear warrants normally, and preserve completion behavior. Step-budget exhaustion must not hide an action loop. |
| A13 | Cast includes Marshal and Tax Collector, with Spy/Magistrate variants | Sort calls by rank, not new character ID. Reject duplicate-rank casts with Warlord or Queen. |
| A14 | All-AI games across 2-7 players, both city goals, several seeds | Games finish; gold and pool remain nonnegative integers; actions are legal; UIDs remain conserved. Include pools carried over several rounds. |

## Suggested implementation validation

Add a focused suite for these contracts when implementing. Run existing engine, Spy, and Magistrate suites; extend pressure/fairness candidates for both actions and relevant custom casts. Include a full-lookahead smoke run so a heuristic-only success does not conceal simulation failures.

Review desktop and 393x852 layouts for the public pool, collected amount, seizure targeting/cost, disabled illegal targets, and AI playback. Exercise save/reload, reconnect and AI takeover during a warrant response. Check a live host/peer game for authoritative payment and private views; engine view tests alone cannot establish network correctness.

This documentation change does not implement the feature or claim any of these tests passed.
