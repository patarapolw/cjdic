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
import { ref } from "vue";

const q = ref("");

function doSearch() {}
</script>

<style scoped></style>
