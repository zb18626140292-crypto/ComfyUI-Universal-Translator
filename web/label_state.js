import { hasChinese } from "./translator.js";

export function restoreTranslatedLabel(item) {
  if (!item) return false;

  if (item.__utApplied) {
    const original = item.__utOriginalLabel;
    if (original && original !== item.name) item.label = original;
    else delete item.label;
    delete item.__utApplied;
    delete item.__utOriginalLabel;
    return true;
  }

  // ComfyUI serializes `label`, but drops our temporary __ut* markers. When a
  // translated workflow is opened after translation is disabled, recognize the
  // persisted Chinese label and fall back to the original slot/widget name.
  const baseline = item.localized_name || item.name;
  if (item.label && baseline && hasChinese(item.label) && !hasChinese(baseline)) {
    delete item.label;
    return true;
  }
  return false;
}

export function restoreNodeTranslation(node) {
  if (!node) return 0;
  let restored = 0;
  for (const section of [node.inputs, node.outputs, node.widgets]) {
    for (const item of section || []) restored += restoreTranslatedLabel(item) ? 1 : 0;
  }
  if (restored) node.setDirtyCanvas?.(true, true);
  return restored;
}
