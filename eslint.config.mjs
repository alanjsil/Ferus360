import js from "@eslint/js";
import globals from "globals";

const noUnusedVarsWarn = {
  "no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
    },
  ],
};

export default [
  js.configs.recommended,

  // MAIN PROCESS (Electron + Node, CommonJS)
  {
    files: ["main.js", "preload.js", "dialog-senha-preload.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "error",
      ...noUnusedVarsWarn,
    },
  },
  // RENDERER / FRONTEND (ESM)
  {
    files: ["public/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        Chart: "readonly",
      },
    },
    rules: {
      ...noUnusedVarsWarn,
    },
  },
  // TESTES (ESM)
  {
    files: ["test/**/*.js", "test/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.vitest,
      },
    },
    rules: {
      ...noUnusedVarsWarn,
    },
  },
  // MAIN PROCESS SERVICES (CommonJS, Node)
  {
    files: ["services/**/*.js", "src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "error",
      ...noUnusedVarsWarn,
    },
  },
  // CONFIG FILES NA RAIZ (ESM)
  {
    files: ["vitest.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...noUnusedVarsWarn,
    },
  },
  // SCRIPTS .MJS (ESM) NA RAIZ
  {
    files: ["*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...noUnusedVarsWarn,
    },
  },
  // SCRIPTS EM SUBDIRETÓRIOS (.ts via tsx, .mjs legacy)
  {
    files: ["scripts/**/*.mts", "scripts/**/*.mjs", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...noUnusedVarsWarn,
    },
  },
  // IGNORAR
  {
    ignores: [
      "dist/**",
      "dist-ts/**",
      "node_modules/**",
      "venv/**",
      "public/js/vendor/**",
      "**/*.min.js",
    ],
  },
];
