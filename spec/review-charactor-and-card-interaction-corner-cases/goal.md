# background

The effects of different characters and cards can interact with one another.
- two characters
- a character and a card
- two cards

# List of potential interacts

Review candidates below are potential corner cases, not confirmed bugs or a claim
of official rules compliance. Scope follows the current character and district
rosters in `js/data.js`, the engine, and the existing feature specs. For each
interaction, review legality, timing, payment, ownership, and final scoring.

Only one character per rank can be in a cast. Alternatives such as Thief, Spy,
and Blackmailer cannot interact in the same game. In two- and three-player games,
one seat has two characters: distinguish player ownership from the active role.

## Two characters

| Interaction | Corner cases to review |
| --- | --- |
| Assassin + any alternate character | Target and skip by rank, not character ID. A killed role gets no resource action, automatic income, ability, or turn-end district effects. |
| Assassin + Thief | A killed target cannot be robbed; no theft occurs for an unchosen role. Theft happens when the marked role is called, before its new income. |
| Assassin + Bishop | Killing Bishop removes its rank-8 protection, including when its seat also owns another character. Abbot is not a Bishop substitute. |
| Assassin + King / Patrician / Emperor | Resolve killed rank-4 inheritance or Emperor's advisor choice at round end, including the final round. Do not grant the skipped role's income or Emperor tribute. |
| Assassin + Queen | Defer the adjacency reward for a killed rank-4 holder until its round-end reveal. Check whether Queen itself was killed or unchosen. |
| Assassin + Tax Collector | Construction still pays tax while Tax Collector is killed or unchosen; its pool remains uncollected. |
| Thief + income characters | Steal the existing stash before Merchant's bonus, colored income, Abbot's tithe, Navigator's optional gold, or Tax Collector's collection. Do not steal the shared tax pool. |
| Thief + a second character at the same seat | Rob only on the marked role's call. A Thief targeting its own later role must not create or erase gold through an aliased transfer. |
| Blackmailer + automatic character effects | Finish gathering and any keep choice, resolve bribe/refusal and reveal/pass, then grant character effects once. Include Merchant, Architect, Abbot, Patrician, Emperor, and Queen. |
| Blackmailer + Magistrate | Threat and warrant can mark the same role independently. Resolve blackmail before construction; a later confiscation refund must not reopen or recalculate blackmail. |
| Blackmailer + Tax Collector | Resolve the threat before collection; subsequently collected gold is not exposed to an already-resolved threat. |
| Blackmailer + its own later role | A same-seat bribe or full theft has no net gold effect. Marker resolution and the later character's normal effects must still progress. |
| Magistrate + Architect / Scholar / Seer | Follow the first paid construction, not the first build-limit slot. A declined or ineligible first paid opportunity cannot move to a later build. |
| Magistrate + Trader | A paid trade district can trigger a warrant despite using no ordinary build allowance. Confiscation does not turn it into an ordinary build. |
| Magistrate + Wizard | Direct construction from the inspected hand can trigger a warrant and remains a bonus construction. Wizard's duplicate permission does not let Magistrate confiscate a duplicate. |
| Magistrate + Tax Collector | Finish the warrant response before assessing tax. On confiscation, refund actual gold paid and tax Magistrate's remaining stash exactly once; otherwise tax the builder. |
| Bishop + Warlord / Marshal | Protect the Bishop seat's city even before Bishop's call; remove protection when Bishop is killed. Preserve protection during its seat's other character turn. |
| Queen + King / Patrician / Emperor | Determine adjacency from the rank-4 character holder, including wraparound, not the current crown owner or Emperor's appointed recipient. A shared seat is not adjacent to itself. |
| Emperor + another character at its seat | Crown ownership belongs to a seat. Exclude Emperor's seat and the current crown holder from recipients; transfers update resources available to later roles without transferring characters. |
| Tax Collector + its seat's other character | Exempt only Tax Collector's own construction turn. Tax that seat's other role normally, and allow collection only once on Tax Collector's turn. |
| Seer / Magician / Wizard / Spy / Emperor + later roles | Hand swaps, random transfers, inspections, and direct construction change what later roles can use. Preserve private knowledge appropriately; old inspection snapshots must not become live hand access. |

## A character and a district card

| Interaction | Corner cases to review |
| --- | --- |
| Colored-income characters + School of Magic | Count it once for the active income color, including Patrician's noble-card draw. It remains printed purple in hand and for unrelated effects; later builds or seizures do not retroactively repeat automatic income. |
| Spy + School of Magic / Haunted Quarter | Count the inspected cards' printed types, not city-income or endgame wildcard behavior. Preserve the project's two-card reward cap independently of gold stolen. |
| Blackmailer + Gold Mine / Observatory / Library | Include Gold Mine's extra gathering gold in the bribe stash. Finish Observatory/Library gathering before the threat; do not overwrite pending keep cards. |
| Blackmailer + active districts | Smithy, Laboratory, Museum, and Armory cannot bypass an unresolved threat. Resume their availability after the correct response actor finishes. |
| Architect / Scholar / Seer + Stables | Stables consumes no ordinary build slot, including after the normal limit is reached. Other constructions still respect the role's limit. |
| Trader + trade districts / Stables | Trade constructions and Stables are independently exempt from the limit. School of Magic is not a printed-green construction. |
| Navigator + Stables / Framework / Necropolis | The no-construction restriction applies even when a build would cost no allowance or no gold. Existing active district abilities remain a separate question from construction. |
| Wizard + Quarry / Monument / payment districts | Direct construction permits duplicates without Quarry and uses no ordinary build slot, but still checks Monument's placement restriction and validates payment or sacrifice. Taking into hand is not construction. |
| Magistrate + Framework / Necropolis | Explicit free sacrifice construction leaves the first paid warrant opportunity available. Distinguish a cost waiver from a paid construction with zero gold paid. |
| Magistrate + Thieves' Den / Factory | Refund only actual gold after discounts and hand-card payment. Discarded payment cards stay discarded; a card-only paid construction still uses the first paid opportunity. |
| Magistrate + Stables | A paid Stables can trigger a warrant despite consuming no ordinary build slot, whether confiscated or retained. |
| Magistrate + Quarry | Builder duplicate permission does not transfer to Magistrate. A duplicate first paid district still spends the opportunity even if Magistrate owns Quarry. |
| Magistrate + Monument / scoring districts | Only the actual recipient gains the district, its completion contribution, and eventual scoring effects. Do not latch completion for the builder while the card is pending. |
| Tax Collector + all construction routes | Tax each finalized ordinary, Wizard, Trader, Stables, Framework, and Necropolis construction from remaining gold. Exactly the build price is enough to construct; no gold means no tax debt. |
| Tax Collector + Marshal / Armory / district actions | Seizure, destruction, sacrifice alone, Museum storage, Smithy payment, and Laboratory income are not constructions. Do not tax generic card movement or every gold expenditure. |
| Warlord / Marshal + Keep / Great Wall | Apply the rank-8 fix to both characters: Keep is protected; Great Wall adds one to targeting another district, not itself. Marshal's cost-three ceiling is checked before the surcharge, so an eligible cost-three district may require four gold. |
| Warlord / Marshal + Factory / Dragon Gate | Use targeting costs rather than the original discounted build payment or bonus victory points. Warlord's destruction discount does not apply to Marshal's payment. |
| Warlord / Marshal + Monument | Count Monument twice for completed-city protection, but once as a physical card. Seizure can complete the receiving city; later ranks must still act. |
| Marshal + Quarry | Reject acquisition of a district identity already in Marshal's city even with Quarry. Seizure is not construction and does not consume build allowance, trigger warrants, or refresh placement metadata. |
| Marshal + active districts | Newly acquired eligible districts can affect later actions, but do not replay automatic character income. Review per-turn use flags when an active district changes ownership. |
| Any character + Museum | Store at most once per physical Museum per character turn. A seat's second character gets a new turn; leaving and re-entering during one turn must not refresh the same Museum. |
| Any character + Park / Poor House | Resolve only at the actual character-turn end, after payments, refunds, taxes, and pending decisions. Trigger separately for a seat's two turns, never for an assassinated turn. |
| Any character + Theater | Exchange drafted roles before the first call, then apply attacks and markers to the resulting role holders. In a two-role seat, exchange only the selected outgoing role. A Theater built during turns waits for the next selection. |
| King / Patrician / Emperor + Statue | Score against final crown ownership after inheritance or advisor decisions. Emperor's tribute and crown transfer can change both resource and crown bonuses before scoring. |
| Hand-changing characters + Map Room / Park / Museum | Recount the actual final hand after swaps, gifts, theft, storage, and direct construction. Inspection copies and stored cards are not hand cards. |
| Gold-changing characters + Imperial Treasury / Poor House | Score actual remaining gold and check the stash at turn end. Include tribute, theft, bribes, tax, seizure payment, and confiscation refunds; exclude the shared tax pool. |

## Two district cards

| Interaction | Corner cases to review |
| --- | --- |
| Observatory + Library | Gathering draws up to three and keeps all available cards. Neither district modifies unrelated character or district bonus draws. |
| Factory + Thieves' Den | Discount first, then apply the chosen payment cards. Reject overpayment, duplicate UIDs, or using the constructed card itself; retain an explicit gold-only option. |
| Framework + Necropolis / Thieves' Den | Choose one payment route. Do not combine a sacrifice with hand-card payment or sacrifice the same card twice; validate before committing either card movement. |
| Framework / Necropolis + Factory / Quarry | Compute discounts and ordinary duplicate permission from the city remaining after sacrifice. Sacrificing Quarry cannot justify a duplicate replacement. |
| Framework / Necropolis + Monument | Check Monument's five-district placement restriction before sacrifice. Check completion after the replacement transaction, without inventing a second physical Monument. |
| Framework / Necropolis + Museum | Sacrificing Museum returns it and all stored cards to the deck in the documented order, clears storage knowledge, and removes its scoring bonus. |
| Armory + Keep / Great Wall | Rank-8 protections do not block this district ability or add payment. Permit another eligible owned district as target, but reject targeting the same physical Armory. |
| Armory + Monument / completed cities | Apply the project's completed-city prohibition to both Armory's source city and the target city, using Monument's weighted completion count. |
| Armory + Museum | Return every stored physical card when Museum is destroyed. Do not leak attachment identities through public destruction events. |
| Great Wall + Keep | Keep remains untargetable by rank 8 rather than merely more expensive. Removing Great Wall changes later targeting prices immediately. |
| Museum + Park / Map Room | Storing the last hand card can enable Park, reduces Map Room's hand count, and adds one Museum point. Park's replacement cards remain in hand. |
| Smithy / Laboratory + Park / Poor House | Spending the last gold at Smithy or discarding the last card at Laboratory changes end-turn eligibility. Resolve after all actions, not immediately on reaching zero. |
| Gold Mine + Poor House / Imperial Treasury | Gold Mine affects only the gold resource choice; it does not multiply Poor House, Laboratory, character income, or player transfers. Recount final gold for Treasury. |
| Quarry + duplicate active districts | Review per-card versus per-name usage limits when duplicate districts are legally built, especially Museum, Smithy, and Laboratory. Mark any unclear rule as a ruling to settle. |
| Monument + Capitol / Basilica / Wishing Well | Double weight is for completion only. Do not double type counts, odd-cost counts, unique-district counts, printed-cost score, or card-conservation totals. |
| School of Magic + Haunted Quarter | Review wildcard allocation for the all-five-types bonus and Haunted Quarter's final-round restriction. A single wildcard must not fill multiple missing types simultaneously. |
| School of Magic / Haunted Quarter + Capitol / Wishing Well / Ivory Tower | Separate scoring wildcard choices from printed-purple counts and same-type bonuses. Flag the existing edition interpretation for review rather than assuming every wildcard effect is universal. |
| Factory / Thieves' Den / sacrifice payments + Basilica / Dragon Gate | Final printed-cost and odd-cost scoring must not use the reduced gold paid, discarded cards, or a zero-cost sacrifice route. |
| Wishing Well + Ivory Tower | Include Wishing Well's other unique districts correctly; another purple district can remove Ivory Tower's lone-unique bonus. Recalculate after acquisition or loss. |
| Theater + Statue | Theater changes who holds a drafted role, not the crown immediately. Subsequent rank-4 effects decide the final Statue bonus. |
| Secret Vault + Map Room / Museum / payment effects | Resolve the existing edition mismatch explicitly: current code permits city scoring, while the revised-edition correction calls for an unbuildable hand-scoring card. Review storage, discard, tribute, and final-hand bonuses against the chosen rule. |

## Shared review checks

- Exercise the combinations before and after gathering, with zero gold, an empty
  hand, a short or empty deck, and a city one district short of completion.
- Include three-way chains: Blackmailer -> Magistrate -> tax; Factory ->
  Thieves' Den -> confiscation refund; sacrifice -> replacement -> completion;
  Museum storage -> empty hand -> Park.
- During every pending keep, Wizard, Seer, threat, warrant, Theater, or advisor
  decision, route the correct actor and reject unrelated actions without mutation.
  Save/reconnect and AI takeover must resume once without replaying effects.
- Preserve physical card UIDs across hands, cities, deck, Museum storage, and
  pending construction. Keep private snapshots, attachments, warrant signatures,
  threat faces, and exchanged roles out of unauthorized views and public events.
- Review AI legality and valuation using only `viewFor()` information, including
  costs after earlier actions, final-round completion, and changes to scoring
  bonuses. UI descriptions and every translation must agree with the chosen rule.
- Use the [rank-8 fix](../rank8-fix/goal.md) over older Warlord-only descriptions.
  Check [district implementation notes](../new-cards/implementation.md) for project
  rulings and edition gaps. Older feature documents sometimes call now-present
  cards future work; reconcile them against the current roster before review.
- Witch, Diplomat, Artist, and Alchemist are absent from the current roster;
  University and Graveyard are excluded from the current catalogue. Their
  possession, exchange, beautification, refund, and recovery interactions belong
  to a separate future/legacy review, not a requirement to add them here.

## Code review and changes (2026-11-11)

Reviewed the current engine, permitted views, AI policies, simulation sampling,
and related controls against the checklist. Source review found these gaps:

- **Wizard + ordinary duplicate construction:** duplicate permission was applied
  only to the immediate stolen-card build. It now applies to all construction
  during Wizard's character turn, including after sacrificing Quarry. Ordinary
  building limits still apply; Magistrate and Marshal still reject duplicate
  acquisitions. AI hand valuation and UI duplicate warnings use the active role,
  and all character-description translations explain the permission. See the
  [publisher's rulebook, printed page 11](https://cdn.svc.asmodee.net/production-zman/uploads/2024/10/zc01-rulebook_web.pdf#page=11).
- **Private pending choices + simulations:** opponent views retained only the
  pending choice type, losing the count of drawn cards and continuation context.
  Views now retain public counts/decision metadata without card identities.
  Sampling allocates pending keep cards separately and reconstructs Wizard's
  inspection from the sampled target hand; Seer's return targets are retained.
- **Inspection snapshots + conservation:** sampling no longer reintroduces a
  remembered hand card whose physical location is already known elsewhere. It
  also reserves known attachments belonging to a pending district.
- **Wizard + scoring/payment effects:** direct-build evaluation now includes
  actual score changes, discarded payment cards, sacrifice losses, tax, warrant
  risk, and completion while behind. Ordinary build projections stamp the
  current round, avoiding premature Haunted Quarter wildcard valuation.
- **Confiscation + Imperial Treasury:** AI evaluates the recipient's stash after
  its construction tax, including refunds when builder and recipient share a
  seat.
- **Warlord / Armory + scoring districts:** destruction evaluation uses actual
  score changes, including Museum contents, lost color bonuses, and bonuses an
  opponent gains by losing a district. Armory also values its own sacrifice.

The remaining engine paths already explicitly separate paid/free construction,
build allowances, warrant response/refund, final-owner tax, seizure, sacrifices,
Monument completion weight, turn-end effects, role-based attacks, deferred
blackmail income, and killed rank-4 inheritance/advisor decisions. This is a
source-review finding, not proof that every combination is correct at runtime.

Preserved the documented project choices: Spy's two-card cap, automatic character
income, Museum knowledge policy, completion latch, Armory completed-city ruling,
and existing scoring edition differences. Secret Vault's city scoring, existing
printed costs, School of Magic's scoring wildcard, and Haunted Quarter's scoring
interpretation remain edition-alignment work rather than silently changing the
project's established rules. Duplicate unique active-district instances and
absent/legacy cards remain outside the current physical catalogue.

The Spy, Magistrate, and Tax Collector/Marshal suites completed before these
fixes. On request, the remaining engine run was stopped; no tests or gameplay
simulations were run after the changes. All changes above are untested.
