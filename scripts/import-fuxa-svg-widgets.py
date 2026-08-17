#!/usr/bin/env python3
"""Import and sanitize a curated FUXA-SVG-Widgets selection.

The source directory is always supplied explicitly. This script only writes
inside the explicitly supplied target directory and never deletes files.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse


SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
UNSAFE_TAGS = {
    "script",
    "foreignobject",
    "animate",
    "animatemotion",
    "animatetransform",
    "set",
}
UNSAFE_TEXT = re.compile(
    r"(?:javascript\s*:|postValue|putValue|\beval\s*\(|XMLHttpRequest|WebSocket|fetch\s*\(|https?://)",
    re.IGNORECASE,
)
EXTERNAL_URL = re.compile(r"url\(\s*(['\"]?)(?!#)([^)]+?)\1\s*\)", re.IGNORECASE)
VIEWBOX = re.compile(r"^\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*$")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def is_external_reference(value: str) -> bool:
    parsed = urlparse(value.strip())
    return bool(parsed.scheme or parsed.netloc) and not value.strip().startswith("data:image/")


def sanitize_svg(raw: bytes, source_name: str) -> tuple[bytes, str, int]:
    text = raw.decode("utf-8")
    if "<!DOCTYPE" in text.upper() or "<!ENTITY" in text.upper() or "<?XML-STYLESHEET" in text.upper():
        raise ValueError("DTD, entity or external stylesheet declaration is not allowed")

    try:
        root = ET.fromstring(raw)
    except ET.ParseError as error:
        raise ValueError(f"invalid XML: {error}") from error

    if local_name(root.tag) != "svg":
        raise ValueError("root element is not svg")
    view_box = root.attrib.get("viewBox")
    if not view_box or not VIEWBOX.match(view_box):
        raise ValueError("missing or invalid viewBox")

    removed = 0

    def clean(parent: ET.Element) -> None:
        nonlocal removed
        for child in list(parent):
            if local_name(child.tag) in UNSAFE_TAGS or local_name(child.tag) == "image":
                parent.remove(child)
                removed += 1
                continue
            clean(child)

        for attribute in list(parent.attrib):
            name = local_name(attribute)
            value = parent.attrib[attribute]
            if name.startswith("on"):
                del parent.attrib[attribute]
                removed += 1
                continue
            if name == "href":
                if value.strip().startswith("#"):
                    continue
                del parent.attrib[attribute]
                removed += 1
                continue
            if name == "style":
                if "@import" in value.lower() or EXTERNAL_URL.search(value):
                    del parent.attrib[attribute]
                    removed += 1
                    continue
            if EXTERNAL_URL.search(value):
                value = EXTERNAL_URL.sub("", value)
                if not value.strip():
                    del parent.attrib[attribute]
                    removed += 1
                else:
                    parent.attrib[attribute] = value
                continue
            if name in {"href", "src"} and is_external_reference(value):
                del parent.attrib[attribute]
                removed += 1

    clean(root)
    serialized = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    check_text = serialized.decode("utf-8").replace(SVG_NS, "").replace(XLINK_NS, "")
    if UNSAFE_TEXT.search(check_text):
        raise ValueError("unsafe content remains after sanitization")

    visual_tags = {"path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "use", "g"}
    if not any(local_name(element.tag) in visual_tags for element in root.iter()):
        raise ValueError("no visual SVG elements remain after sanitization")

    return serialized, view_box, removed


def git_revision(source: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(source), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--target", required=True, type=Path)
    parser.add_argument("--license", required=True, type=Path)
    args = parser.parse_args()

    source = args.source.resolve()
    manifest_path = args.manifest.resolve()
    target = args.target.resolve()
    license_path = args.license.resolve()
    entries = json.loads(manifest_path.read_text(encoding="utf-8"))["entries"]
    target.mkdir(parents=True, exist_ok=True)
    revision = git_revision(source)
    accepted = 0
    rejected = 0
    accepted_entries = []

    for entry in entries:
        source_path = (source / entry["sourcePath"]).resolve()
        output_path = (target / entry["assetPath"]).resolve()
        try:
            source_path.relative_to(source)
            output_path.relative_to(target)
            raw = source_path.read_bytes()
            sanitized, view_box, removed = sanitize_svg(raw, entry["sourcePath"])
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(sanitized)
            numbers = [float(value) for value in view_box.split()]
            accepted_entries.append({
                **entry,
                "viewBox": view_box,
                "originalAspectRatio": numbers[2] / numbers[3],
            })
            print(f"ACCEPTED {entry['id']} viewBox={view_box} removed={removed} source={entry['sourcePath']}")
            accepted += 1
        except (OSError, ValueError, KeyError) as error:
            print(f"REJECTED {entry.get('id', entry.get('sourcePath', '<unknown>'))}: {error}", file=sys.stderr)
            rejected += 1

    if not license_path.is_file():
        print(f"REJECTED license: file not found: {license_path}", file=sys.stderr)
        rejected += 1
    else:
        (target / "LICENSE.txt").write_text(license_path.read_text(encoding="utf-8"), encoding="utf-8")

    (target / "catalog.json").write_text(
        json.dumps(
            {"sourceCommit": revision, "entries": accepted_entries},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"FUXA import complete: accepted={accepted} rejected={rejected} source_commit={revision}")
    return 1 if rejected else 0


if __name__ == "__main__":
    raise SystemExit(main())
