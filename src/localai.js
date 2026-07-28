// IA LOCAL (OPCIONAL) — corrección de texto + transcripción de notas de voz 100% en el teléfono: offline, privado, sin egress.
// Opt-in: NO se baja nada hasta que el usuario toca "Instalar" en Ajustes. Si no está instalado o algo falla → api.js cae al server
// (fallback transparente). Modelos GGUF/ggml vía expo-file-system; inferencia vía llama.rn (Qwen3-0.6B) y whisper.rn (Whisper base).
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as FS from "expo-file-system/legacy"

const DIR = FS.documentDirectory + "localai/"
// Modelos (Hugging Face). Editables si querés otro quant/repo. Qwen3-0.6B Q4_K_M ~400MB · Whisper base ~148MB.
export const MODELS = {
  llm: { label: "Corrección (Qwen3-0.6B)", file: "qwen3-0.6b-q4_k_m.gguf", url: "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf", mb: 400 },
  stt: { label: "Transcripción (Whisper base)", file: "ggml-base.bin", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin", mb: 148 },
}
export const TOTAL_MB = MODELS.llm.mb + MODELS.stt.mb
const pathOf = (m) => DIR + MODELS[m].file

// ── preferencias (persistidas) ── qué tareas corren en el teléfono
export async function prefs() {
  try { return { correct: (await AsyncStorage.getItem("localai.correct")) === "1", stt: (await AsyncStorage.getItem("localai.stt")) === "1" } }
  catch { return { correct: false, stt: false } }
}
export async function setPref(k, on) { try { await AsyncStorage.setItem("localai." + k, on ? "1" : "0") } catch {} }

// ── instalación (descarga de modelos) ──
async function has(m) { try { const i = await FS.getInfoAsync(pathOf(m)); return !!(i.exists && i.size > 1e6) } catch { return false } }
export async function installed(which) { return which ? has(which) : ((await has("llm")) && (await has("stt"))) }
async function ensureDir() { try { const i = await FS.getInfoAsync(DIR); if (!i.exists) await FS.makeDirectoryAsync(DIR, { intermediates: true }) } catch {} }
// descarga UN modelo ('llm'|'stt') con progreso onProgress(0..1). Reintentable.
export async function download(which, onProgress) {
  await ensureDir()
  if (await has(which)) return true
  const m = MODELS[which]
  const dl = FS.createDownloadResumable(m.url, pathOf(which), {}, (p) => {
    if (onProgress && p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite)
  })
  const r = await dl.downloadAsync()
  return !!(r && r.uri && (await has(which)))
}
export async function uninstall() {
  _llm = null; _stt = null
  try { await FS.deleteAsync(DIR, { idempotent: true }) } catch {}
  try { await AsyncStorage.multiSet([["localai.correct", "0"], ["localai.stt", "0"]]) } catch {}
}

// Los módulos nativos (llama.rn / whisper.rn) son OPCIONALES. Metro exige que import() tenga un string literal → si los importáramos
// acá y NO están instalados, el bundle FALLA. Por eso este build NO los referencia (loadNative devuelve null) → la app compila sin
// ellos y la IA local se auto-oculta (nativeAvailable=false). Para habilitarla: instalá llama.rn+whisper.rn y usá un import estático
// (`import { initLlama } from "llama.rn"`) en llmCtx/sttCtx — ver SETUP-LOCALAI.md. Es un build aparte, a propósito.
async function loadNative() { return null }
export async function nativeAvailable() { return false }

// ── CORRECCIÓN (llama.rn + Qwen3-0.6B) ── mismo contrato que el server: {original, corrected, alternative, failed?}
let _llm = null
async function llmCtx() {
  if (_llm) return _llm
  const m = await loadNative("llm"); if (!m) throw new Error("IA local no disponible en este build")
  const { initLlama } = m
  _llm = await initLlama({ model: pathOf("llm"), n_ctx: 1024, n_gpu_layers: 99 }) // n_gpu_layers>0 → usa Metal/GPU si el device puede
  return _llm
}
const SYS = `/no_think Sos un corrector ortotipográfico. Devolvés SOLO JSON válido: {"corregido":"...","alternativo":"..."}. ` +
  `"corregido": el MISMO texto arreglando SOLO ortografía, tildes, mayúsculas y puntuación (NO cambies palabras por sinónimos, NO reformules, ` +
  `NO agregues ni quites contenido, dejá la jerga tal cual: "pucha","oe","xfa"...). "alternativo": una reformulación más clara y natural del ` +
  `MISMO mensaje, sin inventar datos. Mantené el idioma. Sin comillas de más ni explicaciones.`
export async function correctLocal(text) {
  const t = String(text || "").trim(); if (t.length < 2) return { original: t, corrected: t, alternative: "" }
  try {
    const ctx = await llmCtx()
    const r = await ctx.completion({
      messages: [{ role: "system", content: SYS }, { role: "user", content: `Texto: """${t}"""` }],
      n_predict: 220, temperature: 0.2, stop: ["<|im_end|>"],
    })
    let out = String((r && r.text) || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```json|```/g, "").trim()
    const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1))
    const corrected = (j.corregido || t).trim() || t
    let alternative = (j.alternativo || "").trim(); if (alternative === corrected || alternative === t) alternative = ""
    return { original: t, corrected, alternative, local: true }
  } catch (e) { return { original: t, corrected: t, alternative: "", failed: true, local: true } }
}

// ── TRANSCRIPCIÓN (whisper.rn + Whisper base) ── mismo contrato que el server: {text}
// Nota: whisper.cpp espera WAV 16kHz mono. whisper.rn intenta convertir; si tu grabación m4a no anda, hay que pasarla a wav 16k antes.
let _stt = null
async function sttCtx() { if (_stt) return _stt; const m = await loadNative("stt"); if (!m) throw new Error("IA local no disponible en este build"); const { initWhisper } = m; _stt = await initWhisper({ filePath: pathOf("stt") }); return _stt }
export async function transcribeLocal(fileUri, lang = "es") {
  try {
    const ctx = await sttCtx()
    const { promise } = ctx.transcribe(fileUri, { language: lang, maxThreads: 4, translate: false })
    const res = await promise
    return { text: String((res && res.result) || "").trim(), local: true }
  } catch (e) { return { error: String((e && e.message) || e), local: true } }
}
