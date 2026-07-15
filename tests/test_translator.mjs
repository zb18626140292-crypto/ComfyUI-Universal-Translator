import assert from "node:assert/strict";
import {
  buildAutoNodeTranslation,
  resolveNodeTranslation,
  translateCategory,
  translateIdentifier,
} from "../web/translator.js";

assert.equal(translateIdentifier("Custom Data Reader"), "自定义数据读取器");
assert.equal(translateIdentifier("preview_image"), "预览图像");
assert.equal(translateIdentifier("lora_names"), "LoRA 名称");
assert.equal(translateIdentifier("download_link"), "下载链接");
assert.equal(translateIdentifier("initial_value1"), "初始值 1");
assert.equal(translateIdentifier("triggerwords"), "LoRA 触发词");
assert.equal(translateIdentifier("trigger_words"), "触发词");
assert.equal(translateIdentifier("LoRA Trigger Words"), "LoRA 触发词");
assert.equal(translateCategory("naiba-node"), "naiba 节点");

const customDataReader = {
  name: "CustomDataReader",
  display_name: "Custom Data Reader",
  input: { required: {}, optional: { lora_names: ["STRING", {}] } },
  output_name: ["preview_image", "custom_prompt", "model_description", "download_link", "nsfw_level", "raw_json"],
};
const generated = buildAutoNodeTranslation(customDataReader);
assert.equal(generated.title, "自定义数据读取器");
assert.equal(generated.inputs.lora_names, "LoRA 名称");
assert.equal(generated.outputs.raw_json, "原始 JSON");

const resolved = resolveNodeTranslation("CustomDataReader", customDataReader, {}, true);
assert.equal(resolved._source, "auto");
assert.equal(resolved.outputs.model_description, "模型描述");

const curated = resolveNodeTranslation("CustomDataReader", customDataReader, {
  CustomDataReader: { title: "我的读取器", outputs: { raw_json: "原始数据" } },
}, true);
assert.equal(curated._source, "dictionary");
assert.equal(curated.title, "我的读取器");
assert.equal(curated.outputs.preview_image, "预览图像");
assert.equal(curated.outputs.raw_json, "原始数据");

console.log("translator tests passed");
