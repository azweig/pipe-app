import React, { useEffect, useState, useCallback } from "react"
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, StatusBar, Alert } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { useT } from "../i18n"
import { catMeta, pj } from "../cats"
import { getCoach, coachAction, replyDraft, getCalendar, getNotes } from "../api"
import { scheduleAt } from "../notifications"
import Avatar from "../components/Avatar"

const pad = (n) => String(n).padStart(2, "0")
const HHMM = /\b([01]?\d|2[0-3]):([0-5]\d)\b/
const toMin = (t) => { const m = HHMM.exec(t || ""); return m ? +m[1] * 60 + +m[2] : 9999 }
const minTo = (m) => pad(Math.floor(m / 60)) + ":" + pad(m % 60)

export default function Radar({ navigation }) {
  const insets = useSafeAreaInsets()
  const t = useT()
  const [d, setD] = useState(null)
  const [plan, setPlan] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [gone, setGone] = useState({})

  // arma el PLAN del día combinando calendario (hora real) + acciones de notas con hora + clusters flexibles en huecos
  const buildPlan = useCallback((coach, calEvents, notes) => {
    const rows = []
    for (const e of (calEvents || [])) if (e.t1 && HHMM.test(e.t1)) rows.push({ time: e.t1, min: toMin(e.t1), title: (e.icon ? e.icon + " " : "") + e.title, sub: e.location || "", color: e.color || theme.accent, kind: "event", id: e.id })
    for (const n of (notes || [])) for (const a of (pj(n.actions, []) || [])) {
      if (a.done || !HHMM.test(a.cuando || "")) continue
      rows.push({ time: HHMM.exec(a.cuando)[0], min: toMin(a.cuando), title: a.texto, sub: (n.category || "nota").toLowerCase(), color: catMeta(n.catkey).color, kind: "note" })
    }
    // clusters flexibles → se les asigna un hueco libre
    const used = new Set(rows.map((r) => r.min))
    const flex = []
    const nMsgs = (coach.waiting?.length || 0) + (coach.questions?.length || 0)
    if (nMsgs) flex.push({ title: `Responder ${nMsgs} mensaje${nMsgs > 1 ? "s" : ""} trabado${nMsgs > 1 ? "s" : ""}`, sub: (coach.waiting || []).slice(0, 4).map((w) => (w.name || "").split(" ")[0]).filter(Boolean).join(", "), color: theme.accent, kind: "msgs" })
    for (const p of (coach.promises || []).slice(0, 2)) flex.push({ title: p.promesa || p.text || "Promesa", sub: "prometido", color: "#f59e0b", kind: "prom", convKey: p.thread, name: p.name })
    // anclar en la próxima media hora futura, paso 90min, saltando horas ya ocupadas
    const now = new Date(); let anchor = Math.max(now.getHours() * 60 + (now.getMinutes() < 30 ? 30 : 60), 9 * 60)
    for (const f of flex) { while (used.has(anchor) && anchor < 21 * 60) anchor += 30; if (anchor >= 21 * 60) break; f.time = minTo(anchor); f.min = anchor; used.add(anchor); anchor += 90; rows.push(f) }
    return rows.sort((a, b) => a.min - b.min).slice(0, 6)
  }, [])

  const load = useCallback(async (spin) => {
    if (spin) setRefreshing(true)
    try {
      const [coach, cal, notes] = await Promise.all([getCoach(), getCalendar("dia").catch(() => ({})), getNotes("all").catch(() => ({}))])
      setD(coach || {})
      setPlan(buildPlan(coach || {}, (cal && cal.events) || [], (notes && notes.items) || []))
    } catch (e) { if (e && e.code === 401) navigation.replace("Login") } finally { setRefreshing(false) }
  }, [navigation, buildPlan])
  useEffect(() => { load(false); const unsub = navigation.addListener("focus", () => load(false)); return unsub }, [load, navigation])

  const act = (key, action) => { setGone((g) => ({ ...g, [key]: true })); coachAction(key, action).catch(() => {}) }
  const openConv = (key, name) => key && navigation.navigate("Conversation", { convKey: key, name: name || "" })
  const draftGo = async (key, name) => { if (!key) return; const r = await replyDraft(name || "", key).catch(() => null); navigation.navigate("Conversation", { convKey: key, name: name || "", draft: r && (r.draft || r.text) }) }
  const scheduleAll = async () => {
    let n = 0
    for (const r of plan) {
      if (r.kind === "event") continue
      const [h, m] = r.time.split(":").map(Number); const dt = new Date(); dt.setHours(h, m, 0, 0); if (dt.getTime() < Date.now()) dt.setDate(dt.getDate() + 1)
      const res = await scheduleAt({ title: r.title, date: dt, tone: "beep", repeat: "once" }); if (res.ok) n++
    }
    Alert.alert("⏰ " + t("scheduled_ok"), n + "")
  }

  if (!d) return <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center", paddingTop: insets.top }}><ActivityIndicator color={theme.accent} /></View>
  const waiting = d.waiting || [], questions = d.questions || []
  const nudges = (d.nudges || []).filter((n) => !gone[n.key])
  const proposals = (d.proposals || []).filter((p) => !gone[p.key])
  const worth = [...proposals, ...nudges.filter((n) => n.type === "reconectar")]
  const esperan = [...waiting.map((w) => ({ ...w, who: w.name, key: w.thread })), ...questions.map((q) => ({ ...q, who: q.who, key: q.thread }))]
  // HERO: lo más urgente = quien espera hace más días (o la mejor propuesta con hilo)
  const heroW = [...waiting].sort((a, b) => (b.ageDays || 0) - (a.ageDays || 0))[0]
  const hero = heroW ? { name: heroW.name || "Contacto", text: heroW.text || "", ageDays: heroW.ageDays, convKey: heroW.thread, kind: "wait" }
    : (proposals[0] && proposals[0].convKey ? { name: proposals[0].subject, text: proposals[0].insight, convKey: proposals[0].convKey, kind: "prop" } : null)
  const pending = waiting.length + questions.length + nudges.length + proposals.length
  const card = { backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }
  const chip = { backgroundColor: theme.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }
  const empty = !hero && !plan.length && !esperan.length && !worth.length

  const CoachCard = ({ n }) => (
    <View style={card}>
      <TouchableOpacity disabled={!n.convKey} onPress={() => openConv(n.convKey, n.subject)}>
        <Text style={{ fontWeight: "700", fontSize: 15, color: n.convKey ? theme.ink : theme.ink }}>{n.subject}</Text>
      </TouchableOpacity>
      {n.insight ? <Text style={{ fontSize: 13.5, color: theme.muted, marginTop: 5, lineHeight: 19 }}>{n.insight}</Text> : null}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" }}>
        <TouchableOpacity onPress={() => n.convKey ? draftGo(n.convKey, n.subject) : act(n.key, "done")} style={{ ...chip, backgroundColor: theme.ink }}><Text style={{ fontSize: 12.5, color: "#fff", fontWeight: "700" }}>{t("write_action")}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => act(n.key, "snooze")} style={chip}><Text style={{ fontSize: 12.5, color: theme.ink }}>{t("schedule_20")}</Text></TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => act(n.key, "dismiss")} hitSlop={8}><Text style={{ fontSize: 15, color: theme.muted2 }}>✕</Text></TouchableOpacity>
      </View>
    </View>
  )
  const SectionHead = ({ title, count, right, onRight }) => (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 22, marginBottom: 10 }}>
      <Text style={{ fontSize: 11.5, fontWeight: "800", color: theme.muted2, letterSpacing: 0.6 }}>{title}{count != null ? "  ·  " + count : ""}</Text>
      <View style={{ flex: 1 }} />
      {right ? <TouchableOpacity onPress={onRight}><Text style={{ fontSize: 12.5, color: theme.accent, fontWeight: "700" }}>{right}</Text></TouchableOpacity> : null}
    </View>
  )

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 34 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.accent} colors={[theme.accent]} />}>
      <StatusBar barStyle="dark-content" />
      <Text style={{ fontSize: 28, fontWeight: "800", color: theme.ink }}>Radar</Text>
      <Text style={{ fontSize: 13.5, color: theme.muted, marginTop: 3 }}>{pending} {t("pending_count")} · {worth.length + (hero ? 1 : 0)} {t("worth_today")}</Text>

      {/* HERO — empezá por acá */}
      {hero ? (
        <View style={{ backgroundColor: "#1c1c26", borderRadius: 18, padding: 18, marginTop: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: "#a9a9ff", letterSpacing: 0.5 }}>✦ {t("start_here")}</Text>
          <Text style={{ fontSize: 18, fontWeight: "800", color: "#fff", marginTop: 8, lineHeight: 24 }}>{hero.name}{hero.ageDays != null ? ` ${t("waiting_since")} ${hero.ageDays} días.` : ""}</Text>
          {hero.text ? <Text numberOfLines={2} style={{ fontSize: 13.5, color: "rgba(255,255,255,0.7)", marginTop: 6, lineHeight: 19 }}>{hero.kind === "wait" ? `"${hero.text}"` : hero.text}</Text> : null}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <TouchableOpacity onPress={() => draftGo(hero.convKey, hero.name)} style={{ flex: 1, backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 13, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>➤ {t("view_send")}</Text>
            </TouchableOpacity>
            {heroW ? <TouchableOpacity onPress={() => act("wait:" + hero.convKey, "snooze")} style={{ width: 50, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)", justifyContent: "center", alignItems: "center" }}><Text style={{ fontSize: 18 }}>⏰</Text></TouchableOpacity> : null}
          </View>
        </View>
      ) : null}

      {/* PLAN SUGERIDO */}
      {plan.length ? (
        <>
          <SectionHead title={t("suggested_plan")} right={t("schedule_all")} onRight={scheduleAll} />
          <View style={card}>
            {plan.map((r, i) => (
              <TouchableOpacity key={i} activeOpacity={0.6} disabled={!r.id && !r.convKey} onPress={() => r.id ? navigation.navigate("Meeting", { id: r.id }) : openConv(r.convKey, r.name)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, borderBottomWidth: i < plan.length - 1 ? 0.5 : 0, borderBottomColor: theme.line }}>
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: theme.muted2, width: 42 }}>{r.time}</Text>
                <View style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: r.color }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14.5, fontWeight: "600", color: theme.ink }} numberOfLines={1}>{r.title}</Text>
                  {r.sub ? <Text style={{ fontSize: 12, color: theme.muted2, marginTop: 1 }} numberOfLines={1}>{r.sub}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      {/* ESPERAN DE VOS */}
      {esperan.length ? (
        <>
          <SectionHead title={t("waiting_you")} count={esperan.length} />
          <View style={card}>
            {esperan.slice(0, 8).map((w, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 8, borderBottomWidth: i < Math.min(esperan.length, 8) - 1 ? 0.5 : 0, borderBottomColor: theme.line }}>
                <Avatar name={w.who} photo={w.photo} size={40} />
                <TouchableOpacity style={{ flex: 1 }} onPress={() => openConv(w.key, w.who)}>
                  <Text style={{ fontSize: 14.5, fontWeight: "600", color: theme.ink }} numberOfLines={1}>{w.who || "Contacto"}{w.ageDays != null ? <Text style={{ color: theme.muted2, fontWeight: "400", fontSize: 12 }}>  {w.ageDays}d</Text> : null}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 13, color: theme.muted, marginTop: 1 }}>«{w.text}»</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => draftGo(w.key, w.who)} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.bg, justifyContent: "center", alignItems: "center" }}><Text style={{ color: theme.accent, fontSize: 15 }}>➤</Text></TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* VALE LA PENA MIRAR */}
      {worth.length ? (
        <>
          <SectionHead title={t("worth_looking")} count={worth.length} />
          {worth.slice(0, 12).map((n) => <CoachCard key={n.key} n={n} />)}
        </>
      ) : null}

      {empty ? <Text style={{ textAlign: "center", color: theme.muted, marginTop: 50 }}>{t("nothing_radar")}</Text> : null}
    </ScrollView>
  )
}
