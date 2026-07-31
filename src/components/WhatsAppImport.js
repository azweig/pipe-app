// Tarjeta "Importar historial de WhatsApp" para Ajustes. Self-service, 100% desde el celu, sin PC ni root: el usuario exporta un chat
// en WhatsApp ("Exportar chat → Sin multimedia"), lo elige acá, y se sube al hub que lo parsea y mergea al hilo (sin duplicar).
import React, { useState } from "react"
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native"
import * as DocumentPicker from "expo-document-picker"
import { theme } from "../theme"
import { importWhatsApp, importWhatsAppZip } from "../api"

// deriva el nombre del chat del filename del export ("Chat de WhatsApp con Juan.txt" / "WhatsApp Chat with Juan.txt" → "Juan")
export function chatNameFromFile(fn = "") {
  return String(fn)
    .replace(/\.(txt|zip)$/i, "")
    .replace(/^_?chat( de whatsapp con| de whatsapp)?\s*/i, "")
    .replace(/^whatsapp chat( -| with)?\s*/i, "")
    .replace(/^chat -\s*/i, "")
    .trim()
}
// detecta si el teléfono usa día/mes o mes/día (para parsear las fechas del export correctamente)
export function deviceDateOrder() {
  try {
    const parts = new Intl.DateTimeFormat().formatToParts(new Date(2000, 0, 2))
    const o = parts.filter((p) => p.type === "day" || p.type === "month").map((p) => p.type)
    return o[0] === "month" ? "MDY" : "DMY"
  } catch { return "auto" }
}

export default function WhatsAppImportCard({ t }) {
  const [busy, setBusy] = useState(false)
  const T = (k, d) => { try { const v = t && t(k); return v && v !== k ? v : d } catch { return d } }

  async function pick() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/plain", "application/zip", "application/octet-stream", "*/*"], copyToCacheDirectory: true })
      if (res.canceled || !res.assets || !res.assets[0]) return
      const a = res.assets[0]
      const isZip = /\.zip$/i.test(a.name || "")
      setBusy(true)
      const opts = { name: chatNameFromFile(a.name), order: deviceDateOrder(), tz: -new Date().getTimezoneOffset() }
      const r = isZip ? await importWhatsAppZip(a.uri, opts) : await importWhatsApp(a.uri, opts) // .zip = con media, .txt = solo texto
      setBusy(false)
      if (!r || r.error) return Alert.alert(T("waimp_err", "No se pudo importar"), (r && r.error) || T("waimp_err_b", "Revisá que sea un export de WhatsApp (.txt o .zip)."))
      const extra = r.skipped ? ` (${r.skipped} ${T("waimp_already", "ya estaban")})` : ""
      const withMedia = r.media ? ` · ${r.media} ${T("waimp_media", "con foto/audio")}` : ""
      Alert.alert(T("waimp_done", "Importado ✓"), `${r.inserted || 0} ${T("waimp_added", "mensajes agregados a tu historial")}${withMedia}${extra}.`)
    } catch (e) { setBusy(false); Alert.alert("Error", String((e && e.message) || e)) }
  }

  const STEPS = [
    T("waimp_s1", "Abrí en WhatsApp el chat o grupo que querés traer"),
    T("waimp_s2", "Tocá el menú ⋮ (arriba a la derecha) → Más → Exportar chat"),
    T("waimp_s3", "Elegí «Con multimedia» para traer también las fotos y audios (o «Sin multimedia» = solo texto, pero más historial)"),
    T("waimp_s4", "En el menú de compartir, tocá Pipe → se importa solo ✅"),
  ]
  return (
    <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: theme.line }}>
      <Text style={{ color: theme.ink, fontSize: 16, fontWeight: "700", marginBottom: 6 }}>📤 {T("waimp_title", "Traé tu historial de WhatsApp")}</Text>
      <Text style={{ color: theme.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 14 }}>
        {T("waimp_why", "WhatsApp guarda tus chats cifrados y no deja que otra app los lea. Pero podés traerlos vos en 3 toques con «Exportar chat»:")}
      </Text>
      {STEPS.map((s, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 11, marginBottom: 11 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{i + 1}</Text>
          </View>
          <Text style={{ flex: 1, color: theme.ink, fontSize: 13.5, lineHeight: 19 }}>{s}</Text>
        </View>
      ))}
      <View style={{ backgroundColor: theme.bg, borderRadius: 10, padding: 11, marginTop: 4, marginBottom: 12 }}>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>{T("waimp_note", "«Con multimedia» trae las fotos/audios (hasta ~10.000 mensajes). «Sin multimedia» es solo texto pero llega a ~40.000. Se agrega sin duplicar lo que ya tenés; podés traer todos los chats que quieras.")}</Text>
      </View>
      <Text style={{ color: theme.muted2, fontSize: 11.5, marginBottom: 8 }}>{T("waimp_manual_hint", "¿Ya lo guardaste en Archivos en vez de compartir? Elegilo acá (el .txt o el .zip de WhatsApp):")}</Text>
      <TouchableOpacity onPress={pick} disabled={busy} style={{ backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.line, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
        {busy ? <ActivityIndicator color={theme.accent} /> : <Text style={{ color: theme.ink, fontWeight: "700", fontSize: 14 }}>{T("waimp_btn", "Elegir el archivo (.txt o .zip) a mano")}</Text>}
      </TouchableOpacity>
    </View>
  )
}
