// COLA DE ENVÍO — lo que se prueba acá es la decisión que separa los dos errores caros: reintentar para siempre
// algo que nunca va a andar, o rendirse con algo que sí habría salido. Un 502 es reintentable; un 400 no.
// Además, la cola completa contra un "server" falso: que reintente, que no duplique y que respete la espera.
import AsyncStorage from "@react-native-async-storage/async-storage"
import { detener, clasificar, esperaReintento, nuevoMsgId, encolar, flush, configurar, pendientes, pendientesDe, suscribir } from "../src/outbox"

afterEach(() => detener())

describe("clasificar el resultado de un intento", () => {
  it("sin error → salió", () => expect(clasificar(null, { ok: true })).toBe("ok"))
  it("fallo de red (sin código) → reintentar", () => expect(clasificar(new Error("network"), null)).toBe("reintentar"))
  it("502/503 → reintentar", () => {
    expect(clasificar({ code: 502 }, null)).toBe("reintentar")
    expect(clasificar({ code: 503 }, null)).toBe("reintentar")
  })
  it("429/408 → reintentar (transitorios)", () => {
    expect(clasificar({ code: 429 }, null)).toBe("reintentar")
    expect(clasificar({ code: 408 }, null)).toBe("reintentar")
  })
  it("400/403/404 → definitivo, o quedaría en bucle", () => {
    expect(clasificar({ code: 400, message: "sin canal" }, null)).toBe("definitivo")
    expect(clasificar({ code: 404 }, null)).toBe("definitivo")
  })
  it("{pending} del server → esperar, NO mandar de nuevo", () => expect(clasificar(null, { pending: true })).toBe("reintentar"))
  it("200 con {error} adentro → definitivo (el hub responde así)", () => expect(clasificar(null, { error: "sin canal" })).toBe("definitivo"))
})

describe("espera entre reintentos", () => {
  it("crece", () => {
    expect(esperaReintento(1)).toBe(2000)
    expect(esperaReintento(3)).toBe(8000)
  })
  it("tiene techo de 1 min", () => expect(esperaReintento(99)).toBe(60000))
})

describe("msgId", () => {
  it("no se repite (si se repitiera, el server dedupearía mensajes legítimos)", () => {
    expect(new Set(Array.from({ length: 500 }, () => nuevoMsgId())).size).toBe(500)
  })
})

describe("la cola contra un server falso", () => {
  const item = (msgId, key = "k1") => ({ msgId, key, text: "hola", ts: Date.now() })
  const conServer = (fn) => configurar(fn)
  beforeEach(() => { pendientes().splice(0, pendientes().length) })

  it("un envío que sale se va de la cola", async () => {
    conServer(async () => ({ status: 200, data: { ok: true } }))
    await encolar(item(nuevoMsgId()))
    expect(pendientes()).toHaveLength(0)
  })

  it("un 502 lo deja en la cola para reintentar — no se pierde el mensaje", async () => {
    const id = nuevoMsgId()
    conServer(async () => { const e = new Error("bad gateway"); e.code = 502; throw e })
    await encolar(item(id))
    expect(pendientes().map((i) => i.msgId)).toContain(id)
    expect(pendientes().find((i) => i.msgId === id).intentos).toBe(1)
    // y no se reintenta al toque: la espera creciente lo frena
    let llamadas = 0
    conServer(async () => { llamadas++; return { status: 200, data: { ok: true } } })
    await flush()
    expect(llamadas).toBe(0)
  })

  it("un 400 lo saca de la cola y avisa el motivo (reintentar no lo arreglaría)", async () => {
    const id = nuevoMsgId()
    const vistos = []
    const off = suscribir((ev) => vistos.push(ev))
    conServer(async () => { const e = new Error("no encuentro por qué canal responder"); e.code = 400; throw e })
    await encolar(item(id, "k2"))
    off()
    expect(pendientesDe("k2")).toHaveLength(0)
    const fallo = vistos.find((v) => v.tipo === "fallo")
    expect(fallo).toBeTruthy()
    expect(fallo.motivo).toBe("no encuentro por qué canal responder")
  })

  it("el mismo msgId viaja en cada intento — es lo que evita el duplicado", async () => {
    const id = nuevoMsgId()
    const enviados = []
    conServer(async (it) => { enviados.push(it.msgId); const e = new Error("caído"); e.code = 502; throw e })
    await encolar(item(id, "k3"))
    pendientes().find((i) => i.msgId === id).nextAt = 0 // como si ya hubiera pasado la espera
    conServer(async (it) => { enviados.push(it.msgId); return { status: 200, data: { ok: true, dedup: true } } })
    await flush()
    expect(enviados).toEqual([id, id])
    expect(pendientesDe("k3")).toHaveLength(0)
  })
})

describe("recuperar la cola de la sesión anterior", () => {
  it("lo que quedó sin enviar al cerrar la app se levanta al abrirla", async () => {
    const { iniciar, configurar: cfg, pendientes: pend } = require("../src/outbox")
    pend().splice(0, pend().length)
    await AsyncStorage.setItem("pipe_outbox_v1", JSON.stringify([{ msgId: "quedo-pendiente", key: "k9", text: "de antes", ts: 1, intentos: 1, nextAt: Date.now() + 60000 }]))
    cfg(async () => { const e = new Error("caído"); e.code = 502; throw e })
    await iniciar()
    expect(pend().map((i2) => i2.msgId)).toContain("quedo-pendiente")
    detener()
  })
})
