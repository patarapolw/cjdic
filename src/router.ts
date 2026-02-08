import { createRouter, createWebHistory } from "vue-router";

import About from "./pages/About.vue";
import Analyze from "./pages/Analyze.vue";
import Dashboard from "./pages/Dashboard.vue";
import Search from "./pages/Search.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: Search },
    { path: "/search", component: Search },
    { path: "/dashboard", component: Dashboard },
    { path: "/analyze", component: Analyze },
    { path: "/about", component: About },
  ],
});

export default router;
