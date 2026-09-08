# Random Dice 2 client 1.1.0 extraction

This snapshot was produced on 2026-09-08 by the repository's deterministic, read-only IPA extractor. The input archive SHA-256 is `9ba1eb7d25ef915e8d0d935ddd22635fcca1ce127a6b11d6c8e6a6ffcc5a5772`.

The canonical output contains 56 dice, 241 Dice Tree nodes, 111 player passives, and 154 runes. Client 1.1.0 adds Solar Dice, its dedicated Solar Core currency, node `1501`, and rune node `1601`. Tree prerequisite rank requirements come from `NeedNode` and `NeedNodeRank`, with reverse `NextNodes` edges used only to complete the graph.

The extractor maps `RankUpGoodsType=NODE_STONE` to Dice Core and `RankUpGoodsType=CORE_SOLAR` to Solar Core. Unknown nonzero currency kinds fail extraction instead of being silently converted. UI sprites are exported from the same client and recorded in asset manifests.

The semantic diff against the checked-in 1.0.1 snapshot reports 7 dice-stat records, 7 tree-cost records, 9 tree-topology records, 8 rune records, and 15 enemy records changed or added. The new Solar unlock is node `1501` and costs 100,000 Gold plus 2,000 Solar Core; its rune branch begins at node `1601` and consumes Solar Core independently from Dice Core.

Validation requires the extractor unit suite, canonical dataset validation, TypeScript build, application tests, and a production build. The modded application binary is never executed.
