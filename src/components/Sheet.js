import React from "react"
import { Modal, View, TouchableOpacity } from "react-native"
import { theme } from "../theme"

// Hoja inferior (bottom sheet) simple con Modal nativo. Tocar el fondo cierra.
export default function Sheet({ visible, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 34, maxHeight: "78%" }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.line, alignSelf: "center", marginBottom: 14 }} />
          {children}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}
