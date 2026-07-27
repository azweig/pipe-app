import React from "react"
import { View, Text } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"

// Pantallas de tabs todavía no migradas a nativo (Calendario/Inicio/Radar/Notas). Se van completando una por una.
export default function Placeholder({ route }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center", alignItems: "center", padding: 34, paddingTop: insets.top }}>
      <Text style={{ fontSize: 46, marginBottom: 14 }}>🚧</Text>
      <Text style={{ fontSize: 20, fontWeight: "700", color: theme.ink }}>{route.name}</Text>
      <Text style={{ color: theme.muted, marginTop: 8, textAlign: "center", lineHeight: 21 }}>
        En camino en la app nativa. Estoy migrando los tabs uno por uno — Mensajes ya está listo.
      </Text>
    </View>
  )
}
