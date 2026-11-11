# Goal

Add Tax Collector (rank 9, an alternative to Queen) and Marshal (rank 8, an alternative to Warlord), following the existing Spy and Magistrate integration pattern. Character IDs must be unique and distinct from ranks; do not overwrite Queen ID 9 or Warlord ID 8.

## Rule sources

Checked online on 2026-11-09 against the publisher's [2021 Citadels rulebook](https://coolplay.rs/wp-content/uploads/2024/03/Citadels_pravila-Eng.pdf): printed page 4 for ability timing, page 8 for custom casts, pages 12-13 for Bishop and Alchemist, page 14 for Marshal and Tax Collector, and page 15 for tax and district clarifications. The publisher's [2016 deluxe rulebook](https://images.zmangames.com/filer_public/82/aa/82aac2d6-2a19-4143-9690-eb16b82bd9af/citadels_deluxe_rulebook.pdf), especially printed pages 13-14, is an edition cross-reference. Use the revised property-tax ability, not an older Dark City Tax Collector ability.

The published baseline below is paraphrased. Implementation contracts and AI heuristics are project proposals, not additional official rules. See [corner-cases.md](corner-cases.md) for acceptance scenarios.

## Tax Collector: published baseline

When Tax Collector belongs to the game's character cast, each construction immediately contributes one gold from its builder's remaining stash to a shared tax pool, if any gold remains. Free construction is taxable. Each district is assessed separately. Tax Collector's own character turn is exempt; the same player's other character is taxable.

During Tax Collector's turn, its player may take the entire pool. Taxes remain active when that character is discarded, unchosen, or killed. Uncollected gold survives round boundaries. For a confiscated construction, Magistrate owes the tax instead of the original builder. Alchemist refunds exclude taxes.

## Marshal: published baseline

Marshal gains one gold per military district. Once during its turn it may pay another player a district's building cost to seize it into its own city. Eligible districts cost at most three, cannot belong to a completed city, and cannot duplicate a district already in Marshal's city, even with Quarry. Bishop protects its city against rank 8 unless killed; a bewitched Bishop protects Witch's city instead.

## Implementation contract

### Tax settlement and persistent state

- Store a nonnegative integer tax pool at game scope. Initialize it to zero for a new game; never reset it in `startRound()`. Cast membership, rather than a revealed or drafted holder, enables taxation.
- Resolve construction ownership before assessing tax. For ordinary construction, subtract the validated build payment, place the card, then assess the builder's remaining stash. For confiscation, refund the builder's actual gold, place with Magistrate, and assess Magistrate. Charge exactly once after the warrant response, never while the card is pending.
- Use a construction-specific tax step. Do not attach taxation to a generic city insertion helper that will also handle seizure, exchange, save restoration, or simulation reconstruction.
- Exemption belongs to the character responsible for the construction, not every player who drafted Tax Collector. A Magistrate receiving a confiscated Tax Collector build still owes its tax. If one player owns both roles, that confiscation is assessed as Magistrate's acquisition.
- Proposed action: `collectTax`, bound to the active round and character turn. It atomically adds the full current pool to the acting player's stash, clears the pool, and consumes a once-per-turn collection flag. An empty-pool collection is legal and consumes the ability. Do not automatically collect on reveal, at turn end, or for an assassinated role.
- Collection is optional and independent of the mandatory resource action. Allow it before or after resources/building when no pending choice or interrupt is active. Do not allow another character, including the same player's other role, to collect.
- Tax is assessed after building, so having exactly the construction price is sufficient. A penniless builder neither borrows nor owes a later tax. Reserve the tax in multi-build planning rather than requiring it as an up-front surcharge.
- Public views and events expose pool size and actual transfers, without exposing hidden character ownership. Save/reload restores the pool and collection flag. Future Alchemist support must keep build refunds separate from tax payments.

### Seizure and district ownership

- Proposed action: `seize`, with opponent ID, physical district UID, and active round/turn identity. The host determines eligibility and payment; reject malformed, stale, repeated, self-targeted, or unaffordable actions before mutation.
- Compute seizure cost independently of `buildCost()` and `destroyCost()`. Neither Factory's construction discount nor Warlord's one-gold destruction discount applies. Check the three-gold ceiling against the district's applicable cost, not what its owner originally paid or its scoring bonus.
- Atomically transfer payment to the owner and move the existing card from their city into Marshal's city. Preserve its UID and attached state. Do not draw, discard, rebuild, trigger Graveyard, offer a warrant, assess construction tax, or consume Marshal's ordinary build allowance.
- Treat the absence of construction tax and warrant/build-limit triggers as an inference from the rulebook's distinction between seizing and building; it does not explicitly list all those negative interactions.
- Check completion for the receiving player after acquisition. Continue the current round under existing completion rules; do not end immediately at rank 8 or skip rank 9.
- Allow seizure before or after the mandatory resource action or ordinary construction, subject to pending decisions. A completed receiving city does not prohibit acquiring another district from an eligible opponent.
- Preserve existing automatic character-income timing for consistency with this engine: grant Marshal's red income once at turn start using `colorCount()`, including School of Magic. A red district seized later grants no retroactive income. This is a project timing choice; the published general rule allows unspecified abilities during the turn.

### Edition boundaries and future compatibility

The original Marshal implementation retained Warlord-only Keep and Great Wall effects. That compatibility decision is superseded by [the rank-8 fix](../rank8-fix/goal.md): Keep cannot be seized, and Great Wall adds one gold to the payment for seizing its owner's other districts. Marshal's three-gold eligibility ceiling uses building cost before this surcharge.

Artist, Witch, Alchemist, Diplomat, Museum, Framework, Necropolis, and Stables are future compatibility cases where absent from `js/data.js`; adding them is outside this feature. Future Artist support must retain beautification and use its increased cost for both Marshal's ceiling and payment. Future Museum transfers retain attached cards. Free-construction paths must still reach tax settlement. Preserve the project's current city goal, scoring, Haunted City behavior, and supported 2-7 player range.

## AI logic

These are proposed heuristics, not official strategy rules or claims of measured strength.

### Tax Collector

- Draft valuation considers the visible accumulated pool, publicly estimated construction before rank 9, and the risk of assassination or missing the role. Do not inspect future hands, hidden drafts, or the actual deck order.
- Collect available taxes before spending when the action is free to resolve. Recompute building and resource plans from the resulting gold. Skip a useless empty collection and continue the turn rather than looping.
- On all other roles, simulate sequential construction payments and taxes. A first build can reduce the budget for a second one. Respect Magistrate's actual recipient and the two-character exemption boundary.
- Do not count an uncollected pool as spendable player gold, as a player stash for theft, or as a final score bonus.

### Marshal

- Enumerate only legal opponent district UIDs using the same eligibility rules as the host. Evaluate seizure and ordinary building together, considering their shared gold budget but independent limits.
- Compare acquisition value, new color/scoring bonuses, completion, and denial against payment, lost purchase opportunities, and the benefit of giving an opponent gold. A seizure can be legal and strategically poor, especially when it ends the game while losing.
- A proposed ranking is `OwnCityValueGain + OpponentCityValueLoss - GoldOpportunityCost - OpponentFundingValue`. Use existing score/threat estimates; calibrate weights separately. Apply deterministic seat/UID tie-breaking and skip nonpositive choices.
- Re-evaluate after gathering resources, collection on a different role, construction, or a warrant response. Do not submit a target UID or cost cached before state changes.
- `safeAction()` and Monte Carlo rollouts must handle the new actions, consumed abilities, persistent pool, and rank-9 continuation. Every policy receives only its permitted `viewFor()`.

## Integration and delivery

Integrate character data and custom selection; engine validation, tax settlement, views and events; AI drafting/actions/search; controller pacing, saves and reconnect; HUD and 3D feedback; icons; English/Chinese and every `js/lang/*.js` translation. Keep one character per rank. Existing presets stay unchanged unless a new preset is deliberately added.

Follow repository architecture: serializable pure engine, host-authoritative actions, privacy through `viewFor()`, and a save `VERSION` migration or bump if new fields make old states incompatible. Distinguish construction counts from seizure counts in recap statistics; moving an existing district must not inflate built totals.

This specification introduces no implementation or passing-test claim. Suggested validation: focused Tax Collector/Marshal engine and AI scenarios, existing engine/Spy/Magistrate suites, pressure games across supported player counts and relevant casts, lookahead smoke games, save/reconnect and live multiplayer checks, and desktop plus 393x852 HUD review.
