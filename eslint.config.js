import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    // `.claude/worktrees` holds throwaway checkouts of this same repo. Each
    // carries its own tsconfig, which leaves typescript-eslint unable to pick
    // a single tsconfigRootDir and fails every file with a parsing error —
    // so `npm run lint` is unusable locally while one exists, and a real
    // error can reach CI unnoticed.
    ignores: [
      "dist",
      "node_modules",
      ".worktrees",
      ".claude",
      "tsconfig.tsbuildinfo",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // App.tsx holds most of the app's state, and these four rules flag
      // effect and memoization patterns there that need real restructuring
      // rather than a mechanical fix. Kept visible as warnings so they can be
      // worked through deliberately instead of blocking every build.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // A leading underscore is the codebase's marker for a binding that only
      // exists to document a signature, as in `vi.fn(async (_text: string) => …)`.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Repo tooling runs on Node, not in the browser, so it needs those globals
    // declared — otherwise every console.log reads as an undefined variable.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      // Test doubles legitimately take loosely-typed arguments.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Must stay last: turns off rules that would fight Prettier.
  prettierConfig,
);
