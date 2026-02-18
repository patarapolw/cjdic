import path from "path";

export const dbPath = path.join(
  process.env.USERPROFILE,
  "AppData/Roaming",
  "cc.polv.cjdic",
  "yomitan.db",
);
