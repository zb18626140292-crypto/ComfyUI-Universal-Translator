"""ComfyUI Universal Translator backend."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from aiohttp import web
from server import PromptServer

from .translation_core import (
    DEFAULT_CONFIG,
    atomic_write_json,
    load_bundle,
    load_config,
    read_json,
)


VERSION = "1.0.4"
ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
OVERRIDES_PATH = ROOT / "user" / "overrides.json"
_write_lock = asyncio.Lock()


def json_response(data: Any, status: int = 200) -> web.Response:
    return web.Response(
        text=json.dumps(data, ensure_ascii=False),
        status=status,
        content_type="application/json",
        charset="utf-8",
    )


async def request_data(request: web.Request) -> dict[str, Any]:
    if request.content_type == "application/json":
        data = await request.json()
        return data if isinstance(data, dict) else {}
    form = await request.post()
    return dict(form)


@PromptServer.instance.routes.get("/universal_translation/config")
async def get_config(_request: web.Request) -> web.Response:
    return json_response(load_config(ROOT))


@PromptServer.instance.routes.post("/universal_translation/config")
async def set_config(request: web.Request) -> web.Response:
    incoming = await request_data(request)
    current = load_config(ROOT)
    for key, default in DEFAULT_CONFIG.items():
        if key not in incoming:
            continue
        value = incoming[key]
        if isinstance(default, bool):
            if isinstance(value, str):
                value = value.lower() in {"1", "true", "yes", "on"}
            else:
                value = bool(value)
        elif not isinstance(value, type(default)):
            continue
        current[key] = value
    async with _write_lock:
        atomic_write_json(CONFIG_PATH, current)
    return json_response({"ok": True, "config": current})


@PromptServer.instance.routes.get("/universal_translation/translations")
async def get_translations(request: web.Request) -> web.Response:
    config = load_config(ROOT)
    locale = request.query.get("locale", config["locale"])
    if not config["enabled"]:
        return json_response({
            "Nodes": {}, "NodeCategory": {}, "Menu": {},
            "meta": {"locale": locale, "dictionary_nodes": 0, "user_overrides": 0},
        })
    return json_response(load_bundle(ROOT, locale))


@PromptServer.instance.routes.get("/universal_translation/overrides")
async def get_overrides(_request: web.Request) -> web.Response:
    data = read_json(OVERRIDES_PATH, {})
    return json_response(data if isinstance(data, dict) else {})


def validate_translation(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("translation 必须是 JSON 对象")
    allowed = {"title", "description", "inputs", "outputs", "widgets"}
    clean: dict[str, Any] = {}
    for key, item in value.items():
        if key not in allowed:
            continue
        if key in {"title", "description"}:
            if not isinstance(item, str) or len(item) > 4000:
                raise ValueError(f"{key} 必须是合理长度的文本")
            clean[key] = item.strip()
        elif isinstance(item, dict):
            clean[key] = {
                str(k)[:256]: str(v)[:1000]
                for k, v in item.items()
                if isinstance(v, (str, int, float))
            }
    return clean


@PromptServer.instance.routes.post("/universal_translation/override")
async def save_override(request: web.Request) -> web.Response:
    try:
        incoming = await request_data(request)
        class_name = str(incoming.get("class_name", "")).strip()
        if not class_name or len(class_name) > 256:
            raise ValueError("class_name 无效")
        translation = validate_translation(incoming.get("translation"))
        async with _write_lock:
            overrides = read_json(OVERRIDES_PATH, {})
            if not isinstance(overrides, dict):
                overrides = {}
            if translation is None:
                overrides.pop(class_name, None)
            else:
                overrides[class_name] = translation
            atomic_write_json(OVERRIDES_PATH, overrides)
        return json_response({"ok": True, "class_name": class_name})
    except (ValueError, json.JSONDecodeError) as exc:
        return json_response({"ok": False, "error": str(exc)}, status=400)


NODE_CLASS_MAPPINGS = {}
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "WEB_DIRECTORY"]
__version__ = VERSION
