import assert from "node:assert/strict";
import { restoreNodeTranslation, restoreTranslatedLabel } from "../web/label_state.js";
import {
  buildAutoNodeTranslation,
  resolveNodeTranslation,
  translateCategory,
  translateIdentifier,
  translateNaturalTitle,
} from "../web/translator.js";

assert.equal(translateIdentifier("Custom Data Reader"), "自定义数据读取器");
assert.equal(translateIdentifier("preview_image"), "预览图像");
assert.equal(translateIdentifier("lora_names"), "LoRA 名称");
assert.equal(translateIdentifier("download_link"), "下载链接");
assert.equal(translateIdentifier("initial_value1"), "初始值 1");
assert.equal(translateIdentifier("triggerwords"), "LoRA 触发词");
assert.equal(translateIdentifier("trigger_words"), "触发词");
assert.equal(translateIdentifier("LoRA Trigger Words"), "LoRA 触发词");
assert.equal(translateIdentifier("return_with_leftover_noise"), "携带剩余噪声返回");
assert.equal(translateIdentifier("grow_mask_by"), "遮罩扩展量");
assert.equal(translateIdentifier("start_percent"), "起始百分比");
assert.equal(translateIdentifier("Qwen3ASRBatchTranscribe"), "Qwen3ASR \u6279\u6b21\u8f6c\u5f55");
assert.equal(translateIdentifier("Chat completion _O"), "\u5bf9\u8bdd\u8865\u5168 O");
assert.equal(translateNaturalTitle("ZEngineerCLIPLoader"), "ZEngineerCLIPLoader");
assert.equal(translateNaturalTitle("KSamplerAdvanced"), "KSamplerAdvanced");
assert.equal(translateNaturalTitle("load_image_batch"), "load_image_batch");
assert.equal(translateNaturalTitle("VisualLoRALoader"), "可视化LoRA加载器");
assert.equal(translateNaturalTitle("Load Image From Folder"), "\u52a0\u8f7d\u56fe\u50cf\u4ece\u6587\u4ef6\u5939");
assert.equal(
  translateNaturalTitle("Z-Engineer CLIP Loader (Safetensors / Shards)", "ZEngineerCLIPLoader"),
  "ZEngineerCLIPLoader",
);
assert.equal(translateIdentifier("string_1"), "字符串_1");
assert.equal(translateIdentifier("string_2"), "字符串_2");
assert.equal(translateIdentifier("string_10"), "字符串_10");
assert.equal(translateIdentifier("inputcount"), "输入数量");
assert.equal(translateIdentifier("delimiter"), "分隔符");
assert.equal(translateIdentifier("return_list"), "返回列表");
assert.equal(translateIdentifier("NaibaTextbox"), "naiba文本盒");
assert.equal(translateIdentifier("NaibaWANBlockSwap"), "naibawan模型分块卸载节点");
assert.equal(translateIdentifier("LoRALoader"), "LoRA加载器");
assert.equal(translateIdentifier("VisualLoRALoader"), "可视化LoRA加载器");
assert.equal(translateIdentifier("VisualModelLoader"), "可视化模型加载器");
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

const naturalizedCurated = resolveNodeTranslation("ImageResize", {
  name: "ImageResize",
  display_name: "Image Resize",
  input: { required: { scale_by: ["FLOAT", {}] } },
  output_name: ["IMAGE"],
}, {
  ImageResize: { title: "Image Resize", inputs: { scale_by: "scale_by" } },
}, true);
assert.equal(naturalizedCurated.title, "图像缩放");
assert.equal(naturalizedCurated.inputs.scale_by, "按比例缩放");

const persistedSlot = {
  name: "trigger_words",
  localized_name: "trigger_words",
  label: "LoRA \u89e6\u53d1\u8bcd",
};
assert.equal(restoreTranslatedLabel(persistedSlot), true);
assert.equal("label" in persistedSlot, false);

const runtimeSlot = {
  name: "preview_image",
  label: "\u9884\u89c8\u56fe\u50cf",
  __utOriginalLabel: "Preview Image",
  __utApplied: true,
};
assert.equal(restoreTranslatedLabel(runtimeSlot), true);
assert.equal(runtimeSlot.label, "Preview Image");
assert.equal("__utApplied" in runtimeSlot, false);

let dirtyCalls = 0;
const restoredCount = restoreNodeTranslation({
  inputs: [{ name: "model_info", label: "\u6a21\u578b\u4fe1\u606f" }],
  outputs: [{ name: "raw_json", label: "\u539f\u59cb JSON" }],
  widgets: [{ name: "rating", label: "rating \u4fe1\u606f" }],
  setDirtyCanvas: () => { dirtyCalls += 1; },
});
assert.equal(restoredCount, 3);
assert.equal(dirtyCalls, 1);

const persistedBrand = { name: "vae", localized_name: "vae", label: "VAE" };
assert.equal(restoreTranslatedLabel(persistedBrand), true);
assert.equal("label" in persistedBrand, false);

const translatedTitleNode = {
  title: "\u81ea\u5b9a\u4e49\u6570\u636e\u8bfb\u53d6\u5668",
  inputs: [],
  outputs: [],
  widgets: [],
};
assert.equal(restoreNodeTranslation(translatedTitleNode, {
  originalTitle: "Custom Data Reader",
  translatedTitles: ["\u81ea\u5b9a\u4e49\u6570\u636e\u8bfb\u53d6\u5668"],
}), 1);
assert.equal(translatedTitleNode.title, "Custom Data Reader");

const disabledKSampler = {
  title: "K\u91c7\u6837\u5668(\u9ad8\u7ea7)",
  inputs: [{ name: "model", localized_name: "\u6a21\u578b" }],
  outputs: [{ name: "LATENT", localized_name: "Latent" }],
  widgets: [{
    name: "return_with_leftover_noise",
    label: "return \u4e0e leftover \u566a\u58f0",
  }],
};
restoreNodeTranslation(disabledKSampler, {
  forceOriginal: true,
  originalTitle: "KSamplerAdvanced",
});
assert.equal(disabledKSampler.title, "KSamplerAdvanced");
assert.equal(disabledKSampler.inputs[0].label, "model");
assert.equal(disabledKSampler.outputs[0].label, "LATENT");
assert.equal(disabledKSampler.widgets[0].label, "return_with_leftover_noise");

console.log("translator tests passed");
