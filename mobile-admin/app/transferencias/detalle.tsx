/**
 * Pantalla de Detalle de Transferencia
 * Muestra los detalles de una transferencia y permite aceptar/rechazar/cancelar
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
import {
  getTransferencia,
  responderTransferencia,
  cancelarTransferencia,
  Transferencia,
  TransferenciaItem
} from '../../services/transferencias.service';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

export default function DetalleTransferenciaScreen() {
  const { user, codigoBase } = useAuth();
  const params = useLocalSearchParams();
  const transferenciaId = parseInt(params.id as string);

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transferencia, setTransferencia] = useState<Transferencia | null>(null);

  useEffect(() => {
    loadTransferencia();
  }, [transferenciaId]);

  const loadTransferencia = async () => {
    try {
      const data = await getTransferencia(transferenciaId);
      setTransferencia(data);
    } catch (error) {
      console.error('Error cargando transferencia:', error);
      Alert.alert('Error', 'No se pudo cargar la transferencia');
      router.back();
    } finally {
      setIsLoading(false);
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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Verificar si el usuario puede responder (si es el destino y está pendiente)
  const puedeResponder = () => {
    if (!transferencia || transferencia.estado !== 'PENDIENTE') return false;
    // El encargado puede responder si el destino coincide con su base
    return transferencia.destino_ubicacion === codigoBase ||
      transferencia.destino_almacen_id === codigoBase;
  };

  // Verificar si el usuario puede cancelar (si es el origen y está pendiente)
  const puedeCancelar = () => {
    if (!transferencia || transferencia.estado !== 'PENDIENTE') return false;
    return transferencia.origen_ubicacion === codigoBase ||
      transferencia.origen_almacen_id === codigoBase;
  };

  // Aceptar transferencia
  const handleAceptar = async () => {
    if (!transferencia) return;

    Alert.alert(
      'Aceptar Transferencia',
      '¿Está seguro de aceptar esta transferencia?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aceptar',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await responderTransferencia(transferencia.id, {
                accion: 'aceptar',
              });
              Alert.alert('Éxito', 'Transferencia aceptada correctamente');
              loadTransferencia();
            } catch (error: any) {
              const msg = error?.response?.data?.detail || error.message || 'No se pudo aceptar la transferencia';
              Alert.alert('Error', msg);
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  // Rechazar transferencia
  const handleRechazar = async () => {
    if (!transferencia) return;

    Alert.alert(
      'Rechazar Transferencia',
      '¿Está seguro de rechazar esta transferencia?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await responderTransferencia(transferencia.id, {
                accion: 'rechazar',
              });
              Alert.alert('Éxito', 'Transferencia rechazada');
              loadTransferencia();
            } catch (error: any) {
              const msg = error?.response?.data?.detail || error.message || 'No se pudo rechazar la transferencia';
              Alert.alert('Error', msg);
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  // Cancelar transferencia
  const handleCancelar = async () => {
    if (!transferencia) return;

    Alert.alert(
      'Cancelar Transferencia',
      '¿Está seguro de cancelar esta transferencia?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, Cancelar',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await cancelarTransferencia(transferencia.id);
              Alert.alert('Éxito', 'Transferencia cancelada');
              loadTransferencia();
            } catch (error: any) {
              const msg = error?.response?.data?.detail || error.message || 'No se pudo cancelar la transferencia';
              Alert.alert('Error', msg);
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  // Renderizar item de transferencia
  const renderItem = (item: TransferenciaItem, index: number) => (
    <View key={item.id || index} style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemCodigo}>{item.codigo_material}</Text>
        <Text style={[styles.itemEstado, { color: getEstadoColor(item.estado) }]}>
          {item.estado}
        </Text>
      </View>
      {item.nombre_material && (
        <Text style={styles.itemDescripcion}>{item.nombre_material}</Text>
      )}

      <View style={styles.itemDetails}>
        <View style={styles.itemDetail}>
          <Text style={styles.itemDetailLabel}>Solicitado:</Text>
          <Text style={styles.itemDetailValue}>{item.cantidad_solicitada}</Text>
        </View>

        {item.cantidad_aceptada !== null && (
          <View style={styles.itemDetail}>
            <Text style={styles.itemDetailLabel}>Aceptado:</Text>
            <Text style={[styles.itemDetailValue, { color: Colors.success }]}>
              {item.cantidad_aceptada}
            </Text>
          </View>
        )}

        {item.serie && (
          <View style={styles.itemDetail}>
            <Text style={styles.itemDetailLabel}>Serie:</Text>
            <Text style={styles.itemDetailValue}>{item.serie}</Text>
          </View>
        )}
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!transferencia) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>No se encontró la transferencia</Text>
      </View>
    );
  }

  const estadoColor = getEstadoColor(transferencia.estado);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header con estado */}
        <View style={[styles.headerCard, { borderLeftColor: estadoColor }]}>
          <View style={styles.headerTop}>
            <Text style={styles.numeroTransferencia}>#{transferencia.id}</Text>
            <View style={[styles.estadoBadge, { backgroundColor: estadoColor + '20' }]}>
              <Text style={[styles.estadoText, { color: estadoColor }]}>
                {transferencia.estado}
              </Text>
            </View>
          </View>

          <Text style={styles.fechaText}>Creada: {formatDate(transferencia.fecha_creacion)}</Text>
          {transferencia.creado_por && (
            <Text style={styles.fechaText}>Por: {transferencia.creado_por}</Text>
          )}
        </View>

        {/* Ruta de transferencia */}
        <View style={styles.rutaCard}>
          <View style={styles.rutaPunto}>
            <View style={[styles.rutaIcon, { backgroundColor: Colors.primary + '20' }]}>
              <Text style={styles.rutaIconText}>📤</Text>
            </View>
            <View style={styles.rutaInfo}>
              <Text style={styles.rutaLabel}>Origen</Text>
              <Text style={styles.rutaNombre}>{transferencia.origen_ubicacion}</Text>
              <Text style={styles.rutaTipo}>Almacén: {transferencia.origen_almacen_id}</Text>
            </View>
          </View>

          <View style={styles.rutaLinea}>
            <View style={styles.rutaLineaInner} />
            <Text style={styles.rutaFlecha}>↓</Text>
          </View>

          <View style={styles.rutaPunto}>
            <View style={[styles.rutaIcon, { backgroundColor: Colors.success + '20' }]}>
              <Text style={styles.rutaIconText}>📥</Text>
            </View>
            <View style={styles.rutaInfo}>
              <Text style={styles.rutaLabel}>Destino</Text>
              <Text style={styles.rutaNombre}>{transferencia.destino_ubicacion}</Text>
              <Text style={styles.rutaTipo}>Almacén: {transferencia.destino_almacen_id}</Text>
            </View>
          </View>
        </View>

        {/* Comentario */}
        {transferencia.comentario && (
          <View style={styles.observacionesCard}>
            <Text style={styles.observacionesLabel}>Comentario</Text>
            <Text style={styles.observacionesText}>{transferencia.comentario}</Text>
          </View>
        )}

        {/* Items */}
        <View style={styles.itemsSection}>
          <Text style={styles.sectionTitle}>
            Items ({transferencia.items.length})
          </Text>

          {transferencia.items.map((item, index) => renderItem(item, index))}
        </View>
      </ScrollView>

      {/* Botones de acción: Responder */}
      {puedeResponder() && (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={handleRechazar}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <Text style={styles.rejectButtonText}>Rechazar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={handleAceptar}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.acceptButtonText}>Aceptar</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Botón de cancelar */}
      {puedeCancelar() && (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={handleCancelar}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <Text style={styles.cancelButtonText}>Cancelar Transferencia</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
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
    padding: Spacing.md,
    borderLeftWidth: 4,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  numeroTransferencia: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.text,
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
  fechaText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  rutaCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  rutaPunto: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rutaIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  rutaIconText: {
    fontSize: 20,
  },
  rutaInfo: {
    flex: 1,
  },
  rutaLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  rutaNombre: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  rutaTipo: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  rutaLinea: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  rutaLineaInner: {
    width: 2,
    height: 20,
    backgroundColor: Colors.border,
  },
  rutaFlecha: {
    fontSize: FontSizes.lg,
    color: Colors.primary,
  },
  observacionesCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  observacionesLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  observacionesText: {
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  itemsSection: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  itemCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  itemCodigo: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.primary,
  },
  itemEstado: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  itemDescripcion: {
    fontSize: FontSizes.sm,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  itemDetails: {
    flexDirection: 'row',
    gap: Spacing.lg,
    flexWrap: 'wrap',
  },
  itemDetail: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemDetailLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginRight: Spacing.xs,
  },
  itemDetailValue: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: Colors.text,
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
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: Colors.success,
  },
  acceptButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  rejectButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  rejectButtonText: {
    color: Colors.error,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  cancelButtonText: {
    color: Colors.error,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});
