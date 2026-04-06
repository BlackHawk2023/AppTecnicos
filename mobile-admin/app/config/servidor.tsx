import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getServerUrl, saveServerUrl } from '../../utils/storage';
import { checkServerConnection } from '../../services/api.service';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

export default function ConfigServidorScreen() {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        loadCurrentUrl();
    }, []);

    const loadCurrentUrl = async () => {
        try {
            const currentUrl = await getServerUrl();
            if (currentUrl) {
                setUrl(currentUrl);
            }
        } catch (error) {
            console.error('Error al cargar URL del servidor:', error);
        } finally {
            setIsInitializing(false);
        }
    };

    const handleSave = async () => {
        if (!url.trim()) {
            Alert.alert('Error', 'Por favor ingresa la URL del servidor');
            return;
        }

        // Validar formato básico
        let urlToSave = url.trim();
        if (!urlToSave.startsWith('http://') && !urlToSave.startsWith('https://')) {
            urlToSave = `https://${urlToSave}`;
            setUrl(urlToSave);
        }

        setIsLoading(true);

        try {
            // Probar conexión
            const isConnected = await checkServerConnection(urlToSave);

            if (!isConnected) {
                Alert.alert(
                    'Advertencia de Conexión',
                    'No pudimos conectarnos a la URL indicada. ¿Deseas guardarla de todas formas?',
                    [
                        { text: 'Cancelar', style: 'cancel', onPress: () => setIsLoading(false) },
                        {
                            text: 'Guardar igual',
                            onPress: async () => {
                                await _save(urlToSave);
                            }
                        }
                    ]
                );
                return;
            }

            await _save(urlToSave);

        } catch (error) {
            console.error('Error al validar URL:', error);
            Alert.alert('Error', 'Hubo un error al intentar verificar el servidor.');
            setIsLoading(false);
        }
    };

    const _save = async (urlToSave: string) => {
        try {
            await saveServerUrl(urlToSave);
            Alert.alert(
                'Servidor Actualizado',
                'La URL del servidor fue actualizada.\nPor favor, cierra sesión y vuelve a entrar si experimentas errores de conexión.',
                [{ text: 'OK', onPress: () => router.back() }]
            );
        } catch (err) {
            Alert.alert('Error', 'No se pudo guardar la configuración.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isInitializing) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <Stack.Screen options={{ title: 'Configuración del Servidor' }} />

            <View style={styles.content}>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Servidor Backend</Text>
                    <Text style={styles.cardDesc}>
                        Ingresa la URL pública o IP local donde se encuentra alojado el sistema (API).
                    </Text>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>URL del servidor</Text>
                        <TextInput
                            style={styles.input}
                            value={url}
                            onChangeText={setUrl}
                            placeholder="Ej: https://servidor.ejemplo.com"
                            placeholderTextColor={Colors.textLight}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                        />
                        <Text style={styles.hintText}>
                            Incluye http:// o https://
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
                        onPress={handleSave}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color={Colors.white} size="small" />
                        ) : (
                            <Text style={styles.saveButtonText}>Guardar Configuración</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.infoBox}>
                    <Text style={styles.infoIcon}>💡</Text>
                    <Text style={styles.infoText}>
                        Si cambias la URL del servidor y la sesión expira, la aplicación podría devolverte a la pantalla de inicio de sesión automáticamente.
                    </Text>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        padding: Spacing.md,
    },
    card: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        ...Shadows.sm,
        marginBottom: Spacing.lg,
    },
    cardTitle: {
        fontSize: FontSizes.lg,
        fontWeight: 'bold',
        color: Colors.text,
        marginBottom: Spacing.xs,
    },
    cardDesc: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        marginBottom: Spacing.lg,
        lineHeight: 20,
    },
    inputGroup: {
        marginBottom: Spacing.xl,
    },
    label: {
        fontSize: FontSizes.sm,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: Spacing.sm,
    },
    input: {
        backgroundColor: Colors.background,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        fontSize: FontSizes.md,
        color: Colors.text,
    },
    hintText: {
        fontSize: FontSizes.xs,
        color: Colors.textLight,
        marginTop: Spacing.xs,
    },
    saveButton: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        opacity: 0.7,
    },
    saveButtonText: {
        color: Colors.white,
        fontSize: FontSizes.md,
        fontWeight: 'bold',
    },
    infoBox: {
        flexDirection: 'row',
        backgroundColor: Colors.info + '15',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        alignItems: 'flex-start',
    },
    infoIcon: {
        fontSize: 20,
        marginRight: Spacing.sm,
    },
    infoText: {
        flex: 1,
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
});
