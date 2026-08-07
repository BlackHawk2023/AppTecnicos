/**
 * Pantalla para Recibir Transferencias
 * Lista las transferencias pendientes dirigidas a la base del encargado
 * Permite aceptar o rechazar transferencias
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import {
    getTransferencias,
    responderTransferencia,
    Transferencia
} from '../../services/transferencias.service';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

export default function RecibirTransferenciasScreen() {
    const { user, codigoBase } = useAuth();
    const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const LIMIT = 20;

    // Cargar transferencias pendientes dirigidas a mi base
    const loadTransferencias = async (append: boolean = false) => {
        try {
            const skip = append ? transferencias.length : 0;

            const response = await getTransferencias({
                estado: 'PENDIENTE',
                ubicacion: codigoBase || undefined,
                skip,
                limit: LIMIT,
            });

            if (append) {
                setTransferencias(prev => [...prev, ...response.items]);
            } else {
                setTransferencias(response.items);
            }

            setTotal(response.total);
            setHasMore(response.items.length === LIMIT);
        } catch (error) {
            console.error('Error cargando transferencias:', error);
            Alert.alert('Error', 'No se pudieron cargar las transferencias pendientes');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadTransferencias(false);
    }, []);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadTransferencias(false);
    }, [codigoBase]);

    const loadMore = () => {
        if (hasMore && !isLoading) {
            loadTransferencias(true);
        }
    };

    // Formatear fecha
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Aceptar transferencia rápida
    const handleAceptar = async (transferencia: Transferencia) => {
        Alert.alert(
            'Aceptar Transferencia',
            `¿Aceptar transferencia #${transferencia.id} desde ${transferencia.origen_ubicacion}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Aceptar',
                    onPress: async () => {
                        setIsProcessing(true);
                        try {
                            await responderTransferencia(transferencia.id, { accion: 'ACEPTAR' });
                            Alert.alert('Éxito', 'Transferencia aceptada');
                            loadTransferencias(false);
                        } catch (error: any) {
                            const msg = error?.response?.data?.detail || error.message || 'No se pudo aceptar';
                            Alert.alert('Error', msg);
                        } finally {
                            setIsProcessing(false);
                        }
                    },
                },
            ]
        );
    };

    // Rechazar transferencia rápida
    const handleRechazar = async (transferencia: Transferencia) => {
        Alert.alert(
            'Rechazar Transferencia',
            `¿Rechazar transferencia #${transferencia.id}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Rechazar',
                    style: 'destructive',
                    onPress: async () => {
                        setIsProcessing(true);
                        try {
                            await responderTransferencia(transferencia.id, { accion: 'RECHAZAR' });
                            Alert.alert('Éxito', 'Transferencia rechazada');
                            loadTransferencias(false);
                        } catch (error: any) {
                            const msg = error?.response?.data?.detail || error.message || 'No se pudo rechazar';
                            Alert.alert('Error', msg);
                        } finally {
                            setIsProcessing(false);
                        }
                    },
                },
            ]
        );
    };

    // Renderizar item
    const renderItem = ({ item }: { item: Transferencia }) => (
        <View style={styles.itemCard}>
            <TouchableOpacity
                style={styles.itemContent}
                onPress={() => router.push(`/transferencias/detalle?id=${item.id}`)}
            >
                <View style={styles.itemHeader}>
                    <Text style={styles.itemId}>#{item.id}</Text>
                    <Text style={styles.itemFecha}>{formatDate(item.fecha_creacion)}</Text>
                </View>

                <View style={styles.itemRoute}>
                    <Text style={styles.routeLabel}>De:</Text>
                    <Text style={styles.routeValue}>{item.origen_ubicacion}</Text>
                </View>
                <View style={styles.itemRoute}>
                    <Text style={styles.routeLabel}>A:</Text>
                    <Text style={styles.routeValue}>{item.destino_ubicacion}</Text>
                </View>

                <Text style={styles.itemCount}>
                    {item.items.length} item{item.items.length !== 1 ? 's' : ''}
                </Text>

                {item.comentario && (
                    <Text style={styles.itemComment} numberOfLines={1}>
                        💬 {item.comentario}
                    </Text>
                )}
            </TouchableOpacity>

            {/* Botones de acción rápida */}
            <View style={styles.actionRow}>
                <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => handleRechazar(item)}
                    disabled={isProcessing}
                >
                    <Text style={styles.rejectBtnText}>Rechazar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => handleAceptar(item)}
                    disabled={isProcessing}
                >
                    <Text style={styles.acceptBtnText}>Aceptar</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    // Footer de la lista
    const renderFooter = () => {
        if (isLoading && transferencias.length > 0) {
            return (
                <View style={styles.loadingMore}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                </View>
            );
        }
        return null;
    };

    // Lista vacía
    const renderEmpty = () => {
        if (isLoading) return null;
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyText}>No hay transferencias pendientes</Text>
                <Text style={styles.emptySubtext}>
                    Cuando alguien te envíe una transferencia, aparecerá aquí
                </Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Recibir Transferencias</Text>
                <Text style={styles.headerSubtitle}>
                    {total} pendiente{total !== 1 ? 's' : ''}
                </Text>
            </View>

            {/* Lista */}
            {isLoading && transferencias.length === 0 ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={transferencias}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
                    }
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={renderFooter}
                    ListEmptyComponent={renderEmpty}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        backgroundColor: Colors.surface,
        padding: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    headerTitle: {
        fontSize: FontSizes.xl,
        fontWeight: '600',
        color: Colors.text,
    },
    headerSubtitle: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        marginTop: Spacing.xs,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: Spacing.md,
        paddingBottom: 20,
    },
    itemCard: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.md,
        ...Shadows.sm,
        overflow: 'hidden',
    },
    itemContent: {
        padding: Spacing.md,
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    itemId: {
        fontSize: FontSizes.md,
        fontWeight: '600',
        color: Colors.primary,
    },
    itemFecha: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
    },
    itemRoute: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    routeLabel: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        width: 30,
    },
    routeValue: {
        fontSize: FontSizes.sm,
        fontWeight: '500',
        color: Colors.text,
    },
    itemCount: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        marginTop: Spacing.xs,
    },
    itemComment: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        marginTop: Spacing.xs,
        fontStyle: 'italic',
    },
    actionRow: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    rejectBtn: {
        flex: 1,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
        borderRightWidth: 1,
        borderRightColor: Colors.border,
    },
    rejectBtnText: {
        fontSize: FontSizes.sm,
        fontWeight: '600',
        color: Colors.error,
    },
    acceptBtn: {
        flex: 1,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
        backgroundColor: Colors.success + '10',
    },
    acceptBtnText: {
        fontSize: FontSizes.sm,
        fontWeight: '600',
        color: Colors.success,
    },
    loadingMore: {
        paddingVertical: Spacing.lg,
        alignItems: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: Spacing.xxl,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: Spacing.md,
    },
    emptyText: {
        fontSize: FontSizes.lg,
        color: Colors.text,
        fontWeight: '500',
        marginBottom: Spacing.xs,
    },
    emptySubtext: {
        fontSize: FontSizes.md,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
});
