<template>
  <v-app>
    <v-layout>
      <v-navigation-drawer expand-on-hover rail :mobile="false">
        <v-list>
          <v-list-item title="Home" to="/">
            <template v-slot:prepend>
              <v-avatar color="info">
                <v-icon icon="mdi-home" size="x-small"></v-icon>
              </v-avatar>
            </template>
          </v-list-item>
        </v-list>
        <v-divider></v-divider>
        <v-list nav density="compact">
          <v-list-item
            prepend-icon="mdi-chat-question"
            title="Quiz"
            to="/dashboard"
          ></v-list-item>
          <v-list-item prepend-icon="mdi-plus" title="Add"></v-list-item>
          <v-list-item prepend-icon="mdi-minus" title="Skip"></v-list-item>
          <v-list-item
            prepend-icon="mdi-magnify"
            title="Search"
            to="/search"
          ></v-list-item>
          <v-list-item title="Levels" @click="level = level ? 0 : 3">
            <template v-slot:prepend>
              <v-avatar color="surface-light">
                <span class="text">{{ level }}</span>
              </v-avatar>
            </template>
          </v-list-item>
          <v-list-item
            prepend-icon="mdi-text-recognition"
            title="Text"
          ></v-list-item>
          <v-list-item
            prepend-icon="mdi-information-outline"
            title="About"
            to="/about"
          ></v-list-item>
        </v-list>
      </v-navigation-drawer>
      <v-container>
        <RouterView />
      </v-container>
    </v-layout>
  </v-app>
</template>

<script setup lang="ts">
import { ref } from "vue";

const level = ref(3);
</script>
