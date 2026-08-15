import React, { useEffect, useState, useCallback } from "react"
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, StatusBar, Linking } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio"
import { theme } from "../theme"
import { useT } from "../i18n"
import { getHome, homeAudioSource, actionDone, askBrain, replyDraft, markSeen, getOnboarding, getBase } from "../api"
import Avatar from "../components/Avatar"

const GREET_KEY = { manana: "good_morning", "mañana": "good_morning", tarde: "good_afternoon", noche: "good_evening", madrugada: "good_evening" }
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`

// audio del resumen (TTS) — expo-audio con el header de auth
function BriefAudio({ sec }) {
  const player = useAudioPlayer(homeAudioSource())
  const st = useAudioPlayerStatus(player)
  const playing = st?.playing
  const toggle = () => { if (playing) player.pause(); else { if (st?.didJustFinish) player.seekTo(0); player.play() } }
  return (
    <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, alignSelf: "flex-start", backgroundColor: theme.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 }}>
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{playing ? "⏸" : "▶ " + (sec ? mmss(sec) : "")}</Text>
    </TouchableOpacity>
  )
}

function Section({ title, right, onRight, children }) {
  return (
    <View style={{ marginTop: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, marginLeft: 2 }}>
        <Text style={{ fontSize: 12.5, fontWeight: "800", color: theme.muted, letterSpacing: 0.4, flex: 1 }}>{title}</Text>
        {right ? <TouchableOpacity onPress={onRight}><Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12.5 }}>{right}</Text></TouchableOpacity> : null}
      </View>
      {children}
    </View>
  )
}

export default function Home({ navigation }) {
  const insets = useSafeAreaInsets()
  const t = useT()
  const [d, setD] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [hidden, setHidden] = useState({}) // ids/keys ocultados (marcados listo)
  const [ask, setAsk] = useState("")
  const [answer, setAnswer] = useState(null)
  const [asking, setAsking] = useState(false)

  // Checklist de primer arranque, igual que la web y el escritorio. Esta app no conecta cuentas (no tiene los flujos de
  // QR ni de contraseña de aplicación): muestra QUÉ falta y manda a la web del hub. El cálculo lo hace el server, así
  // que las tres apps dicen lo mismo.
  const [onb, setOnb] = useState(null)
  const cargarOnb = useCallback(() => { getOnboarding().then(setOnb).catch(() => setOnb(null)) }, [])
  useEffect(() => { cargarOnb(); const unsub = navigation.addListener("focus", cargarOnb); return unsub }, [cargarOnb, navigation])

  const load = useCallback(async (spin) => {
    if (spin) setRefreshing(true)
    try { const r = await getHome(); setD(r || {}) } catch (e) { if (e && e.code === 401) navigation.replace("Login") } finally { setRefreshing(false) }
  }, [navigation])
  useEffect(() => { load(false); const unsub = navigation.addListener("focus", () => load(false)); return unsub }, [load, navigation])

  const hide = (k) => setHidden((h) => ({ ...h, [k]: true }))
  const doAsk = async () => { const q = ask.trim(); if (!q) return; setAsking(true); setAnswer(null); const r = await askBrain(q).catch(() => null); setAsking(false); setAnswer((r && (r.answer || r.text)) || "No pude responder eso ahora."); setAsk("") }
  const openConv = (w) => navigation.navigate("Conversation", { convKey: w.key, name: w.name, photo: w.photo })
  const draftFor = async (w) => { const r = await replyDraft(w.name, w.key).catch(() => null); navigation.navigate("Conversation", { convKey: w.key, name: w.name, photo: w.photo, draft: r && (r.draft || r.text) }) }
  const waitDone = (w) => { hide("w:" + w.key); markSeen(w.key, Date.now()).catch(() => {}) }
  const actDone = (kind, a) => { hide("a:" + a.id); actionDone(kind, a.id).catch(() => {}) }

  if (!d) return <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center", paddingTop: insets.top }}><ActivityIndicator color={theme.accent} /></View>
  const b = d.brief || {}, kpis = d.kpis || [], agenda = d.agenda || [], news = d.news || [], coach = d.coach
  const waiting = (d.waiting || []).filter((w) => !hidden["w:" + w.key])
  const calls = d.calls || [], objetivos = d.objetivos || []
  const todos = (d.todos || []).filter((t) => !hidden["a:" + t.id])
  const promesas = (d.promesas || []).filter((p) => !hidden["a:" + p.id])
  const card = { backgroundColor: theme.card, borderRadius: 12, padding: 13 }
  const chip = { backgroundColor: theme.bg, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 }

  const ActRow = ({ kind, a }) => (
    <View style={{ ...card, marginBottom: 8, flexDirection: "row", gap: 11, alignItems: "flex-start" }}>
      <TouchableOpacity onPress={() => actDone(kind, a)} style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.muted2, marginTop: 1 }} />
      <View style={{ flex: 1 }}><Text style={{ color: theme.ink, fontSize: 14.5, lineHeight: 20 }}>{a.text}</Text>{(a.name || a.due) ? <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>{a.name || ""}{a.due ? " · " + a.due : ""}</Text> : null}</View>
      {a.thread ? <TouchableOpacity onPress={() => navigation.navigate("Conversation", { convKey: a.thread, name: a.name || "" })}><Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12.5 }}>ver</Text></TouchableOpacity> : null}
    </View>
  )

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 30 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.accent} colors={[theme.accent]} />}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize: 27, fontWeight: "800", color: theme.ink, flex: 1 }}>{GREET_KEY[d.period] ? t(GREET_KEY[d.period]) : "👋"}</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Settings")} hitSlop={10} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: theme.card, justifyContent: "center", alignItems: "center" }}><Text style={{ fontSize: 20 }}>⚙️</Text></TouchableOpacity>
      </View>
      {onb && !onb.listo ? (
        <View style={{ backgroundColor: theme.card, borderRadius: 14, padding: 12, marginTop: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontWeight: "800", color: theme.ink, fontSize: 14 }}>{t("onb_title")}</Text>
            <Text style={{ color: theme.muted, fontSize: 13 }}>{onb.done}/{onb.total}</Text>
          </View>
          {onb.steps.map((st) => (
            <View key={st.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 14 }}>{st.ok ? "✓" : st.icon}</Text>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, color: st.ok ? theme.muted : theme.ink }}>{t("onb_" + st.id) || st.title}</Text>
            </View>
          ))}
          <TouchableOpacity onPress={() => Linking.openURL(getBase())} style={{ backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 9, alignItems: "center", marginTop: 8 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13.5 }}>{t("onb_cta")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Jarvis */}
      <View style={{ marginTop: 14, flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput value={ask} onChangeText={setAsk} onSubmitEditing={doAsk} returnKeyType="search" placeholder={t("jarvis_ph")} placeholderTextColor={theme.muted2}
          style={{ flex: 1, backgroundColor: theme.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: theme.ink }} />
        <TouchableOpacity onPress={doAsk} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: theme.accent, justifyContent: "center", alignItems: "center" }}><Text style={{ color: "#fff", fontSize: 18 }}>⌕</Text></TouchableOpacity>
      </View>
      {asking ? <View style={{ ...card, marginTop: 8, flexDirection: "row", gap: 8, alignItems: "center" }}><ActivityIndicator color={theme.accent} size="small" /><Text style={{ color: theme.muted }}>Pensando…</Text></View> : null}
      {answer ? <View style={{ ...card, marginTop: 8 }}><Text style={{ color: theme.ink, fontSize: 14.5, lineHeight: 21 }}>{answer}</Text></View> : null}

      {b.text ? (
        <View style={{ marginTop: 14, ...card, padding: 16, borderLeftWidth: 3, borderLeftColor: theme.accent }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: theme.accent, marginBottom: 6, letterSpacing: 0.5 }}>✦ {t("day_brief")}</Text>
          <Text style={{ fontSize: 14.5, color: theme.ink, lineHeight: 21 }}>{b.text}</Text>
          {b.audioSec ? <BriefAudio sec={b.audioSec} /> : null}
        </View>
      ) : null}

      {waiting.length ? (
        <Section title={`↩️ ${t("need_reply")} · ${waiting.length}`}>
          {waiting.map((w, i) => (
            <View key={i} style={{ ...card, marginBottom: 8 }}>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <Avatar name={w.name} photo={w.photo} size={42} />
                <View style={{ flex: 1 }}><Text style={{ fontWeight: "600", color: theme.ink, fontSize: 15 }}>{w.name}{w.reason ? <Text style={{ color: theme.muted2, fontWeight: "400", fontSize: 12.5 }}>  · {w.reason}</Text> : null}</Text>{w.preview ? <Text numberOfLines={1} style={{ fontSize: 13, color: theme.muted, marginTop: 2 }}>{w.preview}</Text> : null}</View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <TouchableOpacity onPress={() => openConv(w)} style={chip}><Text style={{ fontSize: 12.5, color: theme.ink, fontWeight: "600" }}>✍️ Responder</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => draftFor(w)} style={chip}><Text style={{ fontSize: 12.5, color: theme.accent, fontWeight: "600" }}>✨ Borrador IA</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => waitDone(w)} style={{ ...chip, marginLeft: "auto" }}><Text style={{ fontSize: 12.5, color: theme.ok, fontWeight: "700" }}>✓ Listo</Text></TouchableOpacity>
              </View>
            </View>
          ))}
        </Section>
      ) : null}

      {calls.length ? (
        <Section title={`📞 ${t("calls")} · ${calls.length}`}>
          {calls.map((c, i) => (
            <TouchableOpacity key={i} onPress={() => navigation.navigate("Conversation", { convKey: c.key, name: c.name })} style={{ ...card, marginBottom: 8, flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Avatar name={c.name} size={40} />
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "600", color: theme.ink, fontSize: 15 }}>{c.name}</Text><Text style={{ fontSize: 12.5, color: theme.muted, marginTop: 2 }}>{c.missed ? t("missed_call") : t("called_you")}{c.n > 1 ? ` · ${c.n}×` : ""}</Text></View>
              <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12.5 }}>{t("devolver")}</Text>
            </TouchableOpacity>
          ))}
        </Section>
      ) : null}

      {todos.length ? <Section title={`✅ ${t("todo")} · ${todos.length}`}>{todos.map((t) => <ActRow key={t.id} kind="todo" a={t} />)}</Section> : null}
      {promesas.length ? <Section title={`🤝 ${t("promised")} · ${promesas.length}`}>{promesas.map((p) => <ActRow key={p.id} kind="prom" a={p} />)}</Section> : null}

      {agenda.length ? (
        <Section title={`📅 ${t("today_agenda")}`} right={t("week")} onRight={() => navigation.navigate("Calendario")}>
          {agenda.map((e, i) => (
            <View key={i} style={{ ...card, marginBottom: 8, flexDirection: "row", gap: 13 }}>
              <View style={{ alignItems: "center", minWidth: 48 }}><Text style={{ fontWeight: "800", color: theme.accent, fontSize: 15 }}>{e.time}</Text><Text style={{ fontSize: 10, color: theme.muted2 }}>{e.dur}</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "600", color: theme.ink, fontSize: 15 }}>{e.title}</Text>{e.sub ? <Text style={{ fontSize: 12.5, color: theme.muted, marginTop: 2 }}>{e.sub}</Text> : null}</View>
            </View>
          ))}
        </Section>
      ) : null}

      {objetivos.length ? (
        <Section title={`🎯 ${t("your_goals")}`}>
          {objetivos.map((o, i) => { const pc = (o.progress != null && o.target) ? Math.min(100, Math.round(o.progress / o.target * 100)) : null
            return <View key={i} style={{ ...card, marginBottom: 8, flexDirection: "row", gap: 8, alignItems: "center" }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "600", color: theme.ink, fontSize: 14.5 }}>{o.title}</Text>{o.next ? <Text style={{ fontSize: 12.5, color: theme.muted, marginTop: 2 }}>→ {o.next}</Text> : null}</View>
              {pc != null ? <Text style={{ fontWeight: "800", color: theme.accent }}>{pc}%</Text> : null}
            </View> })}
        </Section>
      ) : null}

      {kpis.length ? (
        <Section title={`📊 ${t("your_kpis")}`}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
            {kpis.map((k, i) => (
              <View key={i} style={{ ...card, minWidth: 132 }}>
                <Text style={{ fontSize: 10.5, color: theme.muted2, fontWeight: "800" }}>{k.cat}</Text>
                <Text style={{ fontSize: 12.5, color: theme.muted, marginTop: 2 }}>{k.label}</Text>
                <Text style={{ fontSize: 23, fontWeight: "800", color: theme.ink, marginTop: 4 }}>{k.value}</Text>
                {k.delta != null ? <Text style={{ fontSize: 11.5, color: k.goodUp ? theme.ok : theme.urgent, fontWeight: "700", marginTop: 2 }}>{k.delta > 0 ? "↑" : "↓"} {Math.abs(k.delta)}%</Text> : null}
              </View>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      {news.length ? (
        <Section title={`📰 ${t("for_you")}`}>
          {news.map((n, i) => (
            <TouchableOpacity key={i} onPress={() => n.url && Linking.openURL(n.url)} style={{ ...card, marginBottom: 8 }}>
              <Text style={{ fontSize: 10.5, fontWeight: "800", color: theme.accent }}>{n.tag}</Text>
              <Text style={{ fontSize: 14.5, color: theme.ink, marginTop: 3, lineHeight: 20 }}>{n.title}</Text>
              {n.source ? <Text style={{ fontSize: 12, color: theme.muted2, marginTop: 3 }}>{n.source}{n.ago ? " · " + n.ago : ""}</Text> : null}
            </TouchableOpacity>
          ))}
        </Section>
      ) : null}

      {coach && coach.text ? (
        <View style={{ marginTop: 20, backgroundColor: "#1e1e2a", borderRadius: 14, padding: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: "#a9a9ff", marginBottom: 6 }}>◎ {t("coach")}</Text>
          <Text style={{ fontSize: 14.5, color: "#fff", lineHeight: 21 }}>{coach.text}</Text>
          <TouchableOpacity onPress={() => coach.convKey && navigation.navigate("Conversation", { convKey: coach.convKey, name: "" })} style={{ marginTop: 12, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.14)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{t("suggestion")} ›</Text></TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  )
}
