import React, { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Switch, StatusBar, Image } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { getHubConfig, getAccounts, addEmail, removeEmail, getLlmConfig, testLlm, saveLlm, getVoices, setVoice, getNotifPrefs, saveNotifPrefs, getAuthStatus, changePinReq, logout, getAutopilotPolicy, setAutopilotPolicy, getApifyAccounts, addApifyAccount, removeApifyAccount, getCouncil, setCouncil as apiSetCouncil, getTrainCard, autopilotFeedbackMsg, getVoiceProfile, buildVoiceProfile, getChannelsCatalog, getStatus, getWaStatus, getMatrixLogins, matrixLink, matrixStatus, matrixLinkToken, matrixQrSource, telegramStatus, telegramStart, telegramCode, telegramPassword, telegramConnected, getIntegrations, setSlack, removeSlack, setSignal, removeSignal, secretOn, onSecretChange, getSecretState, secretSetWa } from "../api"
import { useT, getLang, setLang } from "../i18n"
import Sheet from "../components/Sheet"
import LocalAICard from "../components/LocalAI"
import WhatsAppImportCard from "../components/WhatsAppImport"

const AI_PROV = [["openai", "OpenAI"], ["anthropic", "Anthropic (Claude)"], ["gemini", "Google Gemini"]]
const PLABEL = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini", ollama: "Ollama (local)", gestionado: "GPU box (gestionado)" }
const soundOn = () => true // el sonido vive en la web/app-shell; acá mostramos el toggle de notif-prefs
// ── Catálogo de canales ──
// FALLBACK: los MISMOS canales que estaban hardcodeados, ya en el shape del server (/api/channels/catalog) → si el fetch falla, la UI se porta idéntica.
const FALLBACK_CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", brand: "#25D366", kind: "messaging", connect: { method: "matrix-bridge", net: "whatsapp", multi: true }, canSend: true },
  { id: "instagram", label: "Instagram", brand: "#E1306C", kind: "messaging", connect: { method: "matrix-bridge", net: "instagram", multi: true }, canSend: true },
  { id: "facebook", label: "Facebook", brand: "#1877F2", kind: "messaging", connect: { method: "matrix-bridge", net: "facebook", multi: true }, canSend: true },
  { id: "linkedin", label: "LinkedIn", brand: "#0A66C2", kind: "messaging", connect: { method: "matrix-bridge", net: "linkedin", multi: true }, canSend: true },
  { id: "telegram", label: "Telegram", brand: "#229ED9", kind: "messaging", connect: { method: "telegram-login" }, canSend: false },
  { id: "discord", label: "Discord", brand: "#5865F2", kind: "messaging", connect: { method: "matrix-token", net: "discord", multi: true }, canSend: true },
  { id: "slack", label: "Slack", brand: "#4A154B", kind: "messaging", connect: { method: "integration", provider: "slack" }, canSend: true },
  { id: "signal", label: "Signal", brand: "#3A76F0", kind: "messaging", connect: { method: "integration", provider: "signal" }, canSend: true },
]
// íconos/emoji por-id (si el id no está acá → círculo con la inicial y color de marca del catálogo)
const CH_ICON = { whatsapp: "📲", instagram: "📷", facebook: "🔵", linkedin: "🔗", telegram: "✈️", discord: "🎮", slack: "💼", signal: "🔒" }
// instrucciones i18n opcionales al agregar cuenta (bridges que las tenían)
const CH_INSTR = { instagram: "ch_ig_instr", facebook: "ch_fb_instr", linkedin: "ch_li_instr" }
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
// estilos compartidos por las hojas de canales
const INP = { backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: theme.ink, marginBottom: 10 }
const SHEET_TITLE = { fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 6 }
const PRIMARY = { backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center" }

// ════════════ MENSAJERÍA / CANALES ════════════
// Hoja de vinculación por el bridge Matrix (WhatsApp/Instagram/Facebook/LinkedIn): teléfono→código o QR, con poll cada ~3s.
function BridgeLinkSheet({ visible, onClose, net, label, instr, toast }) {
  const t = useT()
  const [phone, setPhone] = useState("")
  const [msg, setMsg] = useState(null) // {text, err}
  const [code, setCode] = useState("")
  const [qrTick, setQrTick] = useState(0)
  const [hasQr, setHasQr] = useState(false)
  const [started, setStarted] = useState(false)
  const [connected, setConnected] = useState(false)
  const closeRef = useRef(onClose); closeRef.current = onClose
  // reset al abrir/cerrar → nada queda del intento anterior
  useEffect(() => { if (!visible) { setPhone(""); setMsg(null); setCode(""); setHasQr(false); setStarted(false); setConnected(false); setQrTick(0) } }, [visible])
  async function start(byPhone) {
    const v = byPhone ? phone.trim() : ""
    if (byPhone && !v) return setMsg({ text: t("ch_need_phone"), err: true })
    setMsg({ text: t("ch_generating"), err: false }); setCode(""); setHasQr(false)
    await matrixLink(net, v).catch(() => {})
    setStarted(true)
  }
  useEffect(() => {
    if (!started || !visible) return
    let alive = true, tm
    const tick = async () => {
      const r = await matrixStatus(net).catch(() => null)
      if (!alive) return
      if (r && r.connected) { setConnected(true); toast && toast("✓ " + label); setTimeout(() => closeRef.current(), 1400); return }
      setCode((r && r.code) || "")
      if (r && r.qr) { setHasQr(true); setQrTick(Date.now()) }
      if (alive) tm = setTimeout(tick, 3000)
    }
    tm = setTimeout(tick, 700)
    return () => { alive = false; clearTimeout(tm) }
  }, [started, visible])
  // fuente del QR recomputada por cada poll (matrixQrSource añade t=Date.now() → evita cache del Image)
  const qrSrc = useMemo(() => (hasQr && net ? matrixQrSource(net) : null), [qrTick, hasQr, net])
  return <Sheet visible={visible} onClose={onClose}>
    <Text style={SHEET_TITLE}>{label}</Text>
    <Text style={{ color: theme.muted, marginBottom: 12, fontSize: 13, lineHeight: 18 }}>{instr || t("ch_wa_instr")}</Text>
    <TextInput value={phone} onChangeText={setPhone} placeholder={t("ch_phone_ph")} placeholderTextColor={theme.muted2} keyboardType="phone-pad" autoCapitalize="none" style={INP} />
    <View style={{ flexDirection: "row", gap: 10 }}>
      <TouchableOpacity onPress={() => start(true)} style={{ ...PRIMARY, flex: 1 }}><Text style={{ color: "#fff", fontWeight: "700" }}>{t("ch_code_by_phone")}</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => start(false)} style={{ flex: 1, backgroundColor: theme.bg, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}><Text style={{ color: theme.ink, fontWeight: "700" }}>{t("ch_qr")}</Text></TouchableOpacity>
    </View>
    <View style={{ marginTop: 16, alignItems: "center", minHeight: 44 }}>
      {connected ? <Text style={{ color: theme.ok, fontWeight: "800", fontSize: 16 }}>✓ {label}</Text> : (<>
        {code ? <><Text style={{ fontSize: 12, color: theme.muted, textAlign: "center" }}>{t("ch_link_with_number")}</Text><Text style={{ fontSize: 30, fontWeight: "800", letterSpacing: 5, color: theme.accent, marginVertical: 10 }}>{code}</Text></> : null}
        {qrSrc ? <Image source={qrSrc} resizeMode="contain" style={{ width: 220, height: 220, backgroundColor: "#fff", borderRadius: 12 }} /> : null}
        {!code && !qrSrc ? (started ? <ActivityIndicator color={theme.accent} /> : null) : null}
        {!code && !qrSrc && msg ? <Text style={{ marginTop: 8, fontSize: 13, textAlign: "center", color: msg.err ? theme.urgent : theme.muted }}>{msg.text}</Text> : null}
      </>)}
    </View>
  </Sheet>
}
// Vinculación por TOKEN (matrix-token; ej. Discord, cuyo QR suele fallar) → matrixLinkToken(net) + poll matrixStatus(net). net/label vienen del catálogo.
function DiscordLinkSheet({ visible, onClose, net, label, toast }) {
  const t = useT()
  const nm = net || "discord"; const title = label || "Discord"
  const [tok, setTok] = useState(""); const [msg, setMsg] = useState(null); const [showHint, setShowHint] = useState(false)
  const [started, setStarted] = useState(false); const [connected, setConnected] = useState(false)
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => { if (!visible) { setTok(""); setMsg(null); setShowHint(false); setStarted(false); setConnected(false) } }, [visible])
  async function submit() {
    const v = tok.trim()
    if (!v) return setMsg({ text: t("ch_paste_token_first"), err: true })
    setMsg({ text: t("ch_linking"), err: false })
    await matrixLinkToken(nm, v).catch(() => {})
    setStarted(true)
  }
  useEffect(() => {
    if (!started || !visible) return
    let alive = true, tm
    const tick = async () => {
      const r = await matrixStatus(nm).catch(() => null)
      if (!alive) return
      if (r && r.connected) { setConnected(true); toast && toast("✓ " + title); setTimeout(() => closeRef.current(), 1400); return }
      if (alive) tm = setTimeout(tick, 3000)
    }
    tm = setTimeout(tick, 700)
    return () => { alive = false; clearTimeout(tm) }
  }, [started, visible, nm])
  return <Sheet visible={visible} onClose={onClose}>
    <Text style={SHEET_TITLE}>{title}</Text>
    <Text style={{ color: theme.muted, marginBottom: 10, fontSize: 13, lineHeight: 18 }}>{t("ch_discord_sub")}</Text>
    <TouchableOpacity onPress={() => setShowHint((v) => !v)} hitSlop={6}><Text style={{ color: theme.accent, fontWeight: "600", fontSize: 13, marginBottom: 8 }}>{t("ch_discord_hint_title")}</Text></TouchableOpacity>
    {showHint ? <Text style={{ color: theme.muted, fontSize: 12.5, lineHeight: 19, marginBottom: 10 }}>{t("ch_discord_hint")}</Text> : null}
    <TextInput value={tok} onChangeText={(v) => { setTok(v); setMsg(null) }} placeholder={t("ch_discord_ph")} placeholderTextColor={theme.muted2} multiline autoCapitalize="none" autoCorrect={false} style={{ ...INP, minHeight: 60, textAlignVertical: "top" }} />
    <TouchableOpacity onPress={submit} style={{ ...PRIMARY, marginTop: 4 }}><Text style={{ color: "#fff", fontWeight: "700" }}>{t("ch_link_token")}</Text></TouchableOpacity>
    <View style={{ marginTop: 12, alignItems: "center", minHeight: 24 }}>
      {connected ? <Text style={{ color: theme.ok, fontWeight: "800" }}>✓ {title}</Text> : (msg ? <Text style={{ fontSize: 13, color: msg.err ? theme.urgent : theme.muted }}>{msg.text}</Text> : null)}
    </View>
  </Sheet>
}
// Telegram self-service: teléfono → código → 2FA opcional; poll telegramStatus, luego telegramConnected
function TelegramLinkSheet({ visible, onClose, configured, toast }) {
  const t = useT()
  const [stage, setStage] = useState("phone")
  const [phone, setPhone] = useState(""); const [apiId, setApiId] = useState(""); const [apiHash, setApiHash] = useState("")
  const [code, setCode] = useState(""); const [pw, setPw] = useState("")
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false); const [polling, setPolling] = useState(false)
  const closeRef = useRef(onClose); closeRef.current = onClose
  const needApi = !configured
  useEffect(() => { if (!visible) { setStage("phone"); setPhone(""); setApiId(""); setApiHash(""); setCode(""); setPw(""); setMsg(null); setBusy(false); setPolling(false) } }, [visible])
  async function start() {
    if (!phone.trim()) return setMsg({ text: t("ch_tg_need_phone"), err: true })
    setBusy(true); setMsg({ text: t("ch_sending"), err: false })
    const r = await telegramStart({ phone: phone.trim(), apiId: apiId.trim(), apiHash: apiHash.trim() }).catch(() => null)
    setBusy(false)
    if (!r || r.error) return setMsg({ text: (r && r.error) || t("ch_tg_start_fail"), err: true })
    setMsg(null); setStage("code")
  }
  async function submitCode() {
    if (!code.trim()) return setMsg({ text: t("ch_need_code"), err: true })
    setBusy(true); setMsg({ text: t("ch_verifying"), err: false }); await telegramCode(code.trim()).catch(() => {}); setBusy(false); setPolling(true)
  }
  async function submitPw() { setBusy(true); setMsg({ text: t("ch_verifying"), err: false }); await telegramPassword(pw).catch(() => {}); setBusy(false); setPolling(true) }
  useEffect(() => {
    if (!polling || !visible) return
    let alive = true, tm
    const tick = async () => {
      const st = await telegramStatus().catch(() => null)
      if (!alive) return
      if (st && st.connected) { setMsg({ text: t("ch_tg_connected"), err: false }); await telegramConnected().catch(() => {}); toast && toast(t("ch_tg_connected")); setTimeout(() => closeRef.current(), 1400); return }
      if (st && st.stage === "password") { setPolling(false); setStage("password"); setMsg(null); return }
      if (st && st.stage === "error") { setPolling(false); setMsg({ text: st.error || t("ch_tg_login_err"), err: true }); return }
      tm = setTimeout(tick, 1500)
    }
    tm = setTimeout(tick, 700)
    return () => { alive = false; clearTimeout(tm) }
  }, [polling, visible])
  return <Sheet visible={visible} onClose={onClose}>
    <Text style={SHEET_TITLE}>Telegram</Text>
    {stage === "phone" ? (<>
      <Text style={{ color: theme.muted, marginBottom: 10, fontSize: 13, lineHeight: 18 }}>{t("ch_tg_sub")}</Text>
      {needApi ? (<>
        <Text style={{ color: theme.muted, marginBottom: 8, fontSize: 12.5, lineHeight: 17 }}>{t("ch_tg_api_note")}</Text>
        <TextInput value={apiId} onChangeText={setApiId} placeholder={t("ch_tg_apiid_ph")} placeholderTextColor={theme.muted2} keyboardType="number-pad" style={INP} />
        <TextInput value={apiHash} onChangeText={setApiHash} placeholder={t("ch_tg_apihash_ph")} placeholderTextColor={theme.muted2} autoCapitalize="none" autoCorrect={false} style={INP} />
      </>) : null}
      <TextInput value={phone} onChangeText={setPhone} placeholder={t("ch_phone_ph")} placeholderTextColor={theme.muted2} keyboardType="phone-pad" style={INP} />
      <TouchableOpacity onPress={start} disabled={busy} style={PRIMARY}><Text style={{ color: "#fff", fontWeight: "700" }}>{busy ? t("ch_sending") : t("ch_send_code")}</Text></TouchableOpacity>
    </>) : null}
    {stage === "code" ? (<>
      <Text style={{ color: theme.muted, marginBottom: 10, fontSize: 13, lineHeight: 18 }}>{t("ch_tg_code_sub")}</Text>
      <TextInput value={code} onChangeText={setCode} placeholder={t("ch_code_ph")} placeholderTextColor={theme.muted2} keyboardType="number-pad" style={{ ...INP, textAlign: "center", fontSize: 22, letterSpacing: 6 }} />
      <TouchableOpacity onPress={submitCode} disabled={busy} style={PRIMARY}><Text style={{ color: "#fff", fontWeight: "700" }}>{busy ? "…" : t("ch_confirm")}</Text></TouchableOpacity>
    </>) : null}
    {stage === "password" ? (<>
      <Text style={{ color: theme.muted, marginBottom: 10, fontSize: 13, lineHeight: 18 }}>{t("ch_tg_pw_sub")}</Text>
      <TextInput value={pw} onChangeText={setPw} placeholder={t("ch_tg_pw_ph")} placeholderTextColor={theme.muted2} secureTextEntry style={INP} />
      <TouchableOpacity onPress={submitPw} disabled={busy} style={PRIMARY}><Text style={{ color: "#fff", fontWeight: "700" }}>{busy ? "…" : t("ch_confirm")}</Text></TouchableOpacity>
    </>) : null}
    {msg ? <Text style={{ marginTop: 10, textAlign: "center", fontSize: 13.5, color: msg.err ? theme.urgent : theme.muted }}>{msg.text}</Text> : null}
  </Sheet>
}
// Slack: token → setSlack
function SlackSheet({ visible, onClose, onSaved }) {
  const t = useT()
  const [tok, setTok] = useState(""); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false)
  useEffect(() => { if (!visible) { setTok(""); setMsg(null); setBusy(false) } }, [visible])
  async function save() {
    if (!tok.trim()) return setMsg({ text: t("ch_paste_token_first"), err: true })
    setBusy(true); setMsg({ text: t("ch_verifying"), err: false })
    const r = await setSlack(tok.trim()).catch(() => null); setBusy(false)
    if (!r || r.error) return setMsg({ text: (r && r.error) || t("ch_slack_fail"), err: true })
    Alert.alert("✓", t("ch_slack_ok") + (r.team ? " (" + r.team + ")" : "")); onClose(); onSaved && onSaved()
  }
  return <Sheet visible={visible} onClose={onClose}>
    <Text style={SHEET_TITLE}>Slack</Text>
    <Text style={{ color: theme.muted, marginBottom: 10, fontSize: 13, lineHeight: 18 }}>{t("ch_slack_help")}</Text>
    <TextInput value={tok} onChangeText={(v) => { setTok(v); setMsg(null) }} placeholder={t("ch_slack_ph")} placeholderTextColor={theme.muted2} secureTextEntry autoCapitalize="none" autoCorrect={false} style={INP} />
    <TouchableOpacity onPress={save} disabled={busy} style={PRIMARY}><Text style={{ color: "#fff", fontWeight: "700" }}>{busy ? t("ch_verifying") : t("ch_slack_connect")}</Text></TouchableOpacity>
    {msg ? <Text style={{ marginTop: 10, textAlign: "center", fontSize: 13, color: msg.err ? theme.urgent : theme.muted }}>{msg.text}</Text> : null}
  </Sheet>
}
// Signal: url + número → setSignal
function SignalSheet({ visible, onClose, onSaved }) {
  const t = useT()
  const [url, setUrl] = useState(""); const [num, setNum] = useState(""); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false)
  useEffect(() => { if (!visible) { setUrl(""); setNum(""); setMsg(null); setBusy(false) } }, [visible])
  async function save() {
    if (!url.trim() || !num.trim()) return setMsg({ text: t("ch_signal_need"), err: true })
    setBusy(true); setMsg({ text: t("ch_verifying"), err: false })
    const r = await setSignal(url.trim(), num.trim()).catch(() => null); setBusy(false)
    if (!r || r.error) return setMsg({ text: (r && r.error) || t("ch_signal_fail"), err: true })
    Alert.alert("✓", t("ch_signal_ok")); onClose(); onSaved && onSaved()
  }
  return <Sheet visible={visible} onClose={onClose}>
    <Text style={SHEET_TITLE}>Signal</Text>
    <Text style={{ color: theme.muted, marginBottom: 10, fontSize: 13, lineHeight: 18 }}>{t("ch_signal_help")}</Text>
    <TextInput value={url} onChangeText={(v) => { setUrl(v); setMsg(null) }} placeholder={t("ch_signal_url_ph")} placeholderTextColor={theme.muted2} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={INP} />
    <TextInput value={num} onChangeText={(v) => { setNum(v); setMsg(null) }} placeholder={t("ch_signal_num_ph")} placeholderTextColor={theme.muted2} keyboardType="phone-pad" style={INP} />
    <TouchableOpacity onPress={save} disabled={busy} style={PRIMARY}><Text style={{ color: "#fff", fontWeight: "700" }}>{busy ? t("ch_verifying") : t("ch_signal_connect")}</Text></TouchableOpacity>
    {msg ? <Text style={{ marginTop: 10, textAlign: "center", fontSize: 13, color: msg.err ? theme.urgent : theme.muted }}>{msg.text}</Text> : null}
  </Sheet>
}
// Tarjeta principal: estado de todos los canales + filas de cuentas conectadas + apertura de cada hoja
function ChannelsCard({ t }) {
  const [status, setStatus] = useState(null)
  const [waDown, setWaDown] = useState([])
  const [tg, setTg] = useState({})
  const [integ, setInteg] = useState(null)
  const [logins, setLogins] = useState({})
  const [secret, setSecret] = useState({ numbers: [], accounts: [] })
  const [secShow, setSecShow] = useState(secretOn())
  const [open, setOpen] = useState(null) // { kind, net?, label?, instr? }
  // la LISTA de canales viene del server (registro de conectores). Arranca con el fallback hardcodeado; si el catálogo carga bien, lo reemplaza.
  const [channels, setChannels] = useState(FALLBACK_CHANNELS)
  const toast = (m) => Alert.alert(m)
  const msgChannels = channels.filter((c) => c.kind === "messaging")

  const reload = useCallback(async () => {
    const [s, w, tgs, i] = await Promise.all([getStatus().catch(() => null), getWaStatus().catch(() => null), telegramStatus().catch(() => null), getIntegrations().catch(() => null)])
    if (s) setStatus(s); if (w) setWaDown(w.loggedOut || []); if (tgs) setTg(tgs); if (i) setInteg(i)
    if (secretOn()) { const ss = await getSecretState().catch(() => null); if (ss) setSecret({ numbers: ss.numbers || [], accounts: ss.accounts || [] }) }
  }, [])
  // nets que tienen "cuentas conectadas" vía el bridge Matrix (todos los matrix-bridge/matrix-token menos WhatsApp, que sale de /api/status)
  const reloadLogins = useCallback(async () => {
    const nets = channels.filter((c) => c.connect && (c.connect.method === "matrix-bridge" || c.connect.method === "matrix-token") && c.connect.net && c.connect.net !== "whatsapp").map((c) => c.connect.net)
    for (const net of nets) {
      const r = await getMatrixLogins(net, true).catch(() => null)
      if (r) setLogins((p) => ({ ...p, [net]: r.accounts || [] }))
    }
  }, [channels])
  // al montar: traer el catálogo; si falla, se queda el FALLBACK. La UI es idéntica en ambos casos.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await getChannelsCatalog().catch(() => null)
      if (alive && r && Array.isArray(r.channels) && r.channels.length) setChannels(r.channels)
    })()
    return () => { alive = false }
  }, [])
  useEffect(() => { reload() }, [])
  useEffect(() => { reloadLogins() }, [channels]) // re-consulta logins cuando cambia la lista (fallback → catálogo)
  // al des/bloquear el 2º PIN: re-pedir estado (con el token aparecen/desaparecen las cuentas secretas)
  useEffect(() => onSecretChange(() => { setSecShow(secretOn()); reload() }), [])
  const closeSheet = () => { setOpen(null); reload(); reloadLogins() }

  const fmtAcct = (a) => { const s = String(a).replace(/^\+/, ""); return /^\d+$/.test(s) ? "+" + s : s }
  const isAcctSecret = (n) => { const d = String(n).replace(/\D/g, ""); return d ? (secret.numbers || []).includes(d) : (secret.numbers || []).includes(String(n)) }
  async function toggleSecret(n) {
    const want = !isAcctSecret(n)
    const r = await secretSetWa(n, want).catch(() => null)
    if (!r || r.error) return Alert.alert(t("could_not"), (r && r.error) || "")
    await reload()
  }
  function confirmDisconnect(titleKey, fn) {
    Alert.alert(t(titleKey), "", [{ text: t("cancel") }, { text: t("ch_disconnect"), style: "destructive", onPress: async () => { await fn().catch(() => {}); reload() } }])
  }

  const waAccounts = [
    ...((status && status.whatsapp && status.whatsapp.bridge) || []),
    ...(((status && status.whatsapp && status.whatsapp.baileys) || []).map((b) => b.num || b.acc || "")),
  ].filter(Boolean)
  const slackOn = !!(integ && integ.slack && integ.slack.configured)
  const signalOn = !!(integ && integ.signal && integ.signal.configured)
  const tgOn = !!(tg && tg.connected)

  const sub = (node) => node
  const okText = (s) => <Text style={{ fontSize: 12, color: theme.ok }}>{s}</Text>
  const mutedText = (s) => <Text style={{ fontSize: 12, color: theme.muted2 }}>{s}</Text>
  const acctSub = (accts) => accts.length ? okText(accts.length + " " + (accts.length > 1 ? t("ch_connected_pl") : t("ch_connected_sg"))) : mutedText(t("ch_no_accounts"))
  const linkBtn = (label, onPress) => <TouchableOpacity onPress={onPress} hitSlop={8}><Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12.5 }}>{label}</Text></TouchableOpacity>
  const delBtn = (onPress) => <TouchableOpacity onPress={onPress} hitSlop={8}><Text style={{ color: theme.urgent, fontWeight: "700", fontSize: 12.5 }}>{t("ch_disconnect")}</Text></TouchableOpacity>
  const chRow = (key, iconNode, name, subNode, action) => (
    <Row key={key}>
      <View style={{ width: 24, alignItems: "center" }}>{iconNode}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14.5, color: theme.ink, fontWeight: "600" }}>{name}</Text>
        {subNode}
      </View>
      {action}
    </Row>
  )
  // ícono por-id (emoji del mapa) o, si no está, círculo con la inicial y el color de marca del catálogo
  const iconFor = (ch) => {
    const e = CH_ICON[ch.id]
    if (e) return <Text style={{ fontSize: 18 }}>{e}</Text>
    const init = String(ch.label || ch.id || "?").slice(0, 1).toUpperCase()
    return <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: ch.brand || theme.muted2, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>{init}</Text>
    </View>
  }
  const acctRows = (accts) => (accts || []).map((a) => (
    <View key={a} style={{ flexDirection: "row", alignItems: "center", paddingRight: 14, paddingLeft: 44, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: theme.line }}>
      <Text style={{ flex: 1, fontSize: 13, color: theme.ink, fontWeight: "500" }}>{isAcctSecret(a) ? "🔒 " : ""}{fmtAcct(a)}</Text>
      {secShow ? <TouchableOpacity onPress={() => toggleSecret(a)} hitSlop={6}><Text style={{ fontSize: 11.5, fontWeight: "600", color: isAcctSecret(a) ? theme.accent : theme.muted }}>{isAcctSecret(a) ? t("ch_secret_on") : t("ch_secret_off")}</Text></TouchableOpacity> : null}
    </View>
  ))

  const waSub = <Text style={{ fontSize: 12, color: waAccounts.length ? theme.ok : theme.muted2 }}>
    {waAccounts.length ? (waAccounts.length + " " + (waAccounts.length > 1 ? t("ch_connected_pl") : t("ch_connected_sg"))) : t("ch_no_accounts")}
    {waDown.length ? <Text style={{ color: theme.urgent }}>{"  ·  ⚠️ " + t("ch_revincula") + " " + waDown.map(fmtAcct).join(", ")}</Text> : null}
  </Text>

  // Una fila (o fila + sus cuentas) por canal del catálogo, elegida por connect.method. Conserva EXACTAMENTE el comportamiento previo.
  const renderChannel = (ch) => {
    const id = ch.id, label = ch.label || id, c = ch.connect || {}, icon = iconFor(ch)
    // WhatsApp: sus cuentas salen de /api/status (bridge+baileys), con aviso de re-vinculación (waSub)
    if (id === "whatsapp") return (
      <React.Fragment key={id}>
        {chRow(id, icon, label, sub(waSub), linkBtn(t("ch_add_account"), () => setOpen({ kind: "bridge", net: c.net || "whatsapp", label })))}
        {acctRows(waAccounts)}
      </React.Fragment>
    )
    if (c.method === "matrix-bridge") {
      const net = c.net, accts = logins[net] || [], ik = CH_INSTR[id]
      return <React.Fragment key={id}>
        {chRow(id, icon, label, acctSub(accts), linkBtn(t("ch_add_account"), () => setOpen({ kind: "bridge", net, label, instr: ik ? t(ik) : undefined })))}
        {acctRows(accts)}
      </React.Fragment>
    }
    if (c.method === "matrix-token") {
      const net = c.net, accts = logins[net] || []
      return <React.Fragment key={id}>
        {chRow(id, icon, label, acctSub(accts), linkBtn(t("ch_add_account"), () => setOpen({ kind: "token", net, label })))}
        {acctRows(accts)}
      </React.Fragment>
    }
    if (c.method === "telegram-login") return chRow(id, icon, label,
      <Text style={{ fontSize: 12, color: tgOn ? theme.ok : theme.muted2 }}>{tgOn ? t("ch_connected") + " ✓ · " + t("ch_read_only") : t("ch_tg_short")}</Text>,
      tgOn ? <Text style={{ color: theme.ok, fontSize: 15, fontWeight: "800" }}>✓</Text> : linkBtn(t("ch_connect"), () => setOpen({ kind: "telegram" })))
    if (c.method === "integration" && c.provider === "slack") return chRow(id, icon, label,
      <Text style={{ fontSize: 12, color: slackOn ? theme.ok : theme.muted2 }}>{slackOn ? t("ch_connected") + " ✓" + (integ && integ.slack && integ.slack.team ? " · " + integ.slack.team : "") : t("ch_slack_sub")}</Text>,
      slackOn ? delBtn(() => confirmDisconnect("ch_slack_confirm", removeSlack)) : linkBtn(t("ch_connect"), () => setOpen({ kind: "slack" })))
    if (c.method === "integration" && c.provider === "signal") return chRow(id, icon, label,
      <Text style={{ fontSize: 12, color: signalOn ? theme.ok : theme.muted2 }}>{signalOn ? t("ch_connected") + " ✓" + (integ && integ.signal && integ.signal.number ? " · " + integ.signal.number : "") : t("ch_signal_sub")}</Text>,
      signalOn ? delBtn(() => confirmDisconnect("ch_signal_confirm", removeSignal)) : linkBtn(t("ch_connect"), () => setOpen({ kind: "signal" })))
    return null
  }

  return <>
    <Card title={"📨 " + t("ch_title")}>
      {msgChannels.map(renderChannel)}
      <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
        <Text style={{ fontSize: 11.5, color: theme.muted, lineHeight: 16 }}>{t("ch_server_note")}</Text>
      </View>
    </Card>
    <BridgeLinkSheet visible={!!open && open.kind === "bridge"} onClose={closeSheet} net={open && open.net} label={(open && open.label) || ""} instr={open && open.instr} toast={toast} />
    <DiscordLinkSheet visible={!!open && open.kind === "token"} onClose={closeSheet} net={open && open.net} label={(open && open.label) || ""} toast={toast} />
    <TelegramLinkSheet visible={!!open && open.kind === "telegram"} onClose={closeSheet} configured={!!(tg && tg.configured)} toast={toast} />
    <SlackSheet visible={!!open && open.kind === "slack"} onClose={closeSheet} onSaved={reload} />
    <SignalSheet visible={!!open && open.kind === "signal"} onClose={closeSheet} onSaved={reload} />
  </>
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
  const [council, setCouncil] = useState({ enabled: false, members: [], chairman: "", available: [] })
  const [tcard, setTcard] = useState(null); const [tloading, setTloading] = useState(false); const [tedit, setTedit] = useState(false); const [tfix, setTfix] = useState(""); const [tcount, setTcount] = useState(0)
  const [voice, setVoice] = useState(null); const [voiceBusy, setVoiceBusy] = useState(false)

  const load = useCallback(async () => {
    const [h, a, l, v, n, s, ap, af, co] = await Promise.all([
      getHubConfig().catch(() => ({})), getAccounts().catch(() => ({ email: [] })), getLlmConfig().catch(() => ({})),
      getVoices().catch(() => ({ voices: [] })), getNotifPrefs().catch(() => ({})), getAuthStatus().catch(() => ({})),
      getAutopilotPolicy().catch(() => ({ presets: [], custom: [], presets_available: [] })),
      getApifyAccounts().catch(() => ({ accounts: [] })),
      getCouncil().catch(() => ({ enabled: false, members: [], chairman: "", available: [] })),
    ])
    setCouncil(co || { enabled: false, members: [], chairman: "", available: [] })
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
  function toggleCouncilMem(m) { setCouncil((c) => { const has = (c.members || []).includes(m); return { ...c, members: has ? c.members.filter((x) => x !== m) : [...(c.members || []), m] } }) }
  async function saveCouncilCfg() {
    if (council.enabled && (council.members || []).length < 2) return Alert.alert(t("council") || "Council", t("council_min2") || "Elegí al menos 2 modelos.")
    setBusy(true); const r = await apiSetCouncil({ enabled: council.enabled, members: council.members || [], chairman: council.chairman || "" }).catch(() => null); setBusy(false)
    Alert.alert(r ? "✓" : "Error", r ? (t("saved") || "Guardado") : "")
  }
  // 🎓 Entrená tu IA: mazo de corrección
  async function loadCard() { setTloading(true); setTedit(false); const c = await getTrainCard().catch(() => ({ error: "x" })); setTcard(c); setTfix((c && c.draft) || ""); setTloading(false) }
  async function openTrain() { setSheet("train"); loadCard() }
  async function trainOk() { if (tcard && tcard.key) await autopilotFeedbackMsg(tcard.key, true, "", tcard.draft || "").catch(() => {}); setTcount((n) => n + 1); loadCard() }
  async function trainSave() { const v = (tfix || "").trim(); if (!v || !tcard || !tcard.key) return; await autopilotFeedbackMsg(tcard.key, false, v, tcard.draft || "").catch(() => {}); setTcount((n) => n + 1); loadCard() }
  // 🗣️ Tu voz
  useEffect(() => { getVoiceProfile().then((v) => { if (v && (v.dialect || v.languages || v.summary)) setVoice(v) }).catch(() => {}) }, [])
  async function buildVoice() { setVoiceBusy(true); const r = await buildVoiceProfile().catch(() => null); setVoiceBusy(false); if (r && !r.error) setVoice(r); else Alert.alert("No se pudo", "¿Pocos mensajes tuyos?") }
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

        <ChannelsCard t={t} />

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

        <Card title={"🧠 " + (t("council_title") || "Council de modelos")}>
          <Row onPress={() => setCouncil((c) => ({ ...c, enabled: !c.enabled }))}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: council.enabled ? theme.accent : theme.line, backgroundColor: council.enabled ? theme.accent : "transparent", justifyContent: "center", alignItems: "center" }}>{council.enabled ? <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>✓</Text> : null}</View>
            <Text style={{ flex: 1, fontSize: 15, color: theme.ink }}>{t("council_enable") || "Activar council"}</Text>
          </Row>
          <View style={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 3 }}>
            <Text style={{ fontSize: 12.5, color: theme.muted, lineHeight: 17 }}>{t("council_help") || "Varios modelos locales redactan y uno elige el mejor. Más calidad, más lento. Elegí 2+."}</Text>
          </View>
          {(council.available || []).filter((m) => !/deepseek|embed|:3b/.test(m)).map((m) => {
            const on = (council.members || []).includes(m)
            return (
              <Row key={m} onPress={() => toggleCouncilMem(m)}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.accent : "transparent", justifyContent: "center", alignItems: "center" }}>{on ? <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>✓</Text> : null}</View>
                <Text style={{ flex: 1, fontSize: 14.5, color: theme.ink }}>{m}</Text>
              </Row>
            )
          })}
          <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 13 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, marginBottom: 6, letterSpacing: 0.4 }}>{(t("council_chairman") || "Chairman (el que elige)").toUpperCase()}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
              {["", ...(council.available || []).filter((m) => !/deepseek|embed|:3b/.test(m))].map((m) => (
                <TouchableOpacity key={m || "auto"} onPress={() => setCouncil((c) => ({ ...c, chairman: m }))} style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9, backgroundColor: council.chairman === m ? theme.accent : theme.bg, borderWidth: 1, borderColor: council.chairman === m ? theme.accent : theme.line }}>
                  <Text style={{ fontSize: 12.5, color: council.chairman === m ? "#fff" : theme.ink }}>{m || (t("auto") || "automático")}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={saveCouncilCfg} style={{ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("save")}</Text></TouchableOpacity>
          </View>
        </Card>

        <Card title={"🎓 " + (t("train_title") || "Entrená tu IA")}>
          <View style={{ paddingHorizontal: 14, paddingTop: 11, paddingBottom: 3 }}>
            <Text style={{ fontSize: 12.5, color: theme.muted, lineHeight: 17 }}>{t("train_help") || "Te muestro un mensaje real y lo que tu IA contestaría. Aprobalo o corregilo — así aprende tu estilo."}</Text>
          </View>
          <Row onPress={openTrain} last><Text style={{ fontSize: 18 }}>✍️</Text><Text style={{ flex: 1, fontSize: 15, color: theme.ink }}>{t("train_open") || "Empezar a corregir"}</Text><Text style={{ color: theme.muted2 }}>›</Text></Row>
        </Card>

        <Card title={"🗣️ " + (t("voice_title") || "Tu voz")}>
          <View style={{ paddingHorizontal: 14, paddingTop: 11, paddingBottom: 13 }}>
            {voice ? (<>
              {voice.summary ? <Text style={{ fontSize: 13.5, color: theme.muted, lineHeight: 18, marginBottom: 10 }}>{voice.summary}</Text> : null}
              {(voice.dialect || []).length ? <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, letterSpacing: 0.4, marginBottom: 4 }}>DIALECTO / NACIONALIDAD</Text> : null}
              {(voice.dialect || []).filter((x) => x.name).map((x, i) => {
                const p = Math.max(2, Math.min(100, x.pct || 0)), cols = ["#6366f1", "#e0872b", "#22a06b", "#e2483d"]
                return (<View key={i} style={{ marginVertical: 5 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}><Text style={{ fontSize: 13.5, color: theme.ink }}>{x.name}</Text><Text style={{ fontSize: 13.5, fontWeight: "800", color: theme.ink }}>{p}%</Text></View>
                  <View style={{ height: 8, borderRadius: 6, backgroundColor: theme.bg, overflow: "hidden" }}><View style={{ height: "100%", width: p + "%", backgroundColor: cols[i % cols.length], borderRadius: 6 }} /></View>
                </View>)
              })}
              {(voice.languages || []).length ? <Text style={{ fontSize: 11, fontWeight: "800", color: theme.muted2, letterSpacing: 0.4, marginTop: 12, marginBottom: 4 }}>IDIOMAS</Text> : null}
              {(voice.languages || []).filter((x) => x.name).map((x, i) => {
                const p = Math.max(2, Math.min(100, x.pct || 0))
                return (<View key={i} style={{ marginVertical: 5 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}><Text style={{ fontSize: 13.5, color: theme.ink }}>{x.name}</Text><Text style={{ fontSize: 13.5, fontWeight: "800", color: theme.ink }}>{p}%</Text></View>
                  <View style={{ height: 8, borderRadius: 6, backgroundColor: theme.bg, overflow: "hidden" }}><View style={{ height: "100%", width: p + "%", backgroundColor: "#3b82f6", borderRadius: 6 }} /></View>
                </View>)
              })}
              {(voice.tone || []).length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>{voice.tone.map((tn, i) => <View key={i} style={{ backgroundColor: theme.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ fontSize: 12.5, color: theme.ink }}>{tn}</Text></View>)}</View> : null}
            </>) : <Text style={{ fontSize: 12.5, color: theme.muted, lineHeight: 17, marginBottom: 8 }}>{t("voice_help") || "La IA analiza tus mensajes y detecta tu tonalidad (idiomas, dialecto, tono)."}</Text>}
            <TouchableOpacity onPress={buildVoice} disabled={voiceBusy} style={{ backgroundColor: voice ? theme.bg : theme.accent, borderWidth: voice ? 1 : 0, borderColor: theme.line, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 12 }}>
              <Text style={{ color: voice ? theme.ink : "#fff", fontWeight: "700", fontSize: 14.5 }}>{voiceBusy ? (t("analyzing") || "Analizando…") : voice ? "🔄 " + (t("redetect") || "Re-detectar") : "🗣️ " + (t("detect_voice") || "Detectar mi voz")}</Text>
            </TouchableOpacity>
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

      <Sheet visible={sheet === "train"} onClose={() => setSheet(null)}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: theme.ink, marginBottom: 12 }}>🎓 {t("train_title") || "Entrená tu IA"}</Text>
        {tloading ? <View style={{ height: 150, justifyContent: "center", alignItems: "center" }}><ActivityIndicator color={theme.accent} /></View>
          : !tcard || tcard.error ? <View><Text style={{ color: theme.muted, marginBottom: 12 }}>No se pudo cargar.</Text><TouchableOpacity onPress={loadCard} style={{ backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 13, alignItems: "center" }}><Text style={{ color: theme.ink, fontWeight: "700" }}>Reintentar</Text></TouchableOpacity></View>
            : tcard.none ? <Text style={{ color: theme.muted }}>No hay más mensajes para practicar por ahora — volvé más tarde.</Text>
              : (<View>
                <Text style={{ fontSize: 12.5, color: theme.muted, marginBottom: 8 }}><Text style={{ fontWeight: "700" }}>{tcard.name}</Text> — así viene la charla:</Text>
                {(tcard.context || []).map((m, i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: m.mine ? "flex-end" : "flex-start", marginVertical: 3 }}>
                    <Text style={{ maxWidth: "82%", paddingHorizontal: 11, paddingVertical: 7, borderRadius: 13, fontSize: 13.5, overflow: "hidden", backgroundColor: m.mine ? theme.accent : theme.bg, color: m.mine ? "#fff" : theme.ink }}>{m.text}</Text>
                  </View>))}
                <View style={{ flexDirection: "row", justifyContent: "flex-start", marginVertical: 4 }}>
                  <Text style={{ maxWidth: "88%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 13, fontSize: 14, overflow: "hidden", backgroundColor: theme.bg, color: theme.ink, borderWidth: 2, borderColor: theme.accent }}>{tcard.incoming}</Text>
                </View>
                <Text style={{ fontSize: 12.5, color: theme.muted, marginTop: 15, marginBottom: 6 }}>🤖 Tu IA respondería:</Text>
                {tedit ? <TextInput value={tfix} onChangeText={setTfix} autoFocus multiline style={{ ...inp, minHeight: 64, textAlignVertical: "top" }} />
                  : <View style={{ padding: 12, borderRadius: 12, backgroundColor: theme.bg, minHeight: 20 }}><Text style={{ fontSize: 14.5, color: tcard.draft ? theme.ink : theme.muted2 }}>{tcard.draft || "(no pudo redactar — escribí cómo responderías vos)"}</Text></View>}
                {tedit ? <TouchableOpacity onPress={trainSave} style={{ backgroundColor: theme.accent, borderRadius: 12, padding: 13, alignItems: "center", marginTop: 10 }}><Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>💾 {t("save") || "Guardar corrección"}</Text></TouchableOpacity>
                  : (<View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    <TouchableOpacity onPress={() => { setTfix(tcard.draft || ""); setTedit(true) }} style={{ flex: 1, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 13, alignItems: "center" }}><Text style={{ color: theme.ink, fontWeight: "700" }}>✍️ Así lo diría yo</Text></TouchableOpacity>
                    <TouchableOpacity onPress={trainOk} style={{ flex: 1, backgroundColor: theme.accent, borderRadius: 12, padding: 13, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "800" }}>✓ Está bien</Text></TouchableOpacity>
                  </View>)}
                {!tedit ? <TouchableOpacity onPress={loadCard} style={{ padding: 12, alignItems: "center", marginTop: 6 }}><Text style={{ color: theme.muted, fontWeight: "600" }}>⏭️ Saltar este</Text></TouchableOpacity> : null}
                <Text style={{ textAlign: "center", fontSize: 12, color: theme.muted, marginTop: 8 }}>{tcount} {tcount === 1 ? "corregido" : "corregidos"} · cada uno entrena a tu IA 🧠</Text>
              </View>)}
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
