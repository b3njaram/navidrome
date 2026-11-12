#!/usr/bin/env python3
"""Render the Jobbi Music iPhone home-screen icon (1024×1024, opaque PNG).

Uses only Python's standard library, so Xcode builds do not depend on
installed fonts, ImageMagick, Pillow, a network request, or a paid asset.
Apple applies the home-screen corner mask itself; do not round this image.
"""
import math
import os
import struct
import sys
import zlib

SIZE = 1024

def smooth(value):
    t = min(1.0, max(0.0, value))
    return t * t * (3 - 2 * t)

def ellipse(x, y, cx, cy, radius_x, radius_y, rotation=-0.24):
    dx, dy = x - cx, y - cy
    cs, sn = math.cos(rotation), math.sin(rotation)
    xx = (dx * cs + dy * sn) / radius_x
    yy = (-dx * sn + dy * cs) / radius_y
    return smooth((1.0 - math.sqrt(xx * xx + yy * yy)) * 2.0 * min(radius_x, radius_y))

def solid_rect(x, y, x0, y0, x1, y1):
    return smooth(min(x-x0, x1-x, y-y0, y1-y) / 1.6 + 0.5)

def musical_symbol(x, y):
    # A connected double eighth-note motif, large enough to read at 60px.
    head_l = ellipse(x, y, 393, 655, 106, 77)
    head_r = ellipse(x, y, 650, 599, 106, 77)
    stem_l = solid_rect(x, y, 473, 315, 516, 652)
    stem_r = solid_rect(x, y, 730, 260, 773, 596)
    # Thick, gently rising beam connects the two stems.
    slope_top = 315 - 0.21 * (x - 473)
    beam = smooth(min(x-473, 773-x, y-slope_top, slope_top+88-y) / 1.6 + 0.5)
    return max(head_l, head_r, stem_l, stem_r, beam)

def png_chunk(tag, content):
    data = tag + content
    return struct.pack(">I", len(content)) + data + struct.pack(">I", zlib.crc32(data) & 0xffffffff)

def render(destination):
    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png += png_chunk(b"IHDR", struct.pack(">2I5B", SIZE, SIZE, 8, 2, 0, 0, 0))
    compressor = zlib.compressobj(7)
    compressed = bytearray()
    for iy in range(SIZE):
        row = bytearray(1 + SIZE * 3)
        y = iy + .5
        for ix in range(SIZE):
            x = ix + .5
            dx, dy = x - 512.0, y - 512.0
            d = math.hypot(dx, dy)
            # Deep plum background and subtle violet/pink halo.
            base = 0.5 * y / SIZE
            halo = smooth(1.0 - math.hypot((x-600)/730, (y-360)/670))
            color = [
                24 + 14*base + 48*halo,
                19 + 7*base + 12*halo,
                42 + 14*base + 50*halo
            ]
            disc = smooth((348 - d) / 2.3 + .5)
            if disc:
                hue = min(1.0, max(0.0, (x + y) / (SIZE * 2)))
                tint = [184 + 31*hue, 40 + 45*hue, 132 + 34*hue]
                color = [v * (1-disc) + t * disc for v, t in zip(color, tint)]
            # Circular lighter edge, softened to avoid a hard plastic badge.
            ring = smooth((355-d)/1.8 + .5) * (1 - smooth((347-d)/1.8 + .5))
            if ring:
                color = [v*(1-ring*.65)+t*ring*.65
                         for v,t in zip(color,(248,145,209))]
            glyph = musical_symbol(x, y)
            if glyph:
                color = [v*(1-glyph)+t*glyph
                         for v,t in zip(color,(255,249,253))]
            at = 1 + ix*3
            for channel in range(3):
                row[at+channel] = max(0, min(255, round(color[channel])))
        compressed.extend(compressor.compress(bytes(row)))
    compressed.extend(compressor.flush())
    png += png_chunk(b"IDAT", bytes(compressed))
    png += png_chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(os.path.abspath(destination)), exist_ok=True)
    with open(destination, "wb") as file:
        file.write(png)
    print(f"Created opaque Jobbi Music app icon: {destination} ({SIZE}x{SIZE}, {len(png)} bytes)")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/generate-app-icon.py PATH_TO_AppIcon.png")
    render(sys.argv[1])
