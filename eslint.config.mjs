import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agents/**",
    ".stryker-tmp/**",
    "reports/mutation/**",
    "public/sw.js",
    "public/vendor/**",
    "public/onesignal/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    rules: {
      // Allow variables prefixed with _ to be intentionally unused
      // (e.g. useSyncExternalStore hooks called for side-effects, not return value)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
