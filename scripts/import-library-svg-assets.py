#!/usr/bin/env python3
"""Import a curated set of MIT SVGs into the plugin as sanitized local assets.

The importer is intentionally stdlib-only so the catalogue can be regenerated
offline from pinned source checkouts. It never writes outside --target.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Iterable, List, Tuple


SOURCES = {
    'tabler-icons': {
        'library': 'Tabler Icons',
        'url': 'https://github.com/tabler/tabler-icons',
        'commit': '183e715d5a81ba1959e285f69c08235fe34b04ce',
        'license': 'MIT',
    },
    'phosphor-core': {
        'library': 'Phosphor Icons core',
        'url': 'https://github.com/phosphor-icons/core',
        'commit': '2b75f3ad12b420c9504ef05df8d2564a28f8500e',
        'license': 'MIT',
    },
    'bootstrap-icons': {
        'library': 'Bootstrap Icons',
        'url': 'https://github.com/twbs/icons',
        'commit': '6945b7006285d444cc17ff2e22c7691719229526',
        'license': 'MIT',
    },
    'iconoir': {
        'library': 'Iconoir',
        'url': 'https://github.com/iconoir-icons/iconoir',
        'commit': 'd7dfa4d0341df0670bfed9fc24221c9d7ef2112e',
        'license': 'MIT',
    },
    'heroicons': {
        'library': 'Heroicons',
        'url': 'https://github.com/tailwindlabs/heroicons',
        'commit': '616b7a4dbbf3d011760af8066262cd5c6b3868f3',
        'license': 'MIT',
    },
}

UNSAFE_TAGS = {
    'script', 'foreignobject', 'iframe', 'object', 'embed', 'image',
    'audio', 'video', 'canvas', 'animate', 'animatemotion',
    'animatetransform', 'set', 'style', 'link',
}
UNSAFE_TEXT = re.compile(
    r'(?:javascript\s*:|vbscript\s*:|data\s*:[^,]+,|@import|'
    r'postmessage|postvalue|putvalue|dangerouslysetinnerhtml|eval\s*\()',
    re.IGNORECASE,
)
EXTERNAL_REF = re.compile(r'^(?:https?:|data:|//|javascript:)', re.IGNORECASE)
ID_REF = re.compile(r'url\(#([^)]+)\)|(?<![\w-])#([A-Za-z_][\w:.-]*)')


def local_name(tag: str) -> str:
    return tag.rsplit('}', 1)[-1].lower()


def attr_local_name(name: str) -> str:
    return name.rsplit('}', 1)[-1].lower()


def numeric(value: str | None) -> float | None:
    if not value:
        return None
    match = re.match(r'^\s*(-?(?:\d+(?:\.\d*)?|\.\d+))', value)
    return float(match.group(1)) if match else None


def view_box(root: ET.Element) -> Tuple[str, float, float]:
    raw = root.attrib.get('viewBox') or root.attrib.get('viewbox')
    values = [float(value) for value in re.split(r'[\s,]+', raw.strip())] if raw else []
    if len(values) == 4 and values[2] > 0 and values[3] > 0:
        return f'{values[0]:g} {values[1]:g} {values[2]:g} {values[3]:g}', values[2], values[3]
    width = numeric(root.attrib.get('width'))
    height = numeric(root.attrib.get('height'))
    if width and height and width > 0 and height > 0:
        return f'0 0 {width:g} {height:g}', width, height
    raise ValueError('SVG sem viewBox e sem dimensões numéricas')


def safe_attribute(name: str, value: str) -> bool:
    lname = attr_local_name(name)
    if lname.startswith('on') or lname in {'href', 'src', 'action', 'formaction', 'ping', 'font-family'}:
        return False
    if lname == 'style' and UNSAFE_TEXT.search(value):
        return False
    if EXTERNAL_REF.search(value) or UNSAFE_TEXT.search(value) or re.search(r'url\s*\((?!#)', value, re.IGNORECASE):
        # Local paint references such as url(#gradient) are safe and retained.
        if re.fullmatch(r'url\(#[^)]+\)', value.strip()):
            return True
        return False
    return True


def sanitize_svg(raw: bytes, namespace: str) -> Tuple[bytes, str, float, float]:
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
    root = ET.fromstring(raw)
    if local_name(root.tag) != 'svg':
        raise ValueError('raiz SVG inválida')

    replacements: Dict[str, str] = {}
    for element in root.iter():
        if 'id' in element.attrib:
            old = element.attrib['id']
            replacements[old] = f'{namespace}_{old}'
            element.attrib['id'] = replacements[old]

    def clean(parent: ET.Element) -> None:
        for child in list(parent):
            if local_name(child.tag) in UNSAFE_TAGS:
                parent.remove(child)
                continue
            for key in list(child.attrib):
                if not safe_attribute(key, child.attrib[key]):
                    del child.attrib[key]
            if child.text and UNSAFE_TEXT.search(child.text):
                raise ValueError('texto SVG potencialmente executável')
            clean(child)

    for key in list(root.attrib):
        if not safe_attribute(key, root.attrib[key]):
            del root.attrib[key]
    clean(root)

    for element in root.iter():
        for key, value in list(element.attrib.items()):
            def replace(match: re.Match[str]) -> str:
                old = match.group(1) or match.group(2)
                new = replacements.get(old, old)
                return f'url(#{new})' if match.group(1) else f'#{new}'
            element.attrib[key] = ID_REF.sub(replace, value)
        if element.tail and UNSAFE_TEXT.search(element.tail):
            raise ValueError('texto SVG potencialmente executável')

    vb, width, height = view_box(root)
    root.set('viewBox', vb)
    serialized = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    serialized_text = serialized.decode('utf-8', errors='strict')
    if re.search(
        r'(?:javascript\s*:|vbscript\s*:|data\s*:[^,]+,|@import|url\s*\((?!#)|'
        r'postmessage|postvalue|putvalue|dangerouslysetinnerhtml|eval\s*\()',
        serialized_text,
        re.IGNORECASE,
    ):
        raise ValueError('referência externa ou código removido incompletamente')
    return serialized, vb, width, height


def slug(value: str) -> str:
    value = re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')
    return value or 'simbolo'


def humanize(value: str) -> str:
    value = re.sub(r'[-_]+', ' ', value.rsplit('/', 1)[-1].rsplit('.', 1)[0])
    return value[:1].upper() + value[1:]


def parse_roots(values: Iterable[str]) -> Dict[str, Path]:
    roots: Dict[str, Path] = {}
    for value in values:
        source, separator, path = value.partition('=')
        if not separator or source not in SOURCES:
            raise ValueError(f'--source-root inválido: {value}')
        roots[source] = Path(path).resolve()
    return roots


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--target', type=Path, required=True)
    parser.add_argument('--source-root', action='append', default=[])
    args = parser.parse_args()

    roots = parse_roots(args.source_root)
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    entries = manifest.get('entries', [])
    target = args.target.resolve()
    if target.exists():
        for child in target.iterdir():
            if child.name not in {'catalog.json', 'LICENSES'}:
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
    target.mkdir(parents=True, exist_ok=True)
    (target / 'LICENSES').mkdir(exist_ok=True)

    output: List[dict] = []
    seen_ids = set()
    seen_files = set()
    seen_hashes = set()
    category_names = set()
    for item in entries:
        source = item['source']
        source_path = item['sourcePath']
        if source not in SOURCES or source not in roots:
            raise ValueError(f'Fonte não declarada ou não fornecida: {source}')
        source_file = (roots[source] / source_path).resolve()
        if roots[source] not in source_file.parents or not source_file.is_file():
            raise ValueError(f'Arquivo de origem inválido: {source_path}')
        symbol_id = f'{source}:{slug(source_path)}'
        if symbol_id in seen_ids or (source, source_path) in seen_files:
            raise ValueError(f'Duplicata de ID ou arquivo: {symbol_id}')
        seen_ids.add(symbol_id)
        seen_files.add((source, source_path))
        raw = source_file.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest in seen_hashes:
            raise ValueError(f'Conteúdo SVG duplicado: {source_path}')
        seen_hashes.add(digest)
        namespace = 'sym_' + hashlib.sha256(symbol_id.encode('utf-8')).hexdigest()[:12]
        sanitized, vb, width, height = sanitize_svg(raw, namespace)
        category_slug = slug(item['category'])
        destination = target / category_slug / source / f'{slug(source_path)}.svg'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(sanitized)
        aspect = width / height
        max_dimension = 96.0
        default_width = round(max_dimension if aspect >= 1 else max_dimension * aspect)
        default_height = round(max_dimension / aspect if aspect >= 1 else max_dimension)
        info = SOURCES[source]
        name = item.get('name') or humanize(source_path)
        category_name = (item['category'], name)
        if category_name in category_names:
            name = f'{name} ({info["library"]})'
        category_names.add(category_name)
        stem = source_path.rsplit('/', 1)[-1].rsplit('.', 1)[0]
        keywords = sorted(set([source, info['library'], item['category'], stem] + stem.replace('-', ' ').split()))
        synonyms = sorted(set(item.get('synonyms', []) + [name.lower(), stem.replace('-', ' ')]))
        output.append({
            'id': symbol_id,
            'name': name,
            'originalName': stem,
            'category': item['category'],
            'keywords': keywords,
            'synonyms': synonyms,
            'source': source,
            'library': info['library'],
            'sourceUrl': info['url'],
            'sourceCommit': info['commit'],
            'license': info['license'],
            'sourceFile': source_path,
            'svg': f'library/assets/expanded/{category_slug}/{source}/{slug(source_path)}.svg',
            'viewBox': vb,
            'dimensions': {'width': width, 'height': height},
            'originalAspectRatio': aspect,
            'defaultSize': {'width': default_width, 'height': default_height},
            'capabilities': {'fill': True, 'stroke': True, 'multistateReady': False},
        })

    for source, info in SOURCES.items():
        if source not in roots:
            continue
        license_file = roots[source] / 'LICENSE'
        if license_file.is_file():
            (target / 'LICENSES' / f'{source}.txt').write_text(
                f'{info["library"]}\nURL: {info["url"]}\nCommit: {info["commit"]}\n\n' +
                license_file.read_text(encoding='utf-8', errors='replace'),
                encoding='utf-8',
            )

    (target / 'catalog.json').write_text(
        json.dumps({'entries': output, 'sourceCommits': {key: SOURCES[key]['commit'] for key in roots}}, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    print(f'Imported {len(output)} sanitized SVGs into {target}')


if __name__ == '__main__':
    main()
