import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { RoutesService } from '../../services/routes.service';
import { StatusBar } from 'expo-status-bar';

export default function RutaDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [rutaFull, setRutaFull] = useState<any | null>(null);

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
                    // Navigate to detailed service view (composite key)
                    router.push({
                        pathname: "/servicio/detalle",
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
