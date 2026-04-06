import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Pressable, Platform, Alert } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRoute } from '../../contexts/RouteContext'; // Import useRoute
import { useFocusEffect, useRouter, Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Interface for grouped OT
interface GroupedOT {
    ot: string;
    cita: string;
    denominacion: string;
    domicilio: string;
    localidad: string;
    vencimiento_sla: string;
    partidas: any[]; // Array of partida objects
}

export default function HomeScreen() {
    const { user } = useAuth();
    const { rutaActiva, servicios, loading, refreshing, hasRoute, syncWithBackend, isServiceCompleted, finalizarRuta } = useRoute(); // Use Context
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [perfilRecorrido, setPerfilRecorrido] = React.useState<'car' | 'foot'>('car');
    const [calculandoRuta, setCalculandoRuta] = React.useState(false);

    // useFocusEffect(
    //     useCallback(() => {
    //         console.log('Home: useFocusEffect triggered');
    //         fetchRouteData();
    //     }, [])
    // );

    const onRefresh = () => {
        syncWithBackend();  // Manual sync with backend
    };

    // Group services by OT
    const groupedServices = useMemo(() => {
        const groups: Map<string, GroupedOT> = new Map();

        servicios.forEach(service => {
            const key = `${service.cita}-${service.ot}`;

            if (!groups.has(key)) {
                groups.set(key, {
                    ot: service.ot,
                    cita: service.cita,
                    denominacion: service.denominacion || 'Sin Nombre',
                    domicilio: service.domicilio || '',
                    localidad: service.localidad || '',
                    vencimiento_sla: service.vencimiento_sla || '',
                    partidas: []
                });
            }

            groups.get(key)!.partidas.push(service);
        });

        return Array.from(groups.values());
    }, [servicios]);

    const getStatusStyle = (estado: string) => {
        switch (estado?.toLowerCase()) {
            case 'lista': return { backgroundColor: '#2ecc71' };
            case 'completado': return { backgroundColor: '#2ecc71' };
            case 'novedad': return { backgroundColor: '#f39c12' }; // Orange for novedad
            case 'en proceso': return { backgroundColor: '#f1c40f' };
            case 'cancelado': return { backgroundColor: '#e74c3c' };
            default: return { backgroundColor: '#95a5a6' };
        }
    };

    // SLA Color Logic
    const getSLAColor = (vencimiento: string) => {
        if (!vencimiento) return '#95a5a6'; // Gray if no date

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const slaDate = new Date(vencimiento);
        slaDate.setHours(0, 0, 0, 0);

        if (slaDate < today) return '#e74c3c'; // Red (Vencida)
        if (slaDate.getTime() === today.getTime()) return '#f39c12'; // Orange (Vence hoy)
        return '#2ecc71'; // Green (Vence mañana o después)
    };

    const handleFinalizarRuta = () => {
        Alert.alert(
            'Finalizar Ruta',
            '¿Estás seguro de que deseas finalizar tu ruta actual? Esta acción no se puede deshacer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Finalizar',
                    style: 'destructive',
                    onPress: async () => {
                        await finalizarRuta();
                        await syncWithBackend();
                    }
                }
            ]
        );
    };

    const handleRecorridoSugerido = async () => {
        if (!rutaActiva) return;

        setCalculandoRuta(true);
        try {
            const Location = await import('expo-location');
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Error', 'Se requiere permiso de ubicación para calcular el recorrido.');
                setCalculandoRuta(false);
                return;
            }

            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });

            const { RoutesService } = await import('../../services/routes.service');
            const response = await RoutesService.getSuggestedRoute(
                rutaActiva.id,
                loc.coords.latitude,
                loc.coords.longitude,
                perfilRecorrido
            );

            Alert.alert(
                'Recorrido Optimizado',
                `Distancia: ${response.total_distance_km} km\nTiempo: ${response.total_duration_min} min\nParadas: ${response.paradas.length}\n\n¿Desea abrir el recorrido en Google Maps?`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Abrir Maps',
                        onPress: async () => {
                            const Linking = await import('react-native').then(m => m.Linking);
                            Linking.openURL(response.google_maps_url);
                        }
                    }
                ]
            );
        } catch (error: any) {
            console.error('Error calculando ruta sugerida:', error);
            const msg = error.response?.data?.detail || 'No se pudo calcular la ruta sugerida. Verifique que hay servicios pendientes con coordenadas válidas.';
            Alert.alert('Error', msg);
        } finally {
            setCalculandoRuta(false);
        }
    };

    // Get status for grouped OT (based on completion of all partidas)
    const getGroupStatus = (group: GroupedOT) => {
        const completedCount = group.partidas.filter(p =>
            isServiceCompleted(p.cita, p.ot, p.partida)
        ).length;

        if (completedCount === group.partidas.length) return 'Completado';
        if (completedCount > 0) return 'Parcial';
        return 'Pendiente';
    };

    const renderGroupedItem = (group: GroupedOT, index: number) => {
        const groupStatus = getGroupStatus(group);
        const completedCount = group.partidas.filter(p =>
            isServiceCompleted(p.cita, p.ot, p.partida)
        ).length;
        const key = `${group.cita}-${group.ot}`;

        return (
            <Pressable
                key={key}
                style={[styles.serviceCard, { borderLeftColor: getSLAColor(group.vencimiento_sla), borderLeftWidth: 8 }]}
                onPress={() => {
                    console.log('Navigating to detail for OT:', group.ot);
                    // Navigate with OT and cita, detail screen will get all partidas
                    if (Platform.OS === 'web') {
                        window.location.href = `/detalle?cita=${group.cita}&ot=${group.ot}`;
                    } else {
                        router.push({
                            pathname: '/detalle',
                            params: { cita: group.cita, ot: group.ot }
                        });
                    }
                }}
            >
                <View style={styles.serviceHeader}>
                    <Text style={styles.serviceTitle}>{group.denominacion}</Text>
                    <View style={[styles.statusBadge, getStatusStyle(groupStatus)]}>
                        <Text style={styles.statusText}>{groupStatus}</Text>
                    </View>
                </View>

                <View style={styles.serviceInfo}>
                    <View style={styles.infoRow}>
                        <Ionicons name="document-text-outline" size={16} color="#aaa" />
                        <Text style={styles.infoText}>OT: {group.ot}</Text>
                        <Text style={[styles.infoText, { marginLeft: 10 }]}>Cita: {group.cita}</Text>
                        <View style={styles.partidasBadge}>
                            <Text style={styles.partidasText}>
                                {completedCount}/{group.partidas.length} partidas
                            </Text>
                        </View>
                    </View>
                    <View style={styles.infoRow}>
                        <Ionicons name="location-outline" size={16} color="#aaa" />
                        <Text style={styles.infoText} numberOfLines={1}>{group.domicilio}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Ionicons name="time-outline" size={16} color="#aaa" />
                        <Text style={styles.infoText}>{group.vencimiento_sla ? new Date(group.vencimiento_sla).toLocaleDateString() : 'Sin fecha'}</Text>
                    </View>
                </View>
            </Pressable>
        );
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3498db" />
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
            }
        >
            <StatusBar style="light" />

            <View style={styles.header}>
                <Text style={styles.greeting}>Hola, {user?.nombre_completo || user?.usuario || 'Técnico'}</Text>
                <Text style={styles.subGreeting}>
                    {user?.zona ? `Zona: ${user.zona}` : 'Bienvenido'}
                </Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Tu Ruta Actual</Text>

                {hasRoute && rutaActiva ? (
                    <>
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.routeId}>Ruta #{rutaActiva.id}</Text>
                                <View style={[styles.badge, { backgroundColor: '#2ecc71' }]}>
                                    <Text style={styles.badgeText}>{rutaActiva.estado.toUpperCase()}</Text>
                                </View>
                            </View>

                            {/* Local stats calculation */}
                            {(() => {
                                const totalServicios = servicios.length;
                                const completados = servicios.filter(s =>
                                    isServiceCompleted(s.cita, s.ot, s.partida)
                                ).length;
                                const pendientes = totalServicios - completados;
                                const progreso = totalServicios > 0 ? Math.round((completados / totalServicios) * 100) : 0;

                                return (
                                    <>
                                        <View style={styles.progressContainer}>
                                            <View style={styles.progressStats}>
                                                <Text style={styles.progressLabel}>Progreso</Text>
                                                <Text style={styles.progressValue}>{progreso}%</Text>
                                            </View>
                                            <View style={styles.progressBarBg}>
                                                <View style={[styles.progressBarFill, { width: `${progreso}%` }]} />
                                            </View>
                                        </View>

                                        <View style={styles.statsRow}>
                                            <View style={styles.statItem}>
                                                <Text style={styles.statNumber}>{totalServicios}</Text>
                                                <Text style={styles.statLabel}>Total</Text>
                                            </View>
                                            <View style={styles.statItem}>
                                                <Text style={[styles.statNumber, { color: '#2ecc71' }]}>{completados}</Text>
                                                <Text style={styles.statLabel}>Listos</Text>
                                            </View>
                                            <View style={styles.statItem}>
                                                <Text style={[styles.statNumber, { color: '#e74c3c' }]}>{pendientes}</Text>
                                                <Text style={styles.statLabel}>Pendientes</Text>
                                            </View>
                                        </View>

                                        {/* Suggested Route Section */}
                                        <View style={styles.recorridoContainer}>
                                            <View style={styles.toggleContainer}>
                                                <TouchableOpacity
                                                    style={[styles.toggleButton, perfilRecorrido === 'car' && styles.toggleActive]}
                                                    onPress={() => setPerfilRecorrido('car')}
                                                >
                                                    <Text style={[styles.toggleText, perfilRecorrido === 'car' && styles.toggleTextActive]}>🚗 Vehículo</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.toggleButton, perfilRecorrido === 'foot' && styles.toggleActive]}
                                                    onPress={() => setPerfilRecorrido('foot')}
                                                >
                                                    <Text style={[styles.toggleText, perfilRecorrido === 'foot' && styles.toggleTextActive]}>🚶 A pie</Text>
                                                </TouchableOpacity>
                                            </View>
                                            <TouchableOpacity
                                                style={styles.recorridoButton}
                                                onPress={handleRecorridoSugerido}
                                                disabled={calculandoRuta}
                                            >
                                                {calculandoRuta ? (
                                                    <ActivityIndicator color="#fff" size="small" />
                                                ) : (
                                                    <>
                                                        <Ionicons name="map-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                                                        <Text style={styles.recorridoText}>RECORRIDO SUGERIDO</Text>
                                                    </>
                                                )}
                                            </TouchableOpacity>
                                        </View>

                                        {/* Finalizar Ruta Button */}
                                        <TouchableOpacity
                                            style={styles.finalizarButton}
                                            onPress={handleFinalizarRuta}
                                        >
                                            <Ionicons name="checkmark-done-circle-outline" size={24} color="#fff" style={{ marginRight: 8 }} />
                                            <Text style={styles.finalizarText}>FINALIZAR RUTA</Text>
                                        </TouchableOpacity>
                                    </>
                                );
                            })()}
                        </View>

                        <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>
                            Listado de OT ({groupedServices.length})
                        </Text>

                        {groupedServices.length > 0 ? (
                            <View style={styles.servicesList}>
                                {groupedServices.map((group, index) => renderGroupedItem(group, index))}
                            </View>
                        ) : (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyText}>No hay servicios disponibles.</Text>
                            </View>
                        )}
                    </>
                ) : (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>No tienes una ruta asignada en este momento.</Text>
                        <Text style={styles.emptySubText}>
                            Contacta a tu supervisor o recarga la pantalla si crees que esto es un error.
                        </Text>
                    </View>
                )}
            </View>
            <View style={{ height: 40 + insets.bottom }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: '#121212',
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        padding: 20,
        paddingTop: 30,
        backgroundColor: '#1a1a1a',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    greeting: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
    },
    subGreeting: {
        fontSize: 14,
        color: '#aaa',
        marginTop: 4,
    },
    section: {
        padding: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ddd',
        marginBottom: 16,
    },
    card: {
        backgroundColor: '#1e1e1e',
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    routeId: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    badge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    badgeText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
    },
    progressContainer: {
        marginBottom: 24,
    },
    progressStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    progressLabel: {
        color: '#aaa',
        fontSize: 14,
    },
    progressValue: {
        color: '#3498db',
        fontWeight: 'bold',
        fontSize: 14,
    },
    progressBarBg: {
        height: 8,
        backgroundColor: '#333',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#3498db',
        borderRadius: 4,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
        backgroundColor: '#252525',
        borderRadius: 12,
        padding: 16,
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statNumber: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
        color: '#888',
    },
    emptyCard: {
        backgroundColor: '#1e1e1e',
        borderRadius: 16,
        padding: 30,
        alignItems: 'center',
        borderStyle: 'dashed',
        borderWidth: 2,
        borderColor: '#333',
    },
    emptyText: {
        color: '#fff',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 8,
        fontWeight: 'bold',
    },
    emptySubText: {
        color: '#888',
        fontSize: 14,
        textAlign: 'center',
    },
    servicesList: {
        gap: 16,
    },
    serviceCard: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 16,
        borderLeftWidth: 4,
        borderLeftColor: '#3498db',
    },
    serviceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    serviceTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
        flex: 1,
        marginRight: 8,
    },
    serviceRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    serviceLabel: {
        color: '#888',
        width: 80,
        fontSize: 14,
    },
    serviceValue: {
        color: '#ddd',
        flex: 1,
        fontSize: 14,
    },
    // New styles for refactored card
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    statusText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    serviceInfo: {
        gap: 6,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    infoText: {
        color: '#ccc',
        fontSize: 13,
        marginLeft: 6,
    },
    partidasBadge: {
        backgroundColor: '#3498db',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        marginLeft: 10,
    },
    partidasText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold',
    },
    recorridoContainer: {
        marginBottom: 16,
        gap: 12,
    },
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: '#252525',
        borderRadius: 8,
        padding: 4,
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 6,
    },
    toggleActive: {
        backgroundColor: '#3498db',
    },
    toggleText: {
        color: '#888',
        fontSize: 14,
        fontWeight: 'bold',
    },
    toggleTextActive: {
        color: '#fff',
    },
    recorridoButton: {
        backgroundColor: '#2980b9',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
    },
    recorridoText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    finalizarButton: {
        backgroundColor: '#e74c3c',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        marginTop: 16,
    },
    finalizarText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
