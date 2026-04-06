import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    TextInput,
    Modal,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
    getDespachoDetalle,
    validateCaja,
    updateCajaEstado,
    createCaja,
    addItemToCaja,
    removeItemFromCaja,
    Despacho,
    DespachoCaja,
    DespachoItem,
} from '../../services/despachos.service';
import { getStock, StockItem } from '../../services/stock.service';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

export default function DespachoDetailScreen() {
    const { id } = useLocalSearchParams();
    const [despacho, setDespacho] = useState<Despacho | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    // Agregar Item State
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedCaja, setSelectedCaja] = useState<DespachoCaja | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [stockDisponible, setStockDisponible] = useState<StockItem[]>([]);
    const [searchedMaterial, setSearchedMaterial] = useState<StockItem | null>(null);
    const [cantidadToAdd, setCantidadToAdd] = useState('1');

    // Scanner State
    const [isScanning, setIsScanning] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();

    const loadDespacho = async () => {
        try {
            const data = await getDespachoDetalle(Number(id));
            setDespacho(data);
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Error al cargar detalle del despacho');
            router.back();
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (id) {
            loadDespacho();
        }
    }, [id]);

    const handleToggleCajaEstado = async (caja: DespachoCaja) => {
        if (!despacho) return;
        const newEstado = caja.estado === 'ABIERTA' ? 'CERRADA' : 'ABIERTA';
        setIsProcessing(true);
        try {
            if (newEstado === 'CERRADA') {
                // Al cerrar validamos
                await validateCaja(despacho.id, caja.id);
                // Si la validacion es correcta, se actualiza
                await updateCajaEstado(despacho.id, caja.id, newEstado);
            } else {
                await updateCajaEstado(despacho.id, caja.id, newEstado);
            }
            await loadDespacho();
        } catch (err: any) {
            Alert.alert('Error', err.message || 'No se pudo cambiar el estado de la caja');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRemoveItem = async (caja: DespachoCaja, item: DespachoItem) => {
        if (!despacho) return;
        Alert.alert(
            'Quitar Material',
            '¿Está seguro de quitar este material de la caja? Volverá a estar DISPONIBLE.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Quitar',
                    style: 'destructive',
                    onPress: async () => {
                        setIsProcessing(true);
                        try {
                            await removeItemFromCaja(despacho.id, caja.id, item.id);
                            await loadDespacho();
                        } catch (err: any) {
                            Alert.alert('Error', err.message || 'No se pudo quitar el material');
                        } finally {
                            setIsProcessing(false);
                        }
                    }
                }
            ]
        );
    };

    const openAddItemModal = (caja: DespachoCaja) => {
        setSelectedCaja(caja);
        setSearchQuery('');
        setCantidadToAdd('1');
        setStockDisponible([]);
        setSearchedMaterial(null);
        setModalVisible(true);
    };

    const handleAddCaja = async () => {
        if (!despacho) return;
        setIsProcessing(true);
        try {
            await createCaja(despacho.id);
            await loadDespacho();
        } catch (err: any) {
            Alert.alert('Error', err.message || 'No se pudo crear la caja');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSearchStock = async () => {
        if (!searchQuery.trim() || !despacho) return;
        setIsProcessing(true);
        setSearchedMaterial(null);

        try {
            // Intentamos buscar por serie
            const itemsSerie = await getStock({
                serie: searchQuery.trim(),
                estado: 'DISPONIBLE',
            });

            if (itemsSerie.length > 0) {
                setSearchedMaterial(itemsSerie[0]);
                setCantidadToAdd('1'); // Serializado es siempre 1
            } else {
                // Si no es serie, podría ser código de material (No serializado)
                const itemsNoSerie = await getStock({
                    busqueda: searchQuery.trim(),
                    estado: 'DISPONIBLE',
                    codigo_base: despacho.almacen_id
                });

                if (itemsNoSerie.length > 0) {
                    // Filtramos solo los que están en DEPOSITO y que sean No Serializados
                    const match = itemsNoSerie.find(i =>
                        i.unidad_medida !== 'SERIALIZADO' &&
                        i.ubicacion_codigo === 'DEPOSITO'
                    );
                    if (match) {
                        setSearchedMaterial(match);
                        setCantidadToAdd('1');
                    } else {
                        Alert.alert('No encontrado', 'El material no está disponible en este almacén/depósito o está serializado (busque por serie).');
                    }
                } else {
                    Alert.alert('No encontrado', `No se encontró stock disponible para "${searchQuery}"`);
                }
            }
        } catch (err: any) {
            Alert.alert('Error', 'Hubo un error buscando el material');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAddItemToCaja = async () => {
        if (!despacho || !selectedCaja || !searchedMaterial) return;

        const qty = parseInt(cantidadToAdd, 10);
        if (isNaN(qty) || qty <= 0 || qty > searchedMaterial.cantidad) {
            Alert.alert('Error', `Cantidad inválida. Máximo disponible: ${searchedMaterial.cantidad}`);
            return;
        }

        setIsProcessing(true);
        try {
            await addItemToCaja(despacho.id, selectedCaja.id, {
                codigo_material: searchedMaterial.codigo_material,
                serie: searchedMaterial.serie || null,
                cantidad: qty
            });
            // Exitoso
            setModalVisible(false);
            await loadDespacho();
        } catch (err: any) {
            Alert.alert('Error', err.message || 'No se pudo agregar a la caja');
        } finally {
            setIsProcessing(false);
        }
    };

    // Escáner
    const handleStartScanning = async () => {
        if (!permission?.granted) {
            const { granted } = await requestPermission();
            if (!granted) {
                Alert.alert('Permiso', 'Se requiere acceso a la cámara.');
                return;
            }
        }
        setIsScanning(true);
    };

    const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
        setIsScanning(false);
        setSearchQuery(data);
        // Autofire
        setTimeout(() => {
            // trigger search once modal resumes
            // A little hacky but works for the UX
        }, 500);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'EN_PROGRESO': return Colors.primary;
            case 'SOLICITADO': return Colors.warning;
            case 'CERRADO': return Colors.success;
            case 'CANCELADO': return Colors.error;
            default: return Colors.textSecondary;
        }
    };

    if (isLoading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    if (!despacho) {
        return (
            <View style={styles.centered}>
                <Text>Despacho no encontrado.</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <Stack.Screen options={{ title: 'Despachos' }} />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Despacho Header */}
                <View style={styles.headerCard}>
                    <View style={styles.headerTitleRow}>
                        <Text style={styles.title}>Despacho #{despacho.id}</Text>
                        <View style={[styles.badge, { backgroundColor: getStatusColor(despacho.estado) + '20', borderColor: getStatusColor(despacho.estado) }]}>
                            <Text style={{ color: getStatusColor(despacho.estado), fontWeight: 'bold', fontSize: FontSizes.xs }}>
                                {despacho.estado.replace('_', ' ')}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Almacén:</Text>
                        <Text style={styles.detailValue}>{despacho.almacen_id}</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Creado:</Text>
                        <Text style={styles.detailValue}>{new Date(despacho.fecha_creacion).toLocaleString('es-AR')}</Text>
                    </View>
                    {despacho.observaciones && (
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Obs:</Text>
                            <Text style={styles.detailValue}>{despacho.observaciones}</Text>
                        </View>
                    )}

                    {despacho.estado !== 'EN_PROGRESO' && (
                        <View style={styles.warningBox}>
                            <Text style={styles.warningText}>Este despacho no está en progreso. La aplicación móvil solo permite visualizar el contenido.</Text>
                        </View>
                    )}
                </View>

                {/* Cajas */}
                <View style={[styles.headerTitleRow, { borderBottomWidth: 0, paddingBottom: 0, marginBottom: Spacing.xs }]}>
                    <Text style={styles.sectionTitle}>Cajas ({despacho.total_cajas})</Text>
                    {despacho.estado === 'EN_PROGRESO' && (
                        <TouchableOpacity style={styles.btnAddCaja} onPress={handleAddCaja} disabled={isProcessing}>
                            <Text style={styles.btnAddCajaText}>+ Nueva Caja</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {despacho.cajas.length === 0 ? (
                    <Text style={styles.emptyText}>No hay cajas en este despacho.</Text>
                ) : (
                    despacho.cajas.map(caja => (
                        <View key={caja.id} style={styles.cajaCard}>
                            <View style={styles.cajaHeader}>
                                <Text style={styles.cajaTitle}>Caja {caja.numero}</Text>
                                <View style={styles.cajaActions}>
                                    <View style={[styles.badge, {
                                        backgroundColor: caja.estado === 'CERRADA' ? Colors.success + '20' : Colors.warning + '20',
                                        borderColor: caja.estado === 'CERRADA' ? Colors.success : Colors.warning,
                                        marginRight: Spacing.sm
                                    }]}>
                                        <Text style={{
                                            color: caja.estado === 'CERRADA' ? Colors.success : Colors.warning,
                                            fontSize: FontSizes.xs, fontWeight: 'bold'
                                        }}>
                                            {caja.estado}
                                        </Text>
                                    </View>

                                    {despacho.estado === 'EN_PROGRESO' && (
                                        <TouchableOpacity
                                            style={[styles.btnToggle, caja.estado === 'CERRADA' ? styles.btnOpen : styles.btnClose]}
                                            onPress={() => handleToggleCajaEstado(caja)}
                                            disabled={isProcessing}
                                        >
                                            <Text style={[styles.btnToggleText, caja.estado === 'CERRADA' ? { color: Colors.primary } : { color: Colors.success }]}>
                                                {caja.estado === 'CERRADA' ? 'ABRIR' : 'CERRAR'}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>

                            {/* Caja Items */}
                            <View style={styles.itemsContainer}>
                                {caja.items.length === 0 ? (
                                    <Text style={styles.emptyTextSub}>Caja vacía</Text>
                                ) : (
                                    caja.items.map(item => (
                                        <View key={item.id} style={styles.itemRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.itemCodigo}>{item.codigo_material}</Text>
                                                {item.serie && <Text style={styles.itemSerie}>SN: {item.serie}</Text>}
                                            </View>
                                            <Text style={styles.itemQty}>{item.cantidad} und</Text>

                                            {despacho.estado === 'EN_PROGRESO' && caja.estado === 'ABIERTA' && (
                                                <TouchableOpacity style={styles.btnRemoveItem} onPress={() => handleRemoveItem(caja, item)}>
                                                    <Text style={{ color: Colors.error, fontWeight: 'bold' }}>✕</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    ))
                                )}
                            </View>

                            {/* Botón Agregar a Caja */}
                            {despacho.estado === 'EN_PROGRESO' && caja.estado === 'ABIERTA' && (
                                <TouchableOpacity style={styles.btnAddItem} onPress={() => openAddItemModal(caja)}>
                                    <Text style={styles.btnAddItemText}>+ Agregar Material</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ))
                )}
            </ScrollView>

            {/* MODAL: Agregar Item */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Agregar a Caja {selectedCaja?.numero}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalBody}>
                            <Text style={styles.inputLabel}>Serie o Código de Material</Text>
                            <View style={styles.searchRow}>
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    placeholder="Ej: SN-12345 o MAT001"
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                    autoCapitalize="characters"
                                />
                                <TouchableOpacity style={styles.btnScanner} onPress={handleStartScanning}>
                                    <Text style={{ fontSize: 20 }}>📷</Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity
                                style={styles.btnSearch}
                                onPress={handleSearchStock}
                                disabled={isProcessing || !searchQuery.trim()}
                            >
                                {isProcessing ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnSearchText}>Buscar en Stock</Text>}
                            </TouchableOpacity>

                            {/* Resultado de búsqueda */}
                            {searchedMaterial && (
                                <View style={styles.resultBox}>
                                    <Text style={styles.itemCodigo}>{searchedMaterial.nombre_material}</Text>
                                    <Text style={{ color: Colors.textSecondary, fontSize: FontSizes.sm }}>Código: {searchedMaterial.codigo_material}</Text>
                                    {searchedMaterial.serie && <Text style={styles.itemSerie}>Serie: {searchedMaterial.serie}</Text>}
                                    <Text style={{ color: Colors.success, fontSize: FontSizes.sm, fontWeight: 'bold', marginTop: 4 }}>
                                        Disponible: {searchedMaterial.cantidad} en {searchedMaterial.ubicacion_nombre}
                                    </Text>

                                    {!searchedMaterial.serie && (
                                        <View style={{ marginTop: Spacing.md }}>
                                            <Text style={styles.inputLabel}>Cantidad a agregar</Text>
                                            <TextInput
                                                style={styles.input}
                                                keyboardType="numeric"
                                                value={cantidadToAdd}
                                                onChangeText={setCantidadToAdd}
                                                placeholder="1"
                                            />
                                        </View>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.btnAddConfirm, isProcessing && { opacity: 0.7 }]}
                                        onPress={handleAddItemToCaja}
                                        disabled={isProcessing}
                                    >
                                        <Text style={styles.btnAddConfirmText}>Confirmar y Agregar</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* SCANNER OVERLAY */}
            {isScanning && (
                <View style={[StyleSheet.absoluteFillObject, { zIndex: 999 }]}>
                    <CameraView
                        style={StyleSheet.absoluteFillObject}
                        barcodeScannerSettings={{
                            barcodeTypes: ["qr", "ean13", "code128"],
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
                            <Text style={styles.scannerText}>Escanea el código de barras</Text>
                            <TouchableOpacity style={styles.closeScannerBtn} onPress={() => setIsScanning(false)}>
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
    container: { flex: 1, backgroundColor: Colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { padding: Spacing.md },

    headerCard: {
        backgroundColor: Colors.surface,
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        marginBottom: Spacing.lg,
        ...Shadows.sm,
    },
    headerTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.borderLight,
        paddingBottom: Spacing.sm,
    },
    title: { fontSize: FontSizes.xl, fontWeight: 'bold', color: Colors.text },
    badge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
    },
    detailRow: { flexDirection: 'row', marginBottom: 4 },
    detailLabel: { width: 80, fontSize: FontSizes.sm, color: Colors.textSecondary, fontWeight: '500' },
    detailValue: { flex: 1, fontSize: FontSizes.sm, color: Colors.text, fontWeight: '600' },
    warningBox: {
        marginTop: Spacing.md,
        backgroundColor: Colors.warning + '20',
        padding: Spacing.md,
        borderRadius: BorderRadius.sm,
        borderLeftWidth: 4,
        borderLeftColor: Colors.warning,
    },
    warningText: { color: Colors.warning, fontSize: FontSizes.xs, fontWeight: 'bold' },

    sectionTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md },
    btnAddCaja: {
        backgroundColor: Colors.primary,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.md,
    },
    btnAddCajaText: { color: Colors.white, fontSize: FontSizes.sm, fontWeight: 'bold' },

    cajaCard: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
    },
    cajaHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: Colors.surfaceVariant,
        padding: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    cajaTitle: { fontSize: FontSizes.md, fontWeight: 'bold', color: Colors.primaryDark },
    cajaActions: { flexDirection: 'row', alignItems: 'center' },
    btnToggle: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 6,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
    },
    btnOpen: { borderColor: Colors.primary, backgroundColor: Colors.surface },
    btnClose: { borderColor: Colors.success, backgroundColor: Colors.surface },
    btnToggleText: { fontSize: FontSizes.xs, fontWeight: 'bold' },

    itemsContainer: { padding: Spacing.sm },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: Colors.borderLight,
    },
    itemCodigo: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.text },
    itemSerie: { fontSize: FontSizes.xs, color: Colors.info, marginTop: 2 },
    itemQty: { fontSize: FontSizes.md, fontWeight: 'bold', color: Colors.text, marginHorizontal: Spacing.md },
    btnRemoveItem: {
        padding: Spacing.sm,
        backgroundColor: Colors.error + '10',
        borderRadius: BorderRadius.sm,
    },
    btnAddItem: {
        padding: Spacing.md,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        backgroundColor: Colors.primaryLight + '10',
    },
    btnAddItemText: { color: Colors.primary, fontWeight: 'bold', fontSize: FontSizes.sm },
    emptyText: { textAlign: 'center', color: Colors.textSecondary, fontStyle: 'italic', marginVertical: Spacing.lg },
    emptyTextSub: { textAlign: 'center', color: Colors.textSecondary, fontStyle: 'italic', padding: Spacing.md },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl,
        padding: Spacing.lg,
        maxHeight: '90%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
    modalTitle: { fontSize: FontSizes.lg, fontWeight: 'bold', color: Colors.text },
    modalClose: { fontSize: 24, color: Colors.textSecondary },
    modalBody: { paddingBottom: Spacing.xl },
    inputLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
    searchRow: { flexDirection: 'row', marginBottom: Spacing.md },
    input: {
        backgroundColor: Colors.background,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        fontSize: FontSizes.md,
    },
    btnScanner: {
        backgroundColor: Colors.surfaceVariant,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        marginLeft: Spacing.sm,
        width: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnSearch: {
        backgroundColor: Colors.primary,
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
    },
    btnSearchText: { color: Colors.white, fontWeight: 'bold', fontSize: FontSizes.md },
    resultBox: {
        marginTop: Spacing.lg,
        padding: Spacing.md,
        backgroundColor: Colors.surfaceVariant,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: Colors.primary,
    },
    btnAddConfirm: {
        backgroundColor: Colors.success,
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        marginTop: Spacing.lg,
    },
    btnAddConfirmText: { color: Colors.white, fontWeight: 'bold', fontSize: FontSizes.md },

    // Scanner
    scannerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
    scannerTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
    scannerMiddle: { flexDirection: 'row', height: 250 },
    scannerLeft: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
    scannerTarget: { width: 300, position: 'relative' },
    scannerRight: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
    scannerBottom: { flex: 2, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', paddingTop: Spacing.xl },
    corner: { position: 'absolute', width: 20, height: 20, borderColor: Colors.primary, borderWidth: 3 },
    cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
    cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
    cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
    cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
    scannerText: { color: Colors.white, fontSize: FontSizes.md, marginBottom: Spacing.lg },
    closeScannerBtn: { backgroundColor: Colors.surface, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl, borderRadius: BorderRadius.full },
    closeScannerBtnText: { color: Colors.text, fontSize: FontSizes.md, fontWeight: '600' },
});
