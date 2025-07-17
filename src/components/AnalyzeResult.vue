<template>
  <div>
    <ul>
      <li v-for="(it, i) in analyzeItems" :key="i">
        {{ it.v }} ({{ it.r.join(", ") }})
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { analyzeItems } from "../states/tabbed-modal";
</script>

<style scoped></style>
