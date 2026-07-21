# ComfyUI 全节点翻译器

这是一个面向本机 ComfyUI 的中文翻译插件。它先使用人工校对词典；当新节点、私有节点或第三方节点不在词典中时，再根据节点在 `/object_info` 中公开的定义实时生成中文标题、输入、输出、控件和分类标签。

## 与普通汉化插件的区别

- 覆盖本机全部已注册节点，不依赖插件作者预先提供翻译文件。
- 内置约 8,000 条人工节点译文，人工译文优先。
- 未知第三方节点由本地术语引擎补全，不调用网络、不上传工作流、不需要 API Key。
- 管理面板会显示“人工词典 / 自动补全”来源，可搜索 3,000+ 节点并修改标题。
- 手工修改保存在 `user/overrides.json`，升级词典时不会被覆盖。
- 只修改前端显示标签，不改变工作流里的节点类名、输入键名和连线结构。

## 安装

1. 先停掉 ComfyUI。
2. 卸载或禁用其他节点汉化插件，尤其是 `ComfyUI-Chinese-Translation` 和 `AIGODLIKE-ComfyUI-Translation`，避免两个插件同时改同一标签。
3. 将整个 `ComfyUI-Universal-Translator` 文件夹复制到：

   `ComfyUI/custom_nodes/ComfyUI-Universal-Translator`

4. 重启 ComfyUI，然后浏览器执行一次强制刷新（`Ctrl+F5`）。

右下角会出现“🌐 全节点翻译”按钮。按钮可用鼠标或触摸拖到任意不遮挡操作的位置，并会记住位置；点击后打开管理面板。面板标题栏提供“翻译开启 / 翻译关闭”总开关，切换后会自动刷新页面生效；关闭翻译时管理按钮仍会保留，方便随时重新开启。面板会直接读取当前 ComfyUI 的 `/object_info`，展示节点总数、人工词典命中数和自动补全数。

## 图中两个节点的结果

`easy loadImagesForLoop` 使用人工词典：

- Load Images For Loop → 加载循环图像
- directory → 目录
- start_index → 起始索引
- initial_value1 → 初始值1
- flow / image / mask → 流 / 图像 / 遮罩

`CustomDataReader` 不在原词典中，使用自动补全：

- Custom Data Reader → 自定义数据读取器
- lora_names → LoRA 名称
- preview_image → 预览图像
- custom_prompt → 自定义提示词
- model_description → 模型描述
- download_link → 下载链接
- nsfw_level → NSFW 级别
- raw_json → 原始 JSON

## 设置与手工修正

在 ComfyUI 设置中搜索“全节点翻译”，可以：

- 开关全部翻译；
- 开关未知节点自动翻译；
- 显示或隐藏右下角管理按钮。

在管理面板中修改中文标题后点击“保存”，再点“刷新页面并应用”。端口和控件的高级修正可直接编辑 `user/overrides.json`：

```json
{
  "CustomDataReader": {
    "title": "自定义数据读取器",
    "inputs": { "lora_names": "LoRA 名称" },
    "outputs": { "raw_json": "原始 JSON" },
    "widgets": { "lora_names": "LoRA 名称" }
  }
}
```

## 边界说明

“覆盖所有节点”表示每个由 ComfyUI 正常注册、能出现在 `/object_info` 中的节点都会进入翻译流程。模型名、算法缩写、品牌名和无法可靠判断语义的专有名词会保留原文，避免把 `LoRA`、`VAE`、`KSampler` 等技术名词误译。节点内部自行绘制的图片文字或封闭 Shadow DOM 不属于标准节点标签，需由对应插件单独适配。

## 更新记录

- 1.0.1：将 `triggerwords` 译为“LoRA 触发词”，并补上第三方节点运行时动态创建端口的自动翻译。
- 1.0.2：管理按钮支持拖动并记住位置；新增 `NaibaTextbox` 与 `NaibaWANBlockSwap` 的人工中文标题。
- 1.0.3：管理面板标题栏新增翻译总开关；关闭翻译后仍保留管理按钮，可直接重新开启。
- 1.0.4：修复关闭翻译后，工作流中已保存的中文端口和控件标签仍然显示的问题。
- 1.0.5：修复 `return_with_leftover_noise` 的中英混合翻译；自动翻译仅在全部词元可识别时应用，避免同类半翻译；关闭翻译时立即恢复当前画布标签。
- 1.0.6：关闭翻译时强制使用节点原始 `name`，不再回退到 ComfyUI 的 `localized_name`；`return_with_leftover_noise` 等端口、控件和节点标题全部显示原文。
- 1.0.7：将 `VisualLoRALoader` 精确翻译为“LoRA加载器”，并修复 `LoRA` 在混合大小写节点名中的拆词问题。
- 1.0.8：增加可组合术语公式：`Visual` →“可视化”、`LoRALoader` →“LoRA加载器”；`VisualLoRALoader` 显示为“可视化LoRA加载器”，其他类似节点沿用相同组合规则。
- 1.0.9：按当前电脑安装的节点补充高频自然语言术语；统一动态编号字段（如 `string_1` →“字符串_1”）；运行时持续同步第三方插件后创建或重写的控件标签。
