/**
 * Pantalla de Perfil
 * Muestra información del usuario y permite cerrar sesión
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

export default function PerfilScreen() {
  const { user, logout } = useAuth();

  // Manejar cierre de sesión
  const handleLogout = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro que deseas cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar Sesión',
          style: 'destructive',
          onPress: async () => {
            await logout();
          }
        },
      ]
    );
  };

  // Opciones del menú
  const menuOptions = [
    {
      title: 'Auditoría',
      icon: '📋',
      options: [
        { label: 'Realizar Auditoría', route: '/auditoria/realizar', icon: '🔍' },
        { label: 'Historial de Auditorías', route: '/auditoria/historial', icon: '📜' },
      ]
    },
    {
      title: 'Sistema',
      icon: '⚙️',
      options: [
        { label: 'Configuración del Servidor', route: '/config/servidor', icon: '🌐' },
      ]
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Tarjeta de perfil */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {user?.nombrecompleto?.charAt(0) || 'E'}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.nombrecompleto || 'Encargado'}</Text>
          <Text style={styles.userRole}>ENCARGADO</Text>
          <Text style={styles.userInfo}>{user?.email || user?.usuario}</Text>

          {user?.codigoBase && (
            <View style={styles.zonaContainer}>
              <Text style={styles.zonaLabel}>Base asignada:</Text>
              <Text style={styles.zonaValue}>{user.nombreBase || user.codigoBase}</Text>
            </View>
          )}
        </View>

        {/* Opciones del menú */}
        {menuOptions.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.menuSection}>
            <Text style={styles.sectionTitle}>
              {section.icon} {section.title}
            </Text>

            <View style={styles.menuOptions}>
              {section.options.map((option, optionIndex) => (
                <TouchableOpacity
                  key={optionIndex}
                  style={styles.menuOption}
                  onPress={() => router.push(option.route as any)}
                >
                  <Text style={styles.optionIcon}>{option.icon}</Text>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Información de la app */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>Stock Admin v1.0.0</Text>
          <Text style={styles.appCopyright}>© 2024 StDiscar</Text>
        </View>

        {/* Botón de cerrar sesión */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutIcon}>🚪</Text>
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
    ...Shadows.md,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.white,
  },
  userName: {
    fontSize: FontSizes.xl,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  userRole: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  userInfo: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  zonaContainer: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  zonaLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginRight: Spacing.xs,
  },
  zonaValue: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  menuSection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  menuOptions: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  optionIcon: {
    fontSize: 20,
    marginRight: Spacing.md,
  },
  optionLabel: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  optionArrow: {
    fontSize: FontSizes.xl,
    color: Colors.textLight,
  },
  appInfo: {
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  appName: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  appCopyright: {
    fontSize: FontSizes.xs,
    color: Colors.textLight,
    marginTop: Spacing.xs,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error,
    ...Shadows.sm,
  },
  logoutIcon: {
    fontSize: 20,
    marginRight: Spacing.sm,
  },
  logoutText: {
    fontSize: FontSizes.md,
    color: Colors.error,
    fontWeight: '600',
  },
});
