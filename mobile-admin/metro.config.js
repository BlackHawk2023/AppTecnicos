const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Agregar soporte para extensiones adicionales
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

// Resolver módulos de Node.js que no existen en React Native
config.resolver.alias = {
  ...config.resolver.alias,
  // Alias para crypto - usar implementación vacía ya que axios no la usa críticamente
  crypto: require.resolve('./utils/crypto-polyfill.js'),
  // Alias para otros módulos de Node.js
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer'),
};

module.exports = config;
