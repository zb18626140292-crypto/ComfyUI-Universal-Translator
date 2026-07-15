"""Pure-Python translation storage helpers.

This module intentionally has no ComfyUI imports so it can be tested on its own.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


DEFAULT_CONFIG: dict[str, Any] = {
    "enabled": True,
    "locale": "zh-CN",
    "auto_translate_unknown": True,
    "translate_menus": True,
    "show_floating_button": True,
}


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return json.loads(path.read_text(encoding=encoding))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    return default


def merge_dict(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """Recursively merge *overlay* into *base* and return *base*."""
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merge_dict(base[key], value)
        else:
            base[key] = value
    return base


def merge_json_directory(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {}
    if not path.exists():
        return result
    for json_path in sorted(path.glob("*.json"), key=lambda p: p.name.casefold()):
        data = read_json(json_path, {})
        if isinstance(data, dict):
            merge_dict(result, data)
    return result


def load_config(root: Path) -> dict[str, Any]:
    config = dict(DEFAULT_CONFIG)
    stored = read_json(root / "config.json", {})
    if isinstance(stored, dict):
        config.update({key: stored[key] for key in DEFAULT_CONFIG if key in stored})
    return config


def load_bundle(root: Path, locale: str = "zh-CN") -> dict[str, Any]:
    locale_root = root / "locales" / locale
    nodes = merge_json_directory(locale_root / "Nodes")
    categories = merge_json_directory(locale_root / "Categories")
    menus = merge_json_directory(locale_root / "Menus")

    overrides = read_json(root / "user" / "overrides.json", {})
    if isinstance(overrides, dict):
        for class_name, translation in overrides.items():
            if not isinstance(translation, dict):
                continue
            current = nodes.setdefault(class_name, {})
            if isinstance(current, dict):
                merge_dict(current, translation)
            else:
                nodes[class_name] = translation

    return {
        "Nodes": nodes,
        "NodeCategory": categories,
        "Menu": menus,
        "meta": {
            "locale": locale,
            "dictionary_nodes": len(nodes),
            "user_overrides": len(overrides) if isinstance(overrides, dict) else 0,
        },
    }


def atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(temporary, path)

