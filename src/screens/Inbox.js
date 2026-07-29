import React, { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, RefreshControl, StatusBar, BackHandler } from "react-native"
import Swipeable from "react-native-gesture-handler/Swipeable"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { theme } from "../theme"
import { useT } from "../i18n"
import { getThreads, getGroups, setArchive, setSilence, saveEspacio } from "../api"
import { ago, preview, espIcon, bucketCat } from "../util"
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
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")

  // botón "atrás" del celular en la bandeja: si hay búsqueda o un filtro de tab activo, lo LIMPIA (no sale de la app). Solo sale si no hay nada que limpiar.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (q) { setQ(""); return true }
      if (tab !== "todo") { setTab("todo"); return true }
      return false
    })
    return () => sub.remove()
  }, [q, tab])

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
      AsyncStorage.setItem("threads", JSON.stringify(clean)).catch(() => {})
    } catch (e) { if (e && e.code === 401) navigation.replace("Login") } finally { setRefreshing(false) }
  }, [navigation])

  useEffect(() => {
    (async () => {
      try { const c = await AsyncStorage.getItem("threads"); if (c) setRows(JSON.parse(c).filter((t) => t.key && t.key !== "self")) } catch {}
      load(false)
    })()
    const unsub = navigation.addListener("focus", () => load(false))
    const t = setInterval(() => load(false), 15000)
    return () => { unsub(); clearInterval(t) }
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
    return rows.filter((t) => {
      if (bucketCat(t) === "spam") return false
      if (nq) return matchQ(t)
      if (tab === "_sil") return !!t.silenced
      if (t.silenced) return false
      return tab === "todo" ? true : bucketCat(t) === tab
    })
  }, [rows, q, tab])

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

  const Row = ({ item }) => {
    // ESPACIO (sin swipe)
    if (item.espacio) {
      return (
        <TouchableOpacity activeOpacity={0.55} onPress={() => navigation.navigate("Espacio", { id: item.espId, name: item.name })}
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
    // CONVERSACIÓN (con swipe): ←izq archiva, der→ silencia
    const chs = channelsOf(item)
    const swipeRef = React.createRef()
    const content = (
      <TouchableOpacity activeOpacity={0.55} onPress={() => navigation.navigate("Conversation", { convKey: item.key, name: item.name, photo: item.photo })}
        style={{ flexDirection: "row", alignItems: "center", paddingLeft: 16, gap: 12, backgroundColor: theme.card }}>
        <Avatar name={item.name} photo={item.photo} size={50} />
        <View style={{ flex: 1, borderBottomWidth: 0.5, borderBottomColor: theme.line, paddingVertical: 11, paddingRight: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text numberOfLines={1} style={{ fontWeight: "600", fontSize: 16, color: theme.ink, flex: 1, marginRight: 8 }}>{item.name}{item.autopilot ? " 🤖" : ""}</Text>
            <Text style={{ color: theme.muted2, fontSize: 12 }}>{ago(item.ts)}</Text>
          </View>
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
        <TouchableOpacity onPress={() => setCreating(true)} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: theme.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
          <Text style={{ fontSize: 16, color: theme.accent, fontWeight: "800", marginTop: -1 }}>+</Text>
          <Text style={{ fontSize: 13.5, color: theme.accent, fontWeight: "700" }}>Espacio</Text>
        </TouchableOpacity>
      </View>
      <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
        <TextInput value={q} onChangeText={setQ} placeholder={t("search_placeholder")} placeholderTextColor={theme.muted2}
          autoCapitalize="none" autoCorrect={false} returnKeyType="search"
          style={{ backgroundColor: theme.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: theme.ink }} />
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.accent} colors={[theme.accent]} />}
        ListEmptyComponent={<Text style={{ textAlign: "center", color: theme.muted, marginTop: 40 }}>{q ? t("nothing_matches") : t("no_convs")}</Text>}
      />

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
