// ── Dictionary Index ───────────────────────────────────────────────────────

export interface DictIndex {
  title: string;
  revision: string;
  format?: number;
  version?: number;
  sequenced?: boolean;
  author?: string;
  url?: string;
  description?: string;
  attribution?: string;
  frequencyMode?: "occurrence-based" | "rank-based";
}

// ── Tag Bank ───────────────────────────────────────────────────────────────

/**
 * tag_bank_N.json
 * [name, category, sortOrder, notes, score]
 */
export type TagEntry = [
  name: string,
  category: string,
  sortOrder: number,
  notes: string,
  score: number,
];

// ── Structured Content ─────────────────────────────────────────────────────

export interface StructuredContentStyle {
  fontStyle?: "normal" | "italic";
  fontWeight?: "normal" | "bold";
  fontSize?: string;
  color?: string;
  background?: string;
  backgroundColor?: string;
  textDecorationLine?:
    | "none"
    | "underline"
    | "overline"
    | "line-through"
    | ("underline" | "overline" | "line-through")[];
  textDecorationStyle?: "solid" | "double" | "dotted" | "dashed" | "wavy";
  textDecorationColor?: string;
  borderColor?: string;
  borderStyle?: string;
  borderRadius?: string;
  borderWidth?: string;
  clipPath?: string;
  verticalAlign?:
    | "baseline"
    | "sub"
    | "super"
    | "text-top"
    | "text-bottom"
    | "middle"
    | "top"
    | "bottom";
  textAlign?:
    | "start"
    | "end"
    | "left"
    | "right"
    | "center"
    | "justify"
    | "justify-all"
    | "match-parent";
  textEmphasis?: string;
  textShadow?: string;
  margin?: string;
  marginTop?: number | string;
  marginLeft?: number | string;
  marginRight?: number | string;
  marginBottom?: number | string;
  padding?: string;
  paddingTop?: string;
  paddingLeft?: string;
  paddingRight?: string;
  paddingBottom?: string;
  wordBreak?: "normal" | "break-all" | "keep-all";
  whiteSpace?: string;
  cursor?: string;
  listStyleType?: string;
}

export type StructuredContentData = Record<string, string>;

// Inline elements
type SCInlineImage = {
  tag: "img";
  path: string;
  width?: number;
  height?: number;
  title?: string;
  alt?: string;
  description?: string;
  pixelated?: boolean;
  imageRendering?: "auto" | "pixelated" | "crisp-edges";
  appearance?: "auto" | "monochrome";
  background?: boolean;
  collapsed?: boolean;
  collapsible?: boolean;
  verticalAlign?:
    | "baseline"
    | "sub"
    | "super"
    | "text-top"
    | "text-bottom"
    | "middle"
    | "top"
    | "bottom";
  border?: string;
  borderRadius?: string;
  sizeUnits?: "px" | "em";
  data?: StructuredContentData;
};

type SCLink = {
  tag: "a";
  href: string;
  lang?: string;
  content?: StructuredContentNode;
};

type SCLineBreak = {
  tag: "br";
  data?: StructuredContentData;
};

// Block / container elements
type SCRubyGroup = {
  tag: "ruby" | "rt" | "rp";
  content?: StructuredContentNode;
  data?: StructuredContentData;
  lang?: string;
};

type SCTableGroup = {
  tag: "table" | "thead" | "tbody" | "tfoot" | "tr";
  content?: StructuredContentNode;
  data?: StructuredContentData;
  lang?: string;
};

type SCTableCell = {
  tag: "td" | "th";
  content?: StructuredContentNode;
  data?: StructuredContentData;
  colSpan?: number;
  rowSpan?: number;
  style?: StructuredContentStyle;
  lang?: string;
};

type SCBlock = {
  tag: "span" | "div" | "ol" | "ul" | "li" | "details" | "summary";
  content?: StructuredContentNode;
  data?: StructuredContentData;
  style?: StructuredContentStyle;
  title?: string;
  open?: boolean;
  lang?: string;
};

export type StructuredContentNode =
  | string
  | StructuredContentNode[]
  | SCLineBreak
  | SCRubyGroup
  | SCTableGroup
  | SCTableCell
  | SCBlock
  | SCInlineImage
  | SCLink;

export type StructuredContent = StructuredContentNode;

// ── Glossary ───────────────────────────────────────────────────────────────

export type GlossaryText = {
  type: "text";
  text: string;
};

export type GlossaryImage = {
  type: "image";
  path: string;
  width?: number;
  height?: number;
  title?: string;
  alt?: string;
  description?: string;
  pixelated?: boolean;
  imageRendering?: "auto" | "pixelated" | "crisp-edges";
  appearance?: "auto" | "monochrome";
  background?: boolean;
  collapsed?: boolean;
  collapsible?: boolean;
};

export type GlossaryStructuredContent = {
  type: "structured-content";
  content: StructuredContent;
};

/**
 * Deinflection rule reference — links a term to its uninflected form.
 * [uninflectedTerm, inflectionRuleChain]
 */
export type GlossaryDeinflection = [
  uninflectedTerm: string,
  inflectionRuleChain: string[],
];

export type Glossary =
  | string
  | GlossaryText
  | GlossaryImage
  | GlossaryStructuredContent
  | GlossaryDeinflection;

// ── Term Bank ──────────────────────────────────────────────────────────────

/**
 * term_bank_N.json
 *
 * [term, reading, definitionTags, rules, score, glossary, sequence, termTags]
 *
 * definitionTags  space-separated tag names applying to the definition
 * rules           space-separated deinflection rule identifiers (e.g. "v1 vk")
 * score           sort priority — higher appears first
 * sequence        links this entry to term_meta_bank entries; not globally unique
 * termTags        space-separated tag names applying to the term itself
 */
export type TermEntry = [
  term: string,
  reading: string,
  definitionTags: string | null,
  rules: string,
  score: number,
  glossary: Glossary[],
  sequence: number,
  termTags: string,
];

// ── Term Meta Bank ─────────────────────────────────────────────────────────

/**
 * Frequency data.
 * When `frequency` is an object, `displayValue` is the human-readable form
 * (e.g. "1000" or "top 1000") and `value` is the raw numeric rank/occurrence.
 */
export type FrequencyValue = number | { value: number; displayValue?: string };

export type TermMetaFrequency = [
  term: string,
  mode: "freq",
  data: { reading?: string; frequency: FrequencyValue },
];

export type PitchAccent = {
  position: number; // mora index of the pitch drop (0 = heiban)
  tags?: string[]; // e.g. ['n'] for noun pitch pattern
  nasal?: number[]; // mora indices of nasalisation
  devoice?: number[]; // mora indices of devoicing
};

export type TermMetaPitch = [
  term: string,
  mode: "pitch",
  data: {
    reading: string;
    pitches: PitchAccent[];
  },
];

/**
 * term_meta_bank_N.json
 */
export type TermMetaEntry = TermMetaFrequency | TermMetaPitch;

// ── Kanji Bank ─────────────────────────────────────────────────────────────

/**
 * kanji_bank_N.json
 * [kanji, onyomi, kunyomi, tags, meanings, stats]
 *
 * onyomi   space-separated on readings
 * kunyomi  space-separated kun readings
 * tags     space-separated tag names
 * stats    arbitrary key/value pairs (stroke count, JLPT level, etc.)
 */
export type KanjiEntry = [
  kanji: string,
  onyomi: string,
  kunyomi: string,
  tags: string,
  meanings: string[],
  stats: Record<string, string>,
];

// ── Kanji Meta Bank ────────────────────────────────────────────────────────

export type KanjiMetaFrequency = [
  kanji: string,
  mode: "freq",
  data: FrequencyValue,
];

/**
 * kanji_meta_bank_N.json
 */
export type KanjiMetaEntry = KanjiMetaFrequency;

// ── Convenience re-exports ─────────────────────────────────────────────────

/** All possible bank entry types */
export type AnyEntry =
  | TermEntry
  | TermMetaEntry
  | TagEntry
  | KanjiEntry
  | KanjiMetaEntry;

// /** Narrowing helper — true if entry is a TermMetaFrequency */
// export function isFrequency(entry: TermMetaEntry): entry is TermMetaFrequency {
//   return entry[1] === "freq";
// }

// /** Narrowing helper — true if entry is a TermMetaPitch */
// export function isPitch(entry: TermMetaEntry): entry is TermMetaPitch {
//   return entry[1] === "pitch";
// }
