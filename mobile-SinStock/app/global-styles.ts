/**
 * Global Style Overrides - MUST BE IMPORTED FIRST
 * 
 * This file overrides React Native's default Text and TextInput colors
 * to fix the blue font issue on some Android devices.
 * 
 * Import this at the very top of _layout.tsx BEFORE any other imports.
 */

import { Text, TextInput, Platform } from 'react-native';

// Force white text color as default for all Text components
// This runs before any component renders
const defaultTextStyle = { color: '#ffffff' };

// @ts-ignore - defaultProps exists but TypeScript doesn't like it
if (Text.defaultProps == null) {
    // @ts-ignore
    Text.defaultProps = {};
}
// @ts-ignore
Text.defaultProps.style = defaultTextStyle;

// @ts-ignore - defaultProps exists but TypeScript doesn't like it  
if (TextInput.defaultProps == null) {
    // @ts-ignore
    TextInput.defaultProps = {};
}
// @ts-ignore
TextInput.defaultProps.style = defaultTextStyle;
// @ts-ignore
TextInput.defaultProps.placeholderTextColor = '#999999';

console.log('✅ Global text styles applied');
