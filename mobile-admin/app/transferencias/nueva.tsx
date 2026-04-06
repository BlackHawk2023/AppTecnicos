/**
 * Pantalla para Crear Nueva Transferencia
 * Permite transferir stock entre ubicaciones
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Button
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import {
  crearTransferencia,
  validarTransferencia,
  CrearTransferenciaData
} from '../../services/transferencias.service';
import { getStock, getUbicaciones, StockItem, Ubicacion } from '../../services/stock.service';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

interface ItemSeleccionado {
  stockItem: StockItem;
  cantidad: number;
}

export default function NuevaTransferenciaScreen() {
  const { user, codigoBase } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Datos
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [stockDisponible, setStockDisponible] = useState<StockItem[]>([]);

  // Formulario
  const [origenSeleccionado, setOrigenSeleccionado] = useState<Ubicacion | null>(null);
  const [destinoSeleccionado, setDestinoSeleccionado] = useState<Ubicacion | null>(null);
  const [itemsSeleccionados, setItemsSeleccionados] = useState<ItemSeleccionado[]>([]);
  const [comentario, setComentario] = useState('');
  const [searchDestino, setSearchDestino] = useState('');
  const [searchStock, setSearchStock] = useState('');
  const [stockBuscado, setStockBuscado] = useState<StockItem[] | null>(null); // null = sin búsqueda activa
  const [isSearchingStock, setIsSearchingStock] = useState(false);
  const [showOrigenPicker, setShowOrigenPicker] = useState(false);
  const [showDestinoPicker, setShowDestinoPicker] = useState(false);
  const [showStockPicker, setShowStockPicker] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargar datos iniciales
  useEffect(() => {
    loadData();
  }, []);

  // Cargar stock cuando cambia el origen
  useEffect(() => {
    if (origenSeleccionado) {
      loadStockForOrigin();
      // Limpiar búsqueda previa al cambiar origen
      setStockBuscado(null);
      setSearchStock('');
    }
  }, [origenSeleccionado]);

  // Búsqueda server-side con debounce cuando el usuario escribe en el picker de stock
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!searchStock || searchStock.trim().length < 2) {
      // Con menos de 2 chars, volvemos a la lista local
      setStockBuscado(null);
      return;
    }

    if (!origenSeleccionado) return;

    searchDebounceRef.current = setTimeout(async () => {
      setIsSearchingStock(true);
      try {
        const results = await getStock({
          ubicacion_id: origenSeleccionado.id,
          estado: 'DISPONIBLE',
          busqueda: searchStock.trim(),
          limit: 100,
        });
        setStockBuscado(results);
      } catch (err) {
        console.error('Error en búsqueda de stock:', err);
        setStockBuscado(null);
      } finally {
        setIsSearchingStock(false);
      }
    }, 400);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchStock, origenSeleccionado]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const ubicacionesData = await getUbicaciones();
      setUbicaciones(ubicacionesData);

      // Si hay una ubicación que coincide con el código base del usuario, pre-seleccionarla como origen
      if (codigoBase) {
        const miUbicacion = ubicacionesData.find(u => u.codigo === codigoBase);
        if (miUbicacion) {
          setOrigenSeleccionado(miUbicacion);
        }
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      Alert.alert('Error', 'No se pudieron cargar los datos');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStockForOrigin = async () => {
    try {
      // cuando el origen cambia, solicitamos al backend solamente el stock
      // para ese almacén/base y la ubicación seleccionada. Esto asegura que
      // los materiales disponibles correspondan a la zona del usuario y a la
      // ubicación elegida.
      const stockData = await getStock({
        codigo_base: codigoBase || undefined,
        ubicacion_id: origenSeleccionado?.id,
        estado: 'DISPONIBLE',
        limit: 200,
      });
      setStockDisponible(stockData);
    } catch (error) {
      console.error('Error cargando stock:', error);
    }
  };

  // Filtrar destinos (excluir origen)
  const destinosFiltrados = ubicaciones
    .filter(u => u.id !== origenSeleccionado?.id)
    .filter(u =>
      u.nombre.toLowerCase().includes(searchDestino.toLowerCase()) ||
      u.codigo.toLowerCase().includes(searchDestino.toLowerCase())
    );

  // Si hay búsqueda server-side activa usamos ese resultado; si no, filtramos localmente
  const stockFiltrado = stockBuscado !== null
    ? stockBuscado
    : stockDisponible.filter(s =>
      s.codigo_material.toLowerCase().includes(searchStock.toLowerCase()) ||
      s.nombre_material.toLowerCase().includes(searchStock.toLowerCase()) ||
      (s.serie && s.serie.toLowerCase().includes(searchStock.toLowerCase()))
    );

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

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setIsScanning(false);
    // El setSearchStock dispara el useEffect de búsqueda server-side automáticamente
    setSearchStock(data);
  };

  // Agregar item a la transferencia
  const agregarItem = (stockItem: StockItem) => {
    const existente = itemsSeleccionados.find(i => i.stockItem.id === stockItem.id);
    if (existente) {
      Alert.alert('Info', 'Este item ya fue agregado');
      return;
    }

    setItemsSeleccionados([...itemsSeleccionados, { stockItem, cantidad: 1 }]);
    setShowStockPicker(false);
    setSearchStock('');
  };

  // Remover item
  const removerItem = (stockItemId: number) => {
    setItemsSeleccionados(itemsSeleccionados.filter(i => i.stockItem.id !== stockItemId));
  };

  // Actualizar cantidad
  const actualizarCantidad = (stockItemId: number, cantidad: number) => {
    setItemsSeleccionados(itemsSeleccionados.map(i =>
      i.stockItem.id === stockItemId ? { ...i, cantidad } : i
    ));
  };

  // Validar formulario
  const isFormValid = () => {
    if (!origenSeleccionado) return false;
    if (!destinoSeleccionado) return false;
    if (itemsSeleccionados.length === 0) return false;

    for (const item of itemsSeleccionados) {
      if (item.cantidad <= 0) return false;
      if (item.cantidad > item.stockItem.cantidad) return false;
    }

    return true;
  };

  // Guardar transferencia
  const handleSave = async () => {
    if (!isFormValid()) {
      Alert.alert('Error', 'Complete todos los campos requeridos');
      return;
    }

    // Obtener codigo_base (almacén) del primer item (asumiendo que todos vienen del mismo origen)
    const origenAlmacenId = itemsSeleccionados[0]?.stockItem?.codigo_base || codigoBase || 'DI01';

    // Para simplificar, asumimos que el destino está en el mismo almacén que el origen o usamos el del usuario activo.
    // En una iteración real, el selector de destino debería traer el `codigo_base` si pertenece a otra zona.
    const destinoAlmacenId = codigoBase || 'DI01';

    const data: CrearTransferenciaData = {
      origen_almacen_id: origenAlmacenId,
      origen_ubicacion: origenSeleccionado!.codigo,
      destino_almacen_id: destinoAlmacenId,
      destino_ubicacion: destinoSeleccionado!.codigo,
      comentario: comentario || undefined,
      items: itemsSeleccionados.map(i => ({
        codigo_material: i.stockItem.codigo_material,
        serie: i.stockItem.serie || undefined,
        cantidad: i.cantidad,
      })),
    };

    // Validar localmente
    const validation = validarTransferencia(data);
    if (!validation.valid) {
      Alert.alert('Error de validación', validation.error || 'Datos inválidos');
      return;
    }

    setIsSaving(true);
    try {
      await crearTransferencia(data);

      Alert.alert(
        'Éxito',
        'Transferencia creada correctamente',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Error creando transferencia:', error);
      let msg = error?.response?.data?.detail || error.message || 'No se pudo crear la transferencia';

      // Manejar el caso donde el backend devuelve un array de errores (ej. 422)
      if (Array.isArray(msg)) {
        msg = msg.map((m: any) => m.msg || m.message || JSON.stringify(m)).join('\n');
      } else if (typeof msg === 'object' && msg !== null) {
        msg = JSON.stringify(msg);
      }

      Alert.alert('Error', String(msg));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Selector de origen */}
        <View style={styles.section}>
          <Text style={styles.label}>Origen *</Text>

          {origenSeleccionado ? (
            <TouchableOpacity
              style={styles.selectedItem}
              onPress={() => setShowOrigenPicker(true)}
            >
              <View>
                <Text style={styles.selectedItemCodigo}>{origenSeleccionado.codigo}</Text>
                <Text style={styles.selectedItemDesc}>{origenSeleccionado.nombre}</Text>
              </View>
              <Text style={styles.changeText}>Cambiar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowOrigenPicker(true)}
            >
              <Text style={styles.pickerButtonText}>Seleccionar origen</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Selector de destino */}
        <View style={styles.section}>
          <Text style={styles.label}>Destino *</Text>

          {destinoSeleccionado ? (
            <TouchableOpacity
              style={styles.selectedItem}
              onPress={() => setShowDestinoPicker(true)}
            >
              <View>
                <Text style={styles.selectedItemCodigo}>{destinoSeleccionado.codigo}</Text>
                <Text style={styles.selectedItemDesc}>{destinoSeleccionado.nombre}</Text>
              </View>
              <Text style={styles.changeText}>Cambiar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowDestinoPicker(true)}
            >
              <Text style={styles.pickerButtonText}>Seleccionar destino</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Items a transferir */}
        <View style={styles.section}>
          <Text style={styles.label}>Items a Transferir *</Text>

          {itemsSeleccionados.length > 0 && (
            <View style={styles.itemsList}>
              {itemsSeleccionados.map((item) => (
                <View key={item.stockItem.id} style={styles.itemCard}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemCodigo}>{item.stockItem.codigo_material}</Text>
                    <Text style={styles.itemDesc} numberOfLines={1}>
                      {item.stockItem.nombre_material}
                    </Text>
                    {item.stockItem.serie && (
                      <Text style={styles.itemSerie}>Serie: {item.stockItem.serie}</Text>
                    )}
                    <Text style={styles.itemDisponible}>
                      Disponible: {item.stockItem.cantidad}
                    </Text>
                    {/* mostrar también la condición del material */}
                    <Text style={styles.itemCondicion}>
                      Condición: {item.stockItem.condicion || 'N/A'}
                    </Text>
                  </View>

                  <View style={styles.itemActions}>
                    <TextInput
                      style={styles.cantidadInput}
                      value={item.cantidad.toString()}
                      onChangeText={(text) => actualizarCantidad(item.stockItem.id, parseInt(text) || 0)}
                      keyboardType="numeric"
                      maxLength={4}
                    />
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removerItem(item.stockItem.id)}
                    >
                      <Text style={styles.removeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowStockPicker(true)}
          >
            <Text style={styles.addIcon}>+</Text>
            <Text style={styles.addText}>Agregar Item</Text>
          </TouchableOpacity>
        </View>

        {/* Comentario */}
        <View style={styles.section}>
          <Text style={styles.label}>Comentario</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={comentario}
            onChangeText={setComentario}
            placeholder="Comentario opcional"
            placeholderTextColor={Colors.textLight}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Botón de guardar */}
        <TouchableOpacity
          style={[styles.saveButton, !isFormValid() && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!isFormValid() || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.saveButtonText}>Crear Transferencia</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Modal de selección de origen */}
      {showOrigenPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Origen</Text>
              <TouchableOpacity onPress={() => setShowOrigenPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.optionsList}>
              {ubicaciones.map((ubicacion) => (
                <TouchableOpacity
                  key={ubicacion.id}
                  style={styles.optionItem}
                  onPress={() => {
                    setOrigenSeleccionado(ubicacion);
                    setShowOrigenPicker(false);
                    // Limpiar destino si es el mismo
                    if (destinoSeleccionado?.id === ubicacion.id) {
                      setDestinoSeleccionado(null);
                    }
                    // Limpiar items ya que cambia el origen
                    setItemsSeleccionados([]);
                  }}
                >
                  <Text style={styles.optionCodigo}>{ubicacion.codigo}</Text>
                  <Text style={styles.optionDesc}>{ubicacion.nombre}</Text>
                  <Text style={styles.optionTipo}>{ubicacion.tipo}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Modal de selección de destino */}
      {showDestinoPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Destino</Text>
              <TouchableOpacity onPress={() => setShowDestinoPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              value={searchDestino}
              onChangeText={setSearchDestino}
              placeholder="Buscar ubicación..."
              placeholderTextColor={Colors.textLight}
            />

            <ScrollView style={styles.optionsList}>
              {destinosFiltrados.map((ubicacion) => (
                <TouchableOpacity
                  key={ubicacion.id}
                  style={styles.optionItem}
                  onPress={() => {
                    setDestinoSeleccionado(ubicacion);
                    setShowDestinoPicker(false);
                    setSearchDestino('');
                  }}
                >
                  <Text style={styles.optionCodigo}>{ubicacion.codigo}</Text>
                  <Text style={styles.optionDesc}>{ubicacion.nombre}</Text>
                  <Text style={styles.optionTipo}>{ubicacion.tipo}</Text>
                </TouchableOpacity>
              ))}

              {destinosFiltrados.length === 0 && (
                <Text style={styles.noResults}>No se encontraron ubicaciones</Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Modal de selección de stock */}
      {showStockPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Agregar Item</Text>
              <TouchableOpacity onPress={() => setShowStockPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <TextInput
                style={[styles.searchInput, { flex: 1, margin: 0, marginRight: Spacing.sm }]}
                value={searchStock}
                onChangeText={setSearchStock}
                placeholder="Buscar por código, nombre o serie..."
                placeholderTextColor={Colors.textLight}
              />
              <TouchableOpacity
                style={styles.scanButton}
                onPress={startScanning}
              >
                <Text style={styles.scanButtonText}>📷 Scan</Text>
              </TouchableOpacity>
            </View>

            {isScanning ? (
              <View style={styles.scannerContainer}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  barcodeScannerSettings={{
                    barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e"],
                  }}
                  onBarcodeScanned={handleBarCodeScanned}
                />
                <TouchableOpacity
                  style={styles.closeScannerButton}
                  onPress={() => setIsScanning(false)}
                >
                  <Text style={styles.closeScannerText}>Cancelar Escaneo</Text>
                </TouchableOpacity>
              </View>
            ) : isSearchingStock ? (
              <View style={{ alignItems: 'center', padding: Spacing.lg }}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={{ color: Colors.textSecondary, marginTop: Spacing.sm, fontSize: FontSizes.sm }}>
                  Buscando...
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.optionsList}>
                {stockFiltrado.map((stock) => (
                  <TouchableOpacity
                    key={stock.id}
                    style={styles.optionItem}
                    onPress={() => agregarItem(stock)}
                  >
                    <View style={styles.stockOptionContent}>
                      <View style={styles.stockOptionInfo}>
                        <Text style={styles.optionCodigo}>{stock.codigo_material}</Text>
                        <Text style={styles.optionDesc} numberOfLines={2}>
                          {stock.nombre_material}
                        </Text>
                        {stock.serie && (
                          <Text style={styles.optionSerie}>Serie: {stock.serie}</Text>
                        )}
                        <Text style={styles.optionCondicion}>Condición: {stock.condicion || 'N/A'}</Text>
                      </View>
                      <View style={styles.stockOptionBadge}>
                        <Text style={styles.stockOptionCantidad}>{stock.cantidad}</Text>
                        <Text style={styles.stockOptionLabel}>DISP</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}

                {stockFiltrado.length === 0 && (
                  <Text style={styles.noResults}>
                    {stockBuscado !== null
                      ? 'No se encontró stock con ese criterio'
                      : 'No hay stock disponible'}
                  </Text>
                )}
              </ScrollView>
            )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: Spacing.md,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  pickerButtonText: {
    fontSize: FontSizes.md,
    color: Colors.primary,
    fontWeight: '500',
  },
  selectedItem: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedItemCodigo: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.primary,
  },
  selectedItemDesc: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  changeText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: '500',
  },
  itemsList: {
    marginBottom: Spacing.sm,
  },
  itemCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  itemCodigo: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
  itemDesc: {
    fontSize: FontSizes.sm,
    color: Colors.text,
    marginTop: 2,
  },
  itemSerie: {
    fontSize: FontSizes.xs,
    color: Colors.info,
    marginTop: 2,
  },
  itemDisponible: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  itemCondicion: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cantidadInput: {
    width: 50,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    fontSize: FontSizes.md,
    color: Colors.text,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.error + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: Colors.error,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },
  addIcon: {
    fontSize: FontSizes.xl,
    color: Colors.primary,
    marginRight: Spacing.sm,
  },
  addText: {
    fontSize: FontSizes.md,
    color: Colors.primary,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
    ...Shadows.sm,
  },
  saveButtonDisabled: {
    backgroundColor: Colors.border,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    height: '80%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  modalClose: {
    fontSize: FontSizes.xl,
    color: Colors.textSecondary,
  },
  searchInput: {
    margin: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  optionsList: {
    paddingHorizontal: Spacing.md,
    maxHeight: 400,
  },
  optionItem: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  optionCodigo: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.primary,
  },
  optionDesc: {
    fontSize: FontSizes.sm,
    color: Colors.text,
    marginTop: 2,
  },
  optionTipo: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  optionSerie: {
    fontSize: FontSizes.xs,
    color: Colors.info,
    marginTop: 2,
  },
  optionCondicion: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  stockOptionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockOptionInfo: {
    flex: 1,
  },
  stockOptionBadge: {
    alignItems: 'center',
    backgroundColor: Colors.success + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  stockOptionCantidad: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.success,
  },
  stockOptionLabel: {
    fontSize: FontSizes.xs,
    color: Colors.success,
  },
  noResults: {
    textAlign: 'center',
    color: Colors.textSecondary,
    padding: Spacing.lg,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  scanButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    height: 48,
  },
  scanButtonText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: FontSizes.sm,
  },
  scannerContainer: {
    height: 300,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'black',
  },
  closeScannerButton: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  closeScannerText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
