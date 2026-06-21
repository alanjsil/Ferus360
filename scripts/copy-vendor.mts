import { copyFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const src = fileURLToPath(new URL("../node_modules/chart.js/dist/chart.umd.min.js", import.meta.url));
const dest = fileURLToPath(new URL("../public/vendor/chart.umd.min.js", import.meta.url));

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
