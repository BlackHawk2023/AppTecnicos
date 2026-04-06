/**
 * Layout Raíz de la Aplicación
 * Configura los providers globales y la navegación
 */
import React, { useEffect } from 'react';
import { Stack, Redirect, useSegments, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

/**
 * Componente para verificar autenticación y redirigir si no hay sesión
 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

/**
 * Layout Principal
 */
export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <AuthGuard>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: Colors.primary,
            },
            headerTintColor: Colors.white,
            headerTitleStyle: {
              fontWeight: '600',
            },
            headerBackTitle: 'Volver',
            contentStyle: {
              backgroundColor: Colors.background,
            },
          }}
        >
          {/* Pantalla de Login (sin tabs) */}
          <Stack.Screen
            name="(auth)/login"
            options={{
              headerShown: false,
              title: 'Iniciar Sesión'
            }}
          />

          {/* Tabs principales */}
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false
            }}
          />

          {/* Pantallas de Stock */}
          <Stack.Screen
            name="stock/detalle"
            options={{
              title: 'Detalle de Stock',
              presentation: 'card'
            }}
          />
          <Stack.Screen
            name="stock/cargar"
            options={{
              title: 'Cargar Stock',
              presentation: 'modal'
            }}
          />
          <Stack.Screen
            name="stock/verificar"
            options={{
              title: 'Verificar Stock',
              presentation: 'card'
            }}
          />

          {/* Pantallas de Transferencias */}
          <Stack.Screen
            name="transferencias/nueva"
            options={{
              title: 'Nueva Transferencia',
              presentation: 'modal'
            }}
          />
          <Stack.Screen
            name="transferencias/detalle"
            options={{
              title: 'Detalle de Transferencia',
              presentation: 'card'
            }}
          />
          <Stack.Screen
            name="transferencias/recibir"
            options={{
              title: 'Recibir Transferencia',
              presentation: 'card'
            }}
          />

          {/* Pantallas de Auditoría */}
          <Stack.Screen
            name="auditoria/realizar"
            options={{
              title: 'Realizar Auditoría',
              presentation: 'modal'
            }}
          />
          <Stack.Screen
            name="auditoria/historial"
            options={{
              title: 'Historial de Auditorías',
              presentation: 'card'
            }}
          />
        </Stack>
      </AuthGuard>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
