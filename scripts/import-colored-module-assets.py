#!/usr/bin/env python3
"""Create sanitized, colored SVG derivatives for the optional module catalogue."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Tuple


SOURCES = {
    'tabler-icons': {
        'library': 'Tabler Icons',
        'url': 'https://github.com/tabler/tabler-icons',
        'commit': '183e715d5a81ba1959e285f69c08235fe34b04ce',
    },
    'phosphor-core': {
        'library': 'Phosphor Icons core',
        'url': 'https://github.com/phosphor-icons/core',
        'commit': '2b75f3ad12b420c9504ef05df8d2564a28f8500e',
    },
    'iconoir': {
        'library': 'Iconoir',
        'url': 'https://github.com/iconoir-icons/iconoir',
        'commit': 'd7dfa4d0341df0670bfed9fc24221c9d7ef2112e',
    },
    'siemens-ix-icons': {
        'library': 'Siemens Industrial Experience Icons',
        'url': 'https://github.com/siemens/ix-icons',
        'commit': 'c46e1b13f7ccdaf66e4fcf2261f3765c55d45557',
    },
}

PALETTES = {
    'Bombas': ('#28658A', '#7DB5C9', '#39A96B', '#1B3140'),
    'Caldeiras': ('#8D3F2E', '#D87835', '#F0B429', '#35211C'),
    'Computadores': ('#245B8A', '#67A9D1', '#36B37E', '#1E2D3B'),
    'Dutos': ('#5B7385', '#AABBC5', '#E2A33A', '#273641'),
    'Encanamentos': ('#287A9D', '#70C2D4', '#E0A73A', '#193743'),
    'Fios e cabos': ('#6B4B35', '#C98645', '#4F6676', '#292B2D'),
    'Misturadores': ('#4B6E85', '#9BB7C5', '#C88732', '#253746'),
    'Motores': ('#2E6386', '#7AA8BF', '#D98732', '#1B2E3A'),
    'Mineração': ('#6B5A3A', '#B38A45', '#E18A2C', '#30291E'),
    'Setas': ('#246B8A', '#63A8C0', '#E2A33A', '#22333D'),
    'Sensores': ('#285A84', '#72A8C8', '#E2A33A', '#1D2C39'),
    'Tubos': ('#5F7888', '#AFC2CB', '#C88935', '#283942'),
    'Usinagem': ('#4A6472', '#A2B4BC', '#D78931', '#27323A'),
    'Transportadores': ('#5A7180', '#A7BDC6', '#DB9A32', '#283843'),
    'Esteiras': ('#5D6870', '#8F9FA7', '#D98A2C', '#242B2F'),
    'Correias': ('#6B4935', '#B47742', '#4B6674', '#292727'),
    'Válvulas': ('#345E73', '#86B4C4', '#E1A238', '#21333D'),
    'Ventoinhas e ventiladores': ('#2F6886', '#84B8C7', '#E0A037', '#20333D'),
    'Botões': ('#38617B', '#87B1C3', '#39A96B', '#263640'),
}


def slug(value: str) -> str:
    result = re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')
    return result or 'simbolo'


def load_sanitizer():
    path = Path(__file__).with_name('import-library-svg-assets.py')
    spec = importlib.util.spec_from_file_location('library_svg_sanitizer', path)
    if spec is None or spec.loader is None:
        raise RuntimeError('não foi possível carregar o sanitizador comum')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def local_name(tag: str) -> str:
    return tag.rsplit('}', 1)[-1].lower()


def colorize(serialized: bytes, namespace: str, category: str) -> Tuple[bytes, str, float, float, List[str]]:
    sanitizer = load_sanitizer()
    root = ET.fromstring(serialized)
    palette = PALETTES[category]
    body, secondary, accent, outline = palette
    for element in root.iter():
        if element.attrib.get('fill') == 'currentColor':
            element.set('fill', body)
        if element.attrib.get('stroke') == 'currentColor':
            element.set('stroke', outline)
    drawable = [child for child in list(root) if local_name(child.tag) not in {'defs', 'title', 'desc'}]
    defs = [child for child in list(root) if local_name(child.tag) in {'defs', 'title', 'desc'}]
    for child in list(root):
        root.remove(child)
    for child in defs:
        root.append(child)

    body_group = ET.SubElement(root, '{http://www.w3.org/2000/svg}g', {'id': f'{namespace}_body', 'data-role': 'body'})
    outline_group = ET.SubElement(body_group, '{http://www.w3.org/2000/svg}g', {'id': f'{namespace}_outline', 'data-role': 'outline'})
    active_parts = {'Motores', 'Misturadores', 'Transportadores', 'Esteiras', 'Correias', 'Ventoinhas e ventiladores'}
    active_group = None
    if category in active_parts:
        active_group = ET.SubElement(outline_group, '{http://www.w3.org/2000/svg}g', {'id': f'{namespace}_active_part', 'data-role': 'active-part'})

    vector_tags = {'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'}
    vector_index = 0

    def paint(element: ET.Element) -> None:
        nonlocal vector_index
        if local_name(element.tag) in vector_tags:
            color = body if vector_index % 3 == 0 else secondary if vector_index % 3 == 1 else accent
            if element.attrib.get('fill') != 'none':
                element.set('fill', color)
            elif 'fill' not in element.attrib:
                element.set('fill', 'none')
            if 'stroke' in element.attrib or element.attrib.get('fill') == 'none':
                element.set('stroke', outline if vector_index % 2 == 0 else color)
            vector_index += 1
        for child in list(element):
            paint(child)

    for index, child in enumerate(drawable):
        target = active_group if active_group is not None and index == len(drawable) - 1 else outline_group
        target.append(child)
        paint(child)

    root.set('data-style', 'colored')
    root.set('data-modified', 'true')
    root.set('data-palette', 'industrial')
    vb, width, height = sanitizer.view_box(root)
    root.set('viewBox', vb)
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    result = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    return result, vb, width, height, ['active-part'] if active_group is not None else []


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--target', type=Path, required=True)
    parser.add_argument('--source-root', action='append', required=True)
    args = parser.parse_args()

    roots: Dict[str, Path] = {}
    for value in args.source_root:
        source, separator, path = value.partition('=')
        if not separator or source not in SOURCES:
            raise ValueError(f'Fonte inválida: {value}')
        roots[source] = Path(path).resolve()

    sanitizer = load_sanitizer()
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    target = args.target.resolve()
    target.mkdir(parents=True, exist_ok=True)
    (target / 'LICENSES').mkdir(exist_ok=True)
    entries = []
    seen = set()
    seen_hashes = set()
    for item in manifest['entries']:
        source = item['source']
        source_file = (roots[source] / item['sourcePath']).resolve()
        if roots[source] not in source_file.parents or not source_file.is_file():
            raise ValueError(f'Arquivo de origem ausente: {source_file}')
        key = (source, item['sourcePath'])
        if key in seen:
            raise ValueError(f'Arquivo duplicado: {key}')
        seen.add(key)
        raw = source_file.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest in seen_hashes:
            raise ValueError(f'SVG duplicado por conteúdo: {source_file}')
        seen_hashes.add(digest)
        symbol_id = f"module:{slug(item['category'])}:{source}:{slug(item['sourcePath'])}"
        namespace = 'sym_' + hashlib.sha256(symbol_id.encode('utf-8')).hexdigest()[:12]
        sanitized, view_box, width, height = sanitizer.sanitize_svg(raw, namespace)
        colored, view_box, width, height, animated_parts = colorize(sanitized, namespace, item['category'])
        category_slug = slug(item['category'])
        asset_path = f'library/assets/modules/{category_slug}/{source}/{slug(item["sourcePath"])}.svg'
        destination = target / category_slug / source / f'{slug(item["sourcePath"])}.svg'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(colored)
        info = SOURCES[source]
        aspect = width / height
        max_dimension = 96.0
        default_width = round(max_dimension if aspect >= 1 else max_dimension * aspect)
        default_height = round(max_dimension / aspect if aspect >= 1 else max_dimension)
        entries.append({
            'id': symbol_id,
            'name': item['name'],
            'originalName': source_file.stem,
            'category': item['category'],
            'keywords': sorted(set(item.get('keywords', []) + [source, info['library'], source_file.stem.replace('-', ' ')])),
            'synonyms': [item['name'].lower(), source_file.stem.replace('-', ' ')],
            'source': source,
            'library': info['library'],
            'sourceUrl': info['url'],
            'sourceCommit': info['commit'],
            'license': 'MIT',
            'modified': True,
            'originalSvgSha256': digest,
            'style': 'colored',
            'sourceFile': item['sourcePath'],
            'svg': asset_path,
            'viewBox': view_box,
            'dimensions': {'width': width, 'height': height},
            'originalAspectRatio': aspect,
            'defaultSize': {'width': default_width, 'height': default_height},
            'capabilities': {
                'fill': True,
                'stroke': True,
                'opacity': True,
                'rotate': True,
                'blink': True,
                'multistateReady': True,
                'animatedParts': animated_parts,
            },
        })

    for source, info in SOURCES.items():
        if source not in roots:
            continue
        repository_root = roots[source] / source
        license_path = repository_root / ('LICENSE.md' if source == 'siemens-ix-icons' else 'LICENSE')
        if license_path.is_file():
            (target / 'LICENSES' / f'{source}.txt').write_text(
                f'{info["library"]}\nURL: {info["url"]}\nCommit: {info["commit"]}\n\n' + license_path.read_text(encoding='utf-8', errors='replace'),
                encoding='utf-8',
            )
    (target / 'catalog.json').write_text(json.dumps({'entries': entries, 'sourceCommits': {key: SOURCES[key]['commit'] for key in roots}}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(entries)} colored, sanitized SVGs into {target}')


if __name__ == '__main__':
    main()
