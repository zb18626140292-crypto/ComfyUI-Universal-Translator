import { BRANDS, PHRASES, WORDS } from "./glossary.js";

const HAN = /[\u3400-\u9fff]/;
const ASCII = /[A-Za-z0-9]/;

export function hasChinese(value) {
  return HAN.test(String(value ?? ""));
}

export function splitIdentifier(value) {
  return String(value ?? "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/[_./\\:|()[\]{}-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(token) {
  if (WORDS[token]) return token;
  if (token.endsWith("ies") && WORDS[`${token.slice(0, -3)}y`]) return `${token.slice(0, -3)}y`;
  if (token.endsWith("es") && WORDS[token.slice(0, -2)]) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3 && WORDS[token.slice(0, -1)]) return token.slice(0, -1);
  return token;
}

function joinPieces(pieces) {
  let output = pieces.join("");
  output = output
    .replace(/([A-Za-z0-9+])([\u3400-\u9fff])/g, "$1 $2")
    .replace(/([\u3400-\u9fff])([A-Za-z0-9+])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return output;
}

export function translateIdentifierDetailed(value) {
  const source = String(value ?? "").trim();
  if (!source || hasChinese(source)) {
    return { text: source, translatedTokens: 0, totalTokens: 0, changed: false };
  }

  const normalized = splitIdentifier(source);
  const exact = PHRASES[normalized.toLowerCase()];
  if (exact) {
    return { text: exact, translatedTokens: normalized.split(" ").length, totalTokens: normalized.split(" ").length, changed: exact !== source };
  }

  const tokens = normalized.split(" ").filter(Boolean);
  const pieces = [];
  let translatedTokens = 0;
  for (let index = 0; index < tokens.length;) {
    let matched = false;
    for (let width = Math.min(4, tokens.length - index); width >= 2; width--) {
      const phrase = tokens.slice(index, index + width).join(" ").toLowerCase();
      if (PHRASES[phrase]) {
        pieces.push(PHRASES[phrase]);
        translatedTokens += width;
        index += width;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const original = tokens[index];
    const lower = original.toLowerCase();
    const key = stem(lower);
    if (BRANDS[lower]) {
      pieces.push(BRANDS[lower]);
      translatedTokens++;
    } else if (/^\d+(?:\.\d+)?$/.test(original)) {
      pieces.push(original);
      translatedTokens++;
    } else if (WORDS[key]) {
      pieces.push(WORDS[key]);
      translatedTokens++;
    } else {
      pieces.push(original);
    }
    index++;
  }

  // A partially translated label is harder to understand than the original
  // identifier (for example "return 与 leftover 噪声"). Only publish the
  // automatic result when every token is known, a brand, or a number.
  const complete = tokens.length > 0 && translatedTokens === tokens.length;
  const text = complete ? (joinPieces(pieces) || source) : source;
  return { text, translatedTokens, totalTokens: tokens.length, changed: text !== source };
}

export function translateIdentifier(value) {
  return translateIdentifierDetailed(value).text;
}

function visibleInputNames(nodeData) {
  const result = [];
  const input = nodeData?.input || {};
  for (const group of ["required", "optional", "hidden"]) {
    if (!input[group] || typeof input[group] !== "object") continue;
    result.push(...Object.keys(input[group]));
  }
  return [...new Set(result)];
}

export function buildAutoNodeTranslation(nodeData = {}) {
  const titleSource = nodeData.display_name || nodeData.name || "";
  const inputs = {};
  const widgets = {};
  for (const name of visibleInputNames(nodeData)) {
    const translated = translateIdentifier(name);
    inputs[name] = translated;
    widgets[name] = translated;
  }

  const outputs = {};
  for (const name of nodeData.output_name || []) {
    if (name != null && name !== "") outputs[name] = translateIdentifier(name);
  }

  return {
    title: translateIdentifier(titleSource),
    inputs,
    outputs,
    widgets,
  };
}

function mergeSection(generated, curated) {
  return Object.assign({}, generated || {}, curated || {});
}

export function resolveNodeTranslation(className, nodeData, staticNodes = {}, autoEnabled = true) {
  const curated = staticNodes[className];
  if (!curated && !autoEnabled) return null;
  const generated = autoEnabled ? buildAutoNodeTranslation(nodeData) : {};
  return {
    ...generated,
    ...(curated || {}),
    inputs: mergeSection(generated.inputs, curated?.inputs),
    outputs: mergeSection(generated.outputs, curated?.outputs),
    widgets: mergeSection(generated.widgets, curated?.widgets),
    _source: curated ? "dictionary" : "auto",
  };
}

export function translateCategory(category, categoryDictionary = {}) {
  if (!category) return category;
  return String(category).split("/").map(part => {
    return categoryDictionary[part] || translateIdentifier(part);
  }).join("/");
}
