// Helpers de presentación puros (sin deps nativas): iniciales, color estable, hora, preview, iconos, bucket.
import { initials, color, ago, hhmm, espIcon, bucketCat, preview } from "../src/util"

describe("initials", () => {
  it("toma la inicial del nombre y apellido", () => {
    expect(initials("Juan Perez")).toBe("JP")
  })
  it("con un solo nombre da una letra", () => {
    expect(initials("Madonna")).toBe("M")
  })
  it("vacío o inválido → '?'", () => {
    expect(initials("")).toBe("?")
    expect(initials()).toBe("?")
  })
  it("ignora espacios extra", () => {
    expect(initials("  ana   maria ")).toBe("AM")
  })
})

describe("color", () => {
  it("es estable para el mismo nombre", () => {
    expect(color("Ana")).toBe(color("Ana"))
  })
  it("devuelve un color de la paleta", () => {
    const palette = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"]
    expect(palette).toContain(color("Cualquiera"))
  })
  it("nombre vacío no rompe", () => {
    expect(typeof color("")).toBe("string")
  })
})

describe("hhmm", () => {
  it("formatea HH:MM con cero a la izquierda (hora local)", () => {
    const d = new Date(2021, 0, 1, 9, 5) // usa la misma zona local que hhmm → determinista
    expect(hhmm(d.getTime())).toBe("09:05")
  })
})

describe("ago", () => {
  it("sin timestamp → cadena vacía", () => {
    expect(ago(0)).toBe("")
    expect(ago(null)).toBe("")
  })
  it("hace segundos → 'ahora'", () => {
    expect(ago(Date.now() - 1000)).toBe("ahora")
  })
  it("hace un par de horas → 'Nh'", () => {
    expect(ago(Date.now() - 2 * 3600000)).toBe("2h")
  })
  it("hace unos minutos → 'Nm'", () => {
    expect(ago(Date.now() - 5 * 60000)).toBe("5m")
  })
})

describe("espIcon", () => {
  it("toma el primer token del icono", () => {
    expect(espIcon("🏫 Lord Byron 👨‍🎓")).toBe("🏫")
  })
  it("vacío → carpeta por defecto", () => {
    expect(espIcon("")).toBe("📁")
    expect(espIcon(null)).toBe("📁")
  })
})

describe("bucketCat", () => {
  it("un espacio siempre cae en 'todo'", () => {
    expect(bucketCat({ espacio: "x", bucket: "family" })).toBe("todo")
  })
  it("spam oculto", () => {
    expect(bucketCat({ bucket: "spam" })).toBe("spam")
  })
  it("grupo → 'grupos'", () => {
    expect(bucketCat({ group: true })).toBe("grupos")
  })
  it("relación family/amigos/else", () => {
    expect(bucketCat({ bucket: "family" })).toBe("familia")
    expect(bucketCat({ bucket: "amigos" })).toBe("amigos")
    expect(bucketCat({})).toBe("trabajo")
  })
})

describe("preview", () => {
  it("texto: colapsa espacios", () => {
    expect(preview({ text: "hola   mundo\nadiós" })).toBe("hola mundo adiós")
  })
  it("media conocida → placeholder etiquetado", () => {
    expect(preview({ mediaType: "image" })).toBe("🖼 Imagen")
    expect(preview({ mediaType: "audio" })).toBe("🎤 Audio")
  })
  it("media desconocida → adjunto genérico", () => {
    expect(preview({ mediaType: "otro" })).toBe("📎 Adjunto")
  })
  it("sin texto ni media → cadena vacía", () => {
    expect(preview({})).toBe("")
  })
})
