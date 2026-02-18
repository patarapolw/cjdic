//@ts-check

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import yauzl from "yauzl";
import crypto from "crypto";
import dotenv from "dotenv";

/** @import { DictIndex, TermEntry, TermMetaEntry, TagEntry, KanjiEntry, KanjiMetaEntry, Glossary } from '../types/yomitan.d.ts' */
/** @import { Database, Json } from '../types/supabase-yomitan.d.ts' */

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseSecretKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** @type {SupabaseClient<Database>} */
const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  db: { schema: "yomitan" },
});

// ── Config ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const [, , zipPath, bundledFlag] = process.argv;
if (!zipPath) {
  console.error(`Usage: node ${process.argv[1]} <dict.zip> [--bundled]"`);
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
 * Stream entries from zip and read index.json.
 * @param {string} path
 * @returns {Promise<string>}
 */
async function readIndexFromZip(path) {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (err, zipFile) => {
      if (err || !zipFile) return reject(err);
      zipFile.readEntry();

      zipFile.on("entry", async (entry) => {
        if (entry.fileName === "index.json") {
          try {
            const content = await readEntry(zipFile, entry);
            resolve(content);
          } catch (e) {
            reject(e);
          }
        } else {
          zipFile.readEntry();
        }
      });

      zipFile.on("error", reject);
    });
  });
}

/**
 * Stream and process bank files from zip.
 * Calls callback for each matching file without loading all into memory.
 * @param {string} path
 * @param {(name: string, content: string) => Promise<void>} callback
 * @returns {Promise<void>}
 */
async function streamZipBankFiles(path, callback) {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (err, zipFile) => {
      if (err || !zipFile) return reject(err);
      zipFile.readEntry();

      zipFile.on("entry", async (entry) => {
        const name = /** @type {string} */ (entry.fileName);
        const isBank =
          name.startsWith("term_bank_") ||
          name.startsWith("term_meta_bank_") ||
          name.startsWith("tag_bank_") ||
          name.startsWith("kanji_bank_") ||
          name.startsWith("kanji_meta_bank_");

        if (isBank) {
          try {
            const content = await readEntry(zipFile, entry);
            await callback(name, content);
          } catch (e) {
            return reject(e);
          }
        }
        zipFile.readEntry();
      });

      zipFile.on("end", () => resolve());
      zipFile.on("error", reject);
    });
  });
}

// ── Supabase helpers ───────────────────────────────────────────────────────

/** @param {string} str @returns {string} */
function sha1(str) {
  return crypto.createHash("sha1").update(str).digest("hex");
}

/**
 * Retry a promise-returning function with exponential backoff.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {string} context
 * @returns {Promise<T>}
 */
async function withRetry(fn, context) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `  ${context} failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
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

  const { data, error } = await withRetry(
    async () =>
      await supabase
        .from(table)
        .upsert(/** @type {any} */ ({ [column]: value }), {
          onConflict: column,
        })
        .select("id")
        .single(),
    `intern ${table}`,
  );

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

  const { data, error } = await withRetry(
    async () =>
      await supabase
        .from("glossaries")
        .upsert(
          { hash, content: /** @type {Json} */ (content) },
          { onConflict: "hash" },
        )
        .select("id")
        .single(),
    "glossary upsert",
  );

  if (error || !data)
    throw new Error(`glossary upsert failed: ${error?.message}`);
  cache.set(hash, data.id);
  return data.id;
}

// ── Streaming processors ───────────────────────────────────────────────────

/**
 * Stream and process term_bank files, insert in batches.
 * @param {string} zipPath
 * @param {number} dictId
 * @param {Map<string, number>} glossaryCache
 * @param {Map<string, number>} defTagsCache
 * @param {Map<string, number>} termTagsCache
 * @param {Map<string, number>} rulesCache
 * @returns {Promise<void>}
 */
async function processTermsStreaming(
  zipPath,
  dictId,
  glossaryCache,
  defTagsCache,
  termTagsCache,
  rulesCache,
) {
  /** @type {any[]} */
  let batch = [];
  let totalProcessed = 0;

  await streamZipBankFiles(zipPath, async (name, content) => {
    if (!name.startsWith("term_bank_")) return;

    const entries = JSON.parse(content);

    for (const entry of entries) {
      const [
        term,
        reading,
        defTags,
        rules,
        score,
        glossary,
        sequence,
        termTags,
      ] = /** @type {TermEntry} */ (entry);

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

      batch.push({
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

      if (batch.length >= BATCH_SIZE) {
        await withRetry(
          async () => await supabase.from("terms").insert(batch),
          `Terms batch insert (${totalProcessed} - ${totalProcessed + batch.length})`,
        );
        totalProcessed += batch.length;
        process.stdout.write(`\r  terms: ${totalProcessed} (in progress)  `);
        batch = [];
      }
    }
  });

  if (batch.length > 0) {
    await withRetry(
      async () => await supabase.from("terms").insert(batch),
      `Terms final batch insert (${totalProcessed} - ${totalProcessed + batch.length})`,
    );
    totalProcessed += batch.length;
  }
  process.stdout.write(`\r  terms: ${totalProcessed} total\n`);
}

/**
 * Stream and process term_meta_bank files, insert in batches.
 * @param {string} zipPath
 * @param {number} dictId
 * @returns {Promise<void>}
 */
async function processTermMetaStreaming(zipPath, dictId) {
  /** @type {any[]} */
  let batch = [];
  let totalProcessed = 0;

  await streamZipBankFiles(zipPath, async (name, content) => {
    if (!name.startsWith("term_meta_bank_")) return;

    const entries = JSON.parse(content);

    for (const entry of entries) {
      const [term, mode, data] = /** @type {TermMetaEntry} */ (entry);
      batch.push({
        dict_id: dictId,
        term,
        mode,
        reading: /** @type {any} */ (data)?.reading ?? null,
        data,
      });

      if (batch.length >= BATCH_SIZE) {
        await withRetry(
          async () => await supabase.from("term_meta").insert(batch),
          `Term meta batch insert (${totalProcessed} - ${totalProcessed + batch.length})`,
        );
        totalProcessed += batch.length;
        process.stdout.write(
          `\r  term_meta: ${totalProcessed} (in progress)  `,
        );
        batch = [];
      }
    }
  });

  if (batch.length > 0) {
    await withRetry(
      async () => await supabase.from("term_meta").insert(batch),
      `Term meta final batch insert (${totalProcessed} - ${totalProcessed + batch.length})`,
    );
    totalProcessed += batch.length;
  }
  process.stdout.write(`\r  term_meta: ${totalProcessed} total\n`);
}

/**
 * Stream and process tag_bank files, insert in batches.
 * @param {string} zipPath
 * @param {number} dictId
 * @returns {Promise<void>}
 */
async function processTagsStreaming(zipPath, dictId) {
  /** @type {any[]} */
  let batch = [];
  let totalProcessed = 0;

  await streamZipBankFiles(zipPath, async (name, content) => {
    if (!name.startsWith("tag_bank_")) return;

    const entries = JSON.parse(content);

    for (const entry of entries) {
      const [name, category, sortOrder, notes, score] =
        /** @type {TagEntry} */ (entry);
      batch.push({
        dict_id: dictId,
        name,
        category,
        sort_order: sortOrder,
        notes,
        score,
      });

      if (batch.length >= BATCH_SIZE) {
        await withRetry(
          async () => await supabase.from("tags").insert(batch),
          `Tags batch insert (${totalProcessed} - ${totalProcessed + batch.length})`,
        );
        totalProcessed += batch.length;
        process.stdout.write(`\r  tags: ${totalProcessed} (in progress)  `);
        batch = [];
      }
    }
  });

  if (batch.length > 0) {
    await withRetry(
      async () => await supabase.from("tags").insert(batch),
      `Tags final batch insert (${totalProcessed} - ${totalProcessed + batch.length})`,
    );
    totalProcessed += batch.length;
  }
  process.stdout.write(`\r  tags: ${totalProcessed} total\n`);
}

/**
 * Stream and process kanji_bank files, insert in batches.
 * @param {string} zipPath
 * @param {number} dictId
 * @returns {Promise<void>}
 */
async function processKanjiStreaming(zipPath, dictId) {
  /** @type {any[]} */
  let batch = [];
  let totalProcessed = 0;

  await streamZipBankFiles(zipPath, async (name, content) => {
    if (!name.startsWith("kanji_bank_")) return;

    const entries = JSON.parse(content);

    for (const entry of entries) {
      const [character, onyomi, kunyomi, tags, meanings, stats] =
        /** @type {KanjiEntry} */ (entry);
      batch.push({
        dict_id: dictId,
        character,
        onyomi,
        kunyomi,
        tags,
        meanings,
        stats,
      });

      if (batch.length >= BATCH_SIZE) {
        await supabase.from("kanji").insert(batch);
        totalProcessed += batch.length;
        process.stdout.write(`\r  kanji: ${totalProcessed} (in progress)  `);
        batch = [];
      }
    }
  });

  if (batch.length > 0) {
    await withRetry(
      async () => await supabase.from("kanji").insert(batch),
      `Kanji final batch insert (${totalProcessed} - ${totalProcessed + batch.length})`,
    );
    totalProcessed += batch.length;
  }
  process.stdout.write(`\r  kanji: ${totalProcessed} total\n`);
}

/**
 * Stream and process kanji_meta_bank files, insert in batches.
 * @param {string} zipPath
 * @param {number} dictId
 * @returns {Promise<void>}
 */
async function processKanjiMetaStreaming(zipPath, dictId) {
  /** @type {any[]} */
  let batch = [];
  let totalProcessed = 0;

  await streamZipBankFiles(zipPath, async (name, content) => {
    if (!name.startsWith("kanji_meta_bank_")) return;

    const entries = JSON.parse(content);

    for (const entry of entries) {
      const [kanji, mode, data] = /** @type {KanjiMetaEntry} */ (entry);
      batch.push({ dict_id: dictId, kanji, mode, data });

      if (batch.length >= BATCH_SIZE) {
        await withRetry(
          async () => await supabase.from("kanji_meta").insert(batch),
          `Kanji meta batch insert (${totalProcessed} - ${totalProcessed + batch.length})`,
        );
        totalProcessed += batch.length;
        process.stdout.write(
          `\r  kanji_meta: ${totalProcessed} (in progress)  `,
        );
        batch = [];
      }
    }
  });

  if (batch.length > 0) {
    await withRetry(
      async () => await supabase.from("kanji_meta").insert(batch),
      `Kanji meta final batch insert (${totalProcessed} - ${totalProcessed + batch.length})`,
    );
    totalProcessed += batch.length;
  }
  process.stdout.write(`\r  kanji_meta: ${totalProcessed} total\n`);
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log(`Reading ${zipPath}...`);
const indexJson = await readIndexFromZip(zipPath);

const index = /** @type {DictIndex} */ (JSON.parse(indexJson));
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

// Process each data type by streaming from zip
console.log("Importing data...");

await processTermsStreaming(
  zipPath,
  dictId,
  glossaryCache,
  defTagsCache,
  termTagsCache,
  rulesCache,
);

await processTermMetaStreaming(zipPath, dictId);
await processTagsStreaming(zipPath, dictId);
await processKanjiStreaming(zipPath, dictId);
await processKanjiMetaStreaming(zipPath, dictId);

// ── Done ───────────────────────────────────────────────────────────────────

console.log(`\nDone. Dictionary id: ${dictId}`);
