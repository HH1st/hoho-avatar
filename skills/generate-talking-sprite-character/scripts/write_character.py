import argparse
import json
from pathlib import Path


def point(value: str):
    try:
        x, y = (int(part) for part in value.split(","))
        return {"x": x, "y": y}
    except Exception as exc:
        raise argparse.ArgumentTypeError("expected X,Y") from exc


def main():
    parser = argparse.ArgumentParser(description="Write a TalkingSprite V1 character.json")
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--mouth-anchor", type=point, required=True)
    parser.add_argument("--eyes", choices=("pair", "single", "none"), default="pair")
    parser.add_argument("--eyes-anchor", type=point)
    parser.add_argument("--body-bounce", type=int, default=2)
    args = parser.parse_args()
    if args.eyes != "none" and args.eyes_anchor is None:
        parser.error("--eyes-anchor is required when eyes are enabled")
    if not 0 <= args.body_bounce <= 3:
        parser.error("body bounce must be between 0 and 3")

    definition = {
        "version": 1,
        "canvas": {"width": 512, "height": 512},
        "body": {"src": "body.png", "x": 0, "y": 0, "width": 512, "height": 512},
        "mouth": {
            "anchor": args.mouth_anchor,
            "sprites": {state: f"mouth-{state}.png" for state in ("closed", "small", "large", "wide", "round")},
        },
        "animation": {"bodyBouncePx": args.body_bounce},
    }
    if args.eyes != "none":
        definition["eyes"] = {
            "anchor": args.eyes_anchor,
            "sprites": {"open": "eyes-open.png", "closed": "eyes-closed.png"},
        }

    args.out_dir.mkdir(parents=True, exist_ok=True)
    target = args.out_dir / "character.json"
    target.write_text(json.dumps(definition, indent=2) + "\n", encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
