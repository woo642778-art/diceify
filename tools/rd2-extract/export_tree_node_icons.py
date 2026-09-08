#!/usr/bin/env python3
"""Export verified Dice Tree node and currency artwork from a client IPA."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import UnityPy
from PIL import Image

from rd2_extract.unity_assets import find_text_asset, parse_table_text, read_member


RUNE_ALIASES = {
    "Electric": "Electricity",
    "Trap": "Thorn",
    "Stone": "Rock",
    "BrokenGrowth": "Grow",
    "Element": "Atom",
    "Executioner": "Execution",
    "Alignment": "Align",
    "Shuriken": "Judgement",
    "Solar": "Sun",
    "SawBlade": "Saw",
}

RUNE_FALLBACK_SPRITES = {
    "Pillar": "pillar_icon",
    "Punch": "punch_icon",
}

FAMILY_SPRITE = {
    "Nature": "Nature",
    "Engineering": "Engineering",
    "Magic": "Magic",
    "Guardian": "Guardian",
    "Invader": "Invasion",
}

PERK_SPRITES = {
    "Trash": "Perk_Trash_Profile",
    "Reroll": "Perk_Change_Profile",
    "Tsunami": "Perk_Tsunami_Profile",
    "Cannon": "Perk_Cannon_Profile",
    "Lava": "Perk_Lava_Profile",
}

CURRENCY_SPRITES = {
    "gold": "item_gold",
    "stone": "node_goods_mini",
    "solar-core": "item_stone_solar",
}


def _square(image: Image.Image, size: int) -> Image.Image:
    image = image.convert("RGBA")
    bounds = image.getbbox()
    if bounds:
        image = image.crop(bounds)
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((size - image.width) // 2, (size - image.height) // 2))
    return canvas


def _passive_sprite(row: dict[str, str], family: str, is_big: bool) -> str:
    passive_id = row["StringId"]
    if "Trash" in passive_id:
        return "PassiveBigIcon_Trashcan" if is_big else "Passive_Nature_Trashcan"
    if "Reroll" in passive_id:
        return "PassiveBigIcon_Reroll" if is_big else "Passive_Engineering_Reroll"
    if "Tsunami" in passive_id:
        return "PassiveBigIcon_Tsunami" if is_big else "Passive_Magic_Tsunami"

    if "StartSp" in passive_id:
        stat = "Spup" if is_big else "SPUp"
    elif "StartHp" in passive_id:
        stat = "HPup" if is_big else "HPUp"
    elif "AtkSpeed" in passive_id:
        stat = "AttackSpeed"
    elif "CritDmg" in passive_id:
        stat = "CriticalDMG"
    elif "CritPer" in passive_id:
        stat = "CriticalRate"
    elif "SummonDefender" in passive_id:
        stat = "Surport_M" if is_big else "Special"
    elif "PowerUpChain" in passive_id:
        stat = "Surport_G" if is_big else "Special"
    elif "UpgradeSPDiscount" in passive_id:
        stat = "Surport_E" if is_big else "Special"
    elif "SpawnLevel2" in passive_id:
        stat = "Surport_I" if is_big else "Special"
    elif "MergeLevelUp" in passive_id:
        stat = "Surport_N" if is_big else "Special"
    elif "AttackUp" in passive_id:
        stat = family if is_big and "DiceAttackUpPerV" in passive_id else "BulletDMG"
    else:
        stat = family if is_big else "Special"

    if is_big:
        return f"PassiveBigIcon_{stat}"
    return f"Passive_{family}_{stat}"


def export_tree_node_icons(ipa: Path, asset_root: Path, output_dir: Path, size: int) -> None:
    resources = read_member(ipa, "/Data/resources.assets")
    tables = {
        name: parse_table_text(find_text_asset(resources, name))
        for name in ("DiceTreeNodeTable", "PlayerPassiveTable", "RuneTable", "PerkActionTable")
    }
    passives = tables["PlayerPassiveTable"]
    runes = {row["Id"]: row for row in tables["RuneTable"]}
    perks = tables["PerkActionTable"]

    rune_index: dict[str, int] = {}
    rune_sprite_by_id: dict[str, str] = {}
    for row in tables["RuneTable"]:
        target = row.get("DefenderType") or ""
        index = rune_index.get(target, 0)
        rune_index[target] = index + 1
        stem = RUNE_ALIASES.get(target, target)
        rune_sprite_by_id[row["Id"]] = RUNE_FALLBACK_SPRITES.get(
            target,
            f"Runenode_{stem}_{index}",
        )

    node_sprites: dict[str, str] = {}
    for node in tables["DiceTreeNodeTable"]:
        node_type = node["NodeType"]
        kind_id = int(node["KindId"])
        family = FAMILY_SPRITE.get({"1": "Nature", "2": "Engineering", "3": "Magic", "4": "Guardian", "5": "Invader"}.get(node["Id"][0], ""), "Nature")
        if node_type == "DICE_RUNE":
            sprite = rune_sprite_by_id.get(str(kind_id))
        elif node_type == "PLAYER_PASSIVE" and 1 <= kind_id <= len(passives):
            sprite = _passive_sprite(passives[kind_id - 1], family, node.get("IsBig") == "True")
        elif node_type == "PERK" and 1 <= kind_id <= len(perks):
            sprite = PERK_SPRITES.get(perks[kind_id - 1]["PerkActionType"])
        else:
            sprite = None
        if sprite:
            node_sprites[node["Id"]] = sprite

    wanted = set(node_sprites.values()) | set(CURRENCY_SPRITES.values())
    environment = UnityPy.load(str(asset_root))
    images: dict[str, Image.Image] = {}
    for obj in environment.objects:
        if obj.type.name != "Sprite":
            continue
        sprite = obj.read()
        if sprite.m_Name in wanted and sprite.m_Name not in images:
            images[sprite.m_Name] = sprite.image

    missing = sorted(wanted - images.keys())
    if missing:
        raise RuntimeError(f"Missing audited tree sprites: {', '.join(missing)}")

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, object] = {"nodes": {}, "currencies": {}}
    for node_id, sprite_name in sorted(node_sprites.items(), key=lambda item: int(item[0])):
        file_name = f"node-{node_id}.webp"
        _square(images[sprite_name], size).save(output_dir / file_name, "WEBP", lossless=True, method=6)
        manifest["nodes"][node_id] = {"file": file_name, "sourceSprite": sprite_name}
    for currency_id, sprite_name in CURRENCY_SPRITES.items():
        file_name = f"currency-{currency_id}.webp"
        _square(images[sprite_name], size).save(output_dir / file_name, "WEBP", lossless=True, method=6)
        manifest["currencies"][currency_id] = {"file": file_name, "sourceSprite": sprite_name}

    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Exported {len(node_sprites)} node icons and {len(CURRENCY_SPRITES)} currencies")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export verified Dice Tree node artwork")
    parser.add_argument("--ipa", type=Path, required=True)
    parser.add_argument("asset_root", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--size", type=int, default=128)
    args = parser.parse_args()
    if args.size < 64 or args.size > 512:
        parser.error("--size must be between 64 and 512")
    export_tree_node_icons(args.ipa, args.asset_root, args.output_dir, args.size)


if __name__ == "__main__":
    main()
