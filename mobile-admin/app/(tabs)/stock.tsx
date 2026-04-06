/**
 * Pantalla de Stock
 * Lista el stock de la base asignada con filtros y búsqueda
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { getStock, StockItem } from '../../services/stock.service';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

export default function StockScreen() {
  const { codigoBase } = useAuth();
  const [stock, setStock] = useState<StockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const LIMIT = 50;
  const isFetchingRef = useRef(false);

  // Filtros de tipo de material
  const materialTypes = ['TODOS', 'SERIALIZADO', 'UNIDAD'];

  // Cargar stock
  const loadStock = async (append: boolean = false, search?: string, tipo?: string | null) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!append) setIsLoading(true);

    try {
      const skip = append ? stock.length : 0;
      const items = await getStock({
        codigo_base: codigoBase || undefined,
        busqueda: (search ?? searchQuery) || undefined,
        skip,
        limit: LIMIT,
      });

      if (append) {
        setStock(prev => [...prev, ...items]);
      } else {
        setStock(items);
      }
      setHasMore(items.length === LIMIT);
      setTotal(append ? stock.length + items.length : items.length);
    } catch (error) {
      console.error('Error cargando stock:', error);
      Alert.alert('Error', 'No se pudo cargar el stock');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStock(false, searchQuery, selectedType);
  }, [selectedType]);

  // Refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStock(false, searchQuery, selectedType);
  }, [searchQuery, selectedType]);

  // Buscar
  const handleSearch = (text: string) => {
    setSearchQuery(text);
    loadStock(false, text, selectedType);
  };

  // Cargar más
  const loadMore = () => {
    if (hasMore && !isLoading) {
      loadStock(true);
    }
  };

  // Filtrar por tipo
  const handleTypeFilter = (tipo: string) => {
    setSelectedType(tipo === 'TODOS' ? null : tipo);
  };

  // Renderizar item de stock
  const renderStockItem = ({ item }: { item: StockItem }) => {
    const esSerialized = item.unidad_medida === 'SERIALIZADO';
    const estadoColor =
      item.estado === 'DISPONIBLE' ? Colors.success :
        item.estado === 'CONFLICTO' ? Colors.error :
          Colors.warning;

    return (
      <TouchableOpacity
        style={styles.stockItem}
        onPress={() => router.push(`/stock/detalle?id=${item.id}`)}
      >
        <View style={styles.stockHeader}>
          <View style={styles.stockInfo}>
            <Text style={styles.stockCodigo}>{item.codigo_material}</Text>
            <Text style={styles.stockDescripcion} numberOfLines={2}>
              {item.nombre_material}
            </Text>
          </View>
          <View style={[styles.stockBadge, { backgroundColor: estadoColor + '20' }]}>
            <Text style={[styles.stockCantidad, { color: estadoColor }]}>
              {item.cantidad}
            </Text>
            <Text style={[styles.stockUnidad, { color: estadoColor }]}>
              {esSerialized ? 'SER' : 'UND'}
            </Text>
          </View>
        </View>

        {esSerialized && item.serie && (
          <View style={styles.serieContainer}>
            <Text style={styles.serieLabel}>Serie:</Text>
            <Text style={styles.serieValue}>{item.serie}</Text>
          </View>
        )}

        <View style={styles.stockFooter}>
          <Text style={styles.stockUbicacion}>📍 {item.ubicacion_nombre}</Text>
          <Text style={styles.stockTipo}>{item.categoria || item.unidad_medida}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Footer de la lista (loading más)
  const renderFooter = () => {
    if (isLoading && stock.length > 0) {
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
        <Text style={styles.emptyIcon}>📦</Text>
        <Text style={styles.emptyText}>No se encontraron items de stock</Text>
        <Text style={styles.emptySubtext}>
          {searchQuery ? 'Intenta con otra búsqueda' : 'El stock está vacío'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Barra de búsqueda */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por código o descripción..."
          placeholderTextColor={Colors.textLight}
          value={searchQuery}
          onChangeText={handleSearch}
        />
      </View>

      {/* Filtros de tipo */}
      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={materialTypes}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                (item === 'TODOS' && !selectedType) || selectedType === item
                  ? styles.filterChipActive
                  : null,
              ]}
              onPress={() => handleTypeFilter(item)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  (item === 'TODOS' && !selectedType) || selectedType === item
                    ? styles.filterChipTextActive
                    : null,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.filtersList}
        />
      </View>

      {/* Contador */}
      <View style={styles.countContainer}>
        <Text style={styles.countText}>{total} items encontrados</Text>
      </View>

      {/* Lista de stock */}
      {isLoading && stock.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={stock}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderStockItem}
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

      {/* Botón flotante para cargar */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/stock/cargar')}
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
  searchContainer: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
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
  stockItem: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  stockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  stockInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  stockCodigo: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 2,
  },
  stockDescripcion: {
    fontSize: FontSizes.md,
    color: Colors.text,
    fontWeight: '500',
  },
  stockBadge: {
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  stockCantidad: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
  },
  stockUnidad: {
    fontSize: FontSizes.xs,
  },
  serieContainer: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  serieLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginRight: Spacing.xs,
  },
  serieValue: {
    fontSize: FontSizes.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  stockFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  stockUbicacion: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  stockTipo: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
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
