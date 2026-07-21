import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { restoreNodeTranslation } from "./label_state.js";
import { installTranslationPanel } from "./panel.js";
import { hasChinese, resolveNodeTranslation, translateCategory, translateIdentifier } from "./translator.js";

const state = {
  config: {
    enabled: true,
    locale: "zh-CN",
    auto_translate_unknown: true,
    translate_menus: true,
    show_floating_button: true,
  },
  bundle: { Nodes: {}, NodeCategory: {}, Menu: {}, meta: {} },
  resolved: new Map(),
};

function loadStyle() {
  if (document.getElementById("ut-style")) return;
  const link = document.createElement("link");
  link.id = "ut-style";
  link.rel = "stylesheet";
  link.href = new URL("./style.css", import.meta.url).href;
  document.head.appendChild(link);
}

async function fetchJSON(path, fallback) {
  try {
    const response = await api.fetchApi(path);
    return response.ok ? await response.json() : fallback;
  } catch (error) {
    console.warn(`[Universal Translator] ${path} 加载失败`, error);
    return fallback;
  }
}

async function saveConfig(patch) {
  const response = await api.fetchApi("/universal_translation/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...state.config, ...patch }),
  });
  if (!response.ok) throw new Error(`保存设置失败：HTTP ${response.status}`);
  const result = await response.json();
  state.config = result.config;
}

function addSettings(appInstance) {
  let registrationFinished = false;
  const settings = [
    {
      id: "UniversalTranslator.Enabled",
      name: "🌐 全节点翻译：启用",
      type: "boolean",
      defaultValue: state.config.enabled,
      onChange: async value => {
        if (!registrationFinished) return;
        await saveConfig({ enabled: value });
        if (!value) restoreAllNodes(appInstance);
        location.reload();
      },
    },
    {
      id: "UniversalTranslator.AutoUnknown",
      name: "🌐 全节点翻译：自动翻译未知第三方节点",
      tooltip: "关闭后只使用人工 JSON 词典；开启时新安装的节点也会立即获得中文标签。",
      type: "boolean",
      defaultValue: state.config.auto_translate_unknown,
      onChange: async value => { if (!registrationFinished) return; await saveConfig({ auto_translate_unknown: value }); location.reload(); },
    },
    {
      id: "UniversalTranslator.FloatingButton",
      name: "🌐 全节点翻译：显示管理按钮",
      type: "boolean",
      defaultValue: state.config.show_floating_button,
      onChange: async value => { if (!registrationFinished) return; await saveConfig({ show_floating_button: value }); location.reload(); },
    },
  ];
  for (const setting of settings) {
    try { appInstance.ui.settings.addSetting(setting); } catch (error) { console.warn("[Universal Translator] 设置注册失败", error); }
  }
  registrationFinished = true;
}

function classNameOf(node) {
  return node?.comfyClass || node?.constructor?.comfyClass || node?.type || node?.constructor?.type;
}

function setTranslatedLabel(item, translation) {
  if (!item || !translation) return false;
  const baseline = item.label || item.localized_name || item.name;
  if (translation === baseline) return false;
  const isNumberedDynamicSlot = /^.+[_-]\d+$/.test(item.name || "");
  if (baseline && hasChinese(baseline) && !item.__utApplied && !isNumberedDynamicSlot) return false;
  if (!item.__utOriginalLabel) item.__utOriginalLabel = item.label || item.name;
  item.label = translation;
  item.__utApplied = true;
  return true;
}

function automaticSlotLabel(name) {
  return state.config.auto_translate_unknown && name ? translateIdentifier(name) : null;
}

function restoreNode(node) {
  const className = classNameOf(node);
  const originalTitle = node?.properties?.["Node name for S&R"] || className;
  const translatedTitles = [
    state.bundle.Nodes?.[className]?.title,
    translateIdentifier(className),
  ];
  return restoreNodeTranslation(node, {
    forceOriginal: true,
    originalTitle,
    translatedTitles,
  });
}

function restoreAllNodes(appInstance) {
  let restored = 0;
  for (const node of appInstance.graph?._nodes || []) restored += restoreNode(node);
  appInstance.graph?.setDirtyCanvas?.(true, true);
  if (restored) console.info(`[Universal Translator] restored ${restored} original labels`);
  return restored;
}

function slotTranslation(resolved, section, item) {
  const name = item?.name;
  if (!name) return null;
  if (section === "inputs") {
    return resolved.inputs?.[name] || resolved.widgets?.[item.widget?.name] || automaticSlotLabel(name);
  }
  if (section === "outputs") return resolved.outputs?.[name] || automaticSlotLabel(name);
  return resolved.widgets?.[name] || resolved.inputs?.[name] || automaticSlotLabel(name);
}

function applySlotLabels(node, resolved) {
  let changed = 0;
  for (const [section, items] of [
    ["inputs", node.inputs],
    ["outputs", node.outputs],
    ["widgets", node.widgets],
  ]) {
    for (const item of items || []) {
      if (setTranslatedLabel(item, slotTranslation(resolved, section, item))) changed++;
    }
  }
  return changed;
}

function slotSignature(node) {
  return ["inputs", "outputs", "widgets"].flatMap(section =>
    (node[section] || []).map(item => `${section}:${item?.name || ""}:${item?.label || ""}`)
  ).join("|");
}

function syncDynamicLabels(node, resolved) {
  const before = slotSignature(node);
  if (node.__utSlotSignature === before) return 0;
  const changed = applySlotLabels(node, resolved);
  node.__utSlotSignature = slotSignature(node);
  if (changed) node.setDirtyCanvas?.(true, true);
  return changed;
}

function applyToNode(node, loaded = false) {
  if (!state.config.enabled || !node) return;
  const className = classNameOf(node);
  const resolved = state.resolved.get(className);
  if (!resolved) return;

  applySlotLabels(node, resolved);

  const legacyAutoTitle = translateIdentifier(resolved.__originalTitle || className);
  const originals = new Set([
    className,
    resolved.__originalTitle,
    node.constructor?.type,
    legacyAutoTitle,
  ].filter(Boolean));
  const isCustomTitle = loaded && node.title && !originals.has(node.title) && node.title !== resolved.title;
  if (!isCustomTitle && resolved.title) {
    if (!node.__utTitleApplied) {
      node.__utOriginalTitle = node.title;
      node.__utOriginalConstructorTitle = node.constructor?.title;
    }
    node.title = resolved.title;
    if (node.constructor) node.constructor.title = resolved.title;
    node.__utTitleApplied = true;
  }

  if (!node.__utDynamicWrapped) {
    for (const [method, section] of [["addInput", "inputs"], ["addOutput", "outputs"], ["addWidget", "widgets"]]) {
      const original = node[method];
      if (typeof original !== "function") continue;
      node[method] = function(...args) {
        const result = original.apply(this, args);
        if (!state.config.enabled) return result;
        const name = method === "addWidget" ? args[1] : args[0];
        const list = section === "inputs" ? this.inputs : section === "outputs" ? this.outputs : this.widgets;
        const item = [...(list || [])].reverse().find(candidate => candidate?.name === name)
          || (method === "addWidget" && result && typeof result === "object" ? result : null);
        setTranslatedLabel(item, slotTranslation(resolved, section, item));
        this.__utSlotSignature = slotSignature(this);
        return result;
      };
    }
    node.__utDynamicWrapped = true;
  }

  // Some extensions create widgets through ComfyWidgets helpers after
  // nodeCreated, bypassing addWidget. Recheck only when the slot fingerprint
  // changes, which also repairs labels overwritten by a later extension hook.
  if (!node.__utDynamicLabelSyncWrapped) {
    const originalDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function(...args) {
      const result = originalDrawForeground?.apply(this, args);
      if (state.config.enabled) syncDynamicLabels(this, resolved);
      return result;
    };
    node.__utDynamicLabelSyncWrapped = true;
  }
  node.__utSlotSignature = slotSignature(node);
  queueMicrotask(() => {
    if (state.config.enabled) syncDynamicLabels(node, resolved);
  });
  node.setDirtyCanvas?.(true, true);
}

function applyDefinition(nodeType, nodeData) {
  if (!state.config.enabled) return;
  const className = nodeType?.comfyClass || nodeData?.name;
  if (!className) return;
  const originalTitle = nodeData.display_name || nodeData.name || className;
  const resolved = resolveNodeTranslation(
    className,
    nodeData,
    state.bundle.Nodes,
    state.config.auto_translate_unknown
  );
  if (!resolved) return;
  resolved.__originalTitle = originalTitle;
  state.resolved.set(className, resolved);

  if (resolved.title) {
    nodeType.title = resolved.title;
    nodeData.display_name = resolved.title;
  }
  if (resolved.description) nodeData.description = resolved.description;
  if (nodeData.category) nodeData.category = translateCategory(nodeData.category, state.bundle.NodeCategory);

  for (const group of ["required", "optional", "hidden"]) {
    const inputs = nodeData.input?.[group];
    if (!inputs) continue;
    for (const [name, spec] of Object.entries(inputs)) {
      if (!Array.isArray(spec)) continue;
      if (spec[1] === undefined) spec[1] = {};
      if (!spec[1] || typeof spec[1] !== "object" || Array.isArray(spec[1])) continue;
      const label = resolved.widgets?.[name] || resolved.inputs?.[name];
      if (label && label !== name) spec[1].label = label;
    }
  }
}

function installDomMenuTranslation() {
  if (!state.config.translate_menus) return;
  const dictionary = state.bundle.Menu || {};
  const booleanOptions = Object.freeze({
    true: "是",
    yes: "是",
    on: "是",
    enable: "是",
    enabled: "是",
    false: "否",
    no: "否",
    off: "否",
    disable: "否",
    disabled: "否",
  });

  const isCurrentComboMenu = menu => {
    if (!(menu instanceof Element) || !menu.matches(".litecontextmenu")) return false;
    // ComfyUI adds this input only to long combo-value menus.
    if (menu.querySelector(".comfy-context-menu-filter")) return true;

    // Short combo menus do not have a filter. Match their immutable data-value
    // list against the currently active node widget, while leaving ordinary
    // right-click/context menus eligible for normal UI translation.
    const entries = [...menu.querySelectorAll(":scope > .litemenu-entry:not(.separator)")];
    if (!entries.length) return false;
    const menuValues = entries.map(entry => String(entry.dataset.value ?? entry.textContent ?? "").trim());
    const widgets = app.canvas?.current_node?.widgets || app.graph?.current_node?.widgets || [];
    return widgets.some(widget => {
      const values = widget?.options?.values;
      return Array.isArray(values)
        && values.length === menuValues.length
        && values.every((value, index) => String(value) === menuValues[index]);
    });
  };

  const comboTranslation = element => {
    const menu = element.closest?.(".litecontextmenu");
    if (!isCurrentComboMenu(menu) || !element.matches?.(".litemenu-entry")) return undefined;
    const original = String(element.dataset.value ?? element.textContent ?? "").trim().toLocaleLowerCase();
    // Returning null explicitly means this is a combo option that must remain
    // unchanged. Only boolean meanings are localized to 是 / 否.
    return booleanOptions[original] || null;
  };

  const translateElement = root => {
    if (!(root instanceof Element) || root.closest?.(".ut-overlay")) return;
    const candidates = root.children.length === 0 ? [root] : root.querySelectorAll("*:not(:has(*))");
    for (const element of candidates) {
      const optionTranslation = comboTranslation(element);
      if (optionTranslation !== undefined) {
        if (optionTranslation) element.textContent = optionTranslation;
        continue;
      }
      for (const attr of ["title", "placeholder", "aria-label"]) {
        const value = element.getAttribute?.(attr);
        if (value && dictionary[value]) element.setAttribute(attr, dictionary[value]);
      }
      if (element.childNodes.length === 1 && element.firstChild?.nodeType === Node.TEXT_NODE) {
        const original = element.textContent.trim();
        if (dictionary[original]) element.textContent = element.textContent.replace(original, dictionary[original]);
      }
    }
  };
  translateElement(document.body);
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) translateElement(node);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

app.registerExtension({
  name: "ComfyUI.UniversalTranslator",

  async init(appInstance) {
    loadStyle();
    state.config = await fetchJSON("/universal_translation/config", state.config);
    state.bundle = await fetchJSON(
      `/universal_translation/translations?locale=${encodeURIComponent(state.config.locale)}`,
      state.bundle
    );
    addSettings(appInstance);
  },

  beforeRegisterNodeDef(nodeType, nodeData) {
    applyDefinition(nodeType, nodeData);
  },

  beforeRegisterVueAppNodeDefs(nodeDefs) {
    if (!state.config.enabled) return;
    for (const nodeData of nodeDefs || []) {
      const className = nodeData.name;
      const resolved = resolveNodeTranslation(className, nodeData, state.bundle.Nodes, state.config.auto_translate_unknown);
      if (!resolved) continue;
      state.resolved.set(className, { ...resolved, __originalTitle: nodeData.display_name || className });
      if (resolved.title) nodeData.display_name = resolved.title;
      if (nodeData.category) nodeData.category = translateCategory(nodeData.category, state.bundle.NodeCategory);
    }
  },

  nodeCreated(node) {
    if (state.config.enabled) applyToNode(node, false);
    else restoreNode(node);
  },
  loadedGraphNode(node) {
    if (state.config.enabled) applyToNode(node, true);
    else restoreNode(node);
  },

  async setup(appInstance) {
    installTranslationPanel({
      config: state.config,
      bundle: state.bundle,
      onEnabledChange: enabled => {
        state.config.enabled = enabled;
        if (!enabled) restoreAllNodes(appInstance);
      },
    });
    if (!state.config.enabled) {
      restoreAllNodes(appInstance);
      console.info("[Universal Translator] 翻译已关闭；管理按钮仍可用于重新开启。");
      return;
    }
    for (const node of appInstance.graph?._nodes || []) applyToNode(node, true);
    installDomMenuTranslation();
    console.info(`[Universal Translator] 已加载：${state.bundle.meta?.dictionary_nodes || 0} 条人工节点词典，未知节点自动翻译=${state.config.auto_translate_unknown}`);
  },
});
