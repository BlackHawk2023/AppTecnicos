/**
 * Pantalla para Verificar Stock
 * Permite verificar y gestionar la existencia de items por número de serie (Serializado) o por código de material (No Serializado).
 */
import React, { useState } from 'react';
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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getStock,
  getMovimientos,
  changeStockCondition,
  StockItem,
  MovimientoTecnico
} from '../../services/stock.service';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

export default function VerificarStockScreen() {
  const params = useLocalSearchParams();

  // Search States
  const [searchMode, setSearchMode] = useState<'SERIALIZADO' | 'NO_SERIALIZADO'>('SERIALIZADO');
  const [serieInput, setSerieInput] = useState(params.serie as string || '');
  const [codigoInput, setCodigoInput] = useState(params.codigo_material as string || '');
  const [isSearching, setIsSearching] = useState(false);

  // Data States
  const [serializadoItem, setSerializadoItem] = useState<StockItem | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoTecnico[]>([]);
  const [noSerializadoItems, setNoSerializadoItems] = useState<StockItem[]>([]);

  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [isChangingCondition, setIsChangingCondition] = useState(false);
  const [selectedItemForCondition, setSelectedItemForCondition] = useState<StockItem | null>(null);
  const [newCondition, setNewCondition] = useState<string>('');
  const [conditionChangeQuantity, setConditionChangeQuantity] = useState<string>('1');

  // Scanner States
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const handleStartScanning = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Permiso denegado', 'Se necesita acceso a la cámara para escanear códigos de barras.');
        return;
      }
    }
    setIsScanning(true);
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setSerieInput(data);
    setIsScanning(false);
    // Autofire search
    handleSearchSerializadoWithInput(data);
  };

  const handleSearchSerializadoWithInput = async (inputToSearch: string) => {
    if (!inputToSearch.trim()) {
      Alert.alert('Error', 'Ingrese el número de serie');
      return;
    }

    setIsSearching(true);
    setSerializadoItem(null);
    setMovimientos([]);

    try {
      // Get stock item
      const items = await getStock({
        serie: inputToSearch.trim(),
        limit: 1, // Quitamos estado: 'DISPONIBLE' para poder ver EN_DESPACHO
      });

      if (items.length > 0) {
        setSerializadoItem(items[0]);

        // Fetch movements history for this serie
        const movsResponse = await getMovimientos({ serie: inputToSearch.trim(), limit: 50 });
        setMovimientos(movsResponse.items || []);
      } else {
        Alert.alert('Info', 'No se encontró el número de serie o no está DISPONIBLE.');
      }
    } catch (error: any) {
      console.error('Error buscando serializado:', error);
      Alert.alert('Error', error.message || 'No se pudo verificar la serie');
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Search for Serializado
  const handleSearchSerializado = async () => {
    handleSearchSerializadoWithInput(serieInput);
  };

  // Handle Search for No Serializado
  const handleSearchNoSerializado = async () => {
    if (!codigoInput.trim()) {
      Alert.alert('Error', 'Ingrese el código o nombre de material');
      return;
    }

    setIsSearching(true);
    setNoSerializadoItems([]);

    try {
      const items = await getStock({
        busqueda: codigoInput.trim(),
        limit: 100, // Quitamos estado: 'DISPONIBLE' para poder ver EN_DESPACHO
      });

      // Filter only non-serialized from results in client side just in case backend doesn't filter by a 'unidad_medida' param
      const filteredItems = items.filter(i => i.unidad_medida !== 'SERIALIZADO');
      setNoSerializadoItems(filteredItems);

      if (filteredItems.length === 0) {
        Alert.alert('Info', 'No se encontraron items no serializados para esta búsqueda.');
      }
    } catch (error: any) {
      console.error('Error buscando no serializado:', error);
      Alert.alert('Error', error.message || 'No se pudo buscar el material');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = () => {
    if (searchMode === 'SERIALIZADO') {
      handleSearchSerializado();
    } else {
      handleSearchNoSerializado();
    }
  };

  // Open Condition Modal
  const openChangeConditionModal = (item: StockItem) => {
    setSelectedItemForCondition(item);
    setNewCondition(item.condicion || 'BUENO'); // Default if not present
    setConditionChangeQuantity(item.unidad_medida === 'SERIALIZADO' ? '1' : item.cantidad.toString());
    setModalVisible(true);
  };

  // Submit Condition Change
  const submitConditionChange = async () => {
    if (!selectedItemForCondition) return;

    if (newCondition === selectedItemForCondition.condicion) {
      Alert.alert('Error', 'La nueva condición debe ser diferente a la actual');
      return;
    }

    // Check if location is DEPOSITO (type) or its name contains DEPOSITO (client-side fail-fast)
    const ubicacionNombreLower = (selectedItemForCondition.ubicacion_nombre || '').toLowerCase();
    if (!ubicacionNombreLower.includes('deposito') && !ubicacionNombreLower.includes('depósito')) {
      // Proceed anyway, but be prepared for backend error, or explicitly block here? 
      // The user requested: "antes de enviar el cambio al backend deberia verificar si la ubicacion es DEPOSITO asi directamente la app no nos permita hacer el cambio o manejar mejor el error que devuelve el backend"
      Alert.alert('Operación no permitida', 'Solo se puede cambiar la condición de materiales que se encuentran físicamente en un DEPOSITO.');
      return;
    }

    const qtyNumber = parseInt(conditionChangeQuantity, 10);
    if (isNaN(qtyNumber) || qtyNumber <= 0 || qtyNumber > selectedItemForCondition.cantidad) {
      Alert.alert('Error', `Ingrese una cantidad válida (Max: ${selectedItemForCondition.cantidad})`);
      return;
    }

    setIsChangingCondition(true);
    try {
      await changeStockCondition(
        selectedItemForCondition.id,
        newCondition,
        qtyNumber !== selectedItemForCondition.cantidad ? qtyNumber : undefined
      );

      Alert.alert('Éxito', 'Condición actualizada correctamente');
      setModalVisible(false);

      // Refresh Data
      handleSearch();
    } catch (error: any) {
      console.error('Error actualizando condición:', error);

      // Handle backend errors gracefully
      let errorMessage = 'Error al actualizar la condición';
      const detail = error?.response?.data?.detail;

      if (typeof detail === 'string') {
        errorMessage = detail;
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setIsChangingCondition(false);
    }
  };

  // Modos de selector de condición simple (Custom to avoid Picker dependency)
  const conditionOptions = ['BUENO', 'CONTROL', 'BLOQUEADO'];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Instrucciones */}
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🔍</Text>
          <Text style={styles.infoTitle}>Verificar Stock</Text>
          <Text style={styles.infoText}>
            Busque items por Número de Serie o Código de Material y administre su condición.
          </Text>
        </View>

        {/* Selector de modo */}
        <View style={styles.modeSelector}>
          <TouchableOpacity
            style={[styles.modeButton, searchMode === 'SERIALIZADO' && styles.modeButtonActive]}
            onPress={() => {
              setSearchMode('SERIALIZADO');
              setNoSerializadoItems([]);
            }}
          >
            <Text style={[styles.modeButtonText, searchMode === 'SERIALIZADO' && styles.modeButtonTextActive]}>
              Serializado
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, searchMode === 'NO_SERIALIZADO' && styles.modeButtonActive]}
            onPress={() => {
              setSearchMode('NO_SERIALIZADO');
              setSerializadoItem(null);
              setMovimientos([]);
            }}
          >
            <Text style={[styles.modeButtonText, searchMode === 'NO_SERIALIZADO' && styles.modeButtonTextActive]}>
              No Serializado
            </Text>
          </TouchableOpacity>
        </View>

        {/* Campos de búsqueda */}
        <View style={styles.searchSection}>
          {searchMode === 'SERIALIZADO' ? (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Número de Serie *</Text>
              <View style={styles.scanInputContainer}>
                <TextInput
                  style={[styles.searchInput, { flex: 1 }]}
                  value={serieInput}
                  onChangeText={setSerieInput}
                  placeholder="Ej: SN-12345"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="characters"
                  onSubmitEditing={handleSearch}
                />
                <TouchableOpacity style={styles.scanButtonSecondary} onPress={handleStartScanning}>
                  <Text style={styles.scanButtonSecondaryText}>📷</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Código de Material *</Text>
              <TextInput
                style={styles.searchInput}
                value={codigoInput}
                onChangeText={setCodigoInput}
                placeholder="Ej: MAT-001 o nombre"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="characters"
                onSubmitEditing={handleSearch}
              />
            </View>
          )}

          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearch}
            disabled={isSearching}
          >
            {isSearching ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.searchButtonText}>Buscar</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ==== VIEW: SERIALIZADO ==== */}
        {searchMode === 'SERIALIZADO' && serializadoItem && (
          <View style={styles.resultContainer}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardHeaderTitle}>Material Serializado</Text>
              <View style={[styles.badge, { backgroundColor: Colors.success + '20', borderColor: Colors.success }]}>
                <Text style={{ color: Colors.success, fontSize: FontSizes.xs, fontWeight: 'bold' }}>{serializadoItem.estado}</Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.itemName}>{serializadoItem.nombre_material}</Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Código:</Text>
                <Text style={styles.detailValue}>{serializadoItem.codigo_material}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Serie:</Text>
                <Text style={styles.detailValue}>{serializadoItem.serie}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Base:</Text>
                <Text style={styles.detailValue}>{serializadoItem.nombre_base || serializadoItem.codigo_base}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Ubicación:</Text>
                <Text style={styles.detailValue}>{serializadoItem.ubicacion_nombre}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Condición:</Text>
                <View style={[styles.badge, {
                  backgroundColor: serializadoItem.condicion === 'BUENO' ? Colors.success + '20' :
                    serializadoItem.condicion === 'CONTROL' ? Colors.warning + '20' : Colors.error + '20',
                  borderColor: serializadoItem.condicion === 'BUENO' ? Colors.success :
                    serializadoItem.condicion === 'CONTROL' ? Colors.warning : Colors.error
                }]}>
                  <Text style={{
                    color: serializadoItem.condicion === 'BUENO' ? Colors.success :
                      serializadoItem.condicion === 'CONTROL' ? Colors.warning : Colors.error,
                    fontSize: FontSizes.xs, fontWeight: 'bold'
                  }}>{serializadoItem.condicion || 'BUENO'}</Text>
                </View>
              </View>

              {(!serializadoItem.ubicacion_nombre?.toLowerCase().includes('deposito') && !serializadoItem.ubicacion_nombre?.toLowerCase().includes('depósito')) ? (
                <View style={[styles.actionButton, { borderColor: Colors.border, backgroundColor: Colors.surfaceVariant }]}>
                  <Text style={[styles.actionButtonText, { color: Colors.textLight }]}>Cambiar Condición</Text>
                  <Text style={{ fontSize: FontSizes.xs, color: Colors.error, marginTop: 4 }}>* Solo modificable en depósito</Text>
                </View>
              ) : serializadoItem.estado !== 'DISPONIBLE' ? (
                <View style={[styles.actionButton, { borderColor: Colors.border, backgroundColor: Colors.surfaceVariant }]}>
                  <Text style={[styles.actionButtonText, { color: Colors.textLight }]}>Cambiar Condición</Text>
                  <Text style={{ fontSize: FontSizes.xs, color: Colors.error, marginTop: 4 }}>* Material {serializadoItem.estado}</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => openChangeConditionModal(serializadoItem)}
                >
                  <Text style={styles.actionButtonText}>Cambiar Condición</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Movimientos History */}
            {movimientos.length > 0 && (
              <View style={styles.historySection}>
                <Text style={styles.historyTitle}>Historial de Movimientos ({movimientos.length})</Text>
                {movimientos.map((mov, index) => (
                  <View key={mov.id || index} style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyType}>{mov.tipo_movimiento}</Text>
                      <Text style={styles.historyDate}>
                        {new Date(mov.fecha_hora).toLocaleString('es-AR', {
                          day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
                        })}
                      </Text>
                    </View>
                    <Text style={styles.historyText}>
                      <Text style={{ fontWeight: 'bold' }}>Usuario/Base:</Text> {mov.tecnico_nombre || mov.tecnico_id || mov.codigo_base}
                    </Text>
                    {(mov.cita || mov.ot) && (
                      <Text style={styles.historyText}>
                        <Text style={{ fontWeight: 'bold' }}>Doc:</Text> {mov.cita || '-'} / {mov.ot || '-'} {mov.partida ? `(P:${mov.partida})` : ''}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
            {movimientos.length === 0 && (
              <Text style={styles.emptyText}>No hay movimientos registrados para esta serie.</Text>
            )}
          </View>
        )}

        {/* ==== VIEW: NO SERIALIZADO ==== */}
        {searchMode === 'NO_SERIALIZADO' && noSerializadoItems.length > 0 && (
          <View style={styles.stockItemsSection}>
            <Text style={styles.sectionTitle}>
              Encontrados ({noSerializadoItems.length})
            </Text>
            {noSerializadoItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.stockItemCard}
                onPress={() => openChangeConditionModal(item)}
              >
                <View style={styles.stockItemHeader}>
                  <Text style={styles.stockItemCodigo}>{item.codigo_material}</Text>
                  <Text style={[
                    styles.stockItemEstado,
                    { color: item.estado === 'DISPONIBLE' ? Colors.success : Colors.warning }
                  ]}>
                    {item.estado}
                  </Text>
                </View>
                <Text style={styles.stockItemNombre}>{item.nombre_material}</Text>
                <View style={styles.stockItemDetails}>
                  <Text style={styles.stockItemDetail}>Base: {item.nombre_base || item.codigo_base}</Text>
                  <Text style={styles.stockItemDetail}>Ubic: {item.ubicacion_nombre}</Text>
                  <Text style={[styles.stockItemDetail, { fontWeight: 'bold', color: Colors.primary }]}>Cant: {item.cantidad}</Text>
                  <Text style={[styles.stockItemDetail, {
                    color: item.condicion === 'BUENO' ? Colors.success :
                      item.condicion === 'CONTROL' ? Colors.warning : Colors.error
                  }]}>Cond: {item.condicion || 'BUENO'}</Text>
                </View>

                {item.estado !== 'DISPONIBLE' ? (
                  <Text style={[styles.tapToChangeText, { color: Colors.error }]}>Material {item.estado}</Text>
                ) : (
                  <Text style={styles.tapToChangeText}>Toque para cambiar condición</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ==== MODAL: CAMBIAR CONDICION ==== */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cambiar Condición</Text>

            {selectedItemForCondition && (
              <View style={{ marginBottom: Spacing.md }}>
                <Text style={styles.modalSubtitle}>{selectedItemForCondition.nombre_material}</Text>
                <Text style={styles.modalSubdetail}>Condición Actual: {selectedItemForCondition.condicion}</Text>
                <Text style={styles.modalSubdetail}>
                  {selectedItemForCondition.unidad_medida === 'SERIALIZADO'
                    ? `Serie: ${selectedItemForCondition.serie}`
                    : `Disponible: ${selectedItemForCondition.cantidad}`}
                </Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Nueva Condición</Text>
            <View style={styles.conditionOptionsContainer}>
              {conditionOptions.map((cond) => (
                <TouchableOpacity
                  key={cond}
                  style={[
                    styles.conditionOptionBtn,
                    newCondition === cond && styles.conditionOptionBtnActive,
                    selectedItemForCondition?.condicion === cond && { opacity: 0.5 }
                  ]}
                  onPress={() => setNewCondition(cond)}
                  disabled={selectedItemForCondition?.condicion === cond}
                >
                  <Text style={[
                    styles.conditionOptionText,
                    newCondition === cond && styles.conditionOptionTextActive
                  ]}>{cond}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedItemForCondition?.unidad_medida !== 'SERIALIZADO' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Cantidad a Mover</Text>
                <TextInput
                  style={styles.searchInput}
                  value={conditionChangeQuantity}
                  onChangeText={setConditionChangeQuantity}
                  keyboardType="numeric"
                  placeholder="Ej: 1"
                />
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSubmit]}
                onPress={submitConditionChange}
                disabled={isChangingCondition || !newCondition}
              >
                {isChangingCondition ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.modalBtnSubmitText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ==== SCANNER OVERLAY ==== */}
      {isScanning && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 999 }]}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            barcodeScannerSettings={{
              barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e"],
            }}
            onBarcodeScanned={handleBarCodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerTop} />
            <View style={styles.scannerMiddle}>
              <View style={styles.scannerLeft} />
              <View style={styles.scannerTarget}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <View style={styles.scannerRight} />
            </View>
            <View style={styles.scannerBottom}>
              <Text style={styles.scannerText}>Apunte el código de barras</Text>
              <TouchableOpacity
                style={styles.closeScannerBtn}
                onPress={() => setIsScanning(false)}
              >
                <Text style={styles.closeScannerBtnText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  scrollContent: {
    padding: Spacing.md,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  infoIcon: {
    fontSize: 40,
    marginBottom: Spacing.sm,
  },
  infoTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  infoText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  modeSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: 4,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  modeButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  modeButtonActive: {
    backgroundColor: Colors.primary,
  },
  modeButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  modeButtonTextActive: {
    color: Colors.white,
  },
  searchSection: {
    marginBottom: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  searchInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  searchButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  // Result Container Styling
  resultContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    ...Shadows.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cardHeaderTitle: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.text,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  cardBody: {
    marginBottom: Spacing.md,
  },
  itemName: {
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.primaryDark,
    marginBottom: Spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'center',
  },
  detailLabel: {
    width: 80,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  actionButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  actionButtonText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: FontSizes.md,
  },
  historySection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  historyTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    color: Colors.text,
  },
  historyCard: {
    backgroundColor: Colors.surfaceVariant,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  historyType: {
    fontWeight: 'bold',
    color: Colors.primaryDark,
    fontSize: FontSizes.sm,
  },
  historyDate: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  historyText: {
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    fontStyle: 'italic',
  },
  // No Serializado List
  stockItemsSection: {
    marginTop: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  stockItemCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  stockItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  stockItemCodigo: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
  stockItemEstado: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  stockItemNombre: {
    fontSize: FontSizes.md,
    color: Colors.text,
    fontWeight: 'bold',
    marginBottom: Spacing.xs,
  },
  stockItemDetails: {
    flexDirection: 'row',
    gap: Spacing.md,
    flexWrap: 'wrap',
    marginBottom: Spacing.sm,
  },
  stockItemDetail: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  tapToChangeText: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontStyle: 'italic',
    textAlign: 'right',
  },
  // Modal Styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: '100%',
    ...Shadows.lg,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingBottom: Spacing.sm,
  },
  modalSubtitle: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.primaryDark,
  },
  modalSubdetail: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  conditionOptionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  conditionOptionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    marginHorizontal: 2,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  conditionOptionBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  conditionOptionText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  conditionOptionTextActive: {
    color: Colors.white,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  modalBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalBtnSubmit: {
    backgroundColor: Colors.primary,
    minWidth: 120,
  },
  modalBtnCancelText: {
    color: Colors.text,
    fontWeight: '600',
  },
  modalBtnSubmitText: {
    color: Colors.white,
    fontWeight: '600',
  },
  scanInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  scanButtonSecondary: {
    backgroundColor: Colors.surfaceVariant,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    height: 50,
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonSecondaryText: {
    fontSize: 24,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  scannerTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  scannerMiddle: {
    flexDirection: 'row',
    height: 250,
  },
  scannerLeft: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  scannerTarget: {
    width: 300,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  scannerRight: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  scannerBottom: {
    flex: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    paddingTop: Spacing.xl,
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: Colors.primary,
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
  scannerText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    marginBottom: Spacing.lg,
  },
  closeScannerBtn: {
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
  },
  closeScannerBtnText: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: '600',
  }
});
