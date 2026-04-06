/**
 * Pantalla de Detalle de Stock
 * Muestra los detalles de un item de stock
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { getStockItem, StockItem } from '../../services/stock.service';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

export default function DetalleStockScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const stockId = parseInt(params.id as string);

  const [isLoading, setIsLoading] = useState(true);
  const [stockItem, setStockItem] = useState<StockItem | null>(null);

  useEffect(() => {
    loadStockItem();
  }, [stockId]);

  const loadStockItem = async () => {
    try {
      const data = await getStockItem(stockId);
      setStockItem(data);
    } catch (error) {
      console.error('Error cargando item:', error);
      Alert.alert('Error', 'No se pudo cargar el item de stock');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  // Obtener color del estado
  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'DISPONIBLE': return Colors.success;
      case 'EN_TRANSFERENCIA': return Colors.warning;
      case 'CONFLICTO': return Colors.error;
      default: return Colors.textSecondary;
    }
  };

  // Formatear fecha
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Navegar a transferir
  const handleTransferir = () => {
    router.push('/transferencias/nueva');
  };

  // Navegar a verificar
  const handleVerificar = () => {
    if (stockItem?.serie) {
      router.push(`/stock/verificar?serie=${stockItem.serie}&codigo_material=${stockItem.codigo_material}`);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!stockItem) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>No se encontró el item</Text>
      </View>
    );
  }

  const estadoColor = getEstadoColor(stockItem.estado);
  const esSerialized = stockItem.unidad_medida === 'SERIALIZADO';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header con código y estado */}
        <View style={[styles.headerCard, { borderLeftColor: estadoColor }]}>
          <Text style={styles.codigoText}>{stockItem.codigo_material}</Text>
          <Text style={styles.descripcionText}>{stockItem.nombre_material}</Text>

          <View style={styles.headerBadges}>
            <View style={[styles.estadoBadge, { backgroundColor: estadoColor + '20' }]}>
              <Text style={[styles.estadoText, { color: estadoColor }]}>
                {stockItem.estado}
              </Text>
            </View>

            <View style={styles.tipoBadge}>
              <Text style={styles.tipoText}>
                {esSerialized ? 'SERIALIZADO' : 'UNIDAD'}
              </Text>
            </View>
          </View>
        </View>

        {/* Cantidad */}
        <View style={styles.cantidadCard}>
          <View style={styles.cantidadItem}>
            <Text style={styles.cantidadValue}>{stockItem.cantidad}</Text>
            <Text style={styles.cantidadLabel}>Cantidad</Text>
          </View>

          {esSerialized && stockItem.serie && (
            <>
              <View style={styles.cantidadDivider} />
              <View style={styles.cantidadItem}>
                <Text style={[styles.cantidadValue, { fontSize: FontSizes.md, color: Colors.primary }]}>
                  {stockItem.serie}
                </Text>
                <Text style={styles.cantidadLabel}>Serie</Text>
              </View>
            </>
          )}
        </View>

        {/* Detalles */}
        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Detalles</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Base:</Text>
            <Text style={styles.detailValue}>
              {stockItem.nombre_base} ({stockItem.codigo_base})
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Ubicación:</Text>
            <Text style={styles.detailValue}>
              {stockItem.ubicacion_nombre} ({stockItem.ubicacion_codigo})
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Condición:</Text>
            <Text style={styles.detailValue}>{stockItem.condicion}</Text>
          </View>

          {stockItem.categoria && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Categoría:</Text>
              <Text style={styles.detailValue}>{stockItem.categoria}</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Tipo:</Text>
            <Text style={styles.detailValue}>
              {esSerialized ? 'Serializado' : 'Por unidad'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Creado:</Text>
            <Text style={styles.detailValue}>
              {formatDate(stockItem.fecha_creacion)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Modificado:</Text>
            <Text style={styles.detailValue}>
              {formatDate(stockItem.fecha_modificacion)}
            </Text>
          </View>

          {stockItem.observaciones && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Observaciones:</Text>
              <Text style={styles.detailValue}>{stockItem.observaciones}</Text>
            </View>
          )}
        </View>

        {/* Información adicional */}
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>
            {esSerialized
              ? 'Este item está serializado. Cada unidad tiene un número de serie único.'
              : 'Este item se maneja por cantidad (unidades).'}
          </Text>
        </View>
      </ScrollView>

      {/* Botones de acción */}
      <View style={styles.actionButtons}>
        {esSerialized && stockItem.serie && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleVerificar}
          >
            <Text style={styles.actionIcon}>🔍</Text>
            <Text style={styles.actionText}>Verificar</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.actionButton, styles.primaryButton]}
          onPress={handleTransferir}
        >
          <Text style={styles.actionIcon}>🔄</Text>
          <Text style={[styles.actionText, styles.primaryButtonText]}>Transferir</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  headerCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderLeftWidth: 4,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  codigoText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  descripcionText: {
    fontSize: FontSizes.xl,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  headerBadges: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  estadoBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  estadoText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  tipoBadge: {
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  tipoText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  cantidadCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  cantidadItem: {
    flex: 1,
    alignItems: 'center',
  },
  cantidadValue: {
    fontSize: FontSizes.xxl,
    fontWeight: 'bold',
    color: Colors.text,
  },
  cantidadLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  cantidadDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.borderLight,
  },
  detailsCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  detailLabel: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: FontSizes.md,
    color: Colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  infoCard: {
    backgroundColor: Colors.info + '10',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.info + '30',
  },
  infoIcon: {
    fontSize: 20,
    marginRight: Spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  actionButtons: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
  },
  actionIcon: {
    fontSize: 18,
  },
  actionText: {
    fontSize: FontSizes.md,
    color: Colors.text,
    fontWeight: '500',
  },
  primaryButtonText: {
    color: Colors.white,
  },
});
