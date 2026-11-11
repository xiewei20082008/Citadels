# Goal

Complete the district-card catalogue for **Citadels Revised Edition (2021)**: **84 physical cards across 47 district names**, comprising 54 basic cards and 30 different unique cards. Add the missing districts with working effects and correct the basic-card multiplicities. Match the actual revised-edition inventory, rather than merely increasing the existing deck to 84 cards.

This is an implementation specification, not a claim that the cards have been added. The baseline is the working-tree version of `js/data.js` inspected on **2026-11-11**: 63 cards across 37 names.

See [corner-cases.md](corner-cases.md) for implementation risks, unresolved rulings, and acceptance scenarios.

## Sources and edition boundary

- [Current publisher product page](https://www.zmangames.com/game/citadels/): confirms 84 district cards in the revised edition.
- [Official 2021 rulebook](https://cdn.svc.asmodee.net/production-zman/uploads/2024/10/zc01-rulebook_web.pdf): printed page 8 explains district selection; page 15 confirms the five type totals and clarifies several district interactions.
- [BoardGameGeek component inventory](https://boardgamegeek.com/boardgame/205398/citadels): individual basic-card quantities and the complete 30-name unique roster. This is a community inventory for the 2016 edition, whose district content was carried into the 2021 revised edition; use it alongside the current publisher materials.
- [District player aid](https://www.sob-zine.org/PlayerAids/Citadels_player_aid.html): supplementary reference for printed costs and brief effects. Check the actual revised-edition card text and official clarifications when implementing; these summaries are not replacement rules.

Exclude Citadels Duel, Scenic Route, promotional cards, and other editions' additional districts from the 84-card target. Character additions are outside this feature.

## Missing basic-card copies

These districts already exist. Increase their copy counts; do not create additional district IDs for identical copies.

| District | Current ID | Type | Current copies | Target copies | Add |
|---|---|---|---:|---:|---:|
| Manor | `manor` | Noble / yellow | 3 | 5 | 2 |
| Castle | `castle` | Noble / yellow | 3 | 4 | 1 |
| Palace | `palace` | Noble / yellow | 2 | 3 | 1 |
| Tavern | `tavern` | Trade / green | 3 | 5 | 2 |
| Market | `market` | Trade / green | 3 | 4 | 1 |
| Trading Post | `trading_post` | Trade / green | 2 | 3 | 1 |
| Docks | `docks` | Trade / green | 2 | 3 | 1 |
| Harbor | `harbor` | Trade / green | 2 | 3 | 1 |
| Barracks | `battlefield` | Military / red | 2 | 3 | 1 |
| **Total** | | | **22** | **33** | **11** |

The current `battlefield` entry is the existing cost-3 military district corresponding to revised-edition **Barracks**. Align its displayed name with that edition; retaining the internal ID avoids unnecessary identity migration. Do not count Barracks and Battlefield as separate district names.

The unchanged basic quantities are Temple ×3, Church ×3, Monastery ×3, Cathedral ×2, Town Hall ×2, Watchtower ×3, Prison ×3, and Fortress ×2. There are no missing religious cards.

## Missing unique districts

Add **one purple card of each of these 12 names**. IDs below are proposed repository identifiers. Costs are printed costs before discounts or alternative payment.

| District | Proposed ID | Cost | Effect to implement, briefly |
|---|---|---:|---|
| Armory | `armory` | 3 | Sacrifice itself to destroy a district. |
| Framework | `framework` | 3 | Sacrifice itself instead of paying for a construction. |
| Gold Mine | `gold_mine` | 6 | Resource gathering awards an additional gold when choosing gold. |
| Imperial Treasury | `imperial_treasury` | 5 | Remaining gold contributes extra final points. |
| Monument | `monument` | 4 | Counts twice for completion; cannot be built with five districts already present. |
| Museum | `museum` | 4 | Store a hand card once per turn; stored cards add final points. |
| Necropolis | `necropolis` | 5 | May sacrifice an owned district instead of paying its construction cost. |
| Park | `park` | 6 | An empty hand at turn end grants two cards. |
| Poor House | `poor_house` | 4 | An empty stash at turn end grants one gold. |
| Stables | `stables` | 2 | Construction uses no building allowance. |
| Statue | `statue` | 3 | Holding the crown at game end awards five extra points. |
| Theater | `theater` | 6 | Optionally exchange drafted characters after selection. |

These additions require engine behavior, legal actions or triggers, scoring where applicable, AI support, and presentation. Data-only entries do not satisfy this goal.

## Existing districts outside the target inventory

The current unique set includes **University (`university`)** and **Graveyard (`graveyard`)**. Neither belongs to the revised edition's 30-card unique roster. Exclude both from the revised-edition catalogue/deck. Do not silently relabel them as missing districts: their effects are different.

Legacy definitions, artwork, or handlers may remain for an explicitly supported legacy mode or migration, but must not generate extra cards in the revised-edition set. Handle existing saves deliberately if IDs, UID assignment, or deck composition become incompatible.

`haunted_city` already displays as **Haunted Quarter** in `js/i18n.js`; it is present, not a missing district. Its internal name does not require a second card.

The inventory arithmetic is:

```text
63 current cards + 11 additional basic copies + 12 new unique cards
                 - 2 legacy-only unique cards = 84 cards
37 current names + 12 new names - 2 legacy-only names = 47 names
```

The previous aggregate difference of ten purple cards is therefore **twelve missing names minus two legacy names**, not a list of only ten missing districts.

## Required resulting inventory

| Type | Current cards | Target cards | Target distinct names |
|---|---:|---:|---:|
| Noble / yellow | 8 | 12 | 3 |
| Religious / blue | 11 | 11 | 4 |
| Trade / green | 14 | 20 | 6 |
| Military / red | 10 | 11 | 4 |
| Unique / purple | 20 | 30 | 30 |
| **Total** | **63** | **84** | **47** |

Retain these 18 existing unique names alongside the 12 additions: Basilica, Capitol, Dragon Gate, Factory, Great Wall, Haunted Quarter, Ivory Tower, Keep, Laboratory, Library, Map Room, Observatory, Quarry, School of Magic, Secret Vault, Smithy, Thieves' Den, and Wishing Well. Each has one copy.

**Catalogue size and game setup are separate.** Published setup uses all 54 basic cards plus 14 selected unique cards, making a 68-card game deck. The current implementation shuffles the entire catalogue through `makeDeck()`; completing that catalogue yields 84 cards under the current setup behavior. Adding published 14-unique selection is a separate setup feature and must not be confused with omitting 16 cards from the implemented catalogue.

## Implementation requirements

The following are project integration requirements, rather than additional published card rules:

- Keep `js/engine.js` pure and serializable. Validate actions through the host's `act()` path, including ownership, timing, target eligibility, once-per-turn limits, payment, and duplicate restrictions. Reject invalid actions without partial mutation.
- Integrate Framework and Necropolis with construction accounting, Magistrate decisions, and Tax Collector settlement. Apply Stables' exemption consistently, including a confiscated construction. Use the official page-15 clarifications when resolving these interactions.
- Give Monument an explicit completion contribution without inventing a second physical card or doubling unrelated district counts, income, or printed-cost scoring.
- Track Museum attachments as physical cards. Preserve them on ownership transfer and account for their destinations on destruction. Expose only information permitted by `viewFor()`; include attachments in conservation checks.
- Resolve Park and Poor House at the appropriate character-turn boundary, including the existing two-character-per-player mode. Add Theater's selection decision without leaking hidden drafts or exposing full state to AI policies.
- Update `js/ai.js` and `js/search.js` so new districts can be valued and used legally. Their unseen-card estimates and simulations must use the actual catalogue and any configured game deck.
- Integrate controller events, saves/reconnect, HUD controls, card descriptions, tooltips, icons, and checked-in building artwork. Follow the existing `js/models.js` and `tools/render-art.mjs` artwork workflow.
- Add English and Chinese strings and all supported `js/lang/*.js` translations. Migrate or bump the save `VERSION` if necessary; never reinterpret old physical-card UIDs as different districts silently.

## Adjacent edition differences to track

Inventory completeness alone does not establish complete revised-edition rules compatibility. The supplementary card reference also shows existing printed-cost differences: Basilica is currently 6 versus 4, Ivory Tower 3 versus 5, Observatory 5 versus 4, and Secret Vault 3 versus 0. Secret Vault is also currently buildable/scored in the city, whereas the revised card is unbuildable and scores from the hand.

Record these as existing-card corrections to verify when aligning the edition; do not count them as missing cards. Other existing district effects, including rank-8 protection and Haunted Quarter scoring, need their own rules audit. This inventory spec does not certify those existing effects or require adding absent characters.

## Acceptance criteria

1. The full revised-edition catalogue generates exactly 84 cards with distinct physical UIDs, 47 district IDs, the type totals above, and the exact per-name multiplicities. University and Graveyard are absent from that inventory.
2. Each of the 12 new districts has its verified cost and functioning effect, with focused coverage for its legal use, rejected actions, timing, scoring, and relevant existing-character interactions.
3. Card conservation includes hands, cities, deck, Museum attachments, and any card temporarily held by a pending decision. Monument's completion weight does not affect physical conservation.
4. AI games terminate without repeated rejected district actions. Hidden-information checks continue to pass, including Museum and Theater decisions.
5. Existing engine and pressure checks pass after updating assumptions about the catalogue. Check saves/reconnect and human/network actions for any new decisions; review new controls on desktop and at 393×852.

Only documentation is added by this task. Implementing the specification and reporting passing validation remain future work.
