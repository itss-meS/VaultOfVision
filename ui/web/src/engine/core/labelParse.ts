export type LabelKind = "disease" | "healthy" | "pest";

export interface ParsedLabel {
  kind: LabelKind;
  crop: string | null;
  name: string;
}

const CROP_ALIASES: ReadonlyMap<string, string> = new Map([
  ["apple", "apple"],
  ["banana", "banana"],
  ["basil", "basil"],
  ["bean", "bean"],
  ["beans", "bean"],
  ["bell pepper", "bell pepper"],
  ["pepper bell", "bell pepper"],
  ["blueberry", "blueberry"],
  ["broccoli", "broccoli"],
  ["cabbage", "cabbage"],
  ["carrot", "carrot"],
  ["cassava", "cassava"],
  ["cauliflower", "cauliflower"],
  ["celery", "celery"],
  ["cherry", "cherry"],
  ["citrus", "citrus"],
  ["coffee", "coffee"],
  ["corn", "corn"],
  ["maize", "corn"],
  ["cucumber", "cucumber"],
  ["eggplant", "eggplant"],
  ["brinjal", "eggplant"],
  ["garlic", "garlic"],
  ["ginger", "ginger"],
  ["grape", "grape"],
  ["grapes", "grape"],
  ["grapevine", "grape"],
  ["lettuce", "lettuce"],
  ["maple", "maple"],
  ["peach", "peach"],
  ["plum", "plum"],
  ["potato", "potato"],
  ["potatoes", "potato"],
  ["raspberry", "raspberry"],
  ["rice", "rice"],
  ["paddy", "rice"],
  ["soybean", "soybean"],
  ["squash", "squash"],
  ["strawberry", "strawberry"],
  ["tobacco", "tobacco"],
  ["tomato", "tomato"],
  ["tomatoes", "tomato"],
  ["wheat", "wheat"],
  ["zucchini", "zucchini"],
]);

const MAX_CROP_WORDS = 2;

function words(label: string): string[] {
  return label
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[_\s]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0);
}

function titleCase(parts: readonly string[]): string {
  return parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function takeCrop(parts: readonly string[]): {
  crop: string | null;
  rest: string[];
} {
  for (let n = Math.min(MAX_CROP_WORDS, parts.length); n >= 1; n--) {
    const crop = CROP_ALIASES.get(parts.slice(0, n).join(" "));
    if (crop !== undefined) return { crop, rest: parts.slice(n) };
  }
  return { crop: null, rest: [...parts] };
}

export function canonicalCrop(value: string): string | null {
  const parts = words(value);
  if (parts.length === 0) return null;
  return CROP_ALIASES.get(parts.join(" ")) ?? null;
}

export function nameKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "");
}

export function parseLabel(label: string): ParsedLabel {
  const parts = words(label);
  if (parts[0] === "pest") {
    return { kind: "pest", crop: null, name: titleCase(parts.slice(1)) };
  }
  if (parts.includes("healthy")) {
    const others = parts.filter((w) => w !== "healthy" && w !== "leaf");
    return { kind: "healthy", crop: takeCrop(others).crop, name: "Healthy" };
  }
  const { crop, rest } = takeCrop(parts);
  return { kind: "disease", crop, name: titleCase(rest) };
}

export function displayLabel(parsed: ParsedLabel): string {
  if (parsed.kind === "healthy") return "Healthy";
  if (parsed.kind === "pest") return `Pest ${parsed.name}`;
  return parsed.crop === null
    ? parsed.name
    : `${titleCase(parsed.crop.split(" "))} ${parsed.name}`.trim();
}

const UNSUPPORTED = /^(unsupported|other[ _-]?crop|not[ _-].*)$/i;

export function isUnsupportedLabel(label: string): boolean {
  return UNSUPPORTED.test(label.trim());
}
