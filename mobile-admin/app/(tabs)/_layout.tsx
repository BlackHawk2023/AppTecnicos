/**
 * Layout de Tabs - Navegación principal
 */
import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, FontSizes } from '../../constants/theme';

// Iconos simples usando texto (se pueden reemplazar con @expo/vector-icons)
function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    index: '🏠',
    stock: '📦',
    transferencias: '🔄',
    despachos: '🚚',
    alertas: '⚠️',
    perfil: '👤',
  };

  return (
    <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      {icons[name] || '📄'}
    </Text>
  );
}

export default function TabLayout() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: Colors.primary,
        },
        headerTintColor: Colors.white,
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: FontSizes.lg,
        },
        tabBarStyle: {
          backgroundColor: Colors.tabBarBackground,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === 'ios' ? 20 : Math.max(insets.bottom, 5),
          paddingTop: 5,
          height: (Platform.OS === 'ios' ? 80 : 60) + (Platform.OS === 'android' ? insets.bottom : 0),
        },
        tabBarActiveTintColor: Colors.tabIconSelected,
        tabBarInactiveTintColor: Colors.tabIconDefault,
        tabBarLabelStyle: {
          fontSize: FontSizes.xs,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          headerTitle: `Hola, ${user?.nombrecompleto?.split(' ')[0] || 'Encargado'}`,
          tabBarIcon: ({ focused }) => <TabIcon name="index" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Stock',
          headerTitle: 'Gestión de Stock',
          tabBarIcon: ({ focused }) => <TabIcon name="stock" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="transferencias"
        options={{
          title: 'Transferencias',
          headerTitle: 'Transferencias',
          tabBarIcon: ({ focused }) => <TabIcon name="transferencias" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="despachos"
        options={{
          title: 'Despachos',
          headerTitle: 'Despachos en Progreso',
          tabBarIcon: ({ focused }) => <TabIcon name="despachos" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="alertas"
        options={{
          title: 'Alertas',
          headerTitle: 'Alertas de Stock',
          tabBarIcon: ({ focused }) => <TabIcon name="alertas" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          headerTitle: 'Mi Perfil',
          tabBarIcon: ({ focused }) => <TabIcon name="perfil" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    fontSize: 24,
  },
  tabIconFocused: {
    transform: [{ scale: 1.1 }],
  },
});
