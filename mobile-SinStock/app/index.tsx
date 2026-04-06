import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
    ScrollView
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { AuthService } from '../services/auth.service';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ServerConfigService } from '../services/serverConfig.service';
import { initializeApi, resetApi } from '../services/api.service';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();

    // Server URL state - visible in login form
    const [serverUrl, setServerUrl] = useState('');
    const [isCheckingUrl, setIsCheckingUrl] = useState(true);
    const [urlStatus, setUrlStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [urlMessage, setUrlMessage] = useState('');

    // Load saved URL and credentials on mount with timeout protection
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            // Safety timeout - ensure we show login after 3 seconds max
            console.log('LoginScreen: Safety timeout reached, showing login');
            setIsCheckingUrl(false);
        }, 3000);

        loadSavedData().finally(() => {
            clearTimeout(timeoutId);
        });

        return () => clearTimeout(timeoutId);
    }, []);

    const loadSavedData = async () => {
        try {
            console.log('LoginScreen: Loading saved data...');

            // Load saved URL
            const url = await ServerConfigService.getServerUrl();
            console.log('LoginScreen: Saved URL:', url);
            if (url) {
                setServerUrl(url);
            }

            // Load saved credentials
            const credentials = await AuthService.getSavedCredentials();
            if (credentials) {
                console.log('LoginScreen: Found saved credentials for:', credentials.username);
                setUsername(credentials.username);
                setPassword(credentials.password);
            }
        } catch (error) {
            console.error('LoginScreen: Error loading saved data:', error);
        } finally {
            setIsCheckingUrl(false);
        }
    };

    const testUrl = async (url: string, silent: boolean = false) => {
        if (!url.trim()) {
            if (!silent) setUrlMessage('Ingresa una URL');
            setUrlStatus('idle');
            return false;
        }

        setUrlStatus('testing');
        setUrlMessage('Probando conexión...');

        try {
            const result = await ServerConfigService.testConnection(url.trim());

            if (result.success) {
                setUrlStatus('success');
                setUrlMessage('✓ Conectado');
                // Save and initialize
                await ServerConfigService.setServerUrl(url.trim());
                resetApi();
                await initializeApi();
                return true;
            } else {
                setUrlStatus('error');
                setUrlMessage(result.message);
                return false;
            }
        } catch (error: any) {
            setUrlStatus('error');
            setUrlMessage(error.message || 'Error de conexión');
            return false;
        }
    };

    const handleTestConnection = () => {
        testUrl(serverUrl);
    };

    const handleLogin = async () => {
        if (!serverUrl.trim()) {
            Alert.alert('Error', 'Por favor ingresa la URL del servidor');
            return;
        }

        if (!username || !password) {
            Alert.alert('Error', 'Por favor ingresa usuario y contraseña');
            return;
        }

        // If URL not tested or failed, test first
        if (urlStatus !== 'success') {
            const urlOk = await testUrl(serverUrl);
            if (!urlOk) {
                Alert.alert('Error de Conexión', 'No se puede conectar al servidor. Verifica la URL.');
                return;
            }
        }

        setLoading(true);
        try {
            await signIn(username, password);
        } catch (error: any) {
            console.error('Login error:', error);
            const errorMessage = error.response?.data?.detail?.error?.message
                || error.response?.data?.detail
                || 'Credenciales incorrectas o error de conexión.';

            if (Platform.OS === 'web') {
                window.alert(errorMessage);
            } else {
                Alert.alert('Error de Inicio de Sesión', errorMessage);
            }
        } finally {
            setLoading(false);
        }
    };

    // Show loading while checking saved URL
    if (isCheckingUrl) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#3498db" />
                <Text style={styles.loadingText}>Cargando...</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <StatusBar style="light" />
            <Stack.Screen options={{ headerShown: false }} />

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.logoContainer}>
                    <View style={styles.logoPlaceholder}>
                        <Text style={styles.logoText}>ST</Text>
                    </View>
                    <Text style={styles.appName}>STDiscar Técnicos</Text>
                    <Text style={styles.tagline}>Gestión de Servicios en Campo</Text>
                </View>

                <View style={styles.formContainer}>
                    {/* SERVER URL FIELD - Always visible */}
                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>URL del Servidor</Text>
                        <View style={styles.urlInputRow}>
                            <TextInput
                                style={[styles.input, styles.urlInput]}
                                placeholder="https://servidor.ejemplo.com"
                                placeholderTextColor="#666"
                                value={serverUrl}
                                onChangeText={(text) => {
                                    setServerUrl(text);
                                    setUrlStatus('idle');
                                    setUrlMessage('');
                                }}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                            />
                            <TouchableOpacity
                                style={[
                                    styles.testButton,
                                    urlStatus === 'success' && styles.testButtonSuccess,
                                    urlStatus === 'error' && styles.testButtonError
                                ]}
                                onPress={handleTestConnection}
                                disabled={urlStatus === 'testing'}
                            >
                                {urlStatus === 'testing' ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : urlStatus === 'success' ? (
                                    <Ionicons name="checkmark" size={20} color="#fff" />
                                ) : urlStatus === 'error' ? (
                                    <Ionicons name="close" size={20} color="#fff" />
                                ) : (
                                    <Ionicons name="wifi" size={20} color="#fff" />
                                )}
                            </TouchableOpacity>
                        </View>
                        {urlMessage !== '' && (
                            <Text style={[
                                styles.urlMessage,
                                urlStatus === 'success' && styles.urlMessageSuccess,
                                urlStatus === 'error' && styles.urlMessageError
                            ]}>
                                {urlMessage}
                            </Text>
                        )}
                        <Text style={styles.urlHint}>
                            Ej: http://192.168.1.5:8000 o https://miservidor.ddns.net
                        </Text>
                    </View>

                    {/* USERNAME FIELD */}
                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Usuario</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ingrese su usuario"
                            placeholderTextColor="#aaa"
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                        />
                    </View>

                    {/* PASSWORD FIELD */}
                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Contraseña</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ingrese su contraseña"
                            placeholderTextColor="#aaa"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />
                    </View>

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>INICIAR SESIÓN</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>v1.0.0</Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a1a',
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        justifyContent: 'center',
    },
    loadingText: {
        color: '#aaa',
        marginTop: 16,
        fontSize: 14,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    logoPlaceholder: {
        width: 80,
        height: 80,
        borderRadius: 16,
        backgroundColor: '#3498db',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        shadowColor: '#3498db',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 8,
    },
    logoText: {
        color: '#fff',
        fontSize: 32,
        fontWeight: 'bold',
    },
    appName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    tagline: {
        fontSize: 14,
        color: '#aaa',
    },
    formContainer: {
        width: '100%',
    },
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        color: '#ddd',
        marginBottom: 8,
        fontSize: 14,
        fontWeight: '600',
    },
    input: {
        backgroundColor: '#333',
        borderRadius: 10,
        padding: 14,
        fontSize: 15,
        color: '#fff',
        borderWidth: 1,
        borderColor: '#444',
    },
    urlInputRow: {
        flexDirection: 'row',
        gap: 8,
    },
    urlInput: {
        flex: 1,
    },
    testButton: {
        backgroundColor: '#555',
        width: 48,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    testButtonSuccess: {
        backgroundColor: '#27ae60',
    },
    testButtonError: {
        backgroundColor: '#e74c3c',
    },
    urlMessage: {
        marginTop: 6,
        fontSize: 12,
        color: '#aaa',
    },
    urlMessageSuccess: {
        color: '#27ae60',
    },
    urlMessageError: {
        color: '#e74c3c',
    },
    urlHint: {
        marginTop: 4,
        fontSize: 11,
        color: '#666',
    },
    button: {
        backgroundColor: '#3498db',
        padding: 16,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 20,
        shadowColor: '#3498db',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    footer: {
        alignItems: 'center',
        marginTop: 24,
    },
    footerText: {
        color: '#666',
        fontSize: 12,
    },
});
