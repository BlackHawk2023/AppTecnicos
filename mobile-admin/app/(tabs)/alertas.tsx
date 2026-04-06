/**
 * Pantalla de Alertas
 * Lista las alertas de stock con filtros por tipo
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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import {
  getAlertas,
  resolverAlerta,
  Alerta,
} from '../../services/alertas.service';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

// Filtros por tipo de alerta (lo que existe en el backend)
const TIPOS = [
  { value: '', label: 'TODAS' },
  { value: 'SERIE_DUPLICADA', label: 'Serie Duplicada' },
  { value: 'STOCK_NEGATIVO', label: 'Stock Negativo' },
];

// Filtros por estado
const ESTADOS = [
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'resueltas', label: 'Resueltas' },
];

export default function AlertasScreen() {
  const { user } = useAuth();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState('');
  const [selectedEstado, setSelectedEstado] = useState('pendientes');
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;
  const isFetchingRef = useRef(false);

  // Cargar alertas
  const loadAlertas = async (append: boolean = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!append) setIsLoading(true);

    try {
      const skip = append ? alertas.length : 0;

      const response = await getAlertas({
        resuelta: selectedEstado === 'resueltas',
        tipo: selectedTipo || undefined,
        skip,
        limit: LIMIT,
      });

      if (append) {
        setAlertas(prev => [...prev, ...response.alertas]);
      } else {
        setAlertas(response.alertas);
      }

      setTotal(response.total);
      setHasMore(response.alertas.length === LIMIT);
    } catch (error) {
      console.error('Error cargando alertas:', error);
      Alert.alert('Error', 'No se pudo cargar las alertas');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    loadAlertas(false);
  }, [selectedTipo, selectedEstado]);

  // Refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAlertas(false);
  }, [selectedTipo, selectedEstado]);

  // Cargar más
  const loadMore = () => {
    if (hasMore && !isLoading) {
      loadAlertas(true);
    }
  };

  // Obtener color según tipo
  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'SERIE_DUPLICADA': return '#ff6b35';
      case 'STOCK_NEGATIVO': return Colors.error;
      default: return Colors.warning;
    }
  };

  // Obtener icono según tipo
  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'SERIE_DUPLICADA': return '🔁';
      case 'STOCK_NEGATIVO': return '📉';
      default: return '⚠️';
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

  // Manejar acción sobre alerta
  const handleAlertaAction = (alerta: Alerta) => {
    if (alerta.resuelta) {
      // Ya resuelta, mostrar detalles
      Alert.alert(
        alerta.tipo.replace('_', ' '),
        `${alerta.descripcion}\n\nResuelta por: ${alerta.resuelta_por || 'N/A'}\n${alerta.comentario_resolucion || ''}`,
      );
      return;
    }

    Alert.alert(
      alerta.tipo.replace('_', ' '),
      alerta.descripcion,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resolver',
          onPress: () => showResolverDialog(alerta),
          style: 'default'
        },
      ]
    );
  };

  // Dialogar para resolver
  const showResolverDialog = (alerta: Alerta) => {
    Alert.prompt(
      'Resolver Alerta',
      'Agregue un comentario sobre cómo se resolvió (opcional):',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resolver',
          onPress: async (comentario?: string) => {
            try {
              await resolverAlerta(alerta.id, comentario);
              loadAlertas(false);
              Alert.alert('Éxito', 'Alerta resuelta');
            } catch (error) {
              Alert.alert('Error', 'No se pudo resolver la alerta');
            }
          },
        },
      ],
      'plain-text'
    );
  };

  // Renderizar item de alerta
  const renderAlertaItem = ({ item }: { item: Alerta }) => {
    const tipoColor = getTipoColor(item.tipo);

    return (
      <TouchableOpacity
        style={[
          styles.alertaItem,
          item.resuelta && styles.alertaItemResuelta
        ]}
        onPress={() => handleAlertaAction(item)}
      >
        <View style={styles.alertaHeader}>
          <Text style={styles.alertaIcon}>{getTipoIcon(item.tipo)}</Text>
          <View style={styles.alertaInfo}>
            <Text style={styles.alertaTitulo}>{item.tipo.replace('_', ' ')}</Text>
            <Text style={styles.alertaMensaje} numberOfLines={2}>{item.descripcion}</Text>
          </View>
          <View style={[styles.tipoBadge, { backgroundColor: tipoColor }]}>
            <Text style={styles.tipoBadgeText}>{item.tipo === 'SERIE_DUPLICADA' ? 'SD' : 'SN'}</Text>
          </View>
        </View>

        <View style={styles.alertaFooter}>
          <Text style={styles.alertaFecha}>{formatDate(item.fecha_creacion)}</Text>
          <Text style={[
            styles.alertaEstado,
            { color: item.resuelta ? Colors.success : Colors.warning }
          ]}>
            {item.resuelta ? 'RESUELTA' : 'PENDIENTE'}
          </Text>
        </View>

        {item.codigo_material && (
          <View style={styles.alertaMaterial}>
            <Text style={styles.materialLabel}>Material:</Text>
            <Text style={styles.materialValue}>{item.codigo_material}</Text>
            {item.serie && (
              <>
                <Text style={styles.materialLabel}> | Serie:</Text>
                <Text style={styles.materialValue}>{item.serie}</Text>
              </>
            )}
          </View>
        )}

        {item.tecnico_nombre && (
          <View style={styles.alertaTecnico}>
            <Text style={styles.materialLabel}>Técnico:</Text>
            <Text style={styles.materialValue}>{item.tecnico_nombre}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Footer de la lista
  const renderFooter = () => {
    if (isLoading && alertas.length > 0) {
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
        <Text style={styles.emptyIcon}>✅</Text>
        <Text style={styles.emptyText}>
          {selectedEstado === 'resueltas' ? 'No hay alertas resueltas' : 'No hay alertas pendientes'}
        </Text>
        <Text style={styles.emptySubtext}>
          {selectedEstado === 'pendientes' ? '¡Todo en orden!' : 'No se encontraron alertas con estos filtros'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Filtros de estado */}
      <View style={styles.estadoFilters}>
        {ESTADOS.map((estado) => (
          <TouchableOpacity
            key={estado.value}
            style={[
              styles.estadoChip,
              selectedEstado === estado.value && styles.estadoChipActive,
            ]}
            onPress={() => setSelectedEstado(estado.value)}
          >
            <Text style={[
              styles.estadoChipText,
              selectedEstado === estado.value && styles.estadoChipTextActive,
            ]}>
              {estado.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filtros por tipo */}
      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TIPOS}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                (item.value === '' && !selectedTipo) || selectedTipo === item.value
                  ? styles.filterChipActive
                  : null,
              ]}
              onPress={() => setSelectedTipo(item.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  (item.value === '' && !selectedTipo) || selectedTipo === item.value
                    ? styles.filterChipTextActive
                    : null,
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
        <Text style={styles.countText}>{total} alertas</Text>
      </View>

      {/* Lista de alertas */}
      {isLoading && alertas.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={alertas}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderAlertaItem}
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
  estadoFilters: {
    flexDirection: 'row',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  estadoChip: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  estadoChipActive: {
    backgroundColor: Colors.primary,
  },
  estadoChipText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  estadoChipTextActive: {
    color: Colors.white,
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
    paddingBottom: 20,
  },
  alertaItem: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  alertaItemResuelta: {
    opacity: 0.6,
  },
  alertaHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alertaIcon: {
    fontSize: 24,
    marginRight: Spacing.sm,
  },
  alertaInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  alertaTitulo: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  alertaMensaje: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  tipoBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipoBadgeText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
  },
  alertaFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  alertaFecha: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  alertaEstado: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  alertaMaterial: {
    flexDirection: 'row',
    marginTop: Spacing.xs,
  },
  alertaTecnico: {
    flexDirection: 'row',
    marginTop: Spacing.xs,
  },
  materialLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  materialValue: {
    fontSize: FontSizes.sm,
    color: Colors.text,
    fontWeight: '500',
    marginLeft: 4,
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
});
