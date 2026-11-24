import { cp } from "node:fs/promises";

await cp("docs", "dist/docs", { recursive: true });
