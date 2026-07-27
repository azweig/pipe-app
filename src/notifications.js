import * as Notifications from "expo-notifications"
import { Platform } from "react-native"

// mostrar la notificación aunque la app esté en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
})

// ── TONOS ── cada uno es un canal Android con su sonido (el sonido del canal es inmutable una vez creado).
// file: nombre del recurso en res/raw (y asset para preview). channel: id del canal. null = silencio.
export const ALARM_TONES = [
  { id: "sys", nameKey: "tone_sys", channel: "alarm-sys", file: null, sound: "default" },
  { id: "beep", nameKey: "tone_beep", channel: "alarm-beep", file: "alarm_beep", sound: "alarm_beep.mp3" },
  { id: "chime", nameKey: "tone_chime", channel: "alarm-chime", file: "alarm_chime", sound: "alarm_chime.mp3" },
  { id: "pulse", nameKey: "tone_pulse", channel: "alarm-pulse", file: "alarm_pulse", sound: "alarm_pulse.mp3" },
  { id: "silent", nameKey: "tone_silent", channel: "alarm-silent", file: null, sound: null },
]
export function toneById(id) { return ALARM_TONES.find((t) => t.id === id) || ALARM_TONES[0] }

// assets para el preview (expo-audio). require estático para que Metro los empaquete.
export const TONE_ASSETS = {
  beep: require("../assets/sounds/alarm_beep.mp3"),
  chime: require("../assets/sounds/alarm_chime.mp3"),
  pulse: require("../assets/sounds/alarm_pulse.mp3"),
}

export async function setupNotifications() {
  if (Platform.OS !== "android") return
  const V = [0, 400, 250, 400]
  // canal de recordatorios (legacy)
  await Notifications.setNotificationChannelAsync("reminders", {
    name: "Recordatorios", importance: Notifications.AndroidImportance.HIGH, sound: "default", vibrationPattern: [0, 250, 250, 250],
  }).catch(() => {})
  // un canal por tono de alarma (importancia MAX → suena y salta como despertador)
  for (const t of ALARM_TONES) {
    await Notifications.setNotificationChannelAsync(t.channel, {
      name: "Alarma · " + t.id,
      importance: Notifications.AndroidImportance.MAX,
      sound: t.sound === null ? null : t.sound, // string "default"/"file.mp3" → sonido; null → silencio
      vibrationPattern: V,
      enableVibrate: true,
      bypassDnd: false,
    }).catch(() => {})
  }
}

export async function ensureNotifPerms() {
  const s = await Notifications.getPermissionsAsync()
  if (s.granted) return true
  const r = await Notifications.requestPermissionsAsync()
  return !!r.granted
}

// programa un recordatorio local a los `seconds` segundos (usado por otras vistas).
export async function scheduleReminder({ title, body, seconds, data }) {
  const ok = await ensureNotifPerms()
  if (!ok) return { error: "Necesito permiso de notificaciones (Ajustes de Android)." }
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: "default", data: data || {} },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round(seconds)), channelId: "reminders" },
    })
    return { ok: true, id }
  } catch (e) { return { error: e.message || "no pude programar" } }
}

const ST = () => Notifications.SchedulableTriggerInputTypes
// expo: weekday 1=domingo … 7=sábado
const WEEKDAY_SETS = {
  weekdays: [2, 3, 4, 5, 6], // lun–vie
  weekends: [1, 7],          // dom, sáb
}

// próxima ocurrencia (ms) de una hora dada según la repetición — para ordenar/mostrar la lista
export function nextFire({ repeat, hour, minute, weekday, dateMs }) {
  if (repeat === "once") return dateMs || 0
  const now = new Date()
  const cand = new Date(); cand.setSeconds(0, 0); cand.setHours(hour, minute, 0, 0)
  const okDay = (d) => {
    const w = d.getDay() + 1 // 1..7
    if (repeat === "daily") return true
    if (repeat === "weekly") return w === weekday
    if (repeat === "weekdays") return WEEKDAY_SETS.weekdays.includes(w)
    if (repeat === "weekends") return WEEKDAY_SETS.weekends.includes(w)
    return true
  }
  for (let i = 0; i < 8; i++) {
    const d = new Date(cand); d.setDate(cand.getDate() + i)
    if (d.getTime() > now.getTime() && okDay(d)) return d.getTime()
  }
  return cand.getTime()
}

// ALARMA (tipo despertador): hora exacta + repetición + tono. Devuelve {ok, ids:[]} (L-V = 5 notifs semanales).
export async function scheduleAt({ title, body, date, data, tone, repeat }) {
  const ok = await ensureNotifPerms()
  if (!ok) return { error: "Necesito permiso de notificaciones (Ajustes de Android)." }
  const T = toneById(tone || "sys")
  const rep = repeat || "once"
  const hour = date.getHours(), minute = date.getMinutes()
  const weekday = date.getDay() + 1
  const groupId = "alarm-" + Date.now() + "-" + Math.floor(Math.random() * 1e5)
  const content = {
    title: title || "⏰ Alarma", body: body || "",
    sound: T.sound === null ? false : (T.file ? T.sound : "default"),
    data: { alarm: true, groupId, repeat: rep, tone: T.id, hour, minute, weekday, label: title || "", ...(data || {}) },
  }
  const base = { channelId: T.channel }
  let triggers = []
  if (rep === "once") {
    if (!(date instanceof Date) || date.getTime() <= Date.now() + 1000) return { error: "Elegí una fecha/hora futura." }
    content.data.dateMs = date.getTime()
    triggers = [{ type: ST().DATE, date, ...base }]
  } else if (rep === "daily") {
    triggers = [{ type: ST().DAILY, hour, minute, ...base }]
  } else if (rep === "weekly") {
    triggers = [{ type: ST().WEEKLY, weekday, hour, minute, ...base }]
  } else if (rep === "weekdays" || rep === "weekends") {
    triggers = WEEKDAY_SETS[rep].map((w) => ({ type: ST().WEEKLY, weekday: w, hour, minute, ...base }))
  }
  try {
    const ids = []
    for (const trigger of triggers) {
      const id = await Notifications.scheduleNotificationAsync({ content, trigger })
      ids.push(id)
    }
    return { ok: true, ids }
  } catch (e) { return { error: e.message || "no pude programar" } }
}

// lista agrupada: colapsa las N notifs de una repetición en una sola fila (por groupId)
export async function listAlarms() {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync()
    const groups = {}
    for (const n of all) {
      const d = n.content?.data || {}
      if (!d.alarm) continue
      const gid = d.groupId || n.identifier
      if (!groups[gid]) {
        groups[gid] = {
          id: gid, ids: [], title: n.content?.title, body: n.content?.body, data: d,
          repeat: d.repeat || "once", tone: d.tone || "sys", hour: d.hour ?? 0, minute: d.minute ?? 0,
          ts: nextFire({ repeat: d.repeat || "once", hour: d.hour ?? 0, minute: d.minute ?? 0, weekday: d.weekday, dateMs: d.dateMs }),
        }
      }
      groups[gid].ids.push(n.identifier)
    }
    return Object.values(groups).sort((a, b) => a.ts - b.ts)
  } catch { return [] }
}

// cancela toda la repetición (todas las notifs de ese groupId)
export async function cancelAlarm(idOrGroup) {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync()
    const toKill = all.filter((n) => n.identifier === idOrGroup || (n.content?.data?.groupId === idOrGroup))
    if (!toKill.length) { await Notifications.cancelScheduledNotificationAsync(idOrGroup); return }
    for (const n of toKill) await Notifications.cancelScheduledNotificationAsync(n.identifier)
  } catch {}
}

// opciones rápidas → segundos desde ahora
export function reminderPresets() {
  const now = new Date()
  const at = (h, m, addDays = 0) => { const d = new Date(now); d.setDate(d.getDate() + addDays); d.setHours(h, m, 0, 0); return (d - now) / 1000 }
  const out = [
    { label: "En 1 hora", secs: 3600 },
    { label: "En 3 horas", secs: 3 * 3600 },
  ]
  if (now.getHours() < 18) out.push({ label: "Hoy 18:00", secs: at(18, 0) })
  out.push({ label: "Mañana 9:00", secs: at(9, 0, 1) })
  out.push({ label: "En 2 días 9:00", secs: at(9, 0, 2) })
  return out.filter((o) => o.secs > 30)
}
