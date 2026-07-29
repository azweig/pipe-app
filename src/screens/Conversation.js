import React, { useEffect, useState, useCallback, useRef } from "react"
import { View, Text, TextInput, TouchableOpacity, Pressable, FlatList, Platform, ActivityIndicator, Alert, ScrollView, Switch, Linking, Image } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Haptics from "expo-haptics"
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from "expo-audio"
import * as ImagePicker from "expo-image-picker"
import * as DocumentPicker from "expo-document-picker"
// #3 edición de media: recortar foto (crop nativo), collage (view-shot) y recortar video (trim nativo)
import { captureRef } from "react-native-view-shot"
import VideoTrim, { showEditor as trimShowEditor } from "react-native-video-trim"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { KeyboardAvoidingView } from "react-native-keyboard-controller"
import { theme } from "../theme"
import { useT } from "../i18n"
import { getThread, getThreadDelta, sendMsg, getTargets, getThreads, suggestReply, summarizeChat, correctText, sttFile, sendAudioFile, sendMediaFile, getCovertCfg, setCovertCfg, previewCovert, getBase, summarizeMediaMsg } from "../api"
import { loadThread, saveThread } from "../store" // cache local (SQLite): historia completa en el celular, de la red solo el delta
import { hhmm, color, preview } from "../util"
import Avatar from "../components/Avatar"
import MediaBubble from "../components/MediaBubble"
import Sheet from "../components/Sheet"

const PLACEHOLDER_RE = /^(🖼|📹|🎤|📄|🌟|📎|📍|👤|🖼️)/
const durTxt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0")
// #4a: texto del mensaje con los links CLICKEABLES (antes se veía plano). Parte por URL y hace tap → abrir en el navegador.
function LinkedText({ text, style }) {
  const parts = String(text || "").split(/(https?:\/\/[^\s]+)/g)
  return (
    <Text style={style}>
      {parts.map((p, i) => /^https?:\/\//.test(p)
        ? <Text key={i} style={{ color: theme.accent, textDecorationLine: "underline" }} onPress={() => Linking.openURL(p).catch(() => {})}>{p}</Text>
        : p)}
    </Text>
  )
}

export default function Conversation({ route, navigation }) {
  const { convKey, name, photo, draft } = route.params
  const insets = useSafeAreaInsets()
  const t = useT()
  const [items, setItems] = useState([])
  const [isGroup, setIsGroup] = useState(false)
  const [covertStyle, setCovertStyle] = useState(null) // estilo del modo encubierto si está configurado para este contacto (null = no)
  const [covertOn, setCovertOn] = useState(false)      // enviar el próximo mensaje encubierto (cifrado + disfrazado)
  const [covCfg, setCovCfg] = useState(null)           // {enabled, style, styles} para el sheet de config
  const [covPass, setCovPass] = useState(""); const [covSel, setCovSel] = useState("poema"); const [covPrev, setCovPrev] = useState("")
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(true)
  const [targets, setTargets] = useState([])
  const [target, setTarget] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [sheet, setSheet] = useState(null) // 'menu' | 'target' | 'ai' | 'forward' | 'opts' | 'summary'
  const [menuItem, setMenuItem] = useState(null)
  const [mediaSum, setMediaSum] = useState(null) // #5: {loading}|{summary,transcript,lang}|{error}
  const [fwd, setFwd] = useState(null) // { item, list, q }
  const [opts, setOpts] = useState(null) // { corrected, original, alternative }
  const [correctOn, setCorrectOn] = useState(true) // #2: corrección IA al enviar ON por defecto; se puede apagar (botón ✨) y se recuerda
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(null) // texto de "cargando"
  const [rec, setRec] = useState(null) // 'voice' | 'ai'
  const [recDur, setRecDur] = useState(0)
  const listRef = useRef(null)
  const recStart = useRef(0), recTimer = useRef(null)
  // #3: collage — mientras hay uris, se monta un lienzo oculto que se captura con view-shot
  const [collage, setCollage] = useState(null) // { uris:[], loaded:0 } | null
  const collageRef = useRef(null)
  const trimTarget = useRef(null) // el target del contacto para el video ya recortado (los eventos del trim llegan async)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const sync = useRef({ maxRev: 0, ready: false }) // estado de sincronización incremental por conversación

  // merge de items nuevos/editados por id + dedup del envío optimista (el eco del server reemplaza la burbuja "opt-…")
  const mergeItems = (cur, incoming) => {
    const byId = new Map(cur.map((i) => [i.id, i]))
    for (const it of incoming) {
      byId.set(it.id, it)
      if (it.dir === "out") for (const [id, o] of [...byId]) if (String(id).startsWith("opt-") && (o.text || "") === (it.text || "") && Math.abs((o.ts || 0) - (it.ts || 0)) < 120000) byId.delete(id)
    }
    return [...byId.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0))
  }

  const load = useCallback(async () => {
    try {
      if (sync.current.ready) {
        // DELTA: solo lo nuevo/editado (rev > maxRev). El resto ya está en el SQLite del celular.
        const d = await getThreadDelta(convKey, sync.current.maxRev)
        if (d && d.maxRev != null) sync.current.maxRev = d.maxRev
        if (d && Array.isArray(d.items) && d.items.length) {
          setItems((cur) => mergeItems(cur, d.items))
          saveThread(convKey, d.items, { maxRev: sync.current.maxRev })
        }
        setLoading(false)
      } else {
        // FULL (primer sync de la sesión): últimos 60 + metadata del hilo, y a partir de acá solo delta
        const d = await getThread(convKey)
        setItems(d.items || []); setIsGroup(!!d.group); setCovertStyle(d.covert || null); if (!d.covert) setCovertOn(false); setLoading(false)
        sync.current = { maxRev: d.maxRev || 0, ready: true }
        saveThread(convKey, d.items || [], { maxRev: d.maxRev || 0, group: !!d.group, covert: d.covert || null })
      }
    } catch (e) { if (e && e.code === 401) navigation.replace("Login"); setLoading(false) }
  }, [convKey, navigation])

  useEffect(() => {
    sync.current = { maxRev: 0, ready: false };
    (async () => {
      // 1) pintar la historia cacheada en el celular (SQLite) al instante
      const { items, meta } = await loadThread(convKey)
      if (items.length) { setItems(items); setLoading(false) }
      if (meta) { if (meta.group != null) setIsGroup(!!meta.group); if ("covert" in meta) { setCovertStyle(meta.covert || null); if (!meta.covert) setCovertOn(false) } }
      // 2) sincronizar con la red: delta si ya tengo maxRev cacheado, full si no
      if (meta && meta.maxRev) sync.current = { maxRev: meta.maxRev, ready: true }
      load()
    })()
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
    const id = optimistic({ text: t, ...(covertOn ? { covert: { text: t, style: covertStyle } } : {}) }) // covert: burbuja muestra tu texto real + badge
    try { Haptics.selectionAsync() } catch {}
    const r = await sendMsg(convKey, t, target, covertOn)
    if (r && r.error) { setItems((x) => x.filter((m) => m.id !== id)); Alert.alert("No se pudo enviar", r.error) }
    setTimeout(load, 700)
  }

  // ── MODO ENCUBIERTO ("El Santo") ──
  async function openCovert() {
    const cfg = await getCovertCfg(convKey).catch(() => null)
    const c = cfg || { enabled: false, style: "poema", styles: [] }
    setCovCfg(c); setCovSel(c.style || "poema"); setCovPass(""); setCovPrev(""); setSheet("covert")
  }
  async function covPreview(pass, style) {
    if (!pass) return setCovPrev("")
    const r = await previewCovert("nos vemos mañana, avisá cuando salgas", pass, style).catch(() => null)
    setCovPrev((r && r.cover) || "")
  }
  async function covSave() {
    const pass = covPass.trim()
    if (pass.length < 4) return Alert.alert("Clave corta", "Poné una clave de al menos 4 caracteres (la MISMA que la otra persona).")
    const r = await setCovertCfg(convKey, pass, covSel).catch(() => null)
    if (!r || !r.enabled) return Alert.alert("No se pudo guardar")
    setCovertStyle(r.style); setCovertOn(true); setSheet(null)
  }
  async function covDisable() { await setCovertCfg(convKey, "", "poema").catch(() => {}); setCovertStyle(null); setCovertOn(false); setSheet(null) }
  function covReveal(item) { Alert.alert("🕊️ Texto original", "Lo que ve quien NO tiene la clave (ej. por WhatsApp):\n\n" + (item.text || "")) }
  // al tocar enviar: muestra el popup con 3 opciones (corregido / tal cual / otra), como la web. Elegís y recién manda.
  // #2: al enviar — si la corrección está ON, muestra las 3 opciones; si está OFF, manda TAL CUAL directo.
  const onSend = () => { const t = text.trim(); if (!t) return; if (correctOn) showSendOptions(t); else { setText(""); doSend(t) } }
  const toggleCorrect = () => { setCorrectOn((v) => { const nv = !v; AsyncStorage.setItem("pipe_correct", nv ? "1" : "0").catch(() => {}); return nv }) }
  useEffect(() => { AsyncStorage.getItem("pipe_correct").then((v) => { if (v === "0") setCorrectOn(false) }).catch(() => {}) }, [])

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
  async function sendOneMedia({ uri, mime, name, kind, targetOverride }) {
    const id = optimistic({ mediaType: kind, media: kind === "file" ? null : uri, text: kind === "video" ? "📹 Video" : kind === "image" ? "🖼 Imagen" : "📄 " + (name || "Archivo") })
    const r = await sendMediaFile(convKey, uri, mime, name || "archivo", targetOverride || target)
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
  // #2: sacar una foto (o video) con la CÁMARA y mandarla
  async function takePhoto() {
    setSheet(null)
    const perm = await ImagePicker.requestCameraPermissionsAsync().catch(() => null)
    if (!perm || !perm.granted) return Alert.alert("Cámara", "Necesito permiso de cámara para tomar la foto.")
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], quality: 0.85 })
    if (res.canceled || !res.assets || !res.assets[0]) return
    const a = res.assets[0], isVid = a.type === "video"
    await sendOneMedia({ uri: a.uri, mime: a.mimeType || (isVid ? "video/mp4" : "image/jpeg"), name: a.fileName || (isVid ? "video.mp4" : "foto.jpg"), kind: isVid ? "video" : "image" })
    setTimeout(load, 900)
  }
  async function pickDoc() {
    setSheet(null)
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true })
    if (res.canceled || !res.assets) return
    for (const a of res.assets) await sendOneMedia({ uri: a.uri, mime: a.mimeType || "application/octet-stream", name: a.name || "archivo", kind: "file" })
    setTimeout(load, 900)
  }

  // ── #3 EDICIÓN DE MEDIA ──
  // Recortar/rotar una foto antes de enviarla (crop nativo del picker; una sola imagen).
  async function cropPhoto() {
    setSheet(null)
    try { await ImagePicker.requestMediaLibraryPermissionsAsync() } catch {}
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.9 })
    if (res.canceled || !res.assets || !res.assets[0]) return
    const a = res.assets[0]
    await sendOneMedia({ uri: a.uri, mime: a.mimeType || "image/jpeg", name: a.fileName || "foto.jpg", kind: "image" })
    setTimeout(load, 900)
  }
  // Collage: elegí 2–6 fotos → se arman en una grilla y se envía como una sola imagen.
  async function pickCollage() {
    setSheet(null)
    try { await ImagePicker.requestMediaLibraryPermissionsAsync() } catch {}
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 6, quality: 0.9 })
    if (res.canceled || !res.assets || res.assets.length < 2) {
      if (res.assets && res.assets.length === 1) return Alert.alert("Collage", "Elegí al menos 2 fotos para el collage.")
      return
    }
    setCollage({ uris: res.assets.slice(0, 6).map((a) => a.uri), loaded: 0 })
  }
  // Recortar un video: abre el editor nativo; el resultado llega por el evento onFinishTrimming (ver useEffect).
  async function trimVideo() {
    setSheet(null)
    try { await ImagePicker.requestMediaLibraryPermissionsAsync() } catch {}
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], quality: 1 })
    if (res.canceled || !res.assets || !res.assets[0]) return
    trimTarget.current = target
    try { trimShowEditor(res.assets[0].uri, { saveToPhoto: false, removeAfterSavedToPhoto: true, enableCancelDialog: false }) }
    catch (e) { Alert.alert("Recortar video", "No pude abrir el editor: " + (e.message || e)) }
  }

  // El editor de video es asíncrono: escuchamos sus eventos una sola vez y enviamos el clip recortado.
  useEffect(() => {
    const done = VideoTrim.onFinishTrimming(async (e) => {
      const uri = e && (e.outputPath || e.path)
      if (!uri) return
      const t = trimTarget.current; trimTarget.current = null
      await sendOneMedia({ uri: uri.startsWith("file://") ? uri : "file://" + uri, mime: "video/mp4", name: "recorte.mp4", kind: "video", targetOverride: t })
      setTimeout(load, 900)
    })
    const err = VideoTrim.onError((e) => { trimTarget.current = null; Alert.alert("Recortar video", "No se pudo recortar el video.") })
    return () => { try { done && done.remove(); err && err.remove() } catch {} }
  }, [convKey, target])

  // Captura el collage una vez que TODAS las fotos cargaron, y lo envía.
  useEffect(() => {
    if (!collage || collage.loaded < collage.uris.length || !collageRef.current) return
    let alive = true
    ;(async () => {
      try {
        await new Promise((r) => setTimeout(r, 120)) // deja pintar el último frame
        const uri = await captureRef(collageRef, { format: "jpg", quality: 0.9, result: "tmpfile" })
        if (!alive) return
        await sendOneMedia({ uri: uri.startsWith("file://") ? uri : "file://" + uri, mime: "image/jpeg", name: "collage.jpg", kind: "image" })
        setTimeout(load, 900)
      } catch (e) { Alert.alert("Collage", "No pude armar el collage.") }
      finally { if (alive) setCollage(null) }
    })()
    return () => { alive = false }
  }, [collage])

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
  // #5: transcribir + resumir el media del mensaje (traducido al español)
  async function mediaSummarize(item) {
    setSheet(null); setMediaSum({ loading: true })
    const r = await summarizeMediaMsg(item.id).catch(() => null)
    setMediaSum(!r || r.error ? { error: (r && r.error) || "No se pudo procesar el archivo." } : r)
  }
  const startReply = (item) => { setReplyTo({ name: item.dir === "out" ? "Vos" : (item.name || "Mensaje"), text: preview(item).slice(0, 160) }); setSheet(null) }

  const renderItem = ({ item }) => {
    const out = item.dir === "out"
    const hasMedia = !!item.media
    const showText = item.text && (!hasMedia || !PLACEHOLDER_RE.test(item.text))
    return (
      <Pressable onLongPress={() => openMenu(item)} delayLongPress={280} style={{ flexDirection: "row", justifyContent: out ? "flex-end" : "flex-start", paddingHorizontal: 10, marginVertical: 2 }}>
        <View style={{ maxWidth: "84%", backgroundColor: out ? theme.bubbleOut : theme.bubbleIn, borderRadius: 15, paddingHorizontal: hasMedia ? 6 : 11, paddingVertical: hasMedia ? 6 : 7, borderWidth: out ? 0 : 0.5, borderColor: theme.line }}>
          {!out && isGroup && item.name ? <Text style={{ fontSize: 12, fontWeight: "700", color: color(item.name), marginBottom: 2, paddingHorizontal: hasMedia ? 5 : 0 }}>{item.name}</Text> : null}
          {hasMedia ? <MediaBubble item={item} out={out} /> : null}
          {item.covert ? (
            <View>
              <Text style={{ fontSize: 15.5, color: theme.ink, lineHeight: 20 }}>{item.covert.text}</Text>
              <TouchableOpacity onPress={() => covReveal(item)} hitSlop={6}><Text style={{ fontSize: 11, color: theme.accent, marginTop: 3 }}>🕊️ descifrado · ver original</Text></TouchableOpacity>
            </View>
          ) : (showText ? <LinkedText text={item.text} style={{ fontSize: 15.5, color: theme.ink, lineHeight: 20, marginTop: hasMedia ? 5 : 0, paddingHorizontal: hasMedia ? 5 : 0 }} /> : null)}
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
        <TouchableOpacity activeOpacity={0.6} onPress={() => navigation.navigate("Person", { name: name || convKey, photo })} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Avatar name={name} photo={photo} size={34} />
          <Text numberOfLines={1} style={{ fontWeight: "700", fontSize: 17, color: theme.ink, flex: 1 }}>{name} <Text style={{ color: theme.muted2, fontSize: 13 }}>›</Text></Text>
        </TouchableOpacity>
        {convKey !== "self" ? <TouchableOpacity onPress={openCovert} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center", backgroundColor: covertOn ? theme.accent : "transparent" }}><Text style={{ fontSize: 19, opacity: covertOn ? 1 : (covertStyle ? 0.85 : 0.4) }}>🕊️</Text></TouchableOpacity> : null}
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
          <TextInput value={text} onChangeText={setText} placeholder={covertOn ? "🕊️ Mensaje encubierto…" : (target && target.channel === "email" ? "Email…" : t("message_ph"))} placeholderTextColor={theme.muted2} multiline
            style={{ flex: 1, minHeight: 40, backgroundColor: "#fff", borderWidth: 1, borderColor: theme.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15.5, maxHeight: 120, color: theme.ink }} />
          {text.trim() ? (
            <>
              <TouchableOpacity onPress={toggleCorrect} accessibilityLabel="Corregir con IA al enviar" style={round(correctOn ? theme.accent : theme.bg, correctOn ? theme.accent : theme.line)}><Text style={{ fontSize: 15, color: correctOn ? "#fff" : theme.muted }}>✨</Text></TouchableOpacity>
              <TouchableOpacity onPress={onSend} style={round(theme.accent)}><Text style={{ color: "#fff", fontSize: 18 }}>➤</Text></TouchableOpacity>
            </>
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

      {/* #3: lienzo OCULTO del collage — se dibuja fuera de pantalla y se captura con view-shot cuando cargan todas las fotos */}
      {collage ? (() => {
        const n = collage.uris.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols)
        const SIZE = 300, G = 3, cw = Math.floor(SIZE / cols), ch = Math.floor(SIZE / rows)
        const bump = () => setCollage((c) => (c ? { ...c, loaded: c.loaded + 1 } : c))
        return (
          <View style={{ position: "absolute", left: -10000, top: 0 }} pointerEvents="none">
            <View ref={collageRef} collapsable={false} style={{ width: cols * cw, height: rows * ch, backgroundColor: "#fff", flexDirection: "row", flexWrap: "wrap" }}>
              {collage.uris.map((u, i) => (
                <Image key={i} source={{ uri: u }} resizeMode="cover" onLoad={bump} onError={bump}
                  style={{ width: cw - G, height: ch - G, margin: G / 2, backgroundColor: "#eee" }} />
              ))}
            </View>
          </View>
        )
      })() : null}

      {/* ── SHEETS ── */}
      <Sheet visible={sheet === "attach"} onClose={() => setSheet(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 12 }}>Adjuntar</Text>
        <TouchableOpacity onPress={takePhoto} style={{ paddingVertical: 15, flexDirection: "row", gap: 12, alignItems: "center" }}><Text style={{ fontSize: 22 }}>📷</Text><View><Text style={{ fontSize: 16, color: theme.ink, fontWeight: "600" }}>Cámara</Text><Text style={{ fontSize: 12.5, color: theme.muted }}>Sacá una foto o video</Text></View></TouchableOpacity>
        <TouchableOpacity onPress={pickImages} style={{ paddingVertical: 15, flexDirection: "row", gap: 12, alignItems: "center", borderTopWidth: 0.5, borderTopColor: theme.line }}><Text style={{ fontSize: 22 }}>🖼</Text><View><Text style={{ fontSize: 16, color: theme.ink, fontWeight: "600" }}>Fotos y videos</Text><Text style={{ fontSize: 12.5, color: theme.muted }}>Deslizá para elegir varios</Text></View></TouchableOpacity>
        <TouchableOpacity onPress={cropPhoto} style={{ paddingVertical: 15, flexDirection: "row", gap: 12, alignItems: "center", borderTopWidth: 0.5, borderTopColor: theme.line }}><Text style={{ fontSize: 22 }}>✂️</Text><View><Text style={{ fontSize: 16, color: theme.ink, fontWeight: "600" }}>Recortar foto</Text><Text style={{ fontSize: 12.5, color: theme.muted }}>Cortá y enderezá antes de enviar</Text></View></TouchableOpacity>
        <TouchableOpacity onPress={pickCollage} style={{ paddingVertical: 15, flexDirection: "row", gap: 12, alignItems: "center", borderTopWidth: 0.5, borderTopColor: theme.line }}><Text style={{ fontSize: 22 }}>🧩</Text><View><Text style={{ fontSize: 16, color: theme.ink, fontWeight: "600" }}>Collage</Text><Text style={{ fontSize: 12.5, color: theme.muted }}>Uní 2 a 6 fotos en una sola</Text></View></TouchableOpacity>
        <TouchableOpacity onPress={trimVideo} style={{ paddingVertical: 15, flexDirection: "row", gap: 12, alignItems: "center", borderTopWidth: 0.5, borderTopColor: theme.line }}><Text style={{ fontSize: 22 }}>🎬</Text><View><Text style={{ fontSize: 16, color: theme.ink, fontWeight: "600" }}>Recortar video</Text><Text style={{ fontSize: 12.5, color: theme.muted }}>Elegí el pedazo que querés mandar</Text></View></TouchableOpacity>
        <TouchableOpacity onPress={pickDoc} style={{ paddingVertical: 15, flexDirection: "row", gap: 12, alignItems: "center", borderTopWidth: 0.5, borderTopColor: theme.line }}><Text style={{ fontSize: 22 }}>📄</Text><View><Text style={{ fontSize: 16, color: theme.ink, fontWeight: "600" }}>Archivo</Text><Text style={{ fontSize: 12.5, color: theme.muted }}>PDF, documentos, etc.</Text></View></TouchableOpacity>
      </Sheet>

      <Sheet visible={sheet === "menu"} onClose={() => setSheet(null)}>
        <Text style={{ color: theme.muted, marginBottom: 12, fontSize: 13 }}><Text style={{ fontWeight: "700" }}>{menuItem ? (menuItem.dir === "out" ? "Vos" : menuItem.name) : ""}</Text> · {menuItem ? preview(menuItem).slice(0, 70) : ""}</Text>
        <TouchableOpacity onPress={() => startReply(menuItem)} style={{ paddingVertical: 14, flexDirection: "row", gap: 12 }}><Text style={{ fontSize: 17 }}>↩️</Text><Text style={{ fontSize: 16, color: theme.ink }}>{t("reply")}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => forwardStart(menuItem)} style={{ paddingVertical: 14, flexDirection: "row", gap: 12, borderTopWidth: 0.5, borderTopColor: theme.line }}><Text style={{ fontSize: 17 }}>↪</Text><Text style={{ fontSize: 16, color: theme.ink }}>{t("forward")}</Text></TouchableOpacity>
        {menuItem && menuItem.media && /^(video|audio|image)$/.test(menuItem.mediaType || "") ? (
          <TouchableOpacity onPress={() => mediaSummarize(menuItem)} style={{ paddingVertical: 14, flexDirection: "row", gap: 12, borderTopWidth: 0.5, borderTopColor: theme.line }}><Text style={{ fontSize: 17 }}>🌐</Text><Text style={{ fontSize: 16, color: theme.ink }}>Transcribir y resumir</Text></TouchableOpacity>
        ) : null}
      </Sheet>

      {/* #5: resultado de transcribir+resumir */}
      <Sheet visible={!!mediaSum} onClose={() => setMediaSum(null)}>
        {mediaSum && mediaSum.loading ? (
          <View style={{ alignItems: "center", paddingVertical: 24 }}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted, marginTop: 12 }}>Transcribiendo y resumiendo…</Text></View>
        ) : mediaSum && mediaSum.error ? (
          <View style={{ paddingVertical: 10 }}><Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 8 }}>No se pudo</Text><Text style={{ color: theme.muted, fontSize: 15 }}>{mediaSum.error}</Text></View>
        ) : mediaSum ? (
          <ScrollView style={{ maxHeight: 520 }}>
            <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 10 }}>🌐 Resumen{mediaSum.lang && mediaSum.lang !== "es" ? `  (${mediaSum.lang}→es)` : ""}</Text>
            <Text style={{ fontSize: 15.5, color: theme.ink, lineHeight: 22 }}>{mediaSum.summary}</Text>
            {mediaSum.transcript ? (<><Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, marginTop: 16, marginBottom: 6 }}>TRANSCRIPCIÓN</Text><Text style={{ fontSize: 13.5, color: theme.muted, lineHeight: 19 }}>{mediaSum.transcript}</Text></>) : null}
          </ScrollView>
        ) : null}
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

      {/* MODO ENCUBIERTO: clave + estilo, botón SIEMPRE visible (antes de la preview), preview recortada al final */}
      <Sheet visible={sheet === "covert"} onClose={() => setSheet(null)}>
        <View>
          <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 4 }}>🕊️ Modo encubierto</Text>
          <Text style={{ fontSize: 12.5, color: theme.muted, marginBottom: 12, lineHeight: 17 }}>Tu mensaje viaja cifrado, disfrazado de texto normal (poema, cuento…). {name} con la misma clave lo ve descifrado. ¿No tiene Pipe? → descifra en {String(getBase() || "tu hub").replace(/^https?:\/\//, "")}/decrypt</Text>
          {covertStyle ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.bg, borderRadius: 12, padding: 13, marginBottom: 12 }}>
              <Text style={{ fontSize: 15.5, color: theme.ink, fontWeight: "700" }}>Enviar encubierto</Text>
              <Switch value={covertOn} onValueChange={setCovertOn} trackColor={{ true: theme.accent }} />
            </View>
          ) : null}
          <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, marginBottom: 6 }}>{covertStyle ? "CAMBIAR CLAVE" : "CLAVE COMPARTIDA"}</Text>
          <TextInput value={covPass} onChangeText={(v) => { setCovPass(v); covPreview(v, covSel) }} placeholder="Ej. nuestro café 2019" placeholderTextColor={theme.muted2} autoCapitalize="none" autoCorrect={false} returnKeyType="done" style={{ backgroundColor: theme.bg, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, color: theme.ink, marginBottom: 10 }} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {((covCfg && covCfg.styles) || []).map((s) => (
              <TouchableOpacity key={s.id} onPress={() => { setCovSel(s.id); covPreview(covPass, s.id) }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: covSel === s.id ? theme.accent : theme.bg }}>
                <Text style={{ color: covSel === s.id ? "#fff" : theme.muted, fontWeight: "700", fontSize: 12.5 }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={covSave} style={{ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{covertStyle ? "Guardar cambios" : "Activar modo encubierto"}</Text></TouchableOpacity>
          {covertStyle ? <TouchableOpacity onPress={covDisable} style={{ paddingVertical: 11, alignItems: "center", marginTop: 2 }}><Text style={{ color: theme.urgent, fontWeight: "700" }}>Desactivar</Text></TouchableOpacity> : null}
          {covPrev ? <View style={{ backgroundColor: theme.bg, borderRadius: 12, padding: 12, marginTop: 12 }}><Text style={{ fontSize: 11, color: theme.muted2, marginBottom: 4 }}>Vista previa (así se ve)</Text><Text numberOfLines={4} style={{ fontSize: 13, color: theme.ink, lineHeight: 18 }}>{covPrev}</Text></View> : null}
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  )
}
