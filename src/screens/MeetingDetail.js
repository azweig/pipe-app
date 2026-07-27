import React, { useEffect, useState } from "react"
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Alert } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { getMeeting, scheduleDelete } from "../api"
import Avatar from "../components/Avatar"

// el link de "unirse" puede venir en url, o embebido en desc/location (Teams/Meet/Zoom/Webex)
const JOIN_RE = /(https:\/\/(?:teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|[\w.-]*zoom\.us|meet\.jit\.si|[\w.-]*webex\.com)\/[^\s"'<>)]+)/i
const provider = (u) => /teams/i.test(u) ? "Microsoft Teams" : /meet\.google/i.test(u) ? "Google Meet" : /zoom/i.test(u) ? "Zoom" : /webex/i.test(u) ? "Webex" : "la reunión"
const ST = { yes: "✓", no: "✕", maybe: "?" }

export default function MeetingDetail({ route, navigation }) {
  const { id } = route.params
  const insets = useSafeAreaInsets()
  const [m, setM] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { getMeeting(id).then((r) => { setM(r || {}); setLoading(false) }).catch((e) => { if (e && e.code === 401) navigation.replace("Login"); setLoading(false) }) }, [id])

  const join = m ? (m.url || (m.desc && (m.desc.match(JOIN_RE) || [])[1]) || (m.location && (m.location.match(JOIN_RE) || [])[1]) || null) : null
  const doCancel = () => Alert.alert("Cancelar reunión", "¿Seguro? Se les avisa a los invitados.", [{ text: "No" }, { text: "Cancelar", style: "destructive", onPress: async () => { await scheduleDelete({ platform: "meet", label: "personal", id }).catch(() => {}); navigation.goBack() } }])

  if (loading) return <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center", paddingTop: insets.top }}><ActivityIndicator color={theme.accent} /></View>
  const c = m.color || theme.accent
  const att = m.attendees || []

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingBottom: 16, paddingHorizontal: 14, backgroundColor: c }}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><Text style={{ color: "#fff", fontSize: 15, opacity: 0.9 }}>‹ Calendario</Text></TouchableOpacity>
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 10 }}>{m.icon ? m.icon + " " : ""}{m.title}</Text>
        <Text style={{ color: "#fff", opacity: 0.9, marginTop: 4, fontSize: 14 }}>{m.dayLabel || ""} · {m.t1}–{m.t2}{m.durationMin ? ` (${m.durationMin} min)` : ""}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {join ? (
          <TouchableOpacity onPress={() => Linking.openURL(join)} style={{ backgroundColor: theme.accent, borderRadius: 14, padding: 15, alignItems: "center", marginBottom: 14 }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>▶ Unirse a {provider(join)}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 14 }}><Text style={{ color: theme.muted, textAlign: "center" }}>Sin link de videollamada en esta invitación.</Text></View>
        )}

        <TouchableOpacity onPress={() => { const startMs = m.startMs || Date.parse(m.start || ""); navigation.navigate("Alarms", { startCreate: true, date: startMs ? startMs - 15 * 60000 : Date.now() + 3600000, label: "Reunión: " + (m.title || "") }) }} style={{ backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 20 }}>⏰</Text><Text style={{ fontSize: 15, color: theme.ink, fontWeight: "600", flex: 1 }}>Ponerme una alarma para esta reunión</Text><Text style={{ color: theme.muted2 }}>›</Text>
        </TouchableOpacity>

        {m.location ? <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 10 }}><Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted, marginBottom: 3 }}>📍 LUGAR</Text><Text style={{ fontSize: 14.5, color: theme.ink }}>{m.location}</Text></View> : null}

        {att.length ? (
          <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 6, marginBottom: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted, margin: 10, marginBottom: 6 }}>👥 PARTICIPANTES · {att.length}</Text>
            {att.map((a, i) => (
              <TouchableOpacity key={i} activeOpacity={a.name ? 0.6 : 1} disabled={!a.name} onPress={() => a.name && navigation.navigate("Person", { name: a.name })}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderTopWidth: i ? 0.5 : 0, borderTopColor: theme.line }}>
                <Avatar name={a.name || "?"} size={36} />
                <View style={{ flex: 1 }}><Text style={{ fontSize: 14.5, color: theme.ink, fontWeight: "500" }}>{a.name || "—"}{a.role ? <Text style={{ color: theme.muted, fontWeight: "400" }}> · {a.role}</Text> : null}{a.name ? <Text style={{ color: theme.muted2 }}>  ›</Text> : null}</Text>{a.email ? <Text style={{ fontSize: 12, color: theme.muted2 }}>{a.email}</Text> : null}</View>
                {a.status && ST[a.status] ? <Text style={{ color: a.status === "yes" ? theme.ok : a.status === "no" ? theme.urgent : theme.muted2, fontWeight: "800" }}>{ST[a.status]}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {m.desc ? <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 10 }}><Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted, marginBottom: 4 }}>📝 DETALLE</Text><Text style={{ fontSize: 13.5, color: theme.ink, lineHeight: 20 }} numberOfLines={12}>{String(m.desc).replace(/\s+\n/g, "\n").trim()}</Text></View> : null}

        <TouchableOpacity onPress={doCancel} style={{ marginTop: 6, padding: 13, alignItems: "center" }}><Text style={{ color: theme.urgent, fontWeight: "700" }}>🗑️ Cancelar reunión</Text></TouchableOpacity>
      </ScrollView>
    </View>
  )
}
