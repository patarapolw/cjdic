<template>
  <v-form @submit.prevent="doSearch">
    <v-text-field
      v-model="q"
      append-icon="mdi-magnify"
      @click:append="doSearch"
    ></v-text-field>
  </v-form>
  <div>
    <ol>
      <li v-for="(row, i) in entries" :key="i">
        <details>
          <summary>
            {{
              [
                `${row.term} \u3010${row.reading}\u3011  [${row.dict_title}]`,
                row.def_tags && `tags: ${row.def_tags}`,
                row.rules && `rules: ${row.rules}`,
                row.term_tags && `termTags: ${row.term_tags}`,
                `score: ${row.score}`,
                row.sequence && `seq: ${row.sequence}`,
              ]
                .filter(Boolean)
                .join("  \u00b7  ")
            }}
          </summary>
          <code><pre v-text="stringify(row.glossary)"></pre></code>
        </details>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import Database from "@tauri-apps/plugin-sql";
import { stringify } from "yaml";
import { onBeforeUnmount, onMounted, ref } from "vue";

const { q0 } = defineProps({
  q0: String,
});

const q = ref(q0 || "");
const clipboardCurrentText = ref<string>();
const clipboardPoll = ref<number>();
const db = ref<Database>();

const entries = ref<any[]>([]);

function doSearch() {
  if (!db.value) return;
  db.value
    .select<{ term: string; glossary_json: string }[]>(
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
      WHERE t.term = ? OR t.reading = ?
      ORDER BY t.score DESC
      `,
      [q.value, q.value],
    )
    .then((rs) => {
      entries.value = rs.map((r) => {
        const { glossary_json, ...o } = r;

        return Object.assign(o, {
          glossary: JSON.parse(glossary_json),
        });
      });
    });
}

onMounted(() => {
  Database.load("sqlite:yomitan.db").then((dbVal) => {
    db.value = dbVal;
  });

  clipboardPoll.value = window.setInterval(async () => {
    const newText = await readText().catch((e) => {
      console.error(e);
      return "";
    });
    if (!newText) return;

    // if (clipboardCurrentText.value === undefined) {
    //   clipboardCurrentText.value = newText;
    //   return;
    // }
    if (clipboardCurrentText.value === newText) {
      return;
    }

    q.value = newText;
    clipboardCurrentText.value = newText;
  }, 1000);
});

onBeforeUnmount(() => {
  clearInterval(clipboardPoll.value);

  if (db.value) {
    db.value.close();
  }
});
</script>

<style scoped>
summary {
  cursor: pointer;
}
</style>
