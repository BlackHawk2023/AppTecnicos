import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { RoutesService } from '../../services/routes.service';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import ServicioPrevioModal from '../../components/ServicioPrevioModal';

export default function RutaDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [rutaFull, setRutaFull] = useState<any | null>(null);

    // Servicio previo (misma terminal) modal state
    const [previoVisible, setPrevioVisible] = useState(false);
    const [previoServicio, setPrevioServicio] = useState<any>(null);

    useEffect(() => {
        if (id) {
            fetchRutaDetail();
        }
    }, [id]);

    const fetchRutaDetail = async () => {
        try {
            console.log('Fetching route detail for:', id);
            console.log('[VERSION CHECK] - Green Debug Box loaded');
            const data = await RoutesService.getRutaDetalle(Number(id));
            console.log('Route detail response:', data);

            // Just to be safe, let's log the services array specifically
            if (data && data.servicios) {
                console.log('Services found:', data.servicios.length);
            } else {
                console.log('No services found in data');
            }

            setRutaFull(data);
        } catch (error) {
            console.error(error);
            alert('Error cargando servicios');
        } finally {
            setLoading(false);
        }
    };

    const renderServiceItem = ({ item }: { item: any }) => {
        const isCompleted = item.estado === 'Completado';
        const statusColor = isCompleted ? '#2ecc71' : '#f39c12';

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => {
                    // Navigate to detailed service view (detalle.tsx obtiene todas las partidas de la OT)
                    router.push({
                        pathname: "/detalle",
                        params: {
                            cita: item.cita,
                            ot: item.ot,
                            partida: item.partida
                        }
                    });
                }}
            >
                <View style={styles.cardHeader}>
                    <Text style={styles.serviceTitle}>{item.denominacion || 'Cliente Sin Nombre'}</Text>
                    <View style={[styles.badge, { backgroundColor: statusColor }]}>
                        <Text style={styles.badgeText}>
                            {item.subestado || item.estado || 'Pendiente'}
                        </Text>
                    </View>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>OT:</Text>
                    <Text style={styles.value}>{item.ot}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Dirección:</Text>
                    <Text style={styles.value} numberOfLines={1}>{item.domicilio}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Incidencia:</Text>
                    <Text style={styles.value} numberOfLines={1}>{item.tipo_incidente}</Text>
                </View>

                <View style={styles.cardFooter}>
                    <TouchableOpacity
                        style={styles.previoButton}
                        onPress={() => { setPrevioServicio(item); setPrevioVisible(true); }}
                    >
                        <Ionicons name="information-circle-outline" size={18} color="#3498db" />
                        <Text style={styles.previoButtonText}>Servicio previo</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3498db" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <Stack.Screen options={{ title: `Ruta #${id}`, headerBackTitle: 'Volver' }} />

            <View style={styles.debugInfo}>
                <Text style={styles.debugText}>
                    DEBUG: Servicios cargados: {rutaFull?.servicios?.length || '0'}
                </Text>
            </View>

            <FlatList
                data={rutaFull?.servicios || []}
                keyExtractor={(item, index) => {
                    const id = item?.cita && item?.ot && item?.partida
                        ? `${item.cita}-${item.ot}-${item.partida}`
                        : `item-${index}`;
                    return id;
                }}
                renderItem={renderServiceItem}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No hay servicios en esta ruta.</Text>
                        <Text style={styles.debugText}>
                            Data received: {JSON.stringify(rutaFull?.servicios || 'null')}
                        </Text>
                    </View>
                }
            />

            {/* Servicio previo (misma terminal) */}
            <ServicioPrevioModal
                visible={previoVisible}
                onClose={() => setPrevioVisible(false)}
                serviciosPrevios={previoServicio?.servicios_previos || []}
                terminal={previoServicio?.terminal}
                contextLabel={previoServicio ? `OT ${previoServicio.ot} · Partida N° ${previoServicio.partida}` : undefined}
            />
        </View>
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
    listContent: {
        padding: 16,
    },
    card: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderLeftWidth: 4,
        borderLeftColor: '#3498db',
    },
    cardHeader: {
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
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    row: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    label: {
        color: '#888',
        width: 80,
        fontSize: 14,
    },
    value: {
        color: '#ddd',
        flex: 1,
        fontSize: 14,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#2a2a2a',
    },
    previoButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        padding: 6,
    },
    previoButtonText: {
        color: '#3498db',
        fontSize: 13,
        fontWeight: '600',
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: '#888',
        fontSize: 16,
    },
    debugInfo: {
        backgroundColor: '#00ff00', // Green
        padding: 10,
        marginBottom: 10,
    },
    debugText: {
        color: '#000000', // Black
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    }
});
