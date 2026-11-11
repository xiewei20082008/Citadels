# Goal

Add Emperor (rank 4, an alternative to King or Patrician), following the [Spy specification](../spy/goal.md) pattern: explicit rules, authoritative actions, permitted-information AI, and a separate [corner-case checklist](corner-cases.md).

Emperor is not currently in `js/data.js`. Give it a unique character ID distinct from its rank and all existing IDs, including Blackmailer ID 21. Retain King ID 4 and Patrician ID 12. This task specifies behavior; it does not claim implementation or passing tests.

## Rule sources and published baseline

Checked on 2026-11-11 against the publisher's [Citadels rulebook](https://coolplay.rs/wp-content/uploads/2024/03/Citadels_pravila-Eng.pdf), printed pages 3-4, 7-8, 10, 12, and 14. The baseline below is paraphrased; action schemas, timing conventions, and AI heuristics in later sections are project decisions.

Emperor gains one gold per noble district. During its turn, it must move the crown to someone other than itself or the current crowned player, then take either one gold or a random hand card from the recipient. An empty stash and hand yield nothing.

An assassinated Emperor skips its turn but assigns the crown at round end as advisor, taking no resource. Emperor cannot be used with two players or discarded faceup during selection. Only one character of each rank belongs in a cast.

Queen's adjacency bonus refers to the player holding the rank-4 character, rather than the crown recipient. For an assassinated rank-4 character, the bonus is deferred until that character's end-of-round reveal. A future bewitched Emperor delegates crown assignment and resource collection to Witch.

## Implementation contract

### Character setup and noble income

- Add a rank-4 character with `income: 'yellow'`. Do not attach the existing `crown: true` behavior unchanged: `applyCharacterEffects()` currently gives such a character the crown automatically, which is wrong for Emperor. Keep rank-4 selection protection independent of automatic crown ownership.
- Reject a two-player Emperor cast in authoritative `createGame()` validation as well as the lobby. Disable or explain the unavailable selection when the player count changes; do not silently replace an explicitly selected character. Support Emperor in the repository's 3-7 player games, including three-player games with two characters per seat. Do not expand the player limit or rewrite the existing draft format.
- Preserve existing presets and reject duplicate rank-4 choices even though their character IDs differ. Emperor may be discarded facedown or remain unchosen; an unchosen Emperor has no turn or advisor choice.
- Grant noble income once through the existing automatic character-effects path, using `colorCount(p, 'yellow')`, including School of Magic. A later noble build provides no additional income that turn. This preserves the engine's timing convention; the published general rules allow more flexible income timing.
- A threatened Emperor gathers resources and finishes its Blackmailer response before character effects become available. Grant noble income only once after the threat closes; crown assignment must not bypass that sequence.

### Normal-turn crown assignment

- Crown assignment is mandatory once during Emperor's turn. Allow it before or after the mandatory resource action or building, while no keep choice, threat, warrant, Graveyard response, or other decision is pending. Do not force it at turn start. Reject `end` until both gathering resources and crown assignment have finished.
- Legal recipients are player seats other than the acting Emperor's seat and the current `s.crown` seat. If Emperor already owns the crown, exclude that one seat only. A recipient's hidden, unchosen, killed, or already-played character does not affect eligibility. The current crown holder remains in place until a valid assignment commits.
- Proposed action: `emperorCrown`, containing recipient player ID, resource choice (`gold`, `card`, or `none`), round, and active character identity. Validate the entire payload before mutation. The client supplies no card UID, gold amount, random index, or new crown owner other than its chosen recipient.
- When the recipient has both resources, Emperor chooses which one to take. If only one kind is available, that is the only valid resource choice. If both are empty, require `none` and still move the crown. This is the project's explicit action contract for the rulebook's resource instruction; the recipient neither chooses nor refuses payment.
- Resolve assignment and resource transfer atomically, then mark the ability complete. Revalidate recipient and availability against authoritative state. A stale or invalid resource choice rejects the whole action, leaving crown, hands, gold, events, usage flags, and random seed unchanged.
- For gold, transfer exactly one from the new crowned player's stash to Emperor. For cards, use the engine's seeded `rand(s)` to select a uniformly random physical card instance from the recipient's current hand and move it into Emperor's hand. Do not inspect before choosing, draw from the deck, copy a card, or remove a city district.
- Crown movement does not restart the round, rebuild draft order mid-round, change the active actor, grant another character turn, or reorder calls. The next draft starts with the new crowned seat under existing draft rules. Re-evaluate Emperor's resource/build choices after the transfer.
- Treat payment as a player-to-player transfer, separate from bank `gain()`, construction, tax, and refunds. Preserve gold/card conservation and record actual transfers in recap statistics without counting a transferred card as a deck draw or a built district.

### Assassinated Emperor and round-end continuation

- Branch on the configured rank-4 character in `endRound()`. Keep King/Patrician inheritance intact; never reuse their automatic `s.crown = heir.id` behavior for Emperor. An assassinated, selected Emperor receives no normal turn, noble income, resources, building, or tribute.
- After all character calls finish, open a serializable advisor decision for the seat holding Emperor. Proposed interrupt: `k: 'emperorAdvisor'`, with actor, unique decision ID, round, and Emperor character ID. `currentActor()` must route this decision even when `s.turn` is null. No ordinary turn is created or resumed.
- Proposed response: `emperorAdvisor`, carrying recipient ID and matching decision identity. Use the same recipient exclusions as the normal assignment, but accept no resource choice and transfer nothing, even if the recipient is rich. A normal-turn action cannot satisfy this decision or vice versa.
- Resolve the advisor before `startRound()` or `finish()`, including a completed-city final round and the engine's maximum-round cutoff. Preserve completion/scoring state while waiting; close the decision exactly once, then continue the saved round-end path. Do not reset the round or discard character ownership before the advisor acts.
- Keep public reveal/event and Queen payout timing consistent with the end-of-round rule. The existing engine records killed characters during `nextCall()` and grants Queen's bonus in `applyCharacterEffects()`; audit these paths so an assassinated Emperor cannot cause an early or duplicate bonus. Correct any shared rank-4 payout path needed for this integration and retain King/Patrician coverage.
- No advisor decision occurs for an unchosen Emperor, an ordinary living Emperor, or an unrelated killed rank. In a three-player game, the advisor still acts only once even if the same seat played another character earlier.

### Privacy, multiplayer, and persistence

- Keep the engine pure and serializable. Validate both normal and advisor actions in `act()` and `actInPlace()` before changing state. Reject wrong-seat, wrong-phase, malformed, repeated, and stale submissions without effects; bind advisor responses to the decision ID as well as round/character.
- Crown recipient, resource kind, and transfer counts are public. The randomly transferred card's identity is visible only to its former and new owners through their permitted knowledge. Other seats and spectators receive hidden hands and public counts. Do not put the card or its UID in unfiltered events, action history, animation payloads, logs, or hints: `viewFor()` copies public events.
- Taking a card reveals no other cards in the recipient's hand. Treat earlier Spy inspections as historical snapshots; do not refresh an inspection to reveal the current hand or count its copied cards as additional physical cards. Preserve any knowledge only under the relevant feature's existing memory policy.
- Save normal-turn completion flags and the full advisor decision/continuation. Reconnect, host recovery, or AI takeover resumes the correct actor without rerunning income, random selection, transfer, Queen payout, or round-end scoring. Migrate explicitly or bump `VERSION` if the new state is incompatible with older saves.
- Witch is absent from current character data and is outside this feature. Keep its published Emperor interaction as future compatibility guidance, without adding possession machinery now.

## Emperor AI logic

These are proposed heuristics, not claims of measured playing strength. Every decision uses `viewFor()` and public gold, hand sizes, cities, crown ownership, and legitimate character knowledge. Never inspect actual hidden hands, deck order, opponent draft picks, or the private engine seed.

1. **Draft valuation:** value noble gold, the likely tribute, assassination exposure, and control over another seat's next draft position. Do not reuse King's own-crown bonus: Emperor cannot appoint itself. A current crowned Emperor must give away its existing first pick.
2. **Recipient enumeration:** enumerate every legal recipient, including penniless and empty-handed seats. Avoid giving the strongest opponent first pick when a comparable weaker recipient exists, but weigh the immediate resource and remaining-round build opportunities too.
3. **Resource valuation:** evaluate available gold/card options independently. Gold can fund an immediate build; estimate a random card's value from permitted observations and the unseen pool, weighted by physical copies. A chosen `card` is random, never a targeted best-card pick. Account for effects such as Map Room when relevant.
4. **Crown value:** consider the recipient's next draft priority, which seats pick before the AI, and public threat. When the current round is known to be final, assign no future-draft benefit or penalty. Advisor decisions have zero tribute value in every round.
5. **Timing and progress:** compare assignment now with resource/build options when useful, but always complete it before ending. Recompute after any intervening keep, build, or interrupt. Never loop trying to skip a mandatory zero-reward assignment.

A proposed comparison is:

`Utility(recipient, resource) = OwnResourceValue + OpponentResourceLoss - RecipientDraftAdvantage + OwnDraftPositionChange`

Use the existing resource/score/threat scales, bound the draft terms, and break exact ties by stable seat order then resource order (`gold`, `card`, `none`). Treat this as a heuristic to calibrate, not a formula with an established win-rate advantage. For advisor responses, omit both resource terms.

`safeAction()` must resolve an advisor interrupt before generic turn fallbacks and must supply a legal normal assignment before attempting an otherwise-blocked `end`. Update controller AI scheduling and search candidate generation for both actions. `determinize()` and rollouts must handle a round-end actor with no live turn, keep each policy's view private, and sample random card outcomes without exploiting the authoritative seed. Sampled outcomes may vary; policies given identical permitted views and random streams must make identical choices.

## Integration and delivery

Cover `js/data.js` and custom selection; engine effects/actions/round-end stages/views/events/statistics; AI draft/action/search/fallbacks; controller and host/peer routing; HUD recipient/resource selection and advisor prompt; board crown/transfer feedback and icon; English/Chinese in `js/i18n.js` and every `js/lang/*.js` translation. Explain Emperor's crown gift separately from King/Patrician's self-inheritance in character previews and help text.

Suggested implementation validation: focused Emperor engine/AI tests; existing engine, Spy, Magistrate, and Tax Collector/Marshal suites plus Blackmailer coverage; twin-world privacy checks; pressure games across 3-7 players with Emperor casts; two-player setup rejection; lookahead smoke games; save/reconnect and live host/peer checks; desktop and 393x852 HUD review. The documents alone introduce no runtime changes or automated tests.
