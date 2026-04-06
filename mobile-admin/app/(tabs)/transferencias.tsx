/**
 * Pantalla de Transferencias
 * Lista las transferencias con filtros por estado
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Transferencia,
  TransferenciaFilters
} from '../../services/transferencias.service';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

// Estados de transferencia
const ESTADOS = [
  { value: '', label: 'TODAS' },
  { value: 'PENDIENTE', label: 'Pendientes' },
  { value: 'ACEPTADA', label: 'Aceptadas' },
  { value: 'RECHAZADA', label: 'Rechazadas' },
  { value: 'CANCELADA', label: 'Canceladas' },
];

export default function TransferenciasScreen() {
  const { codigoBase } = useAuth();
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEstado, setSelectedEstado] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;
  const isFetchingRef = useRef(false);

  // Cargar transferencias
  const loadTransferencias = async (append: boolean = false, estado: string = '') => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!append) setIsLoading(true);

    try {
      const skip = append ? transferencias.length : 0;

      const response = await getTransferencias({
        estado: estado || undefined,
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
      Alert.alert('Error', 'No se pudo cargar las transferencias');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTransferencias(false, selectedEstado);
  }, [selectedEstado]);

  // Refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTransferencias(false, selectedEstado);
  }, [selectedEstado]);

  // Cargar más
  const loadMore = () => {
    if (hasMore && !isLoading) {
      loadTransferencias(true, selectedEstado);
    }
  };

  // Obtener color del estado
  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE': return Colors.warning;
      case 'ACEPTADA': return Colors.success;
      case 'RECHAZADA': return Colors.error;
      case 'CANCELADA': return Colors.textSecondary;
      default: return Colors.textSecondary;
    }
  };

  // Formatear fecha
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // Renderizar item de transferencia
  const renderTransferenciaItem = ({ item }: { item: Transferencia }) => {
    const estadoColor = getEstadoColor(item.estado);

    return (
      <TouchableOpacity
        style={styles.transferenciaItem}
        onPress={() => router.push(`/transferencias/detalle?id=${item.id}`)}
      >
        <View style={styles.transferenciaHeader}>
          <View style={styles.transferenciaInfo}>
            <Text style={styles.transferenciaNumero}>#{item.id}</Text>
            <Text style={styles.transferenciaFecha}>{formatDate(item.fecha_creacion)}</Text>
          </View>
          <View style={[styles.estadoBadge, { backgroundColor: estadoColor + '20' }]}>
            <Text style={[styles.estadoText, { color: estadoColor }]}>{item.estado}</Text>
          </View>
        </View>

        <View style={styles.transferenciaRuta}>
          <View style={styles.rutaPunto}>
            <Text style={styles.rutaLabel}>Desde:</Text>
            <Text style={styles.rutaValue}>{item.origen_ubicacion_completa || item.origen_ubicacion}</Text>
          </View>
          <Text style={styles.rutaFlecha}>→</Text>
          <View style={styles.rutaPunto}>
            <Text style={styles.rutaLabel}>Hasta:</Text>
            <Text style={styles.rutaValue}>{item.destino_ubicacion_completa || item.destino_ubicacion}</Text>
          </View>
        </View>

        <View style={styles.transferenciaFooter}>
          <Text style={styles.itemsCount}>{item.items.length} items</Text>
          {item.comentario && (
            <Text style={styles.observaciones} numberOfLines={1}>
              {item.comentario}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

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
        <Text style={styles.emptyIcon}>🔄</Text>
        <Text style={styles.emptyText}>No hay transferencias</Text>
        <Text style={styles.emptySubtext}>
          {selectedEstado ? `No hay transferencias ${selectedEstado.toLowerCase()}` : 'Crea una nueva transferencia'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Filtros de estado */}
      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={ESTADOS}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedEstado === item.value ? styles.filterChipActive : null,
              ]}
              onPress={() => setSelectedEstado(item.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedEstado === item.value ? styles.filterChipTextActive : null,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.filtersList}
        />
      </View>

      {/* Contador */}
      <View style={styles.countContainer}>
        <Text style={styles.countText}>{total} transferencias</Text>
      </View>

      {/* Lista de transferencias */}
      {isLoading && transferencias.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={transferencias}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderTransferenciaItem}
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

      {/* Botón flotante para nueva transferencia */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/transferencias/nueva')}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  filtersContainer: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filtersList: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    marginRight: Spacing.sm,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
  },
  filterChipText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: Colors.white,
  },
  countContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  countText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: Spacing.md,
    paddingBottom: 80,
  },
  transferenciaItem: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  transferenciaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  transferenciaInfo: {
    flex: 1,
  },
  transferenciaNumero: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  transferenciaFecha: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  estadoBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  estadoText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  transferenciaRuta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  rutaPunto: {
    flex: 1,
  },
  rutaLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  rutaValue: {
    fontSize: FontSizes.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  rutaFlecha: {
    fontSize: FontSizes.lg,
    color: Colors.primary,
    marginHorizontal: Spacing.sm,
  },
  transferenciaFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  itemsCount: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  observaciones: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    flex: 1,
    textAlign: 'right',
    marginLeft: Spacing.sm,
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
  },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.md,
  },
  fabIcon: {
    fontSize: 28,
    color: Colors.white,
    fontWeight: 'bold',
  },
});
