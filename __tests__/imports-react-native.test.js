// TODO LO QUE SE USA DE react-native TIENE QUE ESTAR IMPORTADO.
//
// Un componente usado sin importar no rompe el build ni el parser: revienta en RUNTIME, y sólo cuando se ejecuta esa
// línea. Encontrado dos veces el mismo día: `AppState` (habría reventado al minimizar la app) y `Alert` (al tocar
// "marcar todo como leído"). Las dos las descubrí revisando a mano; ninguna herramienta las iba a atrapar.
//
// Se comprueba lo que de verdad pasa: un identificador usado como `X.algo(` o como `<X ...>` que no está en el
// import de react-native.
const { readFileSync, readdirSync } = require("fs")
const { join } = require("path")

const RAIZ = join(__dirname, "..", "src")
// Lo que puede venir de react-native y se usa en este proyecto. No es la lista completa de la librería: es la lista
// de lo que si falta duele. Agregá acá lo que uses.
const DE_RN = ["View", "Text", "ScrollView", "FlatList", "SectionList", "TouchableOpacity", "TouchableHighlight",
  "Pressable", "TextInput", "Image", "Modal", "Switch", "Alert", "AppState", "RefreshControl", "ActivityIndicator",
  "StatusBar", "Linking", "Platform", "Dimensions", "Animated", "Keyboard", "KeyboardAvoidingView", "Share", "Vibration"]

function archivosJs(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...archivosJs(p))
    else if (/\.jsx?$/.test(e.name)) out.push(p)
  }
  return out
}

describe("imports de react-native", () => {
  const archivos = archivosJs(RAIZ)
  it("hay archivos que revisar", () => expect(archivos.length).toBeGreaterThan(5))

  for (const f of archivos) {
    const crudo = readFileSync(f, "utf8")
    if (!/from ["']react-native["']/.test(crudo)) continue
    // Fuera comentarios y textos: `// para el <Image>` no es un uso, y marcarlo convierte el test en ruido.
    const src = crudo
      .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/([^:])\/\/.*$/gm, "$1 ")
      .replace(/`[^`]*`/g, "``").replace(/"[^"\n]*"/g, '""').replace(/'[^'\n]*'/g, "''")
    // Y se cuentan los nombres importados de CUALQUIER módulo, no sólo de react-native: KeyboardAvoidingView puede
    // venir de react-native-keyboard-controller, y exigirlo del paquete base marcaría un uso perfectamente válido.
    const importados = new Set()
    for (const m of crudo.matchAll(/import\s*(?:(\w+)\s*,\s*)?\{([^}]*)\}\s*from/g)) {
      if (m[1]) importados.add(m[1])
      for (const n of m[2].split(",")) { const x = n.trim().split(/\s+as\s+/).pop(); if (x) importados.add(x.trim()) }
    }
    for (const m of crudo.matchAll(/import\s+(\w+)\s+from/g)) importados.add(m[1])
    const rel = f.slice(RAIZ.length + 1)
    it(`${rel}: usa sólo lo que importa`, () => {
      const faltan = DE_RN.filter((n) => new RegExp(`\\b${n}\\.[a-zA-Z]|<${n}[\\s/>]`).test(src) && !importados.has(n))
      expect(faltan).toEqual([])
    })
  }
})
