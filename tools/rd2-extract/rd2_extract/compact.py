from __future__ import annotations

from collections.abc import Mapping, Sequence


def chunk_list(items: Sequence[object], chunk_size: int) -> list[list[object]]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    return [list(items[index : index + chunk_size]) for index in range(0, len(items), chunk_size)]


def chunk_mapping(items: Mapping[str, object], chunk_size: int) -> list[dict[str, object]]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    entries = sorted(items.items())
    return [dict(entries[index : index + chunk_size]) for index in range(0, len(entries), chunk_size)]


def compact_dataset(data: dict[str, object]) -> dict[str, object]:
    dice = []
    for item in data["dice"]:
        level = {rule["stat"]: rule["perLevel"] for rule in item["levelGrowth"]}
        battle = {rule["stat"]: rule["perLevel"] for rule in item["battleUpgradeGrowth"]}
        base = item["baseStats"]
        extra = base.get("extra", {})
        dice.append([
            item["id"], item.get("numericId"), item.get("family"), item.get("nameKey"), item.get("descriptionKey"),
            base.get("attack"), base.get("attackInterval"), base.get("range"), base.get("bossMultiplier"),
            level.get("attack"), level.get("range"), level.get("coolTime"),
            battle.get("attack"), battle.get("range"), battle.get("attackInterval"), battle.get("bossMultiplier"),
            item.get("mechanicRuleId"), extra.get("ProjectileAbilityId"), extra.get("DefenderSkillKind"),
            extra.get("TargetingType"), extra.get("DefenderAttackType"), extra.get("CoolTime"),
        ])

    tree = [[
        node["id"], node["family"], node["kind"], node["position"]["x"], node["position"]["y"],
        [[entry["nodeId"], entry["minRank"]] for entry in node["prerequisites"]], node.get("targetId"), node["maxRank"],
        [[cost["gold"], cost["stone"], cost.get("solarCore", 0)] for cost in node["costsByRank"]], node.get("passiveOrRuneRef"),
        node.get("nameKey"), node.get("descriptionKey"),
    ] for node in data["tree"]]

    passives = [[
        item["id"], item.get("numericId"), item["scope"], item["maxRank"], item.get("baseValue"),
        item.get("valuePerRank"), item.get("valueType"), item.get("nameKey"), item.get("descriptionKey"),
    ] for item in data["passives"]]

    runes = [[
        item["id"], item.get("kind"), item.get("grade"), item.get("maxRank"), item.get("targetDiceId"),
        item.get("values", {}), item.get("nameKey"), item.get("descriptionKey"),
    ] for item in data["runes"]]

    enemies = [[
        item["id"], item["kind"], item.get("bossType"), item.get("nameKey"), item.get("hpMultiplierPercent"),
        item.get("speed"), item.get("sp"), item.get("trophyLevel"),
    ] for item in data["enemies"]]

    referenced_keys = {
        "goods_node_stone", "goods_node_stone_desc", "goods_gold", "goods_gold_desc",
        "goods_core_solar", "goods_core_solar_desc",
    }
    for collection in (data["dice"], data["tree"], data["passives"], data["runes"], data["enemies"]):
        for item in collection:
            for key in ("nameKey", "descriptionKey", "valueType"):
                value = item.get(key)
                if isinstance(value, str) and value:
                    referenced_keys.add(value)
    localization = {
        key: [data["localization"]["ko"].get(key, ""), data["localization"]["en"].get(key, "")]
        for key in sorted(referenced_keys)
        if key in data["localization"]["ko"]
    }

    return {
        "dice": dice,
        "tree": tree,
        "passives": passives,
        "runes": runes,
        "enemies": enemies,
        "localization": localization,
        "mechanics": data["mechanicEvidence"],
    }
