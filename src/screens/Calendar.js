import React, { useEffect, useState, useCallback } from "react"
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { useT } from "../i18n"
import { getCalendar } from "../api"

const VIEWS = [["dia", "Día"], ["laboral", "Laboral"], ["semana", "Semana"]]
const WD = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"], MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
const pad = (n) => String(n).padStart(2, "0")

export default function Calendar({ navigation }) {
  const insets = useSafeAreaInsets()
  const t = useT()
  const [view, setView] = useState("dia")
  const [offset, setOffset] = useState(0) // pasos desde hoy (1 día en dia/laboral, 7 en semana)
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const dateStr = useCallback(() => {
    if (offset === 0) return ""
    const step = view === "semana" ? 7 : 1
    const b = new Date(); b.setDate(b.getDate() + offset * step)
    return b.getFullYear() + "-" + pad(b.getMonth() + 1) + "-" + pad(b.getDate())
  }, [offset, view])

  const load = useCallback(async (spin) => {
    if (spin) setRefreshing(true); else setLoading(true)
    try { const r = await getCalendar(view, dateStr()); setD(r || {}) } catch (e) { if (e && e.code === 401) navigation.replace("Login") } finally { setLoading(false); setRefreshing(false) }
  }, [view, dateStr, navigation])
  useEffect(() => { load(false) }, [load])

  const isWeek = view !== "dia"
  const evs = (d && d.events) || []
  const byDay = {}
  for (const e of evs) (byDay[e.day] = byDay[e.day] || []).push(e)
  const days = (d && d.days && d.days.length) ? d.days : Object.keys(byDay).sort()
  const k = (d && d.kpis) || {}
  const parseD = (s) => new Date(s + "T12:00:00")
  const dayLabel = (s) => { const dt = parseD(s); return `${WD[dt.getDay()]} ${dt.getDate()} ${MES[dt.getMonth()]}` }
  const headTitle = () => {
    if (!d) return ""
    if (isWeek && days.length) { const a = parseD(days[0]), b = parseD(days[days.length - 1]); return `${a.getDate()}–${b.getDate()} ${MES[b.getMonth()]}` }
    const base = parseD(d.base || d.today); return `${d.base === d.today ? "Hoy · " : ""}${base.getDate()} ${MES[base.getMonth()]}`
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
        <Text style={{ fontSize: 27, fontWeight: "800", color: theme.ink, flex: 1 }}>{t("calendar")}</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Alarms")} hitSlop={8} style={{ paddingHorizontal: 6 }}><Text style={{ fontSize: 21 }}>⏰</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setOffset((o) => o - 1)} hitSlop={10} style={{ padding: 6 }}><Text style={{ fontSize: 22, color: theme.accent }}>‹</Text></TouchableOpacity>
        <Text style={{ fontSize: 14, fontWeight: "700", color: theme.ink, minWidth: 96, textAlign: "center" }}>{headTitle()}</Text>
        <TouchableOpacity onPress={() => setOffset((o) => o + 1)} hitSlop={10} style={{ padding: 6 }}><Text style={{ fontSize: 22, color: theme.accent }}>›</Text></TouchableOpacity>
        {offset !== 0 ? <TouchableOpacity onPress={() => setOffset(0)} style={{ marginLeft: 4 }}><Text style={{ color: theme.accent, fontSize: 12, fontWeight: "700" }}>hoy</Text></TouchableOpacity> : null}
      </View>

      <View style={{ height: 46 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: "center" }}>
          {VIEWS.map(([v, l]) => {
            const on = view === v
            return <TouchableOpacity key={v} onPress={() => { setView(v); setOffset(0) }} style={{ paddingHorizontal: 15, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? theme.accent : theme.bg }}>
              <Text style={{ color: on ? "#fff" : theme.muted, fontWeight: on ? "700" : "600", fontSize: 13.5 }}>{l}</Text>
            </TouchableOpacity>
          })}
        </ScrollView>
      </View>

      {loading && !d ? <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={theme.accent} /></View> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.accent} colors={[theme.accent]} />}>
          {(k.count != null) ? (
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 12, padding: 12, alignItems: "center" }}><Text style={{ fontSize: 22, fontWeight: "800", color: theme.ink }}>{k.count || 0}</Text><Text style={{ fontSize: 11, color: theme.muted }}>eventos</Text></View>
              <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 12, padding: 12, alignItems: "center" }}><Text style={{ fontSize: 22, fontWeight: "800", color: theme.ok }}>{k.freeH != null ? k.freeH + "h" : "—"}</Text><Text style={{ fontSize: 11, color: theme.muted }}>libre</Text></View>
              <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 12, padding: 12, alignItems: "center" }}><Text style={{ fontSize: 22, fontWeight: "800", color: theme.accent }}>{k.busyH != null ? k.busyH + "h" : "—"}</Text><Text style={{ fontSize: 11, color: theme.muted }}>ocupado</Text></View>
            </View>
          ) : null}

          {days.length === 0 || evs.length === 0 ? (
            <Text style={{ textAlign: "center", color: theme.muted, marginTop: 30 }}>{t("no_events")}</Text>
          ) : days.map((day) => (
            <View key={day} style={{ marginBottom: 14 }}>
              {isWeek ? <Text style={{ fontSize: 12.5, fontWeight: "800", color: theme.muted, marginBottom: 6, textTransform: "capitalize" }}>{dayLabel(day)}</Text> : null}
              {(byDay[day] || []).map((e) => (
                <TouchableOpacity key={e.id} activeOpacity={0.6} onPress={() => navigation.navigate("Meeting", { id: e.id })} style={{ backgroundColor: theme.card, borderRadius: 12, padding: 13, marginBottom: 8, flexDirection: "row", gap: 12, borderLeftWidth: 3, borderLeftColor: e.color || theme.accent }}>
                  <View style={{ alignItems: "center", minWidth: 46 }}><Text style={{ fontWeight: "800", color: theme.ink, fontSize: 14 }}>{e.t1}</Text><Text style={{ fontSize: 10.5, color: theme.muted2 }}>{e.t2}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "600", color: theme.ink, fontSize: 15 }}>{e.icon ? e.icon + " " : ""}{e.title}</Text>
                    {e.location ? <Text numberOfLines={1} style={{ fontSize: 12.5, color: theme.muted, marginTop: 2 }}>📍 {e.location}</Text> : null}
                    {e.nAtt ? <Text style={{ fontSize: 12, color: theme.muted2, marginTop: 2 }}>👥 {e.nAtt} {e.nAtt === 1 ? "persona" : "personas"}{e.prepReady ? " · ✨ preparado" : ""}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
              {isWeek && (byDay[day] || []).length === 0 ? <Text style={{ fontSize: 12.5, color: theme.muted2, marginLeft: 2 }}>libre</Text> : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}
