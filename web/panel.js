import { api } from "../../../scripts/api.js";
import { resolveNodeTranslation } from "./translator.js";

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

export function installTranslationPanel({ config, bundle }) {
  if (!config.show_floating_button || document.getElementById("ut-open-button")) return;

  const button = element("button", "ut-open-button", "🌐 全节点翻译");
  button.id = "ut-open-button";
  document.body.appendChild(button);

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
    const heading = element("div");
    heading.append(element("h2", "", "ComfyUI 全节点翻译"));
    heading.append(element("p", "", "扫描本机全部节点；人工词典优先，未知第三方节点使用本地术语引擎。"));
    const close = element("button", "ut-icon-button", "×");
    close.title = "关闭";
    header.append(heading, close);
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

