// @ts-check
import { readFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import { createHash } from "crypto";
import JSZip from "jszip";
import Database from "better-sqlite3";
import { dbPath as DEFAULT_DB_PATH } from "./paths.js";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * @typedef {[
 *   term: string,
 *   reading: string,
 *   definitionTags: string | null,
 *   rules: string,
 *   score: number,
 *   glossary: unknown[],
 *   sequence: number,
 *   termTags: string
 * ]} TermEntry
 */

/** @typedef {[term: string, mode: string, data: unknown]} MetaEntry */
/** @typedef {[name: string, category: string, sortOrder: number, notes: string, score: number]} TagEntry */

// ── Config ─────────────────────────────────────────────────────────────────

const SCHEMA_VERSION = "1";

// ── Schema ─────────────────────────────────────────────────────────────────

/** @param {import('better-sqlite3').Database} db */
function createSchema(db) {
  db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA synchronous  = NORMAL;
        PRAGMA cache_size   = -65536;
        PRAGMA temp_store   = MEMORY;

        CREATE TABLE IF NOT EXISTS schema_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS dictionaries (
            id           INTEGER PRIMARY KEY,
            title        TEXT    NOT NULL,
            revision     TEXT    NOT NULL,
            author       TEXT,
            url          TEXT,
            description  TEXT,
            is_bundled   INTEGER NOT NULL DEFAULT 1,
            sort_order   INTEGER NOT NULL DEFAULT 0,
            installed_at TEXT    NOT NULL DEFAULT (datetime('now')),
            UNIQUE (title, revision)
        );

        CREATE TABLE IF NOT EXISTS glossaries (
            id      INTEGER PRIMARY KEY,
            hash    TEXT NOT NULL UNIQUE,
            content TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS def_tag_sets (
            id   INTEGER PRIMARY KEY,
            tags TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS term_tag_sets (
            id   INTEGER PRIMARY KEY,
            tags TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS rule_sets (
            id    INTEGER PRIMARY KEY,
            rules TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS terms (
            id           INTEGER PRIMARY KEY,
            dict_id      INTEGER NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
            term         TEXT    NOT NULL,
            reading      TEXT    NOT NULL,
            def_tags_id  INTEGER REFERENCES def_tag_sets(id),
            rules_id     INTEGER REFERENCES rule_sets(id),
            score        INTEGER NOT NULL DEFAULT 0,
            glossary_id  INTEGER NOT NULL REFERENCES glossaries(id),
            sequence     INTEGER,
            term_tags_id INTEGER REFERENCES term_tag_sets(id)
        );

        CREATE INDEX IF NOT EXISTS idx_terms_term    ON terms (term);
        CREATE INDEX IF NOT EXISTS idx_terms_reading ON terms (reading);
        CREATE INDEX IF NOT EXISTS idx_terms_lookup  ON terms (term, reading, score DESC);
        CREATE INDEX IF NOT EXISTS idx_terms_seq     ON terms (dict_id, sequence)
            WHERE sequence IS NOT NULL;

        CREATE TABLE IF NOT EXISTS term_meta (
            id      INTEGER PRIMARY KEY,
            dict_id INTEGER NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
            term    TEXT    NOT NULL,
            mode    TEXT    NOT NULL CHECK (mode IN ('freq', 'pitch')),
            reading TEXT,
            data    TEXT    NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_term_meta_term ON term_meta (term, mode);

        CREATE TABLE IF NOT EXISTS tags (
            id         INTEGER PRIMARY KEY,
            dict_id    INTEGER NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
            name       TEXT    NOT NULL,
            category   TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            notes      TEXT,
            score      INTEGER NOT NULL DEFAULT 0,
            UNIQUE (dict_id, name)
        );

        CREATE TABLE IF NOT EXISTS kanji (
            id       INTEGER PRIMARY KEY,
            dict_id  INTEGER NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
            kanji    TEXT    NOT NULL,
            onyomi   TEXT,
            kunyomi  TEXT,
            tags     TEXT,
            meanings TEXT NOT NULL DEFAULT '[]',
            stats    TEXT NOT NULL DEFAULT '{}'
        );

        CREATE INDEX IF NOT EXISTS idx_kanji ON kanji (kanji);

        CREATE TABLE IF NOT EXISTS kanji_meta (
            id      INTEGER PRIMARY KEY,
            dict_id INTEGER NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
            kanji   TEXT    NOT NULL,
            mode    TEXT    NOT NULL,
            data    TEXT    NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_kanji_meta ON kanji_meta (kanji);
    `);

  if (
    !db.prepare(`SELECT 1 FROM schema_meta WHERE key = 'schema_version'`).get()
  ) {
    db.prepare(
      `INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?)`,
    ).run(SCHEMA_VERSION);
    db.prepare(
      `INSERT INTO schema_meta (key, value) VALUES ('created_at', datetime('now'))`,
    ).run();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** @param {string} str */
const sha1 = (str) => createHash("sha1").update(str).digest("hex");

/**
 * Intern a string into a dedup table, returning its rowid.
 * @param {import('better-sqlite3').Statement} insert
 * @param {import('better-sqlite3').Statement} select
 * @param {Map<string, number>} cache
 * @param {string} value
 * @returns {number}
 */
function intern(insert, select, cache, value) {
  const hit = cache.get(value);
  if (hit !== undefined) return hit;
  insert.run(value);
  const id = /** @type {{ id: number }} */ (select.get(value)).id;
  cache.set(value, id);
  return id;
}

/**
 * Count how many bank files exist for a given prefix.
 * @param {JSZip} zip
 * @param {string} prefix
 * @returns {number}
 */
function countBanks(zip, prefix) {
  let i = 1;
  while (zip.file(`${prefix}_${i}.json`)) i++;
  return i - 1;
}

// ── Import ─────────────────────────────────────────────────────────────────

/**
 * @param {import('better-sqlite3').Database} db
 * @param {JSZip} zip
 * @param {{ title: string, revision: string, author?: string, url?: string, description?: string }} index
 */
async function importDict(db, zip, index) {
  if (
    db
      .prepare(`SELECT 1 FROM dictionaries WHERE title = ? AND revision = ?`)
      .get(index.title, index.revision)
  ) {
    console.log("  Already installed — skipping.");
    return;
  }

  // Prepare all statements once, reuse across banks
  const stmts = {
    insertDict: db.prepare(
      `INSERT INTO dictionaries (title, revision, author, url, description, is_bundled) VALUES (?, ?, ?, ?, ?, 1)`,
    ),
    insertGlossary: db.prepare(
      `INSERT OR IGNORE INTO glossaries (hash, content) VALUES (?, ?)`,
    ),
    selectGlossary: db.prepare(`SELECT id FROM glossaries WHERE hash = ?`),
    insertDefTags: db.prepare(
      `INSERT OR IGNORE INTO def_tag_sets (tags) VALUES (?)`,
    ),
    selectDefTags: db.prepare(`SELECT id FROM def_tag_sets WHERE tags = ?`),
    insertTermTags: db.prepare(
      `INSERT OR IGNORE INTO term_tag_sets (tags) VALUES (?)`,
    ),
    selectTermTags: db.prepare(`SELECT id FROM term_tag_sets WHERE tags = ?`),
    insertRules: db.prepare(
      `INSERT OR IGNORE INTO rule_sets (rules) VALUES (?)`,
    ),
    selectRules: db.prepare(`SELECT id FROM rule_sets WHERE rules = ?`),
    insertTerm: db.prepare(
      `INSERT INTO terms (dict_id, term, reading, def_tags_id, rules_id, score, glossary_id, sequence, term_tags_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertMeta: db.prepare(
      `INSERT INTO term_meta (dict_id, term, mode, reading, data) VALUES (?, ?, ?, ?, ?)`,
    ),
    insertTag: db.prepare(
      `INSERT OR IGNORE INTO tags (dict_id, name, category, sort_order, notes, score) VALUES (?, ?, ?, ?, ?, ?)`,
    ),
  };

  /** @type {Map<string, number>} */ const glossaryCache = new Map();
  /** @type {Map<string, number>} */ const defTagsCache = new Map();
  /** @type {Map<string, number>} */ const termTagsCache = new Map();
  /** @type {Map<string, number>} */ const rulesCache = new Map();

  // Register dictionary and get its id
  stmts.insertDict.run(
    index.title,
    index.revision,
    index.author ?? null,
    index.url ?? null,
    index.description ?? null,
  );
  const dictId = /** @type {{ id: number }} */ (
    db.prepare(`SELECT last_insert_rowid() AS id`).get()
  ).id;

  // ── Term banks — one bank at a time, each in its own transaction ───────
  // One large transaction over all 270k rows would hold everything in
  // the WAL file. Per-bank transactions keep memory flat and allow
  // SQLite to checkpoint between banks.

  const termBankCount = countBanks(zip, "term_bank");
  let termTotal = 0;

  for (let i = 1; i <= termBankCount; i++) {
    const file = zip.file(`term_bank_${i}.json`);
    if (!file) break;

    // Parse this bank — held in memory only for the duration of its transaction
    const entries = /** @type {TermEntry[]} */ (
      JSON.parse(await file.async("text"))
    );

    const insertBank = db.transaction(() => {
      for (const [
        term,
        reading,
        defTags,
        rules,
        score,
        glossary,
        sequence,
        termTags,
      ] of entries) {
        const glossaryJson = JSON.stringify(glossary);
        const hash = sha1(glossaryJson);
        let glossaryId = glossaryCache.get(hash);
        if (glossaryId === undefined) {
          stmts.insertGlossary.run(hash, glossaryJson);
          glossaryId = /** @type {{ id: number }} */ (
            stmts.selectGlossary.get(hash)
          ).id;
          glossaryCache.set(hash, glossaryId);
        }

        const defTagsId = defTags?.trim()
          ? intern(
              stmts.insertDefTags,
              stmts.selectDefTags,
              defTagsCache,
              defTags.trim(),
            )
          : null;
        const rulesId = rules?.trim()
          ? intern(
              stmts.insertRules,
              stmts.selectRules,
              rulesCache,
              rules.trim(),
            )
          : null;
        const termTagsId = termTags?.trim()
          ? intern(
              stmts.insertTermTags,
              stmts.selectTermTags,
              termTagsCache,
              termTags.trim(),
            )
          : null;

        stmts.insertTerm.run(
          dictId,
          term,
          reading,
          defTagsId,
          rulesId,
          score,
          glossaryId,
          sequence ?? null,
          termTagsId,
        );
      }
    });

    insertBank();
    termTotal += entries.length;
    process.stdout.write(
      `\r  term_bank: ${i}/${termBankCount} — ${termTotal.toLocaleString()} terms`,
    );
  }
  console.log();

  // ── Term meta banks ────────────────────────────────────────────────────
  const metaBankCount = countBanks(zip, "term_meta_bank");
  let metaTotal = 0;

  for (let i = 1; i <= metaBankCount; i++) {
    const file = zip.file(`term_meta_bank_${i}.json`);
    if (!file) break;
    const entries = /** @type {MetaEntry[]} */ (
      JSON.parse(await file.async("text"))
    );

    db.transaction(() => {
      for (const [term, mode, data] of entries) {
        const reading = /** @type {any} */ (data)?.reading ?? null;
        stmts.insertMeta.run(dictId, term, mode, reading, JSON.stringify(data));
      }
    })();

    metaTotal += entries.length;
  }
  if (metaTotal)
    console.log(`  term_meta: ${metaTotal.toLocaleString()} entries`);

  // ── Tag banks ──────────────────────────────────────────────────────────
  const tagBankCount = countBanks(zip, "tag_bank");
  let tagTotal = 0;

  for (let i = 1; i <= tagBankCount; i++) {
    const file = zip.file(`tag_bank_${i}.json`);
    if (!file) break;
    const entries = /** @type {TagEntry[]} */ (
      JSON.parse(await file.async("text"))
    );

    db.transaction(() => {
      for (const [name, category, sortOrder, notes, tagScore] of entries) {
        stmts.insertTag.run(
          dictId,
          name,
          category ?? null,
          sortOrder,
          notes ?? null,
          tagScore,
        );
      }
    })();

    tagTotal += entries.length;
  }
  if (tagTotal) console.log(`  tags: ${tagTotal.toLocaleString()} entries`);

  console.log(`  Dictionary id: ${dictId}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

const script = process.argv[1];
const [, , zipPath, dbPath = DEFAULT_DB_PATH] = process.argv;

if (!zipPath) {
  console.error(`Usage: node ${script} <input.zip> [output.db]`);
  console.error(`       output.db defaults to: ${DEFAULT_DB_PATH}`);
  process.exit(1);
}

if (!existsSync(zipPath)) {
  console.error(`File not found: ${zipPath}`);
  process.exit(1);
}

console.log(`zip:    ${zipPath}`);
console.log(`db:     ${dbPath}\n`);

const zip = await JSZip.loadAsync(await readFile(zipPath));

const indexFile = zip.file("index.json");
if (!indexFile) {
  console.error("Missing index.json in zip");
  process.exit(1);
}
const index = JSON.parse(await indexFile.async("text"));
console.log(`Dictionary: ${index.title} (${index.revision})\n`);

const sizeBefore = existsSync(dbPath) ? statSync(dbPath).size : 0;

const db = new Database(dbPath);
createSchema(db);

const startMs = Date.now();
await importDict(db, zip, index);

console.log("\nRunning VACUUM...");
db.exec("VACUUM");
db.close();

const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
const sizeAfter = statSync(dbPath).size;
const mbBefore = (sizeBefore / 1024 / 1024).toFixed(1);
const mbAfter = (sizeAfter / 1024 / 1024).toFixed(1);
const mbAdded = ((sizeAfter - sizeBefore) / 1024 / 1024).toFixed(1);

console.log(`Done in ${elapsed}s`);
console.log(`  ${dbPath}`);
console.log(`  ${mbBefore} MB → ${mbAfter} MB (+${mbAdded} MB)`);
