export type LabelKind = "disease" | "pest" | "healthy";

export const CROPS: readonly string[] = [
  "Apple",
  "Banana",
  "Basil",
  "Bean",
  "Bell Pepper",
  "Blueberry",
  "Broccoli",
  "Cabbage",
  "Carrot",
  "Cassava",
  "Cauliflower",
  "Celery",
  "Cherry",
  "Citrus",
  "Coffee",
  "Corn",
  "Cucumber",
  "Eggplant",
  "Garlic",
  "Ginger",
  "Grape",
  "Lettuce",
  "Maple",
  "Orange",
  "Peach",
  "Plum",
  "Potato",
  "Raspberry",
  "Rice",
  "Soybean",
  "Squash",
  "Strawberry",
  "Tobacco",
  "Tomato",
  "Wheat",
  "Zucchini",
];

const CROP_ALIASES: Record<string, string> = {
  "pepper bell": "Bell Pepper",
  "bell pepper": "Bell Pepper",
  "corn (maize)": "Corn",
  maize: "Corn",
  grapevine: "Grape",
};

const NAME_ALIASES: Record<string, string> = {
  "Tomato|bacterial leaf spot": "Bacterial Spot",
  "Tomato|two spotted spider mite": "Spider Mites",
  "Corn|common rust": "Rust",
  "Corn|cercospora leaf spot gray leaf spot": "Gray Leaf Spot",
  "Apple|cedar apple rust": "Rust",
  "Grape|leaf blight isariopsis leaf spot": "Leaf Spot",
};

const JUNK = new Set([
  "images",
  "image",
  "img",
  "imgs",
  "train",
  "test",
  "val",
  "valid",
  "validation",
  "unknown",
  "others",
  "other",
  "misc",
  "dataset",
]);

const HEALTHY_WORDS = new Set([
  "",
  "leaf",
  "leaves",
  "healthy",
  "healthy leaf",
  "normal",
]);

const ACRONYM_PARENS = /\s*\([A-Z]{2,6}\)/g;
const WORD = /[A-Za-z][A-Za-z']*/g;

const TABLE: Array<[string, string]> = (() => {
  const merged = new Map<string, string>();
  for (const c of CROPS) merged.set(c.toLowerCase(), c);
  for (const [k, v] of Object.entries(CROP_ALIASES)) merged.set(k, v);
  return [...merged.entries()].sort((a, b) => b[0].length - a[0].length);
})();

export interface ParsedLabel {
  kind: LabelKind;
  crop: string | null;
  name: string;
  label: string;
  key: string;
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function titleCase(text: string): string {
  return text.replace(
    WORD,
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
}

export function isJunkLabel(raw: string): boolean {
  return JUNK.has(raw.toLowerCase().replace(/[^a-z]+/g, ""));
}

export function parseLabel(raw: string): ParsedLabel {
  const stripped = raw.replace(/\s+/g, " ").trim();
  if (/^pest\s+\S/i.test(stripped)) {
    const name = stripped.slice(4).trim();
    return {
      kind: "pest",
      crop: null,
      name,
      label: `Pest ${name}`,
      key: `pest-${slug(name)}`,
    };
  }
  const text = stripped
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const low = text.toLowerCase();
  let crop: string | null = null;
  let rest = text;
  for (const [alias, canon] of TABLE) {
    if (low === alias || low.startsWith(`${alias} `)) {
      crop = canon;
      rest = text.slice(alias.length).trim();
      break;
    }
  }
  const cleaned = rest.replace(ACRONYM_PARENS, "").trim();
  let name: string;
  if (crop !== null && HEALTHY_WORDS.has(cleaned.toLowerCase()))
    name = "Healthy";
  else name = titleCase(cleaned);
  if (crop !== null)
    name = NAME_ALIASES[`${crop}|${name.toLowerCase()}`] ?? name;
  const label = crop !== null ? `${crop} ${name}` : name;
  return {
    kind: name === "Healthy" ? "healthy" : "disease",
    crop,
    name,
    label,
    key: slug(label),
  };
}
