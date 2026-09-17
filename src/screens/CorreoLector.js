// 📧 LECTOR Y REDACTOR DE CORREO EN EL TELÉFONO — paridad con web y escritorio, con una diferencia honesta.
//
// Acá NO hay WebView, así que el cuerpo HTML no se puede renderizar como en las otras dos. Se muestra el texto
// derivado del HTML. Eso tiene un efecto colateral BUENO y vale decirlo: sin renderizar HTML remoto, un píxel de
// rastreo no tiene forma de dispararse — el remitente no se entera de que abriste el correo.
//
// Redactar sí es completo: cuenta, Para/CC/CCO, asunto y cuerpo. El formato con negrita/listas no está porque en un
// teclado de teléfono nadie lo usa; el cuerpo va como texto y el servidor le pone la firma y la cita.
import React, { useEffect, useState } from "react"
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native"
import { theme } from "../theme"
import { getCorreoHilo, prepararCorreo, cuentasCorreo, enviarCorreoMail } from "../api"

const fecha = (ts) => new Date(ts).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })
const tam = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round((n || 0) / 1024)) + " KB")

// El cuerpo llega en HTML; sin WebView hay que leerlo como texto conservando los cortes de párrafo.
const aTexto = (h) => String(h || "")
  .replace(/<(style|script|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n").replace(/<li[^>]*>/gi, "• ")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
  .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()

const INP = { backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14.5, color: theme.ink, marginBottom: 8 }

function Redactor({ inicial, cuentas, onCerrar, onEnviado }) {
  const [cuenta, setCuenta] = useState(inicial.cuenta || (cuentas[0] && cuentas[0].label) || "")
  const [to, setTo] = useState((inicial.to || []).join(", "))
  const [cc, setCc] = useState((inicial.cc || []).join(", "))
  const [bcc, setBcc] = useState("")
  const [asunto, setAsunto] = useState(inicial.asunto || "")
  const [cuerpo, setCuerpo] = useState("")
  const [enviando, setEnviando] = useState(false)

  const enviar = async () => {
    if (!to.trim()) return Alert.alert("Falta el destinatario")
    if (!asunto.trim()) {
      const sigue = await new Promise((r) => Alert.alert("Sin asunto", "¿Mandarlo igual?",
        [{ text: "Cancelar", onPress: () => r(false) }, { text: "Mandar", onPress: () => r(true) }]))
      if (!sigue) return
    }
    setEnviando(true)
    const r = await enviarCorreoMail({
      msgId: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), // candado anti-doble-envío
      cuenta, to, cc, bcc, asunto, texto: cuerpo,
      cita: inicial.cita || "", citaTxt: inicial.citaTxt || "", inReplyTo: inicial.inReplyTo || "",
    }).catch(() => ({ error: "No se pudo conectar con el hub." }))
    setEnviando(false)
    if (r && r.error) return Alert.alert("No se envió", r.error)
    onEnviado()
  }

  const titulo = inicial.inReplyTo ? "Responder" : inicial.cita ? "Reenviar" : "Correo nuevo"
  return (
    <View style={{ backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: theme.accent }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
        <Text style={{ flex: 1, fontWeight: "800", fontSize: 15, color: theme.ink }}>{titulo}</Text>
        <TouchableOpacity onPress={onCerrar} hitSlop={10}><Text style={{ color: theme.muted, fontSize: 16 }}>✕</Text></TouchableOpacity>
      </View>
      {cuentas.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {cuentas.map((c) => (
            <TouchableOpacity key={c.label} onPress={() => setCuenta(c.label)}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginRight: 6, backgroundColor: cuenta === c.label ? theme.accent : theme.bg }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: cuenta === c.label ? "#fff" : theme.muted }}>{c.user}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
      <TextInput value={to} onChangeText={setTo} placeholder="Para: nombre@dominio.com" placeholderTextColor={theme.muted2}
        autoCapitalize="none" keyboardType="email-address" style={INP} />
      <TextInput value={cc} onChangeText={setCc} placeholder="CC (opcional)" placeholderTextColor={theme.muted2}
        autoCapitalize="none" keyboardType="email-address" style={INP} />
      <TextInput value={bcc} onChangeText={setBcc} placeholder="CCO (opcional)" placeholderTextColor={theme.muted2}
        autoCapitalize="none" keyboardType="email-address" style={INP} />
      <TextInput value={asunto} onChangeText={setAsunto} placeholder="Asunto" placeholderTextColor={theme.muted2} style={INP} />
      <TextInput value={cuerpo} onChangeText={setCuerpo} placeholder="Escribí tu mensaje…" placeholderTextColor={theme.muted2}
        multiline style={{ ...INP, minHeight: 130, textAlignVertical: "top" }} />
      <Text style={{ fontSize: 11.5, color: theme.muted, marginBottom: 10 }}>
        Tu firma se agrega automáticamente al enviar{inicial.cita ? ", arriba del mensaje citado" : ""}.
      </Text>
      <TouchableOpacity onPress={enviar} disabled={enviando}
        style={{ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center", opacity: enviando ? 0.5 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14.5 }}>{enviando ? "Enviando…" : "Enviar"}</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function CorreoLector({ correoKey, onVolver }) {
  const [hilo, setHilo] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState("")
  const [red, setRed] = useState(null)
  const [cuentas, setCuentas] = useState([])

  const cargar = () => {
    setCargando(true); setRed(null)
    getCorreoHilo(correoKey).then((r) => { setHilo(r); setAbierto((r && r.mensajes && r.mensajes[0] && r.mensajes[0].id) || "") })
      .catch(() => setHilo(null)).finally(() => setCargando(false))
  }
  useEffect(() => { cargar(); cuentasCorreo().then((r) => setCuentas((r && r.cuentas) || [])).catch(() => {}) }, [correoKey])

  const prep = async (modo) => {
    const p = await prepararCorreo(correoKey, modo).catch(() => null)
    if (!p || p.error) return Alert.alert("No pude preparar la respuesta", (p && p.error) || "")
    setRed(p)
  }

  if (cargando) return <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center" }}><ActivityIndicator color={theme.accent} /></View>
  if (!hilo || hilo.error) return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20 }}>
      <TouchableOpacity onPress={onVolver}><Text style={{ color: theme.accent, fontWeight: "700" }}>‹ Volver</Text></TouchableOpacity>
      <Text style={{ color: theme.muted, marginTop: 20 }}>No pude abrir este correo.</Text>
    </View>
  )
  const puedeTodos = hilo.mensajes[0] && !hilo.mensajes[0].sinDestinatarios
  const btn = (txt, on, activo = true) => (
    <TouchableOpacity onPress={activo ? on : undefined} disabled={!activo}
      style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card, marginRight: 7, opacity: activo ? 1 : 0.4 }}>
      <Text style={{ fontSize: 12.5, fontWeight: "650", color: theme.ink }}>{txt}</Text>
    </TouchableOpacity>
  )
  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <TouchableOpacity onPress={onVolver} hitSlop={8}><Text style={{ color: theme.accent, fontWeight: "700", fontSize: 13.5 }}>‹ Volver</Text></TouchableOpacity>
      <Text style={{ fontSize: 18, fontWeight: "800", color: theme.ink, marginTop: 10, marginBottom: 10, lineHeight: 24 }}>{hilo.asunto || "(sin asunto)"}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        {btn("↩ Responder", () => prep("responder"))}
        {btn("↩↩ A todos", () => prep("todos"), puedeTodos)}
        {btn("➡ Reenviar", () => prep("reenviar"))}
        <Text style={{ fontSize: 12, color: theme.muted, marginLeft: "auto" }}>{hilo.n} {hilo.n === 1 ? "mensaje" : "mensajes"}</Text>
      </View>
      {red ? <Redactor inicial={red} cuentas={cuentas} onCerrar={() => setRed(null)} onEnviado={() => { Alert.alert("✓ Correo enviado"); cargar() }} /> : null}
      {hilo.mensajes.map((m) => {
        const ab = abierto === m.id
        return (
          <View key={m.id} style={{ backgroundColor: theme.card, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
            <TouchableOpacity onPress={() => setAbierto(ab ? "" : m.id)} style={{ padding: 12, flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: "700", fontSize: 13.5, color: theme.ink }}>{m.dir === "out" ? "Vos" : (m.deNombre || m.de || "(sin remitente)")}</Text>
                <Text style={{ fontSize: 11.5, color: theme.muted, marginTop: 2 }}>
                  {(m.para || []).length ? "Para: " + m.para.join(", ") : (m.sinDestinatarios ? "Para: —" : "")}
                  {(m.cc || []).length ? " · CC: " + m.cc.join(", ") : ""}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: theme.muted2 }}>{fecha(m.ts)}</Text>
            </TouchableOpacity>
            {ab ? (
              <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                {(m.adjuntos || []).map((a, i) => (
                  <Text key={i} style={{ fontSize: 12, color: theme.muted, marginBottom: 4 }}>📎 {a.nombre} · {tam(a.tam)}</Text>
                ))}
                <Text selectable style={{ fontSize: 14, color: theme.ink, lineHeight: 21 }}>{aTexto(m.html) || "(sin cuerpo)"}</Text>
              </View>
            ) : null}
          </View>
        )
      })}
    </ScrollView>
  )
}
export { Redactor }
