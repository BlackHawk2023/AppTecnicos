/**
 * Pantalla para Cargar Stock
 * Permite agregar nuevos items al stock
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
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import {
  getMateriales,
  getUbicaciones,
  crearEntradaStock,
  validarSerie,
  Material,
  Ubicacion
} from '../../services/stock.service';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

export default function CargarStockScreen() {
  const { user, codigoBase } = useAuth();
  const params = useLocalSearchParams();

  // Estado
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);

  // Formulario
  const [searchMaterial, setSearchMaterial] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [selectedUbicacion, setSelectedUbicacion] = useState<Ubicacion | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [numeroSerie, setNumeroSerie] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [showUbicacionPicker, setShowUbicacionPicker] = useState(false);

  // Scanner state
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // Cargar datos iniciales
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [materialesData, ubicacionesData] = await Promise.all([
        getMateriales(codigoBase || undefined),
        getUbicaciones(),
      ]);

      setMateriales(materialesData);
      setUbicaciones(ubicacionesData);

      // Si solo hay una ubicación, seleccionarla por defecto
      if (ubicacionesData.length === 1) {
        setSelectedUbicacion(ubicacionesData[0]);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      Alert.alert('Error', 'No se pudieron cargar los datos');
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar materiales por búsqueda
  const filteredMateriales = materiales.filter(m =>
    m.codigo_material.toLowerCase().includes(searchMaterial.toLowerCase()) ||
    m.nombre.toLowerCase().includes(searchMaterial.toLowerCase())
  );

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
    setNumeroSerie(data);
    setIsScanning(false);
  };

  // Determinar si el material seleccionado es serializado
  const esSerialized = selectedMaterial?.unidad_medida === 'SERIALIZADO';

  // Validar formulario
  const isFormValid = () => {
    if (!selectedMaterial) return false;
    if (!selectedUbicacion) return false;
    if (esSerialized) {
      return numeroSerie.trim().length > 0;
    }
    return parseInt(cantidad) > 0;
  };

  // Guardar
  const handleSave = async () => {
    if (!isFormValid()) {
      Alert.alert('Error', 'Complete todos los campos requeridos');
      return;
    }

    setIsSaving(true);
    try {
      // Si es serializado, validar que la serie no exista
      if (esSerialized && numeroSerie.trim()) {
        try {
          const validacion = await validarSerie(selectedMaterial!.codigo_material, numeroSerie.trim());
          if (!validacion.disponible) {
            Alert.alert('Error', validacion.mensaje || 'La serie ya existe en el stock');
            setIsSaving(false);
            return;
          }
        } catch (validationError) {
          // Si falla la validación, continuar (puede que el endpoint no esté disponible)
          console.warn('No se pudo validar la serie:', validationError);
        }
      }

      await crearEntradaStock({
        codigo_material: selectedMaterial!.codigo_material,
        codigo_base: codigoBase || '',
        ubicacion_id: selectedUbicacion!.id,
        cantidad: esSerialized ? 1 : parseInt(cantidad),
        serie: esSerialized ? numeroSerie.trim() : null,
        observaciones: observaciones || undefined,
      });

      Alert.alert(
        'Éxito',
        'Stock cargado correctamente',
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      );
    } catch (error: any) {
      console.error('Error guardando:', error);
      const msg = error?.response?.data?.detail || error.message || 'No se pudo guardar el stock';
      Alert.alert('Error', msg);
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
        {/* Selector de Material */}
        <View style={styles.section}>
          <Text style={styles.label}>Material *</Text>

          {selectedMaterial ? (
            <TouchableOpacity
              style={styles.selectedItem}
              onPress={() => setShowMaterialPicker(true)}
            >
              <View>
                <Text style={styles.selectedItemCodigo}>{selectedMaterial.codigo_material}</Text>
                <Text style={styles.selectedItemDesc}>{selectedMaterial.nombre}</Text>
              </View>
              <Text style={styles.changeText}>Cambiar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowMaterialPicker(true)}
            >
              <Text style={styles.pickerButtonText}>Seleccionar material</Text>
            </TouchableOpacity>
          )}

          {selectedMaterial && (
            <View style={styles.materialInfo}>
              <Text style={styles.materialType}>
                {selectedMaterial.categoria || 'Sin categoría'}
              </Text>
              <Text style={styles.materialSerializado}>
                {esSerialized ? '🔹 Serializado' : '📦 Por unidad'}
              </Text>
            </View>
          )}
        </View>

        {/* Selector de Ubicación */}
        <View style={styles.section}>
          <Text style={styles.label}>Ubicación *</Text>

          {selectedUbicacion ? (
            <TouchableOpacity
              style={styles.selectedItem}
              onPress={() => setShowUbicacionPicker(true)}
            >
              <View>
                <Text style={styles.selectedItemCodigo}>{selectedUbicacion.codigo}</Text>
                <Text style={styles.selectedItemDesc}>{selectedUbicacion.nombre}</Text>
              </View>
              <Text style={styles.changeText}>Cambiar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowUbicacionPicker(true)}
            >
              <Text style={styles.pickerButtonText}>Seleccionar ubicación</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Cantidad (solo si no es serializado) */}
        {selectedMaterial && !esSerialized && (
          <View style={styles.section}>
            <Text style={styles.label}>Cantidad *</Text>
            <TextInput
              style={styles.input}
              value={cantidad}
              onChangeText={setCantidad}
              keyboardType="numeric"
              placeholder="Ingrese cantidad"
              placeholderTextColor={Colors.textLight}
            />
          </View>
        )}

        {/* Número de Serie (solo si es serializado) */}
        {selectedMaterial && esSerialized && (
          <View style={styles.section}>
            <Text style={styles.label}>Número de Serie *</Text>
            <View style={styles.scanInputContainer}>
              <TextInput
                style={styles.input}
                value={numeroSerie}
                onChangeText={setNumeroSerie}
                placeholder="Escanear o ingresar número de serie"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.scanButtonSecondary}
                onPress={handleStartScanning}
              >
                <Text style={styles.scanButtonSecondaryText}>📷</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Observaciones */}
        <View style={styles.section}>
          <Text style={styles.label}>Observaciones</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={observaciones}
            onChangeText={setObservaciones}
            placeholder="Observaciones opcionales"
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
            <Text style={styles.saveButtonText}>Guardar</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Modal de selección de material */}
      {showMaterialPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Material</Text>
              <TouchableOpacity onPress={() => setShowMaterialPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              value={searchMaterial}
              onChangeText={setSearchMaterial}
              placeholder="Buscar material..."
              placeholderTextColor={Colors.textLight}
            />

            <ScrollView style={styles.optionsList}>
              {filteredMateriales.map((material) => (
                <TouchableOpacity
                  key={material.codigo_material}
                  style={styles.optionItem}
                  onPress={() => {
                    setSelectedMaterial(material);
                    setShowMaterialPicker(false);
                    setSearchMaterial('');
                    // Reset cantidad/serie cuando cambia material
                    setCantidad('');
                    setNumeroSerie('');
                  }}
                >
                  <Text style={styles.optionCodigo}>{material.codigo_material}</Text>
                  <Text style={styles.optionDesc} numberOfLines={2}>{material.nombre}</Text>
                  <Text style={styles.optionTipo}>
                    {material.unidad_medida === 'SERIALIZADO' ? '🔹 Serializado' : '📦 Unidad'}
                    {material.categoria ? ` • ${material.categoria}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}

              {filteredMateriales.length === 0 && (
                <Text style={styles.noResults}>No se encontraron materiales</Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Modal de selección de ubicación */}

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

      {/* Modal de selección de ubicación */}
      {showUbicacionPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Ubicación</Text>
              <TouchableOpacity onPress={() => setShowUbicacionPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.optionsList}>
              {ubicaciones.map((ubicacion) => (
                <TouchableOpacity
                  key={ubicacion.id}
                  style={styles.optionItem}
                  onPress={() => {
                    setSelectedUbicacion(ubicacion);
                    setShowUbicacionPicker(false);
                  }}
                >
                  <Text style={styles.optionCodigo}>{ubicacion.codigo}</Text>
                  <Text style={styles.optionDesc}>{ubicacion.nombre}</Text>
                  <Text style={styles.optionTipo}>{ubicacion.tipo}</Text>
                </TouchableOpacity>
              ))}

              {ubicaciones.length === 0 && (
                <Text style={styles.noResults}>No hay ubicaciones disponibles</Text>
              )}
            </ScrollView>
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
  materialInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  materialType: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  materialSerializado: {
    fontSize: FontSizes.sm,
    color: Colors.info,
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
    maxHeight: '80%',
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
  noResults: {
    textAlign: 'center',
    color: Colors.textSecondary,
    padding: Spacing.lg,
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
    fontWeight: '600',
  },
});
