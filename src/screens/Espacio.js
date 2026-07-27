import React, { useEffect, useState } from "react"
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { getEspacio } from "../api"
import { color, initials, ago, preview, espIcon } from "../util"

const CH_DOT = { whatsapp: "#25D366", email: "#EA4335", telegram: "#229ED9", instagram: "#E1306C", signal: "#3A76F0", meeting: "#8b5cf6" }

export default function Espacio({ route, navigation }) {
  const { id, name } = route.params
  const insets = useSafeAreaInsets()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getEspacio(id).then((r) => { setD(r || {}); setLoading(false) }).catch((e) => { if (e && e.code === 401) navigation.replace("Login"); setLoading(false) })
  }, [id])

  const recent = (d && d.recent) || []

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
          <Text numberOfLines={1} style={{ fontWeight: "700", fontSize: 17, color: theme.ink }}>{(d && d.name) || name}</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>Espacio · {(d && d.count) || 0} mensajes</Text>
        </View>
      </View>
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={theme.accent} /></View>
      ) : (
        <FlatList
          data={recent}
          keyExtractor={(m, i) => String(m.thread || i) + ":" + i}
          renderItem={renderItem}
          ListHeaderComponent={<Text style={{ color: theme.muted, fontSize: 13, fontWeight: "700", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>Mensajes recientes</Text>}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: theme.muted, marginTop: 40, paddingHorizontal: 30 }}>Sin mensajes que matcheen las reglas todavía.</Text>}
        />
      )}
    </View>
  )
}
