import argparse
from pathlib import Path
from PIL import Image


def main():
    parser = argparse.ArgumentParser(description="Convert artwork into a fixed low-resolution pixel grid")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--grid", type=int, default=64)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--colors", type=int, help="optional limited-palette color count")
    args = parser.parse_args()
    if args.grid < 8 or args.size < args.grid:
        parser.error("grid and size must describe a valid pixel conversion")
    if args.colors is not None and args.colors < 2:
        parser.error("colors must be at least 2 when provided")

    image = Image.open(args.input).convert("RGB")
    image = image.resize((args.grid, args.grid), Image.Resampling.BOX)
    if args.colors is not None:
        image = image.quantize(colors=args.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    image = image.resize((args.size, args.size), Image.Resampling.NEAREST)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, optimize=True)


if __name__ == "__main__":
    main()
