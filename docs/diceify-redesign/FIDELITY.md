# Diceify visual fidelity ledger

Reference: `design/home-concept.png`, `design/deck-lab-concept.png`, `design/guild-concept.png`

## Verified matches

1. Brand and navigation: lowercase `diceify` wordmark, cobalt die mark, centered information architecture, and restrained utility actions match the selected concept.
2. Hierarchy: the home keeps the large evidence-first headline, single search field, five real dice assets, observed deck strip, popular dice list, and quick tools in the same reading order.
3. Visual language: cool white surfaces, near-black typography, cobalt active states, thin dividers, limited shadow, and native Korean system fonts replace the previous gradient-heavy presentation.
4. Deck Lab: role filters, exact composition rows, observation counts, best rank, and a fixed detail column match the concept while using source-backed data.
5. Responsive behavior: desktop columns collapse into a linear mobile reading order with the primary navigation kept reachable at the bottom.

## Intentional deviations

- The concept's example deck names, dates, and popularity statements were not copied. The implementation displays only the 2026-08-16 captured ranking and client 1.1.0 data.
- Nickname and PID results remain unavailable until an authorized player-data provider exists. The search shows the limitation instead of generating a profile.
- The guild page displays no sample guilds while the shared Worker database is not deployed. Popularity is defined only as authenticated site saves and inquiries.
- The existing manual deck analyzer remains visually distinct because its scores are comparative calculations, not observed ranking facts.
