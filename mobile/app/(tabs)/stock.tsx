import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    RefreshControl,
    ActivityIndicator,
    Platform,
    TouchableOpacity,
    Alert,
    Modal,
    ScrollView,
    TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { StockLocalItem } from '../../db/database';
import { syncService } from '../../services/sync.service';
import { useRoute } from '../../contexts/RouteContext';
import { useTextSize } from '../../contexts/TextSizeContext';
import { generateUUIDv4 } from '../../utils/uuid';

// Types for transfers
interface TransferenciaItem {
    id: number;
    codigo_material: string;
    nombre_material?: string;
    serie?: string;
    cantidad_solicitada: number;
    estado: string;
}

interface Transferencia {
    id: number;
    origen_tipo: string;
    origen_almacen_id?: string;
    estado: string;
    fecha_creacion: string;
    creado_por?: string;
    items: TransferenciaItem[];
}

// Type for tracking acceptance per item
interface ItemAcceptance {
    aceptar: boolean;
    cantidad: number;
}

// Lazy load database
let databaseService: any = null;
const loadDatabaseService = async () => {
    if (Platform.OS !== 'web' && !databaseService) {
        const { createDatabaseService } = await import('../../db/database');
        databaseService = createDatabaseService();
        await databaseService.init();
    }
    return databaseService;
};

// Type for grouped non-serialized materials (NEW)
interface GroupedNonSerializedMaterial {
    codigo_material: string;
    nombre_material: string;
    unidad_medida: string;
    cantidadTotal: number;
    condiciones: Record<string, number>; // { BUENO: 10, CONTROL: 2 }
    isGrouped: true;
    isSerialized: false;
}

// Type for grouped serialized materials
interface GroupedSerializedMaterial {
    codigo_material: string;
    nombre_material: string;
    series: Array<{ serie: string; condicion: string }>;
    isGrouped: true;
    isSerialized: true;
}

// DisplayItem can now be either grouped type
type DisplayItem = GroupedSerializedMaterial | GroupedNonSerializedMaterial;

const getConditionColor = (condicion: string) => {
    switch (condicion) {
        case 'BUENO': return '#27ae60';
        case 'CONTROL': return '#f39c12';
        case 'BLOQUEADO': return '#c0392b';
        default: return '#7f8c8d';
    }
};

export default function StockScreen() {
    const router = useRouter();
    const { textScale } = useTextSize();
    const [stockItems, setStockItems] = useState<StockLocalItem[]>([]);
    const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'stock' | 'transferencias'>('stock');
    const [selectedTransfer, setSelectedTransfer] = useState<Transferencia | null>(null);
    const [processingTransfer, setProcessingTransfer] = useState(false);
    // State for partial acceptance: { [itemId]: { aceptar, cantidad } }
    const [acceptanceState, setAcceptanceState] = useState<Record<number, ItemAcceptance>>({});
    // State for return modal
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [returnSelection, setReturnSelection] = useState<Record<string, { selected: boolean, cantidad: number }>>({});
    const [returnComment, setReturnComment] = useState('');
    const [processingReturn, setProcessingReturn] = useState(false);
    // Search within return modal
    const [returnSearchQuery, setReturnSearchQuery] = useState('');
    const [showReturnScanner, setShowReturnScanner] = useState(false);

    // NEW: States for grouped view and series modal
    const [selectedSeriesGroup, setSelectedSeriesGroup] = useState<GroupedSerializedMaterial | null>(null);
    const [selectedNonSerializedGroup, setSelectedNonSerializedGroup] = useState<GroupedNonSerializedMaterial | null>(null);

    // NEW: States for verify functionality
    const [showVerifyModal, setShowVerifyModal] = useState(false);
    const [verifyInput, setVerifyInput] = useState('');
    const [verifyResult, setVerifyResult] = useState<{ found: boolean; item?: StockLocalItem } | null>(null);
    const [showVerifyScanner, setShowVerifyScanner] = useState(false);

    // NEW: States for condition change
    const [showConditionModal, setShowConditionModal] = useState(false);
    const [conditionTarget, setConditionTarget] = useState<{ codigo: string, nombre: string, serie: string | null, cantidadDisponible: number, condicionActual: string } | null>(null);
    const [newCondition, setNewCondition] = useState('BUENO');
    const [amountToChange, setAmountToChange] = useState('1');
    const [processingCondition, setProcessingCondition] = useState(false);

    // NEW: States for non-serialized movement
    const [moveSource, setMoveSource] = useState('BUENO');
    const [moveTarget, setMoveTarget] = useState('CONTROL');
    const [moveAmount, setMoveAmount] = useState('');
    const [processingMove, setProcessingMove] = useState(false);


    const permission = useCameraPermissions()[0];
    const requestPermission = useCameraPermissions()[1];
    const cameraRef = useRef<CameraView>(null);

    const insets = useSafeAreaInsets();

    // Initialize return selection from current stock
    const initializeReturnSelection = () => {
        const initial: Record<string, { selected: boolean, cantidad: number }> = {};
        stockItems.forEach(item => {
            const key = `${item.codigo_material}-${item.serie || 'no-serie'}-${item.condicion || 'BUENO'}`;
            initial[key] = {
                selected: false,
                cantidad: item.cantidad
            };
        });
        setReturnSelection(initial);
        setReturnComment('');
        setReturnSearchQuery('');
        setShowReturnScanner(false);
        setShowReturnModal(true);
    };

    // Update single return item
    const updateReturnSelection = (key: string, updates: Partial<{ selected: boolean, cantidad: number }>) => {
        setReturnSelection(prev => ({
            ...prev,
            [key]: { ...prev[key], ...updates }
        }));
    };

    // Initialize acceptance state when selecting a transfer
    const initializeAcceptance = (transfer: Transferencia) => {
        const initial: Record<number, ItemAcceptance> = {};
        transfer.items.forEach(item => {
            initial[item.id] = {
                aceptar: true,
                cantidad: item.cantidad_solicitada
            };
        });
        setAcceptanceState(initial);
        setSelectedTransfer(transfer);
    };

    // Update single item acceptance
    const updateItemAcceptance = (itemId: number, updates: Partial<ItemAcceptance>) => {
        setAcceptanceState(prev => ({
            ...prev,
            [itemId]: { ...prev[itemId], ...updates }
        }));
    };

    // Cargar stock desde DB local (offline, rápido)
    const loadStockLocal = async () => {
        try {
            const db = await loadDatabaseService();
            if (db) {
                const items = await db.getStockLocal();
                setStockItems(items || []);
            }
        } catch (error) {
            console.error('Error loading local stock:', error);
        }
    };

    // Cargar transferencias desde cache local SQLite
    const loadTransferenciasLocal = async () => {
        try {
            const db = await loadDatabaseService();
            if (db) {
                const cached = await db.getTransferenciasPendientes();
                setTransferencias(cached || []);
                console.log(`loadTransferenciasLocal: Loaded ${cached?.length || 0} transfers from cache`);
            }
        } catch (error) {
            console.error('loadTransferenciasLocal: Error:', error);
        }
    };



    // Sincronizar transferencias desde backend y guardar en cache local
    const syncTransferenciasFromBackend = async () => {
        try {
            const data = await syncService.getTransferenciasPendientes();

            // If null, backend failed - preserve local cache, don't clear
            if (data === null) {
                console.log('syncTransferenciasFromBackend: Backend unavailable, preserving local cache');
                return;
            }

            const db = await loadDatabaseService();
            if (db && data) {
                await db.saveTransferenciasPendientes(data);
            }
            setTransferencias(data || []);
        } catch (error) {
            console.error('Error syncing transferencias:', error);
            Alert.alert('Error', 'No se pudo obtener las transferencias pendientes');
        }
    };

    // Carga inicial: SOLO datos locales (sin backend) - stock Y transferencias
    const loadLocal = async () => {
        setLoading(true);
        await Promise.all([
            loadStockLocal(),
            loadTransferenciasLocal()
        ]);
        setLoading(false);
    };

    // Reload when screen comes into focus - SOLO datos locales (offline friendly)
    useFocusEffect(
        useCallback(() => {
            loadLocal();
        }, [])
    );

    useEffect(() => {
        loadLocal();
    }, []);

    // ACTUALIZAR: Sincroniza TODO desde el backend (usa el mismo proceso que Ruta/Home)
    const { syncWithBackend, refreshing: contextRefreshing, rutaActiva } = useRoute();

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            // Usar el mismo sync que Home/Ruta - sube pendientes primero, luego descarga todo
            await syncWithBackend();
            // Recargar datos locales después del sync
            await loadLocal();
        } catch (error) {
            console.error('Stock onRefresh error:', error);
            Alert.alert('Error', 'No se pudo sincronizar con el servidor');
        } finally {
            setRefreshing(false);
        }
    };

    // Guardar stock desde respuesta del backend (evita llamada adicional)
    const saveStockFromResponse = async (stockItems: any[]) => {
        try {
            const db = await loadDatabaseService();
            if (db && stockItems && stockItems.length >= 0) {
                const mapped = stockItems.map((item: any) => ({
                    codigo_material: item.codigo_material,
                    nombre_material: item.nombre_material || item.codigo_material,
                    serie: item.serie || null,
                    cantidad: item.cantidad || 1,
                    unidad_medida: item.serie ? 'SERIALIZADO' : 'UNIDAD',
                    fecha_asignacion: new Date().toISOString(),
                    condicion: item.condicion || 'BUENO',
                    ubicacion_codigo: item.ubicacion_codigo || null
                }));
                await db.saveStockLocal(mapped);
                await loadStockLocal();
                console.log('saveStockFromResponse: Saved', mapped.length, 'items');
            }
        } catch (error) {
            console.error('saveStockFromResponse: Error', error);
        }
    };

    const handleAcceptTransfer = async (transferencia: Transferencia) => {
        Alert.alert(
            'Aceptar Transferencia',
            `¿Aceptar ${transferencia.items.length} items de ${transferencia.origen_almacen_id || 'almacén'}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Aceptar',
                    onPress: async () => {
                        setProcessingTransfer(true);
                        const result = await syncService.responderTransferencia(transferencia.id, true);
                        setProcessingTransfer(false);

                        if (result.success) {
                            Alert.alert('Éxito', result.message || 'Transferencia aceptada');
                            setSelectedTransfer(null);
                            // Usar stock devuelto en respuesta (sin llamada adicional)
                            if (result.stock_actualizado) {
                                await saveStockFromResponse(result.stock_actualizado);
                            }
                            // Actualizar lista de transferencias
                            await syncTransferenciasFromBackend();
                        } else {
                            Alert.alert('Error', result.message || 'Error al aceptar');
                        }
                    }
                }
            ]
        );
    };

    const handleRejectTransfer = async (transferencia: Transferencia) => {
        Alert.alert(
            'Rechazar Transferencia',
            `¿Rechazar transferencia de ${transferencia.origen_almacen_id || 'almacén'}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Rechazar',
                    style: 'destructive',
                    onPress: async () => {
                        setProcessingTransfer(true);
                        const result = await syncService.responderTransferencia(transferencia.id, false);
                        setProcessingTransfer(false);

                        if (result.success) {
                            Alert.alert('Rechazada', result.message || 'Transferencia rechazada');
                            setSelectedTransfer(null);
                            // Usar stock devuelto en respuesta (sin llamada adicional)
                            if (result.stock_actualizado) {
                                await saveStockFromResponse(result.stock_actualizado);
                            }
                            // Actualizar lista de transferencias
                            await syncTransferenciasFromBackend();
                        } else {
                            Alert.alert('Error', result.message || 'Error al rechazar');
                        }
                    }
                }
            ]
        );
    };

    // Handle partial acceptance with selected items/quantities
    const handlePartialAccept = async () => {
        if (!selectedTransfer) return;

        // Build cantidadesAceptadas from state
        const cantidadesAceptadas = selectedTransfer.items
            .filter(item => acceptanceState[item.id]?.aceptar)
            .map(item => ({
                item_id: item.id,
                cantidad: acceptanceState[item.id]?.cantidad || 0
            }))
            .filter(ca => ca.cantidad > 0);

        if (cantidadesAceptadas.length === 0) {
            Alert.alert('Error', 'Debe aceptar al menos un item');
            return;
        }

        setProcessingTransfer(true);
        const result = await syncService.responderTransferencia(
            selectedTransfer.id,
            true,
            undefined,
            cantidadesAceptadas
        );
        setProcessingTransfer(false);

        if (result.success) {
            Alert.alert('Éxito', result.message || 'Transferencia procesada');
            setSelectedTransfer(null);
            if (result.stock_actualizado) {
                await saveStockFromResponse(result.stock_actualizado);
            }
            await syncTransferenciasFromBackend();
        } else {
            Alert.alert('Error', result.message || 'Error al procesar');
        }
    };

    // Handle return request
    const handleRequestReturn = async () => {
        // Build items from selection
        const itemsToReturn = stockItems
            .filter(item => {
                const key = `${item.codigo_material}-${item.serie || 'no-serie'}-${item.condicion || 'BUENO'}`;
                return returnSelection[key]?.selected && returnSelection[key]?.cantidad > 0;
            })
            .map(item => {
                const key = `${item.codigo_material}-${item.serie || 'no-serie'}-${item.condicion || 'BUENO'}`;
                return {
                    codigo_material: item.codigo_material,
                    serie: item.serie || undefined,
                    cantidad: returnSelection[key]?.cantidad || 0,
                    condicion: item.condicion || 'BUENO'
                };
            });

        if (itemsToReturn.length === 0) {
            Alert.alert('Error', 'Debe seleccionar al menos un item para devolver');
            return;
        }

        setProcessingReturn(true);
        // almacenDestino empty = auto-detect from technician's zone
        const result = await syncService.solicitarDevolucion('', itemsToReturn, returnComment || undefined);
        setProcessingReturn(false);

        if (result.success) {
            Alert.alert('Éxito', result.message || 'Devolución solicitada');
            setShowReturnModal(false);
            // Refresh to update stock
            await onRefresh();
        } else {
            Alert.alert('Error', result.message || 'Error al solicitar devolución');
        }
    };

    // NEW: Function to group items (both serialized and non-serialized)
    const getGroupedStockItems = (): DisplayItem[] => {
        const groups: Record<string, DisplayItem> = {};

        stockItems.forEach(item => {
            if (!groups[item.codigo_material]) {
                if (item.unidad_medida === 'SERIALIZADO') {
                    groups[item.codigo_material] = {
                        codigo_material: item.codigo_material,
                        nombre_material: item.nombre_material,
                        series: [],
                        isGrouped: true,
                        isSerialized: true
                    } as GroupedSerializedMaterial;
                } else {
                    groups[item.codigo_material] = {
                        codigo_material: item.codigo_material,
                        nombre_material: item.nombre_material,
                        unidad_medida: item.unidad_medida,
                        cantidadTotal: 0,
                        condiciones: { 'BUENO': 0, 'CONTROL': 0, 'BLOQUEADO': 0 },
                        isGrouped: true,
                        isSerialized: false
                    } as GroupedNonSerializedMaterial;
                }
            }

            const group = groups[item.codigo_material];

            if (group.isSerialized) {
                if (item.serie) {
                    (group as GroupedSerializedMaterial).series.push({
                        serie: item.serie,
                        condicion: item.condicion || 'BUENO'
                    });
                }
            } else {
                const nonSerGroup = group as GroupedNonSerializedMaterial;
                nonSerGroup.cantidadTotal += item.cantidad;
                const cond = item.condicion || 'BUENO';
                nonSerGroup.condiciones[cond] = (nonSerGroup.condiciones[cond] || 0) + item.cantidad;
            }
        });

        return Object.values(groups);
    };

    // NEW: Handle verify serial
    const handleVerifySerie = () => {
        const serie = verifyInput.trim().toUpperCase();
        if (!serie) {
            Alert.alert('Error', 'Ingrese un número de serie');
            return;
        }
        const found = stockItems.find(i => i.serie && i.serie.toUpperCase() === serie);
        setVerifyResult(found ? { found: true, item: found } : { found: false });
    };

    // NEW: Open verify modal
    const openVerifyModal = () => {
        setVerifyInput('');
        setVerifyResult(null);
        setShowVerifyScanner(false);
        setShowVerifyModal(true);
    };

    // NEW: Open scanner for verify
    const openVerifyScanner = async () => {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert('Permiso Requerido', 'Se necesita acceso a la cámara para escanear códigos de barras');
                return;
            }
        }
        setShowVerifyScanner(true);
    };

    // NEW: Handle barcode scanned in verify modal
    const handleVerifyBarCodeScanned = (result: { type: string; data: string }) => {
        const scannedCode = result.data.toUpperCase();
        setVerifyInput(scannedCode);
        setShowVerifyScanner(false);

        // Auto-search after scan
        const found = stockItems.find(i => i.serie && i.serie.toUpperCase() === scannedCode);
        setVerifyResult(found ? { found: true, item: found } : { found: false });
    };

    // Return modal: open scanner
    const openReturnScanner = async () => {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert('Permiso Requerido', 'Se necesita acceso a la cámara para escanear códigos de barras');
                return;
            }
        }
        setShowReturnScanner(true);
    };

    // Return modal: handle barcode scanned
    const handleReturnBarCodeScanned = (result: { type: string; data: string }) => {
        const scannedCode = result.data.toUpperCase();
        setReturnSearchQuery(scannedCode);
        setShowReturnScanner(false);
    };

    // NEW: Open Condition Change Modal
    const openConditionModal = (item: { codigo_material: string, nombre_material: string, serie?: string | null, cantidad: number, condicion: string }) => {
        setConditionTarget({
            codigo: item.codigo_material,
            nombre: item.nombre_material,
            serie: item.serie || null,
            cantidadDisponible: item.cantidad,
            condicionActual: item.condicion
        });
        setNewCondition(item.condicion); // Default to current
        setAmountToChange('1'); // Default 1
        setShowConditionModal(true);
    };

    // NEW: Handle Condition Change Submit
    const handleChangeCondition = async () => {
        if (!conditionTarget) return;

        const amount = parseFloat(amountToChange);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('Error', 'Ingrese una cantidad válida');
            return;
        }

        if (amount > conditionTarget.cantidadDisponible) {
            Alert.alert('Error', 'La cantidad excede el stock disponible');
            return;
        }

        if (newCondition === conditionTarget.condicionActual) {
            Alert.alert('Aviso', 'La nueva condición es igual a la actual');
            return;
        }

        setProcessingCondition(true);
        try {
            const db = await loadDatabaseService();
            if (db) {
                // Fase 3: persistir la operación AJUSTE del outbox con UUID estable
                // ANTES de tocar el stock local. Un sync automático (p. ej. al volver
                // al primer plano) debe encontrar el outbox completo e idempotente.
                const timestampCond = new Date().toISOString();
                const otAjusteCond = `C:${conditionTarget.condicionActual}->${newCondition}`;
                const detalleAjusteCond = `Ajuste de condición ${conditionTarget.nombre}${conditionTarget.serie ? ` (serie ${conditionTarget.serie})` : ''}: ${conditionTarget.condicionActual} → ${newCondition}`;
                await db.crearOperacionPendiente({
                    operacion_uuid: generateUUIDv4(),
                    tipo_gestion: 'AJUSTE',
                    cita: 'SISTEMA',
                    ot: otAjusteCond,
                    partida: 0,
                    fecha_hora_creacion: timestampCond,
                    gestion: {
                        terminal: '',
                        tipo_cierre: 'AJUSTE_CONDICION',
                        observaciones: detalleAjusteCond,
                        material_retirado: [],
                        material_entregado: [],
                    },
                    movimientos: [{
                        uuid: generateUUIDv4(),
                        codigo_material: conditionTarget.codigo,
                        serie: conditionTarget.serie,
                        cantidad: amount,
                        tipo_movimiento: 'AJUSTE',
                        condicion: newCondition,
                        cita: 'SISTEMA',
                        ot: otAjusteCond,
                        partida: 0,
                        foto_serie: null,
                        fecha_hora: timestampCond,
                    }],
                });
                // Gestión local del outbox: queda PENDING hasta que el backend
                // confirme la operación (SYNCED) o la rechace (ERROR visible).
                await db.saveGestion({
                    tipo: 'AJUSTE',
                    ruta_id: rutaActiva?.id || 0,
                    cita: 'SISTEMA',
                    ot: otAjusteCond,
                    partida: 0,
                    tipo_cierre: 'AJUSTE_CONDICION',
                    observaciones: detalleAjusteCond,
                    nota_novedad: detalleAjusteCond,
                    timestamp: timestampCond,
                }, true);

                // Stock local optimista (el backend reconcilia al confirmar).
                await db.changeCondicionLocal(
                    conditionTarget.codigo,
                    conditionTarget.serie,
                    amount,
                    newCondition
                );

                Alert.alert('Éxito', 'Condición actualizada');
                setShowConditionModal(false);
                if (conditionTarget.serie) {
                    setSelectedSeriesGroup(null); // Force close series modal to avoid stale data
                }
                await loadLocal(); // Refresh UI
            }
        } catch (error: any) {
            console.error('Error changing condition:', error);
            Alert.alert('Error', error.message || 'No se pudo cambiar la condición');
        } finally {
            setProcessingCondition(false);
        }
    };

    // NEW: Handle Stock Move (Non-Serialized)
    const handleMoveStockCondition = async () => {
        if (!selectedNonSerializedGroup) return;

        const amount = parseFloat(moveAmount);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('Error', 'Ingrese una cantidad válida');
            return;
        }

        const currentQty = selectedNonSerializedGroup.condiciones[moveSource] || 0;
        if (amount > currentQty) {
            Alert.alert('Error', 'La cantidad excede el stock disponible en la condición origen');
            return;
        }

        if (moveSource === moveTarget) {
            Alert.alert('Error', 'La condición origen y destino son iguales');
            return;
        }

        setProcessingMove(true);
        try {
            const db = await loadDatabaseService();
            if (db) {
                // Fase 3: operación AJUSTE del outbox (antes del stock local).
                const timestampMove = new Date().toISOString();
                const otAjusteMove = `C:${moveSource}->${moveTarget}`;
                const detalleAjusteMove = `Ajuste de stock ${selectedNonSerializedGroup.nombre_material} (${amount} u.): ${moveSource} → ${moveTarget}`;
                await db.crearOperacionPendiente({
                    operacion_uuid: generateUUIDv4(),
                    tipo_gestion: 'AJUSTE',
                    cita: 'SISTEMA',
                    ot: otAjusteMove,
                    partida: 0,
                    fecha_hora_creacion: timestampMove,
                    gestion: {
                        terminal: '',
                        tipo_cierre: 'AJUSTE_CONDICION',
                        observaciones: detalleAjusteMove,
                        material_retirado: [],
                        material_entregado: [],
                    },
                    movimientos: [{
                        uuid: generateUUIDv4(),
                        codigo_material: selectedNonSerializedGroup.codigo_material,
                        serie: null,
                        cantidad: amount,
                        tipo_movimiento: 'AJUSTE',
                        condicion: moveTarget,
                        condicion_origen: moveSource,
                        cita: 'SISTEMA',
                        ot: otAjusteMove,
                        partida: 0,
                        foto_serie: null,
                        fecha_hora: timestampMove,
                    }],
                });
                // Gestión local del outbox: PENDING hasta confirmación del backend.
                await db.saveGestion({
                    tipo: 'AJUSTE',
                    ruta_id: rutaActiva?.id || 0,
                    cita: 'SISTEMA',
                    ot: otAjusteMove,
                    partida: 0,
                    tipo_cierre: 'AJUSTE_CONDICION',
                    observaciones: detalleAjusteMove,
                    nota_novedad: detalleAjusteMove,
                    timestamp: timestampMove,
                }, true);

                // Stock local optimista: mueve de la condición origen a la destino.
                await db.changeCondicionLocal(
                    selectedNonSerializedGroup.codigo_material,
                    null,
                    amount,
                    moveTarget,
                    moveSource
                );

                Alert.alert('Éxito', 'Stock movido correctamente');
                setSelectedNonSerializedGroup(null); // Close modal
                await loadLocal(); // Refresh UI
            }
        } catch (error: any) {
            console.error('Error moving stock:', error);
            Alert.alert('Error', error.message || 'No se pudo mover el stock');
        } finally {
            setProcessingMove(false);
        }
    };

    // NEW: Render grouped stock item
    const renderGroupedStockItem = ({ item }: { item: DisplayItem }) => {
        if (item.isSerialized) {
            // Serialized group - tappable to show series modal
            return (
                <TouchableOpacity
                    style={styles.stockItem}
                    onPress={() => setSelectedSeriesGroup(item as GroupedSerializedMaterial)}
                >
                    <View style={styles.stockItemIcon}>
                        <Ionicons name="barcode" size={24} color="#3498db" />
                    </View>
                    <View style={styles.stockItemInfo}>
                        <Text style={[styles.stockItemNombre, { fontSize: 16 * textScale }]}>{item.nombre_material}</Text>
                        <Text style={[styles.stockItemCodigo, { fontSize: 14 * textScale }]}>{item.codigo_material}</Text>
                        <Text style={[styles.stockItemSerieCount, { fontSize: 12 * textScale }]}>
                            {(item as GroupedSerializedMaterial).series.length} series
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                </TouchableOpacity>
            );
        } else {
            // Non-serialized group - tappable to show details modal
            const nonSer = item as GroupedNonSerializedMaterial;
            return (
                <TouchableOpacity
                    style={styles.stockItem}
                    onPress={() => setSelectedNonSerializedGroup(nonSer)}
                >
                    <View style={styles.stockItemIcon}>
                        <Ionicons name="cube-outline" size={24} color="#3498db" />
                    </View>
                    <View style={styles.stockItemInfo}>
                        <Text style={[styles.stockItemNombre, { fontSize: 16 * textScale }]}>{item.nombre_material}</Text>
                        <Text style={[styles.stockItemCodigo, { fontSize: 14 * textScale }]}>{item.codigo_material}</Text>

                        {/* Show badges for non-zero conditions */}
                        <View style={{ flexDirection: 'row', marginTop: 4, flexWrap: 'wrap' }}>
                            {Object.entries(nonSer.condiciones).map(([cond, qty]) => {
                                if (qty > 0) {
                                    return (
                                        <View key={cond} style={{
                                            backgroundColor: getConditionColor(cond),
                                            paddingHorizontal: 6,
                                            paddingVertical: 1,
                                            borderRadius: 4,
                                            marginRight: 4,
                                            marginBottom: 2
                                        }}>
                                            <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                                                {cond.charAt(0)}: {qty}
                                            </Text>
                                        </View>
                                    );
                                }
                                return null;
                            })}
                        </View>
                    </View>
                    <View style={styles.stockItemCantidad}>
                        <Text style={styles.stockItemCantidadText}>{nonSer.cantidadTotal}</Text>
                        <Text style={styles.stockItemCantidadLabel}>uds</Text>
                    </View>
                </TouchableOpacity>
            );
        }
    };

    // Get grouped items for display
    const groupedStockItems = getGroupedStockItems();

    const renderStockItem = ({ item }: { item: StockLocalItem }) => (
        <TouchableOpacity
            style={styles.stockItem}
            onLongPress={() => openConditionModal({
                codigo_material: item.codigo_material,
                nombre_material: item.nombre_material,
                serie: item.serie,
                cantidad: item.cantidad,
                condicion: item.condicion || 'BUENO'
            })}
        >
            <View style={styles.stockItemIcon}>
                <Ionicons
                    name={item.unidad_medida === 'SERIALIZADO' ? 'barcode' : 'cube-outline'}
                    size={24}
                    color="#3498db"
                />
            </View>
            <View style={styles.stockItemInfo}>
                <Text style={[styles.stockItemNombre, { fontSize: 16 * textScale }]}>{item.nombre_material}</Text>
                <Text style={[styles.stockItemCodigo, { fontSize: 14 * textScale }]}>{item.codigo_material}</Text>
                {item.serie && (
                    <Text style={[styles.stockItemSerie, { fontSize: 13 * textScale }]}>Serie: {item.serie}</Text>
                )}
                <View style={{ flexDirection: 'row', marginTop: 4 }}>
                    <View style={{
                        backgroundColor: getConditionColor(item.condicion || 'BUENO'),
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4
                    }}>
                        <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                            {item.condicion || 'BUENO'}
                        </Text>
                    </View>
                </View>
            </View>
            <View style={styles.stockItemCantidad}>
                <Text style={styles.stockItemCantidadText}>
                    {item.unidad_medida === 'SERIALIZADO' ? '1' : item.cantidad}
                </Text>
                <Text style={styles.stockItemCantidadLabel}>
                    {item.unidad_medida === 'SERIALIZADO' ? 'unid' : 'uds'}
                </Text>
            </View>
        </TouchableOpacity>
    );

    const renderTransferenciaItem = ({ item }: { item: Transferencia }) => (
        <TouchableOpacity
            style={styles.transferenciaItem}
            onPress={() => initializeAcceptance(item)}
        >
            <View style={styles.transferenciaIcon}>
                <Ionicons name="swap-horizontal" size={24} color="#f39c12" />
            </View>
            <View style={styles.transferenciaInfo}>
                <Text style={[styles.transferenciaOrigen, { fontSize: 15 * textScale }]}>
                    De: {item.origen_almacen_id || 'Almacén'}
                </Text>
                <Text style={[styles.transferenciaItems, { fontSize: 13 * textScale }]}>
                    {item.items.length} material{item.items.length > 1 ? 'es' : ''}
                </Text>
                <Text style={[styles.transferenciaFecha, { fontSize: 12 * textScale }]}>
                    {new Date(item.fecha_creacion).toLocaleDateString()}
                </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#666" />
        </TouchableOpacity>
    );

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <Ionicons name={activeTab === 'stock' ? 'cube-outline' : 'swap-horizontal'} size={64} color="#555" />
            <Text style={styles.emptyStateTitle}>
                {activeTab === 'stock' ? 'Sin materiales en stock' : 'Sin transferencias pendientes'}
            </Text>
            <Text style={styles.emptyStateSubtitle}>
                {activeTab === 'stock'
                    ? 'Los materiales que aceptes en las transferencias aparecerán aquí'
                    : 'No tienes transferencias pendientes de aceptar'
                }
            </Text>
        </View>
    );

    if (loading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color="#3498db" />
                <Text style={styles.loadingText}>Cargando...</Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingBottom: insets.bottom }]}>
            {/* Tab Selector */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'stock' && styles.activeTab]}
                    onPress={() => setActiveTab('stock')}
                >
                    <Text style={[styles.tabText, activeTab === 'stock' && styles.activeTabText]}>
                        Mi Stock
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'transferencias' && styles.activeTab]}
                    onPress={() => setActiveTab('transferencias')}
                >
                    <Text style={[styles.tabText, activeTab === 'transferencias' && styles.activeTabText]}>
                        Transferencias
                    </Text>
                    {transferencias.length > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{transferencias.length}</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            {/* Header Stats */}
            {activeTab === 'stock' && (
                <View style={styles.statsContainer}>
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{stockItems.length}</Text>
                            <Text style={styles.statLabel}>Materiales</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                                {stockItems.filter(i => i.unidad_medida === 'SERIALIZADO').length}
                            </Text>
                            <Text style={styles.statLabel}>Serializados</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                                {stockItems.reduce((acc, i) => acc + (i.unidad_medida !== 'SERIALIZADO' ? i.cantidad : 0), 0)}
                            </Text>
                            <Text style={styles.statLabel}>Unidades</Text>
                        </View>
                    </View>
                    {stockItems.length > 0 && (
                        <View style={styles.actionButtonsRow}>
                            <TouchableOpacity
                                style={styles.returnButton}
                                onPress={initializeReturnSelection}
                            >
                                <Ionicons name="arrow-undo" size={18} color="#fff" />
                                <Text style={styles.returnButtonText}>Devolver</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.verifyButton}
                                onPress={openVerifyModal}
                            >
                                <Ionicons name="search" size={18} color="#fff" />
                                <Text style={styles.verifyButtonText}>Verificar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.verifyButton}
                                onPress={() => router.push('/auditoria-campo' as Href)}
                            >
                                <Ionicons name="clipboard-outline" size={18} color="#fff" />
                                <Text style={styles.verifyButtonText}>Auditar</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}

            {/* List - NOW USING GROUPED VIEW */}
            {activeTab === 'stock' ? (
                <FlatList
                    data={groupedStockItems}
                    keyExtractor={(item) => item.codigo_material}
                    renderItem={renderGroupedStockItem}
                    ListEmptyComponent={renderEmptyState}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#3498db"
                            colors={['#3498db']}
                        />
                    }
                    contentContainerStyle={groupedStockItems.length === 0 ? styles.emptyContainer : undefined}
                />
            ) : (
                <FlatList
                    data={transferencias}
                    keyExtractor={(item) => `transfer-${item.id}`}
                    renderItem={renderTransferenciaItem}
                    ListEmptyComponent={renderEmptyState}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#3498db"
                            colors={['#3498db']}
                        />
                    }
                    contentContainerStyle={transferencias.length === 0 ? styles.emptyContainer : undefined}
                />
            )}

            {/* Transfer Detail Modal */}
            <Modal
                visible={!!selectedTransfer}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setSelectedTransfer(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Transferencia</Text>
                            <TouchableOpacity onPress={() => setSelectedTransfer(null)}>
                                <Ionicons name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {selectedTransfer && (
                            <ScrollView style={styles.modalBody}>
                                <Text style={styles.modalSubtitle}>
                                    De: {selectedTransfer.origen_almacen_id || 'Almacén'}
                                </Text>
                                <Text style={styles.modalDate}>
                                    {new Date(selectedTransfer.fecha_creacion).toLocaleString()}
                                </Text>

                                <Text style={styles.modalSectionTitle}>Materiales (toca para seleccionar):</Text>
                                {selectedTransfer.items.map((item, index) => {
                                    const acceptance = acceptanceState[item.id];
                                    const isSerializado = !!item.serie;
                                    return (
                                        <TouchableOpacity
                                            key={index}
                                            style={[
                                                styles.modalItem,
                                                acceptance?.aceptar && styles.modalItemSelected
                                            ]}
                                            onPress={() => updateItemAcceptance(item.id, {
                                                aceptar: !acceptance?.aceptar
                                            })}
                                        >
                                            {/* Checkbox */}
                                            <View style={[
                                                styles.checkbox,
                                                acceptance?.aceptar && styles.checkboxChecked
                                            ]}>
                                                {acceptance?.aceptar && (
                                                    <Ionicons name="checkmark" size={16} color="#fff" />
                                                )}
                                            </View>

                                            {/* Item info */}
                                            <View style={styles.modalItemInfo}>
                                                <Text style={styles.modalItemName}>
                                                    {item.nombre_material || item.codigo_material}
                                                </Text>
                                                {item.serie && (
                                                    <Text style={styles.modalItemSerie}>Serie: {item.serie}</Text>
                                                )}
                                            </View>

                                            {/* Quantity control */}
                                            {!isSerializado && acceptance?.aceptar ? (
                                                <View style={styles.quantityControl}>
                                                    <TouchableOpacity
                                                        style={styles.quantityButton}
                                                        onPress={() => {
                                                            const newCant = Math.max(1, (acceptance?.cantidad || 1) - 1);
                                                            updateItemAcceptance(item.id, { cantidad: newCant });
                                                        }}
                                                    >
                                                        <Ionicons name="remove" size={16} color="#fff" />
                                                    </TouchableOpacity>
                                                    <TextInput
                                                        style={styles.quantityInput}
                                                        value={String(acceptance?.cantidad || 0)}
                                                        keyboardType="number-pad"
                                                        onChangeText={(text) => {
                                                            const num = parseInt(text) || 0;
                                                            const maxCant = item.cantidad_solicitada;
                                                            updateItemAcceptance(item.id, { cantidad: Math.min(num, maxCant) });
                                                        }}
                                                    />
                                                    <TouchableOpacity
                                                        style={styles.quantityButton}
                                                        onPress={() => {
                                                            const maxCant = item.cantidad_solicitada;
                                                            const newCant = Math.min(maxCant, (acceptance?.cantidad || 0) + 1);
                                                            updateItemAcceptance(item.id, { cantidad: newCant });
                                                        }}
                                                    >
                                                        <Ionicons name="add" size={16} color="#fff" />
                                                    </TouchableOpacity>
                                                    <Text style={styles.maxQuantity}>/{item.cantidad_solicitada}</Text>
                                                </View>
                                            ) : (
                                                <Text style={styles.modalItemCant}>x{item.cantidad_solicitada}</Text>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}

                        <View style={[styles.modalActions, { paddingBottom: Math.max(16, insets.bottom + 16) }]}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.rejectButton]}
                                onPress={() => selectedTransfer && handleRejectTransfer(selectedTransfer)}
                                disabled={processingTransfer}
                            >
                                <Ionicons name="close-circle" size={20} color="#fff" />
                                <Text style={styles.modalButtonText}>Rechazar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.partialButton]}
                                onPress={handlePartialAccept}
                                disabled={processingTransfer}
                            >
                                {processingTransfer ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <>
                                        <Ionicons name="checkmark-done" size={20} color="#fff" />
                                        <Text style={styles.modalButtonText}>Confirmar</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Return Modal */}
            <Modal
                visible={showReturnModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowReturnModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Devolver Material</Text>
                            <TouchableOpacity onPress={() => setShowReturnModal(false)}>
                                <Ionicons name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.modalBody}>
                            <Text style={styles.modalSectionTitle}>Buscar material:</Text>

                            {/* Scanner Camera View for Return */}
                            {showReturnScanner ? (
                                <View style={styles.scannerContainer}>
                                    <CameraView
                                        style={styles.scannerCamera}
                                        barcodeScannerSettings={{
                                            barcodeTypes: ['code128', 'code39', 'ean13', 'ean8', 'qr', 'upc_a', 'upc_e'],
                                        }}
                                        onBarcodeScanned={handleReturnBarCodeScanned}
                                    />
                                    <View style={styles.scannerOverlay}>
                                        <View style={styles.scannerFrame} />
                                    </View>
                                    <TouchableOpacity
                                        style={styles.closeScannerButton}
                                        onPress={() => setShowReturnScanner(false)}
                                    >
                                        <Ionicons name="close-circle" size={40} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View style={styles.verifyInputContainer}>
                                    <TextInput
                                        style={styles.verifyTextInput}
                                        placeholder="Código, nombre o serie..."
                                        placeholderTextColor="#666"
                                        value={returnSearchQuery}
                                        onChangeText={setReturnSearchQuery}
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                    />
                                    <TouchableOpacity
                                        style={styles.verifyScanButton}
                                        onPress={openReturnScanner}
                                    >
                                        <Ionicons name="barcode-outline" size={24} color="#fff" />
                                    </TouchableOpacity>
                                    {returnSearchQuery.length > 0 && (
                                        <TouchableOpacity
                                            style={styles.verifySearchButton}
                                            onPress={() => setReturnSearchQuery('')}
                                        >
                                            <Ionicons name="close-circle" size={24} color="#999" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}

                            <Text style={[styles.modalSectionTitle, { marginTop: 12 }]}>Selecciona items a devolver:</Text>
                            {stockItems.filter(item => {
                                if (!returnSearchQuery.trim()) return true;
                                const q = returnSearchQuery.trim().toUpperCase();
                                return (
                                    item.codigo_material.toUpperCase().includes(q) ||
                                    (item.nombre_material && item.nombre_material.toUpperCase().includes(q)) ||
                                    (item.serie && item.serie.toUpperCase().includes(q))
                                );
                            }).map((item, index) => {
                                const key = `${item.codigo_material}-${item.serie || 'no-serie'}-${item.condicion || 'BUENO'}`;
                                const selection = returnSelection[key];
                                const isSerializado = item.unidad_medida === 'SERIALIZADO';
                                return (
                                    <TouchableOpacity
                                        key={key}
                                        style={[
                                            styles.modalItem,
                                            selection?.selected && styles.modalItemSelected
                                        ]}
                                        onPress={() => updateReturnSelection(key, {
                                            selected: !selection?.selected
                                        })}
                                    >
                                        <View style={[
                                            styles.checkbox,
                                            selection?.selected && styles.checkboxChecked
                                        ]}>
                                            {selection?.selected && (
                                                <Ionicons name="checkmark" size={16} color="#fff" />
                                            )}
                                        </View>

                                        <View style={styles.modalItemInfo}>
                                            <Text style={styles.modalItemName}>
                                                {item.nombre_material || item.codigo_material}
                                            </Text>
                                            {item.serie && (
                                                <Text style={styles.modalItemSerie}>Serie: {item.serie}</Text>
                                            )}
                                            <View style={{ flexDirection: 'row', marginTop: 3 }}>
                                                <View style={{
                                                    backgroundColor: getConditionColor(item.condicion || 'BUENO'),
                                                    paddingHorizontal: 6,
                                                    paddingVertical: 1,
                                                    borderRadius: 4
                                                }}>
                                                    <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                                                        {item.condicion || 'BUENO'}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>

                                        {!isSerializado && selection?.selected ? (
                                            <View style={styles.quantityControl}>
                                                <TouchableOpacity
                                                    style={styles.quantityButton}
                                                    onPress={() => {
                                                        const newCant = Math.max(1, (selection?.cantidad || 1) - 1);
                                                        updateReturnSelection(key, { cantidad: newCant });
                                                    }}
                                                >
                                                    <Ionicons name="remove" size={16} color="#fff" />
                                                </TouchableOpacity>
                                                <TextInput
                                                    style={styles.quantityInput}
                                                    value={String(selection?.cantidad || 0)}
                                                    keyboardType="number-pad"
                                                    onChangeText={(text) => {
                                                        const num = parseInt(text) || 0;
                                                        const maxCant = item.cantidad;
                                                        updateReturnSelection(key, { cantidad: Math.min(num, maxCant) });
                                                    }}
                                                />
                                                <TouchableOpacity
                                                    style={styles.quantityButton}
                                                    onPress={() => {
                                                        const maxCant = item.cantidad;
                                                        const newCant = Math.min(maxCant, (selection?.cantidad || 0) + 1);
                                                        updateReturnSelection(key, { cantidad: newCant });
                                                    }}
                                                >
                                                    <Ionicons name="add" size={16} color="#fff" />
                                                </TouchableOpacity>
                                                <Text style={styles.maxQuantity}>/{item.cantidad}</Text>
                                            </View>
                                        ) : (
                                            <Text style={styles.modalItemCant}>x{item.cantidad}</Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}

                            <Text style={[styles.modalSectionTitle, { marginTop: 16 }]}>Comentario (opcional):</Text>
                            <TextInput
                                style={styles.commentInput}
                                placeholder="Motivo de la devolución..."
                                placeholderTextColor="#666"
                                value={returnComment}
                                onChangeText={setReturnComment}
                                multiline
                            />
                        </ScrollView>

                        <View style={[styles.modalActions, { paddingBottom: Math.max(16, insets.bottom + 16) }]}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.rejectButton]}
                                onPress={() => setShowReturnModal(false)}
                            >
                                <Text style={styles.modalButtonText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.acceptButton]}
                                onPress={handleRequestReturn}
                                disabled={processingReturn}
                            >
                                {processingReturn ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <>
                                        <Ionicons name="arrow-undo" size={20} color="#fff" />
                                        <Text style={styles.modalButtonText}>Devolver</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* NEW: Series List Modal */}
            <Modal
                visible={!!selectedSeriesGroup}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setSelectedSeriesGroup(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Números de Serie</Text>
                            <TouchableOpacity onPress={() => setSelectedSeriesGroup(null)}>
                                <Ionicons name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {selectedSeriesGroup && (
                            <View style={[styles.modalBody, { paddingBottom: Math.max(16, insets.bottom + 16) }]}>
                                <Text style={styles.modalSubtitle}>
                                    {selectedSeriesGroup.nombre_material}
                                </Text>
                                <Text style={styles.seriesModalCode}>
                                    Código: {selectedSeriesGroup.codigo_material}
                                </Text>
                                <Text style={styles.seriesModalCount}>
                                    {selectedSeriesGroup.series.length} unidad{selectedSeriesGroup.series.length > 1 ? 'es' : ''}
                                </Text>

                                <ScrollView style={styles.seriesList}>
                                    {selectedSeriesGroup.series.map((item, index) => (
                                        <TouchableOpacity
                                            key={index}
                                            style={styles.seriesItem}
                                            onPress={() => openConditionModal({
                                                codigo_material: selectedSeriesGroup.codigo_material,
                                                nombre_material: selectedSeriesGroup.nombre_material,
                                                serie: item.serie,
                                                cantidad: 1,
                                                condicion: item.condicion
                                            })}
                                        >
                                            <Ionicons name="barcode-outline" size={20} color="#3498db" />
                                            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginLeft: 10 }}>
                                                <Text style={styles.seriesItemText}>{item.serie}</Text>
                                                <View style={{
                                                    backgroundColor: getConditionColor(item.condicion),
                                                    paddingHorizontal: 8,
                                                    paddingVertical: 2,
                                                    borderRadius: 10
                                                }}>
                                                    <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                                                        {item.condicion}
                                                    </Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}


                    </View>
                </View>
            </Modal>

            {/* NEW: Verify Serial Modal */}
            <Modal
                visible={showVerifyModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowVerifyModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Verificar Serie</Text>
                            <TouchableOpacity onPress={() => setShowVerifyModal(false)}>
                                <Ionicons name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalBody}>
                            <Text style={styles.verifyInstructions}>
                                Ingrese o escanee un número de serie para verificar si está en su stock.
                            </Text>

                            {/* Scanner Camera View */}
                            {showVerifyScanner ? (
                                <View style={styles.scannerContainer}>
                                    <CameraView
                                        ref={cameraRef}
                                        style={styles.scannerCamera}
                                        barcodeScannerSettings={{
                                            barcodeTypes: ['code128', 'code39', 'ean13', 'ean8', 'qr', 'upc_a', 'upc_e'],
                                        }}
                                        onBarcodeScanned={handleVerifyBarCodeScanned}
                                    />
                                    <View style={styles.scannerOverlay}>
                                        <View style={styles.scannerFrame} />
                                    </View>
                                    <TouchableOpacity
                                        style={styles.closeScannerButton}
                                        onPress={() => setShowVerifyScanner(false)}
                                    >
                                        <Ionicons name="close-circle" size={40} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View style={styles.verifyInputContainer}>
                                    <TextInput
                                        style={styles.verifyTextInput}
                                        placeholder="Número de serie..."
                                        placeholderTextColor="#666"
                                        value={verifyInput}
                                        onChangeText={(text) => {
                                            setVerifyInput(text);
                                            setVerifyResult(null);
                                        }}
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                    />
                                    <TouchableOpacity
                                        style={styles.verifyScanButton}
                                        onPress={openVerifyScanner}
                                    >
                                        <Ionicons name="barcode-outline" size={24} color="#fff" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.verifySearchButton}
                                        onPress={handleVerifySerie}
                                    >
                                        <Ionicons name="search" size={24} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            )}

                            {verifyResult && (
                                <View style={[
                                    styles.verifyResultBox,
                                    verifyResult.found ? styles.verifyResultFound : styles.verifyResultNotFound
                                ]}>
                                    <Ionicons
                                        name={verifyResult.found ? "checkmark-circle" : "close-circle"}
                                        size={32}
                                        color={verifyResult.found ? "#27ae60" : "#e74c3c"}
                                    />
                                    {verifyResult.found && verifyResult.item ? (
                                        <View style={styles.verifyResultInfo}>
                                            <Text style={styles.verifyResultTitle}>¡Encontrado en su stock!</Text>
                                            <Text style={styles.verifyResultDetail}>
                                                Código: {verifyResult.item.codigo_material}
                                            </Text>
                                            <Text style={styles.verifyResultDetail}>
                                                Material: {verifyResult.item.nombre_material}
                                            </Text>
                                        </View>
                                    ) : (
                                        <View style={styles.verifyResultInfo}>
                                            <Text style={styles.verifyResultTitle}>No encontrado</Text>
                                            <Text style={styles.verifyResultDetail}>
                                                Esta serie no está en su stock actual.
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>

                        <View style={[styles.modalActions, { paddingBottom: Math.max(16, insets.bottom + 16) }]}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.rejectButton]}
                                onPress={() => setShowVerifyModal(false)}
                            >
                                <Text style={styles.modalButtonText}>Cerrar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* NEW: Stock Details Modal (Non-Serialized) */}
            <Modal
                visible={!!selectedNonSerializedGroup}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setSelectedNonSerializedGroup(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Detalle de Stock</Text>
                            <TouchableOpacity onPress={() => setSelectedNonSerializedGroup(null)}>
                                <Ionicons name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {selectedNonSerializedGroup && (
                            <ScrollView style={styles.modalBody}>
                                <Text style={styles.modalSubtitle}>{selectedNonSerializedGroup.nombre_material}</Text>
                                <Text style={styles.seriesModalCode}>{selectedNonSerializedGroup.codigo_material}</Text>
                                <Text style={styles.modalSectionTitle}>Total: {selectedNonSerializedGroup.cantidadTotal} unidades</Text>

                                {/* Condition Breakdown */}
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                                    {Object.entries(selectedNonSerializedGroup.condiciones).map(([cond, qty]) => (
                                        <View key={cond} style={{
                                            backgroundColor: getConditionColor(cond),
                                            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                                            flex: 1, minWidth: '30%', alignItems: 'center'
                                        }}>
                                            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>{qty}</Text>
                                            <Text style={{ color: 'white', fontSize: 10 }}>{cond}</Text>
                                        </View>
                                    ))}
                                </View>

                                {/* Movement Controls */}
                                <Text style={[styles.modalSectionTitle, { marginTop: 24 }]}>Mover Stock</Text>

                                <Text style={{ color: '#aaa', marginTop: 8, marginBottom: 4 }}>Desde (Origen):</Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {['BUENO', 'CONTROL', 'BLOQUEADO'].map(cond => (
                                        <TouchableOpacity
                                            key={`src-${cond}`}
                                            style={{
                                                flex: 1, padding: 8, borderRadius: 6, alignItems: 'center',
                                                backgroundColor: moveSource === cond ? getConditionColor(cond) : '#333',
                                                borderWidth: 1, borderColor: moveSource === cond ? 'white' : '#444',
                                                opacity: (selectedNonSerializedGroup.condiciones[cond] || 0) > 0 ? 1 : 0.5
                                            }}
                                            onPress={() => setMoveSource(cond)}
                                            disabled={(selectedNonSerializedGroup.condiciones[cond] || 0) === 0}
                                        >
                                            <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{cond}</Text>
                                            <Text style={{ color: '#ccc', fontSize: 10 }}>
                                                ({selectedNonSerializedGroup.condiciones[cond] || 0})
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <Text style={{ color: '#aaa', marginTop: 12, marginBottom: 4 }}>Hacia (Destino):</Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {['BUENO', 'CONTROL', 'BLOQUEADO'].map(cond => (
                                        <TouchableOpacity
                                            key={`tgt-${cond}`}
                                            style={{
                                                flex: 1, padding: 8, borderRadius: 6, alignItems: 'center',
                                                backgroundColor: moveTarget === cond ? getConditionColor(cond) : '#333',
                                                borderWidth: 1, borderColor: moveTarget === cond ? 'white' : '#444'
                                            }}
                                            onPress={() => setMoveTarget(cond)}
                                        >
                                            <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{cond}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <Text style={{ color: '#aaa', marginTop: 12, marginBottom: 4 }}>Cantidad:</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <TextInput
                                        style={{
                                            flex: 1, backgroundColor: '#333', color: 'white',
                                            padding: 12, borderRadius: 8, fontSize: 16,
                                            borderWidth: 1, borderColor: '#555'
                                        }}
                                        keyboardType="numeric"
                                        value={moveAmount}
                                        onChangeText={setMoveAmount}
                                        placeholder="0"
                                        placeholderTextColor="#666"
                                    />
                                    <TouchableOpacity
                                        style={{ marginLeft: 8, padding: 12, backgroundColor: '#444', borderRadius: 8 }}
                                        onPress={() => setMoveAmount(String(selectedNonSerializedGroup.condiciones[moveSource] || 0))}
                                    >
                                        <Text style={{ color: '#fff' }}>Máx</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        )}

                        <View style={[styles.modalActions, { paddingBottom: Math.max(16, insets.bottom + 16) }]}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.rejectButton]}
                                onPress={() => setSelectedNonSerializedGroup(null)}
                            >
                                <Text style={styles.modalButtonText}>Cerrar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.acceptButton]}
                                onPress={handleMoveStockCondition}
                                disabled={processingMove}
                            >
                                {processingMove ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Text style={styles.modalButtonText}>Mover Stock</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* NEW: Change Condition Modal */}
            <Modal
                visible={showConditionModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowConditionModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Cambiar Condición</Text>
                            <TouchableOpacity onPress={() => setShowConditionModal(false)}>
                                <Ionicons name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {conditionTarget && (
                            <ScrollView style={styles.modalBody}>
                                <Text style={styles.modalSubtitle}>{conditionTarget.nombre}</Text>
                                <Text style={styles.seriesModalCode}>{conditionTarget.codigo}</Text>
                                {conditionTarget.serie && (
                                    <Text style={styles.seriesModalCode}>Serie: {conditionTarget.serie}</Text>
                                )}

                                <Text style={[styles.modalSectionTitle, { marginTop: 16 }]}>Condición Actual:</Text>
                                <View style={{
                                    backgroundColor: getConditionColor(conditionTarget.condicionActual),
                                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4
                                }}>
                                    <Text style={{ color: 'white', fontWeight: 'bold' }}>{conditionTarget.condicionActual}</Text>
                                </View>

                                <Text style={[styles.modalSectionTitle, { marginTop: 16 }]}>Nueva Condición:</Text>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                                    {['BUENO', 'CONTROL', 'BLOQUEADO'].map((cond) => (
                                        <TouchableOpacity
                                            key={cond}
                                            style={{
                                                flex: 1,
                                                padding: 10,
                                                marginHorizontal: 4,
                                                backgroundColor: newCondition === cond ? getConditionColor(cond) : '#2a2a2a', // Fixed inactive bg
                                                borderRadius: 8,
                                                alignItems: 'center',
                                                borderWidth: 1,
                                                borderColor: newCondition === cond ? getConditionColor(cond) : '#444' // Fixed inactive border
                                            }}
                                            onPress={() => setNewCondition(cond)}
                                        >
                                            <Text style={{
                                                color: newCondition === cond ? 'white' : '#ccc', // Fixed inactive text
                                                fontWeight: 'bold',
                                                fontSize: 12
                                            }}>{cond}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {!conditionTarget.serie && (
                                    <>
                                        <Text style={[styles.modalSectionTitle, { marginTop: 16 }]}>Cantidad a mover:</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                                            <TextInput
                                                style={{
                                                    flex: 1, borderWidth: 1, borderColor: '#555', borderRadius: 8, padding: 10,
                                                    fontSize: 16, backgroundColor: '#333', color: '#fff' // Fixed dark mode styles
                                                }}
                                                keyboardType="numeric"
                                                value={amountToChange}
                                                onChangeText={setAmountToChange}
                                            />
                                            <Text style={{ marginLeft: 10, color: '#888' }}>
                                                / {conditionTarget.cantidadDisponible}
                                            </Text>
                                        </View>
                                    </>
                                )}
                            </ScrollView>
                        )}

                        <View style={[styles.modalActions, { paddingBottom: Math.max(16, insets.bottom + 16) }]}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.rejectButton]}
                                onPress={() => setShowConditionModal(false)}
                            >
                                <Text style={styles.modalButtonText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.acceptButton]}
                                onPress={handleChangeCondition}
                                disabled={processingCondition}
                            >
                                {processingCondition ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Text style={styles.modalButtonText}>Guardar</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#888',
        marginTop: 10,
        fontSize: 14,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#1a1a1a',
        padding: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: 8,
    },
    activeTab: {
        backgroundColor: '#3498db',
    },
    tabText: {
        color: '#888',
        fontSize: 14,
        fontWeight: '600',
    },
    activeTabText: {
        color: '#fff',
    },
    badge: {
        backgroundColor: '#e74c3c',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginLeft: 8,
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    statsContainer: {
        flexDirection: 'row',
        backgroundColor: '#1a1a1a',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    statLabel: {
        color: '#888',
        fontSize: 12,
        marginTop: 4,
    },
    stockItem: {
        flexDirection: 'row',
        backgroundColor: '#1e1e1e',
        padding: 16,
        marginHorizontal: 12,
        marginTop: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    stockItemIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(52, 152, 219, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    stockItemInfo: {
        flex: 1,
    },
    stockItemNombre: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    stockItemCodigo: {
        color: '#888',
        fontSize: 12,
        marginTop: 2,
    },
    stockItemSerie: {
        color: '#3498db',
        fontSize: 12,
        marginTop: 4,
        fontFamily: 'monospace',
    },
    stockItemCantidad: {
        alignItems: 'center',
        backgroundColor: 'rgba(52, 152, 219, 0.15)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    stockItemCantidadText: {
        color: '#3498db',
        fontSize: 20,
        fontWeight: 'bold',
    },
    stockItemCantidadLabel: {
        color: '#888',
        fontSize: 10,
    },
    transferenciaItem: {
        flexDirection: 'row',
        backgroundColor: '#1e1e1e',
        padding: 16,
        marginHorizontal: 12,
        marginTop: 12,
        borderRadius: 12,
        alignItems: 'center',
        borderLeftWidth: 4,
        borderLeftColor: '#f39c12',
    },
    transferenciaIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(243, 156, 18, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    transferenciaInfo: {
        flex: 1,
    },
    transferenciaOrigen: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    transferenciaItems: {
        color: '#888',
        fontSize: 14,
        marginTop: 2,
    },
    transferenciaFecha: {
        color: '#666',
        fontSize: 12,
        marginTop: 4,
    },
    emptyContainer: {
        flex: 1,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyStateTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
    },
    emptyStateSubtitle: {
        color: '#888',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1e1e1e',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    modalTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    modalBody: {
        padding: 16,
    },
    modalSubtitle: {
        color: '#f39c12',
        fontSize: 16,
        fontWeight: '600',
    },
    modalDate: {
        color: '#666',
        fontSize: 12,
        marginTop: 4,
    },
    modalSectionTitle: {
        color: '#888',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 20,
        marginBottom: 12,
    },
    modalItem: {
        flexDirection: 'row',
        backgroundColor: '#2a2a2a',
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
        alignItems: 'center',
    },
    modalItemInfo: {
        flex: 1,
    },
    modalItemName: {
        color: '#fff',
        fontSize: 14,
    },
    modalItemSerie: {
        color: '#3498db',
        fontSize: 12,
        marginTop: 2,
    },
    modalItemCant: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    modalActions: {
        flexDirection: 'row',
        padding: 16,
        // paddingBottom is now applied dynamically via insets.bottom
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    modalButton: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    rejectButton: {
        backgroundColor: '#e74c3c',
    },
    acceptButton: {
        backgroundColor: '#27ae60',
    },
    modalButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    // Partial reception styles
    modalItemSelected: {
        backgroundColor: '#1a3a2a',
        borderColor: '#27ae60',
        borderWidth: 1,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: '#666',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    checkboxChecked: {
        backgroundColor: '#27ae60',
        borderColor: '#27ae60',
    },
    quantityControl: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#333',
        borderRadius: 8,
        padding: 4,
    },
    quantityButton: {
        width: 28,
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#555',
        borderRadius: 4,
    },
    quantityInput: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center',
        width: 40,
        paddingHorizontal: 4,
    },
    maxQuantity: {
        color: '#888',
        fontSize: 12,
        marginLeft: 4,
    },
    partialButton: {
        backgroundColor: '#27ae60',
    },
    // Return feature styles
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 12,
    },
    returnButton: {
        flex: 1,  // Take 50% width
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#e67e22',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        gap: 8,
    },
    returnButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    commentInput: {
        backgroundColor: '#333',
        borderRadius: 8,
        padding: 12,
        color: '#fff',
        fontSize: 14,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    // NEW: Action buttons row (Devolver + Verificar)
    actionButtonsRow: {
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'center',
        width: '100%',  // Take full container width so flex children work
    },
    // NEW: Verify button
    verifyButton: {
        flex: 1,  // Take 50% width
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#3498db',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        gap: 8,
    },
    verifyButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    // NEW: Stock item serie count (for grouped view)
    stockItemSerieCount: {
        fontSize: 12,
        color: '#27ae60',
        fontWeight: '500',
        marginTop: 2,
    },
    // NEW: Series modal styles
    seriesModalCode: {
        color: '#888',
        fontSize: 13,
        marginTop: 4,
    },
    seriesModalCount: {
        color: '#3498db',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 4,
        marginBottom: 16,
    },
    seriesList: {
        maxHeight: 300,
    },
    seriesItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2a2a2a',
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
        gap: 12,
    },
    seriesItemText: {
        color: '#fff',
        fontSize: 15,
        fontFamily: 'monospace',
    },
    // NEW: Verify modal styles
    verifyInstructions: {
        color: '#aaa',
        fontSize: 14,
        marginBottom: 20,
        textAlign: 'center',
    },
    verifyInputContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    verifyTextInput: {
        flex: 1,
        backgroundColor: '#333',
        borderRadius: 8,
        padding: 14,
        color: '#fff',
        fontSize: 16,
        fontFamily: 'monospace',
    },
    verifySearchButton: {
        backgroundColor: '#3498db',
        borderRadius: 8,
        paddingHorizontal: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    verifyResultBox: {
        padding: 16,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    verifyResultFound: {
        backgroundColor: 'rgba(39, 174, 96, 0.15)',
        borderWidth: 1,
        borderColor: '#27ae60',
    },
    verifyResultNotFound: {
        backgroundColor: 'rgba(231, 76, 60, 0.15)',
        borderWidth: 1,
        borderColor: '#e74c3c',
    },
    verifyResultInfo: {
        flex: 1,
    },
    verifyResultTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    verifyResultDetail: {
        color: '#aaa',
        fontSize: 14,
    },
    // NEW: Scan button in verify modal
    verifyScanButton: {
        backgroundColor: '#f39c12',
        borderRadius: 8,
        paddingHorizontal: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // NEW: Scanner styles
    scannerContainer: {
        width: '100%',
        height: 250,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 16,
        position: 'relative',
    },
    scannerCamera: {
        width: '100%',
        height: '100%',
    },
    scannerOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scannerFrame: {
        width: 200,
        height: 100,
        borderWidth: 2,
        borderColor: '#3498db',
        borderRadius: 8,
        backgroundColor: 'transparent',
    },
    closeScannerButton: {
        position: 'absolute',
        top: 10,
        right: 10,
    },
});
