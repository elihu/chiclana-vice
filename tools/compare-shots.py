"""Compara capturas PNG; el límite se expresa en porcentaje de píxeles."""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dir_a", type=Path)
    parser.add_argument("dir_b", type=Path)
    parser.add_argument("--limit", type=float, default=0.5)
    args = parser.parse_args()
    if not np.isfinite(args.limit) or not 0 <= args.limit <= 100:
        parser.error("--limit debe estar entre 0 y 100")
    if not args.dir_a.is_dir() or not args.dir_b.is_dir():
        parser.error("ambas rutas deben ser directorios")
    names_a = {p.name for p in args.dir_a.glob("*.png")}
    names_b = {p.name for p in args.dir_b.glob("*.png")}
    names = sorted(names_a & names_b)
    if not names:
        parser.error("no hay PNG con el mismo nombre")
    if names_a != names_b:
        print("PNG sin pareja: " + ", ".join(sorted(names_a ^ names_b)))
    failed = False
    for name in names:
        with Image.open(args.dir_a / name) as image_a, Image.open(args.dir_b / name) as image_b:
            if image_a.size != image_b.size:
                print(f"{name}: dimensiones distintas {image_a.size} / {image_b.size}")
                failed = True
                continue
            a = np.asarray(image_a.convert("RGBA"), dtype=np.int16)
            b = np.asarray(image_b.convert("RGBA"), dtype=np.int16)
        difference = np.abs(a - b).max(axis=2)
        percent = np.count_nonzero(difference > 8) / difference.size * 100
        maximum = int(difference.max())
        print(f"{name}: {percent:.6f}% de píxeles (>8), diferencia máxima {maximum}")
        failed |= percent > args.limit
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
