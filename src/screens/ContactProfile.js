import React, { useEffect, useState, useCallback } from "react"
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Line } from "react-native-svg"
import { theme } from "../theme"
import { getPerson, getThread, getMergeSuggestions, mergeContacts, getThreads } from "../api"
import { initials, hhmm } from "../util"
import { useT } from "../i18n"
import Avatar from "../components/Avatar"
import Sheet from "../components/Sheet"

// grafo GRAPHIFY: nodo central (el contacto) + satélites (personas en común, org, grupos), más cerca/grandes cuanto más comparten
function Graph({ nm, photo, people, groups, orgs, onPerson }) {
  const W = 330, H = 210, CX = W / 2, CY = H / 2
  const maxSh = Math.max(1, ...people.map((x) => x.shared || 1))
  const sats = []
  for (const pp of people.slice(0, 5)) sats.push({ label: pp.name, kind: "person", strength: (pp.shared || 1) / maxSh, person: pp.name })
  if (orgs) sats.push({ label: String(orgs).split(",")[0].trim(), kind: "org", strength: 0.6 })
  if (groups.length) sats.push({ label: groups.length + (groups.length === 1 ? " grupo" : " grupos"), kind: "groups", strength: 0.45 })
  const N = Math.max(1, sats.length)
  const nodes = sats.map((s, i) => { const ang = -Math.PI / 2 + (i / N) * 2 * Math.PI; const r = 80 - (s.strength || 0.5) * 12
    return { ...s, x: CX + Math.cos(ang) * r * 1.15, y: CY + Math.sin(ang) * r * 0.9, sz: Math.round(30 + (s.strength || 0.5) * 14) } })
  if (!sats.length) return <View style={{ marginTop: 6 }}><Avatar name={nm} photo={photo} size={92} /></View>
  return (
    <View style={{ width: W, height: H, alignSelf: "center" }}>
      <Svg width={W} height={H} style={{ position: "absolute" }}>
        {nodes.map((n, i) => <Line key={i} x1={CX} y1={CY} x2={n.x} y2={n.y} stroke={`rgba(139,139,255,${(0.18 + (n.strength || 0) * 0.35).toFixed(2)})`} strokeWidth={1} />)}
      </Svg>
      {nodes.map((n, i) => (
        <TouchableOpacity key={i} disabled={!n.person} activeOpacity={0.7} onPress={() => n.person && onPerson(n.person)} style={{ position: "absolute", left: n.x - 34, top: n.y - n.sz / 2, width: 68, alignItems: "center" }}>
          <View style={{ width: n.sz, height: n.sz, borderRadius: n.sz / 2, backgroundColor: n.kind === "person" ? "#6366f1" : n.kind === "org" ? "#f59e0b" : "#10b981", justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: "#1e1e2a" }}>
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{n.kind === "groups" ? "◎" : initials(n.label)}</Text>
          </View>
          <Text numberOfLines={1} style={{ fontSize: 9, color: "#c7c7e0", marginTop: 3, maxWidth: 66 }}>{n.label}</Text>
        </TouchableOpacity>
      ))}
      <View style={{ position: "absolute", left: CX - 32, top: CY - 32 }}><Avatar name={nm} photo={photo} size={64} /></View>
    </View>
  )
}

const CH = { whatsapp: { t: "WhatsApp", c: "#25D366" }, email: { t: "Mail", c: "#EA4335" }, telegram: { t: "Telegram", c: "#229ED9" }, instagram: { t: "Instagram", c: "#E1306C" }, signal: { t: "Signal", c: "#3A76F0" }, teams: { t: "Teams", c: "#5B5FC7" }, messenger: { t: "Messenger", c: "#0084FF" }, sms: { t: "SMS", c: "#34C759" } }
const chName = (c) => (CH[c] ? CH[c].t : c)
const mediaIcon = (m) => !m.media ? "" : (m.mediaType === "audio" ? "🎤 " : m.mediaType === "video" ? "📹 " : (m.mediaType === "image" || m.mediaType === "sticker") ? "🖼 " : "📎 ")
const relDur = (ts) => { if (!ts) return "—"; const d = (Date.now() - ts) / 86400000; return d < 31 ? Math.round(d) + " d" : d < 365 ? Math.round(d / 30) + " meses" : (d / 365).toFixed(d < 730 ? 1 : 0) + " años" }
const lastTxt = (ts) => !ts ? "" : (Date.now() - ts < 86400000 ? "Activo hoy" : "hace " + (Date.now() - ts < 7 * 86400000 ? Math.round((Date.now() - ts) / 86400000) + "d" : Math.round((Date.now() - ts) / (30 * 86400000)) + " meses"))

export default function ContactProfile({ route, navigation }) {
  const { name: paramName, photo } = route.params
  const insets = useSafeAreaInsets()
  const t = useT()
  const [p, setP] = useState(null)
  const [msgsAll, setMsgsAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [chTab, setChTab] = useState("all")
  // merge
  const [mergeOpen, setMergeOpen] = useState(false)
  const [sugs, setSugs] = useState(null)
  const [allContacts, setAllContacts] = useState([])
  const [mq, setMq] = useState("")
  const [merging, setMerging] = useState(false)

  const loadMsgs = useCallback((key) => { getThread(key || paramName).then((d) => setMsgsAll(d.items || [])).catch(() => {}) }, [paramName])
  useEffect(() => {
    getPerson(paramName).then((r) => { setP(r || {}); setLoading(false); loadMsgs((r && (r.canon || r.key)) || paramName) }).catch((e) => { if (e && e.code === 401) navigation.replace("Login"); setLoading(false) })
    loadMsgs()
  }, [paramName])

  // EXPLORAR = generar el grafify COMPLETO on-demand (fuerza regeneración de la card + recarga mensajes)
  async function generate() {
    setGenerating(true)
    try { const r = await getPerson(paramName, true); setP(r || {}); loadMsgs((r && (r.canon || r.key)) || paramName) } catch {}
    setGenerating(false)
  }

  // MERGE
  async function openMerge() {
    setMergeOpen(true)
    if (!sugs) getMergeSuggestions(paramName).then((s) => setSugs(Array.isArray(s) ? s : [])).catch(() => setSugs([]))
    if (!allContacts.length) getThreads().then((d) => setAllContacts((Array.isArray(d) ? d : (d.threads || [])).filter((x) => x.key && x.key !== "self" && !x.espacio && !x.group))).catch(() => {})
  }
  const personKey = (nm) => paramName.includes(":") ? paramName : (allContacts.find((c) => (c.name || "").toLowerCase() === (nm || "").toLowerCase())?.key || paramName)
  async function doMerge(target, keys) {
    setMerging(true)
    try { await mergeContacts(target, keys); Alert.alert("✅ " + t("merged_ok"), ""); setMergeOpen(false); setSugs(null); generate() } catch (e) { Alert.alert("Error", e.message || "") }
    setMerging(false)
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center", paddingTop: insets.top }}><ActivityIndicator color={theme.accent} /></View>
  const nm = p.name || paramName
  const convKey = p.canon || nm
  const st = p.stats || {}
  const people = (p.shared && p.shared.people) || [], groups = (p.shared && p.shared.groups) || []
  const enComun = people.length + groups.length
  const resp = st.respMin != null ? (st.respMin < 60 ? "~" + st.respMin + " min" : "~" + (st.respMin / 60).toFixed(1) + " h") : "—"
  const needsGen = p.pending || (!p.bio && !(p.topics || []).length) // perfil sin data → ofrecer generar
  const timeline = msgsAll
  const byChannel = Object.entries(timeline.reduce((a, m) => { if (m.channel) a[m.channel] = (a[m.channel] || 0) + 1; return a }, {})).map(([channel, n]) => ({ channel, n })).sort((a, b) => b.n - a.n)
  const chTabs = [{ id: "all", label: t("all"), n: timeline.length }, ...byChannel.map((c) => ({ id: c.channel, label: chName(c.channel), n: c.n }))]
  const msgs = (chTab === "all" ? timeline : timeline.filter((m) => m.channel === chTab)).slice(-80).reverse()
  const pk = personKey(nm)

  const Stat = ({ v, l, c }) => <View style={{ flex: 1, alignItems: "center" }}><Text style={{ fontSize: 20, fontWeight: "800", color: c || theme.ink }}>{v}</Text><Text style={{ fontSize: 11.5, color: theme.muted, marginTop: 2 }}>{l}</Text></View>
  const chip = { backgroundColor: theme.bg, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, marginRight: 6, marginBottom: 6 }
  const cardHead = { fontSize: 11, fontWeight: "800", color: theme.muted, letterSpacing: 0.5, marginBottom: 8 }
  const card = { backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 10 }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ paddingBottom: 30 }}>
      {/* hero */}
      <View style={{ backgroundColor: "#1e1e2a", paddingTop: insets.top + 6, paddingBottom: 22, alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", width: "100%", paddingHorizontal: 12, justifyContent: "space-between" }}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><Text style={{ color: "#fff", fontSize: 24 }}>‹</Text></TouchableOpacity>
          <TouchableOpacity onPress={generate} disabled={generating} style={{ backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6 }}>
            {generating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14 }}>✦</Text>}
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{generating ? t("generating") : t("explore")}</Text>
          </TouchableOpacity>
        </View>
        <Graph nm={nm} photo={photo || p.photo} people={people} groups={groups} orgs={p.orgs} onPerson={(name) => navigation.push("Person", { name })} />
        <Text style={{ color: "#fff", fontSize: 23, fontWeight: "800", marginTop: 4 }}>{nm}</Text>
        <Text style={{ color: "#b9b9d6", fontSize: 13.5, marginTop: 3 }}>{[p.role, p.orgs].filter(Boolean).join(" · ") || p.tags || "Contacto"}</Text>
      </View>

      <View style={{ padding: 16 }}>
        {/* acciones */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
          <TouchableOpacity onPress={() => navigation.navigate("Conversation", { convKey, name: nm, photo: photo || p.photo })} style={{ flex: 1, backgroundColor: theme.accent, borderRadius: 12, padding: 13, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>💬 {t("messages")}</Text></TouchableOpacity>
          <TouchableOpacity onPress={openMerge} style={{ flex: 1, backgroundColor: theme.card, borderRadius: 12, padding: 13, alignItems: "center" }}><Text style={{ color: theme.ink, fontWeight: "700" }}>🔗 {t("link_contact_btn")}</Text></TouchableOpacity>
        </View>

        {/* generar grafify (perfil sin data) */}
        {needsGen ? (
          <TouchableOpacity onPress={generate} disabled={generating} style={{ ...card, backgroundColor: "#1c1c26", flexDirection: "row", alignItems: "center", gap: 10 }}>
            {generating ? <ActivityIndicator color="#a9a9ff" /> : <Text style={{ fontSize: 20 }}>✦</Text>}
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14.5 }}>{generating ? t("generating") : t("generate_graph")}</Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>{nm}</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {p.bio ? <View style={card}><Text style={cardHead}>{"✦ " + t("who_is")}</Text><Text style={{ fontSize: 14.5, color: theme.ink, lineHeight: 21 }}>{p.bio}</Text></View> : null}

        <View style={{ ...card, flexDirection: "row" }}>
          <Stat v={resp} l={t("responds")} c={theme.ok} />
          <Stat v={enComun || "—"} l={t("in_common")} />
          <Stat v={relDur(st.firstTs)} l={t("know_each")} />
        </View>

        {(p.topics || []).length ? <View style={card}><Text style={cardHead}>{t("talk_about")}</Text>{p.topics.map((tp, i) => <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 3 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent }} /><Text style={{ fontSize: 14, color: theme.ink }}>{tp}</Text></View>)}</View> : null}

        {(people.length || groups.length) ? (
          <View style={card}>
            <Text style={cardHead}>{t("common")}</Text>
            {groups.length ? <><Text style={{ fontSize: 12, color: theme.muted2, marginBottom: 4 }}>{t("groups")}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>{groups.map((g, i) => <View key={i} style={chip}><Text style={{ fontSize: 12.5, color: theme.ink }}>👥 {g.name}</Text></View>)}</View></> : null}
            {people.length ? <><Text style={{ fontSize: 12, color: theme.muted2, marginBottom: 4 }}>{t("people")}</Text><View style={{ flexDirection: "row", flexWrap: "wrap" }}>{people.map((pp, i) => <TouchableOpacity key={i} onPress={() => navigation.push("Person", { name: pp.name })} style={chip}><Text style={{ fontSize: 12.5, color: theme.ink }}>{pp.name}{pp.shared > 1 ? "  ·" + pp.shared : ""}</Text></TouchableOpacity>)}</View></> : null}
          </View>
        ) : null}

        {/* MENSAJES por canal (tabs) */}
        {timeline.length ? (
          <View style={card}>
            <Text style={cardHead}>{t("messages_by_channel")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 7 }}>
              {chTabs.map((tb) => { const on = chTab === tb.id
                return <TouchableOpacity key={tb.id} onPress={() => setChTab(tb.id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? theme.accent : theme.bg }}>
                  <Text style={{ color: on ? "#fff" : theme.muted, fontWeight: on ? "700" : "600", fontSize: 12.5 }}>{tb.label}{tb.n ? " " + tb.n : ""}</Text>
                </TouchableOpacity> })}
            </ScrollView>
            {msgs.length ? msgs.map((m, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 6, borderBottomWidth: i < msgs.length - 1 ? 0.5 : 0, borderBottomColor: theme.line }}>
                <View style={{ width: 4, borderRadius: 2, backgroundColor: m.dir === "out" ? theme.accent : (CH[m.channel]?.c || theme.muted2) }} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={{ fontSize: 13.5, color: m.dir === "out" ? theme.muted : theme.ink, lineHeight: 18 }}>
                    <Text style={{ fontWeight: "700", color: m.dir === "out" ? theme.accent : theme.ink }}>{m.dir === "out" ? "Vos: " : ""}</Text>
                    {mediaIcon(m)}{(m.text || "").replace(/\s+/g, " ").trim() || (m.media ? "" : "…")}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: theme.muted2, marginTop: 2 }}>{chName(m.channel)} · {hhmm(m.ts)} · {new Date(m.ts).toLocaleDateString()}</Text>
                </View>
              </View>
            )) : <Text style={{ color: theme.muted, fontSize: 13, paddingVertical: 8 }}>{t("no_messages")}</Text>}
          </View>
        ) : null}

        {/* CANALES (resumen) */}
        {(p.channels || []).length ? (
          <View style={card}>
            <Text style={cardHead}>{t("channels")}</Text>
            {p.channels.map((c, i) => { const m = CH[c.channel] || { t: c.channel, c: theme.muted }
              return <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m.c }} />
                <Text style={{ flex: 1, fontSize: 14.5, color: theme.ink, fontWeight: "600" }}>{m.t}</Text>
                <Text style={{ fontSize: 12, color: theme.muted2 }}>{lastTxt(c.last)}{c.n ? " · " + c.n : ""}</Text>
              </View> })}
          </View>
        ) : null}
      </View>

      {/* SHEET: vincular / unir contactos */}
      <Sheet visible={mergeOpen} onClose={() => setMergeOpen(false)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink }}>🔗 {t("same_person")}</Text>
        <Text style={{ fontSize: 12.5, color: theme.muted, marginTop: 4, marginBottom: 12 }}>{t("merge_hint")}</Text>
        <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
          {sugs === null ? <ActivityIndicator color={theme.accent} style={{ marginVertical: 12 }} /> : null}
          {sugs && sugs.length ? <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, marginBottom: 8 }}>{t("suggestions").toUpperCase()}</Text> : null}
          {(sugs || []).map((s, i) => (
            <View key={i} style={{ backgroundColor: theme.bg, borderRadius: 12, padding: 12, marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontSize: 14.5, fontWeight: "700", color: theme.ink }}>{s.name}</Text>
                <View style={{ backgroundColor: (s.confidence >= 75 ? theme.ok : "#f59e0b") + "22", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ fontSize: 11, fontWeight: "700", color: s.confidence >= 75 ? theme.ok : "#b45309" }}>{s.confidence}% {t("confidence")}</Text></View>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 }}>{(s.channels || []).map((c, j) => <View key={j} style={{ backgroundColor: (CH[c]?.c || theme.muted) + "22", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ fontSize: 11, color: CH[c]?.c || theme.muted, fontWeight: "700" }}>{chName(c)}</Text></View>)}</View>
              {(s.reasons || []).slice(0, 1).map((r, j) => <Text key={j} style={{ fontSize: 11.5, color: theme.muted, marginTop: 5 }}>{r}</Text>)}
              <TouchableOpacity disabled={merging} onPress={() => doMerge(s.keys[0], s.keys)} style={{ marginTop: 10, backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>{t("merge")}</Text></TouchableOpacity>
            </View>
          ))}
          {/* manual: buscar otro contacto para unir */}
          <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, marginTop: 6, marginBottom: 6 }}>{t("pick_to_merge").toUpperCase()}</Text>
          <TextInput value={mq} onChangeText={setMq} placeholder={t("search")} placeholderTextColor={theme.muted2} style={{ backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.ink, marginBottom: 8 }} />
          {allContacts.filter((c) => mq && (c.name || "").toLowerCase().includes(mq.toLowerCase()) && c.key !== pk).slice(0, 15).map((c) => (
            <TouchableOpacity key={c.key} disabled={merging} onPress={() => doMerge(pk, [c.key])} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
              <Avatar name={c.name} photo={c.photo} size={36} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14.5, color: theme.ink }}>{c.name}</Text>
              <Text style={{ fontSize: 12, color: theme.accent, fontWeight: "700" }}>{t("merge")}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Sheet>
    </ScrollView>
  )
}
