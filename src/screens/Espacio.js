import React, { useEffect, useState, useCallback } from "react"
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, TextInput, Alert, ScrollView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { getEspacio, getEspacios, saveEspacio, deleteEspacio, espacioAddRule, espacioRemoveRule } from "../api"
import { color, initials, ago, preview, espIcon } from "../util"
import Sheet from "../components/Sheet"

const CH_DOT = { whatsapp: "#25D366", email: "#EA4335", telegram: "#229ED9", instagram: "#E1306C", signal: "#3A76F0", meeting: "#8b5cf6", discord: "#5865F2", slack: "#4A154B", facebook: "#1877F2", linkedin: "#0A66C2", teams: "#5B5FC7" }
// reglas: por qué mensajes entran al espacio. phone=número WhatsApp, email=correo exacto, domain=dominio del correo, name=nombre del contacto
const RULE_TYPES = [
  { id: "phone", label: "📱 Número", ph: "51987654321" },
  { id: "email", label: "✉️ Email", ph: "juan@empresa.com" },
  { id: "domain", label: "🌐 Dominio", ph: "empresa.com" },
  { id: "name", label: "👤 Nombre", ph: "Juan Pérez" },
]
const ruleLabel = (r) => (RULE_TYPES.find((x) => x.id === r.type)?.label.split(" ")[0] || "•") + " " + r.value

export default function Espacio({ route, navigation }) {
  const { id, name } = route.params
  const insets = useSafeAreaInsets()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [esp, setEsp] = useState(null) // el espacio completo (con reglas) — de getEspacios()
  const [editOpen, setEditOpen] = useState(false)
  const [nm, setNm] = useState("")
  const [rType, setRType] = useState("phone")
  const [rVal, setRVal] = useState("")
  const [busy, setBusy] = useState(false)

  const loadEsp = useCallback(() => {
    getEspacios().then((list) => { const e = (Array.isArray(list) ? list : []).find((x) => x.id === id); if (e) { setEsp(e); setNm(e.name || "") } }).catch(() => {})
  }, [id])
  const load = useCallback(() => { getEspacio(id).then((r) => { setD(r || {}); setLoading(false) }).catch((e) => { if (e && e.code === 401) navigation.replace("Login"); setLoading(false) }) }, [id])
  useEffect(() => { load(); loadEsp() }, [id])

  async function addRule() {
    const v = rVal.trim(); if (!v) return
    setBusy(true)
    try { await espacioAddRule(id, rType, rType === "phone" ? v.replace(/[^\d]/g, "") : v); setRVal(""); loadEsp(); load() } catch (e) { Alert.alert("Error", e.message || "") }
    setBusy(false)
  }
  async function removeRule(idx) {
    setBusy(true)
    try { await espacioRemoveRule(id, idx); loadEsp(); load() } catch (e) { Alert.alert("Error", e.message || "") }
    setBusy(false)
  }
  async function rename() {
    const v = nm.trim(); if (!v || v === (esp && esp.name)) return
    try { await saveEspacio({ id, name: v }); loadEsp() } catch (e) { Alert.alert("Error", e.message || "") }
  }
  function confirmDelete() {
    Alert.alert("Eliminar espacio", "¿Seguro? No borra los mensajes, solo el espacio.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => { try { await deleteEspacio(id); navigation.goBack() } catch (e) { Alert.alert("Error", e.message || "") } } },
    ])
  }

  const recent = (d && d.recent) || []
  const rules = (esp && esp.rules) || []
  const members = (esp && esp.members) || []
  const allRules = [...rules, ...members.map((m) => ({ type: "name", value: (m && m.name) || m, _member: true }))]

  const renderItem = ({ item }) => (
    <TouchableOpacity activeOpacity={item.thread ? 0.55 : 1} disabled={!item.thread}
      onPress={() => item.thread && navigation.navigate("Conversation", { convKey: item.thread, name: item.name })}
      style={{ flexDirection: "row", alignItems: "center", paddingLeft: 16, gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color(item.name || ""), justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{initials(item.name)}</Text>
      </View>
      <View style={{ flex: 1, borderBottomWidth: 0.5, borderBottomColor: theme.line, paddingVertical: 10, paddingRight: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {item.channel && CH_DOT[item.channel] ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CH_DOT[item.channel] }} /> : null}
          <Text numberOfLines={1} style={{ fontWeight: "600", fontSize: 15, color: theme.ink, flex: 1 }}>{item.name || "—"}</Text>
          <Text style={{ color: theme.muted2, fontSize: 12 }}>{ago(item.ts)}</Text>
        </View>
        <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 13.5, marginTop: 2 }}>{(item.dir === "out" ? "→ " : "") + (preview({ text: item.text }) || "…")}</Text>
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.card }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: insets.top + 6, paddingBottom: 10, paddingHorizontal: 8, backgroundColor: theme.card, borderBottomWidth: 0.5, borderBottomColor: theme.line }}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={{ paddingHorizontal: 6 }}><Text style={{ color: theme.accent, fontSize: 26, marginTop: -2 }}>‹</Text></TouchableOpacity>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.line, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ fontSize: 18 }}>{espIcon((d && d.icon) || name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontWeight: "700", fontSize: 17, color: theme.ink }}>{(d && d.name) || (esp && esp.name) || name}</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>Espacio · {(d && d.count) || 0} mensajes · {allRules.length} {allRules.length === 1 ? "regla" : "reglas"}</Text>
        </View>
        <TouchableOpacity onPress={() => setEditOpen(true)} hitSlop={10} style={{ paddingHorizontal: 8 }}><Text style={{ fontSize: 20 }}>⚙️</Text></TouchableOpacity>
      </View>
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={theme.accent} /></View>
      ) : (
        <FlatList
          data={recent}
          keyExtractor={(m, i) => String(m.thread || i) + ":" + i}
          renderItem={renderItem}
          ListHeaderComponent={<Text style={{ color: theme.muted, fontSize: 13, fontWeight: "700", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>Mensajes recientes</Text>}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: theme.muted, marginTop: 40, paddingHorizontal: 30 }}>{allRules.length ? "Sin mensajes que matcheen las reglas todavía." : "Este espacio no tiene reglas. Tocá ⚙️ para agregar quién entra."}</Text>}
        />
      )}

      {/* SHEET editar: renombrar + reglas (agregar/quitar) + eliminar */}
      <Sheet visible={editOpen} onClose={() => setEditOpen(false)}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
          <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 12 }}>⚙️ Editar espacio</Text>

          <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, marginBottom: 6 }}>NOMBRE</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            <TextInput value={nm} onChangeText={setNm} onBlur={rename} placeholder="Nombre del espacio" placeholderTextColor={theme.muted2} style={{ flex: 1, backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.ink }} />
            <TouchableOpacity onPress={rename} style={{ backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>OK</Text></TouchableOpacity>
          </View>

          <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, marginBottom: 6 }}>REGLAS · quién entra a este espacio</Text>
          {allRules.length ? allRules.map((r, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 }}>
              <Text style={{ flex: 1, fontSize: 14, color: theme.ink }}>{ruleLabel(r)}{r._member ? "  (miembro)" : ""}</Text>
              {!r._member ? <TouchableOpacity onPress={() => removeRule(i)} disabled={busy} hitSlop={8}><Text style={{ color: theme.urgent, fontSize: 18 }}>✕</Text></TouchableOpacity> : null}
            </View>
          )) : <Text style={{ color: theme.muted, fontSize: 13, marginBottom: 8 }}>Todavía no hay reglas.</Text>}

          <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, marginTop: 12, marginBottom: 6 }}>AGREGAR REGLA</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {RULE_TYPES.map((rt) => (
              <TouchableOpacity key={rt.id} onPress={() => setRType(rt.id)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: rType === rt.id ? theme.accent : theme.bg }}>
                <Text style={{ color: rType === rt.id ? "#fff" : theme.muted, fontWeight: "700", fontSize: 12.5 }}>{rt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
            <TextInput value={rVal} onChangeText={setRVal} placeholder={RULE_TYPES.find((x) => x.id === rType)?.ph} placeholderTextColor={theme.muted2} autoCapitalize="none" keyboardType={rType === "phone" ? "phone-pad" : "default"} style={{ flex: 1, backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.ink }} />
            <TouchableOpacity onPress={addRule} disabled={busy || !rVal.trim()} style={{ backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 18, justifyContent: "center", opacity: busy || !rVal.trim() ? 0.5 : 1 }}><Text style={{ color: "#fff", fontWeight: "700" }}>+</Text></TouchableOpacity>
          </View>

          <TouchableOpacity onPress={confirmDelete} style={{ borderWidth: 1, borderColor: theme.urgent, borderRadius: 10, paddingVertical: 11, alignItems: "center", marginBottom: 8 }}><Text style={{ color: theme.urgent, fontWeight: "700" }}>Eliminar espacio</Text></TouchableOpacity>
        </ScrollView>
      </Sheet>
    </View>
  )
}
