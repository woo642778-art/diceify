from __future__ import annotations

from typing import Any

from .il2cpp_scan import scan_il2cpp_identifiers
from .unity_assets import find_text_asset, parse_localization_text, parse_table_text

GROUP_TO_FAMILY = {
    "Nature": "nature",
    "Engineering": "engineering",
    "Magic": "magic",
    "Guardian": "order",
    "Invader": "chaos",
}
TREE_PREFIX_GROUP = {
    "1": "Nature",
    "2": "Engineering",
    "3": "Magic",
    "4": "Guardian",
    "5": "Invader",
}


def _number(value: str | None) -> int | float | str | None:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except ValueError:
        return value
    return int(parsed) if parsed.is_integer() else parsed


def _array(value: str | None, converter=int) -> list[Any]:
    if not value:
        return []
    return [converter(part) for part in value.split("|") if part != ""]


def _family(group: str | None) -> str | None:
    return GROUP_TO_FAMILY.get(group or "")


def build_tree_costs(
    rank_up_gold_arr: list[int],
    rank_up_stone_arr: list[int],
    rank_up_solar_core_arr: list[int],
    max_rank: int,
) -> list[dict[str, int]]:
    """Zip client cost arrays without extrapolation or invented resources."""
    if max_rank < 0:
        raise ValueError("max_rank must be non-negative")
    arrays = (rank_up_gold_arr, rank_up_stone_arr, rank_up_solar_core_arr)
    if any(len(values) not in (0, max_rank) for values in arrays):
        raise ValueError(
            "Every Dice Tree cost array must be empty or exactly match the tree rank count"
        )
    gold = rank_up_gold_arr or [0] * max_rank
    stone = rank_up_stone_arr or [0] * max_rank
    solar_core = rank_up_solar_core_arr or [0] * max_rank
    return [
        {"gold": gold[index], "stone": stone[index], "solarCore": solar_core[index]}
        for index in range(max_rank)
    ]


def _table(resources_bytes: bytes, name: str) -> list[dict[str, str]]:
    return parse_table_text(find_text_asset(resources_bytes, name))


def _normalize_dice(defenders: list[dict[str, str]]) -> list[dict[str, object]]:
    output: list[dict[str, object]] = []
    for numeric_id, row in enumerate(defenders, 1):
        base_stats: dict[str, object] = {"extra": {}}
        for source, target in (
            ("Attack", "attack"),
            ("AttackInterval", "attackInterval"),
            ("Range", "range"),
            ("BossAttackPer", "bossMultiplier"),
        ):
            value = _number(row.get(source))
            if value is not None:
                base_stats[target] = value
        extra: dict[str, object] = {}
        for key in (
            "TargetingType",
            "DefenderAttackType",
            "CoolTime",
            "ProjectileAbilityId",
            "DefenderSkillKind",
        ):
            value = _number(row.get(key))
            if value is not None:
                extra[key] = value
        base_stats["extra"] = extra

        level_growth: list[dict[str, object]] = []
        battle_growth: list[dict[str, object]] = []
        for source, stat in (
            ("Attack_LvAdd", "attack"),
            ("Range_LvAdd", "range"),
            ("CoolTime_LvAdd", "coolTime"),
        ):
            value = _number(row.get(source))
            if value is not None:
                level_growth.append(
                    {
                        "stat": stat,
                        "operation": "add",
                        "perLevel": value,
                        "confidence": "partial",
                        "sourceRefs": [f"ipa-table:DefenderTable:{row['DefenderType']}:{source}"],
                    }
                )
        for source, stat in (
            ("Attack_UpAdd", "attack"),
            ("Range_UpAdd", "range"),
            ("AttackInterval_UpAdd", "attackInterval"),
            ("BossAttackPer_UpAdd", "bossMultiplier"),
        ):
            value = _number(row.get(source))
            if value is not None:
                battle_growth.append(
                    {
                        "stat": stat,
                        "operation": "add",
                        "perLevel": value,
                        "confidence": "partial",
                        "sourceRefs": [f"ipa-table:DefenderTable:{row['DefenderType']}:{source}"],
                    }
                )

        item: dict[str, object] = {
            "id": row["DefenderType"].lower(),
            "numericId": numeric_id,
            "nameKey": row.get("Local_Name") or None,
            "descriptionKey": row.get("Local_Desc") or None,
            "baseStats": base_stats,
            "levelGrowth": level_growth,
            "battleUpgradeGrowth": battle_growth,
            "sourceRefs": [f"ipa-table:DefenderTable:{row['DefenderType']}"],
        }
        family = _family(row.get("DefenderGroupType"))
        if family:
            item["family"] = family
        if row.get("DefenderSkillKind"):
            item["mechanicRuleId"] = row["DefenderType"].lower()
        output.append(item)
    return output


def _normalize_passives(rows: list[dict[str, str]]) -> list[dict[str, object]]:
    output: list[dict[str, object]] = []
    for numeric_id, row in enumerate(rows, 1):
        family = _family(row.get("DefenderGroupType"))
        output.append(
            {
                "id": row["StringId"],
                "numericId": numeric_id,
                "scope": family or "global",
                "maxRank": int(row.get("MaxRank") or 0),
                "baseValue": _number(row.get("Value")),
                "valuePerRank": _number(row.get("Value_RankAdd")),
                "valueType": row.get("Local_ValueType") or None,
                "nameKey": row.get("Local_Name") or None,
                "descriptionKey": row.get("Local_Desc") or None,
                "confidence": "verified",
                "sourceRefs": [f"ipa-table:PlayerPassiveTable:{row['StringId']}"],
            }
        )
    return output


def _normalize_runes(rows: list[dict[str, str]]) -> list[dict[str, object]]:
    output: list[dict[str, object]] = []
    for row in rows:
        values = {
            key: _number(row[key])
            for key in (
                "Value1",
                "Value1_RankAdd",
                "Value2",
                "Value2_RankAdd",
                "Duration",
                "Duration_RankAdd",
            )
            if row.get(key) != ""
        }
        output.append(
            {
                "id": row["Id"],
                "kind": row.get("Kind") or "",
                "grade": row.get("Grade") or "",
                "maxRank": int(row.get("MaxRank") or 0),
                "targetDiceId": row["DefenderType"].lower() if row.get("DefenderType") else None,
                "values": values,
                "nameKey": row.get("Local_Name") or None,
                "descriptionKey": row.get("Local_Desc") or None,
                "confidence": "verified",
                "sourceRefs": [f"ipa-table:RuneTable:{row['Id']}"],
            }
        )
    return output


def _normalize_tree(
    rows: list[dict[str, str]],
    defenders: list[dict[str, str]],
    passives: list[dict[str, str]],
    runes: list[dict[str, str]],
    perks: list[dict[str, str]],
) -> list[dict[str, object]]:
    row_by_id = {row["Id"]: row for row in rows}
    reverse_edges: dict[str, list[str]] = {node_id: [] for node_id in row_by_id}
    for row in rows:
        for next_id in _array(row.get("NextNodes"), str):
            if next_id in reverse_edges:
                reverse_edges[next_id].append(row["Id"])
    rune_by_id = {row["Id"]: row for row in runes}

    output: list[dict[str, object]] = []
    for row in rows:
        node_type = row["NodeType"]
        kind_id = int(row["KindId"])
        gold = _array(row.get("RankUpGoldArr"), int)
        goods = _array(row.get("RankUpGoodsArr"), int)
        goods_type = row.get("RankUpGoodsType") or ""
        stone = _array(row.get("RankUpStoneArr"), int)
        solar_core: list[int] = []
        if goods_type == "NODE_STONE":
            stone = goods
        elif goods_type == "CORE_SOLAR":
            solar_core = goods
        elif goods_type and any(goods):
            raise ValueError(f"Unsupported Dice Tree currency {goods_type!r} on node {row['Id']}")
        rank_count = max(len(gold), len(stone), len(solar_core), 1)
        costs = build_tree_costs(gold, stone, solar_core, rank_count)

        target_id: str | None = None
        name_key: str | None = None
        description_key: str | None = None
        linked_ref: str | None = None
        if node_type == "DICE" and 1 <= kind_id <= len(defenders):
            defender = defenders[kind_id - 1]
            target_id = defender["DefenderType"].lower()
            name_key = defender.get("Local_Name") or None
            description_key = defender.get("Local_Desc") or None
            linked_ref = f"dice:{target_id}"
        elif node_type == "DICE_RUNE":
            rune = rune_by_id.get(str(kind_id))
            if rune:
                target_id = rune["DefenderType"].lower() if rune.get("DefenderType") else None
                name_key = rune.get("Local_Name") or None
                description_key = rune.get("Local_Desc") or None
            linked_ref = f"rune:{kind_id}"
        elif node_type == "PLAYER_PASSIVE" and 1 <= kind_id <= len(passives):
            passive = passives[kind_id - 1]
            name_key = passive.get("Local_Name") or None
            description_key = passive.get("Local_Desc") or None
            linked_ref = f"passive:{passive['StringId']}"
        elif node_type == "PERK" and 1 <= kind_id <= len(perks):
            perk = perks[kind_id - 1]
            name_key = perk.get("Local_Name") or None
            description_key = perk.get("Local_Desc") or None
            linked_ref = f"perk:{perk.get('PerkActionType', kind_id)}"

        x_text, y_text = row["Position"].split("|")
        family = _family(TREE_PREFIX_GROUP.get(row["Id"][0])) or "core"
        node_kind = {
            "DICE": "dice",
            "DICE_RUNE": "perk",
            "PLAYER_PASSIVE": "passive",
            "PERK": "milestone",
        }.get(node_type, "connector")
        prerequisite_ranks = {parent: 1 for parent in reverse_edges[row["Id"]]}
        required_nodes = _array(row.get("NeedNode"), str)
        required_ranks = _array(row.get("NeedNodeRank"), int)
        if len(required_nodes) != len(required_ranks):
            raise ValueError(f"NeedNode and NeedNodeRank length mismatch on node {row['Id']}")
        for required_node, required_rank in zip(required_nodes, required_ranks):
            if required_node in row_by_id:
                prerequisite_ranks[required_node] = max(
                    prerequisite_ranks.get(required_node, 0), required_rank
                )

        output.append(
            {
                "id": row["Id"],
                "family": family,
                "kind": node_kind,
                "position": {"x": float(x_text), "y": float(y_text)},
                "prerequisites": [
                    {"nodeId": parent, "minRank": prerequisite_ranks[parent]}
                    for parent in sorted(prerequisite_ranks, key=int)
                ],
                "targetId": target_id,
                "maxRank": rank_count,
                "costsByRank": costs,
                "passiveOrRuneRef": linked_ref,
                "nameKey": name_key,
                "descriptionKey": description_key,
                "sourceRefs": [f"ipa-table:DiceTreeNodeTable:{row['Id']}"],
            }
        )
    return output


def _normalize_enemies(rows: list[dict[str, str]]) -> list[dict[str, object]]:
    output: list[dict[str, object]] = []
    for row in rows:
        kind = "boss" if row["MinionType"] == "Boss" else ("normal" if row["MinionType"] == "Normal" else "elite")
        output.append(
            {
                "id": row["Id"],
                "kind": kind,
                "bossType": row.get("BossType") or None,
                "nameKey": row.get("Local_Name") or None,
                "hpMultiplierPercent": _number(row.get("BossHpPer")),
                "speed": _number(row.get("BaseMoveSpeed")),
                "sp": _number(row.get("SPPer")),
                "trophyLevel": _number(row.get("TrophyLevel")),
                "values": {},
                "confidence": "verified",
                "sourceRefs": [f"ipa-table:MinionTable:{row['Id']}"],
            }
        )
    return output


def normalize_records(records: dict[str, list[dict[str, str]]], provenance: dict[str, str]) -> dict[str, object]:
    defenders = records["DefenderTable"]
    passives = records["PlayerPassiveTable"]
    runes = records["RuneTable"]
    perks = records.get("PerkActionTable", [])
    return {
        "manifest": provenance,
        "dice": _normalize_dice(defenders),
        "tree": _normalize_tree(records["DiceTreeNodeTable"], defenders, passives, runes, perks),
        "passives": _normalize_passives(passives),
        "runes": _normalize_runes(runes),
        "enemies": _normalize_enemies(records["MinionTable"]),
    }


def generate_canonical_data(
    resources_bytes: bytes,
    metadata_bytes: bytes,
    binary_bytes: bytes,
    *,
    source_sha256: str,
    client_version: str = "1.0.1",
    extractor_version: str = "0.1.0",
    extracted_at: str = "2026-08-16T00:00:00Z",
) -> dict[str, object]:
    table_names = (
        "DefenderTable",
        "DiceTreeNodeTable",
        "PlayerPassiveTable",
        "RuneTable",
        "MinionTable",
        "VersusWaveTable",
        "ProjectileAbilityTable",
        "PerkActionTable",
    )
    records = {name: _table(resources_bytes, name) for name in table_names}
    provenance = {
        "schemaVersion": 3,
        "clientVersion": client_version,
        "sourceSha256": source_sha256,
        "extractorVersion": extractor_version,
        "extractedAt": extracted_at,
    }
    normalized = normalize_records(records, provenance)

    localization = parse_localization_text(find_text_asset(resources_bytes, "localization_text"))
    normalized["localization"] = {
        "ko": {key: value["ko"] for key, value in sorted(localization.items())},
        "en": {key: value["en"] for key, value in sorted(localization.items())},
    }

    evidence = scan_il2cpp_identifiers(metadata_bytes, binary_bytes)
    for row in records["ProjectileAbilityTable"]:
        parameters = {
            key: _number(value)
            for key, value in row.items()
            if key not in {
                "StringId",
                "Local_Value",
                "Local_ValueType",
                "Local_Duration",
                "Local_Range",
                "Local_StackMax",
            }
            and value != ""
        }
        evidence.append(
            {
                "key": f"projectile:{row['StringId']}",
                "symbols": [],
                "present": True,
                "confidence": "partial",
                "formula": None,
                "parameters": parameters,
                "sourceRefs": [f"ipa-table:ProjectileAbilityTable:{row['StringId']}"],
            }
        )
    normalized["mechanicEvidence"] = evidence
    normalized["waves"] = records["VersusWaveTable"]
    return normalized
