import React, { useEffect, useState, useMemo } from "react"
import { View, Text, TextInput, TouchableOpacity, FlatList, Image, ActivityIndicator, Alert } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { getThreads, sendMsg, sendMediaFile } from "../api"
import Avatar from "../components/Avatar"

// Recibe contenido compartido desde otra app (captura, link, texto, imagen) → elegís contactos → se envía.
export default function ShareTo({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const shared = route.params?.shared || {}
  const text = (shared.text || shared.webUrl || "").trim()
  const files = shared.files || []
  const [rows, setRows] = useState([])
  const [q, setQ] = useState("")
  const [sel, setSel] = useState({})
  const [sending, setSending] = useState(false)

  useEffect(() => {
    getThreads().then((d) => { const arr = Array.isArray(d) ? d : (d.threads || []); setRows(arr.filter((t) => t.key && t.key !== "self" && !t.espacio)) }).catch((e) => { if (e && e.code === 401) navigation.replace("Login") })
  }, [])

  const shown = useMemo(() => { const nq = q.trim().toLowerCase(); return nq ? rows.filter((t) => (t.name || "").toLowerCase().includes(nq) || (t.ident || "").toLowerCase().includes(nq)) : rows }, [rows, q])
  const selCount = Object.values(sel).filter(Boolean).length

  async function send() {
    const keys = Object.keys(sel).filter((k) => sel[k]); if (!keys.length) return
    setSending(true)
    let okN = 0
    for (const key of keys) {
      try {
        if (files.length) for (const f of files) { const uri = /^(file|content):\/\//.test(f.path) ? f.path : "file://" + f.path; await sendMediaFile(key, uri, f.mimeType || "image/jpeg", f.fileName || "archivo") }
        if (text) await sendMsg(key, text)
        okN++
      } catch {}
    }
    setSending(false)
    const first = keys[0], firstRow = rows.find((r) => r.key === first)
    Alert.alert("✓ Enviado", "A " + okN + (okN === 1 ? " contacto" : " contactos"), [{ text: "OK", onPress: () => { if (keys.length === 1 && firstRow) navigation.replace("Conversation", { convKey: first, name: firstRow.name, photo: firstRow.photo }); else navigation.replace("Main") } }])
  }

  const preview = files.length
    ? <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>{files.slice(0, 4).map((f, i) => /image/i.test(f.mimeType || "") ? <Image key={i} source={{ uri: /^(file|content):/.test(f.path) ? f.path : "file://" + f.path }} style={{ width: 54, height: 54, borderRadius: 8 }} /> : <View key={i} style={{ width: 54, height: 54, borderRadius: 8, backgroundColor: theme.bg, justifyContent: "center", alignItems: "center" }}><Text style={{ fontSize: 22 }}>📄</Text></View>)}{files.length > 4 ? <Text style={{ color: theme.muted }}>+{files.length - 4}</Text> : null}</View>
    : <Text numberOfLines={3} style={{ fontSize: 14.5, color: theme.ink, lineHeight: 20 }}>{text || "(sin contenido)"}</Text>

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12 }}>
        <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace("Main")} hitSlop={10}><Text style={{ color: theme.accent, fontSize: 24 }}>‹</Text></TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: theme.ink, flex: 1 }}>Compartir a…</Text>
      </View>
      <View style={{ marginHorizontal: 12, marginBottom: 8, padding: 13, backgroundColor: theme.card, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: theme.accent }}>{preview}</View>
      <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
        <TextInput value={q} onChangeText={setQ} placeholder="Buscar contacto…" placeholderTextColor={theme.muted2} autoCapitalize="none"
          style={{ backgroundColor: theme.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: theme.ink }} />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(t) => String(t.key)}
        renderItem={({ item }) => {
          const on = !!sel[item.key]
          return (
            <TouchableOpacity onPress={() => setSel((s) => ({ ...s, [item.key]: !s[item.key] }))} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Avatar name={item.name} photo={item.photo} size={44} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 15.5, color: theme.ink, fontWeight: "500" }}>{item.name}</Text>
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? theme.accent : theme.muted2, backgroundColor: on ? theme.accent : "transparent", justifyContent: "center", alignItems: "center" }}>{on ? <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>✓</Text> : null}</View>
            </TouchableOpacity>
          )
        }}
        keyboardShouldPersistTaps="handled"
      />
      {selCount ? (
        <TouchableOpacity onPress={send} disabled={sending} style={{ position: "absolute", right: 18, bottom: (insets.bottom || 10) + 14, backgroundColor: theme.accent, borderRadius: 999, paddingHorizontal: 22, height: 54, flexDirection: "row", alignItems: "center", gap: 8, elevation: 4 }}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Enviar a {selCount} ➤</Text>}
        </TouchableOpacity>
      ) : null}
    </View>
  )
}
