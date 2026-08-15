import argparse
from collections import Counter
from pathlib import Path
from PIL import Image, ImageDraw


def point(value: str):
    try:
        x, y = (int(part) for part in value.split(","))
        return x, y
    except Exception as exc:
        raise argparse.ArgumentTypeError("expected X,Y") from exc


def hex_color(value: str):
    value = value.lstrip("#")
    if len(value) != 6:
        raise argparse.ArgumentTypeError("expected a six-digit hex color")
    try:
        return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("invalid hex color") from exc


def darkest_color(body: Image.Image):
    rgb = body.convert("RGB")
    pixels = rgb.get_flattened_data() if hasattr(rgb, "get_flattened_data") else rgb.getdata()
    colors = Counter(pixels)
    candidates = [color for color, count in colors.most_common(16) if count > 4]
    return min(candidates, key=lambda color: 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2])


def make_mouths(out_dir: Path, color):
    for state in ("closed", "small", "large", "wide", "round"):
        image = Image.new("RGBA", (16, 9), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        if state == "closed":
            draw.rectangle((4, 4, 11, 4), fill=color)
        elif state == "small":
            draw.polygon(((5, 3), (10, 3), (11, 4), (10, 6), (5, 6), (4, 5), (4, 4)), fill=color)
        elif state == "large":
            draw.polygon(((5, 2), (10, 2), (11, 3), (11, 6), (10, 7), (5, 7), (4, 6), (4, 3)), fill=color)
        elif state == "wide":
            draw.polygon(((4, 3), (11, 3), (12, 4), (11, 5), (4, 5), (3, 4)), fill=color)
        else:
            draw.rectangle((5, 2, 10, 7), fill=color)
            draw.rectangle((6, 3, 9, 6), fill=(0, 0, 0, 0))
        image.resize((128, 72), Image.Resampling.NEAREST).save(out_dir / f"mouth-{state}.png")


def make_eyes(out_dir: Path, layout: str, face_color, eye_color):
    if layout == "none":
        return
    if layout == "pair":
        size, output_size = (32, 10), (256, 80)
        covers = ((5, 2, 11, 8), (21, 2, 27, 8))
        lines = ((6, 5, 10, 5), (22, 5, 26, 5))
    else:
        size, output_size = (16, 8), (128, 64)
        covers = ((5, 2, 12, 6),)
        lines = ((6, 4, 11, 4),)

    Image.new("RGBA", size, (0, 0, 0, 0)).resize(output_size, Image.Resampling.NEAREST).save(out_dir / "eyes-open.png")
    closed = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(closed)
    for cover in covers:
        draw.rectangle(cover, fill=(*face_color, 255))
    for line in lines:
        draw.rectangle(line, fill=(*eye_color, 255))
    closed.resize(output_size, Image.Resampling.NEAREST).save(out_dir / "eyes-closed.png")


def main():
    parser = argparse.ArgumentParser(description="Create deterministic pixel mouth and blink layers")
    parser.add_argument("--body", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--eyes", choices=("pair", "single", "none"), default="pair")
    parser.add_argument("--face-sample", type=point)
    parser.add_argument("--color", type=hex_color)
    args = parser.parse_args()

    body = Image.open(args.body).convert("RGB")
    if args.eyes != "none" and args.face_sample is None:
        parser.error("--face-sample is required when eyes are enabled")
    if args.face_sample and not (0 <= args.face_sample[0] < body.width and 0 <= args.face_sample[1] < body.height):
        parser.error("face sample is outside the body image")

    color = args.color or darkest_color(body)
    face_color = body.getpixel(args.face_sample) if args.face_sample else (255, 255, 255)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    make_mouths(args.out_dir, (*color, 255))
    make_eyes(args.out_dir, args.eyes, face_color, color)
    print(f"layers={args.out_dir} color={color} face={face_color} eyes={args.eyes}")


if __name__ == "__main__":
    main()
