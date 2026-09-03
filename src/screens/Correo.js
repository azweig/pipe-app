// 📧 CORREO — solo email, en tres cajones.
//
// Existe por dos razones concretas. La bandeja general mezcla ~2M de mensajes de mensajería con ~13k de correo, así
// que el correo se pierde. Y el cajón de spam estaba escondido por completo: un falso positivo del clasificador era
// invisible y no había forma de corregirlo — llegó a haber ahí adentro un "Problema de facturación", un aviso de
// corte de servicio y la notificación de una reunión, sin que se vieran en ningún lado.
import React, { useEffect, useState, useCallback } from "react"
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, StatusBar } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { getMail, mailNoSpam, mailEsSpam } from "../api"
import { ago } from "../util"

const TABS = [["prioritarios", "Prioritarios"], ["todos", "Todos"], ["spam", "Spam"]]

export default function Correo({ navigation }) {
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState("prioritarios")
  const [items, setItems] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(null)

  const cargar = useCallback(async (t) => {
    try {
      const r = await getMail(t)
      setItems((r && r.items) || []); setCounts((r && r.counts) || {})
    } catch { setItems([]) }
    setLoading(false); setRefreshing(false)
  }, [])
  useEffect(() => { setLoading(true); cargar(tab) }, [tab, cargar])

  // Marcar/desmarcar corrige el clasificador para siempre. La fila se saca al toque (el server ya no la va a
  // devolver) y recién después se recarga: si no, queda un segundo ahí y parece que no pasó nada.
  const marcar = async (m, spam) => {
    setBusy(m.key)
    setItems((prev) => prev.filter((x) => x.key !== m.key))
    try { spam ? await mailEsSpam(m.key) : await mailNoSpam(m.key) } catch {}
    setBusy(null); cargar(tab)
  }

  const vacio = tab === "spam" ? "No hay nada apartado como spam."
    : tab === "prioritarios" ? "Nada que necesite tu atención ahora." : "No hay correo."
  const nota = tab === "spam" ? "Esto es lo que el clasificador apartó. Si algo no es spam, marcalo y vuelve a la bandeja."
    : tab === "prioritarios" ? "Correo que no es masivo: marcado importante, avisos que piden acción (✦ 🧾) o gente con la que ya venís hablando." : ""

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      <StatusBar barStyle="dark-content" />
      <Text style={{ fontSize: 26, fontWeight: "800", color: theme.ink, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 }}>Correo</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 10 }}>
        {TABS.map(([id, lbl]) => (
          <TouchableOpacity key={id} onPress={() => setTab(id)} activeOpacity={0.8}
            style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 9, borderWidth: 1,
              borderColor: tab === id ? theme.accent : theme.line, backgroundColor: tab === id ? theme.accent : "transparent" }}>
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: tab === id ? "#fff" : theme.muted }}>
              {lbl}{counts[id] != null ? `  ${counts[id]}` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {nota ? <Text style={{ paddingHorizontal: 16, paddingBottom: 10, fontSize: 12, color: theme.muted, lineHeight: 17 }}>{nota}</Text> : null}

      {loading ? <ActivityIndicator style={{ marginTop: 30 }} color={theme.accent} /> : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(tab) }} tintColor={theme.accent} />}>
          {items.length === 0 ? (
            <Text style={{ textAlign: "center", color: theme.muted2, fontSize: 13.5, marginTop: 28 }}>{vacio}</Text>
          ) : items.map((m) => (
            <TouchableOpacity key={m.key} activeOpacity={0.75}
              onPress={() => navigation.navigate("Conversation", { convKey: m.key, name: m.name, photo: m.photo })}
              style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: 12, marginBottom: 2,
                backgroundColor: m.unread ? "rgba(99,102,241,0.07)" : theme.card, borderWidth: 1, borderColor: m.unread ? "rgba(99,102,241,0.18)" : "transparent" }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {m.importante ? <Text style={{ fontSize: 12, color: "#e0a83a" }}>✦</Text> : null}
                  {!m.importante && m.transaccional ? <Text style={{ fontSize: 12 }}>🧾</Text> : null}
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: m.unread ? "800" : "700", color: theme.ink, flexShrink: 1 }}>
                    {m.name || m.email || "(sin remitente)"}
                  </Text>
                  {m.account ? (
                    <Text style={{ fontSize: 10, fontWeight: "600", color: theme.muted2, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}>{m.account}</Text>
                  ) : null}
                </View>
                <Text numberOfLines={2} style={{ fontSize: 12.5, color: theme.muted, marginTop: 3, lineHeight: 17 }}>
                  {String(m.lastText || "").replace(/\s+/g, " ").slice(0, 160)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={{ fontSize: 11, color: theme.muted2 }}>{ago(m.ts)}</Text>
                <TouchableOpacity disabled={busy === m.key} activeOpacity={0.8} onPress={() => marcar(m, !m.spam)}
                  style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1, opacity: busy === m.key ? 0.45 : 1,
                    borderColor: m.spam ? "rgba(22,163,74,0.5)" : theme.line }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: m.spam ? theme.ok : theme.muted }}>{m.spam ? "No es spam" : "Es spam"}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  )
}
