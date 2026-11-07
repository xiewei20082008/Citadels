# Goal

Add a new character Magistrate (Rank 1)

During the Magistrate's rank-1 turn, after character selection, assign warrants facedown to three different character tokens: one signed warrant and two unsigned warrants. Assignment may occur at any time during that turn. Everyone can see which characters have warrants; only the Magistrate knows which warrant is signed.

If a character with the signed warrant builds a district, you may reveal the warrant and confiscate the **first district they pay to build**. The player gets back all the gold they spent. Apply the build's normal building-limit accounting, including any explicit exemption.

If the character can build multiple districts, you must decide whether to confiscate their first paid district. Declining it, or being unable to confiscate it because of a duplicate, does not allow confiscation of a later paid district.

Unsigned warrants have no effect.

# how it works

- The district goes directly into the Magistrate's city; it never enters the targeted player's city.
- The original player gets their gold back—the full amount paid to build the district.
- The confiscated district normally consumes a building opportunity; explicit building-limit exemptions still apply.
- The Magistrate gets the district for free, without paying its building cost.

## Rule clarifications and sources

Use the publisher's [2016 rulebook, pages 4, 10, 13-14](https://boardgame.bg/citadels%202016%20rules.pdf) and [2021 rulebook, pages 4, 10, 15](https://coolplay.rs/wp-content/uploads/2024/03/Citadels_pravila-Eng.pdf).

- A district with the same name already in the Magistrate's city cannot be confiscated, even with Quarry.
- Framework builds and Necropolis built without paying its cost cannot be confiscated; they leave the next paid build available.
- Preserve building-limit exceptions: confiscating Stables still permits another build. The Wizard's extra build also retains its building-limit exemption.
- For Thieves' Den, refund gold only, never discarded cards.
- If Tax Collector is in play, the Magistrate owes the confiscated build's tax instead of the target. Free construction does not waive that separate tax.
- The printed warrant rules impose no target exclusions, unlike the Thief and Blackmailer. Do not infer a blanket rank-1 or own-character ban. Targeting an unselected character has no effect. The AI should avoid known unselected characters and targets with no remaining build opportunity.

Implementation ruling for zero-gold payments: ordinary cost-paid construction, including Thieves' Den paid entirely with cards and a cost reduced to zero by discounts, counts as a paid build. A construction that explicitly waives its cost (such as Framework or free Necropolis) does not. Refund only the actual gold paid, which may be zero. This distinguishes payment methods from cost waivers; the rulebooks do not explicitly resolve every such case.

Implementation choices: assignment is optional, matching the general optional-ability rule. Every marked character's first paid build pauses for a Magistrate response, including decoys and duplicate blocks, so the existence of that response does not disclose the signed marker. The response uses a construction ID and round to reject stale submissions. Built statistics count the district's actual recipient; the original builder's turn retains the building-limit consumption.

# AI logic

## 1. Warrant Assignment

The AI selects three different characters: one receives a **Signed Warrant**, and the other two receive **Unsigned Warrants**.

**Signed Warrant — Target Selection**

The AI evaluates each eligible character based on three factors:

1. **Selection Probability:** How likely is an opponent to have chosen this character? Drafting has already finished when warrants are assigned.
2. **Building Probability:** How likely is that character to build a district this round?
3. **Expected District Value:** How valuable is the first district that character is likely to build by paying gold?

The AI estimates these factors using publicly available information, including opponents' gold, hand sizes, existing districts, and proximity to completing their cities.

Each character receives a score:

`Target Score = Selection Probability × Building Probability × Expected District Value`

Once per assignment, multiply each character's target score by an independently sampled uniform factor from 0.88 to 1.12 (±12%). Rank characters by these adjusted scores. Assign the Signed Warrant to the highest-ranked character. Use the game's seeded random generator where available.

**Unsigned Warrants — Decoy Selection**

The AI assigns the two Unsigned Warrants to the next two characters in the same adjusted ranking.

These warrants act as decoys, potentially discouraging opponents from building valuable districts.

## 2. Confiscation Decision

When the character holding the Signed Warrant builds a district, the AI checks:

1. Is this the character targeted by the Signed Warrant?
2. Is this the character's first district built by paying gold this turn?
3. Is the Magistrate's city free of any district with the same name?
4. Do the game rules allow this district to be confiscated?

If all conditions are satisfied, the AI evaluates whether confiscating the district provides a positive strategic benefit.

**AI Behavior:** Confiscate any legally eligible district unless doing so would clearly disadvantage the Magistrate.

When a district is confiscated:

- The district is placed directly into the Magistrate's city.
- The original player receives a refund of the gold spent.
- The original player's building opportunity is still consumed, except where the build has an explicit building-limit exemption.
- The Magistrate pays no building cost; a separate Tax Collector tax may still apply.

The AI cannot skip the first paid district and confiscate a later one.

## 3. AI Behavior Principles

- **No Cheating:** The AI uses only information it is allowed to know.
- **Strategic Targeting:** Prioritize characters likely to build valuable districts.
- **Controlled Randomness:** Introduce slight variation to avoid predictable behavior.
- **Simple Confiscation:** Prefer confiscation whenever it is legal and beneficial.
- **Rule Compliance:** All actions must pass the game's rules engine.

## 4. Overall Decision Flow

**Warrant Assignment**

Evaluate eligible characters → Calculate target scores → Apply slight randomness → Assign Signed Warrant to the highest-scoring character → Assign Unsigned Warrants to the next two.

**Confiscation**

Target character builds a district → Verify first paid construction → Check confiscation eligibility → Evaluate strategic value → Confiscate if beneficial.

**Design Goal:** Create a moderately intelligent Magistrate AI that makes reasonable strategic decisions, introduces uncertainty, and remains competitive without requiring complex opponent modeling or access to hidden information.

## 5. Warrant Assignment Example

| Character | Selection Probability | Building Probability | Expected Value | Score |
| --------- | --------------------- | -------------------- | -------------- | ----- |
| Merchant  | 80%                   | 90%                  | 4              | 2.88  |
| Scholar   | 65%                   | 85%                  | 4              | 2.21  |
| King      | 70%                   | 70%                  | 3              | 1.47  |
| Bishop    | 50%                   | 60%                  | 3              | 0.90  |

Illustrative base scores before the ±12% adjustment, not actual game statistics. This example assumes the adjustment preserves the ranking.

The AI assigns:

- Signed Warrant: Merchant
- Unsigned Warrant: Scholar
- Unsigned Warrant: King


Key principle: The AI should target the character most likely to produce a valuable confiscation, not simply the strongest character.

