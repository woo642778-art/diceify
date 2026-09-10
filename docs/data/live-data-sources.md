# Diceify live data sources

## Update contract

Diceify separates three different kinds of information instead of presenting all of them as live game data.

1. Official release status is fetched from Apple's public iTunes Lookup API for App Store item `6748432502`. The client reads the version, release time, Korean release notes, current-version rating, and rating count. This request contains no Diceify user or account data.
2. Public client-data cross-check status is fetched from `NatsuYukiowob/rd2-wiki`. Diceify reads the latest versioned changelog entry and bounded collection counts for dice, tree nodes, bosses, tactics, and Rift Shop effects. The upstream project is unofficial. Its code and original data structures use the MIT License; game text and images remain the property of 111 Percent Inc.
3. Diceify's calculations continue to use the locally validated canonical dataset. A storefront or community version change does not silently replace calculation values. The UI warns when the official or cross-check version differs from the calculator version.

Account lookup and ranking data are not included in this updater because no verified public or authorized Random Dice 2 provider has been identified. The preserved co-op ranking remains visibly dated and is never labeled live.

## Refresh behavior

- Browsers request Apple and GitHub's raw-data host on page load, every 15 minutes while open, and whenever the page becomes visible again. They do not call GitHub's rate-limited REST API.
- A manual refresh is available in the update center.
- The last verified snapshot in `src/live-data/snapshot.json` is used when an endpoint is unavailable.
- GitHub Actions uses its job token to verify the exact public repository commit, then rebuilds and deploys the fallback snapshot every six hours. If commit verification is rate-limited outside Actions, the script retains the last verified commit identity while refreshing the other sources. Source responses are schema-checked and bounded before use.
- A future official version mismatch creates a visible warning. It does not invent balance changes or claim the old calculator data is current.

## Source endpoints

- Apple iTunes Lookup API: `https://itunes.apple.com/lookup?id=6748432502&country=kr`
- Korean App Store listing: `https://apps.apple.com/kr/app/id6748432502`
- Google Play listing: `https://play.google.com/store/apps/details?id=com.percent.aos.randomdice2`
- Public cross-check repository: `https://github.com/NatsuYukiowob/rd2-wiki`
- Snapshot generator: `scripts/sync-live-data.mjs`
