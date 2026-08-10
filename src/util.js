// Helpers de presentación (avatar por iniciales, color estable por nombre, tiempos).
export function initials(name = "") {
  const p = String(name).trim().split(/\s+/)
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?"
}
const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"]
export function color(name = "") {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}
export function ago(ts) {
  if (!ts) return ""
  const d = Date.now() - ts, m = 60000, h = 3600000, day = 86400000
  if (d < m) return "ahora"
  if (d < h) return Math.floor(d / m) + "m"
  if (d < day) return Math.floor(d / h) + "h"
  const dt = new Date(ts)
  if (d < 7 * day) return ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][dt.getDay()]
  return dt.getDate() + "/" + (dt.getMonth() + 1)
}
export function hhmm(ts) {
  const dt = new Date(ts)
  return String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0")
}
// primer emoji/token del icono de un espacio (el icono puede traer texto extra: "🏫 Lord Byron 👨‍🎓")
export function espIcon(icon) {
  const s = String(icon || "").trim()
  if (!s) return "📁"
  return s.split(/\s+/)[0] || "📁"
}
// bucket del hilo → categoría de pestaña (igual que la web): espacio→todo, spam oculto, grupo→grupos, else por relación
export function bucketCat(t) {
  return t.espacio ? "todo" : t.bucket === "spam" ? "spam" : t.group ? "grupos" : t.bucket === "family" ? "familia" : t.bucket === "amigos" ? "amigos" : "trabajo"
}
// HTML de un email → texto legible. Sin WebView: sacamos scripts/estilos, los bloques pasan a saltos de línea,
// y decodificamos las entidades más comunes. Suficiente para LEER el correo completo en el celular.
export function htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&mdash;/gi, "—").replace(/&ndash;/gi, "–")
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCharCode(+d) } catch { return "" } })
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
// preview de un mensaje (texto o placeholder de media)
export function preview(it) {
  if (it.text) return String(it.text).replace(/\s+/g, " ")
  const L = { image: "🖼 Imagen", video: "📹 Video", audio: "🎤 Audio", document: "📄 Documento", sticker: "Sticker" }
  return it.mediaType ? (L[it.mediaType] || "📎 Adjunto") : ""
}
