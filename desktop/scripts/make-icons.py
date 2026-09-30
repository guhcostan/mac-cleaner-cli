"""Generates the app icon, the menu bar (template) icons and the in-app logo.

    python3 scripts/make-icons.py

Requires Pillow. The mark is a pair of sparkles drawn from an astroid curve,
on a light macOS-style squircle. Outputs:
  build/icon.png                1024x1024 app icon (electron-builder turns it into .icns)
  assets/trayTemplate.png       18x18 outlined menu bar icon (template image)
  assets/trayTemplate@2x.png    36x36 retina variant
  src/renderer/logo.png         64x64 logo shown in the popover header
  branding/logo-mark.png        1024x1024 colored mark, transparent background
  branding/menubar-black.png    576x576 outlined menu bar mark, black, transparent background
  branding/menubar-white.png    576x576 outlined menu bar mark, white, transparent background
"""

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent

MINT_TOP = (52, 211, 153, 255)
MINT_BOTTOM = (16, 160, 120, 255)
BG_TOP = (255, 255, 255, 255)
BG_BOTTOM = (236, 239, 243, 255)


def squircle(size: float, n: float = 5.0, steps: int = 720) -> list[tuple[float, float]]:
    r = size / 2
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append((r + r * math.copysign(abs(c) ** (2 / n), c), r + r * math.copysign(abs(s) ** (2 / n), s)))
    return pts


def sparkle(cx: float, cy: float, r: float, e: float = 2.6, steps: int = 400) -> list[tuple[float, float]]:
    """Four-pointed star with concave sides (a generalized astroid)."""
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append((cx + r * math.copysign(abs(c) ** e, c), cy + r * math.copysign(abs(s) ** e, s)))
    return pts


def vertical_gradient(w: int, h: int, top: tuple, bottom: tuple) -> Image.Image:
    g = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(g)
    for y in range(h):
        k = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * k) for i in range(4)))
    return g


def draw_mark(
    draw: ImageDraw.ImageDraw, size: float, cx: float, cy: float, e: float = 2.6, small: float = 100
) -> None:
    """The two sparkles, laid out for a square of `size` centered on (cx, cy)."""
    u = size / 824
    draw.polygon(sparkle(cx - 40 * u, cy + 30 * u, 280 * u, e), fill=255)
    draw.polygon(sparkle(cx + 215 * u, cy - 215 * u, small * u, e), fill=255)


def make_app_icon(size: int = 1024, supersample: int = 4) -> Image.Image:
    w = size * supersample
    body = int(824 / 1024 * w)
    off = (w - body) // 2
    out = Image.new("RGBA", (w, w), (0, 0, 0, 0))

    shadow = Image.new("L", (w, w), 0)
    ImageDraw.Draw(shadow).polygon([(x + off, y + off + w * 0.014) for x, y in squircle(body)], fill=45)
    shadow = shadow.filter(ImageFilter.GaussianBlur(w * 0.018))
    out.paste((0, 0, 0, 255), (0, 0), shadow)

    body_mask = Image.new("L", (w, w), 0)
    ImageDraw.Draw(body_mask).polygon([(x + off, y + off) for x, y in squircle(body)], fill=255)
    out.paste(vertical_gradient(w, w, BG_TOP, BG_BOTTOM), (0, 0), body_mask)

    mark_mask = Image.new("L", (w, w), 0)
    draw_mark(ImageDraw.Draw(mark_mask), body, w / 2, w / 2)
    out.paste(vertical_gradient(w, w, MINT_TOP, MINT_BOTTOM), (0, 0), mark_mask)

    return out.resize((size, size), Image.LANCZOS)


def outline_mark(points: float, scale: int, stroke_pt: float = 1.6, supersample: int = 8) -> Image.Image:
    """
    Menu bar version of the mark, in the style of SF Symbols' "sparkles": the big sparkle
    outlined, the small one solid, sized for an 18pt menu bar slot. Returns an "L" mask
    at `points * scale` pixels.
    """
    px = points * scale
    w = px * supersample
    stroke = stroke_pt * scale * supersample
    size = w * 1.22
    u = size / 824
    cx, cy = w / 2 + w * 0.03, w / 2 + w * 0.03

    big = sparkle(cx - 40 * u, cy + 30 * u, 280 * u, e=3.0, steps=2400)
    fill = Image.new("L", (w, w), 0)
    ImageDraw.Draw(fill).polygon(big, fill=255)

    # The stroke is the band of the shape within `stroke` of its edge: a union of discs along
    # the edge, clipped to the shape. Uniform width even on the concave sides.
    band = Image.new("L", (w, w), 0)
    bd = ImageDraw.Draw(band)
    for x, y in big:
        bd.ellipse([x - stroke, y - stroke, x + stroke, y + stroke], fill=255)
    mask = ImageChops.multiply(fill, band)

    ImageDraw.Draw(mask).polygon(sparkle(cx + 215 * u, cy - 215 * u, 120 * u, e=2.6), fill=255)
    return mask.resize((px, px), Image.LANCZOS)


def make_tray_icon(scale: int) -> Image.Image:
    """Black on transparent: macOS tints template images for light/dark menu bars."""
    mask = outline_mark(18, scale)
    out = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    out.paste((0, 0, 0, 255), (0, 0), mask)
    return out


def make_logo_files() -> None:
    """Standalone transparent PNGs of the mark, for README, website or other menu bar uses."""
    out_dir = ROOT / "branding"
    out_dir.mkdir(exist_ok=True)

    # Colored filled mark, no background.
    w = 1024 * 4
    mask = Image.new("L", (w, w), 0)
    draw_mark(ImageDraw.Draw(mask), w * 1.1, w / 2 + w * 0.02, w / 2 + w * 0.02)
    logo = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    logo.paste(vertical_gradient(w, w, MINT_TOP, MINT_BOTTOM), (0, 0), mask)
    logo.resize((1024, 1024), Image.LANCZOS).save(out_dir / "logo-mark.png")

    # Menu bar outline in black and white, large enough to rescale.
    outline = outline_mark(18, 32)
    for name, color in (("menubar-black.png", (0, 0, 0, 255)), ("menubar-white.png", (255, 255, 255, 255))):
        img = Image.new("RGBA", outline.size, (0, 0, 0, 0))
        img.paste(color, (0, 0), outline)
        img.save(out_dir / name)


if __name__ == "__main__":
    (ROOT / "build").mkdir(exist_ok=True)
    (ROOT / "assets").mkdir(exist_ok=True)

    icon = make_app_icon()
    icon.save(ROOT / "build" / "icon.png")
    icon.resize((64, 64), Image.LANCZOS).save(ROOT / "src" / "renderer" / "logo.png")
    make_tray_icon(1).save(ROOT / "assets" / "trayTemplate.png")
    make_tray_icon(2).save(ROOT / "assets" / "trayTemplate@2x.png")
    make_logo_files()
    print("icons written")
