#!/usr/bin/env python3
"""Import exactly five Openclipart motor SVGs as local colored assets."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Tuple


ITEMS = [
    {
        'id': 'openclipart:industrial-electric-motor',
        'name': 'Motor elétrico industrial horizontal',
        'originalName': 'Electrical Motor (upper motor)',
        'file': 'industrial-electric-motor-upper.svg',
        'downloadedFile': 'openclipart-industrial-electric-motor.svg',
        'sourceUrl': 'https://openclipart.org/detail/271781/electrical-motor',
        'author': 'AlignEasy',
        'downloadUrl': 'https://openclipart.org/download/271781',
        'keywords': ['motor', 'motor elétrico', 'acionamento', 'máquina', 'eixo', 'indústria'],
        'synonyms': ['motor industrial', 'motor elétrico'],
        'activePart': 'shaft',
        'viewBoxOverride': '0 0 800 400',
    },
    {
        'id': 'openclipart:industrial-electric-motor-lower',
        'name': 'Motor elétrico industrial compacto',
        'originalName': 'Electrical Motor (lower motor)',
        'file': 'industrial-electric-motor-lower.svg',
        'downloadedFile': 'openclipart-industrial-electric-motor.svg',
        'sourceUrl': 'https://openclipart.org/detail/271781/electrical-motor',
        'author': 'AlignEasy',
        'downloadUrl': 'https://openclipart.org/download/271781',
        'keywords': ['motor', 'motor elétrico', 'acionamento', 'máquina', 'eixo', 'indústria'],
        'synonyms': ['motor industrial compacto', 'motor elétrico retangular'],
        'activePart': 'shaft',
        'viewBoxOverride': '0 400 800 400',
    },
    {
        'id': 'openclipart:ventilation-electric-motor',
        'name': 'Motor elétrico de ventilação',
        'originalName': 'Electric Motor',
        'file': 'ventilation-electric-motor.svg',
        'downloadedFile': 'openclipart-ventilation-electric-motor.svg',
        'sourceUrl': 'https://openclipart.org/detail/333614/electric-motor',
        'author': 'algotruneman',
        'downloadUrl': 'https://openclipart.org/download/333614',
        'keywords': ['motor', 'motor elétrico', 'ventilação', 'máquina', 'eixo'],
        'synonyms': ['motor de ventilador', 'motor de ventilação'],
        'activePart': 'fan',
    },
    {
        'id': 'openclipart:stepper-motor',
        'name': 'Motor de passo',
        'originalName': 'Stepper motor',
        'file': 'stepper-motor.svg',
        'downloadedFile': 'openclipart-stepper-motor.svg',
        'sourceUrl': 'https://openclipart.org/detail/201458/stepper-motor',
        'author': 'cyberscooty',
        'downloadUrl': 'https://openclipart.org/download/201458',
        'keywords': ['motor', 'motor elétrico', 'passo', 'acionamento', 'eixo', 'indústria'],
        'synonyms': ['motor passo a passo', 'stepper'],
        'activePart': 'shaft',
    },
    {
        'id': 'openclipart:vibrating-motor',
        'name': 'Motor vibratório',
        'originalName': 'Vibrating Motor',
        'file': 'vibrating-motor.svg',
        'downloadedFile': 'openclipart-vibrating-motor.svg',
        'sourceUrl': 'https://openclipart.org/detail/267434/vibrating-motor',
        'author': 'Inventoteca',
        'downloadUrl': 'https://openclipart.org/download/267434',
        'keywords': ['motor', 'motor elétrico', 'vibratório', 'máquina', 'acionamento', 'indústria'],
        'synonyms': ['motor vibrador', 'vibrador industrial'],
        'activePart': 'active-part',
    },
    {
        'id': 'openclipart:three-phase-motor',
        'name': 'Motor elétrico trifásico',
        'originalName': 'A simple representation of a electric 3-phase motor',
        'file': 'three-phase-motor.svg',
        'downloadedFile': 'openclipart-three-phase-motor.svg',
        'sourceUrl': 'https://openclipart.org/detail/141613/a-simple-representation-of-a-electric-3phase-motor',
        'author': 'Eypros',
        'downloadUrl': 'https://openclipart.org/download/141613',
        'keywords': ['motor', 'motor elétrico', 'trifásico', 'acionamento', 'máquina', 'indústria'],
        'synonyms': ['motor de três fases', 'motor 3 fases'],
        'activePart': 'shaft',
    },
]

PALETTE = ('#6B7280', '#9CA3AF', '#D1D5DB', '#374151')
VECTOR_TAGS = {'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'}
SVG_NS = 'http://www.w3.org/2000/svg'


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


def slug(value: str) -> str:
    result = re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')
    return result or 'motor'


def colorize(serialized: bytes, namespace: str, active_part: str) -> Tuple[bytes, str, float, float]:
    sanitizer = load_sanitizer()
    root = ET.fromstring(serialized)
    body, secondary, accent, outline = PALETTE

    for element in list(root.iter()):
        for attribute in ('style', 'class'):
            element.attrib.pop(attribute, None)
        for attribute in list(element.attrib):
            if attribute.startswith('{') and not attribute.startswith(f'{{{SVG_NS}}}'):
                element.attrib.pop(attribute, None)
        if element.attrib.get('fill') == 'currentColor':
            element.set('fill', body)
        if element.attrib.get('stroke') == 'currentColor':
            element.set('stroke', outline)
        if local_name(element.tag) in {'metadata', 'namedview', 'title', 'desc'}:
            parent = next((candidate for candidate in root.iter() if element in list(candidate)), None)
            if parent is not None:
                parent.remove(element)

    drawable = [child for child in list(root) if local_name(child.tag) not in {'defs'}]
    for child in list(root):
        if local_name(child.tag) not in {'defs'}:
            root.remove(child)

    body_group = ET.SubElement(root, f'{{{SVG_NS}}}g', {'id': f'{namespace}_body', 'data-role': 'body'})
    housing_group = ET.SubElement(body_group, f'{{{SVG_NS}}}g', {'id': f'{namespace}_housing', 'data-role': 'housing'})
    outline_group = ET.SubElement(housing_group, f'{{{SVG_NS}}}g', {'id': f'{namespace}_outline', 'data-role': 'outline'})
    active_group = ET.SubElement(outline_group, f'{{{SVG_NS}}}g', {'id': f'{namespace}_{slug(active_part)}', 'data-role': active_part})
    vector_index = 0

    def paint(element: ET.Element) -> None:
        nonlocal vector_index
        if local_name(element.tag) in VECTOR_TAGS:
            if element.attrib.get('fill') == 'none':
                element.set('stroke', outline if vector_index % 2 == 0 else accent)
            else:
                element.set('fill', body if vector_index % 3 == 0 else secondary if vector_index % 3 == 1 else accent)
                if 'stroke' in element.attrib:
                    element.set('stroke', outline)
            vector_index += 1
        for child in list(element):
            paint(child)

    for index, child in enumerate(drawable):
        target = active_group if index == len(drawable) - 1 else outline_group
        target.append(child)
        paint(child)

    root.set('data-style', 'colored')
    root.set('data-modified', 'true')
    root.set('data-palette', 'industrial')
    root.set('data-license', 'public-domain')
    view_box, width, height = sanitizer.view_box(root)
    root.set('viewBox', view_box)
    ET.register_namespace('', SVG_NS)
    return ET.tostring(root, encoding='utf-8', xml_declaration=True), view_box, width, height


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--target', type=Path, required=True)
    parser.add_argument('--catalog', type=Path, required=True)
    args = parser.parse_args()

    sanitizer = load_sanitizer()
    target = args.target.resolve()
    target.mkdir(parents=True, exist_ok=True)
    entries: List[dict] = []
    for item in ITEMS:
        source_file = (args.source_dir / item['downloadedFile']).resolve()
        if args.source_dir.resolve() not in source_file.parents or not source_file.is_file():
            raise ValueError(f'arquivo SVG ausente: {source_file}')
        raw = source_file.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        symbol_hash = hashlib.sha256(item['id'].encode('utf-8')).hexdigest()[:12]
        namespace = f'sym_{symbol_hash}'
        sanitized, view_box, width, height = sanitizer.sanitize_svg(raw, namespace)
        colored, view_box, width, height = colorize(sanitized, namespace, item['activePart'])
        if item.get('viewBoxOverride'):
            override = item['viewBoxOverride']
            values = [float(value) for value in override.split()]
            root = ET.fromstring(colored)
            root.set('viewBox', override)
            root.set('width', f'{values[2]}px')
            root.set('height', f'{values[3]}px')
            colored = ET.tostring(root, encoding='utf-8', xml_declaration=True)
            view_box, width, height = override, values[2], values[3]
        destination = target / item['file']
        destination.write_bytes(colored)
        aspect = width / height
        max_dimension = 96.0
        default_width = round(max_dimension if aspect >= 1 else max_dimension * aspect)
        default_height = round(max_dimension / aspect if aspect >= 1 else max_dimension)
        entries.append({
            'id': item['id'],
            'name': item['name'],
            'originalName': item['originalName'],
            'category': 'Motores',
            'keywords': item['keywords'],
            'synonyms': item['synonyms'],
            'source': 'openclipart',
            'library': 'Openclipart',
            'sourceUrl': item['sourceUrl'],
            'downloadUrl': item['downloadUrl'],
            'author': item['author'],
            'license': 'Public Domain',
            'modified': True,
            'sanitized': True,
            'originalSvgSha256': digest,
            'sourceFile': item['file'],
            'svg': f'library/assets/modules/motores/openclipart/{item["file"]}',
            'style': 'monochrome',
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
                'animatedParts': [item['activePart']],
            },
        })
    args.catalog.write_text(json.dumps({'entries': entries}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported exactly {len(entries)} Openclipart motor SVGs into {target}')


if __name__ == '__main__':
    main()
