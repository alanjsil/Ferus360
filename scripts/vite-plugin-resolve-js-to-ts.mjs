import fs from "fs";
import path from "path";

export function resolveJsToTs() {
  return {
    name: "resolve-js-to-ts",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null;
      if (!source.endsWith(".js") || source.endsWith(".d.ts")) return null;
      if (source.startsWith("\0")) return null;

      const basedir = path.dirname(importer);
      const jsPath = path.resolve(basedir, source);

      if (fs.existsSync(jsPath)) return null;

      const tsPath = jsPath.replace(/\.js$/, ".ts");
      if (fs.existsSync(tsPath)) {
        return tsPath;
      }

      const tsxPath = jsPath.replace(/\.js$/, ".tsx");
      if (fs.existsSync(tsxPath)) {
        return tsxPath;
      }

      return null;
    },
  };
}
