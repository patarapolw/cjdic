import { ref } from "vue";

export interface ITab {
  is: "Search" | "Info" | "AnalyzeResult";
  title: string;
  q: string;
}

export const modalTabs = ref<ITab[]>([]);

export function newTab(t: ITab) {
  modalTabs.value = [...modalTabs.value, t];
}

export interface AnalyzeItem {
  v: string;
  r: string[];
}

export const analyzeItems = ref<AnalyzeItem[]>([]);
