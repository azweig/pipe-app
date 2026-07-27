// Tarjeta "IA local (opcional)" para Ajustes: instalar/desinstalar los modelos on-device + toggles de qué tarea corre en el teléfono.
// Opt-in total: si no está instalado, todo sigue por el server. Self-contained (su propio estado) → Settings.js solo la renderiza.
import React, { useEffect, useState } from "react"
import { View, Text, TouchableOpacity, Switch, Alert } from "react-native"
import { theme } from "../theme"
import * as LocalAI from "../localai"

export default function LocalAICard({ t }) {
  const [st, setSt] = useState({ ready: false, installed: false, correct: false, stt: false })
  const [dl, setDl] = useState(null) // { which:'llm'|'stt', pct:0..1 }
  const T = (k, d) => { try { const v = t && t(k); return v && v !== k ? v : d } catch { return d } }

  async function refresh() {
    const installed = await LocalAI.installed(); const p = await LocalAI.prefs()
    setSt({ ready: true, installed, correct: p.correct, stt: p.stt })
  }
  useEffect(() => { refresh() }, [])

  async function install() {
    try {
      setDl({ which: "llm", pct: 0 }); await LocalAI.download("llm", (pct) => setDl({ which: "llm", pct }))
      setDl({ which: "stt", pct: 0 }); await LocalAI.download("stt", (pct) => setDl({ which: "stt", pct }))
      setDl(null); await LocalAI.setPref("correct", true); await LocalAI.setPref("stt", true); await refresh()
      Alert.alert("IA local", T("localai_done", "Listo. La corrección y la transcripción ahora corren en tu teléfono."))
    } catch (e) { setDl(null); Alert.alert("IA local", T("localai_dl_err", "No se pudo descargar. Revisá tu conexión y probá de nuevo.")) }
  }
  async function toggle(k, v) { await LocalAI.setPref(k, v); setSt((s) => ({ ...s, [k]: v })) }
  function remove() {
    Alert.alert(T("localai_uninstall", "Liberar espacio"), T("localai_uninstall_q", "Se borran los modelos. La corrección y la transcripción vuelven a usar el server."), [
      { text: T("cancel", "Cancelar"), style: "cancel" },
      { text: T("delete", "Borrar"), style: "destructive", onPress: async () => { await LocalAI.uninstall(); await refresh() } },
    ])
  }

  if (!st.ready) return null
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ fontSize: 12.5, fontWeight: "800", color: theme.muted, marginBottom: 8, marginLeft: 2, letterSpacing: 0.4 }}>🧠 {T("localai_title", "IA local (opcional)")}</Text>
      <View style={{ backgroundColor: theme.card, borderRadius: 14, padding: 16 }}>
        {!st.installed ? (
          <View>
            <Text style={{ color: theme.ink, fontSize: 14.5, lineHeight: 21 }}>{T("localai_pitch", "Corregí textos y transcribí notas de voz sin conexión y sin que tus datos salgan del teléfono.")}</Text>
            <Text style={{ color: theme.muted, fontSize: 12.5, marginTop: 6 }}>{T("localai_size", "Descarga única de")} ~{LocalAI.TOTAL_MB} MB · {T("localai_removable", "se puede borrar cuando quieras")}.</Text>
            {dl ? (
              <View style={{ marginTop: 14 }}>
                <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 13 }}>{(dl.which === "llm" ? T("localai_dl_llm", "Descargando corrección…") : T("localai_dl_stt", "Descargando transcripción…"))} {Math.round(dl.pct * 100)}%</Text>
                <View style={{ height: 6, backgroundColor: theme.line, borderRadius: 3, marginTop: 8, overflow: "hidden" }}><View style={{ height: 6, width: Math.max(2, dl.pct * 100) + "%", backgroundColor: theme.accent }} /></View>
              </View>
            ) : (
              <TouchableOpacity onPress={install} style={{ marginTop: 14, backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{T("localai_install", "Instalar")}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}>
              <Text style={{ color: theme.ink, fontSize: 15, flex: 1 }}>{T("localai_correct", "Corregir en el teléfono")}</Text>
              <Switch value={st.correct} onValueChange={(v) => toggle("correct", v)} />
            </View>
            <View style={{ height: 1, backgroundColor: theme.line, marginVertical: 6 }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}>
              <Text style={{ color: theme.ink, fontSize: 15, flex: 1 }}>{T("localai_stt", "Transcribir en el teléfono")}</Text>
              <Switch value={st.stt} onValueChange={(v) => toggle("stt", v)} />
            </View>
            <TouchableOpacity onPress={remove} style={{ marginTop: 14, alignItems: "center" }}>
              <Text style={{ color: theme.urgent, fontWeight: "700", fontSize: 13.5 }}>{T("localai_uninstall", "Liberar espacio")} ({LocalAI.TOTAL_MB} MB)</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  )
}
