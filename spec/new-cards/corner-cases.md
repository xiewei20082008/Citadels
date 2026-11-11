# New district cards: corner cases

Implementation risks and proposed acceptance scenarios for [goal.md](goal.md). These are not confirmed defects or claims of passing tests. Cover all 12 missing unique districts, the 11 additional basic copies, and the two legacy exclusions. Preserve goal.md's distinction between the 84-card catalogue and a published 68-card game deck.

## Rule references and unresolved choices

Use goal.md's edition and inventory sources. The [official revised-edition rulebook, printed page 15](https://cdn.svc.asmodee.net/production-zman/uploads/2024/10/zc01-rulebook_web.pdf#page=15) specifically establishes:

- Armory cannot destroy a district in a completed city.
- Framework construction and unpaid Necropolis construction bypass confiscation; a later paid construction remains eligible.
- Museum attachments follow ownership transfers and return facedown to the deck bottom on destruction.
- Confiscated Stables preserves the original builder's opportunity to build again.
- Theater hides exchanged identities from uninvolved players. With two characters per player, its owner chooses their outgoing role and randomly takes an opposing role.

The [supplementary card reference](https://www.sob-zine.org/PlayerAids/Citadels_player_aid.html) supports goal.md's brief effects; verify actual card text before implementation. Distinguish printed rules from proposed engine safeguards below. When the sources do not settle an interaction, record a project ruling and its reasoning before making it an asserted rules test.

In particular, verify Armory's self-targeting and sacrifice behavior in a completed city; whether any protection beyond completion applies to its targets; the order of returned cards in a multi-card discard; and once-per-turn behavior if a used district leaves and re-enters play. Do not inherit Warlord restrictions or silently choose these rulings merely because a helper already exists.

Absent Witch, Alchemist, Diplomat, and Artist support is future compatibility work, not a request to implement those characters.

## 1. Catalogue, physical identity, and migration

| Case | Required check | Likely failure |
|---|---|---|
| Generate the full revised catalogue | Assert 84 cards, 47 names, and every per-name count from goal.md. | A total-only assertion accepts the wrong roster. |
| Generate twice | Each generation has unique UIDs and the same deterministic composition. | A module-level counter or shared card objects corrupts replay or independent games. |
| Add identical basic copies | Each copy has its own UID but the same district ID. | Duplicate-placement rules compare UIDs and allow repeated names without an exemption. |
| Barracks and Haunted Quarter names | Keep one identity per existing district, including `battlefield` and `haunted_city` aliases. | Add new cards under revised names while retaining both old entries. |
| Remove legacy cards from the revised inventory | University and Graveyard do not appear in generated cards, unseen-card models, or fresh deals. | Generation changes but search still samples the old roster. |
| Restore a pre-change save | Migrate explicitly or reject with the version policy; preserve card identity. | An old UID now points to a different card after copy counts change. |
| Deal at every supported player count | Count dealt hands plus the remaining deck, not the remaining deck alone. | Expect 84 cards after dealing and manufacture replacements. |
| Future selected-unique setup | Persist the selected roster and use its actual total throughout simulation and conservation. | Search assumes every catalogue card is in a 68-card game. |

Proposed conservation invariant: each physical UID occurs exactly once across deck, hands, cities, Museum attachments, and pending card locations. Private inspection snapshots are knowledge copies, not additional physical cards. Monument changes completion weight only, never this invariant.

## 2. Armory

| Case | Expected behavior or question to resolve |
|---|---|
| A valid opponent district is chosen | Validate target and sacrifice together; remove each physical card once. No gold price should be inferred from Warlord's destruction formula. |
| Target belongs to a completed city | Reject before sacrificing Armory. Use completion weight, including Monument. |
| Target is stale, missing, malformed, or no longer owned by the stated player | Reject without consuming Armory or altering either city. |
| Self-owned target, Armory itself, Bishop, Keep, or Great Wall | Verify the card-specific eligibility ruling. Do not route all cases through `shielded()` or `destroyCost()` unexamined. |
| Target is Museum | Resolve the Museum and every attachment through the destruction path, without revealing facedown identities. |
| Target is Monument or a scoring district | Recompute current city value and completion contribution; preserve the chosen final-round lifecycle. |
| An ability, resource choice, or threat response is pending | Respect that stage's action gate. Owning Armory does not authorize an out-of-turn response. |

Sacrifice, destruction statistics, logs, and any legacy Graveyard behavior need an explicit contract. Legacy handlers must not accidentally introduce an interrupt into the revised-only game.

## 3. Framework and Necropolis

| Case | Expected behavior or proposed safeguard |
|---|---|
| Pay gold normally versus choose alternative payment | Make payment mode explicit. An affordable card must not force sacrifice, and a sacrifice must not also charge the printed gold cost. |
| Framework replaces a costly construction with zero gold available | Validate the destination card, legal build allowance, duplicates, and sacrifice before committing either movement. |
| Necropolis uses a district as payment | The sacrificed UID must currently belong to the builder; it cannot be an opponent card, hand card, pending card, or nonexistent target. |
| Sacrifice has Factory, Quarry, Monument, or another relevant effect | Document which checks use the pre-sacrifice city and which use the resulting city. Cover a sacrifice that removes the very effect relied upon for legality. |
| Necropolis already exists in the city | Exercise duplicates and Quarry explicitly; validate the sacrifice/destination combination atomically. |
| Both alternative-payment effects are available | Select one coherent payment route. Reject mixed or duplicate payment payloads before changing state. |
| A warrant is active | Keep free construction distinct from the first paid construction. A later eligible gold-paid build must still reach its warrant response. |
| Tax Collector is in the cast | Settle construction tax from the recipient's remaining stash once, even with no construction gold paid. Do not tax the sacrificed district's removal. |
| Museum is sacrificed | Dispose of its stored cards as well as the Museum; do not lose them during generic city removal. |
| Sacrifice and replacement straddle the city goal | Check the resulting transaction, not a temporary intermediate city. Do not award completion or statistics to the wrong owner. |
| An invalid request reaches a search simulation | Validate before mutation where practical; otherwise discard the failed simulation branch. Do not continue with a half-sacrificed city. |

Test ordinary characters, Architect, Scholar, Trader, and Navigator separately. Alternative payment does not automatically waive build allowance, explicit construction prohibitions, mandatory resources, or pending decisions.

## 4. Stables and construction limits

| Case | Expected behavior or question to resolve |
|---|---|
| Ordinary character builds Stables then another district | Preserve the ordinary build allowance. |
| Ordinary allowance already consumed | Stables remains eligible if all other construction requirements hold. |
| Architect/Scholar/Trader builds several cards | Use the same allowance accounting in engine, HUD, AI, and search; a purple Stables exemption is independent of Trader's trade exemption. |
| Navigator tries to build Stables | Preserve Navigator's explicit no-construction restriction. An allowance exemption must not turn a prohibition into permission. |
| Stables is confiscated | The original builder retains the exemption; Magistrate gets the actual district and any recipient tax. |
| Stables is the first paid build under warrants | It remains a paid construction despite its allowance exemption. |
| Stables is seized rather than built | Do not trigger construction tax or consume an ordinary construction opportunity. |

The current `countsTowardLimit()` model conflates several forms of permission if treated as the only construction check. Cover Wizard's immediate construction path as well as ordinary `build` actions; verify its character-specific rules before asserting cross-path exemptions.

## 5. Monument and completion

Keep **physical district count**, **completion contribution**, **construction allowance**, and **score** separate.

| Case | Required check |
|---|---|
| Four physical districts before building | Exercise the permitted side of Monument's placement boundary. |
| Five physical districts before building | Reject construction without payment, hand movement, or allowance consumption. Repeat with alternative payment and Wizard, verifying any explicit exception first. |
| A near-complete city contains Monument | Completion contribution is physical count plus one. Test configured goals 7 and 8. |
| Warlord, Armory, or Marshal considers that city | Completed-city protection uses the same completion definition as game-end checks. |
| Scoring the city | Monument contributes its single printed cost, not twice that cost; unrelated type counts and bonuses still count one physical district. |
| Monument is acquired through confiscation or another ownership effect | Distinguish construction eligibility from acquisition rules; check completion for the actual recipient. Record a ruling for any uncertain placement restriction. |
| Completion is followed by removal or sacrifice | Define whether completion remains latched for final-round and first-completion awards, consistently with the existing game. Do not accidentally start another round or finish mid-action. |

Current integration hazards: `checkComplete()`, `shielded()`, `score()`, AI race estimates, and search evaluation use `city.length`. Audit each call site for its purpose; replacing every length with completion weight would create different errors.

## 6. Museum and hidden attachments

| Case | Required check |
|---|---|
| Store one hand card | Move its exact UID into Museum storage. It no longer belongs to the hand, deck, or ordinary city. |
| Empty hand, foreign UID, duplicate UID, or repeat storage in the same turn | Reject without consuming a valid opportunity or changing physical locations. |
| Two owned character turns | Reset storage availability at the defined character-turn boundary, not merely once per round. |
| Two physical Museums in a future duplicate setup | Define whether usage is per instance; avoid a global boolean that silently merges them. |
| Store the last hand card | Include this state in Park's end-turn eligibility and AI planning. |
| Stored card would affect another score | It provides no ordinary built-district effect or hand contribution. Check Map Room, Secret Vault, and district-type bonuses separately. |
| Museum changes owner | Attachments remain associated with that exact Museum UID. Future acquisition paths must not detach or duplicate them. |
| Museum is destroyed or sacrificed | Account for the Museum and its attachments in the deck; specify return order while keeping faces private. |
| Final scoring | Distinguish Museum's own printed-cost contribution from its attachment bonus; empty storage adds no attachment bonus. |
| Spy, Wizard, Magician, or Seer accesses a hand | Museum storage is a different zone, not extra hand cards. |

Privacy contract to define before implementation: which attachment identities a current owner or former owner legitimately knows. At minimum, observers must not receive hidden IDs through serialized state, event payloads, tooltips, logs, or replay. Preserve legitimate prior knowledge without treating remembered cards as being in two locations.

Search determinization must reserve known stored UIDs and sample unknown attachments consistently. Two otherwise identical permitted views with different hidden attachments must not produce different AI decisions solely through access to host state.

## 7. Gold Mine, Park, and Poor House

| District / case | Required check |
|---|---|
| Gold Mine: take gold for mandatory resources | Apply the gathering modifier once. Replaying the resource action must not award it again. |
| Gold Mine: choose cards, receive income, steal gold, or collect tax | Do not attach its modifier to a generic gold-gain helper. |
| Gold Mine: threatened character gathers gold | Include the gathering modifier before computing the bribe; keep deferred character income separate. |
| Gold Mine: acquired after gathering | No retroactive award or second resource action. |
| Park: hand empty versus one card remaining | Evaluate at the actual turn end after outstanding choices finish. Drawing nothing from an empty deck must still terminate the turn. |
| Park: deck has one card | Take only available cards; do not fabricate the second or create a resource keep decision. |
| Poor House: stash zero versus positive | Evaluate after that turn's payments and taxes; do not trigger during every temporary zero balance. |
| Both end-turn districts are owned | Resolve each eligible effect once. Save/reload or repeated `end` must not duplicate either effect. |
| Effect is acquired, confiscated away, sacrificed, or destroyed before turn end | Check the actual owner and current city at the trigger boundary. |
| Two characters belong to one player | End-turn flags belong to a character turn; later turns may have different eligibility. |
| Character is assassinated | No ordinary turn-end trigger from a skipped turn. |
| A threat, warrant, or card choice is unresolved | Do not let `end` bypass it or advance while its effects remain unsettled. |

Future compatibility: the rulebook gives special Witch and Alchemist timing. Preserve the ability to add that timing without treating a suspended turn as a completed turn or mixing a refund with ordinary bank income.

## 8. Imperial Treasury, Statue, and final scoring

| Case | Required check |
|---|---|
| Treasury owner has zero, one, or many gold | Check incremental scoring against the printed effect; use the final stash after all remaining turns and transfers. |
| Tax pool contains gold | An uncollected pool is not a player's stash. |
| Gold changes after a preview score | Recompute final values; do not cache a stale Treasury bonus. |
| Statue owner holds or loses the crown | Score from final crown ownership, including any existing round-end inheritance. |
| Statue is moved or destroyed late | Use final ownership and presence, not who originally built it. |
| A player holds both districts | Award independent bonuses and base costs once each, then apply the existing tie-break policy. |
| AI can spend gold or finish the game | Evaluate the resulting score, crown state, and opponent continuation rather than assuming an affordable action improves the outcome. |

Do not silently fold goal.md's adjacent existing-card corrections into these expectations. If Secret Vault's revised hand scoring is implemented, explicitly update Museum/Map Room interactions and reject building it through every construction route.

## 9. Theater, selection, and character ownership

| Case | Required check |
|---|---|
| Last draft pick still requires a discard | Complete the entire selection phase before opening Theater. |
| Theater owner chooses pass | Start normal character calling once; no compulsory exchange. |
| Exchange occurs | Transfer role ownership atomically. Do not transfer player gold, hands, city, or crown merely because a rank-4 role changes hands. |
| Two-character game | Choose one owned role to give; let the host resolve a random opposing role using serialized game randomness. Do not trust a client-selected incoming ID. |
| Opponent's role is hidden | Public target choice cannot reveal the role before commitment. Give each involved player the resulting knowledge through their own view. |
| A role was previously known from drafting | Retain valid knowledge while invalidating ownership assumptions changed by the exchange. |
| Self-target, missing opponent, unowned outgoing role, or stale response | Reject before consuming the optional decision or advancing selection. |
| Save/reconnect during the prompt | Restore the decision and randomness exactly; do not redraw on reload. |
| Another actor submits build, income, or ability | Gate normal turn actions until Theater resolves. |
| Assassination, theft, warrant, or threat is assigned later | Resolve effects against the post-exchange character holder; do not cache pre-exchange seat assignments. |
| Theater is built during an ordinary turn | Do not reopen the already finished selection phase. |

Proposed implementation: a separately typed selection decision, with actor, round, and decision ID. `endDraftStep()` currently calls `nextCall()` directly; insert the decision before any character-turn side effects. Avoid routing a cardless prompt through Graveyard-style interrupt assumptions.

## 10. Cross-cutting delivery and verification

- **Transaction boundaries:** malformed payments, foreign targets, and stale/replayed decisions leave the public `act()` input unchanged. For mutable simulations, validate first or abandon the failed branch rather than reusing partially mutated state.
- **Independent flags:** district uses must not consume character abilities, mandatory resource choices, or another district's use. Specify transfer/re-entry behavior per physical instance where necessary.
- **Ownership and statistics:** separate building, acquiring, sacrificing, and destroying. Apply completion, taxation, recap counts, and attached-card movement to the actual recipient exactly once.
- **AI progress:** every new optional decision has a legal pass/fallback; every selected action can advance state. Empty decks, empty hands, unaffordable choices, and zero-benefit actions must not create loops.
- **State reconstruction:** extend pressure checks, unseen-card estimation, rollout cloning, and save schema for new card zones and selection decisions. Test each with hidden attachments and without legacy districts.
- **Presentation:** all 12 cards need artwork, localized names/effects, and usable controls. Check targeting, cancellation before commitment, pending-stage visibility, desktop, and 393×852 layouts; hidden faces must not appear in image labels or tooltips.

Suggested minimum acceptance scenarios:

1. Assert exact catalogue composition and physical identity; load a pre-change save through the declared migration/version path.
2. Run Armory against a legal target, a Monument-completed city, a Museum, and rejected stale targets.
3. Exercise both payment modes for Framework/Necropolis with zero gold, tax, pending warrants, removed discounts, and invalid sacrifice UIDs.
4. Build Stables before and after the ordinary limit, confiscate it, and verify Navigator remains prohibited.
5. Check Monument at the four/five-district boundary, goals 7/8, protection, scoring, acquisition, and later removal.
6. Store Museum cards, transfer and destroy it, save/reconnect, compare public views, and determinize unknown attachments without losing UIDs.
7. Gather with Gold Mine under blackmail; end turns with Park/Poor House over empty/short decks, two-character seats, and repeated submissions.
8. Finish a game with Treasury and Statue after late gold/crown changes, including inheritance under the existing supported rules.
9. Resolve Theater by pass and exchange in both one-role and two-role play; reconnect mid-decision and verify no premature role reveal or turn start.
10. Run existing engine, character, and pressure suites plus focused district scenarios and lookahead smoke games. Report actual results only after implementation and execution.
