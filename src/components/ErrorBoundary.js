import React from "react"
import { View, Text, TouchableOpacity } from "react-native"
import { theme } from "../theme"
import { t } from "../i18n"

// Límite de errores de React: atrapa las excepciones de render del árbol de abajo y muestra un fallback
// ("Algo salió mal · Reintentar") en vez de una pantalla en blanco / crash. Es class component a propósito:
// componentDidCatch / getDerivedStateFromError solo existen en clases (no hay equivalente en hooks).
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
    this.reset = this.reset.bind(this)
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // sin telemetría a la nube (privacy-first): solo log local para diagnóstico en dev.
    if (__DEV__) console.error("ErrorBoundary atrapó:", error, info && info.componentStack)
  }

  reset() {
    this.setState({ hasError: false })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 28 }}>
        <Text style={{ fontSize: 40, marginBottom: 14 }}>⚠️</Text>
        <Text style={{ fontSize: 18, fontWeight: "700", color: theme.ink, textAlign: "center", marginBottom: 8 }}>{t("err_title")}</Text>
        <Text style={{ fontSize: 14, color: theme.muted, textAlign: "center", marginBottom: 22 }}>{t("err_sub")}</Text>
        <TouchableOpacity
          onPress={this.reset}
          activeOpacity={0.85}
          style={{ backgroundColor: theme.accent, paddingHorizontal: 26, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: "#ffffff", fontSize: 15, fontWeight: "700" }}>{t("retry")}</Text>
        </TouchableOpacity>
      </View>
    )
  }
}
