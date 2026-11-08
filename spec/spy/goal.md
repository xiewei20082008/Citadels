# Goal

Add a new character Spy (rank 2, an alternative to the Thief).

Choose another player and name one district type: noble (yellow), religious (blue), trade (green), military (red), or unique (purple). Commit both choices before looking at that player's hand. Count the matching cards, steal one gold per match up to the gold available in their stash, and gain one card per match from the deck.

Project special rule: gain a maximum of 2 cards from the Spy ability per turn. This cap does not limit gold stolen or cards gained from other sources. Card gains depend on matches, not on the gold actually stolen; a target with no gold can still yield cards.

The ability is optional and usable once during the Spy's turn, before or after gathering resources or building, provided no other choice or interrupt is awaiting resolution. It does not replace the mandatory resource action. Only the Spy sees the inspected hand; cards remain in the target's hand.

### Rule sources and implementation boundaries

The publisher's [Citadels rulebook](https://coolplay.rs/wp-content/uploads/2024/03/Citadels_pravila-Eng.pdf), printed pages 4, 8, 10-11, establishes ability timing, one character per rank, Spy's rank and targeting, and card gains when the target cannot pay. The published Spy ability has no two-card cap; retain the project's explicit special rule above.

Follow the existing engine's deck-exhaustion behavior: gain as many cards as remain, without creating cards or blocking gold theft. This is a project consistency choice, not an additional Spy rule quoted from the rulebook.

AI evaluation uses only its permitted view, public deck composition, and observations legitimately available to that player. It must not inspect the actual hidden deck or opponent hands before committing the target and type.

Implementation choices: retain a private snapshot only until the Spy character's turn ends. Inspection resolves atomically without a mandatory acknowledgement; a human can close and reopen the snapshot. The snapshot survives save/reload but never updates to follow later hand changes. It is not a second physical card zone.

The AI models a target's hand as a sample without replacement from the unseen pool (deck composition minus its own visible hand and public cities). Public builds and current hand sizes inform this estimate; no persistent opponent inference is stored. Evaluate caps within the match-count distribution: `ExpectedGold = E[min(matches, targetGold)]` and `ExpectedCards = E[min(matches, 2, deckCount)]`.

Gold and cards have unit weight. `ThreatValue = ExpectedGold * clamp((targetThreat - ownThreat) / 100, 0, 0.35)`, using the existing AI threat measure. `InformationValue = 0.15 * min(targetHandSize, 6) / 6` is a bounded inspection heuristic. Ties use stable seat/color order. New Spy actions include the round to reject stale submissions. See [corner-cases.md](corner-cases.md) for regression scenarios.

### Spy AI Logic

1. Target Selection: Evaluate opponents based on their hand size, gold, and threat level. Prioritize players with more cards and higher strategic value.
2. Color Prediction: Estimate the probability of each district color in the target's hand using known cards, remaining deck composition, and previous actions.
3. Expected Reward: Calculate expected gold stolen and cards drawn for each target-color combination.
4. Card Draw Limit: Apply a maximum of 2 bonus cards per turn.
5. Decision Making: Choose the target and color combination with the highest expected utility.

Utility Formula:

`Utility = ExpectedGold + ExpectedCards + ThreatValue + InformationValue`

Goal: Maximize resource gains while disrupting the strongest opponents.
