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
          <ul>
            <li v-for="(g, j) in row.glossary" :key="j">
              <GlossaryRenderer :glossary="g" />
            </li>
          </ul>
        </details>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import Database from "@tauri-apps/plugin-sql";
import {
  defineComponent,
  h,
  VNode,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";
import type {
  Glossary,
  GlossaryText,
  GlossaryImage,
  GlossaryStructuredContent,
  GlossaryDeinflection,
  StructuredContentNode,
} from "../../types/yomitan";

const { q0 } = defineProps({
  q0: String,
});

const q = ref(q0 || "");
const clipboardCurrentText = ref<string>();
const clipboardPoll = ref<number>();
const db = ref<Database>();

const entries = ref<any[]>([]);

function renderStructuredContent(node: StructuredContentNode): VNode | string {
  if (typeof node === "string") {
    return node;
  }

  if (Array.isArray(node)) {
    return h("div", node.map(renderStructuredContent));
  }

  // Line break
  if ("tag" in node && node.tag === "br") {
    return h("br");
  }

  // Image
  if ("tag" in node && node.tag === "img") {
    const img = node as any;
    return h("img", {
      src: img.path,
      width: img.width,
      height: img.height,
      alt: img.alt,
      style: { imageRendering: img.imageRendering || "auto" },
    });
  }

  // Link
  if ("tag" in node && node.tag === "a") {
    const link = node as any;
    return h("a", { href: link.href }, [
      link.content ? renderStructuredContent(link.content) : "",
    ]);
  }

  // Block/container elements (span, div, ol, ul, li, ruby, table, etc.)
  if ("tag" in node) {
    const block = node as any;
    const children = block.content
      ? Array.isArray(block.content)
        ? block.content.map(renderStructuredContent)
        : [renderStructuredContent(block.content)]
      : [];

    return h(
      block.tag,
      { style: block.style, title: block.title, open: block.open },
      children,
    );
  }

  return "";
}

function renderGlossary(glossary: Glossary): VNode | string {
  // Plain string
  if (typeof glossary === "string") {
    return glossary;
  }

  // GlossaryText
  if ("type" in glossary && glossary.type === "text") {
    return (glossary as GlossaryText).text;
  }

  // GlossaryImage
  if ("type" in glossary && glossary.type === "image") {
    const img = glossary as GlossaryImage;
    return h("img", {
      src: img.path,
      width: img.width,
      height: img.height,
      title: img.title,
      alt: img.alt,
      style: { imageRendering: img.imageRendering || "auto" },
    });
  }

  // GlossaryStructuredContent
  if ("type" in glossary && glossary.type === "structured-content") {
    const sc = glossary as GlossaryStructuredContent;
    return renderStructuredContent(sc.content);
  }

  // GlossaryDeinflection
  if (Array.isArray(glossary) && glossary.length === 2) {
    const [term, rules] = glossary as GlossaryDeinflection;
    return h("small", [`${term} (${rules.join(", ")})`]);
  }

  return "";
}

const GlossaryRenderer = defineComponent({
  props: { glossary: Object },
  setup(props) {
    return () => renderGlossary(props.glossary as Glossary);
  },
});

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
        const glossary = JSON.parse(glossary_json);

        return Object.assign(o, { glossary });
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
