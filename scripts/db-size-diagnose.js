// Quick diagnostic — run against your actual db
// node diagnose.js src-tauri/resources/yomitan.db

import Database from "better-sqlite3";

const dbPath = process.argv[2] ?? "src-tauri/resources/yomitan.db";
const db = new Database(dbPath, { readonly: true });

// Dictionary summary
console.log("\n── Dictionaries ──────────────────────────────────────");
const dicts = db
  .prepare(
    `
    SELECT
        d.id, d.title, d.revision,
        (SELECT COUNT(*) FROM terms     WHERE dict_id = d.id) AS terms,
        (SELECT COUNT(*) FROM term_meta WHERE dict_id = d.id) AS meta,
        (SELECT COUNT(*) FROM tags      WHERE dict_id = d.id) AS tags
    FROM dictionaries d
    ORDER BY d.id
`,
  )
  .all();
console.table(dicts);

// Table sizes via page count
console.log("\n── Table row counts ──────────────────────────────────");
const tables = [
  "terms",
  "term_meta",
  "glossaries",
  "def_tag_sets",
  "term_tag_sets",
  "rule_sets",
  "tags",
];
for (const t of tables) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get();
  console.log(`  ${t.padEnd(20)} ${row.n.toLocaleString()}`);
}

// Glossary size breakdown
console.log("\n── Glossary content sizes ────────────────────────────");
const gstats = db
  .prepare(
    `
    SELECT
        COUNT(*)                        AS total_glossaries,
        SUM(LENGTH(content))            AS total_bytes,
        AVG(LENGTH(content))            AS avg_bytes,
        MAX(LENGTH(content))            AS max_bytes
    FROM glossaries
`,
  )
  .get();
console.log(`  total glossaries: ${gstats.total_glossaries.toLocaleString()}`);
console.log(
  `  total size:       ${(gstats.total_bytes / 1024 / 1024).toFixed(1)} MB`,
);
console.log(`  avg per entry:    ${gstats.avg_bytes.toFixed(0)} bytes`);
console.log(`  max single entry: ${(gstats.max_bytes / 1024).toFixed(1)} KB`);

// Sample a Pixiv meta entry to see its structure
console.log("\n── Sample term_meta entries (first dict) ─────────────");
const samples = db
  .prepare(
    `
    SELECT term, mode, reading, SUBSTR(data, 1, 120) AS data_preview
    FROM term_meta WHERE dict_id = 1 LIMIT 5
`,
  )
  .all();
console.table(samples);

db.close();
