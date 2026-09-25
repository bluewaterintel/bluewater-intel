#!/usr/bin/env python3
"""Composite a punched marlin onto an opaque sRGB teal tile.

Writes a fully opaque PNG so Android adaptive-icon layers cannot paint a
second teal into transparent pixels. Usage:

  android-compose-icon.py SRC DEST R G B SCALE
"""
from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path


def read_png(path: Path):
    data = path.read_bytes()
    off = 8
    idat = b""
    w = h = ct = None
    while off < len(data):
        n = struct.unpack(">I", data[off : off + 4])[0]
        typ = data[off + 4 : off + 8]
        chunk = data[off + 8 : off + 8 + n]
        if typ == b"IHDR":
            w, h, bit, ct, _comp, _filt, _inter = struct.unpack(">IIBBBBB", chunk)
        elif typ == b"IDAT":
            idat += chunk
        elif typ == b"IEND":
            break
        off += 12 + n
    if w is None or ct not in (2, 6):
        raise SystemExit(f"unsupported PNG {path}")
    raw = zlib.decompress(idat)
    bpp = 3 if ct == 2 else 4
    stride = w * bpp
    rows = []
    i = 0
    prev = bytearray(stride)
    for _y in range(h):
        f = raw[i]
        i += 1
        row = bytearray(raw[i : i + stride])
        i += stride
        if f == 1:
            for x in range(stride):
                row[x] = (row[x] + (row[x - bpp] if x >= bpp else 0)) & 255
        elif f == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + ((a + prev[x]) // 2)) & 255
        elif f == 4:
            for x in range(stride):
                a = row[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                row[x] = (row[x] + pr) & 255
        elif f != 0:
            raise SystemExit(f"unsupported PNG filter {f}")
        if ct == 2:
            rgba = bytearray(w * 4)
            for x in range(w):
                rgba[x * 4 : x * 4 + 3] = row[x * 3 : x * 3 + 3]
                rgba[x * 4 + 3] = 255
            row = rgba
        rows.append(row)
        prev = row if ct == 6 else bytearray(row)
        if ct == 2:
            prev = bytearray(stride)
            prev[:] = raw[i - stride : i] if False else prev
    return w, h, rows


def write_png_rgba(path: Path, w: int, h: int, rows: list[bytes]):
    raw = b"".join(b"\x00" + row for row in rows)
    compressed = zlib.compress(raw, 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", compressed)
    out += chunk(b"IEND", b"")
    path.write_bytes(out)


def sample(rows, w, h, fx, fy):
    if fx < 0 or fy < 0 or fx >= w or fy >= h:
        return (0, 0, 0, 0)
    x0 = int(fx)
    y0 = int(fy)
    x1 = min(x0 + 1, w - 1)
    y1 = min(y0 + 1, h - 1)
    tx = fx - x0
    ty = fy - y0

    def pix(x, y):
        i = x * 4
        r = rows[y]
        return r[i], r[i + 1], r[i + 2], r[i + 3]

    c00, c10, c01, c11 = pix(x0, y0), pix(x1, y0), pix(x0, y1), pix(x1, y1)

    def lerp(a, b, t):
        return [a[i] + (b[i] - a[i]) * t for i in range(4)]

    top = lerp(c00, c10, tx)
    bot = lerp(c01, c11, tx)
    mix = lerp(top, bot, ty)
    return tuple(int(v + 0.5) for v in mix)


def resize_nearest(src_rows, sw, sh, dw, dh):
    out = []
    for y in range(dh):
        sy = min(sh - 1, int((y + 0.5) * sh / dh))
        row = bytearray(dw * 4)
        srow = src_rows[sy]
        for x in range(dw):
            sx = min(sw - 1, int((x + 0.5) * sw / dw))
            i = sx * 4
            j = x * 4
            row[j : j + 4] = srow[i : i + 4]
        out.append(bytes(row))
    return out


def main():
    if len(sys.argv) == 5 and sys.argv[1] == "--resize":
        src = Path(sys.argv[2])
        dest = Path(sys.argv[3])
        size = int(sys.argv[4])
        w, h, rows = read_png(src)
        write_png_rgba(dest, size, size, resize_nearest(rows, w, h, size, size))
        return
    if len(sys.argv) != 7:
        raise SystemExit("usage: android-compose-icon.py SRC DEST R G B SCALE")
    src = Path(sys.argv[1])
    dest = Path(sys.argv[2])
    tr, tg, tb = (int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
    scale = float(sys.argv[6])
    w, h, src_rows = read_png(src)
    art_w = w * scale
    art_h = h * scale
    ox = (w - art_w) / 2
    oy = (h - art_h) / 2
    out_rows = []
    for y in range(h):
        row = bytearray(w * 4)
        for x in range(w):
            row[x * 4] = tr
            row[x * 4 + 1] = tg
            row[x * 4 + 2] = tb
            row[x * 4 + 3] = 255
            if ox <= x < ox + art_w and oy <= y < oy + art_h:
                fx = (x - ox) * (w / art_w)
                fy = (y - oy) * (h / art_h)
                sr, sg, sb, sa = sample(src_rows, w, h, fx, fy)
                if sa:
                    a = sa / 255.0
                    row[x * 4] = int(sr * a + tr * (1 - a) + 0.5)
                    row[x * 4 + 1] = int(sg * a + tg * (1 - a) + 0.5)
                    row[x * 4 + 2] = int(sb * a + tb * (1 - a) + 0.5)
        out_rows.append(bytes(row))
    write_png_rgba(dest, w, h, out_rows)


if __name__ == "__main__":
    main()
