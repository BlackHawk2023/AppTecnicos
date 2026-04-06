/**
 * Pantalla de Login
 * Permite a los usuarios ENCARGADO iniciar sesión
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkServerConnection } from '../../services/api.service';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, FontSizes, Shadows } from '../../constants/theme';
import { getStoredServerUrl, saveServerUrl } from '../../utils/storage';

export default function LoginScreen() {
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const { login: authLogin } = useAuth();

  // Cargar URL del servidor guardada
  useEffect(() => {
    loadSavedServerUrl();
  }, []);

  const loadSavedServerUrl = async () => {
    const savedUrl = await getStoredServerUrl();
    if (savedUrl) {
      setServerUrl(savedUrl);
    }
  };

  // Validar formulario
  const isFormValid = () => {
    return serverUrl.trim() !== '' && username.trim() !== '' && password.trim() !== '';
  };

  // Probar conexión con el servidor
  const handleTestConnection = async () => {
    if (!serverUrl.trim()) {
      Alert.alert('Error', 'Ingrese la URL del servidor');
      return;
    }

    setIsCheckingServer(true);
    try {
      const isConnected = await checkServerConnection(serverUrl.trim());
      if (isConnected) {
        await saveServerUrl(serverUrl.trim());
        Alert.alert('Éxito', 'Conexión exitosa con el servidor');
        setShowServerConfig(false);
      } else {
        Alert.alert('Error', 'No se pudo conectar al servidor');
      }
    } catch (error) {
      Alert.alert('Error', 'Error al verificar la conexión');
    } finally {
      setIsCheckingServer(false);
    }
  };

  // Manejar login
  const handleLogin = async () => {
    if (!isFormValid()) {
      Alert.alert('Error', 'Complete todos los campos');
      return;
    }

    setIsLoading(true);
    try {
      // Guardar URL del servidor antes del login
      await saveServerUrl(serverUrl.trim());
      // AuthContext.login handles: POST /auth/login, GET /auth/me, navigate to /(tabs)
      await authLogin(username.trim(), password);
    } catch (error: any) {
      console.error('Error de autenticación:', error?.response?.status, error?.message);
      Alert.alert('Error', 'Usuario o contraseña incorrectos');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo y Título */}
          <View style={styles.header}>
            <View style={[styles.logoContainer, styles.logoContainerAlt]}>
              <Text style={styles.logoText}>AS</Text>
            </View>
            <Text style={styles.title}>Stock Admin</Text>
            <Text style={styles.subtitle}>Sistema de Gestión de Stock</Text>
          </View>

          {/* Formulario */}
          <View style={styles.form}>
            {/* Configuración del servidor */}
            <TouchableOpacity
              style={styles.serverConfigButton}
              onPress={() => setShowServerConfig(!showServerConfig)}
            >
              <Text style={styles.serverConfigButtonText}>
                {showServerConfig ? '▼ Ocultar configuración' : '▶ Configurar servidor'}
              </Text>
            </TouchableOpacity>

            {showServerConfig && (
              <View style={styles.serverConfigContainer}>
                <Text style={styles.label}>URL del Servidor</Text>
                <View style={styles.serverInputContainer}>
                  <TextInput
                    style={styles.serverInput}
                    placeholder="http://192.168.1.100:8000"
                    placeholderTextColor={Colors.textLight}
                    value={serverUrl}
                    onChangeText={setServerUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                  <TouchableOpacity
                    style={styles.testButton}
                    onPress={handleTestConnection}
                    disabled={isCheckingServer}
                  >
                    {isCheckingServer ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.testButtonText}>Probar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Usuario */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Usuario</Text>
              <TextInput
                style={styles.input}
                placeholder="Ingrese su usuario"
                placeholderTextColor={Colors.textLight}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Contraseña */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={styles.input}
                placeholder="Ingrese su contraseña"
                placeholderTextColor={Colors.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {/* Botón de Login */}
            <TouchableOpacity
              style={[styles.loginButton, !isFormValid() && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={!isFormValid() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
              )}
            </TouchableOpacity>

            {/* Info */}
            <Text style={styles.infoText}>
              Solo usuarios con perfil ENCARGADO pueden acceder a esta aplicación.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    ...Shadows.medium,
  },
  logoContainerAlt: {
    backgroundColor: Colors.error,
  },
  logoText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.white,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  form: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: Spacing.lg,
    ...Shadows.medium,
  },
  serverConfigButton: {
    marginBottom: Spacing.md,
  },
  serverConfigButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: '500',
  },
  serverConfigContainer: {
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: 8,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  serverInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  serverInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  testButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  testButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: FontSizes.sm,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  loginButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
    ...Shadows.small,
  },
  loginButtonDisabled: {
    backgroundColor: Colors.border,
  },
  loginButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  infoText: {
    marginTop: Spacing.lg,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
