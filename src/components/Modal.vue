<template>
  <v-dialog
    v-model="isModal"
    max-width="1200"
    height="100%"
    contained
    scrollable
  >
    <v-card>
      <v-tabs v-model="iTab">
        <v-tab v-for="(t, i) in modalTabs" :key="i" :value="i">
          {{ t.title }}
        </v-tab>
      </v-tabs>

      <v-card-text>
        <v-tabs-window v-model="iTab">
          <v-tabs-window-item v-for="(t, i) in modalTabs" :key="i" :value="i">
            <Search :q0="t.q" />
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { modalTabs } from "../states/tabbed-modal";
import Search from "./Search.vue";

const isModal = ref(false);
const iTab = ref(0);

watch(
  () => modalTabs.value[0],
  (t) => {
    if (t) {
      isModal.value = true;
      iTab.value = 0;
    } else {
      isModal.value = false;
    }
  }
);

watch(isModal, (b) => {
  if (!b) {
    modalTabs.value = [];
  }
});
</script>

<style scoped></style>
