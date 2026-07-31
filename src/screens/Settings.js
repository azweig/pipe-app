import React, { useEffect, useState, useCallback } from "react"
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Switch, StatusBar } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { getHubConfig, getAccounts, addEmail, removeEmail, getLlmConfig, testLlm, saveLlm, getVoices, setVoice, getNotifPrefs, saveNotifPrefs, getAuthStatus, changePinReq, logout, getAutopilotPolicy, setAutopilotPolicy, getApifyAccounts, addApifyAccount, removeApifyAccount } from "../api"
import { useT, getLang, setLang } from "../i18n"
import Sheet from "../components/Sheet"
import LocalAICard from "../components/LocalAI"
import WhatsAppImportCard from "../components/WhatsAppImport"

const AI_PROV = [["openai", "OpenAI"], ["anthropic", "Anthropic (Claude)"], ["gemini", "Google Gemini"]]
const PLABEL = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini", ollama: "Ollama (local)", gestionado: "GPU box (gestionado)" }
const soundOn = () => true // el sonido vive en la web/app-shell; acá mostramos el toggle de notif-prefs
// GET devuelve {accounts,…}; POST puede devolver {accounts} o el array pelado — normalizamos siempre a {accounts:[…]}
const normApify = (r) => !r ? null : (Array.isArray(r) ? { accounts: r } : (Array.isArray(r.accounts) ? r : null))

function Card({ title, children }) {
  return <View style={{ marginTop: 18 }}>
    <Text style={{ fontSize: 12.5, fontWeight: "800", color: theme.muted, marginBottom: 8, marginLeft: 2, letterSpacing: 0.4 }}>{title}</Text>
    <View style={{ backgroundColor: theme.card, borderRadius: 14, overflow: "hidden" }}>{children}</View>
  </View>
}
const Row = ({ children, onPress, last }) => {
  const C = onPress ? TouchableOpacity : View
  return <C onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: theme.line }}>{children}</C>
}

export default function Settings({ navigation }) {
  const insets = useSafeAreaInsets()
  const t = useT()
  const [hub, setHub] = useState(null)
  const [accts, setAccts] = useState({ email: [] })
  const [llm, setLlm] = useState(null)
  const [voices, setVoices] = useState({ voices: [], current: "" })
  const [notif, setNotif] = useState({})
  const [authS, setAuthS] = useState({})
  const [apPol, setApPol] = useState({ presets: [], custom: [], presets_available: [] }) // 🤖 política global del piloto
  const [apCustom, setApCustom] = useState("")
  const [apify, setApify] = useState({ accounts: [] }) // 🔎 cuentas Apify (enriquecimiento social)
  const [apf, setApf] = useState({ name: "", token: "" })
  const [sheet, setSheet] = useState(null)
  const [busy, setBusy] = useState(false)
  // forms
  const [em, setEm] = useState({ name: "", user: "", pass: "" })
  const [key, setKey] = useState({ provider: "openai", name: "", token: "", test: "" })
  const [pin, setPin] = useState({ old: "", nu: "" })

  const load = useCallback(async () => {
    const [h, a, l, v, n, s, ap, af] = await Promise.all([
      getHubConfig().catch(() => ({})), getAccounts().catch(() => ({ email: [] })), getLlmConfig().catch(() => ({})),
      getVoices().catch(() => ({ voices: [] })), getNotifPrefs().catch(() => ({})), getAuthStatus().catch(() => ({})),
      getAutopilotPolicy().catch(() => ({ presets: [], custom: [], presets_available: [] })),
      getApifyAccounts().catch(() => ({ accounts: [] })),
    ])
    setHub(h); setAccts(a || { email: [] }); setLlm(l || {}); setVoices(v || { voices: [] }); setNotif(n || {}); setAuthS(s || {})
    setApify(normApify(af) || { accounts: [] })
    const apx = ap || { presets: [], custom: [], presets_available: [] }
    setApPol({ presets: apx.presets || [], custom: apx.custom || [], presets_available: apx.presets_available || [] })
    setApCustom((apx.custom || []).join(", "))
  }, [])
  useEffect(() => { load().catch((e) => { if (e && e.code === 401) navigation.replace("Login") }) }, [])

  async function doAddEmail() {
    if (!em.user || !em.pass) return Alert.alert("Faltan datos", "Poné el correo y la contraseña de aplicación.")
    setBusy(true); const r = await addEmail({ user: em.user.trim(), pass: em.pass.trim(), name: em.name.trim() }).catch(() => ({ error: "error" })); setBusy(false)
    if (r && r.ok) { setSheet(null); setEm({ name: "", user: "", pass: "" }); Alert.alert("✓", "Cuenta conectada."); load() }
    else Alert.alert("No se pudo", (r && r.error) || "revisá las credenciales")
  }
  async function doRemoveEmail(label) {
    Alert.alert("Quitar cuenta", "¿Seguro? No borra los correos ya traídos.", [{ text: "No" }, { text: "Quitar", style: "destructive", onPress: async () => { await removeEmail(label).catch(() => {}); load() } }])
  }
  async function testKey() {
    if (!key.token.trim()) return
    setKey((k) => ({ ...k, test: "…" }))
    const r = await testLlm({ provider: key.provider, token: key.token.trim() }).catch(() => null)
    setKey((k) => ({ ...k, test: r && r.ok ? "✓ anda (" + (r.model || "") + ")" : "✗ " + ((r && r.error) || "no responde") }))
  }
  async function saveKey() {
    if (!key.token.trim()) return Alert.alert("Falta la key")
    setBusy(true)
    const existing = (llm.keysList || []).map((k) => (k.provider === "ollama" || k.provider === "gestionado") ? { id: k.id, provider: k.provider, name: k.name } : { id: k.id, provider: k.provider, name: k.name, token: "" })
    const nk = { id: key.provider + "-" + Date.now().toString(36), provider: key.provider, name: key.name.trim() || PLABEL[key.provider], token: key.token.trim() }
    const r = await saveLlm({ keysList: [...existing, nk], routing: llm.routing || {}, stt: llm.stt, ollamaHost: llm.ollamaHost }).catch(() => null)
    setBusy(false)
    if (r && r.ok) { setSheet(null); setKey({ provider: "openai", name: "", token: "", test: "" }); Alert.alert("✅", "Key agregada."); load() }
    else Alert.alert("No se pudo guardar", (r && r.error) || "")
  }
  async function saveStt(mode) {
    const existing = (llm.keysList || []).map((k) => (k.provider === "ollama" || k.provider === "gestionado") ? { id: k.id, provider: k.provider, name: k.name } : { id: k.id, provider: k.provider, name: k.name, token: "" })
    setLlm((l) => ({ ...l, stt: mode }))
    await saveLlm({ keysList: existing, routing: llm.routing || {}, stt: mode, ollamaHost: llm.ollamaHost }).catch(() => {})
  }
  async function pickVoice(id) { setVoices((v) => ({ ...v, current: id })); await setVoice(id).catch(() => {}) }
  async function saveQuiet(patch) { const p = { ...notif, ...patch }; setNotif(p); await saveNotifPrefs({ quietStart: p.quietStart ?? null, quietEnd: p.quietEnd ?? null }).catch(() => {}) }
  function toggleApPreset(p) { setApPol((cur) => { const has = (cur.presets || []).includes(p); return { ...cur, presets: has ? cur.presets.filter((x) => x !== p) : [...(cur.presets || []), p] } }) }
  async function saveAutopilotPolicy() {
    const custom = apCustom.split(",").map((s) => s.trim()).filter(Boolean)
    setBusy(true); const r = await setAutopilotPolicy(apPol.presets || [], custom).catch(() => null); setBusy(false)
    if (r && !r.error) {
      setApPol((cur) => ({ presets: r.presets || cur.presets, custom: r.custom || custom, presets_available: r.presets_available || cur.presets_available }))
      setApCustom(((r.custom || custom) || []).join(", ")); Alert.alert("✓", t("ap_saved"))
    } else Alert.alert("No se pudo", (r && r.error) || "")
  }
  async function doAddApify() {
    if (!apf.name.trim() || !apf.token.trim()) return Alert.alert(t("could_not"), t("apify_need_fields"))
    setBusy(true); const r = await addApifyAccount(apf.name.trim(), apf.token.trim()).catch(() => ({ error: "error" })); setBusy(false)
    const nx = normApify(r)
    if (nx) { setApify(nx); setSheet(null); setApf({ name: "", token: "" }); Alert.alert("✓", t("apify_added")) }
    else Alert.alert(t("could_not"), (r && r.error) || "")
  }
  function doRemoveApify(id) {
    Alert.alert(t("remove"), "", [{ text: t("no") !== "no" ? t("no") : "No" }, { text: t("remove"), style: "destructive", onPress: async () => { const r = await removeApifyAccount(id).catch(() => null); const nx = normApify(r); if (nx) setApify(nx) } }])
  }
  async function doChangePin() {
    if (!pin.nu || (authS.pinSet && !pin.old)) return Alert.alert("Faltan datos")
    setBusy(true); const r = await changePinReq({ oldPin: pin.old, newPin: pin.nu }).catch(() => null); setBusy(false)
    if (r && r.ok) { setSheet(null); setPin({ old: "", nu: "" }); Alert.alert("✅", "PIN actualizado.") } else Alert.alert("No se pudo", (r && r.error) || "")
  }
  function doLogout() { Alert.alert("Salir", "¿Cerrar sesión en este dispositivo?", [{ text: "No" }, { text: "Salir", style: "destructive", onPress: async () => { await logout(); navigation.replace("Login") } }]) }

  if (!hub) return <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center", paddingTop: insets.top }}><ActivityIndicator color={theme.accent} /></View>
  const inp = { backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: theme.ink, marginBottom: 10 }
  const hourChips = (val, onSet) => <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
    <TouchableOpacity onPress={() => onSet(null)} style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: val == null ? theme.accent : theme.bg }}><Text style={{ color: val == null ? "#fff" : theme.muted, fontSize: 12.5 }}>—</Text></TouchableOpacity>
    {Array.from({ length: 24 }, (_, h) => <TouchableOpacity key={h} onPress={() => onSet(h)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: val === h ? theme.accent : theme.bg }}><Text style={{ color: val === h ? "#fff" : theme.muted, fontSize: 12.5 }}>{String(h).padStart(2, "0")}</Text></TouchableOpacity>)}
  </ScrollView>

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><Text style={{ color: theme.accent, fontSize: 24 }}>‹</Text></TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: "800", color: theme.ink }}>{t("settings")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: theme.card, borderRadius: 14, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.accent, justifyContent: "center", alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "800", fontSize: 20 }}>{(hub.ownerFirst || hub.ownerName || "P")[0]}</Text></View>
          <View><Text style={{ fontSize: 17, fontWeight: "800", color: theme.ink }}>{hub.ownerName || "Mi hub"}</Text><Text style={{ color: theme.muted }}>{hub.company || hub.domain || "pipe.one"}</Text></View>
        </View>

        <Card title={t("language")}>
          <Row onPress={() => setLang("es")}><Text style={{ flex: 1, fontSize: 15, color: theme.ink }}>🇪🇸 Español</Text>{getLang() === "es" ? <Text style={{ color: theme.accent, fontWeight: "800" }}>✓</Text> : null}</Row>
          <Row onPress={() => setLang("en")} last><Text style={{ flex: 1, fontSize: 15, color: theme.ink }}>🇬🇧 English</Text>{getLang() === "en" ? <Text style={{ color: theme.accent, fontWeight: "800" }}>✓</Text> : null}</Row>
        </Card>

        <Card title={"📧 " + t("email_accounts")}>
          {(accts.email || []).map((e, i) => (
            <Row key={e.label} last={i === (accts.email || []).length - 1 && false}>
              <Text style={{ fontSize: 18 }}>✉️</Text>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 14.5, color: theme.ink, fontWeight: "500" }}>{e.user}</Text><Text style={{ fontSize: 12, color: theme.muted2 }}>{e.count || 0} mensajes</Text></View>
              <TouchableOpacity onPress={() => doRemoveEmail(e.label)} hitSlop={8}><Text style={{ color: theme.urgent, fontSize: 16 }}>✕</Text></TouchableOpacity>
            </Row>
          ))}
          <Row onPress={() => setSheet("addEmail")} last><Text style={{ fontSize: 18 }}>➕</Text><Text style={{ fontSize: 15, color: theme.accent, fontWeight: "600" }}>{t("add_email")}</Text></Row>
        </Card>

        <Card title={"🤖 " + t("ai_engine")}>
          {(llm.keysList || []).map((k) => (
            <Row key={k.id}><Text style={{ fontSize: 18 }}>{k.provider === "ollama" || k.provider === "gestionado" ? "🖥️" : "🔑"}</Text><View style={{ flex: 1 }}><Text style={{ fontSize: 14.5, color: theme.ink, fontWeight: "500" }}>{k.name || k.provider}</Text><Text style={{ fontSize: 12, color: theme.muted2 }}>{PLABEL[k.provider] || k.provider}</Text></View>{k.hasToken ? <Text style={{ color: theme.ok, fontSize: 13 }}>✓</Text> : null}</Row>
          ))}
          <Row onPress={() => setSheet("addKey")} last><Text style={{ fontSize: 18 }}>➕</Text><Text style={{ fontSize: 15, color: theme.accent, fontWeight: "600" }}>{t("add_key")}</Text></Row>
        </Card>

        <Card title={"🔎 " + t("apify_title")}>
          <View style={{ paddingHorizontal: 14, paddingTop: 11, paddingBottom: 5 }}>
            <Text style={{ fontSize: 12.5, color: theme.muted, lineHeight: 17 }}>{t("apify_help")}</Text>
          </View>
          {(apify.accounts || []).length === 0 ? (
            <View style={{ paddingHorizontal: 14, paddingVertical: 8 }}><Text style={{ fontSize: 13, color: theme.muted2 }}>{t("apify_none")}</Text></View>
          ) : (apify.accounts || []).map((ac) => (
            <Row key={ac.id}>
              <Text style={{ fontSize: 18 }}>{ac.exhausted ? "⛔" : "🔎"}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 14.5, color: theme.ink, fontWeight: "500" }}>{ac.name}</Text>
                  {ac.exhausted ? <View style={{ backgroundColor: theme.urgent + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}><Text style={{ fontSize: 10, fontWeight: "800", color: theme.urgent }}>{t("apify_exhausted")}</Text></View> : null}
                </View>
                <Text style={{ fontSize: 12, color: theme.muted2 }}>{(ac.runs || 0) + " " + t("apify_runs") + " · $" + (ac.usd != null ? Number(ac.usd).toFixed(2) : "0.00")}{ac.hint ? " · ••••" + ac.hint : ""}</Text>
              </View>
              <TouchableOpacity onPress={() => doRemoveApify(ac.id)} hitSlop={8}><Text style={{ color: theme.urgent, fontSize: 16 }}>✕</Text></TouchableOpacity>
            </Row>
          ))}
          <Row onPress={() => setSheet("addApify")} last><Text style={{ fontSize: 18 }}>➕</Text><Text style={{ fontSize: 15, color: theme.accent, fontWeight: "600" }}>{t("apify_add")}</Text></Row>
        </Card>

        <LocalAICard t={t} />
        <WhatsAppImportCard t={t} />
        <Card title={"🎙️ " + t("transcription")}>
          <Row onPress={() => saveStt("local")}><Text style={{ flex: 1, fontSize: 15, color: theme.ink }}>{t("stt_local")}</Text>{llm.stt === "local" ? <Text style={{ color: theme.accent, fontWeight: "800" }}>✓</Text> : null}</Row>
          <Row onPress={() => saveStt("openai")} last><Text style={{ flex: 1, fontSize: 15, color: theme.ink }}>{t("stt_cloud")}</Text>{llm.stt === "openai" ? <Text style={{ color: theme.accent, fontWeight: "800" }}>✓</Text> : null}</Row>
        </Card>

        <Card title={"🔊 " + t("voice")}>
          {(voices.voices || []).map((v, i) => (
            <Row key={v.id} onPress={() => pickVoice(v.id)} last={i === (voices.voices || []).length - 1}>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 15, color: theme.ink, fontWeight: "500" }}>{v.label}</Text><Text style={{ fontSize: 12.5, color: theme.muted2 }}>{v.desc}</Text></View>
              {voices.current === v.id ? <Text style={{ color: theme.accent, fontWeight: "800" }}>✓</Text> : null}
            </Row>
          ))}
        </Card>

        <Card title={"🔔 " + t("notifications")}>
          <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ fontSize: 14, color: theme.ink, marginBottom: 6 }}>🌙 {t("quiet_hours")}</Text>
            <Text style={{ fontSize: 12, color: theme.muted, marginBottom: 4 }}>{t("from")}</Text>{hourChips(notif.quietStart, (h) => saveQuiet({ quietStart: h }))}
            <Text style={{ fontSize: 12, color: theme.muted, marginTop: 8, marginBottom: 4 }}>{t("to")}</Text>{hourChips(notif.quietEnd, (h) => saveQuiet({ quietEnd: h }))}
          </View>
        </Card>

        <Card title={"🤖 " + t("ap_escalate_title")}>
          <View style={{ paddingHorizontal: 14, paddingTop: 11, paddingBottom: 3 }}>
            <Text style={{ fontSize: 12.5, color: theme.muted, lineHeight: 17 }}>{t("ap_escalate_help")}</Text>
          </View>
          {(apPol.presets_available || []).map((p) => {
            const on = (apPol.presets || []).includes(p)
            return (
              <Row key={p} onPress={() => toggleApPreset(p)}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.accent : "transparent", justifyContent: "center", alignItems: "center" }}>{on ? <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>✓</Text> : null}</View>
                <Text style={{ flex: 1, fontSize: 15, color: theme.ink }}>{t("ap_preset_" + p)}</Text>
              </Row>
            )
          })}
          <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 13 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, marginBottom: 6, letterSpacing: 0.4 }}>{t("ap_custom_label")}</Text>
            <TextInput value={apCustom} onChangeText={setApCustom} placeholder={t("ap_custom_ph")} placeholderTextColor={theme.muted2} autoCapitalize="none" style={{ ...inp, marginBottom: 12 }} />
            <TouchableOpacity onPress={saveAutopilotPolicy} style={{ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("save")}</Text></TouchableOpacity>
          </View>
        </Card>

        <Card title={"🔒 " + t("security")}>
          <Row onPress={() => setSheet("pin")} last><Text style={{ fontSize: 18 }}>🔒</Text><Text style={{ flex: 1, fontSize: 15, color: theme.ink }}>{authS.pinSet ? t("change_pin") : t("create_pin")}</Text><Text style={{ color: theme.muted2 }}>›</Text></Row>
        </Card>

        <TouchableOpacity onPress={doLogout} style={{ marginTop: 24, padding: 14, alignItems: "center" }}><Text style={{ color: theme.urgent, fontWeight: "700" }}>{t("logout")}</Text></TouchableOpacity>
      </ScrollView>

      {busy ? <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.2)", justifyContent: "center", alignItems: "center" }}><ActivityIndicator color={theme.accent} size="large" /></View> : null}

      <Sheet visible={sheet === "addEmail"} onClose={() => setSheet(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 4 }}>Agregar correo</Text>
        <Text style={{ color: theme.muted, marginBottom: 12 }}>Gmail/Outlook: usá una CONTRASEÑA DE APLICACIÓN (16 letras), no la de tu cuenta.</Text>
        <TextInput value={em.name} onChangeText={(t) => setEm((e) => ({ ...e, name: t }))} placeholder="Nombre (opcional, ej: Trabajo)" placeholderTextColor={theme.muted2} style={inp} />
        <TextInput value={em.user} onChangeText={(t) => setEm((e) => ({ ...e, user: t }))} placeholder="tu@correo.com" placeholderTextColor={theme.muted2} autoCapitalize="none" keyboardType="email-address" style={inp} />
        <TextInput value={em.pass} onChangeText={(t) => setEm((e) => ({ ...e, pass: t }))} placeholder="Contraseña de aplicación" placeholderTextColor={theme.muted2} secureTextEntry autoCapitalize="none" style={inp} />
        <TouchableOpacity onPress={doAddEmail} style={{ backgroundColor: theme.accent, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 4 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Conectar</Text></TouchableOpacity>
      </Sheet>

      <Sheet visible={sheet === "addKey"} onClose={() => setSheet(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 12 }}>Agregar key de IA</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>{AI_PROV.map(([id, l]) => <TouchableOpacity key={id} onPress={() => setKey((k) => ({ ...k, provider: id }))} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: key.provider === id ? theme.accent : theme.bg, alignItems: "center" }}><Text style={{ color: key.provider === id ? "#fff" : theme.muted, fontSize: 12.5, fontWeight: "600" }}>{l}</Text></TouchableOpacity>)}</View>
        <TextInput value={key.name} onChangeText={(t) => setKey((k) => ({ ...k, name: t }))} placeholder="Nombre (opcional)" placeholderTextColor={theme.muted2} style={inp} />
        <TextInput value={key.token} onChangeText={(t) => setKey((k) => ({ ...k, token: t, test: "" }))} placeholder="Pegá tu API key" placeholderTextColor={theme.muted2} secureTextEntry autoCapitalize="none" style={inp} />
        {key.test ? <Text style={{ color: key.test.startsWith("✓") ? theme.ok : theme.urgent, marginBottom: 8, fontSize: 13 }}>{key.test}</Text> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity onPress={testKey} style={{ flex: 1, borderRadius: 12, padding: 13, alignItems: "center", backgroundColor: theme.bg }}><Text style={{ color: theme.ink, fontWeight: "600" }}>Probar</Text></TouchableOpacity>
          <TouchableOpacity onPress={saveKey} style={{ flex: 1, borderRadius: 12, padding: 13, alignItems: "center", backgroundColor: theme.accent }}><Text style={{ color: "#fff", fontWeight: "700" }}>Agregar</Text></TouchableOpacity>
        </View>
      </Sheet>

      <Sheet visible={sheet === "addApify"} onClose={() => setSheet(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 4 }}>{t("apify_add")}</Text>
        <Text style={{ color: theme.muted, marginBottom: 12, fontSize: 13, lineHeight: 18 }}>{t("apify_help")}</Text>
        <TextInput value={apf.name} onChangeText={(v) => setApf((a) => ({ ...a, name: v }))} placeholder={t("apify_name_ph")} placeholderTextColor={theme.muted2} style={inp} />
        <TextInput value={apf.token} onChangeText={(v) => setApf((a) => ({ ...a, token: v }))} placeholder={t("apify_token_ph")} placeholderTextColor={theme.muted2} secureTextEntry autoCapitalize="none" autoCorrect={false} style={inp} />
        <TouchableOpacity onPress={doAddApify} style={{ backgroundColor: theme.accent, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 4 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{t("add")}</Text></TouchableOpacity>
      </Sheet>

      <Sheet visible={sheet === "pin"} onClose={() => setSheet(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 12 }}>{authS.pinSet ? "Cambiar" : "Crear"} PIN</Text>
        {authS.pinSet ? <TextInput value={pin.old} onChangeText={(t) => setPin((p) => ({ ...p, old: t }))} placeholder="PIN actual" placeholderTextColor={theme.muted2} secureTextEntry keyboardType="number-pad" style={{ ...inp, textAlign: "center", fontSize: 18, letterSpacing: 4 }} /> : null}
        <TextInput value={pin.nu} onChangeText={(t) => setPin((p) => ({ ...p, nu: t }))} placeholder="PIN nuevo (6 a 12 dígitos)" placeholderTextColor={theme.muted2} secureTextEntry keyboardType="number-pad" style={{ ...inp, textAlign: "center", fontSize: 18, letterSpacing: 4 }} />
        <TouchableOpacity onPress={doChangePin} style={{ backgroundColor: theme.accent, borderRadius: 12, padding: 14, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>Guardar</Text></TouchableOpacity>
      </Sheet>
    </View>
  )
}
