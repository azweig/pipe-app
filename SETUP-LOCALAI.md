# IA local (opcional) — setup y build

Corrección de texto + transcripción de notas de voz **100% en el teléfono** (offline, privado, sin egress). Opt-in: no baja nada hasta que el usuario toca **Ajustes → 🧠 IA local → Instalar**. Si no está instalado o falla → cae al server (transparente).

## Qué se agregó (código, ya listo)
- `src/localai.js` — módulo: descarga de modelos (expo-file-system), estado (AsyncStorage), `correctLocal()` (llama.rn) y `transcribeLocal()` (whisper.rn).
- `src/components/LocalAI.js` — tarjeta de Ajustes: Instalar (con progreso) · toggles Corregir/Transcribir · Liberar espacio.
- `src/screens/Settings.js` — renderiza `<LocalAICard/>` (arriba de Transcripción).
- `src/api.js` — `correctText`/`sttFile` ahora intentan LOCAL primero (si está instalado + el toggle en ON), si no → server. **Cero cambios para los callers** (Conversation.js sigue igual).

## 1) Instalar las dependencias nativas
```bash
npx expo install llama.rn whisper.rn
# (si expo no las tiene en su matriz, usá: npm i llama.rn whisper.rn — y verificá compat con RN 0.86)
```
Son **módulos nativos** → **NO corren en Expo Go**. Necesitás un **dev build / EAS build**.

## 2) Prebuild + build
```bash
npx expo prebuild            # regenera android/ e ios/ con los módulos autolinkeados
# Android:
eas build -p android --profile development     # o: npx expo run:android
# iOS:
eas build -p ios --profile development          # o: npx expo run:ios   (Metal para GPU)
```
- **iOS:** llama.rn/whisper.rn usan Metal (GPU/ANE) automáticamente. Si el pod falla, revisá `use_frameworks!` en el Podfile.
- **Android:** funciona en CPU; para GPU (opcional) llama.rn soporta OpenCL/Vulkan según device.

## 3) Modelos (se bajan solos al tocar Instalar)
En `src/localai.js → MODELS` (editables):
- **Qwen3-0.6B Q4_K_M** (~400 MB) — corrección · `Qwen/Qwen3-0.6B-GGUF`
- **Whisper base** (~148 MB) — transcripción · `ggerganov/whisper.cpp`

## 4) ⚠️ Caveat de la transcripción (STT)
whisper.cpp espera **WAV 16 kHz mono**. La app graba **m4a**. `whisper.rn` intenta convertir, pero **si tu m4a no transcribe**, hay que pasarlo a wav 16k antes (con un decoder nativo o grabando directo en wav). La **corrección funciona sin este caveat** — es lo que probaría primero.

## 5) Probarlo
1. Build + instalá en tu teléfono.
2. Ajustes → 🧠 IA local → **Instalar** (baja ~550 MB con progreso).
3. Los toggles quedan en ON. Poné el celu en **modo avión** ✈️ y:
   - Escribí "ola komo tas vo?" → tocá enviar → debería corregir **offline**.
   - Grabá una nota con el mic IA → transcribe **offline** (si el m4a anda; ver §4).
4. **Liberar espacio** borra los modelos y vuelve al server.

## Notas
- Sin instalar / con los toggles en OFF → todo por el server, **como hoy** (cero impacto).
- Los strings de la tarjeta tienen default en español; para inglés, agregá las claves `localai_*` a `src/i18n.js` (DICT.en). La app ya cae al default si faltan.
- Primera corrección tras abrir la app = carga del modelo a memoria (~1–3s una vez); después es instantánea.
