#!/usr/bin/env python3
"""Copy the project's local symbol images and generate their library catalog."""

from __future__ import annotations

import argparse
import base64
import json
import re
import shutil
import subprocess
import struct
import unicodedata
from pathlib import Path


CATEGORY_MAP = {
    'Bombas': ('Bombas e válvulas', 'Bomba'),
    'Correias': ('Correias', 'Correia'),
    'Desempoeiramento': ('Desempoeiramento', 'Desempoeiramento'),
    'Industrial': ('Industrial', 'Equipamento industrial'),
    'Motores': ('Motores', 'Motor'),
    'Peneiras': ('Peneiras', 'Peneira'),
    'Sensores': ('Instrumentação', 'Sensor'),
    'Silos': ('Silos', 'Silo'),
    'Tubulações': ('Tubulações e fluidos', 'Tubulação'),
    'Ventiladores e exaustores': ('Ventilação e exaustão', 'Ventilador ou exaustor'),
}


def slug(value: str) -> str:
    normalized = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii')
    result = re.sub(r'[^a-z0-9]+', '-', normalized.lower()).strip('-')
    return result or 'simbolo'


def png_dimensions(raw: bytes, path: Path) -> tuple[int, int]:
    header = raw[:24]
    if header[:8] != b'\x89PNG\r\n\x1a\n' or header[12:16] != b'IHDR':
        raise ValueError(f'Arquivo PNG inválido: {path}')
    return struct.unpack('>II', header[16:24])


def transparent_png(path: Path) -> bytes:
    result = subprocess.run(
        ['convert', str(path), '-alpha', 'on', '-fuzz', '5%', '-transparent', 'white', 'png:-'],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout


def png_as_svg(path: Path) -> tuple[bytes, int, int]:
    raw = transparent_png(path)
    width, height = png_dimensions(raw, path)
    encoded = base64.b64encode(raw).decode('ascii')
    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">'
        f'<image width="{width}" height="{height}" href="data:image/png;base64,{encoded}" '
        'preserveAspectRatio="none" /></svg>\n'
    )
    return svg.encode('ascii'), width, height


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--target', type=Path, required=True)
    args = parser.parse_args()

    source = args.source.resolve()
    target = args.target.resolve()
    if not source.is_dir():
        raise ValueError(f'Pasta de origem ausente: {source}')

    target.mkdir(parents=True, exist_ok=True)
    catalog_path = target / 'catalog.json'
    for child in target.iterdir():
        if child.name == 'catalog.json':
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()

    entries = []
    source_files = sorted(source.glob('*/*.png'), key=lambda path: (path.parent.name, path.name))
    if not source_files:
        raise ValueError(f'Nenhuma imagem PNG encontrada em {source}')

    category_indexes: dict[str, int] = {}
    for source_file in source_files:
        source_category = source_file.parent.name
        if source_category not in CATEGORY_MAP:
            raise ValueError(f'Categoria não mapeada: {source_category}')
        category, label = CATEGORY_MAP[source_category]
        category_slug = slug(category)
        category_indexes[source_category] = category_indexes.get(source_category, 0) + 1
        index = category_indexes[source_category]
        filename = f'{slug(source_category)}-{index:02d}.svg'
        destination = target / category_slug / filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        svg, width, height = png_as_svg(source_file)
        destination.write_bytes(svg)

        symbol_id = f'pims-vision:{slug(source_category)}:{index:02d}'
        source_stem = source_file.stem
        entries.append({
            'id': symbol_id,
            'name': f'{label} {index:02d}',
            'originalName': source_stem,
            'category': category,
            'keywords': sorted({source_category.lower(), category.lower(), label.lower(), source_stem.lower()}),
            'synonyms': [label.lower(), source_category.lower()],
            'source': 'pims-vision',
            'license': 'Project Asset',
            'svg': f'library/assets/local/{category_slug}/{filename}',
            'viewBox': f'0 0 {width} {height}',
            'defaultSize': {'width': 96, 'height': 96},
            'capabilities': {'fill': False, 'stroke': False, 'multistateReady': False},
            'sourceFile': f'{source_category}/{source_file.name}',
            'dimensions': {'width': width, 'height': height},
            'originalAspectRatio': width / height,
        })

    catalog_path.write_text(json.dumps({'entries': entries}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(entries)} local symbol images into {target}')


if __name__ == '__main__':
    main()
