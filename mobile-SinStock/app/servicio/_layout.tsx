import { Stack } from 'expo-router';

export default function ServicioLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: true,
                headerStyle: { backgroundColor: '#1a1a1a' },
                headerTintColor: '#fff',
            }}
        />
    );
}
