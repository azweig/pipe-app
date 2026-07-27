import React, { useState, useEffect, useCallback, useRef } from "react"
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Platform, FlatList } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import DateTimePicker from "@react-native-community/datetimepicker"
import { createAudioPlayer, setAudioModeAsync } from "expo-audio"
import { theme } from "../theme"
import { useT } from "../i18n"
import { scheduleAt, listAlarms, cancelAlarm, ALARM_TONES, TONE_ASSETS } from "../notifications"
import { getThreads } from "../api"
import Sheet from "../components/Sheet"
import Avatar from "../components/Avatar"

const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"], MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
const REPEATS = [["once", "rep_once"], ["daily", "rep_daily"], ["weekdays", "rep_weekdays"], ["weekends", "rep_weekends"], ["weekly", "rep_weekly"]]
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`

export default function Alarms({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const t = useT()
  const P = route?.params || {}
  const [alarms, setAlarms] = useState([])
  const [creating, setCreating] = useState(!!P.startCreate)
  const [date, setDate] = useState(() => { if (P.date) return new Date(P.date); const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d })
  const [repeat, setRepeat] = useState("once")
  const [tone, setTone] = useState("beep")
  const [label, setLabel] = useState(P.label || "")
  const [contact, setContact] = useState(P.contact || null)
  const [datePicker, setDatePicker] = useState(false)
  const [contacts, setContacts] = useState([])
  const [pickC, setPickC] = useState(false)
  const [q, setQ] = useState("")
  const player = useRef(null)

  const reload = useCallback(async () => setAlarms(await listAlarms()), [])
  useEffect(() => { reload() }, [])
  useEffect(() => () => { try { player.current?.remove() } catch {} }, [])

  // etiqueta legible de cuándo suena (repetición + hora)
  const whenLabel = useCallback((a) => {
    const time = String(a.hour).padStart(2, "0") + ":" + String(a.minute).padStart(2, "0")
    if (a.repeat === "once") { const d = new Date(a.ts); return `${DAYS[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]} · ${time}` }
    if (a.repeat === "daily") return `${t("rep_daily")} · ${time}`
    if (a.repeat === "weekdays") return `${t("rep_weekdays")} · ${time}`
    if (a.repeat === "weekends") return `${t("rep_weekends")} · ${time}`
    if (a.repeat === "weekly") { const wd = (a.data?.weekday || 1) - 1; return `${t("rep_weekly")} · ${DAYS[wd]} · ${time}` }
    return time
  }, [t])

  async function preview(id) {
    if (!TONE_ASSETS[id]) return // sistema/silencio: no hay preview
    try {
      await setAudioModeAsync({ playsInSilentMode: true })
      try { player.current?.remove() } catch {}
      const p = createAudioPlayer(TONE_ASSETS[id]); player.current = p; p.play()
    } catch {}
  }

  async function save() {
    const r = await scheduleAt({ title: label.trim() || "⏰ Alarma", body: contact ? contact.name : "", date, tone, repeat, data: contact ? { convKey: contact.key, name: contact.name } : {} })
    if (r.ok) {
      setCreating(false); setLabel(""); setContact(null); setRepeat("once"); reload()
      Alert.alert("⏰ " + t("alarm_set"), "")
    } else Alert.alert(t("could_not"), r.error || "")
  }
  async function loadContacts() { if (!contacts.length) { const d = await getThreads().catch(() => []); setContacts((Array.isArray(d) ? d : (d.threads || [])).filter((x) => x.key && x.key !== "self" && !x.espacio)) } }
  const del = async (id) => { await cancelAlarm(id); reload() }

  const onDate = (event, selected) => {
    if (Platform.OS === "android") setDatePicker(false)
    if (event.type === "dismissed" || !selected) return
    const d = new Date(date); d.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate()); setDate(d)
  }
  const onTime = (event, selected) => {
    if (event.type === "dismissed" || !selected) return
    const d = new Date(date); d.setHours(selected.getHours(), selected.getMinutes(), 0, 0); setDate(d)
  }

  const inp = { backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: theme.ink }
  const chip = (on) => ({ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? theme.accent : theme.bg, marginRight: 8 })
  const chipTx = (on) => ({ color: on ? "#fff" : theme.muted, fontWeight: on ? "700" : "600", fontSize: 13 })
  const needsDate = repeat === "once" || repeat === "weekly"

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><Text style={{ color: theme.accent, fontSize: 24 }}>‹</Text></TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: "800", color: theme.ink, flex: 1, marginLeft: 6 }}>⏰ {t("alarms")}</Text>
        {!creating ? <TouchableOpacity onPress={() => setCreating(true)} style={{ backgroundColor: theme.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}><Text style={{ color: "#fff", fontWeight: "700" }}>+ {t("new_alarm")}</Text></TouchableOpacity> : null}
      </View>

      {creating ? (
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 14, padding: 14 }}>
            {/* RELOJ — hora exacta, siempre visible tipo despertador */}
            <Text style={{ fontSize: 12, color: theme.muted, textAlign: "center" }}>{t("datetime")}</Text>
            <View style={{ alignItems: "center", marginVertical: 2 }}>
              <DateTimePicker value={date} mode="time" is24Hour display={Platform.OS === "ios" ? "spinner" : "spinner"} onChange={onTime} style={{ width: 220, height: 150 }} />
            </View>

            {/* REPETIR */}
            <Text style={{ fontSize: 12, color: theme.muted, marginTop: 6, marginBottom: 6 }}>{t("alarm_repeat")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {REPEATS.map(([id, key]) => <TouchableOpacity key={id} onPress={() => setRepeat(id)} style={chip(repeat === id)}><Text style={chipTx(repeat === id)}>{t(key)}</Text></TouchableOpacity>)}
            </ScrollView>

            {/* FECHA (solo una vez / semanal) */}
            {needsDate ? (
              <TouchableOpacity onPress={() => setDatePicker(true)} style={{ ...inp, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Text style={{ color: theme.muted, fontSize: 13 }}>{repeat === "weekly" ? t("rep_weekly") : t("alarm_date")}</Text>
                <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 15, textTransform: "capitalize" }}>{`${DAYS[date.getDay()]} ${date.getDate()} ${MES[date.getMonth()]}`}</Text>
              </TouchableOpacity>
            ) : null}

            {/* TONO + preview */}
            <Text style={{ fontSize: 12, color: theme.muted, marginBottom: 6 }}>{t("alarm_tone")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {ALARM_TONES.map((tn) => {
                const on = tone === tn.id
                return (
                  <TouchableOpacity key={tn.id} onPress={() => { setTone(tn.id); preview(tn.id) }} style={{ ...chip(on), flexDirection: "row", alignItems: "center", gap: 5 }}>
                    {TONE_ASSETS[tn.id] ? <Text style={{ fontSize: 12, color: on ? "#fff" : theme.accent }}>▶</Text> : null}
                    <Text style={chipTx(on)}>{t(tn.nameKey)}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            <TextInput value={label} onChangeText={setLabel} placeholder={t("alarm_label")} placeholderTextColor={theme.muted2} style={{ ...inp, marginBottom: 10 }} />

            <TouchableOpacity onPress={() => { loadContacts(); setPickC(true) }} style={{ ...inp, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ color: contact ? theme.ink : theme.muted2, fontSize: 15 }}>{contact ? "👤 " + contact.name : t("link_contact")}</Text>
              {contact ? <TouchableOpacity onPress={() => setContact(null)}><Text style={{ color: theme.urgent }}>✕</Text></TouchableOpacity> : <Text style={{ color: theme.muted2 }}>›</Text>}
            </TouchableOpacity>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => { setCreating(false); setContact(null) }} style={{ flex: 1, padding: 13, borderRadius: 12, backgroundColor: theme.bg, alignItems: "center" }}><Text style={{ color: theme.muted, fontWeight: "600" }}>{t("cancel")}</Text></TouchableOpacity>
              <TouchableOpacity onPress={save} style={{ flex: 2, padding: 13, borderRadius: 12, backgroundColor: theme.accent, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>{t("set_alarm")}</Text></TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={alarms}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={item.data?.convKey ? 0.6 : 1} onPress={() => item.data?.convKey && navigation.navigate("Conversation", { convKey: item.data.convKey, name: item.data.name || "" })}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginBottom: 8, backgroundColor: theme.card, borderRadius: 12, padding: 14 }}>
              <Text style={{ fontSize: 22 }}>{item.repeat === "once" ? "⏰" : "🔁"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15.5, fontWeight: "600", color: theme.ink }}>{item.title}</Text>
                <Text style={{ fontSize: 13, color: theme.accent, marginTop: 2, textTransform: "capitalize" }}>{whenLabel(item)}</Text>
                <Text style={{ fontSize: 11.5, color: theme.muted2, marginTop: 1 }}>♪ {t((ALARM_TONES.find((x) => x.id === item.tone) || ALARM_TONES[0]).nameKey)}{item.data?.name ? "  ·  👤 " + item.data.name : ""}</Text>
              </View>
              <TouchableOpacity onPress={() => del(item.id)} hitSlop={8}><Text style={{ color: theme.urgent, fontSize: 18 }}>✕</Text></TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: theme.muted, marginTop: 40 }}>{t("no_alarms")}</Text>}
        />
      )}

      {datePicker ? <DateTimePicker value={date} mode="date" display="default" onChange={onDate} minimumDate={new Date()} /> : null}

      <Sheet visible={pickC} onClose={() => setPickC(false)}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: theme.ink, marginBottom: 8 }}>{t("link_contact")}</Text>
        <TextInput value={q} onChangeText={setQ} placeholder={t("search")} placeholderTextColor={theme.muted2} style={{ ...inp, marginBottom: 8 }} />
        <ScrollView style={{ maxHeight: 380 }}>
          {contacts.filter((c) => !q || (c.name || "").toLowerCase().includes(q.toLowerCase())).slice(0, 50).map((c) => (
            <TouchableOpacity key={c.key} onPress={() => { setContact({ key: c.key, name: c.name, photo: c.photo }); setPickC(false); setQ("") }} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 }}>
              <Avatar name={c.name} photo={c.photo} size={38} /><Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: theme.ink }}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Sheet>
    </View>
  )
}
