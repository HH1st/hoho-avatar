import argparse
from pathlib import Path
from PIL import Image


def keep_largest_alpha_component(image, threshold=32):
    alpha = image.getchannel("A")
    width, height = alpha.size
    visible = alpha.load()
    seen = set()
    components = []

    for y in range(height):
        for x in range(width):
            if visible[x, y] <= threshold or (x, y) in seen:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            component = []
            while stack:
                px, py = stack.pop()
                component.append((px, py))
                for nx in range(max(0, px - 1), min(width, px + 2)):
                    for ny in range(max(0, py - 1), min(height, py + 2)):
                        if visible[nx, ny] > threshold and (nx, ny) not in seen:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
            components.append(component)

    if components:
        keep = set(max(components, key=len))
        pixels = image.load()
        for y in range(height):
            for x in range(width):
                if (x, y) not in keep:
                    pixels[x, y] = (0, 0, 0, 0)
    return image


def main():
    parser = argparse.ArgumentParser(description="Convert artwork into a fixed low-resolution pixel grid")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--grid", type=int, default=64)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--colors", type=int, help="optional limited-palette color count")
    parser.add_argument("--keep-largest-alpha-component", action="store_true", help="remove detached transparent-background artifacts")
    args = parser.parse_args()
    if args.grid < 8 or args.size < args.grid:
        parser.error("grid and size must describe a valid pixel conversion")
    if args.colors is not None and args.colors < 2:
        parser.error("colors must be at least 2 when provided")

    source = Image.open(args.input)
    has_alpha = "A" in source.getbands()
    image = source.convert("RGBA" if has_alpha else "RGB")
    image = image.resize((args.grid, args.grid), Image.Resampling.BOX)
    if args.keep_largest_alpha_component:
        if not has_alpha:
            parser.error("--keep-largest-alpha-component requires an image with an alpha channel")
        image = keep_largest_alpha_component(image)
    if args.colors is not None:
        if has_alpha:
            alpha = image.getchannel("A")
            rgb = image.convert("RGB").quantize(colors=args.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
            rgb.putalpha(alpha)
            image = rgb
        else:
            image = image.quantize(colors=args.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    image = image.resize((args.size, args.size), Image.Resampling.NEAREST)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, optimize=True)


if __name__ == "__main__":
    main()
