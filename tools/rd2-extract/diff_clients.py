#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable
import argparse
import json


DiffRecord = dict[str, Any]
ClientDiff = dict[str, list[DiffRecord]]


def _json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _chunked(directory: Path, stem: str) -> list[Any]:
    output: list[Any] = []
    for path in sorted(directory.glob(f"{stem}.*.json")):
        value = _json(path)
        if not isinstance(value, list):
            raise ValueError(f"Expected list in {path}")
        output.extend(value)
    return output


def _chunked_mapping(directory: Path, stem: str) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for path in sorted(directory.glob(f"{stem}.*.json")):
        value = _json(path)
        if not isinstance(value, dict):
            raise ValueError(f"Expected object in {path}")
        output.update(value)
    return output


def _expand_dice(row: list[Any]) -> dict[str, Any]:
    (
        dice_id,
        numeric_id,
        family,
        name_key,
        description_key,
        attack,
        attack_interval,
        attack_range,
        boss_multiplier,
        level_attack,
        level_range,
        level_cool_time,
        battle_attack,
        battle_range,
        battle_interval,
        battle_boss_multiplier,
        mechanic_rule_id,
        projectile_ability_id,
        defender_skill_kind,
        targeting_type,
        attack_type,
        cool_time,
    ) = row
    return {
        "id": dice_id,
        "numericId": numeric_id,
        "family": family,
        "nameKey": name_key,
        "descriptionKey": description_key,
        "baseStats": {
            "attack": attack,
            "attackInterval": attack_interval,
            "range": attack_range,
            "bossMultiplier": boss_multiplier,
            "projectileAbilityId": projectile_ability_id,
            "defenderSkillKind": defender_skill_kind,
            "targetingType": targeting_type,
            "attackType": attack_type,
            "coolTime": cool_time,
        },
        "levelGrowth": {
            "attack": level_attack,
            "range": level_range,
            "coolTime": level_cool_time,
        },
        "battleUpgradeGrowth": {
            "attack": battle_attack,
            "range": battle_range,
            "attackInterval": battle_interval,
            "bossMultiplier": battle_boss_multiplier,
        },
        "mechanicRuleId": mechanic_rule_id,
    }


def _expand_tree(row: list[Any]) -> dict[str, Any]:
    (
        node_id,
        family,
        kind,
        x,
        y,
        prerequisites,
        target_id,
        max_rank,
        costs,
        linked_ref,
        name_key,
        description_key,
    ) = row
    prerequisite_rows = [
        {"nodeId": entry[0], "minRank": entry[1]} if isinstance(entry, list) else {"nodeId": entry, "minRank": 1}
        for entry in prerequisites
    ]
    return {
        "id": node_id,
        "family": family,
        "kind": kind,
        "position": {"x": x, "y": y},
        "prerequisites": prerequisite_rows,
        "targetId": target_id,
        "maxRank": max_rank,
        "costsByRank": [
            {"gold": cost[0], "stone": cost[1], "solarCore": cost[2] if len(cost) > 2 else 0}
            for cost in costs
        ],
        "passiveOrRuneRef": linked_ref,
        "nameKey": name_key,
        "descriptionKey": description_key,
    }


def _expand_passive(row: list[Any]) -> dict[str, Any]:
    (
        passive_id,
        numeric_id,
        scope,
        max_rank,
        base_value,
        value_per_rank,
        value_type,
        name_key,
        description_key,
    ) = row
    return {
        "id": passive_id,
        "numericId": numeric_id,
        "scope": scope,
        "maxRank": max_rank,
        "baseValue": base_value,
        "valuePerRank": value_per_rank,
        "valueType": value_type,
        "nameKey": name_key,
        "descriptionKey": description_key,
    }


def _expand_rune(row: list[Any]) -> dict[str, Any]:
    rune_id, kind, grade, max_rank, target_dice_id, values, name_key, description_key = row
    return {
        "id": rune_id,
        "kind": kind,
        "grade": grade,
        "maxRank": max_rank,
        "targetDiceId": target_dice_id,
        "values": values,
        "nameKey": name_key,
        "descriptionKey": description_key,
    }


def load_canonical_directory(directory: Path) -> dict[str, Any]:
    """Load the checked-in compact transport into a semantic diff document."""
    if not directory.is_dir():
        raise ValueError(f"Canonical data directory does not exist: {directory}")

    dice_path = directory / "dice.compact.json"
    mechanics_path = directory / "mechanic-evidence.json"
    enemies_path = directory / "enemies.json"
    if not dice_path.exists() or not mechanics_path.exists() or not enemies_path.exists():
        raise ValueError(f"Canonical data directory is incomplete: {directory}")

    localization_compact = _chunked_mapping(directory, "localization.compact")
    return {
        "manifest": _json(directory / "manifest.json"),
        "dice": [_expand_dice(row) for row in _json(dice_path)],
        "tree": [_expand_tree(row) for row in _chunked(directory, "tree.compact")],
        "passives": [_expand_passive(row) for row in _chunked(directory, "passives.compact")],
        "runes": [_expand_rune(row) for row in _chunked(directory, "runes.compact")],
        "enemies": _json(enemies_path),
        "localization": localization_compact,
        "mechanicEvidence": _json(mechanics_path),
    }


def _index(items: Iterable[dict[str, Any]], key: str = "id") -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for item in items:
        value = item.get(key)
        if value is None:
            raise ValueError(f"Diff item is missing {key!r}: {item}")
        string_key = str(value)
        if string_key in output:
            raise ValueError(f"Duplicate diff key {string_key!r}")
        output[string_key] = item
    return output


def _canonical_prerequisites(value: Any) -> Any:
    if not isinstance(value, list):
        return value
    if all(isinstance(entry, dict) for entry in value):
        return sorted(
            value,
            key=lambda entry: (
                str(entry.get("nodeId", "")),
                int(entry.get("minRank", 0)),
                json.dumps(entry, ensure_ascii=False, sort_keys=True),
            ),
        )
    return sorted(value, key=lambda entry: json.dumps(entry, ensure_ascii=False, sort_keys=True))


def _canonical_tree(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for item in items:
        normalized = dict(item)
        if "prerequisites" in normalized:
            normalized["prerequisites"] = _canonical_prerequisites(normalized["prerequisites"])
        output.append(normalized)
    return output


def _record_changes(
    old_items: Iterable[dict[str, Any]],
    new_items: Iterable[dict[str, Any]],
    *,
    output_id_key: str,
    fields: tuple[str, ...] | None = None,
    index_key: str = "id",
) -> list[DiffRecord]:
    old_index = _index(old_items, index_key)
    new_index = _index(new_items, index_key)
    changes: list[DiffRecord] = []
    for item_id in sorted(set(old_index) | set(new_index)):
        old = old_index.get(item_id)
        new = new_index.get(item_id)
        if old is None:
            changes.append({output_id_key: item_id, "change": "added", "old": None, "new": new})
            continue
        if new is None:
            changes.append({output_id_key: item_id, "change": "removed", "old": old, "new": None})
            continue
        old_view = {field: old.get(field) for field in fields} if fields else old
        new_view = {field: new.get(field) for field in fields} if fields else new
        if old_view != new_view:
            changes.append({output_id_key: item_id, "change": "changed", "old": old_view, "new": new_view})
    return changes


def _localization_changes(old: dict[str, Any], new: dict[str, Any]) -> list[DiffRecord]:
    changes: list[DiffRecord] = []
    for key in sorted(set(old) | set(new)):
        if old.get(key) != new.get(key):
            changes.append({"key": key, "change": "changed", "old": old.get(key), "new": new.get(key)})
    return changes


def diff_documents(old: dict[str, Any], new: dict[str, Any]) -> ClientDiff:
    """Return semantic changes; record and prerequisite ordering never create a diff."""
    tree_old = _canonical_tree(old.get("tree", []))
    tree_new = _canonical_tree(new.get("tree", []))
    return {
        "diceStats": _record_changes(
            old.get("dice", []),
            new.get("dice", []),
            output_id_key="diceId",
            fields=("family", "baseStats", "levelGrowth", "battleUpgradeGrowth", "mechanicRuleId"),
        ),
        "treeCosts": _record_changes(
            tree_old,
            tree_new,
            output_id_key="nodeId",
            fields=("maxRank", "costsByRank"),
        ),
        "treeTopology": _record_changes(
            tree_old,
            tree_new,
            output_id_key="nodeId",
            fields=("family", "kind", "position", "prerequisites", "targetId", "passiveOrRuneRef"),
        ),
        "passives": _record_changes(old.get("passives", []), new.get("passives", []), output_id_key="passiveId"),
        "runes": _record_changes(old.get("runes", []), new.get("runes", []), output_id_key="runeId"),
        "enemies": _record_changes(old.get("enemies", []), new.get("enemies", []), output_id_key="enemyId"),
        "localization": _localization_changes(old.get("localization", {}), new.get("localization", {})),
        "mechanicEvidence": _record_changes(
            old.get("mechanicEvidence", []),
            new.get("mechanicEvidence", []),
            output_id_key="key",
            index_key="key",
        ),
    }


def diff_canonical(old_dir: Path, new_dir: Path) -> ClientDiff:
    return diff_documents(load_canonical_directory(old_dir), load_canonical_directory(new_dir))


def main() -> int:
    parser = argparse.ArgumentParser(description="Semantic diff for extracted Random Dice 2 client data")
    parser.add_argument("old", type=Path)
    parser.add_argument("new", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    result = diff_canonical(args.old, args.new)
    text = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.out:
        args.out.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
