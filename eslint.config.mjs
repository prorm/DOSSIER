import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "playwright-report/**", "test-results/**", "reactbits-llm/**", "scripts/build-reactbits-catalog.mjs", "next-env.d.ts"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Vendored React Bits components: kept close to upstream to ease updates.
    files: ["src/components/reactbits/**"],
    rules: { "react-hooks/exhaustive-deps": "off", "react-hooks/refs": "off", "react-hooks/set-state-in-effect": "off", "react-hooks/immutability": "off", "react-hooks/purity": "off" },
  },
];

export default config;
