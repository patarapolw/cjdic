<template>
  <div>
    <v-sheet class="d-flex justify-center">
      <v-btn class="text-none text-subtitle-1" color="secondary" rounded="lg">
        <span class="item">Start Quiz</span>
        <span class="item d-flex-text" v-if="nRemaining + nNew > 0">
          {{ "(" }}
          <span>{{ nRemaining }}</span>
          <small v-if="nNew">+{{ nNew }}</small>
          {{ ")" }}
        </span>
      </v-btn>
    </v-sheet>
    <v-sheet class="d-flex-text justify-center mt-4">
      <span class="item" lang="zh-CN">汉字:</span>
      <span class="item">{{ nHan }}</span>
      <span>,</span>
      <span class="item" lang="zh-CN">生词:</span>
      <span class="item">{{ nVoc }} </span>
      <span class="item">{{ `(${Math.round(percentCorrect * 100)}%)` }}</span>
    </v-sheet>
    <v-sheet class="ma-4">
      <v-menu v-for="(c, i) in allHan" :key="i">
        <template v-slot:activator="{ props }">
          <v-btn icon v-bind="props">
            <v-avatar color="info" size="large" lang="zh-CN">
              {{ c }}
            </v-avatar>
          </v-btn>
        </template>
        <v-list>
          <v-list-item>
            <span class="text-h1" lang="zh-CN" style="font-family: serif">
              {{ c }}
            </span>
          </v-list-item>
          <v-divider></v-divider>
          <v-list-item style="text-align: center">Open</v-list-item>
        </v-list>
      </v-menu>
    </v-sheet>
  </div>
</template>

<script lang="ts" setup>
import { ref } from "vue";

const nRemaining = ref(46);
const nNew = ref(1);

const nHan = ref(402);
const nVoc = ref(1166);
const percentCorrect = ref(0.48);

const allHan = ref("汉字火曜日");
</script>

<style lang="scss" scoped>
.d-flex-text {
  display: flex;
  flex-direction: row;
  align-items: end;
}

.item:not(:first-child) {
  margin-left: 0.3em;
}
</style>
