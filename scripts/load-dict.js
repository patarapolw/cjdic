//@ts-check

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import yauzl from "yauzl";
import crypto from "crypto";
import dotenv from "dotenv";

/** @import { DictIndex, TermEntry, TermMetaEntry, TagEntry, KanjiEntry, KanjiMetaEntry, Glossary } from '../types/yomitan.d.ts' */
/** @import { Database, Json } from '../types/supabase-yomitan.d.ts' */

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const supabaseSecretKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** @type {SupabaseClient<Database>} */
const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  db: { schema: "yomitan" },
});

// ── Config ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

const [, , zipPath, bundledFlag] = process.argv;
if (!zipPath) {
  console.error(
    "Usage: node load-yomitan-zip-to-supabase.mjs <dict.zip> [--bundled]",
  );
  process.exit(1);
}

const isBundled = bundledFlag === "--bundled";

// ── Zip reading ────────────────────────────────────────────────────────────

/** @param {yauzl.ZipFile} zipFile @param {yauzl.Entry} entry @returns {Promise<string>} */
function readEntry(zipFile, entry) {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err);
      const chunks = /** @type {Buffer[]} */ ([]);
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      stream.on("error", reject);
    });
  });
}

/**
 * Read all JSON bank files from the zip.
 * Streams each entry — does not load the whole zip into memory.
 * @param {string} path
 * @returns {Promise<Map<string, string>>}
 */
function readZipJson(path) {
  return new Promise((resolve, reject) => {
    /** @type {Map<string, string>} */
    const results = new Map();

    yauzl.open(path, { lazyEntries: true }, (err, zipFile) => {
      if (err || !zipFile) return reject(err);
      zipFile.readEntry();

      zipFile.on("entry", async (entry) => {
        const name = /** @type {string} */ (entry.fileName);
        const isBank =
          name === "index.json" ||
          name.startsWith("term_bank_") ||
          name.startsWith("term_meta_bank_") ||
          name.startsWith("tag_bank_") ||
          name.startsWith("kanji_bank_") ||
          name.startsWith("kanji_meta_bank_");

        if (isBank) {
          try {
            results.set(name, await readEntry(zipFile, entry));
          } catch (e) {
            return reject(e);
          }
        }
        zipFile.readEntry();
      });

      zipFile.on("end", () => resolve(results));
      zipFile.on("error", reject);
    });
  });
}

/**
 * Collect all entries across bank_1, bank_2, … into a flat array.
 * @template T
 * @param {Map<string, string>} files
 * @param {string} prefix
 * @returns {T[]}
 */
function collectBanks(files, prefix) {
  /** @type {T[]} */
  const results = [];
  let i = 1;
  while (files.has(`${prefix}_${i}.json`)) {
    results.push(
      ...JSON.parse(/** @type {string} */ (files.get(`${prefix}_${i}.json`))),
    );
    i++;
  }
  return results;
}

// ── Supabase helpers ───────────────────────────────────────────────────────

/** @param {string} str @returns {string} */
function sha1(str) {
  return crypto.createHash("sha1").update(str).digest("hex");
}

/**
 * Insert rows in batches, logging progress.
 * @param {'terms' | 'term_meta' | 'tags' | 'kanji' | 'kanji_meta'} table
 * @param {any[]} rows
 */
async function batchInsert(table, rows) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
    process.stdout.write(
      `\r  ${table}: ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}  `,
    );
  }
  process.stdout.write("\n");
}

/**
 * Upsert a single string value into a dedup table and return its id.
 * In-memory cache avoids a round-trip for repeated values.
 * @param {'def_tag_sets' | 'rule_sets' | 'term_tag_sets'} table
 * @param {string} column
 * @param {string} value
 * @param {Map<string, number>} cache
 * @returns {Promise<number>}
 */
async function intern(table, column, value, cache) {
  const hit = cache.get(value);
  if (hit !== undefined) return hit;

  const { data, error } = await supabase
    .from(table)
    .upsert(/** @type {any} */ ({ [column]: value }), { onConflict: column })
    .select("id")
    .single();

  if (error || !data)
    throw new Error(`intern ${table} failed: ${error?.message}`);
  cache.set(value, data.id);
  return data.id;
}

/**
 * Upsert a glossary blob by SHA-1 hash and return its id.
 * @param {Glossary[]} content
 * @param {Map<string, number>} cache
 * @returns {Promise<number>}
 */
async function internGlossary(content, cache) {
  const json = JSON.stringify(content);
  const hash = sha1(json);
  const hit = cache.get(hash);
  if (hit !== undefined) return hit;

  const { data, error } = await supabase
    .from("glossaries")
    .upsert(
      { hash, content: /** @type {Json} */ (content) },
      { onConflict: "hash" },
    )
    .select("id")
    .single();

  if (error || !data)
    throw new Error(`glossary upsert failed: ${error?.message}`);
  cache.set(hash, data.id);
  return data.id;
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log(`Reading ${zipPath}...`);
const files = await readZipJson(zipPath);

const index = /** @type {DictIndex} */ (
  JSON.parse(/** @type {string} */ (files.get("index.json")))
);
console.log(`Dictionary: ${index.title} (${index.revision})`);

// Skip if already installed
const { data: existing } = await supabase
  .from("dictionaries")
  .select("id")
  .eq("title", index.title)
  .eq("revision", index.revision)
  .maybeSingle();

if (existing) {
  console.log("Already installed — skipping.");
  process.exit(0);
}

// Register dictionary
const { data: dict, error: dictErr } = await supabase
  .from("dictionaries")
  .insert({
    title: index.title,
    revision: index.revision,
    author: index.author ?? null,
    url: index.url ?? null,
    description: index.description ?? null,
    is_bundled: isBundled,
  })
  .select("id")
  .single();

if (dictErr || !dict)
  throw new Error(`Failed to register dictionary: ${dictErr?.message}`);
const dictId = dict.id;

// Caches — one per interned table
/** @type {Map<string, number>} */ const glossaryCache = new Map();
/** @type {Map<string, number>} */ const defTagsCache = new Map();
/** @type {Map<string, number>} */ const termTagsCache = new Map();
/** @type {Map<string, number>} */ const rulesCache = new Map();

// ── Terms ──────────────────────────────────────────────────────────────────

const termEntries = collectBanks(files, "term_bank");
console.log(`Importing ${termEntries.length} terms...`);

/** @type {object[]} */
const termRows = [];

for (const entry of termEntries) {
  const [term, reading, defTags, rules, score, glossary, sequence, termTags] =
    /** @type {TermEntry} */ (entry);

  const glossaryId = await internGlossary(glossary, glossaryCache);
  const defTagsId = defTags?.trim()
    ? await intern("def_tag_sets", "tags", defTags.trim(), defTagsCache)
    : null;
  const rulesId = rules?.trim()
    ? await intern("rule_sets", "rules", rules.trim(), rulesCache)
    : null;
  const termTagsId = termTags?.trim()
    ? await intern("term_tag_sets", "tags", termTags.trim(), termTagsCache)
    : null;

  termRows.push({
    dict_id: dictId,
    term,
    reading,
    def_tags_id: defTagsId,
    rules_id: rulesId,
    score,
    glossary_id: glossaryId,
    sequence: sequence ?? null,
    term_tags_id: termTagsId,
  });
}

await batchInsert("terms", termRows);

// ── Term meta ──────────────────────────────────────────────────────────────

const metaEntries = collectBanks(files, "term_meta_bank");
console.log(`Importing ${metaEntries.length} term meta entries...`);

const metaRows = metaEntries.map((entry) => {
  const [term, mode, data] = /** @type {TermMetaEntry} */ (entry);
  return {
    dict_id: dictId,
    term,
    mode,
    reading: /** @type {any} */ (data)?.reading ?? null,
    data,
  };
});

await batchInsert("term_meta", metaRows);

// ── Tags ───────────────────────────────────────────────────────────────────

const tagEntries = collectBanks(files, "tag_bank");
console.log(`Importing ${tagEntries.length} tags...`);

const tagRows = tagEntries.map((entry) => {
  const [name, category, sortOrder, notes, score] = /** @type {TagEntry} */ (
    entry
  );
  return {
    dict_id: dictId,
    name,
    category,
    sort_order: sortOrder,
    notes,
    score,
  };
});

await batchInsert("tags", tagRows);

// ── Kanji ──────────────────────────────────────────────────────────────────

const kanjiEntries = collectBanks(files, "kanji_bank");
if (kanjiEntries.length > 0) {
  console.log(`Importing ${kanjiEntries.length} kanji...`);
  const kanjiRows = kanjiEntries.map((entry) => {
    const [character, onyomi, kunyomi, tags, meanings, stats] =
      /** @type {KanjiEntry} */ (entry);
    return {
      dict_id: dictId,
      character,
      onyomi,
      kunyomi,
      tags,
      meanings,
      stats,
    };
  });
  await batchInsert("kanji", kanjiRows);
}

// ── Kanji meta ─────────────────────────────────────────────────────────────

const kanjiMetaEntries = collectBanks(files, "kanji_meta_bank");
if (kanjiMetaEntries.length > 0) {
  console.log(`Importing ${kanjiMetaEntries.length} kanji meta entries...`);
  const kanjiMetaRows = kanjiMetaEntries.map((entry) => {
    const [kanji, mode, data] = /** @type {KanjiMetaEntry} */ (entry);
    return { dict_id: dictId, kanji, mode, data };
  });
  await batchInsert("kanji_meta", kanjiMetaRows);
}

// ── Done ───────────────────────────────────────────────────────────────────

console.log(`\nDone. Dictionary id: ${dictId}`);
