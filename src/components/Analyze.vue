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
import { newTab } from "../states/tabbed-modal";

const q = ref("");

function analyze() {
  newTab({ is: "Search", q: q.value, title: q.value });
}
</script>

<style scoped>
.textarea {
  height: 70vh;
  min-height: 5em;
}
</style>
