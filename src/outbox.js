// COLA DE ENVÍO — un 502 no significa "no se envió". Puede cortarse ANTES de que el pedido llegue (seguro
// reintentar) o DESPUÉS de que el mensaje salió (reintentar lo duplicaría). Por eso cada mensaje lleva un `msgId`
// propio que se REPITE en cada reintento: el server lo reserva y, si ya salió, devuelve el resultado viejo.
// Vive fuera de React y se persiste en AsyncStorage: sobrevive a cerrar la app y a quedarse sin señal.
import AsyncStorage from "@react-native-async-storage/async-storage"
import { sendMsgCola } from "./api"

// El emisor se INYECTA (configurar) en vez de llamarse directo: así la cola se puede probar contra un server falso
// y no queda atada al cliente HTTP. Por defecto es el real.

const KEY = "pipe_outbox_v1"
const MAX = 200

export const nuevoMsgId = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)

// espera creciente: 2s, 4s, 8s… con techo de 1 min. Rápido si fue un hipo, sin martillar un hub caído.
export const esperaReintento = (intentos) => Math.min(60000, 2000 * Math.pow(2, Math.max(0, intentos - 1)))

// Qué hacer según cómo terminó el intento. Pura y aparte para poder probarla: acá se decide la diferencia entre
// "reintentar para siempre" y "perder el mensaje", que son los dos errores caros.
export function clasificar(err, data) {
  if (err) {
    const code = Number(err.code)
    if (!code) return "reintentar"           // sin red / el hub no responde
    if (code >= 500) return "reintentar"     // 502/503: reinició o se cayó
    if (code === 429 || code === 408) return "reintentar"
    return "definitivo"                      // 400/403/404: reintentar no lo arregla
  }
  if (data && data.pending) return "reintentar" // el server avisa que otro reintento lo está mandando
  if (data && data.error) return "definitivo"
  return "ok"
}

let items = []
let escuchas = []
let timer = null
let corriendo = false
let listo = false
let enviar = sendMsgCola

const persistir = () => { AsyncStorage.setItem(KEY, JSON.stringify(items.slice(-MAX))).catch(() => {}) }
function avisar(ev = { tipo: "cambio" }) { persistir(); for (const f of escuchas) f(ev) }

export const pendientes = () => items
export const pendientesDe = (key) => items.filter((i) => i.key === key)
export function suscribir(fn) {
  escuchas.push(fn)
  return () => { escuchas = escuchas.filter((f) => f !== fn) }
}

// Carga lo que quedó de la sesión anterior y arranca. Idempotente: llamarla dos veces no duplica la cola.
export async function iniciar() {
  if (listo) return
  listo = true
  // FUSIONAR, no reemplazar: leer del disco es asíncrono y para cuando termina ya puede haber algo encolado.
  // Si pisáramos `items`, ese mensaje recién escrito se perdería sin dejar rastro.
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const guardados = raw ? JSON.parse(raw) || [] : []
    const yaEstan = new Set(items.map((i) => i.msgId))
    items = [...guardados.filter((g) => !yaEstan.has(g.msgId)), ...items]
  } catch { /* sin nada guardado: seguimos con lo que haya en memoria */ }
  if (items.length) void flush()
}

// Devuelve la promesa del intento: la app la ignora (encolar y seguir), y los tests pueden esperarla.
// Apaga el temporizador. La app no la necesita (la cola vive lo que vive el proceso), pero sin esto un test deja
// un timer colgado y el runner nunca termina.
export function detener() { clearTimeout(timer); timer = null }

export function encolar(it) {
  items = [...items, { ...it, intentos: 0, nextAt: 0 }]
  avisar()
  return flush()
}

function programar() {
  clearTimeout(timer)
  if (!items.length) return
  const proximo = Math.min(...items.map((i) => i.nextAt || 0))
  timer = setTimeout(() => void flush(), Math.max(500, proximo - Date.now()))
}

export function configurar(fn) { enviar = fn || sendMsgCola }

export async function flush() {
  if (corriendo || !items.length || !enviar) return
  corriendo = true
  try {
    for (const it of [...items]) {
      if (it.nextAt && Date.now() < it.nextAt) continue
      let res = null, err = null
      try { res = await enviar(it) } catch (e) { err = e }
      const q = clasificar(err, res && res.data)
      if (q === "reintentar") {
        it.intentos += 1
        it.nextAt = Date.now() + esperaReintento(it.intentos)
        continue
      }
      if (q === "definitivo") {
        const motivo = (err && err.message) || (res && res.data && res.data.error) || "no se pudo enviar"
        items = items.filter((x) => x.msgId !== it.msgId)
        avisar({ tipo: "fallo", item: it, motivo })
        continue
      }
      items = items.filter((x) => x.msgId !== it.msgId)
      avisar({ tipo: "enviado", item: it })
    }
  } finally {
    corriendo = false
    avisar()
    programar()
  }
}
