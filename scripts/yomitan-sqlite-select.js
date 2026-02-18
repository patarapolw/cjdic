// @ts-check
// Query yomitan.db and display term definitions in the console.
//
// Usage:
//   node select-terms.js <term>                  match term or reading
//   node select-terms.js <term> <reading>        match both term AND reading
//   node select-terms.js <term> <reading> <db>   custom db path

import Database from "better-sqlite3";
import { dbPath as DEFAULT_DB_PATH } from "./paths.js";

// ── Args ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

// If the last arg ends with .db, treat it as the db path
const dbPath = args.at(-1)?.endsWith(".db")
  ? /** @type {string} */ (args.pop())
  : DEFAULT_DB_PATH;

const [term = "田中", reading = null] = args;

// ── Structured-content text extractor ─────────────────────────────────────

/**
 * Recursively extract plain text from a structured-content node.
 * @param {unknown} node
 * @returns {string}
 */
function extractText(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node !== "object" || node === null) return "";

  const n = /** @type {any} */ (node);

  if (n.tag === "br") return "\n";
  if (n.tag === "img") return n.alt ? `[${n.alt}]` : "[image]";

  if (n.content !== undefined) {
    const inner = extractText(n.content);
    const blockTags = new Set([
      "div",
      "ol",
      "ul",
      "li",
      "tr",
      "details",
      "summary",
    ]);
    if (n.tag === "td" || n.tag === "th") return inner + "\t";
    return inner + (n.tag && blockTags.has(n.tag) ? "\n" : "");
  }

  if (typeof n.text === "string") return n.text;

  return "";
}

/**
 * Render one glossary entry to a readable string.
 * @param {unknown} g
 * @returns {string}
 */
function renderGlossary(g) {
  if (typeof g === "string") return g;
  if (Array.isArray(g)) return `[deinflection: ${g[0]}]`;
  if (typeof g !== "object" || g === null) return String(g);

  const obj = /** @type {any} */ (g);

  switch (obj.type) {
    case "text":
      return obj.text ?? "";
    case "image":
      return obj.description ?? obj.alt ?? `[image: ${obj.path}]`;
    case "structured-content": {
      if (obj.content === undefined) return "";
      return extractText(obj.content)
        .replace(/\t\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    default:
      return JSON.stringify(g);
  }
}

// ── Query ──────────────────────────────────────────────────────────────────

const db = new Database(dbPath, { readonly: true });

const whereClause = reading
  ? `WHERE t.term = ? AND t.reading = ?`
  : `WHERE t.term = ? OR t.reading = ?`;

const rows = db
  .prepare(
    `
    SELECT
        t.term,
        t.reading,
        COALESCE(dt.tags,  '')  AS def_tags,
        COALESCE(r.rules,  '')  AS rules,
        t.score,
        g.content               AS glossary_json,
        t.sequence,
        COALESCE(tt.tags,  '')  AS term_tags,
        d.title                 AS dict_title
    FROM terms t
    JOIN  glossaries    g  ON g.id  = t.glossary_id
    JOIN  dictionaries  d  ON d.id  = t.dict_id
    LEFT JOIN def_tag_sets  dt ON dt.id = t.def_tags_id
    LEFT JOIN rule_sets      r ON r.id  = t.rules_id
    LEFT JOIN term_tag_sets tt ON tt.id = t.term_tags_id
    ${whereClause}
    ORDER BY t.score DESC
`,
  )
  .all(term, reading ?? term);

db.close();

// ── Output ─────────────────────────────────────────────────────────────────

const queryDesc = reading ? `"${term}" [${reading}]` : `"${term}"`;

if (!rows.length) {
  console.log(`No results for: ${queryDesc}`);
  process.exit(0);
}

const divider = "\u2500".repeat(60);

for (const row of /** @type {any[]} */ (rows)) {
  const glossary = /** @type {unknown[]} */ (JSON.parse(row.glossary_json));

  console.log(`\n${divider}`);
  console.log(`${row.term} \u3010${row.reading}\u3011  [${row.dict_title}]`);

  const meta = [
    row.def_tags && `tags: ${row.def_tags}`,
    row.rules && `rules: ${row.rules}`,
    row.term_tags && `termTags: ${row.term_tags}`,
    `score: ${row.score}`,
    row.sequence && `seq: ${row.sequence}`,
  ]
    .filter(Boolean)
    .join("  \u00b7  ");
  if (meta) console.log(`  ${meta}`);

  console.log();

  glossary.forEach((g, i) => {
    const text = renderGlossary(g);
    if (!text) return;
    const indented = text
      .split("\n")
      .map((line, j) => (j === 0 ? `  ${i + 1}. ${line}` : `      ${line}`))
      .join("\n");
    console.log(indented);
  });
}

console.log(`\n${divider}`);
console.log(`${rows.length} result(s) for ${queryDesc} \u2014 ${dbPath}`);
