// Categorías gráficas de notas: catkey (del backend) → ícono + color + clave i18n de la etiqueta.
// El backend clasifica cada nota con uno de estos catkey fijos; acá le damos identidad visual.
export const CAT_META = {
  salud:     { icon: "⚕️", color: "#ef4444", labelKey: "cat_salud" },
  receta:    { icon: "🍳", color: "#f59e0b", labelKey: "cat_receta" },
  finanzas:  { icon: "💸", color: "#16a34a", labelKey: "cat_finanzas" },
  trabajo:   { icon: "💼", color: "#6366f1", labelKey: "cat_trabajo" },
  idea:      { icon: "💡", color: "#eab308", labelKey: "cat_idea" },
  compras:   { icon: "🛒", color: "#0d9488", labelKey: "cat_compras" },
  viaje:     { icon: "✈️", color: "#0ea5e9", labelKey: "cat_viaje" },
  noticia:   { icon: "📰", color: "#64748b", labelKey: "cat_noticia" },
  educacion: { icon: "📚", color: "#8b5cf6", labelKey: "cat_educacion" },
  link:      { icon: "🔗", color: "#3b82f6", labelKey: "cat_link" },
  personal:  { icon: "🙂", color: "#ec4899", labelKey: "cat_personal" },
  otro:      { icon: "📌", color: "#8a8a97", labelKey: "cat_otro" },
}
export function catMeta(catkey) { return CAT_META[catkey] || CAT_META.otro }

// Veredicto hoax/certeza → estilo. Solo hoax/dudoso se muestran como alerta; verificado es un sello sutil.
export const VERDICT_META = {
  hoax:       { icon: "⚠️", color: "#ef4444", labelKey: "verdict_hoax", alert: true },
  dudoso:     { icon: "⚠️", color: "#f59e0b", labelKey: "verdict_dudoso", alert: true },
  verificado: { icon: "✓", color: "#16a34a", labelKey: "verdict_ok", alert: false },
}
export function verdictMeta(nivel) { return VERDICT_META[nivel] || null }

// parse seguro de JSON de la DB (actions/verdict llegan como string o ya objeto)
export function pj(v, fallback) { if (v == null) return fallback; if (typeof v !== "string") return v; try { return JSON.parse(v) } catch { return fallback } }
