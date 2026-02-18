-- ── Dictionaries ───────────────────────────────────────────────────────────

CREATE TABLE yomitan.dictionaries (
    id           BIGSERIAL    PRIMARY KEY,
    title        TEXT         NOT NULL,
    revision     TEXT         NOT NULL,
    format       INTEGER      NOT NULL DEFAULT 3,
    author       TEXT,
    url          TEXT,
    description  TEXT,
    attribution  TEXT,
    is_bundled   BOOLEAN      NOT NULL DEFAULT false,
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    installed_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (title, revision)
);

-- ── Interned string tables ─────────────────────────────────────────────────

CREATE TABLE yomitan.glossaries (
    id      BIGSERIAL  PRIMARY KEY,
    hash    TEXT       NOT NULL UNIQUE,
    content JSONB      NOT NULL
);

CREATE TABLE yomitan.def_tag_sets (
    id   BIGSERIAL  PRIMARY KEY,
    tags TEXT       NOT NULL UNIQUE
);

CREATE TABLE yomitan.term_tag_sets (
    id   BIGSERIAL  PRIMARY KEY,
    tags TEXT       NOT NULL UNIQUE
);

CREATE TABLE yomitan.rule_sets (
    id    BIGSERIAL  PRIMARY KEY,
    rules TEXT       NOT NULL UNIQUE
);

-- ── Terms ──────────────────────────────────────────────────────────────────

CREATE TABLE yomitan.terms (
    id             BIGSERIAL  PRIMARY KEY,
    dict_id        BIGINT     NOT NULL REFERENCES yomitan.dictionaries(id) ON DELETE CASCADE,
    term           TEXT       NOT NULL,
    reading        TEXT       NOT NULL,
    def_tags_id    BIGINT     REFERENCES yomitan.def_tag_sets(id),
    rules_id       BIGINT     REFERENCES yomitan.rule_sets(id),
    score          INTEGER    NOT NULL DEFAULT 0,
    glossary_id    BIGINT     NOT NULL REFERENCES yomitan.glossaries(id),
    sequence       BIGINT,
    term_tags_id   BIGINT     REFERENCES yomitan.term_tag_sets(id)
);

CREATE INDEX idx_terms_term    ON yomitan.terms (term);
CREATE INDEX idx_terms_reading ON yomitan.terms (reading);
CREATE INDEX idx_terms_lookup  ON yomitan.terms (term, reading, score DESC);
CREATE INDEX idx_terms_seq     ON yomitan.terms (dict_id, sequence)
    WHERE sequence IS NOT NULL;

-- ── Term metadata ──────────────────────────────────────────────────────────

CREATE TABLE yomitan.term_meta (
    id      BIGSERIAL  PRIMARY KEY,
    dict_id BIGINT     NOT NULL REFERENCES yomitan.dictionaries(id) ON DELETE CASCADE,
    term    TEXT       NOT NULL,
    mode    TEXT       NOT NULL CHECK (mode IN ('freq', 'pitch')),
    reading TEXT,
    data    JSONB      NOT NULL
);

CREATE INDEX idx_term_meta_term ON yomitan.term_meta (term, mode);

-- ── Tags ───────────────────────────────────────────────────────────────────

CREATE TABLE yomitan.tags (
    id         BIGSERIAL  PRIMARY KEY,
    dict_id    BIGINT     NOT NULL REFERENCES yomitan.dictionaries(id) ON DELETE CASCADE,
    name       TEXT       NOT NULL,
    category   TEXT,
    sort_order INTEGER    NOT NULL DEFAULT 0,
    notes      TEXT,
    score      INTEGER    NOT NULL DEFAULT 0,
    UNIQUE (dict_id, name)
);

CREATE INDEX idx_tags_name ON yomitan.tags (name);

-- ── Kanji ──────────────────────────────────────────────────────────────────

CREATE TABLE yomitan.kanji (
    id        BIGSERIAL  PRIMARY KEY,
    dict_id   BIGINT     NOT NULL REFERENCES yomitan.dictionaries(id) ON DELETE CASCADE,
    character TEXT       NOT NULL,
    onyomi    TEXT,
    kunyomi   TEXT,
    tags      TEXT,
    meanings  JSONB      NOT NULL DEFAULT '[]',
    stats     JSONB      NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_kanji_character ON yomitan.kanji (character);

CREATE TABLE yomitan.kanji_meta (
    id      BIGSERIAL  PRIMARY KEY,
    dict_id BIGINT     NOT NULL REFERENCES yomitan.dictionaries(id) ON DELETE CASCADE,
    kanji   TEXT       NOT NULL,
    mode    TEXT       NOT NULL,
    data    JSONB      NOT NULL
);

CREATE INDEX idx_kanji_meta_kanji ON yomitan.kanji_meta (kanji);

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE yomitan.dictionaries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE yomitan.glossaries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE yomitan.def_tag_sets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE yomitan.term_tag_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE yomitan.rule_sets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE yomitan.terms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE yomitan.term_meta     ENABLE ROW LEVEL SECURITY;
ALTER TABLE yomitan.tags          ENABLE ROW LEVEL SECURITY;
ALTER TABLE yomitan.kanji         ENABLE ROW LEVEL SECURITY;
ALTER TABLE yomitan.kanji_meta    ENABLE ROW LEVEL SECURITY;

-- Grant schema usage and public read in one block
GRANT USAGE ON SCHEMA yomitan TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA yomitan TO anon, authenticated;

CREATE POLICY "public read" ON yomitan.dictionaries  FOR SELECT USING (true);
CREATE POLICY "public read" ON yomitan.glossaries    FOR SELECT USING (true);
CREATE POLICY "public read" ON yomitan.def_tag_sets  FOR SELECT USING (true);
CREATE POLICY "public read" ON yomitan.term_tag_sets FOR SELECT USING (true);
CREATE POLICY "public read" ON yomitan.rule_sets     FOR SELECT USING (true);
CREATE POLICY "public read" ON yomitan.terms         FOR SELECT USING (true);
CREATE POLICY "public read" ON yomitan.term_meta     FOR SELECT USING (true);
CREATE POLICY "public read" ON yomitan.tags          FOR SELECT USING (true);
CREATE POLICY "public read" ON yomitan.kanji         FOR SELECT USING (true);
CREATE POLICY "public read" ON yomitan.kanji_meta    FOR SELECT USING (true);
