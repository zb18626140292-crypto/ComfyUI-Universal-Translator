import { hasChinese, translateIdentifier } from "./translator.js";

export function restoreTranslatedLabel(item, { forceOriginal = false } = {}) {
  if (!item) return false;

  if (forceOriginal && item.name) {
    const changed = item.label !== item.name;
    item.label = item.name;
    delete item.__utApplied;
    delete item.__utOriginalLabel;
    return changed;
  }

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
  const automatic = baseline ? translateIdentifier(baseline) : baseline;
  const looksPersisted = item.label && baseline && (
    (hasChinese(item.label) && !hasChinese(baseline))
    || (automatic !== baseline && item.label === automatic)
  );
  if (looksPersisted) {
    delete item.label;
    return true;
  }
  return false;
}

export function restoreNodeTranslation(node, {
  forceOriginal = false,
  originalTitle,
  translatedTitles = [],
} = {}) {
  if (!node) return 0;
  let restored = 0;
  for (const section of [node.inputs, node.outputs, node.widgets]) {
    for (const item of section || []) {
      restored += restoreTranslatedLabel(item, { forceOriginal }) ? 1 : 0;
    }
  }
  if (forceOriginal && originalTitle) {
    if (node.title !== originalTitle) {
      node.title = originalTitle;
      restored++;
    }
    if (node.constructor) node.constructor.title = originalTitle;
    delete node.__utTitleApplied;
    delete node.__utOriginalTitle;
    delete node.__utOriginalConstructorTitle;
  } else if (node.__utTitleApplied) {
    if (node.__utOriginalTitle) node.title = node.__utOriginalTitle;
    else delete node.title;
    if (node.constructor && node.__utOriginalConstructorTitle) {
      node.constructor.title = node.__utOriginalConstructorTitle;
    }
    delete node.__utTitleApplied;
    delete node.__utOriginalTitle;
    delete node.__utOriginalConstructorTitle;
    restored++;
  } else if (node.title && translatedTitles.filter(Boolean).includes(node.title) && originalTitle) {
    node.title = originalTitle;
    restored++;
  }
  if (restored) node.setDirtyCanvas?.(true, true);
  return restored;
}
