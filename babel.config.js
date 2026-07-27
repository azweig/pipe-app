module.exports = function (api) {
  api.cache(true)
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"], // reanimated 4 (requerido por keyboard-controller) — debe ir último
  }
}
