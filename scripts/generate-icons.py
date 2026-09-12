#!/usr/bin/env python3
"""Generate simple ranch-themed PNG icons without extra dependencies."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


CREAM = (241, 235, 224, 255)
SAGE = (47, 93, 66, 255)
DARK = (28, 24, 20, 255)


def png(width: int, height: int, pixels: list[tuple[int, int, int, int]]) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(pixels[y * width + x])

    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
            chunk(b"IEND", b""),
        ]
    )


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def draw_icon(size: int, maskable: bool = False) -> bytes:
    pixels: list[tuple[int, int, int, int]] = []
    pad = int(size * 0.18) if maskable else int(size * 0.08)
    inner = size - pad * 2

    for y in range(size):
        for x in range(size):
            # cream rounded-square background
            rx = min(x, size - 1 - x)
            ry = min(y, size - 1 - y)
            corner = int(size * 0.18)
            in_square = rx >= 0 and ry >= 0
            if min(rx, ry) < corner:
                # rounded corners via distance
                cx = corner if x < size / 2 else size - 1 - corner
                cy = corner if y < size / 2 else size - 1 - corner
                if (x - cx) ** 2 + (y - cy) ** 2 > corner**2:
                    pixels.append((0, 0, 0, 0) if maskable else CREAM)
                    continue

            if not in_square:
                pixels.append((0, 0, 0, 0))
                continue

            # cow silhouette in sage
            nx = (x - pad) / max(inner, 1)
            ny = (y - pad) / max(inner, 1)
            cow = False
            # body
            if 0.18 < nx < 0.82 and 0.38 < ny < 0.86:
                cow = True
            # head
            if 0.34 < nx < 0.66 and 0.16 < ny < 0.46:
                cow = True
            # ears
            if ((nx - 0.28) ** 2 / 0.035 + (ny - 0.28) ** 2 / 0.028) < 1:
                cow = True
            if ((nx - 0.72) ** 2 / 0.035 + (ny - 0.28) ** 2 / 0.028) < 1:
                cow = True
            # face blaze
            blaze = ((nx - 0.5) ** 2 / 0.018 + (ny - 0.30) ** 2 / 0.022) < 1
            if cow and blaze:
                pixels.append(CREAM)
            elif cow:
                pixels.append(SAGE)
            else:
                pixels.append(CREAM)

    return png(size, size, pixels)


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "public" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    (out / "icon-192.png").write_bytes(draw_icon(192))
    (out / "icon-512.png").write_bytes(draw_icon(512))
    (out / "icon-maskable-512.png").write_bytes(draw_icon(512, maskable=True))
    (out / "apple-touch-icon.png").write_bytes(draw_icon(180))
    print("wrote icons to", out)


if __name__ == "__main__":
    main()
