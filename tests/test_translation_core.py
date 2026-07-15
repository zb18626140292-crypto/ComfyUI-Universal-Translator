import json
import tempfile
import unittest
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from translation_core import atomic_write_json, load_bundle, load_config, merge_dict


class TranslationCoreTests(unittest.TestCase):
    def test_curated_easy_use_node_is_loaded(self):
        bundle = load_bundle(ROOT, "zh-CN")
        entry = bundle["Nodes"]["easy loadImagesForLoop"]
        self.assertEqual(entry["title"], "加载循环图像")
        self.assertEqual(entry["widgets"]["directory"], "目录")
        self.assertGreater(bundle["meta"]["dictionary_nodes"], 7000)

    def test_override_wins_without_deleting_sections(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "locales/zh-CN/Nodes").mkdir(parents=True)
            (root / "locales/zh-CN/Categories").mkdir(parents=True)
            (root / "locales/zh-CN/Menus").mkdir(parents=True)
            (root / "locales/zh-CN/Nodes/base.json").write_text(
                json.dumps({"Demo": {"title": "旧标题", "inputs": {"image": "图像"}}}),
                encoding="utf-8",
            )
            atomic_write_json(root / "user/overrides.json", {"Demo": {"title": "新标题"}})
            entry = load_bundle(root)["Nodes"]["Demo"]
            self.assertEqual(entry["title"], "新标题")
            self.assertEqual(entry["inputs"]["image"], "图像")

    def test_config_defaults_survive_partial_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atomic_write_json(root / "config.json", {"enabled": False, "unknown": 1})
            config = load_config(root)
            self.assertFalse(config["enabled"])
            self.assertTrue(config["auto_translate_unknown"])
            self.assertNotIn("unknown", config)

    def test_recursive_merge(self):
        target = {"a": {"x": 1}, "b": 2}
        merge_dict(target, {"a": {"y": 3}, "b": 4})
        self.assertEqual(target, {"a": {"x": 1, "y": 3}, "b": 4})


if __name__ == "__main__":
    unittest.main()

