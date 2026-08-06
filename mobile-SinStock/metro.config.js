const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude Android build artifact directories inside node_modules from file watching.
// These are Gradle-generated intermediary folders that Metro cannot read (ENOENT),
// causing harmless but noisy errors during the build.
const { blockList } = config.resolver;
const excluded = [
  /node_modules[/\\].*[/\\]android[/\\]build[/\\].*/,
];

config.resolver.blockList = blockList
  ? [blockList, ...excluded]
  : excluded;

module.exports = config;
