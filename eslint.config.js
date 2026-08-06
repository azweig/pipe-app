// Flat config (ESLint 9). Pragmático para RN/Expo: atrapa bugs reales (no-undef, no-dupe, unreachable…)
// sin ahogar en miles de warnings de estilo (de eso se encarga Prettier). Plain JS, sin TypeScript.
const js = require("@eslint/js")
const react = require("eslint-plugin-react")

// Globals del runtime RN/Hermes + timers/web APIs que usa el código (fetch, __DEV__, etc.).
const rnGlobals = {
  __DEV__: "readonly",
  console: "readonly",
  fetch: "readonly",
  navigator: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  requestIdleCallback: "readonly",
  cancelIdleCallback: "readonly",
  queueMicrotask: "readonly",
  Intl: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
  AbortController: "readonly",
  FormData: "readonly",
  Blob: "readonly",
  FileReader: "readonly",
  atob: "readonly",
  btoa: "readonly",
  global: "readonly",
  process: "readonly",
}

module.exports = [
  { ignores: ["node_modules/**", "android/**", "ios/**", ".expo/**", "dist/**", "web-build/**"] },
  js.configs.recommended,
  react.configs.flat.recommended,
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: rnGlobals,
    },
    settings: { react: { version: "detect" } },
    rules: {
      // ── bugs reales (mantener en error) ──
      "no-undef": "error",
      "no-const-assign": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      "no-cond-assign": ["error", "except-parens"],
      // ── ruido de estilo → apagado o warn (Prettier ya formatea) ──
      "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true, varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }], // hay muchos `catch {}` intencionales
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off", // runtime JSX automático de babel-preset-expo
      "react/no-unescaped-entities": "off",
      "react/display-name": "off",
    },
  },
  // CommonJS de tooling (este archivo, babel, jest.config, metro…)
  {
    files: ["*.config.js", "babel.config.js", "metro.config.js", "index.js"],
    languageOptions: { sourceType: "commonjs", globals: { module: "readonly", require: "readonly", process: "readonly", __dirname: "readonly" } },
  },
  // tests: globals de Jest
  {
    files: ["__tests__/**/*.js", "**/*.test.js"],
    languageOptions: {
      globals: { jest: "readonly", describe: "readonly", it: "readonly", test: "readonly", expect: "readonly", beforeEach: "readonly", afterEach: "readonly", beforeAll: "readonly", afterAll: "readonly" },
    },
  },
]
