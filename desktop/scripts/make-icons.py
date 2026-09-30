"""Generates the app icon, the menu bar (template) icons and the in-app logo.

    python3 scripts/make-icons.py

Requires Pillow. The mark is a pair of sparkles drawn from an astroid curve,
on a light macOS-style squircle. Outputs:
  build/icon.png                1024x1024 app icon (electron-builder turns it into .icns)
  assets/trayTemplate.png       16x16 monochrome menu bar icon
  assets/trayTemplate@2x.png    32x32 retina variant
  src/renderer/logo.png         64x64 logo shown in the popover header
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

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


def make_tray_icon(size: int) -> Image.Image:
    """Black on transparent: macOS tints template images for light/dark menu bars."""
    w = size * 16
    mask = Image.new("L", (w, w), 0)
    # The mark fills the whole square here, there is no squircle around it. At 16pt the
    # points need to be sharper and the small sparkle bigger to still read as sparkles.
    draw_mark(ImageDraw.Draw(mask), w * 1.3, w / 2 + w * 0.03, w / 2 + w * 0.02, e=3.4, small=125)
    out = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    out.paste((0, 0, 0, 255), (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    (ROOT / "build").mkdir(exist_ok=True)
    (ROOT / "assets").mkdir(exist_ok=True)

    icon = make_app_icon()
    icon.save(ROOT / "build" / "icon.png")
    icon.resize((64, 64), Image.LANCZOS).save(ROOT / "src" / "renderer" / "logo.png")
    make_tray_icon(16).save(ROOT / "assets" / "trayTemplate.png")
    make_tray_icon(32).save(ROOT / "assets" / "trayTemplate@2x.png")
    print("icons written")
