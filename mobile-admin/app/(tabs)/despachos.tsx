import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDespachos, DespachoListItem } from '../../services/despachos.service';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

export default function DespachosScreen() {
    const { user, codigoBase } = useAuth();
    const [despachos, setDespachos] = useState<DespachoListItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadDespachos = async () => {
        try {
            // Filtrar despachos para mostrar los EN_PROGRESO, que son los que se interactúan
            const data = await getDespachos({ estado: 'EN_PROGRESO', limit: 50 });
            // Adicionalmente se podrían traer otras pero priorizamos las activas
            setDespachos(data);
            setError(null);
        } catch (err: any) {
            console.error('Error fetching despachos:', err);
            setError(err.message || 'Error al cargar despachos');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadDespachos();
        }, [])
    );

    const onRefresh = () => {
        setIsRefreshing(true);
        loadDespachos();
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'EN_PROGRESO':
                return Colors.primary;
            case 'SOLICITADO':
                return Colors.warning;
            case 'CERRADO':
                return Colors.success;
            case 'CANCELADO':
                return Colors.error;
            default:
                return Colors.textSecondary;
        }
    };

    const renderDespachoItem = ({ item }: { item: DespachoListItem }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/despachos/${item.id}` as any)}
        >
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Despacho #{item.id}</Text>
                <View
                    style={[
                        styles.statusBadge,
                        { borderColor: getStatusColor(item.estado) },
                        { backgroundColor: getStatusColor(item.estado) + '20' },
                    ]}
                >
                    <Text style={[styles.statusText, { color: getStatusColor(item.estado) }]}>
                        {item.estado.replace('_', ' ')}
                    </Text>
                </View>
            </View>

            <View style={styles.cardBody}>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Almacén:</Text>
                    <Text style={styles.detailValue}>{item.almacen_id}</Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Cajas / Abiertas:</Text>
                    <Text style={styles.detailValue}>{item.total_cajas} / {item.cajas_abiertas}</Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Fecha:</Text>
                    <Text style={styles.detailValue}>
                        {new Date(item.fecha_creacion).toLocaleDateString('es-AR')}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    if (isLoading && !isRefreshing) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={{ marginTop: Spacing.md, color: Colors.textSecondary }}>Cargando despachos...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            {error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            <FlatList
                data={despachos}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderDespachoItem}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>🚚</Text>
                        <Text style={styles.emptyText}>No hay despachos en progreso.</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
    },
    listContent: {
        padding: Spacing.md,
        flexGrow: 1,
    },
    errorContainer: {
        backgroundColor: Colors.error + '20',
        padding: Spacing.md,
        margin: Spacing.md,
        borderRadius: BorderRadius.md,
        borderLeftWidth: 4,
        borderLeftColor: Colors.error,
    },
    errorText: {
        color: Colors.error,
        fontSize: FontSizes.sm,
    },
    card: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginBottom: Spacing.md,
        ...Shadows.sm,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: Colors.borderLight,
        paddingBottom: Spacing.sm,
    },
    cardTitle: {
        fontSize: FontSizes.lg,
        fontWeight: 'bold',
        color: Colors.text,
    },
    statusBadge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
    },
    statusText: {
        fontSize: FontSizes.xs,
        fontWeight: 'bold',
    },
    cardBody: {},
    detailRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    detailLabel: {
        width: 120,
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    detailValue: {
        flex: 1,
        fontSize: FontSizes.sm,
        color: Colors.text,
        fontWeight: '600',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: Spacing.md,
    },
    emptyText: {
        fontSize: FontSizes.md,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
});
