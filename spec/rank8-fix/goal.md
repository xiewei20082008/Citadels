# Goal

There are some cards currently displaying working against warlord, but actually it should work against all rank8 characters. Fix it.
- change both card effect and card discription

# List of cards that need to be changed

- **Bishop (`bishop`)** — Update the description to say its city is protected from all rank-8 character abilities unless the Bishop is assassinated. The engine already applies this protection to both Warlord and Marshal; preserve that behavior.
- **Keep (`keep`)** — Update the effect and description so all rank-8 characters are prevented from targeting it, including Marshal's seizure, rather than only Warlord's destruction.
- **Great Wall (`great_wall`)** — Update the effect and description so the extra 1-gold cost for targeting its owner's other districts applies to all rank-8 characters, including Marshal, rather than only Warlord. Marshal's three-gold ceiling still uses the district's building cost; Great Wall increases the payment to its owner, so a three-cost district requires four gold to seize. Great Wall does not increase the cost of targeting itself.

Apply description changes to English, Chinese, and every `js/lang/*.js` translation. The currently implemented rank-8 characters are Warlord and Marshal; this change does not require adding another character. Graveyard is excluded from the revised-edition catalogue and its destruction-only recovery effect is outside this fix.

