// 📄 VISOR DE DOCUMENTOS — paridad con web y escritorio. El hub ya convirtió el PDF/DOCX/XLSX a páginas, así que acá
// sólo se muestran imágenes: mobile NO necesita WebView ni un módulo nativo de PDF, no se sale de Expo Go, y ningún
// archivo que mandó un tercero se parsea en el teléfono.
//
// Dos vistas, como pediste: el documento tal cual (fiel, con su formato) y el texto limpio para leer cómodo en el
// celular o copiar un dato. Las planillas arrancan en texto porque LibreOffice les parte las columnas anchas.
import React, { useEffect, useState } from "react"
import { Modal, View, Text, ScrollView, Image, TouchableOpacity, ActivityIndicator, useWindowDimensions } from "react-native"
import { getDoc, summarizeDoc, mediaSource } from "../api"
import { theme } from "../theme"

// Una página. El alto se calcula con la proporción real que informa la imagen al cargar: sin esto, todas las páginas
// arrancan cuadradas y el documento salta cuando terminan de bajar.
function Pagina({ url, ancho, n }) {
  const [ar, setAr] = useState(0.77) // A4 vertical ≈ 0.707; algo más alto evita el salto más común
  const src = mediaSource(url)
  if (!src) return null
  return (
    <Image
      source={src}
      accessibilityLabel={"Página " + n}
      onLoad={(e) => { const s = e?.nativeEvent?.source; if (s?.width && s?.height) setAr(s.width / s.height) }}
      style={{ width: ancho, height: ancho / ar, marginBottom: 8, borderRadius: 6, backgroundColor: "#fff" }}
      resizeMode="contain"
    />
  )
}

export default function DocViewer({ visible, dref, onClose, onSummary }) {
  const { width } = useWindowDimensions()
  const [d, setD] = useState(null)
  const [modo, setModo] = useState("paginas")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!visible || !dref) return
    let vivo = true
    setD(null)
    getDoc(dref)
      .then((r) => { if (!vivo) return; setD(r || { error: "No se pudo abrir el documento." }); setModo(r && r.pages ? (r.vista || "paginas") : "texto") })
      .catch(() => { if (vivo) setD({ error: "No se pudo abrir el documento." }) })
    return () => { vivo = false }
  }, [visible, dref && dref.id, dref && dref.media])

  const nombre = (d && d.filename) || (dref && dref.filename) || "Documento"
  const anchoPag = width - 40

  const resumir = async () => {
    if (!d || !d.id) return
    setBusy(true)
    const r = await summarizeDoc({ id: d.id }).catch(() => null)
    setBusy(false)
    if (r && r.summary) { setD({ ...d, summary: r.summary }); if (onSummary) onSummary(d.id, r.summary) }
  }

  const Tab = ({ id, etiqueta }) => (
    <TouchableOpacity onPress={() => setModo(id)} activeOpacity={0.7}
      style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1,
        borderColor: modo === id ? theme.accent : theme.line, backgroundColor: modo === id ? theme.accent : "transparent" }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: modo === id ? "#fff" : theme.accent }}>{etiqueta}</Text>
    </TouchableOpacity>
  )

  return (
    <Modal visible={!!visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: theme.line }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ fontSize: 16, fontWeight: "700", color: theme.ink }}>{nombre}</Text>
            <Text style={{ fontSize: 12, color: theme.muted2, marginTop: 2 }}>
              {!d ? "Convirtiendo las páginas…" : d.error ? "" : `${d.pages || 0} ${d.pages === 1 ? "página" : "páginas"}${(d.texto || "").trim() ? " · texto disponible" : ""}`}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ padding: 6 }}>
            <Text style={{ fontSize: 17, color: theme.muted2 }}>✕</Text>
          </TouchableOpacity>
        </View>

        {!d ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={theme.accent} />
            <Text style={{ fontSize: 13, color: theme.muted2 }}>La primera vez tarda unos segundos.</Text>
          </View>
        ) : d.error ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
            <Text style={{ fontSize: 14, color: theme.muted2, textAlign: "center" }}>{d.error}</Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
              <Tab id="paginas" etiqueta="📄 Documento" />
              <Tab id="texto" etiqueta="📃 Texto" />
            </View>

            {d.summary ? (
              <View style={{ marginHorizontal: 16, marginTop: 8, padding: 10, borderLeftWidth: 2, borderLeftColor: theme.accent, backgroundColor: theme.line + "55", borderRadius: 8 }}>
                <Text style={{ fontSize: 13, lineHeight: 19, color: theme.ink }}>📝 {d.summary}</Text>
              </View>
            ) : d.id ? (
              <TouchableOpacity onPress={resumir} disabled={busy} activeOpacity={0.7}
                style={{ marginHorizontal: 16, marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.line, alignSelf: "flex-start", opacity: busy ? 0.6 : 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: theme.accent }}>{busy ? "Leyendo el documento…" : "✨ Resumir este documento"}</Text>
              </TouchableOpacity>
            ) : null}

            {modo === "texto" ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                {(d.texto || "").trim()
                  // selectable: la mitad de la gracia de la vista de texto es poder copiar un monto o un RUC
                  ? <Text selectable style={{ fontSize: 14, lineHeight: 21, color: theme.ink }}>{d.texto}</Text>
                  : <Text style={{ fontSize: 13, color: theme.muted2 }}>No se pudo extraer texto de este archivo.</Text>}
              </ScrollView>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                {d.pages
                  ? (d.urls || []).map((u, i) => <Pagina key={u} url={u} ancho={anchoPag} n={i + 1} />)
                  : <Text style={{ fontSize: 13, color: theme.muted2 }}>{d.err || "Este formato no tiene vista de páginas."}</Text>}
              </ScrollView>
            )}
          </>
        )}
      </View>
    </Modal>
  )
}
