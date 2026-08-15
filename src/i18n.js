import { useReducer, useEffect } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"

// i18n minimalista y reactivo: t(key) + useT() para re-render al cambiar idioma. Español por default, inglés disponible.
let LANG = "es"
const subs = new Set()
function detect() { try { const l = (Intl.DateTimeFormat().resolvedOptions().locale || "es").slice(0, 2).toLowerCase(); return l === "en" ? "en" : "es" } catch { return "es" } }

export const DICT = {
  es: {
    // tabs
    messages: "Mensajes", calendar: "Calendario", home: "Inicio", radar: "Radar", notes: "Notas",
    // comunes
    explore: "Explorar", settings: "Ajustes", search: "Buscar", cancel: "Cancelar", save: "Guardar", send: "Enviar", ok: "Listo", back: "Atrás", add: "Agregar", remove: "Quitar", done: "Hecho", loading: "Cargando…", retry: "Reintentar", logout: "Cerrar sesión",
    err_title: "Algo salió mal", err_sub: "Ocurrió un error inesperado. Podés reintentar.",
    // login
    login_tagline: "Tu segundo cerebro. Entrá con tu PIN.", server: "Servidor", pin: "PIN", enter: "Entrar", login_error: "PIN incorrecto",
    // inbox
    inbox: "Bandeja", search_placeholder: "Buscar por nombre, teléfono o email…", silenced: "Silenciados", no_convs: "Sin conversaciones en esta vista.", nothing_matches: "Nada coincide con la búsqueda.",
    // multi-select merge (unir contactos)
    // ── empezar una conversación con alguien que todavía no te escribió (paridad con web y escritorio) ──
    onb_title: "Configurá tu hub", onb_cta: "Configurar en la web ↗",
    // los títulos se traducen POR ID acá: esta app no tiene traductor de DOM, así que pintar el texto que manda el
    // server dejaba el checklist en español en un teléfono en inglés.
    onb_whatsapp: "Conectá WhatsApp", onb_email: "Agregá tu correo", onb_ia: "Elegí tu IA",
    ch_: "Teléfono o correo", ch_telegram: "Telegram", ch_slack: "Slack", ch_signal: "Signal", ch_teams: "Teams",
    new_chat: "Nuevo", new_chat_title: "✎ Nueva conversación",
    new_chat_sub: "Un teléfono con código de país (+51 999 111 222) o un correo. Si ya hablaste con esa persona, se abre la conversación que ya existe.",
    new_chat_ph: "+51 999 111 222  ·  alguien@empresa.com",
    new_chat_open: "Abrir conversación", new_chat_fail: "No pude resolver ese destino.",
    select: "Seleccionar", merge_selected: "Unir ({n})", merged_n: "{n} contactos unidos", merge_pick_2: "Elegí 2 o más para unir", merge_keeps: "Se conserva {name}", merging: "Uniendo…", merge_fail: "No se pudo unir — probá de nuevo",
    // 🔒 cuentas secretas
    secret_pin: "PIN", secret_hide: "Ocultar", secret_accounts: "Cuentas ocultas", secret_accounts_sub: "Marcá qué cuenta ocultar — toda su actividad se esconde sin el PIN.", secret_wa: "WhatsApp", secret_email: "Correo", secret_hide_now: "Ocultar ahora", secret_none: "—", secret_continue: "Continuar",
    secret_pin_title: "PIN", secret_enter_pin: "Ingresá tu PIN", secret_create_pin: "Creá tu PIN", secret_create_pin_sub: "6-12 dígitos, distinto al de entrada.", secret_wrong_pin: "PIN incorrecto", secret_save_fail: "No se pudo guardar (¿conexión?). Reintentá.", secret_relocked: "El PIN se cerró — ingresalo de nuevo.",
    // conversation
    message_ph: "Mensaje…", reply: "Responder", forward: "Reenviar", copy: "Copiar texto", forward_to: "Reenviar a…", reply_by: "Responder por…", ai: "IA", suggest_reply: "Sugerir respuesta", summarize_chat: "Resumir chat", pick_send: "Elegí qué enviar", corrected: "Corregido", as_typed: "Tal cual lo dijiste", other_way: "Otra forma", attach: "Adjuntar", photos_videos: "Fotos y videos", pick_multiple: "Deslizá para elegir varios", file: "Archivo", recording: "Grabando nota de voz…", dictating: "Decí tu mensaje… la IA lo pasa a texto",
    // home
    good_morning: "Buenos días", good_afternoon: "Buenas tardes", good_evening: "Buenas noches", day_brief: "TU DÍA EN BREVE", jarvis_ph: "Preguntale a Jarvis sobre tus datos…", need_reply: "NECESITAN RESPUESTA", calls: "LLAMADAS", todo: "POR HACER", promised: "PROMETISTE", today_agenda: "AGENDA DE HOY", your_goals: "TUS OBJETIVOS", your_kpis: "TUS KPIs", for_you: "PARA VOS", coach: "COACH · SUGERENCIA", listen: "Escuchar", devolver: "Devolver", draft_ai: "Borrador IA", view_week: "Ver semana", missed_call: "Llamada perdida", called_you: "Te llamó", suggestion: "Ver sugerencia",
    // radar
    radar_sub: "La IA vigila tus mensajes y te avisa qué atender. Lo urgente de hoy vive en Inicio 🏠.", no_reply: "No te contestaron", asked_you: "Te preguntaron y no respondiste", reconnect: "Reconectar", opportunities: "Oportunidades", reminders: "Recordatorios", later: "Después", no: "No", nothing_radar: "Nada en el radar ahora — lo urgente ya está en Inicio 🏠.",
    pending_count: "cosas pendientes", worth_today: "vale la pena hoy", start_here: "EMPEZÁ POR ACÁ", view_send: "Ver y enviar", suggested_plan: "PLAN SUGERIDO", schedule_all: "Agendar todo", waiting_you: "ESPERAN DE VOS", view_all: "Ver todos", worth_looking: "VALE LA PENA MIRAR", write_action: "Escribir", schedule_20: "Agendar 20 min", waiting_since: "espera desde hace", scheduled_ok: "Agendado",
    // notes
    notes_summary: "RESUMEN DE TUS NOTAS", ai_thinks: "LA IA PIENSA", talk_brain: "Hablá con tu cerebro", brain_ph: "Escribí a tu segundo cerebro…", all: "Todo", junk: "Junk", pin_note: "Fijar", archive: "Archivar", discard: "Descartar", no_notes: "No hay notas en esta categoría.",
    notes_sub: "Todo lo que mandás, ya entendido.", detected_actions: "ACCIONES DETECTADAS", expand: "Ampliar", steps: "Ver pasos", shopping_list: "Lista de compras", why: "Ver por qué", dismiss: "Descartar", sent_you: "Te lo enviaste", ask_brain: "Preguntar", notes_tab: "Notas", today: "hoy", to_alarm: "Recordarme",
    cat_salud: "Salud", cat_receta: "Receta", cat_finanzas: "Finanzas", cat_trabajo: "Trabajo", cat_idea: "Idea", cat_compras: "Compras", cat_viaje: "Viaje", cat_noticia: "Noticia", cat_educacion: "Educación", cat_link: "Link para leer", cat_personal: "Personal", cat_otro: "Nota",
    verdict_hoax: "Probable hoax", verdict_dudoso: "Dudoso", verdict_ok: "Verificado",
    // profile
    who_is: "QUIÉN ES", responds: "responde", in_common: "en común", know_each: "se conocen", talk_about: "DE QUÉ HABLAN", common: "EN COMÚN", groups: "Grupos", people: "Personas", channels: "CANALES", schedule: "Agendar", explore_ph: "Preguntá algo más sobre esta persona…",
    generate_graph: "Generar grafify completo", generating: "Generando el grafify…", regenerate: "Regenerar", link_contact_btn: "Vincular", same_person: "Es la misma persona", merge: "Unir", merged_ok: "Contactos unidos", merge_hint: "Uní los canales de la misma persona en un solo perfil.", pick_to_merge: "Buscá otro contacto para unir…", messages_by_channel: "MENSAJES", no_messages: "Sin mensajes en este canal.", suggestions: "Sugerencias", confidence: "confianza",
    // calendar
    day: "Día", work: "Laboral", week: "Semana", today_lower: "hoy", events: "eventos", free: "libre", busy: "ocupado", no_events: "Sin eventos en este período.", join: "Unirse a", participants: "PARTICIPANTES", place: "LUGAR", detail: "DETALLE", cancel_meeting: "Cancelar reunión", meeting_alarm: "Ponerme una alarma para esta reunión",
    // alarms
    alarms: "Alarmas", new_alarm: "Nueva", datetime: "Hora", alarm_label: "Etiqueta (ej: Llamar al banco)", link_contact: "Ligar a un contacto (opcional)", set_alarm: "Poner alarma", no_alarms: "Sin alarmas. Tocá \"+ Nueva\".", alarm_set: "Alarma puesta", could_not: "No se pudo",
    alarm_repeat: "Repetir", rep_once: "Una vez", rep_daily: "Cada día", rep_weekdays: "Lun a Vie", rep_weekends: "Fin de semana", rep_weekly: "Semanal", alarm_date: "Fecha",
    alarm_tone: "Tono", tone_sys: "Sistema", tone_beep: "Beep", tone_chime: "Campana", tone_pulse: "Pulso", tone_silent: "Silencio",
    // settings
    your_hub: "Tu hub", email_accounts: "CUENTAS DE CORREO", add_email: "Agregar cuenta de correo", ai_engine: "MOTOR DE IA", add_key: "Agregar key (OpenAI/Claude/Gemini)", transcription: "TRANSCRIPCIÓN (STT)", stt_local: "Local (whisper.cpp) — privado, nunca sale", stt_cloud: "OpenAI Whisper (nube)", voice: "VOZ (te habla el resumen)", notifications: "NOTIFICACIONES", quiet_hours: "Horas de silencio (no molestar)", from: "Desde", to: "Hasta", security: "SEGURIDAD", change_pin: "Cambiar PIN de acceso", create_pin: "Crear PIN de acceso", language: "IDIOMA", test: "Probar",
    // mensajería / canales
    ch_title: "MENSAJERÍA / CANALES", ch_add_account: "＋ Agregar cuenta", ch_connect: "Conectar", ch_connected: "Conectado", ch_read_only: "solo lectura",
    ch_connected_sg: "conectada", ch_connected_pl: "conectadas", ch_no_accounts: "Sin cuentas todavía", ch_revincula: "revinculá", ch_disconnect: "Desconectar",
    ch_secret_on: "🔒 secreta", ch_secret_off: "☐ secreta",
    ch_phone_ph: "+51 999 000 000 (con código de país)", ch_need_phone: "Poné el número primero, con código de país.", ch_generating: "Generando… puede tardar ~30s. No cierres esto.",
    ch_code_by_phone: "Código por número", ch_qr: "QR", ch_link_with_number: "En la app → Dispositivos vinculados → Vincular con número:",
    ch_wa_instr: "En tu teléfono: WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo → escaneá el QR (o poné el código).",
    ch_ig_instr: "Vinculá tu cuenta de Instagram por el bridge del servidor: apretá QR y escaneá con tu app (o usá el código por número). Puede tardar ~30s.",
    ch_fb_instr: "Vinculá tu cuenta de Facebook/Messenger por el bridge del servidor: apretá QR y escaneá (o usá el código por número). Puede tardar ~30s.",
    ch_li_instr: "Vinculá tu cuenta de LinkedIn por el bridge del servidor: apretá QR y escaneá (o usá el código por número). Puede tardar ~30s.",
    ch_discord_sub: "El QR de Discord suele fallar. Lo confiable es tu token.", ch_discord_hint_title: "🔑 ¿Cómo saco mi token?",
    ch_discord_hint: "1) Abrí discord.com en el navegador (logueado).  2) Apretá F12 → pestaña Network.  3) Hacé cualquier acción; abrí un request y buscá el header authorization.  4) Copiá ese valor y pegalo abajo.",
    ch_discord_ph: "Pegá tu token de Discord acá", ch_link_token: "Vincular con token", ch_paste_token_first: "Pegá el token primero.", ch_linking: "Vinculando…",
    ch_tg_short: "Teléfono + código", ch_tg_sub: "Poné tu teléfono; Telegram te manda un código a tu app para confirmar (solo lectura de tus chats).",
    ch_tg_api_note: "Primera vez: sacá el API ID y API Hash en my.telegram.org → API development tools.", ch_tg_apiid_ph: "API ID (número)", ch_tg_apihash_ph: "API Hash",
    ch_send_code: "Enviar código", ch_sending: "Enviando…", ch_tg_need_phone: "Poné tu teléfono con código de país.", ch_tg_start_fail: "No se pudo iniciar.",
    ch_tg_code_sub: "Telegram te mandó un código a tu app (no por SMS). Escribilo acá.", ch_code_ph: "1 2 3 4 5", ch_confirm: "Confirmar", ch_need_code: "Escribí el código.", ch_verifying: "Verificando…",
    ch_tg_pw_sub: "Tenés verificación en 2 pasos en Telegram. Poné tu contraseña de 2 pasos.", ch_tg_pw_ph: "Contraseña de 2 pasos", ch_tg_connected: "✓ ¡Telegram conectado!", ch_tg_login_err: "Error en el login. Reintentá.",
    ch_slack_sub: "Con token de app (xoxp/xoxb)", ch_slack_help: "Trae tus DMs y canales a la bandeja. Creá una app en api.slack.com/apps, agregá scopes de lectura (channels:history, im:history, users:read…) e instalala; copiá el User OAuth Token.",
    ch_slack_ph: "Pegá tu token de Slack (xoxp-… o xoxb-…)", ch_slack_connect: "Conectar Slack", ch_slack_ok: "✓ Slack conectado", ch_slack_fail: "No se pudo conectar.", ch_slack_confirm: "¿Desconectar Slack?",
    ch_signal_sub: "signal-cli-rest-api en tu server", ch_signal_help: "Se une al mismo hilo que WhatsApp/SMS de cada contacto. Necesitás signal-cli-rest-api corriendo en tu servidor. Poné su URL y tu número.",
    ch_signal_url_ph: "http://localhost:8080", ch_signal_num_ph: "+51 999 000 000", ch_signal_connect: "Conectar Signal", ch_signal_ok: "✓ Signal conectado", ch_signal_fail: "No se pudo guardar.", ch_signal_need: "Completá la URL y tu número.", ch_signal_confirm: "¿Desconectar Signal?",
    ch_server_note: "Otros canales se conectan desde el servidor de tu hub: Microsoft 365 (Outlook/Teams entran como correo vía Graph), Notion y Google Calendar/Drive.",
    // piloto automático — qué escalar (global)
    ap_escalate_title: "Qué escala el piloto", ap_escalate_help: "El piloto responde todo, MENOS estos temas — esos te los deja a vos.", ap_custom_label: "OTROS TEMAS (separados por coma)", ap_custom_ph: "ej: contratos, mudanza, viaje familiar", ap_saved: "Guardado. El piloto te escalará estos temas.",
    ap_preset_money: "Plata / pagos", ap_preset_resign: "Renuncias", ap_preset_hire: "Contrataciones", ap_preset_meeting: "Reuniones o llamadas con hora", ap_preset_appointment: "Citas / turnos", ap_preset_legal: "Temas legales", ap_preset_emotional: "Temas personales serios", ap_preset_health: "Salud",
    // enriquecimiento social (Apify) — ajustes
    apify_title: "Enriquecimiento (Apify)", apify_help: "Perfiles sociales anónimos (no usa tus cookies). Cargá una o varias cuentas Apify — rota entre ellas y si una llega al límite mensual pasa a la siguiente.", apify_add: "Agregar cuenta Apify", apify_exhausted: "AGOTADA", apify_name_ph: "Nombre (ej: Cuenta 1)", apify_token_ph: "Token de Apify (apify_api_…)", apify_runs: "corridas", apify_added: "Cuenta agregada.", apify_none: "Sin cuentas. Agregá una para investigar perfiles.", apify_need_fields: "Poné un nombre y el token.",
    // enriquecimiento social — perfil de contacto
    social_profiles: "PERFILES SOCIALES", social_hint: "Pegá los links de sus perfiles. Investigar los abre de forma anónima (sin tus cookies).", investigate: "Investigar", investigating: "Investigando…", interests_hd: "INTERESES", sources_hd: "Fuentes", relationships_hd: "RELACIONES",
  },
  en: {
    messages: "Messages", calendar: "Calendar", home: "Home", radar: "Radar", notes: "Notes",
    explore: "Explore", settings: "Settings", search: "Search", cancel: "Cancel", save: "Save", send: "Send", ok: "Done", back: "Back", add: "Add", remove: "Remove", done: "Done", loading: "Loading…", retry: "Retry", logout: "Log out",
    err_title: "Something went wrong", err_sub: "An unexpected error occurred. You can try again.",
    login_tagline: "Your second brain. Enter with your PIN.", server: "Server", pin: "PIN", enter: "Enter", login_error: "Wrong PIN",
    inbox: "Inbox", search_placeholder: "Search by name, phone or email…", silenced: "Silenced", no_convs: "No conversations in this view.", nothing_matches: "Nothing matches your search.",
    onb_title: "Set up your hub", onb_cta: "Set up on the web ↗",
    onb_whatsapp: "Connect WhatsApp", onb_email: "Add your email", onb_ia: "Choose your AI",
    ch_: "Phone or email", ch_telegram: "Telegram", ch_slack: "Slack", ch_signal: "Signal", ch_teams: "Teams",
    new_chat: "New", new_chat_title: "✎ New conversation",
    new_chat_sub: "A phone number with country code (+1 555 111 222) or an email address. If you've already talked to them, the existing conversation opens.",
    new_chat_ph: "+1 555 111 222  ·  someone@company.com",
    new_chat_open: "Open conversation", new_chat_fail: "I couldn't resolve that destination.",
    select: "Select", merge_selected: "Merge ({n})", merged_n: "{n} contacts merged", merge_pick_2: "Pick 2 or more to merge", merge_keeps: "Keeps {name}", merging: "Merging…", merge_fail: "Couldn't merge — try again",
    secret_pin: "PIN", secret_hide: "Hide", secret_accounts: "Hidden accounts", secret_accounts_sub: "Choose which account to hide — all its activity is hidden without the PIN.", secret_wa: "WhatsApp", secret_email: "Email", secret_hide_now: "Hide now", secret_none: "—", secret_continue: "Continue",
    secret_pin_title: "PIN", secret_enter_pin: "Enter your PIN", secret_create_pin: "Create your PIN", secret_create_pin_sub: "6-12 digits, different from your entry PIN.", secret_wrong_pin: "Wrong PIN", secret_save_fail: "Couldn't save (connection?). Try again.", secret_relocked: "The PIN locked — enter it again.",
    message_ph: "Message…", reply: "Reply", forward: "Forward", copy: "Copy text", forward_to: "Forward to…", reply_by: "Reply via…", ai: "AI", suggest_reply: "Suggest reply", summarize_chat: "Summarize chat", pick_send: "Choose what to send", corrected: "Corrected", as_typed: "As you said it", other_way: "Another way", attach: "Attach", photos_videos: "Photos and videos", pick_multiple: "Swipe to pick several", file: "File", recording: "Recording voice note…", dictating: "Say your message… AI turns it into text",
    good_morning: "Good morning", good_afternoon: "Good afternoon", good_evening: "Good evening", day_brief: "YOUR DAY AT A GLANCE", jarvis_ph: "Ask Jarvis about your data…", need_reply: "NEED A REPLY", calls: "CALLS", todo: "TO DO", promised: "YOU PROMISED", today_agenda: "TODAY'S AGENDA", your_goals: "YOUR GOALS", your_kpis: "YOUR KPIs", for_you: "FOR YOU", coach: "COACH · SUGGESTION", listen: "Listen", devolver: "Call back", draft_ai: "AI draft", view_week: "See week", missed_call: "Missed call", called_you: "Called you", suggestion: "See suggestion",
    radar_sub: "AI watches your messages and tells you what to handle. Today's urgent lives in Home 🏠.", no_reply: "They didn't reply", asked_you: "They asked and you didn't reply", reconnect: "Reconnect", opportunities: "Opportunities", reminders: "Reminders", later: "Later", no: "No", nothing_radar: "Nothing on the radar now — urgent stuff is in Home 🏠.",
    notes_summary: "SUMMARY OF YOUR NOTES", ai_thinks: "THE AI THINKS", talk_brain: "Talk to your brain", brain_ph: "Write to your second brain…", all: "All", junk: "Junk", pin_note: "Pin", archive: "Archive", discard: "Discard", no_notes: "No notes in this category.",
    notes_sub: "Everything you send, already understood.", detected_actions: "DETECTED ACTIONS", expand: "Expand", steps: "See steps", shopping_list: "Shopping list", why: "See why", dismiss: "Dismiss", sent_you: "You sent it", ask_brain: "Ask", notes_tab: "Notes", today: "today", to_alarm: "Remind me",
    cat_salud: "Health", cat_receta: "Recipe", cat_finanzas: "Finance", cat_trabajo: "Work", cat_idea: "Idea", cat_compras: "Shopping", cat_viaje: "Travel", cat_noticia: "News", cat_educacion: "Learning", cat_link: "Link to read", cat_personal: "Personal", cat_otro: "Note",
    verdict_hoax: "Likely hoax", verdict_dudoso: "Doubtful", verdict_ok: "Verified",
    who_is: "WHO THEY ARE", responds: "replies", in_common: "in common", know_each: "known for", talk_about: "WHAT YOU TALK ABOUT", common: "IN COMMON", groups: "Groups", people: "People", channels: "CHANNELS", schedule: "Schedule", explore_ph: "Ask something else about this person…",
    generate_graph: "Generate full graph", generating: "Generating the graph…", regenerate: "Regenerate", link_contact_btn: "Link", same_person: "Same person", merge: "Merge", merged_ok: "Contacts merged", merge_hint: "Merge the channels of the same person into one profile.", pick_to_merge: "Search another contact to merge…", messages_by_channel: "MESSAGES", no_messages: "No messages in this channel.", suggestions: "Suggestions", confidence: "confidence",
    day: "Day", work: "Work", week: "Week", today_lower: "today", events: "events", free: "free", busy: "busy", no_events: "No events in this period.", join: "Join", participants: "PARTICIPANTS", place: "PLACE", detail: "DETAILS", cancel_meeting: "Cancel meeting", meeting_alarm: "Set an alarm for this meeting",
    alarms: "Alarms", new_alarm: "New", datetime: "Time", alarm_label: "Label (e.g. Call the bank)", link_contact: "Link to a contact (optional)", set_alarm: "Set alarm", no_alarms: "No alarms. Tap \"+ New\".", alarm_set: "Alarm set", could_not: "Couldn't do it",
    alarm_repeat: "Repeat", rep_once: "Once", rep_daily: "Every day", rep_weekdays: "Mon–Fri", rep_weekends: "Weekends", rep_weekly: "Weekly", alarm_date: "Date",
    alarm_tone: "Tone", tone_sys: "System", tone_beep: "Beep", tone_chime: "Chime", tone_pulse: "Pulse", tone_silent: "Silent",
    your_hub: "Your hub", email_accounts: "EMAIL ACCOUNTS", add_email: "Add email account", ai_engine: "AI ENGINE", add_key: "Add key (OpenAI/Claude/Gemini)", transcription: "TRANSCRIPTION (STT)", stt_local: "Local (whisper.cpp) — private, never leaves", stt_cloud: "OpenAI Whisper (cloud)", voice: "VOICE (reads your summary)", notifications: "NOTIFICATIONS", quiet_hours: "Quiet hours (do not disturb)", from: "From", to: "To", security: "SECURITY", change_pin: "Change access PIN", create_pin: "Create access PIN", language: "LANGUAGE", test: "Test",
    ch_title: "MESSAGING / CHANNELS", ch_add_account: "＋ Add account", ch_connect: "Connect", ch_connected: "Connected", ch_read_only: "read-only",
    ch_connected_sg: "connected", ch_connected_pl: "connected", ch_no_accounts: "No accounts yet", ch_revincula: "re-link", ch_disconnect: "Disconnect",
    ch_secret_on: "🔒 secret", ch_secret_off: "☐ secret",
    ch_phone_ph: "+1 555 000 0000 (with country code)", ch_need_phone: "Enter the number first, with country code.", ch_generating: "Generating… may take ~30s. Don't close this.",
    ch_code_by_phone: "Code by phone", ch_qr: "QR", ch_link_with_number: "In the app → Linked devices → Link with phone number:",
    ch_wa_instr: "On your phone: WhatsApp → Settings → Linked devices → Link a device → scan the QR (or enter the code).",
    ch_ig_instr: "Link your Instagram account via the server bridge: tap QR and scan with your app (or use the code by number). May take ~30s.",
    ch_fb_instr: "Link your Facebook/Messenger account via the server bridge: tap QR and scan (or use the code by number). May take ~30s.",
    ch_li_instr: "Link your LinkedIn account via the server bridge: tap QR and scan (or use the code by number). May take ~30s.",
    ch_discord_sub: "Discord's QR often fails. Your token is the reliable way.", ch_discord_hint_title: "🔑 How do I get my token?",
    ch_discord_hint: "1) Open discord.com in your browser (logged in).  2) Press F12 → Network tab.  3) Do any action; open a request and find the authorization header.  4) Copy that value and paste it below.",
    ch_discord_ph: "Paste your Discord token here", ch_link_token: "Link with token", ch_paste_token_first: "Paste the token first.", ch_linking: "Linking…",
    ch_tg_short: "Phone + code", ch_tg_sub: "Enter your phone; Telegram sends a code to your app to confirm (read-only access to your chats).",
    ch_tg_api_note: "First time: get the API ID and API Hash at my.telegram.org → API development tools.", ch_tg_apiid_ph: "API ID (number)", ch_tg_apihash_ph: "API Hash",
    ch_send_code: "Send code", ch_sending: "Sending…", ch_tg_need_phone: "Enter your phone with country code.", ch_tg_start_fail: "Couldn't start.",
    ch_tg_code_sub: "Telegram sent a code to your app (not by SMS). Type it here.", ch_code_ph: "1 2 3 4 5", ch_confirm: "Confirm", ch_need_code: "Type the code.", ch_verifying: "Verifying…",
    ch_tg_pw_sub: "You have 2-step verification on Telegram. Enter your 2-step password.", ch_tg_pw_ph: "2-step password", ch_tg_connected: "✓ Telegram connected!", ch_tg_login_err: "Login error. Try again.",
    ch_slack_sub: "With app token (xoxp/xoxb)", ch_slack_help: "Brings your DMs and channels to the inbox. Create an app at api.slack.com/apps, add read scopes (channels:history, im:history, users:read…) and install it; copy the User OAuth Token.",
    ch_slack_ph: "Paste your Slack token (xoxp-… or xoxb-…)", ch_slack_connect: "Connect Slack", ch_slack_ok: "✓ Slack connected", ch_slack_fail: "Couldn't connect.", ch_slack_confirm: "Disconnect Slack?",
    ch_signal_sub: "signal-cli-rest-api on your server", ch_signal_help: "Joins the same thread as each contact's WhatsApp/SMS. You need signal-cli-rest-api running on your server. Enter its URL and your number.",
    ch_signal_url_ph: "http://localhost:8080", ch_signal_num_ph: "+1 555 000 0000", ch_signal_connect: "Connect Signal", ch_signal_ok: "✓ Signal connected", ch_signal_fail: "Couldn't save.", ch_signal_need: "Fill in the URL and your number.", ch_signal_confirm: "Disconnect Signal?",
    ch_server_note: "Other channels connect from your hub's server: Microsoft 365 (Outlook/Teams come in as email via Graph), Notion and Google Calendar/Drive.",
    ap_escalate_title: "What the autopilot escalates", ap_escalate_help: "The autopilot answers everything EXCEPT these topics — those it leaves to you.", ap_custom_label: "OTHER TOPICS (comma-separated)", ap_custom_ph: "e.g. contracts, moving, family trip", ap_saved: "Saved. The autopilot will escalate these topics to you.",
    ap_preset_money: "Money / payments", ap_preset_resign: "Resignations", ap_preset_hire: "Hirings", ap_preset_meeting: "Meetings / calls", ap_preset_appointment: "Appointments", ap_preset_legal: "Legal matters", ap_preset_emotional: "Serious personal", ap_preset_health: "Health",
    apify_title: "Enrichment (Apify)", apify_help: "Anonymous social profiles (doesn't use your cookies). Load one or more Apify accounts — it rotates between them and if one hits the monthly limit it moves to the next.", apify_add: "Add Apify account", apify_exhausted: "EXHAUSTED", apify_name_ph: "Name (e.g. Account 1)", apify_token_ph: "Apify token (apify_api_…)", apify_runs: "runs", apify_added: "Account added.", apify_none: "No accounts. Add one to investigate profiles.", apify_need_fields: "Enter a name and the token.",
    social_profiles: "SOCIAL PROFILES", social_hint: "Paste their profile links. Investigate opens them anonymously (without your cookies).", investigate: "Investigate", investigating: "Investigating…", interests_hd: "INTERESTS", sources_hd: "Sources", relationships_hd: "RELATIONSHIPS",
  },
}

export function getLang() { return LANG }
export async function initLang() { try { const s = await AsyncStorage.getItem("lang"); LANG = s || detect() } catch { LANG = detect() } subs.forEach((f) => f()) }
export async function setLang(l) { LANG = l; try { await AsyncStorage.setItem("lang", l) } catch {} subs.forEach((f) => f()) }
// t(clave) → texto. Si la clave NO existe devuelve "" (no la clave), y por eso el patrón `t("x") || "Texto por defecto"`
// funciona: antes devolvía la propia clave, que es un string truthy, así que el `||` no disparaba NUNCA y tres secciones
// enteras de Ajustes mostraban en pantalla `council_title`, `train_help`, `COUNCIL_CHAIRMAN`… en español y en inglés.
// El fallback explícito del llamador es la fuente de verdad cuando falta la traducción.
export function t(key, vars) {
  let s = (DICT[LANG] && DICT[LANG][key] != null) ? DICT[LANG][key] : (DICT.es[key] != null ? DICT.es[key] : "")
  if (vars) for (const k in vars) s = s.split("{" + k + "}").join(vars[k])
  return s
}
export function useT() { const [, force] = useReducer((x) => x + 1, 0); useEffect(() => { subs.add(force); return () => { subs.delete(force) } }, []); return t }
