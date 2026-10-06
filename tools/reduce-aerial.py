"""Deriva web/aerial-2048.jpg (modo ligero y táctil) de web/aerial.jpg.

Misma georreferencia: mismo recorte y extensión, solo cambia la resolución
(4096×3072 -> 2048×1536, ~0,66 m/píxel). Uso desde la raíz del repositorio:
    uv run --no-project --with pillow python tools/reduce-aerial.py
"""

from PIL import Image, __version__

SOURCE, TARGET, SIZE, QUALITY = "web/aerial.jpg", "web/aerial-2048.jpg", (2048, 1536), 82

with Image.open(SOURCE) as image:
    if image.size != (4096, 3072):
        raise SystemExit(f"Tamaño inesperado de {SOURCE}: {image.size}")
    image.convert("RGB").resize(SIZE, Image.Resampling.LANCZOS).save(
        TARGET, "JPEG", quality=QUALITY, optimize=True
    )
print(f"{TARGET} {SIZE[0]}x{SIZE[1]} calidad {QUALITY}, Lanczos, Pillow {__version__}")
