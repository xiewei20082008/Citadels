# Implementation notes

The default catalogue now contains the specified 54 basic cards and 30 unique
cards, across 47 identities. `battlefield` is displayed as Barracks. University
and Graveyard are excluded from `DIST` and fresh decks; their old artwork and
compatibility handlers do not add physical cards.

The default setup continues to use the full catalogue. `makeDeck(uniqueIds)` and
`createGame({ uniqueDistricts: [...] })` also preserve a configured unique roster
and stable catalogue UIDs for search; a published 14-unique setup selector remains
a separate feature.

Save/network version is **8**. The controller's existing version gate rejects old
solo and host saves and mismatched peers. There is no UID migration: an older
save cannot be resumed under the new catalogue.

## Rules and project rulings

The [official revised rulebook, printed page 15](https://cdn.svc.asmodee.net/production-zman/uploads/2024/10/zc01-rulebook_web.pdf#page=15)
supplies the construction/confiscation, Museum transfer/destruction, Stables and
Theater clarifications. Costs and basic effects follow the feature specification
and its [district reference](https://www.sob-zine.org/PlayerAids/Citadels_player_aid.html).

- Armory is independent of rank-8 powers: Bishop, Keep and Great Wall do not
  protect its target. Another owned district is a legal target. Targeting the
  same physical Armory is rejected, since it would not destroy an additional
  district. As a project interpretation of the completed-city prohibition, both
  the sacrificed Armory and its target must be outside completed cities.
- Framework and Necropolis are explicit alternative payments, never automatic
  discounts. Duplicate permission and discounts are checked against the city
  remaining after sacrifice. This prevents relying on a sacrificed Quarry.
  Monument's five-district placement restriction uses the pre-construction city,
  even with alternative payment or Wizard construction. Acquisition is not
  construction and does not apply that restriction.
- Alternative payment still uses the character's building allowance (unless the
  new district is Stables or a Wizard bonus construction), triggers tax, and
  leaves the first paid construction eligible for a warrant. Navigator cannot
  construct by any payment route.
- Monument contributes two only to completion and completed-city protection.
  Printed-cost scoring, income, statistics, and physical conservation still count
  one card. The existing first-completion/final-round latch remains set if a
  later sacrifice reduces the city. Sacrifice payments are committed as one
  transaction before checking the replacement's completion.
- Destruction/sacrifice returns the district first, then Museum attachments in
  storage order, to the deck bottom. This is the project's deterministic ordering
  for an otherwise unspecified multi-card discard. Sacrifices are logged
  separately from offensive destruction and do not count as an opponent's loss.
- Museum stores actual card objects under the physical Museum. Usage is keyed by
  Museum UID in the current character turn, so leaving and re-entering does not
  refresh it; each new character turn does. A current owner may inspect its
  contents. Each prior owner remembers identities they saw while owning it.
  Other viewers see counts and anonymous backs. Knowledge metadata stays private;
  public events never contain attachment identities. Destruction clears storage
  knowledge before returning the cards to the deck.
- Park and Poor House resolve once at the actual character-turn end, after all
  pending decisions and taxes. Skipped assassinated turns do not trigger them.
  Short decks supply only available cards. These beneficial optional effects
  resolve automatically when eligible, as do the existing passive districts.
- Theater pauses selection completion before the first character is called.
  Its owner chooses an outgoing role and an opponent, or passes. The engine
  chooses the opposing role using serialized randomness. Only participants know
  exchanged identities, including the outgoing role's new owner. Draft
  observations are retained, but AI ownership inference stops using their old
  seat implications after an exchange. Theater built during turns waits until
  the following selection phase.

`physicalCards()` includes Museum attachments and pending construction/keep
cards, excluding private inspection snapshots. Existing conservation helpers and
pressure-world reconstruction account for the new zone and cardless Theater
decision. Search reserves known attachments and exchanged roles, samples hidden
attachments from the configured catalogue, and abandons rejected actions without
reusing a partly mutated state.

Thieves' Den payments use a hand-card picker for both ordinary and Wizard
construction, including when Framework is also available. No cards are selected
automatically for human players. The selected cards and resulting gold cost are
visible before confirmation; gold-only and sacrifice routes remain separate.
Hidden payment panels retain their selections only for the same construction.

The pressure action generator includes Armory targeting, Museum storage,
Framework/Necropolis payments (also through Wizard), and Theater exchanges as
well as passes. It also submits foreign/missing sources, mixed/duplicate payments,
stale Theater responses, and district actions during pending card decisions.
Candidate evaluation asserts that the original state remains unchanged. These
additions have not been executed.

## Existing edition corrections still outside this change

Basilica remains cost 6 (revised reference: 4), Ivory Tower 3 (5), Observatory 5
(4), and Secret Vault 3 (0). Secret Vault retains the existing buildable/city
scoring behavior; its revised hand-only scoring needs a separate correction.
Haunted Quarter scoring and rank-8 protections also retain their existing rules.
These are not additional missing cards and catalogue completeness does not imply
a complete revised-rules audit.

## Validation status

No automated tests, gameplay simulations, or UI checks were run, as requested.
The twelve new WebP assets were generated with `tools/render-art.mjs` from the
new recipes in `js/models.js`. Generation is an asset-authoring step, not gameplay
validation. Desktop/mobile behavior and the updated existing suites are unverified.
