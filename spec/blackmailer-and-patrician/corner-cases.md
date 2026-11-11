# Blackmailer and Patrician corner cases

Implementation risks and acceptance scenarios for [goal.md](goal.md), not a list of confirmed defects. Blackmailer is a new rank-2 option; Patrician is already character ID 12, rank 4. Follow goal.md's published baseline and explicitly labelled project timing choices. Cases involving absent characters/districts are future compatibility checks, not requests to add them.

## 1. Assignment and character identity

| Case | Expected behavior | Likely bug |
| --- | --- | --- |
| Assign two legal characters | Commit one flower and one decoy atomically, once during Blackmailer's turn. | Consume the ability before validating the second target. |
| Duplicate/missing targets, unknown ID, or flower outside the pair | Reject without changing markers or ability availability. | Accept a partial pair, two flowers, or an unconfigured character. |
| Rank-1 alternative, killed character, or future bewitched character | Reject using rank-aware exclusions. | Compare alternate IDs directly with rank numbers. |
| Thief/Spy and Blackmailer configured together | Reject the duplicate rank in custom setup. | Treat different IDs as permission for two rank-2 roles. |
| Character already holds a warrant | Allow an independent threat. | Reuse a single marker field and erase the warrant. |
| Faceup discard or another known unselected character | Distinguish engine legality from AI usefulness. | Leak hidden selection status through target validation. |
| Blackmailer's current character receives a marker | No retroactive threat decision; the AI should avoid the wasted target. | Re-enter resource gathering or recursively threaten the current turn. |
| A later character belongs to Blackmailer's seat | Allow the assignment; same-seat transfers conserve the stash. | Import a blanket own-character ban or double-modify aliased player records. |
| End turn without assignment | Continue normally. | Deadlock waiting for an optional ability. |

## 2. Resource gathering and threat stages

| Case | Expected behavior | Likely bug |
| --- | --- | --- |
| Threatened player takes two gold | Finish gathering, then offer bribe/refuse using the resulting stash. | Charge against pre-gather gold. |
| Threatened player draws with an ordinary keep choice | Resolve `keep` before asking about the threat. | Treat `T.income === true` as the end of gathering and overwrite pending cards. |
| Observatory or Library during gathering | Use the existing draw/keep rules, then advance once. | Forbid permitted gathering effects or apply them to character bonus draws. |
| Empty deck | Offer the existing legal gold resource action. | Force an illegal draw or prevent threat resolution. |
| Merchant, Architect, Abbot, Queen, or Patrician is threatened | Defer automatic character effects until the threat closes. | Leave `beginTurn()` effects before the bribe, changing resources or turn order. |
| Smithy, Laboratory, ability, build, or end submitted early | Reject before mutation, including shortcuts and peer actions. | Disable only the buttons while the host still accepts the action. |
| Threat is declined by the threatened player | Route to Blackmailer for reveal/pass, for either marker. | Auto-reveal the flower or skip the decoy response. |
| Blackmailer finishes its response | Resume the same character, with gathering already consumed and character effects applied once. | Advance to the next character, gather twice, or omit delayed income. |
| Wrong actor responds | Reject without changing stage or disclosing identity. | Guard only `turn.pid`, rejecting Blackmailer or accepting the builder. |
| Invalid/replayed/stale response | Match decision ID, round, character and actor before mutation. | Repeat a payment or accept a prior character's response. |

Proposed safeguard: keep threat stage and the deferred-character-effects flag separate from `T.pending` card choices and `T.used.ability`. Finishing a threat must not spend the threatened character's own ability. A save at any stage must contain enough context to continue without rerunning `beginTurn()`.

## 3. Gold transfers and terminal decisions

The following are acceptance examples for the host's integer-transfer contract. `G` is the threatened stash after mandatory resources and before character effects.

| G | Bribe | Stash after bribe | Stash after refused flower reveal | Stash after decoy reveal or pass |
| --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | 0 |
| 1 | 0 | 1 | 0 | 1 |
| 2 | 1 | 1 | 0 | 2 |
| 5 | 2 | 3 | 0 | 5 |
| 8 | 4 | 4 | 0 | 8 |

For different seats, the beneficiary gains exactly what the target loses; the bank and tax pool do not change. For the same seat, the transfer has no net effect. A zero-stash bribe is the explicit project ruling in goal.md.

- **Bribe:** remove the marker without revealing its face or opening a second response. The UI must make a zero-cost bribe selectable.
- **Refuse and reveal:** both real and decoy markers accept the same reveal action. The host determines the result; a client cannot request an amount or assert that a decoy is flowered.
- **Refuse and pass:** close the opportunity without revealing the marker. Later income, builds, or Magistrate refunds cannot reopen it.
- **No available gold:** still resolve the stage. A zero transfer does not mean the decision remains pending.
- **Statistics:** bribes and full theft are player transfers, not bank earnings or construction payments. Do not also tax them or refund them through a build-cost ledger.
- **Malformed booleans or price fields:** validate choices strictly, and never trust client-calculated payment data. Failed actions must leave both `act()` inputs and `actInPlace()` simulation state unchanged.

## 4. Patrician, crown, and deck behavior

| Case | Expected behavior | Likely bug |
| --- | --- | --- |
| Patrician is already defined | Reuse ID 12 and its presets/icon/translations. | Add a second definition or replace its ID with rank 4. |
| Unthreatened Patrician starts | Preserve current automatic crown and noble-card timing. | Apply the new threat delay to every ordinary turn. |
| Threatened Patrician gathers cards | Finish gathering before the bribe, without noble-card income yet. | Mix resource cards and character cards in the same keep choice. |
| Threat closes | Take crown and grant noble cards once under the project's timing policy. | Apply them on both bribe completion and the next regular action. |
| Zero noble districts | Gain no character cards; still take crown and gather normally. | Make crown acquisition depend on a positive draw. |
| School of Magic in city | Include it using `colorCount(p, 'yellow')`. | Count only printed yellow cards or grant King's gold too. |
| Library/Observatory owned | Modify gathering only; noble-card income enters the hand directly. | Offer extra cards or a keep/discard choice for each noble district. |
| Deck has fewer cards than noble entitlement | Draw available cards once; preserve card UID conservation. | Create cards, loop forever, or suppress crown acquisition. |
| New noble district built later that turn | No additional automatic noble draw. | Recalculate income after every city change. |
| Patrician assassinated | Skip normal resources/effects; grant rank-4 inheritance at round end. | Draw cards while killed, lose the crown, or key inheritance only to King ID 4. |
| Patrician unselected | No effects and no inheritance. | Give crown to a guessed hidden holder. |
| Final round ends with killed Patrician | Resolve inheritance through normal round-end flow before finishing. | Start a new round or skip inheritance because the game ends. |
| Queen shares a seat or is adjacent to Patrician | Retain existing rank-4 holder/adjacency semantics, including self-seat exclusion. | Look for King ID 4 rather than the crown role. |
| Selection would discard rank 4 faceup | Preserve the existing crown-role protection. | Protect King alone and expose Patrician. |

Future Witch cases: Patrician retains the crown while the Witch uses its other abilities; a bewitched Blackmailer's threat beneficiary is the Witch. These require separate role-holder and ability-controller concepts when Witch is implemented.

## 5. Other effects and interruption routing

- **Magistrate overlap:** resolve threat, apply delayed character effects, then permit construction. A first paid construction can independently open a warrant response. A flower reveal does not reveal a warrant, and a bribe does not consume first-paid-build status.
- **Refund after blackmail:** a later confiscation can restore build gold, but it does not recalculate an earlier bribe or permit another full theft.
- **Tax Collector:** no collection while its threat is pending. Collection after resolution is available normally and is not exposed to that resolved threat. Subsequent construction still follows the existing tax rules.
- **Marshal/Warlord:** no seizure/destruction before a pending threat closes. Transfer, tax, construction, and destruction decisions retain their separate accounting afterward.
- **Two-character seat:** a rank-2 beneficiary may receive bribes before its later owned character acts. Update that later turn's available gold. Threat status belongs to the marked role, not every turn of the seat.
- **Cardless decisions:** threat prompts must not reach Graveyard handlers, `interrupt.card.uid` reads, or card-count assertions. `js/search.js`, `js/main.js`, and existing test helpers contain interrupt assumptions that need review.
- **Disconnect/AI takeover:** ask the replacement actor to finish the existing stage; do not auto-end the threatened character or replay payment. Preserve normal takeover/timeout policy.

## 6. Marker secrecy and lifecycle

| Case | Required safeguard |
| --- | --- |
| Swap flower and decoy in otherwise identical hidden states | Opponent/spectator views and legal choice schemas remain identical until an authorized reveal. |
| Blackmailer views its assignment | Preserve the beneficiary's legitimate private knowledge. |
| Target opens its bribe prompt | Show current stash and bribe price, with no hidden face, eligibility hint, or differently shaped prompt. |
| Bribe removes a marker | Keep the face private in events, logs, reconnect views, recap, and removed-marker records. |
| Decoy is revealed publicly | Reveal that face; other players may infer the original flower location. Do not suppress legitimate inference. |
| Blackmailer passes without revealing | Record resolution without revealing the hidden face or offering another attempt. |
| One marker has been paid off or passed | Do not automatically declare the remaining marker flowered; the hidden flower may have been on the resolved target. |
| Target arrays, UI ordering, and action history | Use canonical public ordering; never put the real target first by convention or relay the private assignment payload to peers. |
| Save/reload during draw, bribe choice, or reveal choice | Preserve stage, actor, resources, hidden assignment, and delayed-effects flags; settle once. |
| Next round, including an unselected Blackmailer | Clear all prior threat state and pending decisions. |

Public choices themselves may convey strategy. Privacy guarantees protect unrevealed data, not facts a player can infer from a deliberate public reveal or an observed payment.

## 7. AI and search failure cases

| Case | Correct behavior | Failure to catch |
| --- | --- | --- |
| Estimating a candidate target | Use permitted holder probabilities and public stash/resource choices per possible holder. | Read unrevealed roles or combine one player's gold with another's selection probability. |
| Rich character income or tax pool | Estimate threat exposure before those gains. | Value a future collection or Merchant bonus as already stealable. |
| Pair selection | Score distinct flower/decoy assignments; decoy earns only possible bribes. | Score both markers as full-theft opportunities. |
| Few useful candidates or zero/tied utilities | Produce a legal pair or skip; keep all scores finite with stable tie-breaking. | Submit one marker, duplicate targets, divide by zero, or loop. |
| Assignment variation | Sample one `[0.88, 1.12]` factor per candidate pair per decision. | Reroll during sorting or leak the private engine seed for reproducibility. |
| Threatened AI chooses resource action | Compare remaining building plans after bribe/refusal and later effects. | Always take two gold, ignoring how much becomes exposed. |
| Threatened AI chooses payment | Evaluate its permitted view; prefer a free bribe. | Read actual flower state or treat a decoy as known safe before reveal. |
| Beneficiary chooses reveal/pass | Evaluate from its own perspective despite another player's active turn. | Run the threatened player's policy or value a same-seat transfer as profit. |
| Patrician resumes | Replan from actual hand, crown, and remaining gold. | Build with a cached pre-threat budget or assume deferred cards are still pending. |
| Fallback actions | Finish each threat stage legally before income/end fallbacks. | Send `graveyard`, gather twice, or end while awaiting response. |
| Determinization after one marker resolves unseen | Preserve uncertainty over the original pair, including resolved markers. | Sample the flower only among unresolved targets. |
| Beneficiary searches | Preserve its known flower assignment. | Resample away private knowledge legitimately held by the searching player. |
| Opponent searches or rollout policies act | Sample consistent hidden identities, then give every actor `viewFor()`. | Pass sampled hidden faces directly to the defensive AI. |
| Search clones a threat interrupt | Handle cardless context, decision IDs, and continuation flags. | Crash on missing `card.uid`, invent a card, replay resources, or stall at the rollout cap. |

Privacy testing should pair identical permitted views with a controlled AI random stream. Choosing differently solely because the host swapped unrevealed faces is a failure. After a public reveal, different behavior can be legitimate.

## 8. Suggested acceptance scenarios

These are future checks, not a claim that test coverage has been added by this specification.

1. Assign a valid flower/decoy pair; reject duplicates, excluded ranks, malformed flower IDs, stale actions, and repeat assignment without changing state.
2. Exercise gold gathering and ordinary/Observatory/Library card gathering. Complete resource choices before the threat prompt and defer every affected automatic character effect.
3. Run the `G = 0, 1, 2, 5, 8` transfer matrix for bribe, flower reveal, decoy reveal, and pass; assert stash-plus-pool conservation and no construction tax.
4. Reject every ordinary ability, district action, build, and end action during bribe/reveal stages, including forged host/peer submissions and wrong actors.
5. Threaten Patrician with noble districts and School of Magic: verify gathering, threat, crown, direct character draw, and later construction in order, each once.
6. Verify Patrician with no nobles, a short/empty deck, assassination, round-end inheritance, existing presets, and Queen adjacency. No new noble-income trigger after building.
7. Put a threat and warrant on the same character. Resolve blackmail first, then a separate paid-build warrant, refund, and tax settlement with no shared-state overwrite.
8. Use two- and three-player shared-seat scenarios, including a later owned threat target and bribes funding a beneficiary's later role. Preserve gold under aliased transfers.
9. Save/reconnect at each stage, including a resource keep and an AI takeover. Resolve once, resume the original turn, and retain private faces.
10. Swap hidden faces and compare all public views, events, prompts, and controlled-random AI decisions. Repeat after unseen removal and after a public decoy reveal.
11. Determinize each pending stage and play a full round. Check actor progress, card conservation, sampled identities consistent with reveals, and no deadlock or generic Graveyard fallback.
12. End the round with resolved, unresolved, and unselected targets, then with Blackmailer absent next round. No threat state survives. Preserve normal final-round completion.

When implementation is requested, run the existing engine, Spy, Magistrate, and Tax Collector/Marshal suites alongside focused coverage. Extend pressure invariants to recognize cardless responses and Blackmailer casts across 2-7 players; include lookahead smoke games. Review host/peer secrecy, reconnect behavior, and both desktop and 393x852 prompts manually. Do not report those checks as passed until they have actually run.
