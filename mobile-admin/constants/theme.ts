/**
 * Tema visual de la aplicación - Stock Admin
 * Mantiene coherencia con la app de técnicos
 */

export const Colors = {
  // Colores principales
  primary: '#1a73e8',
  primaryDark: '#1557b0',
  primaryLight: '#4285f4',
  
  // Colores de estado
  success: '#34a853',
  warning: '#fbbc04',
  error: '#ea4335',
  info: '#4285f4',
  
  // Colores de texto
  text: '#202124',
  textSecondary: '#5f6368',
  textLight: '#80868b',
  textInverse: '#ffffff',
  
  // Fondos
  background: '#f8f9fa',
  surface: '#ffffff',
  surfaceVariant: '#f1f3f4',
  card: '#ffffff',
  
  // Blanco y negro
  white: '#ffffff',
  black: '#000000',
  
  // Bordes
  border: '#dadce0',
  borderLight: '#e8eaed',
  
  // Tab bar
  tabIconDefault: '#5f6368',
  tabIconSelected: '#1a73e8',
  tabBarBackground: '#ffffff',
  
  // Estados de stock
  stockDisponible: '#34a853',
  stockEnTransferencia: '#fbbc04',
  stockReservado: '#ea4335',
  stockCritico: '#ea4335',
  stockBajo: '#fbbc04',
  stockNormal: '#34a853',
  
  // Transferencias
  transferenciaPendiente: '#fbbc04',
  transferenciaAceptada: '#34a853',
  transferenciaRechazada: '#ea4335',
  transferenciaParcial: '#ff9800',
  
  // Alertas
  alertaSerieDuplicada: '#ea4335',
  alertaStockNegativo: '#ea4335',
  alertaResuelta: '#34a853',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FontSizes = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  xxxl: 32,
};

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  // Aliases for convenience
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
};

export default {
  Colors,
  Spacing,
  FontSizes,
  BorderRadius,
  Shadows,
};
