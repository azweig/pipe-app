import React, { useState } from "react"
import { View, Text, Image, TouchableOpacity } from "react-native"
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio"
import { useVideoPlayer, VideoView } from "expo-video"
import { mediaSource } from "../api"
import { theme } from "../theme"

const fmtDur = (s) => { if (!s || !isFinite(s)) return ""; s = Math.round(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") }

// AUDIO (nota de voz) — play/pause con expo-audio; el header de auth va en la source.
function AudioMsg({ source, out, summary }) {
  const player = useAudioPlayer(source)
  const status = useAudioPlayerStatus(player)
  const playing = status?.playing
  const dur = status?.duration || 0
  const cur = status?.currentTime || 0
  const pct = dur ? Math.min(1, cur / dur) : 0
  const toggle = () => { if (playing) player.pause(); else { if (status?.didJustFinish || cur >= dur) player.seekTo(0); player.play() } }
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minWidth: 190 }}>
        <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.accent, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 16 }}>{playing ? "❚❚" : "▶"}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: out ? "#bfe0a8" : theme.line }}>
            <View style={{ width: (pct * 100) + "%", height: 4, borderRadius: 2, backgroundColor: theme.accent }} />
          </View>
          <Text style={{ fontSize: 11, color: out ? "#6b9a80" : theme.muted2, marginTop: 4 }}>🎤 {fmtDur(cur) || "0:00"}{dur ? " / " + fmtDur(dur) : ""}</Text>
        </View>
      </View>
      {summary ? <Text style={{ fontSize: 13, color: theme.ink, marginTop: 6, fontStyle: "italic" }}>“{summary}”</Text> : null}
    </View>
  )
}

// VIDEO — player nativo con controles; header de auth en la source.
function VideoMsg({ source }) {
  const player = useVideoPlayer(source, (p) => { p.loop = false })
  return <VideoView player={player} style={{ width: 250, height: 180, borderRadius: 12, backgroundColor: "#000" }} contentFit="cover" allowsFullscreen nativeControls />
}

function ImageMsg({ source }) {
  const [ar, setAr] = useState(1.2)
  return <Image source={source} onLoad={(e) => { const s = e?.nativeEvent?.source; if (s?.width && s?.height) setAr(s.width / s.height) }}
    style={{ width: 232, height: 232 / ar, maxHeight: 320, borderRadius: 12, backgroundColor: theme.line }} resizeMode="cover" />
}

// dispatcher por tipo de media
export default function MediaBubble({ item, out }) {
  const src = mediaSource(item.media)
  if (!src) return null
  if (item.mediaType === "image" || item.mediaType === "sticker") return <ImageMsg source={src} />
  if (item.mediaType === "video" || item.mediaType === "gif") return <VideoMsg source={src} />
  if (item.mediaType === "audio") return <AudioMsg source={src} out={out} summary={item.audioSummary ? item.summary : null} />
  // documento u otro archivo
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9, minWidth: 180 }}>
      <Text style={{ fontSize: 24 }}>📄</Text>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: "600", color: theme.ink }}>{item.filename || "Documento"}</Text>
        <Text style={{ fontSize: 11, color: theme.muted2 }}>Archivo</Text>
      </View>
    </View>
  )
}
