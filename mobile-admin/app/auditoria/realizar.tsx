/**
 * Pantalla para Realizar Auditoría Colaborativa de Stock
 * Trabaja 100% online contra el backend — sin almacenamiento local.
 * Paso 1: Seleccionar auditoría activa.
 * Paso 2: Buscar/escanear ítems y confirmar al backend.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
  BackHandler,
  RefreshControl,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import {
  getStock,
  StockItem,
  getAuditoriasColaborativas,
  getProgresoAuditoria,
  confirmarItemAuditoria,
  registrarItemNoEnStock,
  eliminarItemAuditoria,
  AuditoriaColaborativaListItem,
  AuditoriaColaborativaProgreso,
} from '../../services/stock.service';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

type Vista = 'seleccion' | 'auditoria';

export default function RealizarAuditoriaScreen() {
  const { user, codigoBase } = useAuth();

  // ── Navegación interna
  const [vista, setVista] = useState<Vista>('seleccion');

  // ── Selección de auditoría
  const [auditorias, setAuditorias] = useState<AuditoriaColaborativaListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [refreshingList, setRefreshingList] = useState(false);

  // ── Auditoría activa
  const [auditoriaId, setAuditoriaId] = useState<number | null>(null);
  const [auditoriaInfo, setAuditoriaInfo] = useState<AuditoriaColaborativaListItem | null>(null);
  const [progreso, setProgreso] = useState<AuditoriaColaborativaProgreso | null>(null);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── Búsqueda / escaneo
  const [searchQuery, setSearchQuery] = useState('');
  const [foundItem, setFoundItem] = useState<StockItem | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // ── Modal cantidad (materiales no serializados)
  const [showCantidadModal, setShowCantidadModal] = useState(false);
  const [cantidadInput, setCantidadInput] = useState('');
  const [stockItemCantidad, setStockItemCantidad] = useState<StockItem | null>(null);

  // ── Modal ítem no en stock
  const [showNoEnStockModal, setShowNoEnStockModal] = useState(false);
  const [serieNoEncontrada, setSerieNoEncontrada] = useState('');
  const [codigoMaterialInput, setCodigoMaterialInput] = useState('');
  const [condicionInput, setCondicionInput] = useState<'BUENO' | 'CONTROL' | 'BLOQUEADO'>('BUENO');

  // ── Tab de vista
  const [tabActivo, setTabActivo] = useState<'pendientes' | 'confirmados'>('pendientes');

  // Refresh timer
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ═══════════ LOAD AUDITORÍAS ═══════════

  const cargarAuditorias = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingList(true);
      else setRefreshingList(true);
      const data = await getAuditoriasColaborativas('ACTIVA');
      setAuditorias(data);
    } catch (err) {
      console.error('Error cargando auditorías:', err);
      if (!silent) Alert.alert('Error', 'No se pudieron cargar las auditorías activas');
    } finally {
      setLoadingList(false);
      setRefreshingList(false);
    }
  }, []);

  useEffect(() => {
    cargarAuditorias();
  }, [cargarAuditorias]);

  // ═══════════ LOAD AUDITORÍA ACTIVA ═══════════

  const abrirAuditoria = useCallback(async (aud: AuditoriaColaborativaListItem) => {
    setAuditoriaId(aud.id);
    setAuditoriaInfo(aud);
    setVista('auditoria');
    setLoadingAudit(true);
    setTabActivo('pendientes');
    setSearchQuery('');
    setFoundItem(null);

    try {
      const [progresoData, stockData] = await Promise.all([
        getProgresoAuditoria(aud.id),
        getStock({ codigo_base: aud.codigo_base, limit: 10000 }),
      ]);
      setProgreso(progresoData);
      setStockItems(stockData);
    } catch (err) {
      console.error('Error abriendo auditoría:', err);
      Alert.alert('Error', 'No se pudo cargar la auditoría');
      setVista('seleccion');
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  // Auto-refresh progreso cada 15s
  useEffect(() => {
    if (vista !== 'auditoria' || !auditoriaId) {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      return;
    }
    refreshTimer.current = setInterval(async () => {
      try {
        const p = await getProgresoAuditoria(auditoriaId);
        setProgreso(p);
      } catch { /* silent */ }
    }, 15000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [vista, auditoriaId]);

  const refrescarProgreso = useCallback(async () => {
    if (!auditoriaId) return;
    try {
      const p = await getProgresoAuditoria(auditoriaId);
      setProgreso(p);
    } catch {
      Alert.alert('Error', 'No se pudo refrescar el progreso');
    }
  }, [auditoriaId]);

  // ═══════════ DATOS CALCULADOS ═══════════

  const confirmadosSet = useMemo(
    () => new Set(progreso?.stock_items_confirmados || []),
    [progreso?.stock_items_confirmados]
  );

  const pendientes = useMemo(
    () => stockItems.filter((it) => !confirmadosSet.has(it.id)),
    [stockItems, confirmadosSet]
  );

  const filteredPendientes = useMemo(() => {
    if (!searchQuery.trim()) return pendientes;
    const lc = searchQuery.toLowerCase();
    return pendientes.filter(
      (it) =>
        it.codigo_material.toLowerCase().includes(lc) ||
        (it.serie || '').toLowerCase().includes(lc) ||
        it.nombre_material.toLowerCase().includes(lc)
    );
  }, [pendientes, searchQuery]);

  const filteredConfirmados = useMemo(() => {
    const items = progreso?.items || [];
    if (!searchQuery.trim()) return items;
    const lc = searchQuery.toLowerCase();
    return items.filter(
      (it) =>
        it.codigo_material.toLowerCase().includes(lc) ||
        (it.serie || '').toLowerCase().includes(lc) ||
        it.nombre_material.toLowerCase().includes(lc)
    );
  }, [progreso?.items, searchQuery]);

  // ═══════════ ACCIONES ═══════════

  const buscarItem = (query: string): StockItem | undefined => {
    const q = query.toUpperCase();
    return pendientes.find(
      (it) => it.codigo_material.toUpperCase() === q || it.serie?.toUpperCase() === q
    );
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    const item = buscarItem(searchQuery.trim());
    if (item) {
      setFoundItem(item);
    } else {
      // No está en stock pendiente — verificar si ya está confirmado
      const yaConfirmado = (progreso?.items || []).find(
        (it) => it.serie?.toUpperCase() === searchQuery.trim().toUpperCase()
      );
      if (yaConfirmado) {
        Alert.alert('Ya confirmado', 'Este ítem ya fue confirmado en esta auditoría.');
      } else {
        setSerieNoEncontrada(searchQuery.trim());
        setCodigoMaterialInput('');
        setCondicionInput('BUENO');
        setShowNoEnStockModal(true);
      }
    }
  };

  const confirmarItem = async (stockItem: StockItem) => {
    if (!auditoriaId) return;

    if (stockItem.unidad_medida !== 'SERIALIZADO') {
      setStockItemCantidad(stockItem);
      setCantidadInput(String(stockItem.cantidad));
      setShowCantidadModal(true);
      return;
    }

    setIsSaving(true);
    try {
      await confirmarItemAuditoria(auditoriaId, stockItem.id, stockItem.cantidad, stockItem.condicion);
      await refrescarProgreso();
      setFoundItem(null);
      setSearchQuery('');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'No se pudo confirmar el ítem');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmarCantidad = async () => {
    if (!auditoriaId || !stockItemCantidad) return;
    const cantidadFisica = parseInt(cantidadInput || '0', 10);
    if (isNaN(cantidadFisica) || cantidadFisica < 0) {
      Alert.alert('Error', 'Ingrese una cantidad válida');
      return;
    }

    setIsSaving(true);
    try {
      await confirmarItemAuditoria(auditoriaId, stockItemCantidad.id, cantidadFisica, stockItemCantidad.condicion);
      await refrescarProgreso();
      setShowCantidadModal(false);
      setFoundItem(null);
      setSearchQuery('');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'No se pudo confirmar el ítem');
    } finally {
      setIsSaving(false);
    }
  };

  const registrarNoEnStock = async () => {
    if (!auditoriaId) return;
    if (!codigoMaterialInput.trim()) {
      Alert.alert('Error', 'Ingrese el código de material');
      return;
    }

    setIsSaving(true);
    try {
      await registrarItemNoEnStock(auditoriaId, {
        codigo_material: codigoMaterialInput.trim().toUpperCase(),
        nombre_material: 'No registrado en stock',
        unidad_medida: 'SERIALIZADO',
        serie: serieNoEncontrada || undefined,
        cantidad: 1,
        condicion: condicionInput,
      });
      await refrescarProgreso();
      setShowNoEnStockModal(false);
      setSearchQuery('');
      Alert.alert('Registrado', 'Material agregado como no en stock');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'No se pudo registrar el ítem');
    } finally {
      setIsSaving(false);
    }
  };

  const deshacerConfirmacion = async (itemId: number) => {
    if (!auditoriaId) return;
    Alert.alert('Deshacer', '¿Deshacer la confirmación de este ítem?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Deshacer',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarItemAuditoria(auditoriaId, itemId);
            await refrescarProgreso();
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.detail || 'No se pudo deshacer');
          }
        },
      },
    ]);
  };

  // ── Scanner
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
    setSearchQuery(data);
    const item = buscarItem(data);
    if (item) {
      setFoundItem(item);
    } else {
      const yaConfirmado = (progreso?.items || []).find(
        (it) => it.serie?.toUpperCase() === data.toUpperCase()
      );
      if (yaConfirmado) {
        Alert.alert('Ya confirmado', 'Este ítem ya fue confirmado en esta auditoría.');
      } else {
        setSerieNoEncontrada(data);
        setCodigoMaterialInput('');
        setCondicionInput('BUENO');
        setShowNoEnStockModal(true);
      }
    }
  };

  // ── Back handler
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (vista === 'auditoria') {
        setVista('seleccion');
        setAuditoriaId(null);
        setProgreso(null);
        setStockItems([]);
        cargarAuditorias(true);
        return true;
      }
      return false;
    });
    return () => backHandler.remove();
  }, [vista, cargarAuditorias]);

  // ═══════════ RENDER: SELECCIÓN DE AUDITORÍA ═══════════

  if (vista === 'seleccion') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Auditorías Activas</Text>
          <TouchableOpacity onPress={() => cargarAuditorias(true)} style={styles.refreshBtn}>
            <Text style={styles.refreshBtnText}>↻</Text>
          </TouchableOpacity>
        </View>

        {loadingList ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : auditorias.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No hay auditorías activas.</Text>
            <Text style={styles.emptySubText}>
              Cree una auditoría desde el sistema web.
            </Text>
          </View>
        ) : (
          <FlatList
            data={auditorias}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listPadding}
            refreshControl={
              <RefreshControl refreshing={refreshingList} onRefresh={() => cargarAuditorias(true)} />
            }
            renderItem={({ item: aud }) => (
              <TouchableOpacity style={styles.audCard} onPress={() => abrirAuditoria(aud)}>
                <View style={styles.audCardHeader}>
                  <Text style={styles.audCardBase}>{aud.nombre_base || aud.codigo_base}</Text>
                  <Text style={styles.audCardId}>#{aud.id}</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${aud.porcentaje_avance}%` }]} />
                </View>
                <View style={styles.audCardStats}>
                  <Text style={styles.audCardStat}>
                    {aud.items_auditados}/{aud.total_items_sistema} ({aud.porcentaje_avance.toFixed(0)}%)
                  </Text>
                  <Text style={styles.audCardDate}>
                    {new Date(aud.created_at).toLocaleDateString('es-AR')}
                  </Text>
                </View>
                {aud.items_no_en_stock > 0 && (
                  <Text style={styles.audCardWarning}>+{aud.items_no_en_stock} no en stock</Text>
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  // ═══════════ RENDER: AUDITORÍA ═══════════

  const porcentaje = progreso ? progreso.porcentaje_avance : 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {loadingAudit ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Cargando auditoría...</Text>
        </View>
      ) : (
        <>
          {/* Header */}
          <View style={styles.auditHeader}>
            <TouchableOpacity
              onPress={() => {
                setVista('seleccion');
                setAuditoriaId(null);
                cargarAuditorias(true);
              }}
            >
              <Text style={styles.backText}>← Volver</Text>
            </TouchableOpacity>
            <Text style={styles.auditTitle} numberOfLines={1}>
              {auditoriaInfo?.nombre_base || auditoriaInfo?.codigo_base} #{auditoriaId}
            </Text>
            <TouchableOpacity onPress={refrescarProgreso} style={styles.refreshBtn}>
              <Text style={styles.refreshBtnText}>↻</Text>
            </TouchableOpacity>
          </View>

          {/* Progreso */}
          {progreso && (
            <View style={styles.progressSection}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${porcentaje}%` }]} />
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: Colors.success }]}>
                    {progreso.items_encontrados}
                  </Text>
                  <Text style={styles.statLabel}>Encontrados</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: Colors.warning }]}>
                    {progreso.items_no_en_stock}
                  </Text>
                  <Text style={styles.statLabel}>No en stock</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {progreso.total_items_sistema - progreso.items_encontrados}
                  </Text>
                  <Text style={styles.statLabel}>Pendientes</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: Colors.primary }]}>
                    {porcentaje.toFixed(0)}%
                  </Text>
                  <Text style={styles.statLabel}>Avance</Text>
                </View>
              </View>
            </View>
          )}

          {/* Búsqueda */}
          <View style={styles.searchSection}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                if (foundItem) setFoundItem(null);
              }}
              placeholder="Serie o código de material..."
              placeholderTextColor={Colors.textLight}
              autoCapitalize="characters"
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity style={styles.scanButton} onPress={startScanning}>
              <Text style={styles.scanButtonText}>📷</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
              <Text style={styles.searchButtonText}>🔍</Text>
            </TouchableOpacity>
          </View>

          {/* Item encontrado — confirmar */}
          {foundItem && (
            <View style={styles.foundItemCard}>
              <View style={styles.foundItemInfo}>
                <Text style={styles.foundItemCodigo}>{foundItem.codigo_material}</Text>
                <Text style={styles.foundItemDesc} numberOfLines={1}>{foundItem.nombre_material}</Text>
                {foundItem.serie && <Text style={styles.foundItemSerie}>Serie: {foundItem.serie}</Text>}
              </View>
              <TouchableOpacity
                style={styles.confirmFoundButton}
                disabled={isSaving}
                onPress={() => confirmarItem(foundItem)}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.confirmFoundText}>Verificar ✓</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dismissFoundButton}
                onPress={() => { setFoundItem(null); setSearchQuery(''); }}
              >
                <Text style={styles.dismissFoundText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tabActivo === 'pendientes' && styles.tabBtnActive]}
              onPress={() => setTabActivo('pendientes')}
            >
              <Text style={[styles.tabText, tabActivo === 'pendientes' && styles.tabTextActive]}>
                Pendientes ({pendientes.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tabActivo === 'confirmados' && styles.tabBtnActive]}
              onPress={() => setTabActivo('confirmados')}
            >
              <Text style={[styles.tabText, tabActivo === 'confirmados' && styles.tabTextActive]}>
                Confirmados ({progreso?.items?.length || 0})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Lista Pendientes */}
          {tabActivo === 'pendientes' && (
            <FlatList
              data={filteredPendientes}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.listPadding}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Text style={styles.emptyText}>
                    {searchQuery ? 'Sin resultados' : 'No hay ítems pendientes'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.itemCard}
                  onPress={() => confirmarItem(item)}
                  disabled={isSaving}
                >
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemCodigo}>{item.codigo_material}</Text>
                    <Text style={styles.itemDesc} numberOfLines={1}>{item.nombre_material}</Text>
                    {item.serie && <Text style={styles.itemSerie}>Serie: {item.serie}</Text>}
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={styles.itemCantidad}>{item.cantidad}</Text>
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingIcon}>?</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}

          {/* Lista Confirmados */}
          {tabActivo === 'confirmados' && (
            <FlatList
              data={filteredConfirmados}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.listPadding}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Text style={styles.emptyText}>Aún no se confirmaron ítems</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.itemCard, styles.itemCardFound]}
                  onPress={() => deshacerConfirmacion(item.id)}
                >
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemCodigo}>{item.codigo_material}</Text>
                    <Text style={styles.itemDesc} numberOfLines={1}>{item.nombre_material}</Text>
                    {item.serie && <Text style={styles.itemSerie}>Serie: {item.serie}</Text>}
                    <Text style={styles.itemAuditor}>
                      {item.nombre_auditor || item.auditado_por} —{' '}
                      {new Date(item.auditado_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={styles.itemRight}>
                    <View style={[styles.tipoBadge, item.tipo === 'NO_EN_STOCK' && styles.tipoBadgeWarning]}>
                      <Text style={styles.tipoBadgeText}>
                        {item.tipo === 'ENCONTRADO' ? '✓' : '!'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}

          {/* ── Modal scanner ── */}
          <Modal visible={isScanning} transparent={false} animationType="slide">
            <View style={{ flex: 1, backgroundColor: '#000' }}>
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

          {/* ── Modal cantidad ── */}
          <Modal visible={showCantidadModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Cantidad Física</Text>
                <Text style={styles.modalSubtitle}>
                  Material: {stockItemCantidad?.codigo_material}{'\n'}
                  Stock registrado: {stockItemCantidad?.cantidad}
                </Text>
                <Text style={styles.inputLabel}>Cantidad encontrada:</Text>
                <TextInput
                  style={styles.modalInput}
                  value={cantidadInput}
                  onChangeText={setCantidadInput}
                  keyboardType="numeric"
                  placeholder="Ingrese cantidad"
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCantidadModal(false)}>
                    <Text>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={confirmarCantidad}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.confirmBtnText}>Confirmar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* ── Modal no en stock ── */}
          <Modal visible={showNoEnStockModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Material no encontrado en stock</Text>
                <Text style={styles.modalSubtitle}>Serie/Código: {serieNoEncontrada}</Text>

                <Text style={styles.inputLabel}>Código de Material:</Text>
                <TextInput
                  style={styles.modalInput}
                  value={codigoMaterialInput}
                  onChangeText={setCodigoMaterialInput}
                  placeholder="Ej: MAT001"
                  autoCapitalize="characters"
                />

                <Text style={styles.inputLabel}>Condición:</Text>
                <View style={styles.condicionRow}>
                  {(['BUENO', 'CONTROL', 'BLOQUEADO'] as const).map((cond) => (
                    <TouchableOpacity
                      key={cond}
                      style={[styles.condicionBtn, condicionInput === cond && styles.condicionBtnActive]}
                      onPress={() => setCondicionInput(cond)}
                    >
                      <Text
                        style={[styles.condicionText, condicionInput === cond && styles.condicionTextActive]}
                      >
                        {cond}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowNoEnStockModal(false)}>
                    <Text>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={registrarNoEnStock}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.confirmBtnText}>Confirmar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  // ── Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '600',
    color: Colors.text,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshBtnText: {
    fontSize: 22,
    color: Colors.primary,
  },
  // ── Lista de auditorías
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: FontSizes.sm,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  listPadding: {
    padding: Spacing.md,
    paddingBottom: 80,
  },
  audCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  audCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  audCardBase: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  audCardId: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  audCardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  audCardStat: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  audCardDate: {
    fontSize: FontSizes.sm,
    color: Colors.textLight,
  },
  audCardWarning: {
    fontSize: FontSizes.xs,
    color: Colors.warning,
    marginTop: Spacing.xs,
  },
  // ── Progress
  progressBarBg: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.success,
    borderRadius: 4,
  },
  progressSection: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.sm,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  // ── Audit header
  auditHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  auditTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    textAlign: 'center',
  },
  backText: {
    fontSize: FontSizes.md,
    color: Colors.primary,
    fontWeight: '500',
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  // ── Search
  searchSection: {
    flexDirection: 'row',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  scanButton: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scanButtonText: { fontSize: 20 },
  searchButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: { color: Colors.white, fontSize: 20, fontWeight: 'bold' },
  // ── Found item
  foundItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '15',
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  foundItemInfo: { flex: 1 },
  foundItemCodigo: { fontSize: FontSizes.sm, fontWeight: '700', color: Colors.primary },
  foundItemDesc: { fontSize: FontSizes.sm, color: Colors.text },
  foundItemSerie: { fontSize: FontSizes.xs, color: Colors.info },
  confirmFoundButton: {
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 90,
    alignItems: 'center',
  },
  confirmFoundText: { color: Colors.white, fontSize: FontSizes.sm, fontWeight: '600' },
  dismissFoundButton: { padding: Spacing.sm },
  dismissFoundText: { fontSize: FontSizes.lg, color: Colors.textSecondary },
  // ── Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  // ── Items
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
  itemCardFound: {
    backgroundColor: Colors.success + '10',
    borderColor: Colors.success,
  },
  itemInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  itemCodigo: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.primary },
  itemDesc: { fontSize: FontSizes.sm, color: Colors.text, marginTop: 2 },
  itemSerie: { fontSize: FontSizes.xs, color: Colors.info, marginTop: 2 },
  itemAuditor: { fontSize: FontSizes.xs, color: Colors.textLight, marginTop: 2 },
  itemRight: {
    alignItems: 'center',
    gap: 4,
  },
  itemCantidad: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  pendingBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingIcon: { color: Colors.textSecondary, fontSize: FontSizes.md },
  tipoBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipoBadgeWarning: {
    backgroundColor: Colors.warning,
  },
  tipoBadgeText: { color: Colors.white, fontSize: FontSizes.md, fontWeight: 'bold' },
  // ── Scanner
  closeScannerButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  closeScannerText: { color: Colors.white, fontSize: FontSizes.md, fontWeight: '600' },
  // ── Modals
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    width: '90%',
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.sm,
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
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  cancelBtn: { padding: Spacing.sm },
  confirmBtn: {
    padding: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    minWidth: 90,
    alignItems: 'center',
  },
  confirmBtnText: { color: Colors.white, fontWeight: '600' },
  condicionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  condicionBtn: {
    padding: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
  },
  condicionBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  condicionText: { fontSize: FontSizes.sm, color: Colors.text },
  condicionTextActive: { color: Colors.white },
});
