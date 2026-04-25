import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Simple implementation to avoid needing vector-icons immediately if they fail
// But usually @expo/vector-icons works out of the box in Expo
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  // Navigation protection is handled by AuthContext
  // Removing the user check here as it causes white screen on logout
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#1a1a1a',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          color: '#fff',
        },
        tabBarStyle: {
          backgroundColor: '#1a1a1a',
          borderTopColor: '#333',
          paddingBottom: insets.bottom > 0 ? insets.bottom : 5,
          height: 60 + (insets.bottom > 0 ? insets.bottom : 0),
        },
        tabBarActiveTintColor: '#3498db',
        tabBarInactiveTintColor: '#888888',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Ruta Activa',
          tabBarLabel: 'Ruta',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="gestiones"
        options={{
          title: 'Mis Gestiones',
          tabBarLabel: 'Gestiones',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="guias"
        options={{
          title: 'Guías Técnicas',
          tabBarLabel: 'Guías',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Mi Perfil',
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
