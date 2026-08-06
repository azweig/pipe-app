// Jest con el preset de Expo (transforma RN/Expo con babel-preset-expo). Los tests actuales cubren
// lógica PURA (helpers, merge/dedup, estado de sesión secreta en memoria) → no requieren mocks nativos.
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.js"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  // no transformamos node_modules salvo los paquetes RN/Expo que se publican en ESM/Flow.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))",
  ],
}
