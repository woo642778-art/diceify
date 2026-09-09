# Diceify dark visual specification

## Product and job

Diceify is a dense Random Dice 2 companion for players who want to inspect verified client data, compare observed co-op decks, and plan a 241-node Dice Tree. The home page must establish trust and identity quickly, then hand off to efficient tools.

## Reference reading

- Brawlify supplies the compact game-tool shell, dark charcoal surfaces, dense rows, muted metadata, low-shadow panels, and artwork-led color.
- Design.com Generic Venture Welcome supplies the home hero's centered composition, broad negative space, top-edge cyan illumination, deep navy depth, rectangular CTA, and restrained headline scale.
- Automated captures were attempted at 1440x900, 1280x800, and 390x844. Design.com was captured after dismissing its save modal. Brawlify's headless session returned a Cloudflare security check, so its rendered page was inspected separately in an interactive Chrome session.

## Design system

| Role | Token | Value |
| --- | --- | --- |
| Base | `--d61-bg-base` | `#101315` |
| Deep hero | `--d61-bg-deep` | `#01113d` |
| Surface | `--d61-bg-surface` | `#171b1e` |
| Raised surface | `--d61-bg-raised` | `#1b2024` |
| Control | `--d61-bg-control` | `#20252a` |
| Primary text | `--d61-text-primary` | `#f5f7f8` |
| Secondary text | `--d61-text-secondary` | `#a8afb5` |
| Muted text | `--d61-text-muted` | `#717a82` |
| Cyan | `--d61-cyan` | `#23bff3` |
| Blue | `--d61-blue` | `#147bda` |
| Positive | `--d61-green` | `#67d447` |
| Gold | `--d61-gold` | `#f5c842` |
| Negative | `--d61-red` | `#dc6672` |

Typography uses Pretendard Variable where available, then SUIT and the native Korean system stack. Display headings use 780 to 850 weight with tight tracking. Body copy remains 400 to 550. Data values use 650 to 750.

Radius is deliberately narrow: 4px for compact controls, 7px for buttons and inputs, 10px for panels. Motion is limited to 150ms hover changes and one slow hero-object breathing motion, disabled under reduced motion.

## Layout

```text
desktop home
+--------------------------------------------------------------+
| diceify       primary destinations       account / language  |
+--------------------------------------------------------------+
|                                                              |
|                    verified-data line                        |
|                  DICEIFY / product title                     |
|                 concise utility promise                      |
|                    open Dice Tree                            |
|                                                              |
|             original branching topology object               |
+--------------------------------------------------------------+
| search and resume state | repeated observed decks            |
+--------------------------------------------------------------+
| real workflow: resources -> target -> route                  |
+--------------------------------------------------------------+
| observed dice rows       | compact tool directory            |
+--------------------------------------------------------------+
```

```text
mobile home
+----------------------------+
| brand           account    |
+----------------------------+
| centered hero copy         |
| primary CTA                |
| cropped topology object    |
+----------------------------+
| search                     |
| resume / workflow          |
| observed deck rows         |
| tools                      |
+----------------------------+
| home | deck | tree | more  |
+----------------------------+
```

## Signature element

The memorable element is an original cyan-edged branching topology formed from layered blue fins. It is not a die, logo, card, or background blob. It visually connects the cinematic first viewport to the actual branching Tree planner.

## Anti-template critique

The earlier light editorial layout resembled a general productivity directory and conflicted with the explicit game-tool brief. The revised direction removes the white canvas, oversized rounded search card, and broad blue accents. Cyan is reserved for selection and edge light, while real dice artwork carries most local color. The hero takes the only atmospheric risk; all working screens remain dense and nearly flat.

## Acceptance checks

- No light application canvas remains in home, deck, dice, ranking, guild, account, simulator, compare, shop, update, or overlay surfaces.
- The home hero is 680 to 760px on desktop and 660 to 760px on mobile, with the topology visible but never covering copy.
- TreeCanvas remains the dominant area with a docked inspector on desktop and a bottom sheet on mobile.
- Buttons, inputs, panels, focus states, bottom navigation, and overlays share the centralized token system.
- Verified and unavailable data states remain explicit. No metrics or account records are invented.
