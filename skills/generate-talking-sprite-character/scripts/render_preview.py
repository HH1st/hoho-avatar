import argparse
import json
from pathlib import Path
from PIL import Image


MOUTHS = ("closed", "small", "large", "wide", "round")
EYES = ("open", "closed")


def render_state(character: Path, mouth: str = "closed", eyes: str = "open"):
    definition = json.loads(character.read_text(encoding="utf-8"))
    root = character.parent
    body_config = definition["body"]
    body = Image.open(root / body_config["src"]).convert("RGBA")
    size = (body_config.get("width", body.width), body_config.get("height", body.height))
    body = body.resize(size, Image.Resampling.NEAREST)
    frame = Image.new("RGBA", (definition["canvas"]["width"], definition["canvas"]["height"]), (0, 0, 0, 0))
    frame.alpha_composite(body, (body_config.get("x", 0), body_config.get("y", 0)))

    for group, state in (("eyes", eyes), ("mouth", mouth)):
        if group not in definition:
            continue
        layer = Image.open(root / definition[group]["sprites"][state]).convert("RGBA")
        anchor = definition[group]["anchor"]
        frame.alpha_composite(layer, (round(anchor["x"] - layer.width / 2), round(anchor["y"] - layer.height / 2)))
    return frame


def main():
    parser = argparse.ArgumentParser(description="Render a character.json state without a browser")
    parser.add_argument("character", type=Path)
    parser.add_argument("--mouth", choices=MOUTHS, default="closed")
    parser.add_argument("--eyes", choices=EYES, default="open")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    frame = render_state(args.character, args.mouth, args.eyes)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    frame.save(args.out)
    print(args.out)


if __name__ == "__main__":
    main()
