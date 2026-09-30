"""Generates the app icon and the menu bar (template) icons.

    python3 scripts/make-icons.py

Requires Pillow. Outputs:
  build/icon.png                1024x1024 app icon (electron-builder turns it into .icns)
  assets/trayTemplate.png       16x16 monochrome menu bar icon
  assets/trayTemplate@2x.png    32x32 retina variant
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE_ICON = ROOT.parent / "assets" / "icon.png"


def make_app_icon() -> None:
    src = Image.open(SOURCE_ICON).convert("RGBA")
    w, h = src.size

    # The source has a white background around the rounded square: make it transparent
    # by flood filling from the corners.
    mask = Image.new("L", (w + 2, h + 2), 0)
    rgb = src.convert("RGB")
    padded = Image.new("RGB", (w + 2, h + 2), (255, 255, 255))
    padded.paste(rgb, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), (255, 0, 255), thresh=40)
    px = padded.load()
    mpx = mask.load()
    for y in range(h + 2):
        for x in range(w + 2):
            if px[x, y] == (255, 0, 255):
                mpx[x, y] = 255
    mask = mask.crop((1, 1, w + 1, h + 1))
    alpha = Image.eval(mask, lambda v: 255 - v)
    src.putalpha(alpha)

    # Fit the artwork to the macOS icon grid (824px body inside a 1024px canvas).
    bbox = src.getbbox()
    body = src.crop(bbox)
    body = body.resize((824, int(824 * body.height / body.width)), Image.LANCZOS)
    out = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    out.paste(body, ((1024 - body.width) // 2, (1024 - body.height) // 2), body)

    (ROOT / "build").mkdir(exist_ok=True)
    out.save(ROOT / "build" / "icon.png")


def draw_broom(size: int) -> Image.Image:
    scale = 16
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    black = (0, 0, 0, 255)

    def p(x: float, y: float) -> tuple[float, float]:
        return (x / 16 * s, y / 16 * s)

    # Handle
    d.line([p(2.2, 1.6), p(7.6, 8.2)], fill=black, width=int(1.7 / 16 * s))
    d.ellipse([p(1.35, 0.75), p(3.05, 2.45)], fill=black)
    # Ferrule
    d.polygon([p(5.4, 9.2), p(9.4, 5.9), p(10.5, 7.2), p(6.5, 10.5)], fill=black)
    # Bristles
    d.polygon(
        [p(6.9, 11.0), p(10.9, 7.7), p(15.0, 12.2), p(12.4, 12.1), p(13.6, 14.2), p(10.6, 13.4), p(10.4, 15.4), p(8.4, 13.4)],
        fill=black,
    )
    # Sparkle
    cx, cy, r, t = 12.6, 2.6, 2.3, 0.55
    d.polygon(
        [p(cx, cy - r), p(cx + t, cy - t), p(cx + r, cy), p(cx + t, cy + t), p(cx, cy + r), p(cx - t, cy + t), p(cx - r, cy), p(cx - t, cy - t)],
        fill=black,
    )

    return img.resize((size, size), Image.LANCZOS)


def make_tray_icons() -> None:
    assets = ROOT / "assets"
    assets.mkdir(exist_ok=True)
    draw_broom(16).save(assets / "trayTemplate.png")
    draw_broom(32).save(assets / "trayTemplate@2x.png")


if __name__ == "__main__":
    make_app_icon()
    make_tray_icons()
    print("icons written")
