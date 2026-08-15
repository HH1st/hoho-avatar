import json
import sys
from pathlib import Path
from PIL import Image


MOUTHS = ("closed", "small", "large", "wide", "round")


def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def inspect_image(root, relative, require_alpha=False):
    path = root / relative
    if not path.is_file():
        fail(f"missing image: {relative}")
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        if require_alpha and image.mode not in ("RGBA", "LA", "P"):
            fail(f"layer must support transparency: {relative}")
        return image.size


def main():
    if len(sys.argv) != 2:
        fail("usage: validate_character.py path/to/character.json")
    config = Path(sys.argv[1])
    if not config.is_file():
        fail(f"missing config: {config}")
    try:
        data = json.loads(config.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"invalid JSON: {exc}")

    if data.get("version") != 1:
        fail("version must be 1")
    canvas = data.get("canvas", {})
    if canvas.get("width") != 512 or canvas.get("height") != 512:
        fail("canvas must be 512x512")
    root = config.parent
    body_size = inspect_image(root, data.get("body", {}).get("src", ""))
    if body_size[0] < 64 or body_size[1] < 64:
        fail("body image is unexpectedly small")

    mouth = data.get("mouth", {})
    if set(mouth.get("sprites", {})) != set(MOUTHS):
        fail("mouth sprites must contain exactly closed, small, large, wide, and round")
    for state in MOUTHS:
        inspect_image(root, mouth["sprites"][state], require_alpha=True)

    if "eyes" in data:
        if set(data["eyes"].get("sprites", {})) != {"open", "closed"}:
            fail("eyes sprites must contain open and closed")
        for state in ("open", "closed"):
            inspect_image(root, data["eyes"]["sprites"][state], require_alpha=True)

    print(f"OK: {config} ({body_size[0]}x{body_size[1]})")


if __name__ == "__main__":
    main()
