CREATE OR REPLACE FUNCTION yomitan.lookup_term(query TEXT)
RETURNS TABLE (
    term            TEXT,
    reading         TEXT,
    score           INTEGER,
    sequence        BIGINT,
    glossary        JSONB,
    definition_tags TEXT,
    term_tags       TEXT,
    rules           TEXT,
    dict_title      TEXT,
    dict_id         BIGINT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        t.term,
        t.reading,
        t.score,
        t.sequence,
        g.content           AS glossary,
        dt.tags             AS definition_tags,
        tt.tags             AS term_tags,
        r.rules             AS rules,
        d.title             AS dict_title,
        d.id                AS dict_id
    FROM yomitan.terms t
    JOIN  yomitan.dictionaries  d  ON d.id  = t.dict_id
    JOIN  yomitan.glossaries    g  ON g.id  = t.glossary_id
    LEFT JOIN yomitan.def_tag_sets  dt ON dt.id = t.def_tags_id
    LEFT JOIN yomitan.term_tag_sets tt ON tt.id = t.term_tags_id
    LEFT JOIN yomitan.rule_sets      r ON r.id  = t.rules_id
    WHERE t.term = query
       OR t.reading = query
    ORDER BY d.sort_order, t.score DESC;
$$;

CREATE OR REPLACE FUNCTION yomitan.lookup_term_meta(query TEXT)
RETURNS TABLE (
    term    TEXT,
    mode    TEXT,
    reading TEXT,
    data    JSONB
)
LANGUAGE sql
STABLE
AS $$
    SELECT term, mode, reading, data
    FROM yomitan.term_meta
    WHERE term = query
    ORDER BY mode, id;
$$;

CREATE OR REPLACE FUNCTION yomitan.lookup_kanji(query TEXT)
RETURNS TABLE (
    "character"  TEXT,
    onyomi     TEXT,
    kunyomi    TEXT,
    tags       TEXT,
    meanings   JSONB,
    stats      JSONB,
    dict_title TEXT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        k.character,
        k.onyomi,
        k.kunyomi,
        k.tags,
        k.meanings,
        k.stats,
        d.title AS dict_title
    FROM yomitan.kanji k
    JOIN yomitan.dictionaries d ON d.id = k.dict_id
    WHERE k.character = query
    ORDER BY d.sort_order;
$$;

-- Grant execute on all functions to anon and authenticated
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA yomitan TO anon, authenticated;
