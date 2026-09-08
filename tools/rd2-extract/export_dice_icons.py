#!/usr/bin/env python3
"""Export the audited Random Dice 2 dice artwork from serialized Unity assets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import UnityPy
from PIL import Image


ICON_SPRITES = {
    "fire": "Dice_fire3",
    "ice": "Dice_ICE3",
    "electric": "Dice_Electric3",
    "wind": "Dice_Wind3",
    "iron": "Dice_iron_3",
    "light": "Dice_Light3",
    "poison": "Dice_Poison3",
    "lock": "Dice_Lock3",
    "mine": "Dice_Mine3",
    "trap": "Dice_Thorn3",
    "decay": "Dice_Crack3",
    "energy": "Dice_Energy3",
    "joker": "Dice_Joker3",
    "shuriken": "Dice_shuriken3",
    "stone": "Dice_Rock3",
    "switch": "Dice_Switch3",
    "brokengrowth": "Dice_BrokenGrowth3",
    "gear": "Dice_Gear3",
    "element": "Dice_Element3",
    "combo": "Dice_Combo3",
    "adjust": "Dice_Adjust3",
    "spgemstone": "spgemstone1",
    "altar": "altar1",
    "summon": "Dice_summon3",
    "hammer": "dice_hammer3",
    "neon": "Dice_Neon3",
    "sawblade": "Dice_SawBlade3",
    "potion": "Dice_Potion3",
    "ray": "Dice_Ray3",
    "punch": "Dice_Punch3",
    "germ": "Dice_Germ3",
    "pillar": "Dice_Pillar3",
    "burn": "Burn_Icon",
    "slow": "Dice_Slow3",
    "royal": "Dice_ROYAL3",
    "ax": "Dice_Ax3",
    "flow": "Dice_FLOW3",
    "bubble": "Dice_BUBBLE3",
    "speedgun": "Dice_SPEEDGUN3",
    "bomb": "dice_bomb3",
    "death": "Dice_DEATH1",
    "box": "Box_1_icon",
    "bingo": "Dice_BINGO3",
    "sniper": "Dice_Sniper3",
    "executioner": "Dice_Executioner3",
    "alignment": "Dice_Alignment3",
    "solitude": "Dice_Solitude_3",
    "fear": "Dice_TRANSFER3",
    "tyrant": "Dice_Tyrant3",
    "predator": "Dice_Predator3",
    "mutation": "Dice_Mutation3",
    "resonance": "Dice_Resonance3",
    "blessing": "Dice_Blessing3",
    "doom": "Dice_Doom3",
    "flower": "Dice_Flower3",
    "solar": "Dice_solar3",
}


def square_icon(image: Image.Image, size: int) -> Image.Image:
    image = image.convert("RGBA")
    bounds = image.getbbox()
    if bounds:
        image = image.crop(bounds)
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((size - image.width) // 2, (size - image.height) // 2))
    return canvas


def export_icons(asset_root: Path, output_dir: Path, size: int) -> None:
    environment = UnityPy.load(str(asset_root))
    wanted = set(ICON_SPRITES.values())
    sprites = {}
    for obj in environment.objects:
        if obj.type.name != "Sprite":
            continue
        sprite = obj.read()
        if sprite.m_Name in wanted and sprite.m_Name not in sprites:
            sprites[sprite.m_Name] = sprite.image

    missing = sorted(wanted - sprites.keys())
    if missing:
        raise RuntimeError(f"Missing audited sprites: {', '.join(missing)}")

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for dice_id, sprite_name in ICON_SPRITES.items():
        icon = square_icon(sprites[sprite_name], size)
        output_name = f"{dice_id}.webp"
        icon.save(output_dir / output_name, "WEBP", lossless=True, method=6)
        manifest[dice_id] = {
            "file": output_name,
            "sourceSprite": sprite_name,
            "width": size,
            "height": size,
        }

    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Exported {len(manifest)} verified dice icons to {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export verified dice artwork from Unity asset files")
    parser.add_argument("asset_root", type=Path, help="Directory containing resources.assets and shared assets")
    parser.add_argument("output_dir", type=Path, help="Destination directory for web assets")
    parser.add_argument("--size", type=int, default=256, help="Square output size in pixels")
    args = parser.parse_args()
    if args.size < 64 or args.size > 1024:
        parser.error("--size must be between 64 and 1024")
    export_icons(args.asset_root, args.output_dir, args.size)


if __name__ == "__main__":
    main()
