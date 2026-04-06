import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    ActivityIndicator,
    Alert,
    Linking,
    Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Storage } from '../../utils/storage';
import { ServerConfigService } from '../../services/serverConfig.service';

const GUIAS_CACHE_KEY = '@guias_list_cache';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Guia {
    id: number;
    nombre: string;
    descripcion?: string;
    link_curso?: string;
    tiene_pdf: boolean;
    tiene_soft: boolean;
    nombre_archivo_pdf?: string;
    nombre_archivo_soft?: string;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function GuiasScreen() {
    const [guias, setGuias] = useState<Guia[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // ── Carga de datos ──────────────────────────────────────────────────────────

    const fetchGuias = useCallback(async () => {
        try {
            // 1. Mostrar cache local primero (offline-first)
            const cached = await AsyncStorage.getItem(GUIAS_CACHE_KEY);
            if (cached) {
                setGuias(JSON.parse(cached));
                setLoading(false);
            }

            // 2. Actualizar desde el servidor en background
            const response = await api.get('/mobile/guias/');
            const fresh = response.data || [];
            setGuias(fresh);
            await AsyncStorage.setItem(GUIAS_CACHE_KEY, JSON.stringify(fresh));
        } catch {
            // Sin conexión: usamos el cache silenciosamente.
            // Solo alertamos si tampoco hay cache.
            const cached = await AsyncStorage.getItem(GUIAS_CACHE_KEY);
            if (!cached) {
                Alert.alert(
                    'Sin conexión',
                    'Conectate al sistema al menos una vez para guardar las guías localmente.'
                );
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            fetchGuias();
        }, [fetchGuias])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchGuias();
    };

    // ── Acciones ────────────────────────────────────────────────────────────────

    const handleLink = async (url: string) => {
        try {
            const supported = await Linking.canOpenURL(url);
            if (supported) {
                await Linking.openURL(url);
            } else {
                Alert.alert('Error', 'No se puede abrir el enlace: ' + url);
            }
        } catch {
            Alert.alert('Error', 'No se pudo abrir el enlace.');
        }
    };

    /**
     * Delega la descarga al DownloadManager nativo de Android
     * abriendo la URL directamente en el navegador del dispositivo.
     *
     * Ventajas vs descarga en la app:
     *  ✅ Guarda en carpeta Descargas del dispositivo
     *  ✅ Continúa si se minimiza la app
     *  ✅ Resume nativo si se corta la red
     *  ✅ Barra de progreso en panel de notificaciones
     *
     * Se pasa el JWT como query param ?token=xxx para que el navegador
     * pueda autenticarse (solo funciona en red interna de la empresa).
     */
    const handleDownload = async (
        guiaId: number,
        tipo: 'pdf' | 'soft',
        nombreArchivo: string
    ) => {
        try {
            const token = await Storage.getItem('user_token');
            if (!token) {
                Alert.alert('Error', 'No hay sesión activa. Iniciá sesión nuevamente.');
                return;
            }

            const endpoint = tipo === 'pdf'
                ? `/mobile/guias/${guiaId}/download-pdf`
                : `/mobile/guias/${guiaId}/download-soft`;

            // api.defaults.baseURL puede estar vacío si aún no se inicializó.
            // Usamos ServerConfigService como fuente confiable de la URL del servidor.
            const baseUrl =
                api.defaults.baseURL ||
                (await ServerConfigService.getApiBaseUrl()) ||
                '';

            if (!baseUrl) {
                Alert.alert('Error', 'No se encontró la URL del servidor. Verificá la configuración.');
                return;
            }

            const downloadUrl = `${baseUrl}${endpoint}?token=${encodeURIComponent(token)}`;
            await Linking.openURL(downloadUrl);
        } catch (error: any) {
            Alert.alert('Error', `No se pudo iniciar la descarga:\n${error.message || 'Error desconocido'}`);
        }
    };

    // ── Render ──────────────────────────────────────────────────────────────────

    const renderGuia = ({ item }: { item: Guia }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Ionicons name="book" size={22} color="#3498db" style={styles.cardIcon} />
                <Text style={styles.cardTitle}>{item.nombre}</Text>
            </View>

            {item.descripcion ? (
                <Text style={styles.cardDesc}>{item.descripcion}</Text>
            ) : null}

            <View style={styles.actions}>
                {/* ── Ver Curso ── */}
                {item.link_curso ? (
                    <TouchableOpacity
                        style={[styles.btn, styles.btnLink]}
                        onPress={() => handleLink(item.link_curso!)}
                        activeOpacity={0.75}
                    >
                        <Ionicons name="globe-outline" size={16} color="#fff" />
                        <Text style={styles.btnText}>Ver Curso</Text>
                    </TouchableOpacity>
                ) : null}

                {/* ── Descargar Guía ── */}
                {item.tiene_pdf ? (
                    <TouchableOpacity
                        style={[styles.btn, styles.btnPdf]}
                        onPress={() =>
                            handleDownload(item.id, 'pdf', item.nombre_archivo_pdf || `guia_${item.id}.pdf`)
                        }
                        activeOpacity={0.75}
                    >
                        <Ionicons name="document-text-outline" size={16} color="#fff" />
                        <Text style={styles.btnText}>Descargar Guía</Text>
                    </TouchableOpacity>
                ) : null}

                {/* ── Descargar Software ── */}
                {item.tiene_soft ? (
                    <TouchableOpacity
                        style={[styles.btn, styles.btnSoft]}
                        onPress={() =>
                            handleDownload(item.id, 'soft', item.nombre_archivo_soft || `software_${item.id}.zip`)
                        }
                        activeOpacity={0.75}
                    >
                        <Ionicons name="archive-outline" size={16} color="#fff" />
                        <Text style={styles.btnText}>Descargar Software</Text>
                    </TouchableOpacity>
                ) : null}

                {!item.link_curso && !item.tiene_pdf && !item.tiene_soft ? (
                    <Text style={styles.noContent}>Sin archivos disponibles</Text>
                ) : null}
            </View>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#3498db" />
                <Text style={styles.loadingText}>Cargando guías...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={guias}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderGuia}
                contentContainerStyle={guias.length === 0 ? styles.emptyContainer : styles.listContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={['#3498db']}
                        tintColor="#3498db"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.center}>
                        <Ionicons name="book-outline" size={64} color="#444" />
                        <Text style={styles.emptyText}>No hay guías disponibles</Text>
                        <Text style={styles.emptySubText}>Deslizá para actualizar</Text>
                    </View>
                }
            />
        </View>
    );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    loadingText: {
        color: '#888',
        marginTop: 12,
        fontSize: 14,
    },
    listContent: {
        padding: 16,
        paddingBottom: 24,
    },
    emptyContainer: {
        flex: 1,
    },
    emptyText: {
        color: '#888',
        fontSize: 17,
        marginTop: 16,
        fontWeight: '600',
    },
    emptySubText: {
        color: '#555',
        fontSize: 13,
        marginTop: 6,
    },
    card: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#2a2a2a',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
            },
            android: { elevation: 4 },
        }),
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    cardIcon: { marginRight: 10 },
    cardTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        flex: 1,
    },
    cardDesc: {
        color: '#aaa',
        fontSize: 13,
        marginBottom: 12,
        lineHeight: 19,
    },
    actions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 8,
    },
    btnLink: { backgroundColor: '#2980b9' },
    btnPdf: { backgroundColor: '#e74c3c' },
    btnSoft: { backgroundColor: '#27ae60' },
    btnText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
    noContent: {
        color: '#555',
        fontSize: 13,
        fontStyle: 'italic',
        alignSelf: 'center',
    },
});
