import { useState, useEffect } from "react"
import { Keyboard } from "react-native"

// altura del teclado en vivo → comprimimos la pantalla hacia arriba (como WhatsApp). El KeyboardAvoidingView de RN
// NO funciona en Android con edge-to-edge (SDK57), por eso lo hacemos a mano con los eventos del teclado.
export function useKeyboardHeight() {
  const [h, setH] = useState(0)
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => setH(e?.endCoordinates?.height || 0))
    const hide = Keyboard.addListener("keyboardDidHide", () => setH(0))
    return () => { show.remove(); hide.remove() }
  }, [])
  return h
}
