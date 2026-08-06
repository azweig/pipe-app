// Mocks de módulos nativos para los tests de lógica pura (no hay dispositivo/JSI en CI).
// AsyncStorage trae su mock oficial; SecureStore/FileSystem se stubean en memoria.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
)

jest.mock("expo-secure-store", () => {
  const store = new Map()
  return {
    getItemAsync: async (k) => (store.has(k) ? store.get(k) : null),
    setItemAsync: async (k, v) => void store.set(k, String(v)),
    deleteItemAsync: async (k) => void store.delete(k),
  }
})

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///test/",
  readAsStringAsync: async () => "",
  writeAsStringAsync: async () => {},
  deleteAsync: async () => {},
  getInfoAsync: async () => ({ exists: false }),
}))
