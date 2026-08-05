import React, { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, RefreshControl, StatusBar, BackHandler, AppState, ActivityIndicator } from "react-native"
import Swipeable from "react-native-gesture-handler/Swipeable"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { theme } from "../theme"
import { useT } from "../i18n"
import { getThreads, getGroups, setArchive, setSilence, saveEspacio, searchContent, mergeContacts, getAccounts,
  secretOn, isSecretPinSet, onSecretChange, secretLock, getSecretStatus, secretSetup, secretUnlock, getSecretState, secretSetWa, secretSetAccount } from "../api"
import { ago, preview, espIcon, bucketCat } from "../util"
// (ago se usa también en las tarjetas de resultados de la búsqueda contextual)
import Avatar from "../components/Avatar"
import Sheet from "../components/Sheet"
import { Alert } from "react-native"

const CH_BADGE = {
  whatsapp: { t: "WhatsApp", bg: "#25D366" }, email: { t: "Mail", bg: "#EA4335" }, telegram: { t: "Telegram", bg: "#229ED9" },
  instagram: { t: "Instagram", bg: "#E1306C" }, signal: { t: "Signal", bg: "#3A76F0" }, messenger: { t: "Messenger", bg: "#0084FF" },
  discord: { t: "Discord", bg: "#5865F2" }, teams: { t: "Teams", bg: "#5B5FC7" }, sms: { t: "SMS", bg: "#34C759" }, kofi: { t: "Ko-fi", bg: "#FF5E5B" }, meeting: { t: "Reunión", bg: "#8b5cf6" },
}
function channelsOf(item) {
  const out = []; const add = (c) => { if (c && CH_BADGE[c] && !out.includes(c)) out.push(c) }
  add(item.lastChannel); (item.channels || []).forEach(add); return out.slice(0, 3)
}
const SwipeAction = ({ label, bg, align }) => (
  <View style={{ backgroundColor: bg, justifyContent: "center", alignItems: align === "left" ? "flex-start" : "flex-end", flex: 1, paddingHorizontal: 22 }}>
    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{label}</Text>
  </View>
)

export default function Inbox({ navigation }) {
  const insets = useSafeAreaInsets()
  const t = useT()
  const [rows, setRows] = useState([])
  const [groups, setGroups] = useState([])
  const [tab, setTab] = useState("todo")
  const [q, setQ] = useState("")
  const [aiRes, setAiRes] = useState(null) // búsqueda contextual (router-search): {loading}|{error}|{mode,type,answer,results,threads,…}
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  // MODO SELECCIÓN: elegir 2+ contactos y UNIRLOS (dedupe la misma persona partida en varios hilos). El 1ro seleccionado (en orden de lista) es el que se CONSERVA.
  const [selMode, setSelMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [merging, setMerging] = useState(false)
  const toggleSel = useCallback((key) => setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n }), [])
  const exitSel = useCallback(() => { setSelMode(false); setSelected(new Set()) }, [])

  // 🔒 CUENTAS SECRETAS: botón PIN↔Ocultar, gestor de cuentas ocultas y prompt del 2º PIN. El token vive en api.js (solo memoria).
  const [secUnlocked, setSecUnlocked] = useState(secretOn())
  const [secManage, setSecManage] = useState(false)            // gestor visible
  const [secNums, setSecNums] = useState([])                   // números de WhatsApp (de /api/accounts)
  const [secEmails, setSecEmails] = useState([])               // cuentas de correo
  const [secState, setSecState] = useState({ numbers: [], accounts: [] }) // qué está marcado como secreto (de /api/secret/state)
  const [pinPrompt, setPinPrompt] = useState(null)             // { title, sub } | null
  const [pinVal, setPinVal] = useState("")
  const pinResolver = useRef(null)
  const askPin = useCallback((title, sub) => new Promise((resolve) => { pinResolver.current = resolve; setPinVal(""); setPinPrompt({ title, sub }) }), [])
  const closePin = useCallback((val) => { const r = pinResolver.current; pinResolver.current = null; setPinPrompt(null); setPinVal(""); if (r) r(val) }, [])
  const isNumSecret = useCallback((n) => (secState.numbers || []).includes(String(n).replace(/\D/g, "")), [secState])
  const isAcctSecret = useCallback((ch, ac) => (secState.accounts || []).some((a) => a.channel === ch && a.account === ac), [secState])

  // botón "atrás" del celular en la bandeja: si hay búsqueda o un filtro de tab activo, lo LIMPIA (no sale de la app). Solo sale si no hay nada que limpiar.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selMode) { exitSel(); return true }
      if (q) { setQ(""); setAiRes(null); return true }
      if (tab !== "todo") { setTab("todo"); return true }
      return false
    })
    return () => sub.remove()
  }, [q, tab, selMode, exitSel])

  // buscador CONTEXTUAL (⚡/🧠): busca dentro del CUERPO de los mensajes. Se dispara al tocar la lupa del teclado o el chip de "buscar en el contenido".
  const runAiSearch = useCallback(async () => {
    const query = q.trim()
    if (!query) { setAiRes(null); return }
    setAiRes({ loading: true })
    try { const r = await searchContent(query); setAiRes(r && (r.answer || r.results || r.threads) ? r : { error: true }) }
    catch (e) { if (e && e.code === 401) return navigation.replace("Login"); setAiRes({ error: true }) }
  }, [q, navigation])

  // abre una conversación por key (reusa la foto/nombre del hilo si lo tengo cacheado)
  const openConv = useCallback((key, fallbackName) => {
    const row = rows.find((t) => t.key === key)
    navigation.navigate("Conversation", { convKey: key, name: (row && row.name) || fallbackName || key, photo: row && row.photo })
  }, [rows, navigation])

  async function createEspacio() {
    const v = newName.trim(); if (!v) return
    try { const e = await saveEspacio({ name: v }); setCreating(false); setNewName(""); load(); if (e && e.id) navigation.navigate("Espacio", { id: e.id, name: e.name }) } // creado → abrilo para agregar reglas
    catch (err) { Alert.alert("Error", err.message || "No se pudo crear el espacio") }
  }

  const load = useCallback(async (spin) => {
    if (spin) setRefreshing(true)
    try {
      const [data, g] = await Promise.all([getThreads(), getGroups().catch(() => null)])
      const arr = Array.isArray(data) ? data : (data.threads || [])
      const clean = arr.filter((t) => t.key && t.key !== "self")
      setRows(clean)
      if (g && g.groups) setGroups(g.groups)
      if (!isSecretPinSet()) AsyncStorage.setItem("threads", JSON.stringify(clean)).catch(() => {}) // 🔒 con 2º PIN no persistimos la bandeja (podría traer una línea oculta)
    } catch (e) { if (e && e.code === 401) navigation.replace("Login") } finally { setRefreshing(false) }
  }, [navigation])

  // al des/bloquear (por botón, out-of-focus o inactividad) re-fetch: los hilos secretos aparecen/desaparecen sin sacarte de la vista.
  useEffect(() => {
    setSecUnlocked(secretOn())
    const off = onSecretChange(() => { setSecUnlocked(secretOn()); if (!secretOn()) setSecManage(false); load(false) })
    return off
  }, [load])

  // abre el gestor de cuentas ocultas: lista tus números de WhatsApp + cuentas de correo con un toggle ☐/☑ reflejando /api/secret/state.
  const openSecretManage = useCallback(async () => {
    if (!secretOn()) return
    const acc = await getAccounts().catch(() => ({}))
    const state = await getSecretState().catch(() => null)
    const nums = (acc.messaging && acc.messaging[0] && acc.messaging[0].numbers) || []
    setSecNums(nums); setSecEmails(acc.email || []); setSecState(state || { numbers: [], accounts: [] })
    setSecManage(true)
  }, [])

  // desbloqueo: status → (si no hay 2º PIN, crearlo) → pedir PIN → unlock. Si NO hay nada marcado aún, abrir el gestor para elegir cuál.
  const doSecretUnlock = useCallback(async () => {
    const st = await getSecretStatus(); if (!st) return
    if (!st.pinSet) {
      const p1 = await askPin(t("secret_create_pin"), t("secret_create_pin_sub")); if (!p1) return
      const r = await secretSetup(p1); if (r && r.error) return Alert.alert("", r.error)
    }
    const pin = await askPin(t("secret_pin_title"), t("secret_enter_pin")); if (!pin) return
    const r = await secretUnlock(pin); if (!r || r.error) return Alert.alert("", (r && r.error) || t("secret_wrong_pin"))
    const state = await getSecretState().catch(() => null); const s = state || { numbers: [], accounts: [] }; setSecState(s)
    const marked = (s.numbers || []).length + (s.accounts || []).length
    if (!marked) openSecretManage() // todavía no ocultaste ninguna cuenta → abrí el gestor (así no hay que cazarlo en Ajustes)
  }, [askPin, t, openSecretManage])

  // marcar/desmarcar: si marcás una cuenta → esconder YA (bloquear + refrescar la bandeja). Si desmarcás → refrescar el estado y seguir en el gestor.
  const secMark = useCallback(async (fn, want) => {
    const r = await fn()
    if (!r) return Alert.alert("", t("secret_save_fail"))
    if (r.error) { if (r.error === "bloqueado") { Alert.alert("", t("secret_relocked")); setSecManage(false); doSecretUnlock() } else Alert.alert("", r.error); return }
    const state = await getSecretState().catch(() => null); setSecState(state || { numbers: [], accounts: [] })
    if (want) { setSecManage(false); await secretLock() } // el lock emite → el subscriber re-fetchea la bandeja y desaparece
  }, [t, doSecretUnlock])
  const toggleNum = useCallback((n) => { const want = !isNumSecret(n); secMark(() => secretSetWa(n, want), want) }, [isNumSecret, secMark])
  const toggleEmail = useCallback((label) => { const want = !isAcctSecret("email", label); secMark(() => secretSetAccount("email", label, want), want) }, [isAcctSecret, secMark])
  const onSecretBtn = useCallback(() => { secretOn() ? secretLock() : doSecretUnlock() }, [doSecretUnlock])

  useEffect(() => {
    (async () => {
      // 🔒 con 2º PIN configurado saltamos el cache local y traemos fresco del server (que filtra lo oculto cuando está bloqueado)
      if (!isSecretPinSet()) { try { const c = await AsyncStorage.getItem("threads"); if (c) setRows(JSON.parse(c).filter((t) => t.key && t.key !== "self")) } catch {} }
      load(false)
    })()
    const unsub = navigation.addListener("focus", () => load(false))
    const t = setInterval(() => load(false), 15000)
    const appSub = AppState.addEventListener("change", (s) => { if (s === "active") load(false) }) // al volver de background → refrescar
    return () => { unsub(); clearInterval(t); appSub && appSub.remove() }
  }, [load, navigation])

  const silN = useMemo(() => rows.filter((t) => t.silenced).length, [rows])
  const TABS = useMemo(() => ([
    { id: "todo", name: "Todo" },
    ...groups.map((g) => ({ id: g.id, name: (g.icon ? g.icon + " " : "") + g.name })),
    ...(silN ? [{ id: "_sil", name: `🔕 Silenciados (${silN})` }] : []),
  ]), [groups, silN])

  const shown = useMemo(() => {
    const nq = q.trim().toLowerCase(), ndig = nq.replace(/\D/g, "")
    const matchQ = (t) => {
      if (!nq) return true
      const hay = `${t.name || ""} ${t.key || ""} ${t.email || ""} ${t.ident || ""}`.toLowerCase()
      return hay.includes(nq) || (ndig.length >= 3 && hay.replace(/\D/g, "").includes(ndig))
    }
    const out = rows.filter((t) => {
      if (bucketCat(t) === "spam") return false
      if (nq) return matchQ(t)
      if (tab === "_sil") return !!t.silenced
      if (t.silenced) return false
      return tab === "todo" ? true : bucketCat(t) === tab
    })
    if (nq) return out
    return out.slice().sort((a, b) => (b.escalated ? 1 : 0) - (a.escalated ? 1 : 0)) // el piloto escaló → arriba de todo
  }, [rows, q, tab])

  // claves seleccionadas EN ORDEN DE LISTA → target = la 1ra (se conserva), el resto se absorbe. Solo hilos reales (con key, no espacios).
  const selKeys = useMemo(() => shown.filter((t) => t.key && !t.espacio && selected.has(t.key)).map((t) => t.key), [shown, selected])
  const targetName = useMemo(() => { const r = shown.find((t) => t.key === selKeys[0]); return (r && r.name) || "" }, [shown, selKeys])
  const doMerge = useCallback(async () => {
    if (selKeys.length < 2 || merging) return
    const [target, ...rest] = selKeys
    const n = selKeys.length
    setMerging(true)
    try {
      await mergeContacts(target, rest)
      exitSel()
      await load(false) // re-fetch: los hilos absorbidos ya no vuelven del server
      Alert.alert("🔗 " + t("merged_ok"), t("merged_n", { n }))
    } catch (e) {
      if (e && e.code === 401) return navigation.replace("Login")
      Alert.alert("Error", (e && e.message) || t("merge_fail"))
    } finally { setMerging(false) }
  }, [selKeys, merging, exitSel, load, navigation, t])

  // acciones de swipe (optimistas)
  const doArchive = useCallback(async (item) => {
    setRows((r) => r.filter((t) => t.key !== item.key)) // archivado → sale de la bandeja (el server ya no lo devuelve)
    try { await setArchive(item.key, true) } catch {}
  }, [])
  const doSilence = useCallback(async (item) => {
    const on = !item.silenced
    setRows((r) => r.map((t) => (t.key === item.key ? { ...t, silenced: on } : t)))
    try { await setSilence(item.key, on) } catch {}
  }, [])

  // tarjeta de resultados de la búsqueda contextual (⚡ facetas / 🧠 IA). Aparece arriba de la lista de contactos.
  const cardWrap = { backgroundColor: theme.bg, marginHorizontal: 12, marginBottom: 8, padding: 14, borderRadius: 14, borderWidth: 0.5, borderColor: theme.line }
  const AiCard = () => {
    if (!aiRes) return null
    if (aiRes.loading) return (<View style={{ ...cardWrap, flexDirection: "row", alignItems: "center" }}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted, marginLeft: 10 }}>Buscando en tus mensajes…</Text></View>)
    if (aiRes.error) return (<View style={cardWrap}><Text style={{ color: theme.muted }}>No pude buscar eso ahora — probá de nuevo.</Text></View>)
    const fast = aiRes.mode === "facets"
    const chip = (<View style={{ backgroundColor: fast ? "#0ea5e9" : theme.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{fast ? `⚡ ${aiRes.engine || "facetas"}` : "🧠 IA · RAG"}</Text></View>)
    const srcs = (aiRes.threads || []).slice(0, 5)
    const sources = srcs.length ? (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {srcs.map((s) => (
          <TouchableOpacity key={s.key} onPress={() => openConv(s.key, s.name)} style={{ backgroundColor: theme.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 0.5, borderColor: theme.line }}>
            <Text style={{ fontSize: 12.5, color: theme.ink }}>{s.name || s.key}</Text>
          </TouchableOpacity>
        ))}
      </View>
    ) : null
    if (aiRes.type === "find") {
      const results = aiRes.results || []
      return (
        <View style={cardWrap}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}><Text style={{ fontWeight: "800", color: theme.ink, fontSize: 14, flex: 1 }}>🔎 {results.length} resultado{results.length === 1 ? "" : "s"}</Text>{chip}</View>
          {results.length ? results.slice(0, 30).map((m, i) => {
            const label = m.filename || m.text || m.mediaType || "archivo"
            return (
              <TouchableOpacity key={m.id || i} onPress={() => openConv(m.key, m.name)} style={{ paddingVertical: 9, borderTopWidth: i ? 0.5 : 0, borderTopColor: theme.line }}>
                <Text numberOfLines={1} style={{ fontSize: 14.5, color: theme.ink }}>{String(label).slice(0, 90)}</Text>
                <Text style={{ fontSize: 12, color: theme.muted2, marginTop: 2 }}>{m.name || ""}{m.ts ? " · " + ago(m.ts) : ""}</Text>
              </TouchableOpacity>
            )
          }) : <Text style={{ color: theme.muted }}>No encontré nada con eso.</Text>}
          {sources}
        </View>
      )
    }
    return (
      <View style={cardWrap}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}><Text style={{ fontWeight: "800", color: theme.ink, fontSize: 14, flex: 1 }}>Respuesta de tu cerebro</Text>{chip}</View>
        <Text style={{ fontSize: 14.5, color: theme.ink, lineHeight: 21 }}>{aiRes.answer || "No pude responder eso — probá reformular."}</Text>
        {sources ? (<><Text style={{ fontSize: 11, color: theme.muted2, marginTop: 12, fontWeight: "700" }}>FUENTES</Text>{sources}</>) : null}
      </View>
    )
  }

  const Row = ({ item }) => {
    // ESPACIO (sin swipe)
    if (item.espacio) {
      return (
        <TouchableOpacity activeOpacity={0.55} disabled={selMode} onPress={() => navigation.navigate("Espacio", { id: item.espId, name: item.name })}
          style={{ flexDirection: "row", alignItems: "center", paddingLeft: 16, gap: 12, backgroundColor: theme.card }}>
          <View style={{ width: 50, height: 50, borderRadius: 15, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.line, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ fontSize: 24 }}>{espIcon(item.icon)}</Text>
          </View>
          <View style={{ flex: 1, borderBottomWidth: 0.5, borderBottomColor: theme.line, paddingVertical: 11, paddingRight: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text numberOfLines={1} style={{ fontWeight: "600", fontSize: 16, color: theme.ink, flex: 1, marginRight: 8 }}>{item.name}</Text>
              <Text style={{ color: theme.muted2, fontSize: 12 }}>{ago(item.ts)}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
              <View style={{ backgroundColor: theme.accent, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5 }}><Text style={{ color: "#fff", fontSize: 9.5, fontWeight: "700" }}>Espacio</Text></View>
              <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 14, flex: 1 }}>{preview({ text: item.lastText }) || "…"}</Text>
            </View>
          </View>
        </TouchableOpacity>
      )
    }
    // CONVERSACIÓN (con swipe): ←izq archiva, der→ silencia. En MODO SELECCIÓN: sin swipe, tap = marcar/desmarcar para unir.
    const chs = channelsOf(item)
    const swipeRef = React.createRef()
    const isSel = selMode && selected.has(item.key)
    const content = (
      <TouchableOpacity activeOpacity={0.55}
        onLongPress={() => { if (!selMode) { setSelMode(true); toggleSel(item.key) } }} delayLongPress={280}
        onPress={() => selMode ? toggleSel(item.key) : navigation.navigate("Conversation", { convKey: item.key, name: item.name, photo: item.photo })}
        style={{ flexDirection: "row", alignItems: "center", paddingLeft: 16, gap: 12, backgroundColor: isSel ? "rgba(99,102,241,0.10)" : item.escalated ? "rgba(224,135,43,0.10)" : theme.card, borderLeftWidth: item.escalated ? 3 : 0, borderLeftColor: "#e0872b" }}>
        {selMode ? (
          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: isSel ? theme.accent : theme.muted2, backgroundColor: isSel ? theme.accent : "transparent", justifyContent: "center", alignItems: "center", marginLeft: -4 }}>
            {isSel ? <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800", marginTop: -1 }}>✓</Text> : null}
          </View>
        ) : null}
        <Avatar name={item.name} photo={item.photo} size={50} />
        <View style={{ flex: 1, borderBottomWidth: 0.5, borderBottomColor: theme.line, paddingVertical: 11, paddingRight: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text numberOfLines={1} style={{ fontWeight: "600", fontSize: 16, color: theme.ink, flex: 1, marginRight: 8 }}>{item.name}{item.escalated ? " 🏖️⚠️" : item.autopilot ? " 🤖" : ""}</Text>
            <Text style={{ color: theme.muted2, fontSize: 12 }}>{ago(item.ts)}</Text>
          </View>
          {item.escalated ? <Text numberOfLines={1} style={{ color: "#b5691a", fontSize: 12.5, fontWeight: "700", marginTop: 2 }}>🏖️ El piloto te lo pasó{item.escalatedReason ? " · " + item.escalatedReason : ""}</Text> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
            {chs.map((c) => (
              <View key={c} style={{ backgroundColor: CH_BADGE[c].bg, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5 }}><Text style={{ color: "#fff", fontSize: 9.5, fontWeight: "700" }}>{CH_BADGE[c].t}</Text></View>
            ))}
            <Text numberOfLines={1} style={{ color: item.unseen ? theme.ink : theme.muted, fontSize: 14, flex: 1 }}>{(item.lastDir === "out" ? "→ " : "") + (preview({ text: item.lastText }) || "…")}</Text>
            {item.unseen ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: theme.accent }} /> : null}
          </View>
        </View>
      </TouchableOpacity>
    )
    // en modo selección deshabilitamos el swipe (el gesto es tocar para marcar)
    if (selMode) return content
    return (
      <Swipeable
        ref={swipeRef}
        friction={2}
        leftThreshold={70}
        rightThreshold={70}
        renderLeftActions={() => <SwipeAction align="left" bg="#f59e0b" label={item.silenced ? "🔔 Reactivar" : "🔕 Silenciar"} />}
        renderRightActions={() => <SwipeAction align="right" bg={theme.muted} label="🗄 Archivar" />}
        onSwipeableOpen={(dir) => { swipeRef.current?.close(); if (dir === "right") doArchive(item); else doSilence(item) }}
      >
        {content}
      </Swipeable>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.card, paddingTop: insets.top }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: theme.ink }}>{t("inbox")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {!selMode ? (
            <TouchableOpacity onPress={onSecretBtn} hitSlop={10} style={{ backgroundColor: secUnlocked ? theme.accent : theme.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ fontSize: 13.5, color: secUnlocked ? "#fff" : theme.accent, fontWeight: "700" }}>{secUnlocked ? t("secret_hide") : t("secret_pin")}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => selMode ? exitSel() : setSelMode(true)} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", backgroundColor: selMode ? theme.accent : theme.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Text style={{ fontSize: 13.5, color: selMode ? "#fff" : theme.accent, fontWeight: "700" }}>{selMode ? t("cancel") : t("select")}</Text>
          </TouchableOpacity>
          {!selMode ? (
            <TouchableOpacity onPress={() => setCreating(true)} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: theme.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ fontSize: 16, color: theme.accent, fontWeight: "800", marginTop: -1 }}>+</Text>
              <Text style={{ fontSize: 13.5, color: theme.accent, fontWeight: "700" }}>Espacio</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
        <TextInput value={q} onChangeText={(v) => { setQ(v); if (!v.trim()) setAiRes(null) }} placeholder={t("search_placeholder")} placeholderTextColor={theme.muted2}
          autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={runAiSearch}
          style={{ backgroundColor: theme.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: theme.ink }} />
        {/* discoverabilidad: buscar dentro del CONTENIDO de los mensajes (⚡ facetas / 🧠 IA), no solo por nombre */}
        {q.trim() && !aiRes ? (
          <TouchableOpacity onPress={runAiSearch} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 0.5, borderColor: theme.line }}>
            <Text style={{ fontSize: 14 }}>🔎</Text>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, color: theme.ink }}>Buscar “{q.trim()}” en el contenido de los mensajes</Text>
            <Text style={{ fontSize: 12, color: theme.accent, fontWeight: "700" }}>Buscar</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {!q ? (
        <View style={{ height: 48, marginBottom: 4 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: "center" }}>
            {TABS.map((tb) => {
              const on = tab === tb.id
              return (
                <TouchableOpacity key={tb.id} onPress={() => setTab(tb.id)} activeOpacity={0.7} style={{ paddingHorizontal: 15, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? theme.accent : theme.bg }}>
                  <Text style={{ color: on ? "#fff" : theme.muted, fontWeight: on ? "700" : "600", fontSize: 13.5 }}>{tb.name}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      ) : null}
      <FlatList
        data={shown}
        keyExtractor={(t) => String(t.key)}
        renderItem={({ item }) => <Row item={item} />}
        initialNumToRender={12}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={selMode ? { paddingBottom: 88 } : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.accent} colors={[theme.accent]} />}
        ListHeaderComponent={aiRes ? <AiCard /> : null}
        ListEmptyComponent={<Text style={{ textAlign: "center", color: theme.muted, marginTop: 40 }}>{q ? t("nothing_matches") : t("no_convs")}</Text>}
      />

      {/* barra de acción de UNIR: aparece en modo selección, ancla abajo. "🔗 Unir (N)" activo con 2+ marcados */}
      {selMode ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: theme.card, borderTopWidth: 0.5, borderTopColor: theme.line, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: theme.muted }}>
            {selKeys.length < 2 ? t("merge_pick_2") : t("merge_keeps", { name: targetName })}
          </Text>
          <TouchableOpacity disabled={selKeys.length < 2 || merging} onPress={doMerge} activeOpacity={0.8}
            style={{ backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, opacity: (selKeys.length < 2 || merging) ? 0.5 : 1 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{merging ? t("merging") : "🔗 " + t("merge_selected", { n: selKeys.length })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* 🔒 GESTOR de cuentas ocultas: marcá qué número/correo esconder — toda su actividad se oculta sin el PIN */}
      <Sheet visible={secManage} onClose={() => setSecManage(false)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 4 }}>🔒 {t("secret_accounts")}</Text>
        <Text style={{ fontSize: 12.5, color: theme.muted, marginBottom: 12, lineHeight: 17 }}>{t("secret_accounts_sub")}</Text>
        <ScrollView style={{ maxHeight: 360 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, letterSpacing: 0.4, marginBottom: 6 }}>{t("secret_wa")}</Text>
          {secNums.length ? secNums.map((n) => {
            const on = isNumSecret(n)
            return (
              <TouchableOpacity key={n} onPress={() => toggleNum(n)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 }}>
                <Text style={{ fontSize: 18, color: on ? theme.accent : theme.muted2 }}>{on ? "☑" : "☐"}</Text>
                <Text style={{ flex: 1, fontSize: 15, color: theme.ink }}>WhatsApp +{n}</Text>
              </TouchableOpacity>
            )
          }) : <Text style={{ color: theme.muted2, marginBottom: 4 }}>{t("secret_none")}</Text>}
          <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, letterSpacing: 0.4, marginTop: 12, marginBottom: 6 }}>{t("secret_email")}</Text>
          {secEmails.length ? secEmails.map((e) => {
            const on = isAcctSecret("email", e.label)
            return (
              <TouchableOpacity key={e.label} onPress={() => toggleEmail(e.label)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 }}>
                <Text style={{ fontSize: 18, color: on ? theme.accent : theme.muted2 }}>{on ? "☑" : "☐"}</Text>
                <Text style={{ flex: 1, fontSize: 15, color: theme.ink }}>{e.name || e.user}</Text>
              </TouchableOpacity>
            )
          }) : <Text style={{ color: theme.muted2, marginBottom: 4 }}>{t("secret_none")}</Text>}
        </ScrollView>
        <TouchableOpacity onPress={() => { setSecManage(false); secretLock() }} style={{ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 14 }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{t("secret_hide_now")}</Text>
        </TouchableOpacity>
      </Sheet>

      {/* 🔒 prompt del 2º PIN (crear o ingresar). Nunca se persiste; el token queda solo en memoria de api.js */}
      <Sheet visible={!!pinPrompt} onClose={() => closePin(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 4 }}>{pinPrompt ? pinPrompt.title : ""}</Text>
        <Text style={{ fontSize: 12.5, color: theme.muted, marginBottom: 12 }}>{pinPrompt ? pinPrompt.sub : ""}</Text>
        <TextInput value={pinVal} onChangeText={setPinVal} secureTextEntry keyboardType="number-pad" maxLength={12} autoFocus autoCapitalize="none"
          placeholder="••••••" placeholderTextColor={theme.muted2} returnKeyType="done" onSubmitEditing={() => closePin(pinVal.trim() || null)}
          style={{ backgroundColor: theme.bg, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 13, fontSize: 20, letterSpacing: 5, textAlign: "center", color: theme.ink, marginBottom: 12 }} />
        <TouchableOpacity onPress={() => closePin(pinVal.trim() || null)} style={{ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{t("secret_continue")}</Text>
        </TouchableOpacity>
      </Sheet>

      {/* crear espacio: solo el nombre; las reglas se agregan adentro (⚙️) */}
      <Sheet visible={creating} onClose={() => setCreating(false)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 4 }}>➕ Nuevo espacio</Text>
        <Text style={{ fontSize: 12.5, color: theme.muted, marginBottom: 14 }}>Un espacio agrupa mensajes por reglas (un número, un dominio, un nombre…). Ponele nombre y después agregás las reglas.</Text>
        <TextInput value={newName} onChangeText={setNewName} placeholder="Ej: Trabajo, Familia, Banco…" placeholderTextColor={theme.muted2} autoFocus returnKeyType="done" onSubmitEditing={createEspacio} style={{ backgroundColor: theme.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: theme.ink, marginBottom: 14 }} />
        <TouchableOpacity onPress={createEspacio} disabled={!newName.trim()} style={{ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center", opacity: newName.trim() ? 1 : 0.5 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Crear y agregar reglas</Text></TouchableOpacity>
      </Sheet>
    </View>
  )
}
