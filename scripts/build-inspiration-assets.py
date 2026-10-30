#!/usr/bin/env python3
"""Build small, fixed-size WebP assets from locally saved source images."""
from pathlib import Path
from PIL import Image, ImageOps
import json

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'web/public/inspiration'
DEST.mkdir(parents=True, exist_ok=True)
manifest = DEST / 'assets.json'
previous = json.loads(manifest.read_text()) if manifest.exists() else {}
report = {}
CHARACTER_IDS = {'forest-courier', 'starship-mechanic', 'android-archivist', 'midnight-host'}
# Originals stay local. A clean checkout must retain already shipped WebP files
# when only a new set of generated originals is available for processing.
for path in sorted(DEST.glob('*.webp')):
    if not path.stem.endswith(('-thumb', '-detail')):
        continue
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        budget = 95_000 if path.stem.endswith('-thumb') else 280_000
        if image.format != 'WEBP' or path.stat().st_size > budget:
            raise RuntimeError(f'{path.name} is invalid or exceeds image budget')
        report[path.name] = {**previous.get(path.name, {}), 'bytes': path.stat().st_size, 'width': image.width, 'height': image.height}
for folder in ('imagegen', 'stock'):
    for source in sorted((ROOT / 'outputs' / folder).glob('*')):
        if source.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        with Image.open(source) as raw:
            image = ImageOps.exif_transpose(raw).convert('RGB')
            original_size = image.size
            sizes = [('thumb', (640, 400)), ('detail', (1440, 1440))]
            if source.stem == 'rooftop-studio':
                sizes = [('thumb', (720, 480)), ('detail', (1440, 960))]
            for variant, size in sizes:
                out = image.copy()
                if variant == 'thumb':
                    # Keep faces inside the character card crop.
                    crop_y = 0 if source.stem == 'starship-mechanic' else 0.04 if source.stem in CHARACTER_IDS else 0.26 if image.height > image.width else 0.5
                    out = ImageOps.fit(out, size, centering=(0.5, crop_y))
                else:
                    out.thumbnail(size)
                path = DEST / f'{source.stem}-{variant}.webp'
                quality = 82
                out.save(path, 'WEBP', quality=quality, method=6)
                budget = 95_000 if variant == 'thumb' else 280_000
                while path.stat().st_size > budget and quality > 40:
                    quality -= 6
                    out.save(path, 'WEBP', quality=quality, method=6)
                if path.stat().st_size > budget:
                    raise RuntimeError(f'{path.name} exceeds image budget')
                report[path.name] = {'bytes': path.stat().st_size, 'width': out.width, 'height': out.height, 'sourceWidth': original_size[0], 'sourceHeight': original_size[1]}
manifest.write_text(json.dumps(dict(sorted(report.items())), indent=2) + '\n')
print(json.dumps(report, indent=2))
