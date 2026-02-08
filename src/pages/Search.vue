<template>
  <div>
    <v-text-field
      v-model="q"
      append-icon="mdi-magnify"
      @click:append="doSearch"
    ></v-text-field>
  </div>
</template>

<script setup lang="ts">
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { onBeforeUnmount, onMounted, ref } from "vue";

const { q0 } = defineProps({
  q0: String,
});

const q = ref(q0 || "");
const clipboardCurrentText = ref<string>();
const clipboardPoll = ref<number>();

function doSearch() {}

onMounted(() => {
  clipboardPoll.value = setInterval(async () => {
    const newText = await readText();
    if (clipboardCurrentText.value === undefined) {
      clipboardCurrentText.value = newText;
      return;
    } else if (clipboardCurrentText.value === newText) {
      return;
    }

    q.value = newText;
    clipboardCurrentText.value = newText;
  }, 1000);
});

onBeforeUnmount(() => {
  clearInterval(clipboardPoll.value);
});
</script>

<style scoped></style>
