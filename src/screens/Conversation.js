import React, { useEffect, useState, useCallback, useRef } from "react"
import { View, Text, TextInput, TouchableOpacity, Pressable, FlatList, Platform, ActivityIndicator, Alert, ScrollView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Haptics from "expo-haptics"
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from "expo-audio"
import * as ImagePicker from "expo-image-picker"
import * as DocumentPicker from "expo-document-picker"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { KeyboardAvoidingView } from "react-native-keyboard-controller"
import { theme } from "../theme"
import { useT } from "../i18n"
import { getThread, sendMsg, getTargets, getThreads, suggestReply, summarizeChat, correctText, sttFile, sendAudioFile, sendMediaFile } from "../api"
import { hhmm, color, preview } from "../util"
import Avatar from "../components/Avatar"
import MediaBubble from "../components/MediaBubble"
import Sheet from "../components/Sheet"

const PLACEHOLDER_RE = /^(🖼|📹|🎤|📄|🌟|📎|📍|👤|🖼️)/
const durTxt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0")

export default function Conversation({ route, navigation }) {
  const { convKey, name, photo, draft } = route.params
  const insets = useSafeAreaInsets()
  const t = useT()
  const [items, setItems] = useState([])
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(true)
  const [targets, setTargets] = useState([])
  const [target, setTarget] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [sheet, setSheet] = useState(null) // 'menu' | 'target' | 'ai' | 'forward' | 'opts' | 'summary'
  const [menuItem, setMenuItem] = useState(null)
  const [fwd, setFwd] = useState(null) // { item, list, q }
  const [opts, setOpts] = useState(null) // { corrected, original, alternative }
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(null) // texto de "cargando"
  const [rec, setRec] = useState(null) // 'voice' | 'ai'
  const [recDur, setRecDur] = useState(0)
  const listRef = useRef(null)
  const recStart = useRef(0), recTimer = useRef(null)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const cacheKey = "conv:" + convKey

  const load = useCallback(async () => {
    try {
      const d = await getThread(convKey)
      setItems(d.items || []); setLoading(false)
      AsyncStorage.setItem(cacheKey, JSON.stringify((d.items || []).slice(-60))).catch(() => {})
    } catch (e) { if (e && e.code === 401) navigation.replace("Login"); setLoading(false) }
  }, [convKey, navigation])

  useEffect(() => {
    (async () => { try { const c = await AsyncStorage.getItem(cacheKey); if (c) { setItems(JSON.parse(c)); setLoading(false) } } catch {}; load() })()
    getTargets(convKey).then((t) => { const ts = (t && t.targets) || []; setTargets(ts); setTarget(ts[(t && t.default) || 0] || null) }).catch(() => {})
    if (draft) setText(draft) // borrador de IA precargado desde Home
    const iv = setInterval(load, 5000)
    return () => { clearInterval(iv); clearInterval(recTimer.current) }
  }, [load, convKey])

  // ── ENVIAR ──
  const optimistic = (extra) => {
    const id = "opt-" + Date.now()
    setItems((x) => [...x, { id, dir: "out", ts: Date.now(), ...extra }])
    return id
  }
  async function doSend(raw) {
    let t = (raw || "").trim(); if (!t) return
    if (replyTo) { const q = (replyTo.text || "").replace(/\s+/g, " ").slice(0, 160); t = `> ${replyTo.name}: ${q}\n${t}`; setReplyTo(null) }
    setText("")
    const id = optimistic({ text: t })
    try { Haptics.selectionAsync() } catch {}
    const r = await sendMsg(convKey, t, target)
    if (r && r.error) { setItems((x) => x.filter((m) => m.id !== id)); Alert.alert("No se pudo enviar", r.error) }
    setTimeout(load, 700)
  }
  // al tocar enviar: muestra el popup con 3 opciones (corregido / tal cual / otra), como la web. Elegís y recién manda.
  const onSend = () => { const t = text.trim(); if (t) showSendOptions(t) }

  // ── OPCIONES DE IA (corregido/tal cual/otra) — usado por el mic IA ──
  async function showSendOptions(txt) {
    setBusy("Puliendo el texto…")
    const ch = (target && target.channel) || (convKey.startsWith("email:") ? "email" : "whatsapp")
    const c = await correctText(txt, ch).catch(() => null); setBusy(null)
    const corrected = (c && c.corrected || txt).trim(), original = (c && c.original || txt).trim(), alternative = (c && c.alternative || "").trim()
    setOpts({ corrected, original, alternative }); setSheet("opts")
  }

  // ── GRABACIÓN (nota de voz + mic IA) ──
  async function startRec(mode) {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync()
      if (!perm.granted) return Alert.alert("Micrófono", "Necesito permiso de micrófono.")
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync(); recorder.record()
      setRec(mode); setRecDur(0); recStart.current = Date.now()
      recTimer.current = setInterval(() => setRecDur(Math.round((Date.now() - recStart.current) / 1000)), 400)
    } catch (e) { Alert.alert("Error", "No pude grabar: " + (e.message || e)) }
  }
  async function stopRec(cancel) {
    clearInterval(recTimer.current)
    const mode = rec; setRec(null)
    const dur = Math.round((Date.now() - recStart.current) / 1000)
    try { await recorder.stop() } catch {}
    const uri = recorder.uri
    if (cancel || !uri || dur < 1) return
    if (mode === "voice") {
      const id = optimistic({ mediaType: "audio", media: uri, text: "🎤 Audio · " + durTxt(dur) })
      const r = await sendAudioFile(convKey, uri, "audio/m4a", dur, target)
      if (r && r.error) { setItems((x) => x.filter((m) => m.id !== id)); Alert.alert("No se pudo enviar el audio", r.error) }
      setTimeout(load, 900)
    } else { // mic IA → transcribir → opciones
      setBusy("Transcribiendo lo que dijiste…")
      const r = await sttFile(uri, "audio/m4a"); setBusy(null)
      const txt = (r && r.text || "").trim()
      if (!txt) return Alert.alert("Audio", "No pude entender lo que dijiste. Probá de nuevo.")
      showSendOptions(txt)
    }
  }

  // ── ADJUNTAR (fotos/videos multi-selección + archivos) ──
  async function sendOneMedia({ uri, mime, name, kind }) {
    const id = optimistic({ mediaType: kind, media: kind === "file" ? null : uri, text: kind === "video" ? "📹 Video" : kind === "image" ? "🖼 Imagen" : "📄 " + (name || "Archivo") })
    const r = await sendMediaFile(convKey, uri, mime, name || "archivo", target)
    if (r && r.error) { setItems((x) => x.filter((m) => m.id !== id)); Alert.alert("No se pudo enviar", r.error) }
  }
  async function pickImages() {
    setSheet(null)
    try { await ImagePicker.requestMediaLibraryPermissionsAsync() } catch {} // Android 13+ usa el picker del sistema, sin permiso
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.85 })
    if (res.canceled || !res.assets) return
    for (const a of res.assets) { const isVid = a.type === "video"; await sendOneMedia({ uri: a.uri, mime: a.mimeType || (isVid ? "video/mp4" : "image/jpeg"), name: a.fileName || "archivo", kind: isVid ? "video" : "image" }) }
    setTimeout(load, 900)
  }
  async function pickDoc() {
    setSheet(null)
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true })
    if (res.canceled || !res.assets) return
    for (const a of res.assets) await sendOneMedia({ uri: a.uri, mime: a.mimeType || "application/octet-stream", name: a.name || "archivo", kind: "file" })
    setTimeout(load, 900)
  }

  // ── IA: sugerir respuesta / resumir ──
  async function aiSuggest() { setSheet(null); setBusy("Redactando una respuesta…"); const r = await suggestReply(convKey).catch(() => null); setBusy(null); if (r && r.draft) setText(r.draft); else Alert.alert("IA", "No pude sugerir una respuesta ahora.") }
  async function aiSummarize(range) { setSheet(null); setBusy("Resumiendo el chat…"); const r = await summarizeChat(convKey, range).catch(() => null); setBusy(null); if (r && r.summary) { setSummary(r); setSheet("summary") } else Alert.alert("IA", "No hay mensajes en ese período.") }

  // ── REENVIAR ──
  async function forwardStart(item) {
    setSheet(null)
    const list = await getThreads().catch(() => [])
    const arr = (Array.isArray(list) ? list : (list.threads || [])).filter((t) => t.key && t.key !== "self" && t.key !== convKey && !t.espacio)
    setFwd({ item, list: arr, q: "" }); setSheet("forward")
  }
  async function doForward(destKey) {
    const it = fwd.item; const txt = (it.text || "").trim() || preview(it)
    if (!txt.trim()) return Alert.alert("Reenviar", "Ese mensaje no tiene texto para reenviar.")
    const r = await sendMsg(destKey, txt)
    if (r && r.ok) { setSheet(null); setFwd(null); Alert.alert("✓", "Reenviado") } else Alert.alert("No se pudo reenviar", (r && r.error) || "")
  }

  const openMenu = (item) => { setMenuItem(item); setSheet("menu") }
  const startReply = (item) => { setReplyTo({ name: item.dir === "out" ? "Vos" : (item.name || "Mensaje"), text: preview(item).slice(0, 160) }); setSheet(null) }

  const renderItem = ({ item }) => {
    const out = item.dir === "out"
    const hasMedia = !!item.media
    const showText = item.text && (!hasMedia || !PLACEHOLDER_RE.test(item.text))
    return (
      <Pressable onLongPress={() => openMenu(item)} delayLongPress={280} style={{ flexDirection: "row", justifyContent: out ? "flex-end" : "flex-start", paddingHorizontal: 10, marginVertical: 2 }}>
        <View style={{ maxWidth: "84%", backgroundColor: out ? theme.bubbleOut : theme.bubbleIn, borderRadius: 15, paddingHorizontal: hasMedia ? 6 : 11, paddingVertical: hasMedia ? 6 : 7, borderWidth: out ? 0 : 0.5, borderColor: theme.line }}>
          {!out && item.name ? <Text style={{ fontSize: 12, fontWeight: "700", color: color(item.name), marginBottom: 2, paddingHorizontal: hasMedia ? 5 : 0 }}>{item.name}</Text> : null}
          {hasMedia ? <MediaBubble item={item} out={out} /> : null}
          {showText ? <Text style={{ fontSize: 15.5, color: theme.ink, lineHeight: 20, marginTop: hasMedia ? 5 : 0, paddingHorizontal: hasMedia ? 5 : 0 }}>{item.text}</Text> : null}
          <Text style={{ fontSize: 10, color: out ? "#6b9a80" : theme.muted2, alignSelf: "flex-end", marginTop: 2, paddingHorizontal: hasMedia ? 5 : 0 }}>{hhmm(item.ts)}{out ? " ✓✓" : ""}</Text>
        </View>
      </Pressable>
    )
  }

  const multiTarget = targets.length > 1
  const chanIcon = target && target.channel === "email" ? "✉️" : "📱"
  const round = (bg, brd) => ({ width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center", flexShrink: 0, backgroundColor: bg, ...(brd ? { borderWidth: 1.5, borderColor: brd } : {}) })

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: insets.top + 6, paddingBottom: 9, paddingHorizontal: 8, backgroundColor: theme.card, borderBottomWidth: 0.5, borderBottomColor: theme.line }}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={{ paddingHorizontal: 6 }}><Text style={{ color: theme.accent, fontSize: 26, marginTop: -2 }}>‹</Text></TouchableOpacity>
        <TouchableOpacity activeOpacity={0.6} onPress={() => navigation.navigate("Person", { name: convKey, photo })} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Avatar name={name} photo={photo} size={34} />
          <Text numberOfLines={1} style={{ fontWeight: "700", fontSize: 17, color: theme.ink, flex: 1 }}>{name} <Text style={{ color: theme.muted2, fontSize: 13 }}>›</Text></Text>
        </TouchableOpacity>
      </View>

      {loading && !items.length ? (
        <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={theme.accent} /></View>
      ) : (
        <FlatList ref={listRef} data={items} keyExtractor={(m, i) => String(m.id || i)} renderItem={renderItem}
          contentContainerStyle={{ paddingVertical: 8 }} initialNumToRender={20}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })} onLayout={() => listRef.current?.scrollToEnd({ animated: false })} />
      )}

      {/* barra de RESPUESTA (cita) */}
      {replyTo ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 8, marginBottom: 4, padding: 8, backgroundColor: theme.bg2 || theme.bg, borderLeftWidth: 3, borderLeftColor: theme.accent, borderRadius: 8 }}>
          <View style={{ flex: 1 }}><Text style={{ fontSize: 12, fontWeight: "700", color: theme.accent }}>↩️ {replyTo.name}</Text><Text numberOfLines={1} style={{ fontSize: 12, color: theme.muted }}>{replyTo.text || "mensaje"}</Text></View>
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}><Text style={{ color: theme.muted, fontSize: 18 }}>✕</Text></TouchableOpacity>
        </View>
      ) : null}

      {/* COMPOSER o barra de grabación */}
      {rec ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, paddingBottom: (insets.bottom || 8) + 4, backgroundColor: theme.card, borderTopWidth: 0.5, borderTopColor: theme.line }}>
          <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: rec === "ai" ? theme.accent : theme.urgent }} />
          <Text style={{ fontWeight: "700", fontSize: 16 }}>{durTxt(recDur)}</Text>
          <Text style={{ flex: 1, color: theme.muted, fontSize: 13 }}>{rec === "ai" ? "Decí tu mensaje… la IA lo pasa a texto" : "Grabando nota de voz…"}</Text>
          <TouchableOpacity onPress={() => stopRec(true)} style={round(theme.bg2 || theme.bg, theme.line)}><Text style={{ fontSize: 16 }}>✕</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => stopRec(false)} style={round(theme.accent)}><Text style={{ color: "#fff", fontSize: 17 }}>➤</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, padding: 8, paddingBottom: (insets.bottom || 8) + 4, backgroundColor: theme.card, borderTopWidth: 0.5, borderTopColor: theme.line }}>
          <TouchableOpacity onPress={() => setSheet("ai")} style={round(theme.bg, theme.accent)}><Text style={{ color: theme.accent, fontWeight: "800", fontSize: 14 }}>Ai</Text></TouchableOpacity>
          {multiTarget ? <TouchableOpacity onPress={() => setSheet("target")} style={round("#fff", theme.line)}><Text style={{ fontSize: 16 }}>{chanIcon}▾</Text></TouchableOpacity> : null}
          <TextInput value={text} onChangeText={setText} placeholder={target && target.channel === "email" ? "Email…" : t("message_ph")} placeholderTextColor={theme.muted2} multiline
            style={{ flex: 1, minHeight: 40, backgroundColor: "#fff", borderWidth: 1, borderColor: theme.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15.5, maxHeight: 120, color: theme.ink }} />
          {text.trim() ? (
            <TouchableOpacity onPress={onSend} style={round(theme.accent)}><Text style={{ color: "#fff", fontSize: 18 }}>➤</Text></TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity onPress={() => setSheet("attach")} style={round(theme.bg, theme.line)}><Text style={{ fontSize: 18 }}>📎</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => startRec("voice")} style={round(theme.bg, theme.line)}><Text style={{ fontSize: 18 }}>🎤</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => startRec("ai")} style={round(theme.bg, theme.accent)}><Text style={{ fontSize: 13 }}>🎤</Text><Text style={{ fontSize: 8, color: theme.accent, fontWeight: "800", position: "absolute", bottom: 3, right: 4 }}>IA</Text></TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* overlay de "cargando" (IA/transcripción) */}
      {busy ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.25)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ backgroundColor: theme.card, padding: 20, borderRadius: 16, flexDirection: "row", gap: 12, alignItems: "center" }}>
            <ActivityIndicator color={theme.accent} /><Text style={{ fontWeight: "600", color: theme.ink }}>{busy}</Text>
          </View>
        </View>
      ) : null}

      {/* ── SHEETS ── */}
      <Sheet visible={sheet === "attach"} onClose={() => setSheet(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 12 }}>Adjuntar</Text>
        <TouchableOpacity onPress={pickImages} style={{ paddingVertical: 15, flexDirection: "row", gap: 12, alignItems: "center" }}><Text style={{ fontSize: 22 }}>🖼</Text><View><Text style={{ fontSize: 16, color: theme.ink, fontWeight: "600" }}>Fotos y videos</Text><Text style={{ fontSize: 12.5, color: theme.muted }}>Deslizá para elegir varios</Text></View></TouchableOpacity>
        <TouchableOpacity onPress={pickDoc} style={{ paddingVertical: 15, flexDirection: "row", gap: 12, alignItems: "center", borderTopWidth: 0.5, borderTopColor: theme.line }}><Text style={{ fontSize: 22 }}>📄</Text><View><Text style={{ fontSize: 16, color: theme.ink, fontWeight: "600" }}>Archivo</Text><Text style={{ fontSize: 12.5, color: theme.muted }}>PDF, documentos, etc.</Text></View></TouchableOpacity>
      </Sheet>

      <Sheet visible={sheet === "menu"} onClose={() => setSheet(null)}>
        <Text style={{ color: theme.muted, marginBottom: 12, fontSize: 13 }}><Text style={{ fontWeight: "700" }}>{menuItem ? (menuItem.dir === "out" ? "Vos" : menuItem.name) : ""}</Text> · {menuItem ? preview(menuItem).slice(0, 70) : ""}</Text>
        <TouchableOpacity onPress={() => startReply(menuItem)} style={{ paddingVertical: 14, flexDirection: "row", gap: 12 }}><Text style={{ fontSize: 17 }}>↩️</Text><Text style={{ fontSize: 16, color: theme.ink }}>{t("reply")}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => forwardStart(menuItem)} style={{ paddingVertical: 14, flexDirection: "row", gap: 12, borderTopWidth: 0.5, borderTopColor: theme.line }}><Text style={{ fontSize: 17 }}>↪</Text><Text style={{ fontSize: 16, color: theme.ink }}>{t("forward")}</Text></TouchableOpacity>
      </Sheet>

      <Sheet visible={sheet === "target"} onClose={() => setSheet(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 4 }}>Responder por…</Text>
        <Text style={{ color: theme.muted, marginBottom: 12 }}>Elegí a dónde mandar el mensaje.</Text>
        {targets.map((t, i) => (
          <TouchableOpacity key={i} onPress={() => { setTarget(t); setSheet(null) }} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, borderTopWidth: i ? 0.5 : 0, borderTopColor: theme.line }}>
            <Text style={{ fontSize: 18 }}>{t.channel === "email" ? "✉️" : "📱"}</Text>
            <Text style={{ flex: 1, fontSize: 15.5, color: theme.ink, fontWeight: target === t ? "700" : "400" }}>{t.label}</Text>
            {target === t ? <Text style={{ color: theme.accent }}>✓</Text> : null}
          </TouchableOpacity>
        ))}
      </Sheet>

      <Sheet visible={sheet === "ai"} onClose={() => setSheet(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 2 }}>✨ IA</Text>
        <Text style={{ color: theme.muted, marginBottom: 14 }}>Nada de esto se envía — es solo para vos.</Text>
        <TouchableOpacity onPress={aiSuggest} style={{ paddingVertical: 14, flexDirection: "row", gap: 12 }}><Text style={{ fontSize: 18 }}>💬</Text><View><Text style={{ fontSize: 16, fontWeight: "600", color: theme.ink }}>Sugerir respuesta</Text><Text style={{ fontSize: 12.5, color: theme.muted }}>Un borrador en tu voz</Text></View></TouchableOpacity>
        <View style={{ borderTopWidth: 0.5, borderTopColor: theme.line, paddingTop: 8 }}>
          <Text style={{ fontSize: 13, color: theme.muted, marginBottom: 6 }}>📝 Resumir chat</Text>
          {[["day", "Último día"], ["week", "Última semana"], ["month", "Último mes"], ["all", "Todo"]].map(([r, l]) => (
            <TouchableOpacity key={r} onPress={() => aiSummarize(r)} style={{ paddingVertical: 11 }}><Text style={{ fontSize: 15, color: theme.ink }}>{l}</Text></TouchableOpacity>
          ))}
        </View>
      </Sheet>

      <Sheet visible={sheet === "opts"} onClose={() => setSheet(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 12 }}>Elegí qué enviar</Text>
        {opts ? (() => {
          const changed = opts.corrected && opts.corrected !== opts.original
          const list = []
          if (changed) list.push(["✓ Corregido", opts.corrected, true], ["✍️ Tal cual lo dijiste", opts.original, false])
          else list.push(["✓ Tu texto", opts.original, true])
          if (opts.alternative && opts.alternative !== opts.corrected && opts.alternative !== opts.original) list.push(["✨ Otra forma", opts.alternative, false])
          return list.map(([tag, val, hi], i) => (
            <TouchableOpacity key={i} onPress={() => { setSheet(null); doSend(val) }} style={{ padding: 13, borderRadius: 12, marginBottom: 8, backgroundColor: hi ? theme.accent + "18" : theme.bg, borderWidth: hi ? 1.5 : 1, borderColor: hi ? theme.accent : theme.line }}>
              <Text style={{ fontSize: 11.5, fontWeight: "800", color: theme.accent, marginBottom: 4 }}>{tag}</Text>
              <Text style={{ fontSize: 15, color: theme.ink }}>{val}</Text>
            </TouchableOpacity>
          ))
        })() : null}
      </Sheet>

      <Sheet visible={sheet === "summary"} onClose={() => setSheet(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 4 }}>📝 Resumen del chat</Text>
        <Text style={{ color: theme.muted, marginBottom: 12 }}>{summary ? summary.count : 0} mensajes · guardado en el chat 🔒</Text>
        <ScrollView style={{ maxHeight: 360 }}><Text style={{ fontSize: 15, color: theme.ink, lineHeight: 22 }}>{summary ? summary.summary : ""}</Text></ScrollView>
      </Sheet>

      <Sheet visible={sheet === "forward"} onClose={() => setSheet(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 8 }}>Reenviar a…</Text>
        <TextInput placeholder="Buscar contacto…" placeholderTextColor={theme.muted2} onChangeText={(v) => setFwd((f) => ({ ...f, q: v }))}
          style={{ backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginBottom: 10, color: theme.ink }} />
        <ScrollView style={{ maxHeight: 380 }}>
          {(fwd ? fwd.list.filter((t) => !fwd.q || (t.name || "").toLowerCase().includes(fwd.q.toLowerCase())) : []).slice(0, 60).map((t) => (
            <TouchableOpacity key={t.key} onPress={() => doForward(t.key)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 }}>
              <Avatar name={t.name} photo={t.photo} size={38} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: theme.ink }}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Sheet>
    </KeyboardAvoidingView>
  )
}
