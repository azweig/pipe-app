import React, { useEffect, useState, useCallback, useRef } from "react"
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, StatusBar, Image, Linking } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { KeyboardAvoidingView } from "react-native-keyboard-controller"
import { useVideoPlayer, VideoView } from "expo-video"
import { theme } from "../theme"
import { useT } from "../i18n"
import { catMeta, verdictMeta, pj } from "../cats"
import { getNotesDigest, getNotes, getNotesChat, notesChat, noteAction, mediaSource } from "../api"
import { ago } from "../util"
import Sheet from "../components/Sheet"
import MediaBubble from "../components/MediaBubble"

const URL_RE = /https?:\/\/\S+/
const QUICK = ["Resumí mis notas de esta semana", "¿Qué estoy postergando?", "¿Qué links guardé para leer?"]
const CH_LABEL = { whatsapp: "WhatsApp", email: "Mail", telegram: "Telegram", instagram: "Instagram", signal: "Signal", messenger: "Messenger", sms: "SMS", self: "", discord: "Discord", slack: "Slack", facebook: "Facebook", linkedin: "LinkedIn", teams: "Teams" }

// player de video que se monta SOLO al tocar (evita N players vivos en la lista)
function VideoPlayerView({ source }) {
  const player = useVideoPlayer(source, (p) => { p.loop = false; p.play() })
  return <VideoView player={player} style={{ width: "100%", height: 200, borderRadius: 12, backgroundColor: "#000" }} contentFit="cover" allowsFullscreen nativeControls />
}
function NoteVideo({ item }) {
  const [play, setPlay] = useState(false)
  const src = mediaSource(item.media)
  if (play && src) return <VideoPlayerView source={src} />
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => setPlay(true)} style={{ width: "100%", height: 170, borderRadius: 12, backgroundColor: "#1c1c26", justifyContent: "center", alignItems: "center" }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.9)", justifyContent: "center", alignItems: "center" }}><Text style={{ fontSize: 22, color: "#111", marginLeft: 3 }}>▶</Text></View>
      <View style={{ position: "absolute", left: 10, top: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>🎬 Video</Text></View>
    </TouchableOpacity>
  )
}

export default function Notas({ navigation }) {
  const insets = useSafeAreaInsets()
  const t = useT()
  const [dig, setDig] = useState(null)
  const [items, setItems] = useState([])
  const [cats, setCats] = useState([])
  const [junk, setJunk] = useState(0)
  const [cat, setCat] = useState("all")
  const [status, setStatus] = useState("active")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [note, setNote] = useState(null)
  const [mode, setMode] = useState("notes") // 'notes' | 'ask'
  const [chat, setChat] = useState([])
  const [q, setQ] = useState("")
  const [asking, setAsking] = useState(false)
  const scRef = useRef(null)

  const loadList = useCallback(async (c, s) => {
    try { const nl = await getNotes(c, s); setItems(nl.items || []); if (nl.categories) setCats(nl.categories); if (nl.junk != null) setJunk(nl.junk) } catch (e) { if (e && e.code === 401) navigation.replace("Login") }
  }, [navigation])
  const load = useCallback(async (spin) => {
    if (spin) setRefreshing(true)
    try {
      const [d, ch] = await Promise.all([getNotesDigest().catch(() => ({})), getNotesChat().catch(() => ({}))])
      setDig(d || {}); setChat((ch && ch.history) || [])
      await loadList(cat, status)
    } finally { setLoading(false); setRefreshing(false) }
  }, [cat, status, loadList])
  useEffect(() => { load(false) }, []) // eslint-disable-line

  const pickCat = (c, s) => { setCat(c); setStatus(s); loadList(c, s) }
  const act = (id, action) => {
    if (["archive", "discard", "approve"].includes(action)) setItems((x) => x.filter((n) => n.id !== id))
    else if (action === "pin" || action === "unpin") setItems((x) => x.map((n) => n.id === id ? { ...n, pinned: action === "pin" } : n))
    noteAction(id, action).catch(() => {})
  }
  // tildar/destildar una acción detectada (optimista)
  const toggleAction = (n, idx, acts) => {
    const next = acts.map((a, i) => i === idx ? { ...a, done: !a.done } : a)
    setItems((x) => x.map((it) => it.id === n.id ? { ...it, actions: JSON.stringify(next) } : it))
    noteAction(n.id, (next[idx].done ? "check:" : "uncheck:") + idx).catch(() => {})
  }
  const remindAction = (n, a) => {
    // manda la acción al creador de alarmas, con hora si la nota la trae (HH:MM)
    let date = null; const hm = (a.cuando || "").match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
    if (hm) { const d = new Date(); d.setHours(+hm[1], +hm[2], 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); date = d.getTime() }
    navigation.navigate("Alarms", { startCreate: true, label: a.texto, ...(date ? { date } : {}) })
  }
  const openNote = (n) => { const u = ((n.text || "") + " " + (n.title || "")).match(URL_RE); if (u) Linking.openURL(u[0]); else setNote(n) }
  const send = async (preset) => {
    const txt = (preset || q).trim(); if (!txt) return; setQ(""); setChat((c) => [...c, { role: "user", text: txt }]); setAsking(true)
    const r = await notesChat(txt).catch(() => null); setAsking(false)
    setChat((r && r.history) || ((c) => [...c, { role: "ai", text: (r && r.answer) || "No pude responder ahora." }]))
    setTimeout(() => scRef.current?.scrollToEnd({ animated: true }), 120)
  }

  const has = dig && dig.generatedAt && !dig.empty
  const card = { backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }

  const NoteCard = ({ n }) => {
    const cm = catMeta(n.catkey)
    const verd = n.verdict ? pj(n.verdict, null) : null
    const vm = verd ? verdictMeta(verd.nivel) : null
    const acts = pj(n.actions, []) || []
    const title = n.clip_title || n.title || (n.text || "").replace(/\s+/g, " ").slice(0, 100) || "(sin título)"
    const isImg = (n.mediaType === "image" || n.mediaType === "sticker") && n.media
    const isVid = (n.mediaType === "video" || n.mediaType === "gif") && n.media
    const chLabel = CH_LABEL[n.channel] != null ? CH_LABEL[n.channel] : n.channel
    return (
      <View style={{ ...card, borderLeftWidth: n.pinned ? 3 : 0, borderLeftColor: theme.accent }}>
        {/* header: badge de categoría + acciones (pin/archive) */}
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: cm.color + "1a", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" }}>
            <Text style={{ fontSize: 12 }}>{cm.icon}</Text>
            <Text style={{ fontSize: 11.5, fontWeight: "800", color: cm.color }}>{n.category || t(cm.labelKey)}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {status === "junk" ? (
            <TouchableOpacity onPress={() => act(n.id, "approve")} hitSlop={6}><Text style={{ fontSize: 17 }}>↩️</Text></TouchableOpacity>
          ) : (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={() => act(n.id, n.pinned ? "unpin" : "pin")} hitSlop={6}><Text style={{ fontSize: 15, opacity: n.pinned ? 1 : 0.35 }}>📌</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => act(n.id, "archive")} hitSlop={6}><Text style={{ fontSize: 14, opacity: 0.5 }}>🗄</Text></TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity activeOpacity={0.7} onPress={() => openNote(n)}>
          <Text style={{ fontWeight: "700", fontSize: 16, color: theme.ink, marginTop: 9 }} numberOfLines={3}>{title}</Text>
          {n.para ? <Text numberOfLines={3} style={{ fontSize: 13.5, color: theme.muted, marginTop: 4, lineHeight: 19 }}>{n.para}</Text> : null}
        </TouchableOpacity>

        {/* media preview */}
        {isImg ? (
          <View style={{ marginTop: 11 }}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => setNote(n)}>
              <Image source={mediaSource(n.media)} style={{ width: "100%", height: 180, borderRadius: 12, backgroundColor: theme.line }} resizeMode="cover" />
              <View style={{ position: "absolute", left: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 }}>
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>⤢ {t("expand")}</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : isVid ? <View style={{ marginTop: 11 }}><NoteVideo item={n} /></View> : null}

        {/* veredicto hoax/certeza */}
        {verd && vm ? (
          <View style={{ marginTop: 11, backgroundColor: vm.color + "14", borderRadius: 10, padding: 11, borderWidth: 1, borderColor: vm.color + "3a" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <Text style={{ fontSize: 14 }}>{vm.icon}</Text>
              <Text style={{ fontSize: 12.5, fontWeight: "800", color: vm.color }}>{t(vm.labelKey)}</Text>
            </View>
            {verd.motivo ? <Text style={{ fontSize: 13, color: theme.ink, marginTop: 5, lineHeight: 18 }}>{verd.motivo}</Text> : null}
          </View>
        ) : null}

        {/* acciones detectadas (checklist) */}
        {acts.length ? (
          <View style={{ marginTop: 12, borderTopWidth: 0.5, borderTopColor: theme.line, paddingTop: 10 }}>
            <Text style={{ fontSize: 10.5, fontWeight: "800", color: theme.muted2, letterSpacing: 0.4, marginBottom: 7 }}>{t("detected_actions")}</Text>
            {acts.map((a, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 7 }}>
                <TouchableOpacity onPress={() => toggleAction(n, i, acts)} hitSlop={6} style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: a.done ? theme.ok : theme.muted2, backgroundColor: a.done ? theme.ok : "transparent", justifyContent: "center", alignItems: "center" }}>
                  {a.done ? <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>✓</Text> : null}
                </TouchableOpacity>
                <Text style={{ flex: 1, fontSize: 14, color: a.done ? theme.muted2 : theme.ink, textDecorationLine: a.done ? "line-through" : "none" }}>{a.texto}</Text>
                {a.cuando ? <View style={{ backgroundColor: theme.bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ fontSize: 11, color: theme.accent, fontWeight: "700" }}>{a.cuando}</Text></View> : null}
                {!a.done ? <TouchableOpacity onPress={() => remindAction(n, a)} hitSlop={6}><Text style={{ fontSize: 15 }}>⏰</Text></TouchableOpacity> : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* procedencia */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.ok }} />
          <Text style={{ fontSize: 11.5, color: theme.muted2 }}>{t("sent_you")}{chLabel ? " · " + chLabel : ""} · {ago(n.ts)}</Text>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle="dark-content" />
      {/* header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 6, flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: theme.ink }}>📝 {t("notes")}</Text>
          <Text style={{ fontSize: 13, color: theme.muted, marginTop: 2 }}>{t("notes_sub")}</Text>
        </View>
        <TouchableOpacity onPress={() => setMode(mode === "ask" ? "notes" : "ask")} hitSlop={8} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: mode === "ask" ? theme.accent : theme.card, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ fontSize: 18 }}>{mode === "ask" ? "📝" : "💬"}</Text>
        </TouchableOpacity>
      </View>

      {mode === "ask" ? (
        // ── MODO PREGUNTAR (chat con el cerebro) ──
        <>
          <ScrollView ref={scRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: "800", color: theme.ink, marginBottom: 10 }}>💬 {t("talk_brain")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {QUICK.map((qq, i) => <TouchableOpacity key={i} onPress={() => send(qq)} style={{ backgroundColor: theme.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ fontSize: 12.5, color: theme.ink }}>{qq}</Text></TouchableOpacity>)}
            </View>
            {chat.map((m, i) => (
              <View key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", backgroundColor: m.role === "user" ? theme.bubbleOut : theme.card, borderRadius: 16, padding: 12, marginBottom: 8 }}>
                <Text style={{ fontSize: 14.5, color: theme.ink, lineHeight: 20 }}>{m.text}</Text>
              </View>
            ))}
            {asking ? <View style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 8 }}><ActivityIndicator size="small" color={theme.accent} /><Text style={{ color: theme.muted }}>pensando…</Text></View> : null}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 8, padding: 8, paddingBottom: (insets.bottom || 8) + 4, backgroundColor: theme.card, borderTopWidth: 0.5, borderTopColor: theme.line }}>
            <TextInput value={q} onChangeText={setQ} onSubmitEditing={() => send()} returnKeyType="send" placeholder={t("brain_ph")} placeholderTextColor={theme.muted2}
              style={{ flex: 1, backgroundColor: theme.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: theme.ink }} />
            <TouchableOpacity onPress={() => send()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, justifyContent: "center", alignItems: "center" }}><Text style={{ color: "#fff", fontSize: 18 }}>➤</Text></TouchableOpacity>
          </View>
        </>
      ) : (
        // ── MODO NOTAS (feed) ──
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.accent} colors={[theme.accent]} />}>
          {loading && !dig ? <ActivityIndicator color={theme.accent} style={{ marginTop: 20 }} /> : null}

          {/* la IA piensa (dark) */}
          {has && dig.reflexion ? (
            <View style={{ ...card, backgroundColor: "#1c1c26" }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: "#a9a9ff", marginBottom: 7, letterSpacing: 0.4 }}>✦ {t("ai_thinks")}</Text>
              <Text style={{ fontSize: 14.5, color: "#fff", lineHeight: 21 }}>{dig.reflexion}</Text>
              {(dig.temas || []).length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 11 }}>{dig.temas.map((tm, i) => <View key={i} style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 }}><Text style={{ color: "#fff", fontSize: 12 }}>{tm}</Text></View>)}</View> : null}
              {dig.count ? <Text style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", marginTop: 10 }}>{dig.count} notas · últimos 30 días</Text> : null}
            </View>
          ) : null}

          {/* filtros de categoría */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            {[["all", "active", t("all"), null], ...cats.map((c) => [c.category, "active", c.category, c.n]), ["all", "junk", "🗑 " + t("junk"), junk || null]].map(([c, s, l, cnt], i) => {
              const on = cat === c && status === s
              return <TouchableOpacity key={i} onPress={() => pickCat(c, s)} style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? theme.accent : theme.card }}>
                <Text style={{ color: on ? "#fff" : theme.muted, fontWeight: on ? "700" : "600", fontSize: 12.5 }}>{l}{cnt != null ? " " + cnt : ""}</Text>
              </TouchableOpacity>
            })}
          </ScrollView>

          {items.length ? items.map((n) => <NoteCard key={n.id} n={n} />) : (
            <Text style={{ color: theme.muted, textAlign: "center", marginVertical: 30 }}>{status === "junk" ? "Nada en la papelera." : t("no_notes")}</Text>
          )}
        </ScrollView>
      )}

      <Sheet visible={!!note} onClose={() => setNote(null)}>
        {note ? <ScrollView style={{ maxHeight: 480 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: theme.ink, marginBottom: 4 }}>{note.title || note.clip_title || "Nota"}</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginBottom: 12 }}>{note.category || ""}{note.channel ? " · " + note.channel : ""} · {ago(note.ts)}</Text>
          {note.media ? <View style={{ marginBottom: 12, alignItems: "center" }}><MediaBubble item={note} out={false} /></View> : null}
          <Text style={{ fontSize: 15, color: theme.ink, lineHeight: 22 }}>{note.text || note.summary || ""}</Text>
        </ScrollView> : null}
      </Sheet>
    </KeyboardAvoidingView>
  )
}
