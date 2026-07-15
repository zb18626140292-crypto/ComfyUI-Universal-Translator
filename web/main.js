import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
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
      onChange: async value => { if (!registrationFinished) return; await saveConfig({ enabled: value }); location.reload(); },
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
  if (!item || !translation) return;
  if (item.label && hasChinese(item.label) && !item.__utApplied) return;
  if (!item.__utOriginalLabel) item.__utOriginalLabel = item.label || item.name;
  item.label = translation;
  item.__utApplied = true;
}

function automaticSlotLabel(name) {
  return state.config.auto_translate_unknown && name ? translateIdentifier(name) : null;
}

function applyToNode(node, loaded = false) {
  if (!state.config.enabled || !node) return;
  const className = classNameOf(node);
  const resolved = state.resolved.get(className);
  if (!resolved) return;

  for (const item of node.inputs || []) {
    setTranslatedLabel(item, resolved.inputs?.[item.name] || resolved.widgets?.[item.widget?.name] || automaticSlotLabel(item.name));
  }
  for (const item of node.outputs || []) {
    setTranslatedLabel(item, resolved.outputs?.[item.name] || automaticSlotLabel(item.name));
  }
  for (const item of node.widgets || []) {
    setTranslatedLabel(item, resolved.widgets?.[item.name] || resolved.inputs?.[item.name] || automaticSlotLabel(item.name));
  }

  const originals = new Set([className, resolved.__originalTitle, node.constructor?.type].filter(Boolean));
  const isCustomTitle = loaded && node.title && !originals.has(node.title) && node.title !== resolved.title;
  if (!isCustomTitle && resolved.title) {
    node.title = resolved.title;
    if (node.constructor) node.constructor.title = resolved.title;
  }

  if (!node.__utDynamicWrapped) {
    for (const [method, section] of [["addInput", "inputs"], ["addOutput", "outputs"], ["addWidget", "widgets"]]) {
      const original = node[method];
      if (typeof original !== "function") continue;
      node[method] = function(...args) {
        const result = original.apply(this, args);
        const name = method === "addWidget" ? args[1] : args[0];
        const list = section === "inputs" ? this.inputs : section === "outputs" ? this.outputs : this.widgets;
        const item = [...(list || [])].reverse().find(candidate => candidate?.name === name)
          || (method === "addWidget" && result && typeof result === "object" ? result : null);
        setTranslatedLabel(item, resolved[section]?.[name] || resolved.inputs?.[name] || automaticSlotLabel(name));
        return result;
      };
    }
    node.__utDynamicWrapped = true;
  }
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
      spec[1].label = resolved.widgets?.[name] || resolved.inputs?.[name] || name;
    }
  }
}

function installDomMenuTranslation() {
  if (!state.config.translate_menus) return;
  const dictionary = state.bundle.Menu || {};
  const translateElement = root => {
    if (!(root instanceof Element) || root.closest?.(".ut-overlay")) return;
    const candidates = root.children.length === 0 ? [root] : root.querySelectorAll("*:not(:has(*))");
    for (const element of candidates) {
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
    if (state.config.enabled) {
      state.bundle = await fetchJSON(
        `/universal_translation/translations?locale=${encodeURIComponent(state.config.locale)}`,
        state.bundle
      );
    }
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

  nodeCreated(node) { applyToNode(node, false); },
  loadedGraphNode(node) { applyToNode(node, true); },

  async setup(appInstance) {
    if (!state.config.enabled) return;
    for (const node of appInstance.graph?._nodes || []) applyToNode(node, true);
    installDomMenuTranslation();
    installTranslationPanel(state);
    console.info(`[Universal Translator] 已加载：${state.bundle.meta?.dictionary_nodes || 0} 条人工节点词典，未知节点自动翻译=${state.config.auto_translate_unknown}`);
  },
});
