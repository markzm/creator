#!/usr/bin/env python3
"""Use the installed secure image skill. Keys remain in its environment/auth store."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/imagegen'
CHARACTERS = {'forest-courier', 'starship-mechanic', 'android-archivist', 'midnight-host'}
ORDER = ['rooftop-studio', 'sky-islands', 'forest-courier', 'tree-library', 'orbital-port', 'summer-rooftop', 'starship-mechanic', 'android-archivist', 'midnight-host']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--only', nargs='+', choices=ORDER, help='Generate a sample set before the remaining images')
parser.add_argument('--dry-run', action='store_true')
args = parser.parse_args()
launcher = Path(os.environ.get('CODEX_HOME', str(Path.home() / '.codex'))) / 'skills/generate-gpt-image-2/scripts/run_image_gen.py'
if not launcher.is_file():
    raise SystemExit('Install the generate-gpt-image-2 skill before generating assets.')
for name in args.only or ORDER:
    output = OUT / f'{name}.png'
    if output.exists():
        print(f'Keeping existing master: {output.name}', flush=True)
        continue
    command = [sys.executable, str(launcher), 'generate', '--model', 'gpt-image-2', '--prompt-file', str(OUT / 'prompts' / f'{name}.txt'),
               '--quality', 'high', '--size', '1024x1536' if name in CHARACTERS else '1536x1024', '--out', str(output)]
    if args.dry_run:
        command.append('--dry-run')
    result = subprocess.run(command, check=False)
    if result.returncode:
        raise SystemExit(result.returncode)
    if not args.dry_run:
        from PIL import Image
        with Image.open(output) as image:
            image.verify()
        print(f'Validated {output.name}', flush=True)
