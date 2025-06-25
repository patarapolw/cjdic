import { ref } from "vue";

export interface ITab {
  is: "Search" | "Info";
  title: string;
  q: string;
}

export const modalTabs = ref<ITab[]>([]);

export function newTab(t: ITab) {
  modalTabs.value = [...modalTabs.value, t];
}
