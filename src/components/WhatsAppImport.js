// Tarjeta "Importar historial de WhatsApp" para Ajustes. Self-service, 100% desde el celu, sin PC ni root: el usuario exporta un chat
// en WhatsApp ("Exportar chat → Sin multimedia"), lo elige acá, y se sube al hub que lo parsea y mergea al hilo (sin duplicar).
import React, { useState } from "react"
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native"
import * as DocumentPicker from "expo-document-picker"
import { theme } from "../theme"
import { importWhatsApp } from "../api"

// deriva el nombre del chat del filename del export ("Chat de WhatsApp con Juan.txt" / "WhatsApp Chat with Juan.txt" → "Juan")
function chatNameFromFile(fn = "") {
  return String(fn)
    .replace(/\.(txt|zip)$/i, "")
    .replace(/^_?chat( de whatsapp con| de whatsapp)?\s*/i, "")
    .replace(/^whatsapp chat( -| with)?\s*/i, "")
    .replace(/^chat -\s*/i, "")
    .trim()
}
// detecta si el teléfono usa día/mes o mes/día (para parsear las fechas del export correctamente)
function deviceDateOrder() {
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
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/plain", "text/*", "application/octet-stream", "*/*"], copyToCacheDirectory: true })
      if (res.canceled || !res.assets || !res.assets[0]) return
      const a = res.assets[0]
      if (/\.zip$/i.test(a.name || "")) {
        return Alert.alert(T("waimp_zip_t", "Exportá sin multimedia"), T("waimp_zip", "Ese archivo es un .zip (incluye fotos). En WhatsApp elegí 'Exportar chat' → 'SIN multimedia' para obtener un .txt liviano."))
      }
      setBusy(true)
      const r = await importWhatsApp(a.uri, { name: chatNameFromFile(a.name), order: deviceDateOrder(), tz: -new Date().getTimezoneOffset() })
      setBusy(false)
      if (!r || r.error) return Alert.alert(T("waimp_err", "No se pudo importar"), (r && r.error) || T("waimp_err_b", "Revisá que sea un export de WhatsApp (.txt)."))
      const extra = r.skipped ? ` (${r.skipped} ${T("waimp_already", "ya estaban")})` : ""
      Alert.alert(T("waimp_done", "Importado ✓"), `${r.inserted || 0} ${T("waimp_added", "mensajes agregados a tu historial")}${extra}.`)
    } catch (e) { setBusy(false); Alert.alert("Error", String((e && e.message) || e)) }
  }

  return (
    <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: theme.line }}>
      <Text style={{ color: theme.ink, fontSize: 16, fontWeight: "700", marginBottom: 4 }}>💬 {T("waimp_title", "Importar historial de WhatsApp")}</Text>
      <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19, marginBottom: 12 }}>
        {T("waimp_help", "En WhatsApp: abrí un chat → menú (⋮) → Más → Exportar chat → SIN multimedia → elegí Pipe (o Guardar en Archivos). Después tocá acá y seleccioná ese .txt. Se agrega a tu conversación sin duplicar lo que ya está.")}
      </Text>
      <TouchableOpacity onPress={pick} disabled={busy} style={{ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{T("waimp_btn", "Elegir archivo de WhatsApp (.txt)")}</Text>}
      </TouchableOpacity>
    </View>
  )
}
