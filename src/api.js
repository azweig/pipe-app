// Cliente de la API del hub. Auth por PIN → el server devuelve el sid en el body; lo mandamos como header Cookie
// en TODAS las llamadas Y en la media (Image/Video/Audio + subidas), porque el player/uploader nativo no comparte el cookie jar.
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as SecureStore from "expo-secure-store"
import * as LegacyFS from "expo-file-system/legacy"
import * as LocalAI from "./localai" // IA local opcional: si está instalada+activa, corrige/transcribe en el teléfono; si no → server

let BASE = "" // sin server hardcodeado: se configura en el Login (campo "Servidor") y queda guardado en AsyncStorage
let SID = null

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
export function authHeaders() { return SID ? { Cookie: "sid=" + SID } : {} }
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
export async function logout() { try { await SecureStore.deleteItemAsync("pin"); await SecureStore.deleteItemAsync("sid") } catch {}; SID = null }

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) } })
  if (r.status === 401) { const e = new Error("no autorizado"); e.code = 401; throw e }
  return r.json()
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

export const getThreads = () => api("/api/threads?limit=200")
export const getThread = (key) => api("/api/thread?key=" + encodeURIComponent(key) + "&limit=60")
// SYNC edit-aware: solo los mensajes NUEVOS o editados (rev > sinceRev) → el resto ya está cacheado en el celular
export const getThreadDelta = (key, sinceRev = 0) => api("/api/thread/delta?key=" + encodeURIComponent(key) + "&sinceRev=" + (sinceRev || 0))
// mensajes MÁS ANTIGUOS (paginación hacia atrás): los previos a `before` (un ts). MISMO endpoint que web (loadOlder) y desktop (getThreadBefore).
export const getThreadBefore = (key, before) => api("/api/thread?key=" + encodeURIComponent(key) + "&before=" + (before || 0) + "&limit=60")
// buscador CONTEXTUAL / con IA: router de facetas (⚡ 0 tokens) con fallback RAG (🧠). Busca dentro del CUERPO de los mensajes, no solo por nombre.
// → { mode:"facets"|"rag", type:"find"|…, engine, answer, results:[{key,name,ts,text,media,mediaType,filename}], threads:[{key,name,summary,path}], matches, ragMode, degraded }
export const searchContent = (q) => api("/api/router-search", { method: "POST", body: JSON.stringify({ q }) })
export const getTargets = (key) => api("/api/thread/targets?key=" + encodeURIComponent(key))
export const sendMsg = (key, text, t, covert) => api("/api/send", { method: "POST", body: JSON.stringify({ key, text, channel: t && t.channel, target: t && t.target, covert: !!covert }) })
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
export const suggestReply = (key) => api("/api/thread/suggest-reply?key=" + encodeURIComponent(key))
export const summarizeChat = (key, range = "all") => api("/api/thread/summarize?key=" + encodeURIComponent(key) + "&range=" + range)
export const correctText = async (text, channel) => {
  try { const p = await LocalAI.prefs(); if (p.correct && (await LocalAI.installed("llm"))) { const r = await LocalAI.correctLocal(text); if (r && !r.failed) return r } } catch {}
  return api("/api/compose/correct", { method: "POST", body: JSON.stringify({ text, channel }) })
}
export const sttFile = async (fileUri, mime) => {
  try { const p = await LocalAI.prefs(); if (p.stt && (await LocalAI.installed("stt"))) { const r = await LocalAI.transcribeLocal(fileUri); if (r && !r.error && r.text) return r } } catch {}
  return uploadRaw("/api/stt", fileUri, mime)
}
export const sendAudioFile = (key, fileUri, mime, dur, t) => uploadRaw("/api/send-audio?" + qs({ key, dur, channel: t && t.channel, target: t && t.target }), fileUri, mime)
export const sendMediaFile = (key, fileUri, mime, filename, t) => uploadRaw("/api/send-media?" + qs({ key, filename, channel: t && t.channel, target: t && t.target }), fileUri, mime)
export const sendStickerFile = (key, fileUri, mime, t) => uploadRaw("/api/send-sticker?" + qs({ key, channel: t && t.channel, target: t && t.target }), fileUri, mime)
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
export const setArchive = (key, on = true) => api("/api/contact/archive", { method: "POST", body: JSON.stringify({ key, on }) })
export const setSilence = (key, on = true) => api("/api/contact/silence", { method: "POST", body: JSON.stringify({ key, on }) })
