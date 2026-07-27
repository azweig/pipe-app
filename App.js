import React, { useEffect, useState } from "react"
import { View, Text, ActivityIndicator } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native"
import * as Notifications from "expo-notifications"
import { useShareIntent } from "expo-share-intent"
import { setupNotifications } from "./src/notifications"
import { initLang, useT } from "./src/i18n"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context"
import { StatusBar } from "expo-status-bar"
import { initBase, autoLogin } from "./src/api"
import Login from "./src/screens/Login"
import Inbox from "./src/screens/Inbox"
import Conversation from "./src/screens/Conversation"
import Espacio from "./src/screens/Espacio"
import Home from "./src/screens/Home"
import Calendar from "./src/screens/Calendar"
import MeetingDetail from "./src/screens/MeetingDetail"
import Radar from "./src/screens/Radar"
import Notas from "./src/screens/Notas"
import ContactProfile from "./src/screens/ContactProfile"
import ShareTo from "./src/screens/ShareTo"
import Settings from "./src/screens/Settings"
import Alarms from "./src/screens/Alarms"
import { theme } from "./src/theme"

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()
const navRef = createNavigationContainerRef()

// contenido compartido desde otra app (captura/link/imagen) → abre la pantalla "Compartir a…"
function ShareIntentHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({ resetOnBackground: true })
  useEffect(() => {
    if (!hasShareIntent) return
    const go = () => { if (navRef.isReady()) { navRef.navigate("ShareTo", { shared: shareIntent }); resetShareIntent() } else setTimeout(go, 200) }
    go()
  }, [hasShareIntent])
  return null
}

const tabIcon = (emoji) => ({ focused }) => <Text style={{ fontSize: 21, opacity: focused ? 1 : 0.42 }}>{emoji}</Text>

function MainTabs() {
  const insets = useSafeAreaInsets() // el tab bar respeta la barra de navegación de Android (antes quedaba tapado)
  const t = useT()
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true, // el tab bar se oculta al abrir el teclado → la pantalla usa todo el alto (input arriba del teclado)
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted2,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.line, borderTopWidth: 0.5, height: 58 + insets.bottom, paddingTop: 6, paddingBottom: 6 + insets.bottom },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tab.Screen name="Mensajes" component={Inbox} options={{ tabBarLabel: t("messages"), tabBarIcon: tabIcon("💬") }} />
      <Tab.Screen name="Calendario" component={Calendar} options={{ tabBarLabel: t("calendar"), tabBarIcon: tabIcon("📅") }} />
      <Tab.Screen name="Inicio" component={Home} options={{ tabBarLabel: t("home"), tabBarIcon: tabIcon("🏠") }} />
      <Tab.Screen name="Radar" component={Radar} options={{ tabBarLabel: t("radar"), tabBarIcon: tabIcon("✨") }} />
      <Tab.Screen name="Notas" component={Notas} options={{ tabBarLabel: t("notes"), tabBarIcon: tabIcon("📝") }} />
    </Tab.Navigator>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  useEffect(() => {
    (async () => {
      await initBase()
      await initLang()
      const ok = await autoLogin().catch(() => false)
      setAuthed(ok); setReady(true)
    })()
    setupNotifications()
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r?.notification?.request?.content?.data
      if (d && d.convKey && navRef.isReady()) navRef.navigate("Conversation", { convKey: d.convKey, name: d.name || "" })
    })
    return () => sub.remove()
  }, [])
  if (!ready) return <View style={{ flex: 1, justifyContent: "center", backgroundColor: theme.bg }}><ActivityIndicator color={theme.accent} /></View>
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ShareIntentHandler />
        <NavigationContainer ref={navRef}>
          <Stack.Navigator initialRouteName={authed ? "Main" : "Login"} screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: theme.bg } }}>
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Conversation" component={Conversation} />
            <Stack.Screen name="Espacio" component={Espacio} />
            <Stack.Screen name="Meeting" component={MeetingDetail} />
            <Stack.Screen name="Person" component={ContactProfile} />
            <Stack.Screen name="ShareTo" component={ShareTo} />
            <Stack.Screen name="Settings" component={Settings} />
            <Stack.Screen name="Alarms" component={Alarms} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}
