<template>
  <div>
    <v-textarea
      class="textarea"
      v-model="q"
      clearable
      label="Paste text to analyze..."
    ></v-textarea>
    <v-btn color="info" :disabled="!q" @click="analyze">Analyze</v-btn>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { analyzeItems, newTab } from "../states/tabbed-modal";
import { invoke } from "@tauri-apps/api/core";

const q = ref("");

async function analyze() {
  if (!q) return;
  analyzeItems.value = await invoke("segment", { text: q.value });
  newTab({ is: "AnalyzeResult", title: "Result", q: q.value });
}
</script>

<style scoped>
.textarea {
  height: 70vh;
  min-height: 5em;
}
</style>
