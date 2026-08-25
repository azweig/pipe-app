// Cliente de la API del hub. Auth por PIN → el server devuelve el sid en el body; lo mandamos como header Cookie
// en TODAS las llamadas Y en la media (Image/Video/Audio + subidas), porque el player/uploader nativo no comparte el cookie jar.
import { AppState } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as SecureStore from "expo-secure-store"
import * as LegacyFS from "expo-file-system/legacy"
import * as LocalAI from "./localai" // IA local opcional: si está instalada+activa, corrige/transcribe en el teléfono; si no → server

let BASE = "" // sin server hardcodeado: se configura en el Login (campo "Servidor") y queda guardado en AsyncStorage
let SID = null
// 🔒 CUENTAS SECRETAS: token de la sesión secreta SOLO en memoria (nunca a AsyncStorage/SecureStore/SQLite). Se llena al desbloquear
// con el 2º PIN; al perder foco / tocar "Ocultar" / 5 min inactivo se borra. Mientras está lleno, las requests lo mandan como header
// y el server devuelve también lo secreto. secretPinSet = hay un 2º PIN configurado → NO cachear/servir mensajes de local (el server filtra).
let secretTok = null, secretPinSet = false

export async function initBase() {
  try { const s = await AsyncStorage.getItem("serverUrl"); if (s) BASE = s } catch {}
  try { const t = await SecureStore.getItemAsync("sid"); if (t) SID = t } catch {}
  return BASE
}
export function getBase() { return BASE }
export async function setBase(url) {
  BASE = String(url || "").trim().replace(/\/+$/, "")
  if (!/^https?:\/\//.test(BASE)) BASE = "https://" + BASE
  try { await AsyncStorage.setItem("serverUrl", BASE) } catch {}
  return BASE
}
// choke point de headers — lo comparten api(), uploadRaw() y mediaSource(). Con el token secreto puesto, TODAS las llamadas lo mandan.
export function authHeaders() { const h = SID ? { Cookie: "sid=" + SID } : {}; if (secretTok) h["x-secret-token"] = secretTok; return h }
export function mediaUrl(p) { if (!p) return null; if (/^https?:\/\//.test(p)) return p; return BASE + (p.startsWith("/") ? p : "/" + p) }
export function mediaSource(p) { const uri = mediaUrl(p); return uri ? { uri, headers: authHeaders() } : null }
const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&")

export async function login(pin) {
  try {
    const r = await fetch(BASE + "/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok && j.ok) {
      if (j.sid) { SID = j.sid; try { await SecureStore.setItemAsync("sid", j.sid) } catch {} }
      try { await SecureStore.setItemAsync("pin", String(pin)) } catch {}
      return { ok: true }
    }
    return { error: j.error || "PIN incorrecto" }
  } catch (e) { return { error: "No pude conectar al servidor." } }
}
export async function autoLogin() {
  try { const pin = await SecureStore.getItemAsync("pin"); if (!pin) return false; const r = await login(pin); return !!r.ok } catch { return false }
}
export async function logout() { try { await SecureStore.deleteItemAsync("pin"); await SecureStore.deleteItemAsync("sid") } catch {}; SID = null; secretTok = null; secretPinSet = false }

// ══════════ 🔒 CUENTAS SECRETAS ══════════
// Estado del token (en memoria) + pub/sub para que la bandeja se re-pinte al des/bloquear (sin sacarte del hilo).
export function secretOn() { return !!secretTok }
export function isSecretPinSet() { return secretPinSet }
const _secretSubs = new Set()
export function onSecretChange(cb) { _secretSubs.add(cb); return () => _secretSubs.delete(cb) }
function _emitSecret() { for (const f of _secretSubs) { try { f() } catch {} } }

// out-of-focus TOLERANTE: (1) gracia de 1 min desde que pusiste el PIN (el teclado/OS roba el foco justo después y NO debe bloquear);
// (2) debounce de 6s: si volvés a foreground enseguida, se cancela; solo bloquea si te fuiste de verdad. Además 5 min inactivo en foco → bloquea.
let _secretIdle = null, _secretUnlockedAt = 0, _secretBlurTimer = null
function _secretResetIdle() { if (!secretTok) return; clearTimeout(_secretIdle); _secretIdle = setTimeout(() => secretLock(), 5 * 60000) }
export function secretTouch() { _secretResetIdle() } // llamado ante cualquier toque global → resetea los 5 min
export function scheduleSecretLock() {
  if (!secretTok || Date.now() - _secretUnlockedAt < 60000) return // dentro del minuto de gracia → no bloquear
  clearTimeout(_secretBlurTimer); _secretBlurTimer = setTimeout(() => { if (AppState.currentState !== "active") secretLock() }, 6000)
}
export function cancelSecretLock() { clearTimeout(_secretBlurTimer); _secretBlurTimer = null }

// fetch crudo para los endpoints secretos: leemos el body incluso en 401/403 (unlock con PIN malo, endpoints bloqueados) — api() tiraría en 401.
async function _sfetch(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) } })
  return r.json().catch(() => ({}))
}
export const getSecretStatus = () => _sfetch("/api/secret/status").catch(() => null)         // → {pinSet, unlocked}
export const secretSetup = (pin) => _sfetch("/api/secret/setup", { method: "POST", body: JSON.stringify({ pin }) }).catch(() => ({ error: "error" }))
export async function secretUnlock(pin) {
  try {
    const j = await _sfetch("/api/secret/unlock", { method: "POST", body: JSON.stringify({ pin }) })
    if (j && j.token) { secretTok = j.token; secretPinSet = true; _secretUnlockedAt = Date.now(); _secretResetIdle(); _emitSecret(); return j }
    return { error: (j && j.error) || "PIN incorrecto" }
  } catch { return { error: "No pude conectar al servidor." } }
}
export async function secretLock() {
  if (!secretTok) return { ok: true }
  secretTok = null; clearTimeout(_secretIdle); clearTimeout(_secretBlurTimer) // limpiamos el token ANTES → el POST va sin el header (el server cierra por sesión)
  try { await fetch(BASE + "/api/secret/lock", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: "{}" }) } catch {}
  _emitSecret()
  return { ok: true }
}
export const getSecretState = () => _sfetch("/api/secret/state").catch(() => null)            // → {accounts:[{channel,account}], numbers:[…]} (403 si bloqueado)
export const secretSetWa = (number, secret) => _sfetch("/api/secret/wa", { method: "POST", body: JSON.stringify({ number, secret }) }).catch(() => null)
export const secretSetAccount = (channel, account, secret) => _sfetch("/api/secret/account", { method: "POST", body: JSON.stringify({ channel, account, secret }) }).catch(() => null)
// al arrancar (ya logueado): ¿hay 2º PIN? → modo "no cachear mensajes en local". Devuelve true para que el caller purgue lo que haya quedado.
export async function initSecret() { try { const s = await getSecretStatus(); if (s && s.pinSet) { secretPinSet = true; return true } } catch {}; return false }

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) } })
  if (r.status === 401) { const e = new Error("no autorizado"); e.code = 401; throw e }
  return r.json()
}
// Igual que api() pero LANZA con el código HTTP puesto. La cola de envío lo necesita para distinguir un 502
// (reintentable: el hub reinició) de un 400 (definitivo: reintentar sería un bucle infinito). Sin el código, un
// 502 devuelve HTML de Caddy y r.json() explota sin decir qué pasó.
async function apiCoded(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) } })
  if (r.status === 401) { const e = new Error("no autorizado"); e.code = 401; throw e }
  const body = await r.json().catch(() => null)
  if (r.status >= 400) { const e = new Error((body && body.error) || "HTTP " + r.status); e.code = r.status; throw e }
  return { status: r.status, data: body }
}
// subida RAW (audio/media) — el server lee el body crudo; legacy uploadAsync manda los bytes del archivo tal cual.
async function uploadRaw(path, fileUri, mime) {
  try {
    const r = await LegacyFS.uploadAsync(BASE + path, fileUri, { httpMethod: "POST", uploadType: LegacyFS.FileSystemUploadType.BINARY_CONTENT, headers: { ...authHeaders(), "Content-Type": mime } })
    try { return JSON.parse(r.body) } catch { return r.status >= 200 && r.status < 300 ? { ok: true } : { error: "subida falló (" + r.status + ")" } }
  } catch (e) { return { error: e.message || "subida falló" } }
}

// importa un export de WhatsApp (.txt de "Exportar chat") al historial. name = nombre del chat (para mergear al hilo correcto),
// order = DMY|MDY|auto (formato de fecha del teléfono), tz = offset en minutos (para convertir la hora local del export a UTC).
export const importWhatsApp = (fileUri, { name = "", order = "auto", tz = 0, group = false } = {}) =>
  uploadRaw(`/api/import/whatsapp?name=${encodeURIComponent(name)}&order=${order}&tz=${tz}&group=${group ? "1" : ""}`, fileUri, "text/plain")
// import CON multimedia: el .zip de "Exportar chat → Con multimedia" → texto + fotos/audios/videos (más pesado, historial completo)
export const importWhatsAppZip = (fileUri, { name = "", order = "auto", tz = 0, group = false } = {}) =>
  uploadRaw(`/api/import/whatsapp-zip?name=${encodeURIComponent(name)}&order=${order}&tz=${tz}&group=${group ? "1" : ""}`, fileUri, "application/zip")

export const getThreads = () => api("/api/threads?limit=600") // 600 como la web: con 200, los contactos de hace dos semanas caían fuera de la bandeja
// BUSCAR entre TODOS los hilos (no solo los cargados): el server resuelve por índice y devuelve filas iguales a las de la bandeja
export const searchThreads = (q) => api("/api/threads?limit=60&q=" + encodeURIComponent(q))
// ✍️ firmas de correo, por cuenta ("*" = la de por defecto)
// 🤖 asistente en TU propio chat (te habla A VOS; distinto del piloto, que se hace pasar por vos)
export const getAssistant = () => api("/api/assistant")
export const setAssistant = (b) => api("/api/assistant", { method: "POST", body: JSON.stringify(b) })
export const tryAssistant = (q) => api("/api/assistant/try", { method: "POST", body: JSON.stringify({ q }) })
export const getSignatures = () => api("/api/signatures")
export const saveSignature = (account, text) => api("/api/signature", { method: "POST", body: JSON.stringify({ account, text }) })
export const getThread = (key) => api("/api/thread?key=" + encodeURIComponent(key) + "&limit=60")
// SYNC edit-aware: solo los mensajes NUEVOS o editados (rev > sinceRev) → el resto ya está cacheado en el celular
export const getThreadDelta = (key, sinceRev = 0) => api("/api/thread/delta?key=" + encodeURIComponent(key) + "&sinceRev=" + (sinceRev || 0))
// mensajes MÁS ANTIGUOS (paginación hacia atrás): los previos a `before` (un ts). MISMO endpoint que web (loadOlder) y desktop (getThreadBefore).
export const getThreadBefore = (key, before) => api("/api/thread?key=" + encodeURIComponent(key) + "&before=" + (before || 0) + "&limit=60")
// CUERPO COMPLETO de un email/transcripción → { body } (HTML crudo). MISMO endpoint que web y desktop.
export const getEmailBody = (id) => api("/api/email/body?id=" + encodeURIComponent(id))
// buscador CONTEXTUAL / con IA: router de facetas (⚡ 0 tokens) con fallback RAG (🧠). Busca dentro del CUERPO de los mensajes, no solo por nombre.
// → { mode:"facets"|"rag", type:"find"|…, engine, answer, results:[{key,name,ts,text,media,mediaType,filename}], threads:[{key,name,summary,path}], matches, ragMode, degraded }
export const searchContent = (q) => api("/api/router-search", { method: "POST", body: JSON.stringify({ q }) })
export const getTargets = (key) => api("/api/thread/targets?key=" + encodeURIComponent(key))
export const sendMsg = (key, text, t, covert) => api("/api/send", { method: "POST", body: JSON.stringify({ key, text, channel: t && t.channel, target: t && t.target, covert: !!covert }) })
// versión para la COLA: manda el msgId (el server lo reserva → un reintento tras 502 no duplica) y devuelve { status, data }
export const sendMsgCola = (it) => apiCoded("/api/send", { method: "POST", body: JSON.stringify({ key: it.key, text: it.text, channel: it.channel, target: it.target, covert: !!it.covert, msgId: it.msgId }) })
// modo encubierto ("El Santo"): config por-contacto + preview en vivo
export const getCovertCfg = (key) => api("/api/covert/config?key=" + encodeURIComponent(key))
export const setCovertCfg = (key, pass, style) => api("/api/covert/config", { method: "POST", body: JSON.stringify({ key, pass, style }) })
export const previewCovert = (text, pass, style) => api("/api/covert/preview", { method: "POST", body: JSON.stringify({ text, pass, style }) })
// #5: transcribir + resumir un video/audio/imagen (traducido al español)
export const summarizeMediaMsg = (id) => api("/api/media/summarize", { method: "POST", body: JSON.stringify({ id }) })
// 🏖️ piloto automático por contacto + feedback (mismo backend que web/desktop)
export const getAutopilotCfg = (key) => api("/api/autopilot/config?key=" + encodeURIComponent(key))
export const setAutopilotCfg = (key, enabled, maxPerDay = 0) => api("/api/autopilot/config", { method: "POST", body: JSON.stringify({ key, enabled, maxPerDay }) })
export const autopilotFeedbackMsg = (key, good, correction = "", original = "") => api("/api/autopilot/feedback", { method: "POST", body: JSON.stringify({ key, good, correction, original }) })
// 🏖️ piloto automático — política GLOBAL: qué temas escala (te deja a vos) en vez de responder. presets = keys, custom = frases libres.
export const getAutopilotPolicy = () => api("/api/autopilot/policy")
export const setAutopilotPolicy = (presets, custom) => api("/api/autopilot/policy", { method: "POST", body: JSON.stringify({ presets, custom }) })
export const getTrainCard = () => api("/api/autopilot/train-card")
export const getVoiceProfile = () => api("/api/autopilot/voice")
export const buildVoiceProfile = () => api("/api/autopilot/voice", { method: "POST", body: "{}" })
export const getCouncil = () => api("/api/autopilot/council")
export const setCouncil = (c) => api("/api/autopilot/council", { method: "POST", body: JSON.stringify(c) })
export const suggestReply = (key) => api("/api/thread/suggest-reply?key=" + encodeURIComponent(key))
export const summarizeChat = (key, range = "all") => api("/api/thread/summarize?key=" + encodeURIComponent(key) + "&range=" + range)
export const correctText = async (text, channel, key) => {
  try { const p = await LocalAI.prefs(); if (p.correct && (await LocalAI.installed("llm"))) { const r = await LocalAI.correctLocal(text); if (r && !r.failed) return r } } catch {}
  // 🔒 la clave del hilo va al server para que, si el destino es una cuenta secreta, corrija con el modelo local en vez
  // de mandar lo que estás escribiendo a un tercero.
  return api("/api/compose/correct", { method: "POST", body: JSON.stringify({ text, channel, key }) })
}
export const sttFile = async (fileUri, mime) => {
  try { const p = await LocalAI.prefs(); if (p.stt && (await LocalAI.installed("stt"))) { const r = await LocalAI.transcribeLocal(fileUri); if (r && !r.error && r.text) return r } } catch {}
  return uploadRaw("/api/stt", fileUri, mime)
}
export const sendAudioFile = (key, fileUri, mime, dur, t) => uploadRaw("/api/send-audio?" + qs({ key, dur, channel: t && t.channel, target: t && t.target }), fileUri, mime)
export const sendMediaFile = (key, fileUri, mime, filename, t) => uploadRaw("/api/send-media?" + qs({ key, filename, channel: t && t.channel, target: t && t.target }), fileUri, mime)
export const sendStickerFile = (key, fileUri, mime, t) => uploadRaw("/api/send-sticker?" + qs({ key, channel: t && t.channel, target: t && t.target }), fileUri, mime)
// enviar un CONTACTO: el server arma el vCard con los datos que ya tiene de esa persona (no mandamos nada desde acá)
export const sendContact = (key, contacto, t) => api("/api/send-contact", { method: "POST", body: JSON.stringify({ key, contacto, channel: t && t.channel, target: t && t.target }) })
export const getHome = () => api("/api/home")
export const homeAudioSource = () => mediaSource("/api/home/audio")
export const getCalendar = (view = "dia", date = "") => api("/api/calendar?view=" + view + (date ? "&date=" + date : ""))
export const getMeeting = (id) => api("/api/meeting?id=" + encodeURIComponent(id))
export const actionDone = (kind, id) => api("/api/action/done", { method: "POST", body: JSON.stringify({ kind, id }) })
export const askBrain = (q) => api("/api/ask", { method: "POST", body: JSON.stringify({ q }) })
export const replyDraft = (name, key) => api("/api/reply", { method: "POST", body: JSON.stringify({ name, key }) })
export const markSeen = (key, ts) => api("/api/thread/seen", { method: "POST", body: JSON.stringify({ key, ts }) })
export const scheduleDelete = (payload) => api("/api/schedule/delete", { method: "POST", body: JSON.stringify(payload) })
export const getCoach = () => api("/api/coach")
export const coachAction = (key, action) => api("/api/coach/action", { method: "POST", body: JSON.stringify({ key, action }) })
export const getNotesDigest = () => api("/api/notes/digest")
export const getNotes = (cat = "all", status = "active") => api("/api/notes/list?cat=" + encodeURIComponent(cat) + "&status=" + status + "&limit=120")
export const getNotesChat = () => api("/api/notes/chat")
export const notesChat = (q) => api("/api/notes/chat", { method: "POST", body: JSON.stringify({ q }) })
export const noteAction = (id, action) => api("/api/notes/action", { method: "POST", body: JSON.stringify({ id, action }) })
export const getPerson = (name, force) => api("/api/person?name=" + encodeURIComponent(name) + (force ? "&force=1" : ""))
export const getPersonFull = (name) => api("/api/person/full?name=" + encodeURIComponent(name))
export const getMergeSuggestions = (key) => api("/api/contact/suggestions?key=" + encodeURIComponent(key || ""))
export const mergeContacts = (target, keys) => api("/api/contact/merge", { method: "POST", body: JSON.stringify({ target, keys }) })
export const getContactInfo = (key) => api("/api/contact/info?key=" + encodeURIComponent(key))
export const setPin = (key, pinned) => api("/api/contact/pin", { method: "POST", body: JSON.stringify({ key, pinned }) })
export const setCategory = (key, category) => api("/api/contact/category", { method: "POST", body: JSON.stringify({ key, category }) })
export const threadMedia = (key) => api("/api/thread/media?key=" + encodeURIComponent(key))
// ── Ajustes / Cuenta ──
export const getHubConfig = () => api("/api/hub-config")
export const getAccounts = () => api("/api/accounts")
export const addEmail = (b) => api("/api/accounts/email", { method: "POST", body: JSON.stringify(b) })
export const removeEmail = (label) => api("/api/accounts/email/remove", { method: "POST", body: JSON.stringify({ label }) })
// ── Canales de mensajería (paridad con web/desktop) ──
// catálogo del server (registro de conectores): la lista de canales YA NO se hardcodea en la app → { channels:[{id,label,brand,kind,connect:{method,net,provider,fields,multi},canSend}] }
export const getChannelsCatalog = () => api("/api/channels/catalog")
// estado AUTORITATIVO: whatsapp{bridge:[num],baileys:[{acc,num}]}, email, otros:[{name,key,ok}] (Telegram/Teams/Notion/Calendar)
export const getStatus = () => api("/api/status")
export const getWaStatus = () => api("/api/wa/status") // números de WA caídos → {loggedOut:[...]}
// cuentas conectadas de un bridge (whatsapp/instagram/facebook/linkedin/discord). refresh=1 re-consulta el bridge
export const getMatrixLogins = (net, refresh = false) => api("/api/matrix-logins?net=" + encodeURIComponent(net) + (refresh ? "&refresh=1" : ""))
// arranca la vinculación por el bridge Matrix; phone opcional → login por código en vez de QR
export const matrixLink = (net, phone = "") => api("/api/matrix-link?" + qs({ net, phone }), { method: "POST", body: "{}" })
// estado del bridge: { connected, code (login por número), qr (¿hay PNG listo?) }
export const matrixStatus = (net) => api("/api/matrix-status?net=" + encodeURIComponent(net))
// vinculación por TOKEN (Discord: su QR suele fallar) → luego se pollea matrixStatus(net)
export const matrixLinkToken = (net, token) => api("/api/matrix-link-token?net=" + encodeURIComponent(net), { method: "POST", body: JSON.stringify({ token }) })
// el PNG del QR (autenticado) como {uri,headers} para el <Image>; cache-buster t= para forzar refresco en cada poll
export const matrixQrSource = (net) => mediaSource("/api/matrix-qr?net=" + encodeURIComponent(net) + "&t=" + Date.now())
// ── Telegram self-service: teléfono → código → 2FA opcional (GramJS vía el server) ──
export const telegramStatus = () => api("/api/telegram/status") // {connected,configured,stage,error}
export const telegramStart = (b) => api("/api/telegram/start", { method: "POST", body: JSON.stringify(b) }) // {phone,apiId?,apiHash?}
export const telegramCode = (code) => api("/api/telegram/code", { method: "POST", body: JSON.stringify({ code }) })
export const telegramPassword = (password) => api("/api/telegram/password", { method: "POST", body: JSON.stringify({ password }) })
export const telegramConnected = () => api("/api/telegram/connected", { method: "POST", body: "{}" })
// ── Integraciones por token/URL (cifradas en el server): Slack / Signal ──
export const getIntegrations = () => api("/api/integrations") // {slack:{configured,team}, signal:{configured,number}}
export const setSlack = (token) => api("/api/integrations/slack", { method: "POST", body: JSON.stringify({ token }) })
export const removeSlack = () => api("/api/integrations/slack/remove", { method: "POST", body: "{}" })
export const setSignal = (url, number) => api("/api/integrations/signal", { method: "POST", body: JSON.stringify({ url, number }) })
export const removeSignal = () => api("/api/integrations/signal/remove", { method: "POST", body: "{}" })
export const getLlmConfig = () => api("/api/llm-config")
export const testLlm = (b) => api("/api/llm-config/test", { method: "POST", body: JSON.stringify(b) })
export const saveLlm = (b) => api("/api/llm-config/save", { method: "POST", body: JSON.stringify(b) })
export const getVoices = () => api("/api/voices")
export const setVoice = (voice) => api("/api/voices", { method: "POST", body: JSON.stringify({ voice }) })
export const getNotifPrefs = () => api("/api/notif-prefs")
export const saveNotifPrefs = (b) => api("/api/notif-prefs", { method: "POST", body: JSON.stringify(b) })
export const getAuthStatus = () => api("/api/auth/status")
export const changePinReq = (b) => api("/api/auth/change-pin", { method: "POST", body: JSON.stringify(b) })
export const getUnread = () => api("/api/unread")
export const getGroups = () => api("/api/groups")
export const getEspacio = (id) => api("/api/espacio/view?id=" + encodeURIComponent(id))
export const getEspacios = () => api("/api/espacios")
export const saveEspacio = (e) => api("/api/espacio", { method: "POST", body: JSON.stringify(e) }) // crear (sin id) o renombrar/actualizar (con id)
export const deleteEspacio = (id) => api("/api/espacio/delete", { method: "POST", body: JSON.stringify({ id }) })
export const espacioAddRule = (id, type, value) => api("/api/espacio/rule", { method: "POST", body: JSON.stringify({ id, type, value }) })
export const espacioRemoveRule = (id, idx) => api("/api/espacio/rule/delete", { method: "POST", body: JSON.stringify({ id, idx }) })
export const espacioAddException = (id, type, value) => api("/api/espacio/exception", { method: "POST", body: JSON.stringify({ id, type, value }) })
export const espacioRemoveException = (id, idx) => api("/api/espacio/exception/delete", { method: "POST", body: JSON.stringify({ id, idx }) })
export const setArchive = (key, on = true) => api("/api/contact/archive", { method: "POST", body: JSON.stringify({ key, on }) })
export const setSilence = (key, on = true) => api("/api/contact/silence", { method: "POST", body: JSON.stringify({ key, on }) })
// ── Enriquecimiento social (Apify anónimo) ──
// cuentas Apify: rota entre ellas y hace failover cuando una llega al límite mensual. No usa tus cookies.
export const getApifyAccounts = () => api("/api/apify/accounts")
export const addApifyAccount = (name, token) => api("/api/apify/accounts", { method: "POST", body: JSON.stringify({ name, token }) })
export const removeApifyAccount = (id) => api("/api/apify/accounts", { method: "POST", body: JSON.stringify({ remove: id }) })
// perfil social de un contacto: links guardados + enrichment ya calculado (o null)
export const getContactSocial = (key) => api("/api/contact/social?key=" + encodeURIComponent(key))
export const setContactLinks = (key, links) => api("/api/contact/links", { method: "POST", body: JSON.stringify({ key, links }) })
// corre Apify anónimo (30-120s) → devuelve el enrichment. Mostrar spinner.
export const investigateContact = (key, links) => api("/api/contact/investigate", { method: "POST", body: JSON.stringify({ key, links }) })

// EMPEZAR UNA CONVERSACIÓN NUEVA: el server resuelve lo que escribiste (teléfono / correo) a la clave de hilo de
// siempre. No crea nada: si ya existe conversación con ese destino, devuelve la que hay.
export const nuevaConversacion = (destino, channel) =>
  api("/api/conversation/new", { method: "POST", body: JSON.stringify({ destino, channel }) })

// checklist de primer arranque (WhatsApp / correo / IA). El cálculo vive en el hub: una sola fuente de verdad.
export const getOnboarding = () => api("/api/onboarding")

// canales que se pueden estrenar (sólo los CONECTADOS)
export const canalesNuevaConv = () => api("/api/conversation/channels")
