import { BRANDS, PHRASES, WORDS } from "./glossary.js";

const HAN = /[\u3400-\u9fff]/;
const ASCII = /[A-Za-z0-9]/;

export function hasChinese(value) {
  return HAN.test(String(value ?? ""));
}

export function splitIdentifier(value) {
  return String(value ?? "")
    // LoRA uses mixed acronym casing and otherwise splits into "Lo RA" when
    // embedded in names such as VisualLoRALoader.
    .replace(/lora/gi, " LORA ")
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

  // Dynamic ComfyUI widgets commonly use names such as string_1/string_2.
  // Translate the semantic part while retaining the original numbered suffix,
  // so every item in the generated series uses the same readable convention.
  const numbered = source.match(/^(.+?)([_-])(\d+)$/);
  if (numbered) {
    const base = translateIdentifierDetailed(numbered[1]);
    if (base.totalTokens > 0 && base.translatedTokens === base.totalTokens) {
      const text = `${base.text}${numbered[2]}${numbered[3]}`;
      return {
        text,
        translatedTokens: base.translatedTokens + 1,
        totalTokens: base.totalTokens + 1,
        changed: text !== source,
      };
    }
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
    } else if (/^[A-Z][A-Z0-9]*$/.test(original)) {
      // Preserve unknown acronyms/type names and one-letter plugin suffixes,
      // but count them as understood so surrounding labels can be translated.
      pieces.push(original);
      translatedTokens++;
    } else if (/^\d+(?:\.\d+)?$/.test(original)) {
      pieces.push(original);
      translatedTokens++;
    } else if (/^[A-Z][A-Z0-9]{1,7}$/.test(original) || /^[xyzrgbuvwhcktsdolm]$/i.test(original)) {
      // Keep established acronyms and coordinate/channel variables intact,
      // while still treating them as understood parts of a complete label.
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

export function translateNaturalTitle(value, technicalFallback = "") {
  const source = String(value ?? "").trim();
  if (!source || hasChinese(source)) return source;

  // A compact program identifier is not natural-language UI copy. Keep class
  // names such as ZEngineerCLIPLoader, KSamplerAdvanced and load_image_batch
  // intact unless a curated dictionary explicitly provides a title.
  const normalized = splitIdentifier(source);
  const exact = PHRASES[normalized.toLowerCase()];
  if (exact) return exact;
  const expandedTokens = normalized.split(" ").filter(Boolean);
  if (!/\s/.test(source) && expandedTokens.length > 1) return source;

  const translated = translateIdentifier(source);
  // Mixed product names and Chinese fragments are harder to read than the
  // original technical title. If the backend provides a compact class name,
  // use that stable identifier instead (for example ZEngineerCLIPLoader).
  if (hasChinese(translated) && /[A-Za-z]{2,}/.test(translated)) {
    const fallback = String(technicalFallback ?? "").trim();
    if (fallback && !/\s/.test(fallback) && splitIdentifier(fallback).split(" ").length > 1) {
      return fallback;
    }
    return source;
  }

  return translated;
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
    title: translateNaturalTitle(titleSource, nodeData.name),
    inputs,
    outputs,
    widgets,
  };
}

function naturalizeCuratedLabel(curated, generated) {
  if (typeof curated !== "string" || !curated) return curated ?? generated;
  if (hasChinese(curated)) return curated;
  const translated = translateIdentifier(curated);
  return translated !== curated ? translated : curated;
}

function mergeSection(generated, curated) {
  const result = { ...(generated || {}) };
  for (const [key, value] of Object.entries(curated || {})) {
    result[key] = naturalizeCuratedLabel(value, result[key]);
  }
  return result;
}

export function resolveNodeTranslation(className, nodeData, staticNodes = {}, autoEnabled = true) {
  const curated = staticNodes[className];
  if (!curated && !autoEnabled) return null;
  const generated = autoEnabled ? buildAutoNodeTranslation(nodeData) : {};
  const title = curated?.title === undefined
    ? generated.title
    : naturalizeCuratedLabel(curated.title, generated.title);
  return {
    ...generated,
    ...(curated || {}),
    title,
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
