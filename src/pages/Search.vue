<template>
  <v-form @submit.prevent="doSearch">
    <v-text-field
      v-model="q"
      append-icon="mdi-magnify"
      autocomplete="off"
      @click:append="doSearch"
    ></v-text-field>
  </v-form>
  <div>
    <ol v-if="entries.length">
      <template v-for="(row, i) in entries" :key="i">
        <li v-if="i < rowsShown">
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
      </template>
      <button
        type="button"
        v-if="rowsShown < entries.length"
        @click="
          rowsShown += maxRows;
          runSearch();
        "
      >
        More...
      </button>
    </ol>
    <div v-else>No results 😿</div>
  </div>
</template>

<script setup lang="ts">
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import {
  defineComponent,
  h,
  VNode,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type {
  Glossary,
  GlossaryText,
  GlossaryImage,
  GlossaryStructuredContent,
  GlossaryDeinflection,
  StructuredContentNode,
} from "../../types/yomitan";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";

const { q0 } = defineProps({
  q0: String,
});

const q = ref(q0 || "");
const entries = ref<any[]>([]);

const maxRows = 25;
const rowsShown = ref(maxRows);

let prevQ = "";
let searchTimeout = 0;
let requestId = 0;
let clipboardCurrentText = "";
let clipboardPoll = 0;

watch(q, () => doSearch());

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
      style: {
        imageRendering: img.imageRendering || "auto",
        width: `${img.width}em`,
        height: `${img.height}em`,
      },
    });
  }

  // Link
  if ("tag" in node && node.tag === "a") {
    const link = node as any;
    const { href, content } = link;

    return h(
      "a",
      {
        href,
        onClick: (ev) => {
          ev.preventDefault();
          if (typeof href !== "string") return;

          if (/^https?:\/\//.test(href)) {
            openUrl(href);
          } else {
            const querySearch = "?query=";
            if (href.startsWith(querySearch)) {
              q.value = href.substring(querySearch.length) + " ";
            }
          }

          return false;
        },
      },
      [content ? renderStructuredContent(content) : ""],
    );
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
  // debounce rapid keystrokes
  if (searchTimeout) clearTimeout(searchTimeout);

  if (!q.value) {
    entries.value = [];
    return;
  }

  if (prevQ === q.value) return;
  prevQ = q.value;

  searchTimeout = window.setTimeout(() => {
    runSearch(true);
  }, 250);
}

function runSearch(isNew = false) {
  const qTerm =
    q.value.trim().replace(/[%_\\]/g, "\\$&") +
    (q.value.endsWith(" ") ? "" : "%");
  const qReading = qTerm;

  const limit = maxRows + 1;
  const offset = isNew ? 0 : entries.value.length;

  const thisRequest = ++requestId;

  invoke<any[]>("search_terms", {
    qTerm,
    qReading,
    limit,
    offset,
  })
    .then((rs) => {
      if (thisRequest !== requestId) return; // stale

      const mapped = rs.map((r) => {
        const glossary = JSON.parse(r.glossary_json);
        if (!r.reading) {
          if (
            Array.isArray(glossary) &&
            glossary.every((c) => typeof c === "string")
          ) {
            r.reading = glossary.join("; ");
          }
        }
        return Object.assign(r, { glossary });
      });

      if (isNew) {
        entries.value = mapped;
        rowsShown.value = maxRows;
      } else {
        entries.value = entries.value.concat(mapped);
      }
    })
    .catch((e) => {
      console.error("search_terms failed", e);
    });
}

onMounted(() => {
  // DB access happens via Rust `search_terms` command; nothing to open here.

  clipboardPoll = window.setInterval(async () => {
    const newText = await readText().catch((e) => {
      console.error(e);
      return "";
    });
    if (!newText) return;

    // if (clipboardCurrentText.value === undefined) {
    //   clipboardCurrentText.value = newText;
    //   return;
    // }
    if (clipboardCurrentText === newText) {
      return;
    }

    q.value = newText;
    clipboardCurrentText = newText;
  }, 1000);
});

onBeforeUnmount(() => {
  clearInterval(clipboardPoll);
});
</script>

<style scoped>
summary {
  cursor: pointer;
}
</style>
