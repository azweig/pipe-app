import React, { useState } from "react"
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native"
import { theme } from "../theme"
import { useT } from "../i18n"
import { login, setBase, getBase } from "../api"

export default function Login({ navigation }) {
  const t = useT()
  const [pin, setPin] = useState("")
  const [url, setUrl] = useState(getBase())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  async function go() {
    if (!pin || busy) return
    setBusy(true); setErr("")
    await setBase(url)
    const r = await login(pin)
    setBusy(false)
    if (r.ok) navigation.replace("Main")
    else setErr(r.error || "error")
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center", padding: 28 }}>
      <Text style={{ fontSize: 36, fontWeight: "800", color: theme.ink, marginBottom: 6 }}>Pipe</Text>
      <Text style={{ color: theme.muted, marginBottom: 28, fontSize: 15 }}>{t("login_tagline")}</Text>
      <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 6 }}>{t("server")}</Text>
      <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url"
        style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 13, fontSize: 15, color: theme.ink }} />
      <Text style={{ color: theme.muted, fontSize: 12, marginTop: 16, marginBottom: 6 }}>{t("pin")}</Text>
      <TextInput value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" returnKeyType="go" onSubmitEditing={go}
        style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 13, fontSize: 18, letterSpacing: 4, color: theme.ink }} />
      {err ? <Text style={{ color: theme.urgent, marginTop: 12 }}>{err}</Text> : null}
      <TouchableOpacity onPress={go} disabled={busy} activeOpacity={0.8}
        style={{ backgroundColor: theme.accent, padding: 15, borderRadius: 14, marginTop: 22, alignItems: "center", opacity: busy ? 0.7 : 1 }}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{t("enter")}</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  )
}
