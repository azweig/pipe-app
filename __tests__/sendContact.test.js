// ENVIAR UN CONTACTO — faltaba en el móvil (solo estaba en la web). Llega como .vcf con leyenda, no como tarjeta
// nativa: mautrix-whatsapp no convierte ContactMessage hacia WhatsApp, solo al revés.
import { readFileSync } from "fs"

const api = readFileSync("src/api.js", "utf8")
const conv = readFileSync("src/screens/Conversation.js", "utf8")

describe("api", () => {
  it("sabe llamar a /api/send-contact", () => {
    expect(api).toContain('"/api/send-contact"')
  })
  it("manda canal y destino elegidos, no el default", () => {
    expect(api).toMatch(/sendContact[\s\S]{0,200}channel: t && t\.channel, target: t && t\.target/)
    expect(conv).toMatch(/sendContact\(convKey, nombre, target\)/)
  })
})

describe("selector en la conversación", () => {
  it("hay una entrada Contacto en el menú de adjuntar", () => {
    expect(conv).toMatch(/onPress=\{contactoStart\}/)
    expect(conv).toContain("Enviar un contacto")
  })
  it("no ofrece grupos, espacios ni tu propio hilo", () => {
    const i = conv.indexOf("async function contactoStart")
    const fn = conv.slice(i, i + 600)
    expect(fn).toMatch(/t\.key !== "self"/)
    expect(fn).toMatch(/!t\.espacio/)
    expect(fn).toMatch(/!t\.group/)
  })
  it("avisa si el server rechaza el envío", () => {
    const i = conv.indexOf("async function doSendContact")
    expect(conv.slice(i, i + 500)).toMatch(/r\.error/)
  })
})
