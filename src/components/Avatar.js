import React, { useState, useEffect } from "react"
import { View, Text, Image } from "react-native"
import { initials, color } from "../util"
import { mediaSource } from "../api"
import { theme } from "../theme"

// Foto real del contacto si existe (WhatsApp/agenda); si no hay o falla, cae a la inicial con color estable.
export default function Avatar({ name, photo, size = 50, square = false }) {
  const [err, setErr] = useState(false)
  useEffect(() => { setErr(false) }, [photo])
  const src = photo && !err ? mediaSource(photo) : null
  const radius = square ? Math.round(size * 0.28) : size / 2
  if (src) {
    return <Image source={src} onError={() => setErr(true)} style={{ width: size, height: size, borderRadius: radius, backgroundColor: theme.line }} />
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: color(name || ""), justifyContent: "center", alignItems: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: Math.round(size * 0.34) }}>{initials(name)}</Text>
    </View>
  )
}
