// ESPACIOS EN EL MÓVIL — paridad con la web. Faltaban excepciones, subespacios e icono: los espacios solo se podían
// administrar de verdad desde la web. Como acá no montamos componentes de React Native, el test lee el fuente y
// verifica el cableado (mismo enfoque que los tests estáticos del server).
import { readFileSync } from "fs"

const api = readFileSync("src/api.js", "utf8")
const espacio = readFileSync("src/screens/Espacio.js", "utf8")
const inbox = readFileSync("src/screens/Inbox.js", "utf8")

describe("api de espacios", () => {
  // los 7 que usa la web; si el server gana uno nuevo y el móvil no, esto lo canta
  const endpoints = [
    "/api/espacios", "/api/espacio/view", "/api/espacio", "/api/espacio/delete",
    "/api/espacio/rule", "/api/espacio/rule/delete", "/api/espacio/exception", "/api/espacio/exception/delete",
  ]
  it.each(endpoints)("el móvil sabe llamar a %s", (e) => {
    expect(api).toContain('"' + e)
  })
})

describe("pantalla de espacio", () => {
  it("puede agregar y quitar excepciones", () => {
    expect(espacio).toContain("espacioAddException")
    expect(espacio).toContain("espacioRemoveException")
  })
  it("puede crear subespacios (con parent) y navegar a los hijos", () => {
    expect(espacio).toMatch(/saveEspacio\(\{[^}]*parent: id/)
    expect(espacio).toContain("d.children")
  })
  it("guarda el icono al renombrar", () => {
    expect(espacio).toMatch(/saveEspacio\(\{ id, name: v, icon: ic \}\)/)
  })
  it("eliminar el espacio pide confirmación (nunca de un toque)", () => {
    expect(espacio).toContain("Alert.alert(\"Eliminar espacio\"")
    expect(espacio).toMatch(/style: "cancel"/)
  })
})

describe("crear espacio desde la bandeja", () => {
  it("manda también el icono", () => {
    expect(inbox).toMatch(/saveEspacio\(\{ name: v, icon: newIcon/)
  })
})

describe("regla: no se valida deshabilitando el botón", () => {
  // el submit siempre se puede tocar; si falta algo se dice con un error inline, no con un botón muerto
  const fuentes = ["src/screens/Espacio.js", "src/screens/Inbox.js", "src/screens/Settings.js", "src/screens/Conversation.js"]
  it.each(fuentes)("%s no deshabilita botones por campo vacío", (f) => {
    const src = readFileSync(f, "utf8")
    const malos = src.split("\n").filter((l) => /disabled=\{[^}]*\.trim\(\)/.test(l))
    expect(malos).toEqual([])
  })
})
