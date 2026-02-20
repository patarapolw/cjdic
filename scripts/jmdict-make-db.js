//@ts-check

import Database from "better-sqlite3";
import { readFile } from "fs/promises";
import { MongoClient, Db, Collection } from "mongodb";

/** @import { Kanjidic2, JMnedict, JMdict } from "@scriptin/jmdict-simplified-types" */

async function loadKanjidic2(filename = "tmp/kanjidic2.json") {
  return /** @type {Kanjidic2} */ (
    JSON.parse(await readFile(filename, { encoding: "utf-8" }))
  );
}

async function loadJMnedict(filename = "tmp/jmnedict.json") {
  return /** @type {JMnedict} */ (
    JSON.parse(await readFile(filename, { encoding: "utf-8" }))
  );
}

/** @typedef{Pick<Record<string, string>, 'sd'>} */

async function buildSQLite(
  mongoUrl = "mongodb://root:example@localhost:27017",
  output = "src-tauri/resources/jmdict.db",
) {
  const outdb = Database(output);
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db("jmdict");

    const col = {
      meta: db.collection("meta"),
      kanji: db.collection("kanjidic"),
      jmne: db.collection("jmne"),
      jm: db.collection("jm"),
    };

    outdb.exec(/* sql */ `
      CREATE TABLE IF NOT EXISTS meta (
        tableName     TEXT NOT NULL PRIMARY KEY,
        jsonVersion   TEXT NOT NULL,
        dictDate      TEXT NOT NULL,
        tags          JSON,
        extra         JSON
      );

      CREATE INDEX IF NOT EXISTS meta_dictDate ON meta (dictDate);
    `);

    outdb.exec(/* sql */ `
      CREATE TABLE IF NOT EXISTS kanjidic (
        literal       TEXT NOT NULL PRIMARY KEY,
        zh_pinyin     TEXT,   -- string[] from readingMeaning.groups*.readings*.value[type="pinyin"]
        ko_h          TEXT,   -- string[] from readingMeaning.groups*.readings*.value[type="korean_h"]
        ja_on         TEXT,   -- string[] from readingMeaning.groups*.readings*.value[type="ja_on"]
        ja_kun        TEXT,   -- string[] from readingMeaning.groups*.readings*.value[type="ja_kun"]
        ja_en         TEXT,   -- string[] from readingMeaning.groups*.meanings*.value[lang="en"]
        ja_nanori     TEXT,   -- string[] from readingMeaning.nanori
        ja_grade      INT,    -- int from misc.grade
        ja_frequency  INT,    -- int from misc.frequency
        ja_jlptLevel  INT,    -- int from misc.jlptLevel
        extra         JSON
      );

      CREATE INDEX IF NOT EXISTS kanjidic_zh_pinyin     ON kanjidic (zh_pinyin);
      CREATE INDEX IF NOT EXISTS kanjidic_ko_h          ON kanjidic (ko_h);
      CREATE INDEX IF NOT EXISTS kanjidic_ja_on         ON kanjidic (ja_on);
      CREATE INDEX IF NOT EXISTS kanjidic_ja_kun        ON kanjidic (ja_kun);
      CREATE INDEX IF NOT EXISTS kanjidic_ja_en         ON kanjidic (ja_en);
      CREATE INDEX IF NOT EXISTS kanjidic_ja_nanori     ON kanjidic (ja_nanori);
      CREATE INDEX IF NOT EXISTS kanjidic_ja_grade      ON kanjidic (ja_grade);
      CREATE INDEX IF NOT EXISTS kanjidic_ja_frequency  ON kanjidic (ja_frequency);
      CREATE INDEX IF NOT EXISTS kanjidic_ja_jlptLevel  ON kanjidic (ja_jlptLevel);
    `);

    outdb.exec(/* sql */ `
      CREATE TABLE IF NOT EXISTS jmne (
        id            TEXT NOT NULL PRIMARY KEY,
        kanji         TEXT,   -- string[] from kanji*.text
        kana          TEXT,   -- string[] from kana*.text
        translation   TEXT,   -- string[] from translation*.translation*
        extra         JSON
      );

      CREATE INDEX IF NOT EXISTS jmne_kanji         ON jmne (kanji);
      CREATE INDEX IF NOT EXISTS jmne_kana          ON jmne (kana);
      CREATE INDEX IF NOT EXISTS jmne_translation   ON jmne (translation);
    `);

    /**
     *
     * @param {Record<string, any>} r
     */
    const flattenValue = (r) => {
      for (const [k, v] of Object.entries(r)) {
        if (v && typeof v === "object") {
          r[k] = JSON.stringify(v);
        }
      }
      return r;
    };

    {
      const stmt = outdb.prepare(
        `INSERT INTO meta
        VALUES (@tableName, @version, @dictDate, @tags, NULL)`,
      );

      for await (const r of col.meta.find()) {
        r.tags = r.tags || null;
        stmt.run(flattenValue(r));
      }
    }

    {
      const stmt = outdb.prepare(
        `INSERT INTO kanjidic
        VALUES (@literal,
          @zh_pinyin,
          @ko_h,
          @ja_on, @ja_kun, @ja_en, @ja_nanori,
          @ja_grade, @ja_frequency, @ja_jlptLevel,
        NULL)`,
      );

      /** @type {Database.Transaction<(rs: any[]) => void>} */
      const tr = outdb.transaction((rs) => {
        rs.map((r) => stmt.run(flattenValue(r)));
      });

      const BATCH = 1000;
      const rs = [];

      for await (const r of col.kanji.find().project({
        literal: 1,
        readingGroups: "$readingMeaning.groups",
        ja_nanori: "$readingMeaning.nanori",
        ja_grade: "$misc.grade",
        ja_frequency: "$misc.frequency",
        ja_jlptLevel: "$misc.jlptLevel",
      })) {
        const { readingGroups, ...rElse } = r;
        /**
         *
         * @param {string} type
         * @returns
         */
        const getReading = (type) =>
          /** @type {any[]} */ (readingGroups)
            .flatMap(({ readings }) => readings)
            .filter((r) => r.type === type)
            .map((r) => r.value);

        const getMeaning = (lang = "en") =>
          /** @type {any[]} */ (readingGroups)
            .flatMap(({ meanings }) => meanings)
            .filter((r) => r.lang === lang)
            .map((r) => r.value);

        rs.push({
          ...rElse,
          zh_pinyin: getReading("pinyin"),
          ko_h: getReading("korean_h"),
          ja_on: getReading("ja_on"),
          ja_kun: getReading("ja_kun"),
          ja_en: getMeaning("en"),
        });

        if (rs.length > BATCH) {
          tr(rs.splice(0, BATCH));
        }
      }

      tr(rs);
    }
  } finally {
    await client.close();
    outdb.close();
  }
}

export async function loadToMongo(
  mongoUrl = "mongodb://root:example@localhost:27017",
) {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db("jmdict");

    const col = {
      meta: db.collection("meta"),
      kanjidic: db.collection("kanjidic"),
      jmne: db.collection("jmne"),
      jm: db.collection("jm"),
    };

    await col.meta.createIndex({ tableName: 1 });

    console.log("mongo init");

    await (async (colData = col.kanjidic, tableName = "kanji") => {
      const { characters: entries, ...meta } = await loadKanjidic2();
      const oldMeta = await col.meta.findOne({ tableName });

      if (oldMeta) {
        if (oldMeta.dictDate === meta.dictDate) {
          return;
        }
        await colData.deleteMany();
        await col.meta.deleteOne({ _id: oldMeta._id });
      }

      await colData.insertMany(entries);
      await col.meta.insertOne({ ...meta, tableName });

      console.log(`mongo ${tableName} loaded`);
    })();

    await (async (colData = col.jmne, tableName = "jmne") => {
      const { words: entries, ...meta } = await loadJMnedict();
      const oldMeta = await col.meta.findOne({ tableName });

      if (oldMeta) {
        if (oldMeta.dictDate === meta.dictDate) {
          return;
        }
        await colData.deleteMany();
        await col.meta.deleteOne({ _id: oldMeta._id });
      }

      await colData.insertMany(entries);
      await col.meta.insertOne({ ...meta, tableName });

      console.log(`mongo ${tableName} loaded`);
    })();
  } finally {
    await client.close();
  }
}

/**
 *
 * @param {(m: { db: Db, col: Record<'meta' | 'kanjidic' | 'jmne' | 'jm', Collection> }) => Promise<any>} asyncFn
 * @param {string} mongoUrl
 * @returns
 */
export async function runMongo(
  asyncFn,
  mongoUrl = "mongodb://root:example@localhost:27017",
) {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db("jmdict");

    const col = {
      meta: db.collection("meta"),
      kanjidic: db.collection("kanjidic"),
      jmne: db.collection("jmne"),
      jm: db.collection("jm"),
    };

    const output = await asyncFn({ db, col });
    return output;
  } finally {
    await client.close();
  }
}

if (import.meta.main) {
  await buildSQLite();
}
