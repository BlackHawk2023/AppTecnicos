/**
 * Pantalla de Detalle de Transferencia
 * Muestra los detalles de una transferencia y permite aceptar/rechazar/cancelar
 * Cuando la transferencia estÃ¡ PENDIENTE y el destino es el encargado:
 *   - Buscador + scanner para filtrar items
 *   - VerificaciÃ³n individual por item (serializado = check, no-serializado = cantidad)
 *   - BotÃ³n Aceptar habilitado una vez que al menos un item fue verificado
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
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

  // VerificaciÃ³n de items (item_id â†’ cantidad aceptada)
  const [verificados, setVerificados] = useState<Record<number, number>>({});
  const [searchVerif, setSearchVerif] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // Modal de cantidad para items no serializados
  const [cantidadModal, setCantidadModal] = useState<{ visible: boolean; item: TransferenciaItem | null }>({ visible: false, item: null });
  const [cantidadInput, setCantidadInput] = useState('');

  useEffect(() => {
    loadTransferencia();
  }, [transferenciaId]);

  const loadTransferencia = async () => {
    try {
      const data = await getTransferencia(transferenciaId);
      setTransferencia(data);
      setVerificados({});
    } catch (error) {
      console.error('Error cargando transferencia:', error);
      Alert.alert('Error', 'No se pudo cargar la transferencia');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE': return Colors.warning;
      case 'ACEPTADA': return Colors.success;
      case 'RECHAZADA': return Colors.error;
      case 'CANCELADA': return Colors.textSecondary;
      default: return Colors.textSecondary;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const puedeResponder = () => {
    return !!(transferencia && transferencia.estado === 'PENDIENTE');
  };

  const puedeCancelar = () => {
    return !!(transferencia && transferencia.estado === 'PENDIENTE');
  };

  // â”€â”€â”€ Scanner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const startScanning = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Permiso denegado', 'Se necesita acceso a la cámara para escanear.');
        return;
      }
    }
    setIsScanning(true);
  };

  const handleBarCodeScanned = ({ data }: { type: string; data: string }) => {
    setIsScanning(false);
    setSearchVerif(data);
  };

  // â”€â”€â”€ VerificaciÃ³n de items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleVerificarItem = (item: TransferenciaItem) => {
    const esSeriado = !!item.serie;

    if (esSeriado) {
      // Toggle simple
      setVerificados(prev => {
        const next = { ...prev };
        if (next[item.id]) {
          delete next[item.id];
        } else {
          next[item.id] = 1;
        }
        return next;
      });
    } else {
      // Abrir modal de cantidad
      setCantidadInput(item.cantidad_solicitada.toString());
      setCantidadModal({ visible: true, item });
    }
  };

  const confirmarCantidad = () => {
    const item = cantidadModal.item;
    if (!item) return;
    const cant = parseInt(cantidadInput, 10);
    if (isNaN(cant) || cant <= 0) {
      Alert.alert('Cantidad inválida', 'Ingrese un número mayor a 0');
      return;
    }
    if (cant > item.cantidad_solicitada) {
      Alert.alert('Cantidad excedida', `No puede superar la cantidad solicitada (${item.cantidad_solicitada})`);
      return;
    }
    setVerificados(prev => ({ ...prev, [item.id]: cant }));
    setCantidadModal({ visible: false, item: null });
  };

  const quitarVerificacion = (item: TransferenciaItem) => {
    setVerificados(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  };

  // â”€â”€â”€ Aceptar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleAceptar = async () => {
    if (!transferencia) return;
    const itemsVerificados = Object.entries(verificados).map(([id, cantidad]) => ({
      item_id: Number(id),
      aceptar: true,
      cantidad_aceptada: Number(cantidad),
    }));

    Alert.alert(
      'Aceptar Transferencia',
      `Se aceptarán ${itemsVerificados.length} item(s) verificado(s). ¿Confirmar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aceptar',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await responderTransferencia(transferencia.id, {
                accion: 'ACEPTAR',
                items: itemsVerificados,
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

  // â”€â”€â”€ Rechazar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
              await responderTransferencia(transferencia.id, { accion: 'RECHAZAR' });
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

  // â”€â”€â”€ Cancelar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Render item (modo verificaciÃ³n) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const renderItemVerificacion = (item: TransferenciaItem, index: number) => {
    const esSeriado = !!item.serie;
    const verificado = verificados[item.id] !== undefined;
    const cantAceptada = verificados[item.id];

    return (
      <View key={item.id || index} style={[styles.itemCard, verificado && styles.itemCardVerificado]}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemCodigo}>{item.codigo_material}</Text>
          {verificado ? (
            <TouchableOpacity onPress={() => quitarVerificacion(item)} style={styles.checkBadge}>
              <Text style={styles.checkBadgeText}>✓ {esSeriado ? 'OK' : cantAceptada}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.verificarBtn}
              onPress={() => handleVerificarItem(item)}
            >
              <Text style={styles.verificarBtnText}>{esSeriado ? 'Confirmar' : 'Verificar'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {item.nombre_material && (
          <Text style={styles.itemDescripcion}>{item.nombre_material}</Text>
        )}

        <View style={styles.itemDetails}>
          <View style={styles.itemDetail}>
            <Text style={styles.itemDetailLabel}>Solicitado:</Text>
            <Text style={styles.itemDetailValue}>{item.cantidad_solicitada}</Text>
          </View>
          {item.serie && (
            <View style={styles.itemDetail}>
              <Text style={styles.itemDetailLabel}>Serie:</Text>
              <Text style={styles.itemDetailValue}>{item.serie}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // â”€â”€â”€ Render item (modo solo lectura) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Loading / not found â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const esResponder = puedeResponder();
  const totalVerificados = Object.keys(verificados).length;

  // Filtrado de items para la vista de verificaciÃ³n
  const itemsFiltrados = esResponder && searchVerif
    ? transferencia.items.filter(item =>
        item.codigo_material.toLowerCase().includes(searchVerif.toLowerCase()) ||
        (item.nombre_material || '').toLowerCase().includes(searchVerif.toLowerCase()) ||
        (item.serie || '').toLowerCase().includes(searchVerif.toLowerCase())
      )
    : transferencia.items;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>

      {/* â”€â”€ Scanner overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal
        visible={isScanning}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setIsScanning(false)}
      >
        <View style={StyleSheet.absoluteFillObject}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
            }}
            onBarcodeScanned={handleBarCodeScanned}
          />
          <TouchableOpacity style={styles.closeScannerButton} onPress={() => setIsScanning(false)}>
            <Text style={styles.closeScannerText}>Cancelar Escaneo</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* â”€â”€ Modal cantidad (items no serializados) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal
        visible={cantidadModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setCantidadModal({ visible: false, item: null })}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Cantidad a aceptar</Text>
            {cantidadModal.item && (
              <Text style={styles.modalSubtitle}>
                {cantidadModal.item.codigo_material} - solicitado: {cantidadModal.item.cantidad_solicitada}
              </Text>
            )}
            <TextInput
              style={styles.modalInput}
              value={cantidadInput}
              onChangeText={setCantidadInput}
              keyboardType="numeric"
              autoFocus
              selectTextOnFocus
              placeholder="Cantidad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCantidadModal({ visible: false, item: null })}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmarCantidad}>
                <Text style={styles.modalConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
            {esResponder && totalVerificados > 0 && (
              <Text style={styles.verificadosCount}> · {totalVerificados} verificado(s)</Text>
            )}
          </Text>

          {/* Buscador + Scanner â€” solo en modo verificaciÃ³n */}
          {esResponder && (
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={searchVerif}
                onChangeText={setSearchVerif}
                placeholder="Buscar por material o serie..."
                placeholderTextColor={Colors.textSecondary}
                clearButtonMode="while-editing"
              />
              <TouchableOpacity style={styles.scanBtn} onPress={startScanning}>
                <Text style={styles.scanBtnText}>📷</Text>
              </TouchableOpacity>
            </View>
          )}

          {itemsFiltrados.map((item, index) =>
            esResponder
              ? renderItemVerificacion(item, index)
              : renderItem(item, index)
          )}
        </View>
      </ScrollView>

      {/* Botones de accion */}
      {(esResponder || puedeCancelar()) && (
        <View style={styles.actionButtons}>
          {esResponder && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={handleRechazar}
                disabled={isProcessing}
              >
                {isProcessing
                  ? <ActivityIndicator size="small" color={Colors.error} />
                  : <Text style={styles.rejectButtonText}>Rechazar</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.acceptButton,
                  totalVerificados === 0 && styles.acceptButtonDisabled,
                ]}
                onPress={handleAceptar}
                disabled={isProcessing || totalVerificados === 0}
              >
                {isProcessing
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={styles.acceptButtonText}>
                      Aceptar{totalVerificados > 0 ? ` (${totalVerificados})` : ''}
                    </Text>
                }
              </TouchableOpacity>
            </>
          )}

          {!esResponder && puedeCancelar() && (
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={handleCancelar}
              disabled={isProcessing}
            >
              {isProcessing
                ? <ActivityIndicator size="small" color={Colors.error} />
                : <Text style={styles.cancelButtonText}>Cancelar Transferencia</Text>
              }
            </TouchableOpacity>
          )}
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
  // â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  // â”€â”€ Ruta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  // â”€â”€ Comentario â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  // â”€â”€ Items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  itemsSection: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  verificadosCount: {
    fontSize: FontSizes.md,
    fontWeight: '500',
    color: Colors.success,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  scanBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBtnText: {
    fontSize: 20,
  },
  itemCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  itemCardVerificado: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.success,
    backgroundColor: Colors.success + '0A',
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
    flex: 1,
  },
  itemEstado: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  verificarBtn: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  verificarBtnText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
  checkBadge: {
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  checkBadgeText: {
    fontSize: FontSizes.sm,
    color: Colors.white,
    fontWeight: '700',
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
  noResults: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  // â”€â”€ Botones de acciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  acceptButtonDisabled: {
    backgroundColor: Colors.border,
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
  // â”€â”€ Scanner overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  closeScannerButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  closeScannerText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  // â”€â”€ Modal cantidad â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.xl,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modalCancelBtn: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  modalCancelText: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: Colors.white,
    fontWeight: '600',
  },
});
