import { api } from "../../../scripts/api.js";
import { resolveNodeTranslation } from "./translator.js";

const BUTTON_POSITION_KEY = "comfyui-universal-translator.button-position";
const BUTTON_EDGE_GAP = 6;
const DRAG_THRESHOLD = 5;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

async function postJSON(path, payload) {
  const response = await api.fetchApi(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function downloadJSON(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function placeFloatingButton(button, left, top) {
  const maxLeft = window.innerWidth - button.offsetWidth - BUTTON_EDGE_GAP;
  const maxTop = window.innerHeight - button.offsetHeight - BUTTON_EDGE_GAP;
  button.style.left = `${clamp(left, BUTTON_EDGE_GAP, maxLeft)}px`;
  button.style.top = `${clamp(top, BUTTON_EDGE_GAP, maxTop)}px`;
  button.style.right = "auto";
  button.style.bottom = "auto";
}

function installButtonDragging(button) {
  let drag = null;
  let suppressNextClick = false;

  try {
    const saved = JSON.parse(localStorage.getItem(BUTTON_POSITION_KEY) || "null");
    if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
      placeFloatingButton(button, saved.left, saved.top);
    }
  } catch {
    localStorage.removeItem(BUTTON_POSITION_KEY);
  }

  button.title = "可拖动调整位置；点击打开翻译管理面板";

  button.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const rect = button.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
    };
    button.setPointerCapture?.(event.pointerId);
    button.classList.add("ut-dragging");
  });

  button.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    drag.moved = true;
    event.preventDefault();
    placeFloatingButton(button, drag.left + deltaX, drag.top + deltaY);
  });

  const finishDrag = (event, suppressClick) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    button.releasePointerCapture?.(event.pointerId);
    button.classList.remove("ut-dragging");
    suppressNextClick = suppressClick && drag.moved;
    if (drag.moved) {
      const rect = button.getBoundingClientRect();
      localStorage.setItem(BUTTON_POSITION_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
    }
    drag = null;
  };

  button.addEventListener("pointerup", event => finishDrag(event, true));
  button.addEventListener("pointercancel", event => finishDrag(event, false));
  button.addEventListener("click", event => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener("resize", () => {
    if (button.style.left && button.style.top) {
      const rect = button.getBoundingClientRect();
      placeFloatingButton(button, rect.left, rect.top);
    }
  });
}

export function installTranslationPanel({ config, bundle, onEnabledChange }) {
  if (!config.show_floating_button || document.getElementById("ut-open-button")) return;

  const button = element("button", "ut-open-button", "🌐 全节点翻译");
  button.id = "ut-open-button";
  document.body.appendChild(button);
  installButtonDragging(button);

  let modal = null;
  button.addEventListener("click", async () => {
    if (modal) {
      modal.remove();
      modal = null;
      return;
    }

    modal = element("div", "ut-overlay");
    const dialog = element("section", "ut-dialog");
    const header = element("header", "ut-header");
    const heading = element("div", "ut-heading");
    heading.append(element("h2", "", "ComfyUI 全节点翻译"));
    heading.append(element("p", "", "扫描本机全部节点；人工词典优先，未知第三方节点使用本地术语引擎。"));
    const headerActions = element("div", "ut-header-actions");
    const translationToggle = element("button", "ut-translation-toggle");
    translationToggle.type = "button";
    translationToggle.setAttribute("role", "switch");
    const updateToggle = enabled => {
      translationToggle.classList.toggle("ut-toggle-enabled", enabled);
      translationToggle.classList.toggle("ut-toggle-disabled", !enabled);
      translationToggle.setAttribute("aria-checked", String(enabled));
      translationToggle.textContent = enabled ? "翻译开启" : "翻译关闭";
      translationToggle.title = enabled ? "点击关闭全部节点翻译" : "点击开启全部节点翻译";
    };
    updateToggle(Boolean(config.enabled));
    const close = element("button", "ut-icon-button", "×");
    close.title = "关闭";
    headerActions.append(translationToggle, close);
    header.append(heading, headerActions);
    dialog.appendChild(header);

    const stats = element("div", "ut-stats");
    stats.append(
      element("div", "ut-card", "正在读取 /object_info…"),
      element("div", "ut-card", "人工词典：计算中"),
      element("div", "ut-card", "自动补全：计算中")
    );
    dialog.appendChild(stats);

    const toolbar = element("div", "ut-toolbar");
    const search = element("input", "ut-search");
    search.type = "search";
    search.placeholder = "搜索节点类名、英文名或中文名…";
    const exportButton = element("button", "ut-secondary", "导出扫描结果");
    const reloadButton = element("button", "ut-primary", "刷新页面并应用");
    toolbar.append(search, exportButton, reloadButton);
    dialog.appendChild(toolbar);

    const status = element("div", "ut-status", "正在扫描，请稍候…");
    const tableWrap = element("div", "ut-table-wrap");
    const table = element("table", "ut-table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const title of ["节点类名", "原显示名", "中文标题（可修改）", "来源", "操作"]) {
      headRow.appendChild(element("th", "", title));
    }
    head.appendChild(headRow);
    table.appendChild(head);
    const body = document.createElement("tbody");
    table.appendChild(body);
    tableWrap.appendChild(table);
    dialog.append(status, tableWrap);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const dismiss = () => { modal?.remove(); modal = null; };
    close.addEventListener("click", dismiss);
    modal.addEventListener("click", event => { if (event.target === modal) dismiss(); });
    reloadButton.addEventListener("click", () => location.reload());
    translationToggle.addEventListener("click", async () => {
      const nextEnabled = !Boolean(config.enabled);
      translationToggle.disabled = true;
      translationToggle.textContent = nextEnabled ? "正在开启…" : "正在关闭…";
      try {
        await postJSON("/universal_translation/config", { enabled: nextEnabled });
        config.enabled = nextEnabled;
        await onEnabledChange?.(nextEnabled);
        updateToggle(nextEnabled);
        translationToggle.textContent = nextEnabled ? "已开启，正在刷新…" : "已关闭，正在刷新…";
        setTimeout(() => location.reload(), 180);
      } catch (error) {
        updateToggle(Boolean(config.enabled));
        translationToggle.disabled = false;
        alert(`切换翻译失败：${error.message}`);
      }
    });

    try {
      const response = await api.fetchApi("/object_info");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const objectInfo = await response.json();
      const rows = Object.entries(objectInfo).map(([className, nodeData]) => {
        const translation = resolveNodeTranslation(
          className,
          nodeData,
          bundle.Nodes,
          config.auto_translate_unknown
        );
        return {
          className,
          original: nodeData.display_name || nodeData.name || className,
          translated: translation?.title || nodeData.display_name || className,
          source: translation?._source || "原生",
          translation,
        };
      }).sort((a, b) => a.className.localeCompare(b.className));

      const dictionaryCount = rows.filter(row => row.source === "dictionary").length;
      const autoCount = rows.filter(row => row.source === "auto").length;
      stats.children[0].textContent = `节点总数\n${rows.length.toLocaleString()}`;
      stats.children[1].textContent = `人工词典\n${dictionaryCount.toLocaleString()}`;
      stats.children[2].textContent = `自动补全\n${autoCount.toLocaleString()}`;

      const render = () => {
        body.replaceChildren();
        const query = search.value.trim().toLocaleLowerCase();
        const filtered = query ? rows.filter(row =>
          `${row.className}\n${row.original}\n${row.translated}`.toLocaleLowerCase().includes(query)
        ) : rows;
        status.textContent = `显示 ${Math.min(filtered.length, 300)} / ${filtered.length} 个结果（为保证流畅，最多渲染 300 行）`;

        for (const row of filtered.slice(0, 300)) {
          const tr = document.createElement("tr");
          tr.append(
            element("td", "ut-mono", row.className),
            element("td", "", row.original)
          );
          const editCell = document.createElement("td");
          const input = element("input", "ut-title-input");
          input.value = row.translated;
          editCell.appendChild(input);
          tr.appendChild(editCell);
          tr.appendChild(element("td", `ut-source ut-source-${row.source}`, row.source === "dictionary" ? "人工词典" : row.source === "auto" ? "自动" : "原生"));
          const actionCell = document.createElement("td");
          const save = element("button", "ut-row-save", "保存");
          save.addEventListener("click", async () => {
            save.disabled = true;
            save.textContent = "保存中…";
            try {
              await postJSON("/universal_translation/override", {
                class_name: row.className,
                translation: { title: input.value.trim() || row.original },
              });
              bundle.Nodes[row.className] = { ...(bundle.Nodes[row.className] || {}), title: input.value.trim() || row.original };
              row.translated = input.value.trim() || row.original;
              row.source = "dictionary";
              save.textContent = "已保存";
            } catch (error) {
              save.textContent = "失败";
              alert(`保存翻译失败：${error.message}`);
            } finally {
              setTimeout(() => { save.disabled = false; save.textContent = "保存"; }, 1200);
            }
          });
          actionCell.appendChild(save);
          tr.appendChild(actionCell);
          body.appendChild(tr);
        }
      };

      search.addEventListener("input", render);
      exportButton.addEventListener("click", () => downloadJSON("comfyui-node-translation-inventory.json", rows.map(row => ({
        class_name: row.className,
        original_title: row.original,
        translated_title: row.translated,
        source: row.source,
        translation: row.translation,
      }))));
      render();
    } catch (error) {
      status.textContent = `扫描失败：${error.message}`;
    }
  });
}
