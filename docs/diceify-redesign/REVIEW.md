# Diceify adversarial review

## Claims and data integrity

- Deck recommendations expose exact repeated compositions from the dated public co-op ranking capture. They do not present inferred win rates, use rates, or live status.
- Dice names, descriptions, assets, tree nodes, runes, and costs come from the preserved Random Dice 2 client 1.1.0 extraction.
- Nickname and PID search does not create a player profile. Until an authorized player-data provider is connected, the UI reports that lookup is unavailable.
- Ranking scores appear only for the seven rows visible in the source captures. Missing values remain `점수 미확인`.

## Failure modes checked

1. **Fabricated competitive metrics:** unit and browser tests assert that observed deck frequency is labeled as observation count and that unverified win rates are omitted.
2. **Guild popularity manipulation:** only authenticated save and inquiry signals contribute to the published formula, owners cannot signal their own guild, and repeated saves toggle instead of accumulating unlimited counts.
3. **Guild data lifecycle gaps:** Worker integration tests cover registration, unique-name conflicts, export, signal ownership, and account deletion of owned guilds and signals.
4. **Unsafe contact behavior:** only HTTP and HTTPS links open a new tab. Other contact formats are copied when the Clipboard API is available and otherwise displayed as text.
5. **Theme and mobile regressions:** desktop and mobile screenshots verify the Diceify light visual system, bottom navigation, readable source labels, and removal of the unrelated resource HUD.

## Known deployment boundary

The static GitHub Pages build cannot persist shared guild registrations by itself. The Worker, D1 database, and sign-in configuration must be deployed before the public guild list can accept and share real registrations. Until then, the page deliberately renders an unavailable state with no seeded examples.
