import { createRouter, createWebHistory } from "vue-router";

import About from "./components/About.vue";
import Dashboard from "./components/Dashboard.vue";
import Search from "./components/Search.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: Dashboard },
    { path: "/search", component: Search },
    { path: "/dashboard", component: Dashboard },
    { path: "/about", component: About },
  ],
});

export default router;
