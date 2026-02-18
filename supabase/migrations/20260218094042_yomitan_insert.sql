CREATE POLICY "service_role insert" ON yomitan.dictionaries  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role insert" ON yomitan.glossaries    FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role insert" ON yomitan.def_tag_sets  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role insert" ON yomitan.term_tag_sets FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role insert" ON yomitan.rule_sets     FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role insert" ON yomitan.terms         FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role insert" ON yomitan.term_meta     FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role insert" ON yomitan.tags          FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role insert" ON yomitan.kanji         FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role insert" ON yomitan.kanji_meta    FOR INSERT TO service_role WITH CHECK (true);

GRANT USAGE ON SCHEMA yomitan TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA yomitan TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA yomitan TO service_role;
