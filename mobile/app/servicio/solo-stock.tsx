import ScannerCamera from '../../components/ScannerCamera';
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Alert,
    Platform,
    Modal,
    ActivityIndicator,
    AppState,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '../../contexts/RouteContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTextSize } from '../../contexts/TextSizeContext';
import ServicioPrevioModal from '../../components/ServicioPrevioModal';
import { generateUUIDv4 } from '../../utils/uuid';

// Types
interface MaterialItem {
    id: string;
    material: string;
    nombre_material?: string;
    serie_o_cantidad: string;
    condicion: string;
    unidad_medida: string;
    foto_serie?: string;
    error?: string;
}

interface PartidaMaterials {
    tipo_cierre: string;
    material_retirado: MaterialItem[];
    material_entregado: MaterialItem[];
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

export default function SoloStockScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const { getServicesByOT, setAppliedStock, isServiceCompleted, rutaActiva } = useRoute();
    const { user } = useAuth();
    const { textScale } = useTextSize();
    const insets = useSafeAreaInsets();

    const { cita, ot } = params;
    const draftKey = `service-draft:STOCK:${user?.id || user?.usuario || 'anon'}:${String(cita || '')}:${String(ot || '')}`;
    const draftHydratedRef = useRef(false);
    const draftCompletedRef = useRef(false);

    // Step: 0 = select partidas, 1 = materials per partida
    const [currentStep, setCurrentStep] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    // Guard anti doble-tap: bloquea handleConfirm hasta terminar el save local.
    const submittingRef = useRef(false);

    // Cliente (obligatorio para registrar stock, igual que generar orden)
    const [clienteNombre, setClienteNombre] = useState('');
    const [clienteDni, setClienteDni] = useState('');

    // Modal de servicio previo (info por terminal)
    const [previoVisible, setPrevioVisible] = useState(false);
    const [previoPartida, setPrevioPartida] = useState<any>(null);

    // Partida selection
    const [partidas, setPartidas] = useState<any[]>([]);
    const [selectedPartidas, setSelectedPartidas] = useState<number[]>([]);
    const [currentPartidaIndex, setCurrentPartidaIndex] = useState(0);

    // Per-partida form data
    const [partidaFormData, setPartidaFormData] = useState<Map<number, PartidaMaterials>>(new Map());

    // Current partida form state
    const [formData, setFormData] = useState<PartidaMaterials>({
        tipo_cierre: '',
        material_retirado: [],
        material_entregado: [],
    });

    // Location
    const [location, setLocation] = useState<Location.LocationObject | null>(null);

    // Scanner
    const [permission, requestPermission] = useCameraPermissions();
    const [showScannerModal, setShowScannerModal] = useState(false);
    const [scannerTarget, setScannerTarget] = useState<{ type: 'retirado' | 'entregado'; id: string; field: 'serie' | 'material' } | null>(null);
    const cameraRef = useRef<CameraView>(null);

    // Material picker
    const [showPickerModal, setShowPickerModal] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<{ type: 'retirado' | 'entregado'; id: string } | null>(null);
    const [pickerSearch, setPickerSearch] = useState('');
    const [allMaterials, setAllMaterials] = useState<any[]>([]);
    const [closureTypes, setClosureTypes] = useState<any[]>([]);

    // Mi Stock modal
    const [showMiStockModal, setShowMiStockModal] = useState(false);
    const [miStockItems, setMiStockItems] = useState<any[]>([]);
    const [miStockSearch, setMiStockSearch] = useState('');
    const [miStockTarget, setMiStockTarget] = useState<'retirado' | 'entregado'>('entregado');

    // Material templates
    const [plantillasMaterial, setPlantillasMaterial] = useState<any[]>([]);
    const [showPlantillaModal, setShowPlantillaModal] = useState(false);

    const conditionOptions = ['BUENO', 'CONTROL', 'BLOQUEADO'];
    const getConditionColor = (cond: string) => {
        switch (cond) {
            case 'BUENO': return '#27ae60';
            case 'CONTROL': return '#f39c12';
            case 'BLOQUEADO': return '#e74c3c';
            default: return '#555';
        }
    };

    // Load partidas
    useEffect(() => {
        if (cita && ot) {
            const found = getServicesByOT(cita as string, ot as string);
            setPartidas(found);
            if (found.length === 1) {
                setSelectedPartidas([found[0].partida]);
                setCurrentStep(1);
                setCurrentPartidaIndex(0);
                const initialMap = new Map<number, PartidaMaterials>();
                initialMap.set(found[0].partida, { tipo_cierre: '', material_retirado: [], material_entregado: [] });
                setPartidaFormData(initialMap);
            }
        }
    }, [cita, ot, getServicesByOT]);

    useEffect(() => {
        let active = true;
        const restoreDraft = async () => {
            try {
                if (!cita || !ot) return;
                const db = await loadDatabaseService();
                const draft = await db?.getServiceDraft(draftKey);
                if (active && draft?.flow === 'STOCK') {
                    setSelectedPartidas(draft.selectedPartidas || []);
                    setCurrentPartidaIndex(draft.currentPartidaIndex || 0);
                    setCurrentStep(draft.currentStep || 0);
                    setPartidaFormData(new Map(draft.partidaFormData || []));
                    if (draft.formData) setFormData(draft.formData);
                    Alert.alert('Borrador recuperado', 'Se restauraron los datos que estaban en carga.');
                }
            } catch (error) {
                console.warn('Draft restore error:', error);
            } finally {
                draftHydratedRef.current = true;
            }
        };
        void restoreDraft();
        return () => { active = false; };
    }, [cita, ot, draftKey]);

    useEffect(() => {
        const loadMetadata = async () => {
            try {
                const db = await loadDatabaseService();
                if (!db) return;
                setClosureTypes(await db.getClosureTypes());
                const plantillas = await db.getPlantillasMaterial();
                console.log(`[SoloStock] ${plantillas?.length ?? 0} plantillas cargadas desde DB`);
                if (plantillas && plantillas.length > 0) {
                    setPlantillasMaterial(plantillas);
                }
            } catch (error) {
                console.error('Error loading closure types:', error);
            }
        };
        void loadMetadata();
    }, []);

    const persistDraft = async () => {
        if (!draftHydratedRef.current || draftCompletedRef.current || !cita || !ot) return;
        const db = await loadDatabaseService();
        if (!db) return;
        await db.saveServiceDraft(draftKey, {
            flow: 'STOCK', currentStep, selectedPartidas, currentPartidaIndex,
            partidaFormData: Array.from(partidaFormData.entries()), formData,
        });
    };

    const clearDraft = async () => {
        draftCompletedRef.current = true;
        const db = await loadDatabaseService();
        if (db) await db.deleteServiceDraft(draftKey);
    };

    useEffect(() => {
        if (!draftHydratedRef.current || draftCompletedRef.current) return;
        const timer = setTimeout(() => { void persistDraft().catch(e => console.warn('Draft save error:', e)); }, 500);
        return () => clearTimeout(timer);
    }, [currentStep, selectedPartidas, currentPartidaIndex, partidaFormData, formData]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', state => {
            if (state === 'inactive' || state === 'background') void persistDraft().catch(e => console.warn('Draft background save error:', e));
        });
        return () => subscription.remove();
    }, [currentStep, selectedPartidas, currentPartidaIndex, partidaFormData, formData]);

    // Get location
    useEffect(() => {
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') return;
                try {
                    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                    setLocation(loc);
                } catch {
                    const loc = await Location.getLastKnownPositionAsync();
                    if (loc) setLocation(loc);
                }
            } catch (e) {
                console.warn('Location error:', e);
            }
        })();
    }, []);

    const toggleSelectAll = () => {
        if (selectedPartidas.length === partidas.length) {
            setSelectedPartidas([]);
        } else {
            setSelectedPartidas(partidas.map(p => p.partida));
        }
    };

    const togglePartida = (partidaNum: number) => {
        setSelectedPartidas(prev =>
            prev.includes(partidaNum)
                ? prev.filter(p => p !== partidaNum)
                : [...prev, partidaNum]
        );
    };

    const handleConfirmPartidas = () => {
        if (selectedPartidas.length === 0) return;
        const newFormData = new Map<number, PartidaMaterials>();
        for (const num of selectedPartidas) {
            newFormData.set(num, { tipo_cierre: '', material_retirado: [], material_entregado: [] });
        }
        setPartidaFormData(newFormData);
        setCurrentPartidaIndex(0);
        setFormData({ tipo_cierre: '', material_retirado: [], material_entregado: [] });
        setCurrentStep(1);
    };

    const saveCurrentPartidaData = () => {
        const partidaNum = selectedPartidas[currentPartidaIndex];
        setPartidaFormData(prev => {
            const m = new Map(prev);
            m.set(partidaNum, {
                tipo_cierre: formData.tipo_cierre,
                material_retirado: formData.material_retirado.filter(i => i.material && i.serie_o_cantidad),
                material_entregado: formData.material_entregado.filter(i => i.material && i.serie_o_cantidad),
            });
            return m;
        });
    };

    const loadPartidaData = (index: number) => {
        const num = selectedPartidas[index];
        const saved = partidaFormData.get(num);
        setFormData(saved || { tipo_cierre: '', material_retirado: [], material_entregado: [] });
    };

    // Material state helpers
    const addMaterialItem = (type: 'retirado' | 'entregado') => {
        const items = type === 'retirado' ? formData.material_retirado : formData.material_entregado;
        const incomplete = items.filter(i => (i.material && !i.serie_o_cantidad) || (!i.material && i.serie_o_cantidad));
        if (incomplete.length > 0) {
            Alert.alert('Material Incompleto', 'Complete el material anterior antes de agregar uno nuevo.');
            return;
        }
        const newItem: MaterialItem = { id: Date.now().toString(), material: '', serie_o_cantidad: '', condicion: 'BUENO', unidad_medida: '' };
        if (type === 'retirado') {
            setFormData(prev => ({ ...prev, material_retirado: [newItem, ...prev.material_retirado] }));
        } else {
            setFormData(prev => ({ ...prev, material_entregado: [newItem, ...prev.material_entregado] }));
        }
    };

    const removeMaterialItem = (type: 'retirado' | 'entregado', id: string) => {
        if (type === 'retirado') {
            setFormData(prev => ({ ...prev, material_retirado: prev.material_retirado.filter(m => m.id !== id) }));
        } else {
            setFormData(prev => ({ ...prev, material_entregado: prev.material_entregado.filter(m => m.id !== id) }));
        }
    };

    const updateMaterialItem = (type: 'retirado' | 'entregado', id: string, field: keyof MaterialItem, value: string) => {
        const fn = (items: MaterialItem[]) => items.map(i => i.id === id ? { ...i, [field]: value } : i);
        if (type === 'retirado') {
            setFormData(prev => ({ ...prev, material_retirado: fn(prev.material_retirado) }));
        } else {
            setFormData(prev => ({ ...prev, material_entregado: fn(prev.material_entregado) }));
        }
    };

    const updateMaterialPhoto = (type: 'retirado' | 'entregado', id: string, photoPath: string) => {
        const fn = (items: MaterialItem[]) => items.map(i => i.id === id ? { ...i, foto_serie: photoPath } : i);
        if (type === 'retirado') {
            setFormData(prev => ({ ...prev, material_retirado: fn(prev.material_retirado) }));
        } else {
            setFormData(prev => ({ ...prev, material_entregado: fn(prev.material_entregado) }));
        }
    };

    // Scanner
    const openScanner = async (type: 'retirado' | 'entregado', itemId: string, field: 'serie' | 'material' = 'serie') => {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara para escanear.');
                return;
            }
        }
        setScannerTarget({ type, id: itemId, field });
        setShowScannerModal(true);
    };

    const handleBarCodeScanned = async (result: { type: string; data: string }) => {
        if (!scannerTarget) return;
        const scannedCode = result.data.trim();
        if (scannerTarget.field === 'material') {
            try {
                const db = await loadDatabaseService();
                if (!db) throw new Error('Catálogo local no disponible');
                const materials = await db.getMaterials();
                const material = materials.find((mat: { codigo_material: string }) =>
                    mat.codigo_material.trim().toLowerCase() === scannedCode.toLowerCase());
                if (material) {
                    await selectMaterial(material, scannerTarget);
                } else {
                    Alert.alert('Material no encontrado', 'El código no existe en el catálogo local. Sincronizá los datos o seleccioná el material manualmente.');
                }
            } catch {
                Alert.alert('No se pudo leer el catálogo', 'Intentá nuevamente o seleccioná el material manualmente.');
            } finally {
                closeScanner();
            }
            return;
        }
        const items = scannerTarget.type === 'retirado' ? formData.material_retirado : formData.material_entregado;
        const currentItem = items.find(i => i.id === scannerTarget.id);

        if (currentItem?.material) {
            if (currentItem.unidad_medida === 'SERIALIZADO') {
                updateMaterialItem(scannerTarget.type, scannerTarget.id, 'serie_o_cantidad', scannedCode);
            } else {
                Alert.alert('Material por Unidad', 'Este material se mide por cantidad, no por número de serie.', [{ text: 'Entendido' }]);
                setShowScannerModal(false);
                setScannerTarget(null);
                return;
            }
            await captureSerialPhoto();
            return;
        }

        try {
            const db = await loadDatabaseService();
            if (db) {
                const stockItems = await db.getStockLocal();
                const stockItem = stockItems.find((s: any) => s.serie === scannedCode || s.serie?.toLowerCase() === scannedCode.toLowerCase());
                if (stockItem) {
                    const materials = await db.getMaterials();
                    const matInfo = materials.find((m: any) => m.codigo_material === stockItem.codigo_material);
                    updateMaterialItem(scannerTarget.type, scannerTarget.id, 'material', stockItem.codigo_material);
                    updateMaterialItem(scannerTarget.type, scannerTarget.id, 'nombre_material', matInfo?.nombre || stockItem.nombre_material || '');
                    updateMaterialItem(scannerTarget.type, scannerTarget.id, 'unidad_medida', stockItem.unidad_medida || 'SERIALIZADO');
                    updateMaterialItem(scannerTarget.type, scannerTarget.id, 'serie_o_cantidad', scannedCode);
                } else {
                    const materials = await db.getMaterials();
                    const foundMat = materials.find((m: any) => m.codigo_material === scannedCode || m.codigo_material?.toLowerCase() === scannedCode.toLowerCase());
                    if (foundMat) {
                        updateMaterialItem(scannerTarget.type, scannerTarget.id, 'material', foundMat.codigo_material);
                        updateMaterialItem(scannerTarget.type, scannerTarget.id, 'nombre_material', foundMat.nombre || '');
                        updateMaterialItem(scannerTarget.type, scannerTarget.id, 'unidad_medida', foundMat.unidad_medida || 'UNIDAD');
                        if (foundMat.unidad_medida !== 'SERIALIZADO') {
                            updateMaterialItem(scannerTarget.type, scannerTarget.id, 'serie_o_cantidad', '1');
                        }
                    } else {
                        updateMaterialItem(scannerTarget.type, scannerTarget.id, 'serie_o_cantidad', scannedCode);
                        updateMaterialItem(scannerTarget.type, scannerTarget.id, 'unidad_medida', 'SERIALIZADO');
                    }
                }
            }
        } catch (e) {
            console.error('Barcode lookup error:', e);
            updateMaterialItem(scannerTarget.type, scannerTarget.id, 'serie_o_cantidad', scannedCode);
            updateMaterialItem(scannerTarget.type, scannerTarget.id, 'unidad_medida', 'SERIALIZADO');
        }
        await captureSerialPhoto();
    };

    const captureSerialPhoto = async () => {
        if (!cameraRef.current || !scannerTarget) return;
        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: false });
            if (photo?.uri) {
                const cropWidth = Math.round(photo.width * 0.8);
                const cropHeight = Math.round(photo.height * 0.5);
                const cropOriginX = Math.round((photo.width - cropWidth) / 2);
                const cropOriginY = Math.round((photo.height - cropHeight) / 2);
                const cropped = await ImageManipulator.manipulateAsync(
                    photo.uri,
                    [{ crop: { originX: cropOriginX, originY: cropOriginY, width: cropWidth, height: cropHeight } }],
                    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
                );
                const fileName = `serie_${scannerTarget.id}_${Date.now()}.jpg`;
                const permanentPath = (FileSystem.documentDirectory || '') + fileName;
                await FileSystem.moveAsync({ from: cropped.uri, to: permanentPath });
                updateMaterialPhoto(scannerTarget.type, scannerTarget.id, permanentPath);
            }
        } catch (e) {
            console.error('Photo capture error:', e);
        }
        setShowScannerModal(false);
        setScannerTarget(null);
    };

    const closeScanner = () => {
        setShowScannerModal(false);
        setScannerTarget(null);
    };

    // Mensaje de error accionable para entregas serializadas: si la serie NO está
    // bajo el material seleccionado PERO sí está en el stock bajo otro código
    // (p.ej. una SIM cargada con otro operador), se le indica al técnico cuál es
    // el material correcto en lugar de un genérico "no encontrada".
    // Retorna '' cuando la serie está disponible bajo ese material y condición.
    const getSerieEntregaError = (stockItems: any[], material: string, serie: string, condicion?: string): string => {
        const serieLower = (serie || '').toLowerCase();
        if (!serieLower) return '';
        const enEsteMaterial = stockItems.find((s: any) =>
            s.codigo_material === material && s.serie?.toLowerCase() === serieLower
        );
        if (enEsteMaterial) {
            if (condicion && enEsteMaterial.condicion !== condicion) {
                return `La serie "${serie}" está en su stock en condición ${enEsteMaterial.condicion}, no en ${condicion}.`;
            }
            return '';
        }
        const enOtroMaterial = stockItems.find((s: any) => s.serie?.toLowerCase() === serieLower);
        if (enOtroMaterial) {
            return `La serie "${serie}" está en su stock como ${enOtroMaterial.codigo_material} - ${enOtroMaterial.nombre_material || enOtroMaterial.codigo_material}. Seleccione ese material para poder entregarla.`;
        }
        return `Serie "${serie}" no encontrada en su stock`;
    };

    // Lookup serial in stock on blur
    const lookupSerialInStock = async (type: 'retirado' | 'entregado', itemId: string, inputValue: string) => {
        if (!inputValue) { updateMaterialItem(type, itemId, 'error', ''); return; }
        const items = type === 'retirado' ? formData.material_retirado : formData.material_entregado;
        const item = items.find(i => i.id === itemId);
        const numericValue = parseInt(inputValue);
        const isLikelyQuantity = !isNaN(numericValue) && inputValue.length <= 4 && numericValue <= 1000;
        const isLikelySerial = !isLikelyQuantity;
        try {
            const db = await loadDatabaseService();
            if (!db) return;
            const stockItems = await db.getStockLocal();

            if (item?.material) {
                if (item.unidad_medida !== 'SERIALIZADO' && type === 'entregado') {
                    const qty = numericValue || 0;
                    const si = stockItems.find((s: any) => s.codigo_material === item.material && !s.serie);
                    updateMaterialItem(type, itemId, 'error', qty > (si?.cantidad || 0) ? `Cantidad insuficiente. Tiene ${si?.cantidad || 0} disponibles` : '');
                    return;
                }
                if (item.unidad_medida === 'SERIALIZADO' && type === 'entregado') {
                    updateMaterialItem(type, itemId, 'error', getSerieEntregaError(stockItems, item.material, inputValue));
                    return;
                }
                updateMaterialItem(type, itemId, 'error', '');
                return;
            }

            if (type === 'entregado' && isLikelySerial) {
                const si = stockItems.find((s: any) => s.serie?.toLowerCase() === inputValue.toLowerCase());
                if (si) {
                    updateMaterialItem(type, itemId, 'material', si.codigo_material);
                    updateMaterialItem(type, itemId, 'nombre_material', si.nombre_material || '');
                    updateMaterialItem(type, itemId, 'unidad_medida', si.unidad_medida || 'SERIALIZADO');
                    updateMaterialItem(type, itemId, 'error', '');
                    return;
                }
            }

            if (type === 'retirado' && isLikelySerial) {
                const already = stockItems.some((s: any) => s.serie?.toLowerCase() === inputValue.toLowerCase());
                if (already) {
                    updateMaterialItem(type, itemId, 'error', 'Esta serie ya está en su stock. No puede retirar material que ya tiene.');
                } else {
                    updateMaterialItem(type, itemId, 'unidad_medida', 'SERIALIZADO');
                    updateMaterialItem(type, itemId, 'error', '');
                }
                return;
            }

            updateMaterialItem(type, itemId, 'error', '');
        } catch (e) {
            console.error('lookupSerialInStock error:', e);
        }
    };

    // Material picker
    const openMaterialPicker = async (type: 'retirado' | 'entregado', itemId: string) => {
        setPickerTarget({ type, id: itemId });
        setPickerSearch('');
        try {
            const db = await loadDatabaseService();
            if (db) {
                const mats = await db.getMaterials();
                setAllMaterials(mats || []);
            }
        } catch (e) {
            console.error('Error loading materials:', e);
        }
        setShowPickerModal(true);
    };

    const selectMaterial = (mat: any, target = pickerTarget) => {
        if (!target) return;
        updateMaterialItem(target.type, target.id, 'material', mat.codigo_material);
        updateMaterialItem(target.type, target.id, 'nombre_material', mat.nombre || '');
        updateMaterialItem(target.type, target.id, 'unidad_medida', mat.unidad_medida || 'UNIDAD');
        setShowPickerModal(false);
        setPickerTarget(null);
    };

    // Mi Stock modal
    const openMiStockModal = async (type: 'retirado' | 'entregado') => {
        setMiStockTarget(type);
        setMiStockSearch('');
        try {
            const db = await loadDatabaseService();
            if (db) {
                const stock = await db.getStockLocal();
                setMiStockItems((stock || []).filter((s: any) => s.cantidad > 0 || s.serie));
            }
        } catch (e) {
            console.error('Error loading stock:', e);
        }
        setShowMiStockModal(true);
    };

    const selectMiStockItem = (item: any) => {
        const newId = Date.now().toString();
        const newItem: MaterialItem = {
            id: newId,
            material: item.codigo_material,
            nombre_material: item.nombre_material || '',
            serie_o_cantidad: item.serie || (item.cantidad ? String(item.cantidad) : '1'),
            condicion: item.condicion || 'BUENO',
            unidad_medida: item.unidad_medida || 'SERIALIZADO',
        };
        if (miStockTarget === 'retirado') {
            setFormData(prev => ({ ...prev, material_retirado: [newItem, ...prev.material_retirado] }));
        } else {
            setFormData(prev => ({ ...prev, material_entregado: [newItem, ...prev.material_entregado] }));
        }
        setShowMiStockModal(false);
    };

    // Validate materials
    const validateMaterials = async (): Promise<boolean> => {
        // Guard: reject empty submissions
        const hasItems = formData.material_retirado.some(i => i.material && i.serie_o_cantidad) ||
                         formData.material_entregado.some(i => i.material && i.serie_o_cantidad);
        if (!hasItems) {
            Alert.alert('Sin Materiales', 'Debe agregar al menos un material para registrar el movimiento de stock.', [{ text: 'Entendido' }]);
            return false;
        }

        const all = [
            ...formData.material_retirado.map(m => ({ ...m, tipo: 'retirado' })),
            ...formData.material_entregado.map(m => ({ ...m, tipo: 'entregado' })),
        ].filter(m => m.material || m.serie_o_cantidad);

        const missingMaterial = all.filter(m => !m.material && m.serie_o_cantidad);
        if (missingMaterial.length > 0) {
            Alert.alert('Material Requerido', 'Hay entradas sin material seleccionado. Seleccione el material o elimínelas.', [{ text: 'Entendido' }]);
            return false;
        }

        const missingData = all.filter(m => m.material && !m.serie_o_cantidad);
        if (missingData.length > 0) {
            Alert.alert('Datos Incompletos', 'Hay materiales sin serie o cantidad. Complete los datos o elimínelos.', [{ text: 'Entendido' }]);
            return false;
        }

        // Check duplicates in entregado
        const serializedEntregados = formData.material_entregado.filter(m => m.unidad_medida === 'SERIALIZADO' && m.serie_o_cantidad);
        const seen = new Set<string>();
        const dupes: string[] = [];
        for (const item of serializedEntregados) {
            const key = item.serie_o_cantidad.toLowerCase();
            if (seen.has(key)) dupes.push(item.serie_o_cantidad);
            else seen.add(key);
        }
        if (dupes.length > 0) {
            Alert.alert('Seriales Duplicados', `Seriales duplicados en Material Entregado: ${dupes.join(', ')}.`, [{ text: 'Revisar' }]);
            return false;
        }

        // Check duplicates in retirado (espejo del check de entregado): el backend
        // rechaza el segundo retiro como PENDIENTE, pero evitamos cargar una gestión
        // que quedaría incompleta.
        const serializedRetirados = formData.material_retirado.filter(m => m.unidad_medida === 'SERIALIZADO' && m.serie_o_cantidad);
        const seenRetirados = new Set<string>();
        const dupesRetirados: string[] = [];
        for (const item of serializedRetirados) {
            const key = item.serie_o_cantidad.toLowerCase();
            if (seenRetirados.has(key)) dupesRetirados.push(item.serie_o_cantidad);
            else seenRetirados.add(key);
        }
        if (dupesRetirados.length > 0) {
            Alert.alert('Seriales Duplicados', `Seriales duplicados en Material Retirado: ${dupesRetirados.join(', ')}.`, [{ text: 'Revisar' }]);
            return false;
        }

        // Un mismo serial no puede estar simultáneamente en retirado y entregado
        const enAmbos = [...seenRetirados].filter(s => seen.has(s));
        if (enAmbos.length > 0) {
            Alert.alert('Serial Duplicado', `El serial "${enAmbos.join('", "')}" está cargado en Material Retirado y Material Entregado. Retirar y entregar el mismo serial en una misma gestión no es válido.`, [{ text: 'Revisar' }]);
            return false;
        }

        // Stock check
        try {
            const db = await loadDatabaseService();
            if (db) {
                const stockItems = await db.getStockLocal();
                const notInStock: string[] = [];

                for (const item of serializedEntregados) {
                    const has = stockItems.some((s: any) =>
                        s.codigo_material === item.material &&
                        s.serie?.toLowerCase() === item.serie_o_cantidad.toLowerCase() &&
                        s.condicion === item.condicion
                    );
                    if (!has) {
                        // Hint accionable: si la serie está bajo otro material, se lo decimos.
                        const enOtro = stockItems.find((s: any) =>
                            s.serie?.toLowerCase() === item.serie_o_cantidad.toLowerCase() &&
                            s.codigo_material !== item.material
                        );
                        if (enOtro) {
                            notInStock.push(`${item.material} (${item.serie_o_cantidad}): la serie está en su stock como ${enOtro.codigo_material} - ${enOtro.nombre_material}. Seleccione ese material.`);
                        } else {
                            notInStock.push(`${item.material} (${item.serie_o_cantidad})`);
                        }
                    }
                }

                const nonSerial = formData.material_entregado.filter(m => m.unidad_medida !== 'SERIALIZADO' && m.material && m.serie_o_cantidad);
                for (const item of nonSerial) {
                    const qty = parseInt(item.serie_o_cantidad) || 0;
                    const si = stockItems.find((s: any) => s.codigo_material === item.material && !s.serie && s.condicion === item.condicion);
                    if (qty > (si?.cantidad || 0)) notInStock.push(`${item.material}: requiere ${qty}, tiene ${si?.cantidad || 0}`);
                }

                if (notInStock.length > 0) {
                    Alert.alert('Material No Disponible', `No hay stock suficiente para:\n\n${notInStock.join('\n')}`, [{ text: 'Revisar' }]);
                    return false;
                }

                // Check retirado not already in stock
                const serialRetirados = formData.material_retirado.filter(m => m.unidad_medida === 'SERIALIZADO' && m.serie_o_cantidad);
                const alreadyIn: string[] = [];
                for (const item of serialRetirados) {
                    const has = stockItems.some((s: any) =>
                        s.codigo_material === item.material &&
                        s.serie?.toLowerCase() === item.serie_o_cantidad.toLowerCase()
                    );
                    if (has) alreadyIn.push(`${item.material} (${item.serie_o_cantidad})`);
                }
                if (alreadyIn.length > 0) {
                    Alert.alert('Material Ya en Stock', `Estos ya están en su stock:\n\n${alreadyIn.join('\n')}`, [{ text: 'Entendido' }]);
                    return false;
                }
            }
        } catch (e) {
            console.warn('Stock validation error:', e);
            Alert.alert('Error', 'No se pudo verificar el stock. Intente nuevamente.', [{ text: 'Entendido' }]);
            return false;
        }

        return true;
    };

    // ==================== OUTBOX TRANSACCIONAL ====================
    // Genera UNA operación por partida con UUIDs estables (operación + movimientos).
    // Los UUIDs se generan una sola vez por sesión del formulario y se reutilizan
    // en reintentos, de modo que el backend deduplique por (tecnico, operacion_uuid)
    // y (tecnico, movimiento_uuid).
    const operacionesRef = useRef<any[] | null>(null);

    const buildOperaciones = (finalFormData: Map<number, PartidaMaterials>): any[] => {
        const timestamp = new Date().toISOString();
        const operaciones: any[] = [];

        for (const partidaNum of selectedPartidas) {
            const data = finalFormData.get(partidaNum);
            if (!data) continue;

            const movimientos: any[] = [];
            for (const item of data.material_retirado || []) {
                if (item.material && item.serie_o_cantidad) {
                    const isSerialized = item.unidad_medida === 'SERIALIZADO';
                    movimientos.push({
                        uuid: generateUUIDv4(),
                        codigo_material: item.material,
                        serie: isSerialized ? item.serie_o_cantidad : null,
                        cantidad: isSerialized ? 1 : parseInt(item.serie_o_cantidad) || 1,
                        tipo_movimiento: 'RETIRO',
                        cita: cita as string,
                        ot: ot as string,
                        partida: partidaNum,
                        foto_serie: item.foto_serie || null,
                        fecha_hora: timestamp,
                        condicion: item.condicion,
                    });
                }
            }
            for (const item of data.material_entregado || []) {
                if (item.material && item.serie_o_cantidad) {
                    const isSerialized = item.unidad_medida === 'SERIALIZADO';
                    movimientos.push({
                        uuid: generateUUIDv4(),
                        codigo_material: item.material,
                        serie: isSerialized ? item.serie_o_cantidad : null,
                        cantidad: isSerialized ? 1 : parseInt(item.serie_o_cantidad) || 1,
                        tipo_movimiento: 'ENTREGA',
                        cita: cita as string,
                        ot: ot as string,
                        partida: partidaNum,
                        foto_serie: item.foto_serie || null,
                        fecha_hora: timestamp,
                        condicion: item.condicion,
                    });
                }
            }

            const gestion = {
                terminal: '',
                tipo_cierre: data.tipo_cierre || '',
                detalle_trabajo: null,
                observaciones: null,
                material_retirado: data.material_retirado || [],
                material_entregado: data.material_entregado || [],
                cliente_nombre: clienteNombre.trim(),
                cliente_dni: clienteDni.trim(),
                firma_cliente: null,
                firma_tecnico: null,
                latitud: location?.coords.latitude ?? null,
                longitud: location?.coords.longitude ?? null,
            };

            operaciones.push({
                operacion_uuid: generateUUIDv4(),
                tipo_gestion: 'STOCK',
                cita: cita as string,
                ot: ot as string,
                partida: partidaNum,
                fecha_hora_creacion: timestamp,
                gestion,
                movimientos,
            });
        }

        return operaciones;
    };

    const handleNext = async () => {
        if (!clienteNombre.trim() || !clienteDni.trim()) {
            Alert.alert('Datos obligatorios', 'Debe cargar el Nombre y DNI del cliente antes de confirmar.');
            return;
        }
        if (!formData.tipo_cierre?.trim()) {
            Alert.alert('Tipo de cierre requerido', 'Seleccione un tipo de cierre antes de continuar.');
            return;
        }
        const isValid = await validateMaterials();
        if (!isValid) return;

        saveCurrentPartidaData();

        if (currentPartidaIndex < selectedPartidas.length - 1) {
            const nextIndex = currentPartidaIndex + 1;
            setCurrentPartidaIndex(nextIndex);
            loadPartidaData(nextIndex);
        } else {
            // Last partida - confirm and save
            await handleConfirm();
        }
    };

    const handleConfirm = async () => {
        // Guard anti doble-tap: no duplicar operaciones si el botón se toca 2 veces.
        if (submittingRef.current) {
            console.log('SoloStock: Confirmación ya en curso, ignorando doble toque');
            return;
        }
        submittingRef.current = true;
        setIsSaving(true);
        try {
            const db = await loadDatabaseService();
            if (!db) throw new Error('Database not available');

            // Build final form data with current partida included
            const finalFormData = new Map(partidaFormData);
            const currentPartidaNum = selectedPartidas[currentPartidaIndex];
            finalFormData.set(currentPartidaNum, {
                tipo_cierre: formData.tipo_cierre,
                material_retirado: formData.material_retirado.filter(i => i.material && i.serie_o_cantidad),
                material_entregado: formData.material_entregado.filter(i => i.material && i.serie_o_cantidad),
            });

            // Construir operaciones UNA sola vez (UUIDs estables en reintentos).
            if (!operacionesRef.current) {
                operacionesRef.current = buildOperaciones(finalFormData);
            }
            const operaciones = operacionesRef.current;
            if (operaciones.length === 0) {
                Alert.alert('Error', 'No hay movimientos de stock que registrar.');
                return;
            }

            const timestamp = new Date().toISOString();

            // 1) Persistir operación + gestión + movimientos (transacción SQLite única).
            for (const op of operaciones) {
                await db.crearOperacionPendiente(op);
            }

            // 1.b) Registro local de la gestión (pestaña Gestiones). La gestión
            // real la crea el backend de forma atómica dentro de /sync-operaciones.
            // Queda PENDING con origen_outbox=1: el sync de gestiones
            // (/mobile/sync/gestiones) no la sube y pasa a SYNCED sólo cuando el
            // backend confirma la operación (PROCESADA/YA_PROCESADA).
            for (const op of operaciones) {
                const gestionOp = op.gestion || {};
                await db.saveGestion({
                    tipo: 'STOCK',
                    ruta_id: rutaActiva?.id || 0,
                    cita: op.cita,
                    ot: op.ot,
                    partida: op.partida,
                    tipo_cierre: gestionOp.tipo_cierre || '',
                    material_retirado: JSON.stringify(gestionOp.material_retirado || []),
                    material_entregado: JSON.stringify(gestionOp.material_entregado || []),
                    cliente_nombre: gestionOp.cliente_nombre || '',
                    cliente_dni: gestionOp.cliente_dni || '',
                    latitude: gestionOp.latitud ?? null,
                    longitude: gestionOp.longitud ?? null,
                    timestamp: op.fecha_hora_creacion,
                }, true);
            }

            // 2) Recién después: actualizar el stock local optimista.
            for (const partidaNum of selectedPartidas) {
                const data = finalFormData.get(partidaNum);
                if (!data) continue;
                for (const item of data.material_retirado || []) {
                    if (item.material && item.serie_o_cantidad) {
                        const isSerialized = item.unidad_medida === 'SERIALIZADO';
                        await db.updateStockLocal(
                            item.material,
                            isSerialized ? item.serie_o_cantidad : null,
                            isSerialized ? 1 : parseInt(item.serie_o_cantidad) || 1,
                            'add',
                            item.condicion
                        );
                    }
                }
                for (const item of data.material_entregado || []) {
                    if (item.material && item.serie_o_cantidad) {
                        const isSerialized = item.unidad_medida === 'SERIALIZADO';
                        await db.updateStockLocal(
                            item.material,
                            isSerialized ? item.serie_o_cantidad : null,
                            isSerialized ? 1 : parseInt(item.serie_o_cantidad) || 1,
                            'remove',
                            item.condicion
                        );
                    }
                }
            }

            for (const partidaNum of selectedPartidas) {
                setAppliedStock(cita as string, ot as string, partidaNum, {
                    appliedAt: new Date(timestamp),
                    latitude: location?.coords.latitude ?? null,
                    longitude: location?.coords.longitude ?? null,
                });
            }

            await clearDraft();
            router.replace('/(tabs)/home');
        } catch (error) {
            console.error('Error saving stock gestión:', error);
            Alert.alert('Error', 'No se pudieron guardar los movimientos de stock. Intente nuevamente.', [{ text: 'Entendido' }]);
        } finally {
            setIsSaving(false);
            submittingRef.current = false;
        }
    };

    // Render material section
    const renderMaterialSection = (type: 'retirado' | 'entregado', items: MaterialItem[]) => (
        <View style={styles.materialSection}>
            <View style={styles.materialHeader}>
                <Text style={[styles.materialTitle, { fontSize: 16 * textScale }]}>
                    Material {type === 'retirado' ? 'Retirado' : 'Entregado'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    {type === 'entregado' && (
                        <TouchableOpacity style={styles.addButton} onPress={() => openMiStockModal(type)}>
                            <Ionicons name="cube" size={24} color="#3498db" />
                            <Text style={{ color: '#3498db', marginLeft: 4 }}>Mi Stock</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.addButton} onPress={() => addMaterialItem(type)}>
                        <Ionicons name="add-circle" size={28} color="#2ecc71" />
                        <Text style={{ color: '#2ecc71', marginLeft: 4 }}>Agregar</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {items.length === 0 && (
                <Text style={styles.emptyText}>Sin materiales {type === 'retirado' ? 'retirados' : 'entregados'}</Text>
            )}

            {items.map(item => (
                <View key={item.id} style={styles.materialCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                            style={[{ flex: 1 }, styles.materialPickerButton, item.error ? styles.materialPickerButtonError : null]}
                            onPress={() => openMaterialPicker(type, item.id)}
                        >
                            <Text style={item.material ? styles.materialPickerText : styles.materialPickerPlaceholder}>
                                {item.material ? `${item.material} - ${item.nombre_material || ''}` : 'Seleccionar Material...'}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color="#888" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.scanButton} accessibilityRole="button"
                            accessibilityLabel="Escanear código de material"
                            onPress={() => openScanner(type, item.id, 'material')}>
                            <Ionicons name="barcode-outline" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.materialRowInner}>
                        <Text style={styles.miniLabel}>Serie / Cantidad</Text>
                        {type === 'retirado' && !item.material ? (
                            <View style={styles.serieInputRow}>
                                <View style={[styles.input, styles.serieInput, styles.disabledInput]}>
                                    <Text style={styles.disabledInputText}>Primero seleccione el material</Text>
                                </View>
                                <View style={[styles.scanButton, styles.disabledScanButton]}>
                                    <Ionicons name="barcode-outline" size={24} color="#999" />
                                </View>
                            </View>
                        ) : (
                            <View style={styles.serieInputRow}>
                                <TextInput
                                    style={[
                                        styles.input,
                                        styles.serieInput,
                                        (type === 'retirado' && item.unidad_medida === 'SERIALIZADO' && !item.serie_o_cantidad && !item.foto_serie)
                                            ? styles.disabledInput : null,
                                    ]}
                                    value={item.serie_o_cantidad}
                                    onChangeText={v => updateMaterialItem(type, item.id, 'serie_o_cantidad', v)}
                                    onBlur={() => lookupSerialInStock(type, item.id, item.serie_o_cantidad)}
                                    placeholder={item.unidad_medida === 'SERIALIZADO'
                                        ? (type === 'retirado' ? 'Escanear serie' : 'Ingrese serie')
                                        : 'Ingrese cantidad'
                                    }
                                    placeholderTextColor="#666"
                                    editable={
                                        type === 'entregado' ||
                                        item.unidad_medida !== 'SERIALIZADO' ||
                                        !!item.serie_o_cantidad ||
                                        !!item.foto_serie
                                    }
                                />
                                <TouchableOpacity
                                    style={[
                                        styles.scanButton,
                                        (type === 'retirado' && item.unidad_medida !== 'SERIALIZADO') ? styles.disabledScanButton : null,
                                    ]}
                                    onPress={() => {
                                        if (type === 'entregado' || item.unidad_medida === 'SERIALIZADO') {
                                            openScanner(type, item.id);
                                        }
                                    }}
                                    disabled={type === 'retirado' && item.unidad_medida !== 'SERIALIZADO'}
                                >
                                    <Ionicons
                                        name="barcode-outline"
                                        size={24}
                                        color={(type === 'entregado' || item.unidad_medida === 'SERIALIZADO') ? '#fff' : '#999'}
                                    />
                                </TouchableOpacity>
                                {item.foto_serie && (
                                    <View style={styles.photoIndicator}>
                                        <Ionicons name="checkmark-circle" size={20} color="#27ae60" />
                                    </View>
                                )}
                            </View>
                        )}
                    </View>

                    <View style={styles.materialRowInner}>
                        <Text style={[styles.miniLabel, { fontSize: 12 * textScale }]}>Condición</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {conditionOptions.map(cond => {
                                if (type === 'entregado' && cond !== 'BUENO') return null;
                                return (
                                    <TouchableOpacity
                                        key={cond}
                                        style={[
                                            styles.estadoChip,
                                            item.condicion === cond && {
                                                backgroundColor: getConditionColor(cond),
                                                borderColor: getConditionColor(cond),
                                            },
                                        ]}
                                        onPress={() => {
                                            if (type !== 'entregado') {
                                                updateMaterialItem(type, item.id, 'condicion', cond);
                                            }
                                        }}
                                    >
                                        <Text style={[styles.estadoChipText, item.condicion === cond && styles.estadoChipTextSelected]}>
                                            {cond}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {item.error ? (
                        <View style={styles.materialErrorContainer}>
                            <Ionicons name="alert-circle" size={18} color="#e74c3c" />
                            <Text style={styles.materialErrorText}>{item.error}</Text>
                        </View>
                    ) : null}

                    <TouchableOpacity style={styles.deleteMaterialButton} onPress={() => removeMaterialItem(type, item.id)}>
                        <Ionicons name="trash-outline" size={18} color="#e74c3c" />
                        <Text style={{ color: '#e74c3c', marginLeft: 4, fontSize: 13 }}>Eliminar</Text>
                    </TouchableOpacity>
                </View>
            ))}
        </View>
    );

    // ---- RENDER STEP 0 ----
    const renderStep0 = () => (
        <ScrollView style={styles.stepContent}>
            <Text style={[styles.stepTitle, { fontSize: 20 * textScale }]}>Seleccionar Partidas</Text>
            <Text style={[styles.stepSubtitle, { fontSize: 14 * textScale }]}>
                Seleccione las partidas para aplicar movimientos de stock
            </Text>

            <View style={styles.selectAllRow}>
                <TouchableOpacity style={styles.selectAllButton} onPress={toggleSelectAll}>
                    <Ionicons
                        name={selectedPartidas.length === partidas.length ? 'checkbox' : 'square-outline'}
                        size={24}
                        color="#3498db"
                    />
                    <Text style={styles.selectAllText}>Seleccionar todo</Text>
                </TouchableOpacity>
            </View>

            {partidas.map(p => {
                const completed = isServiceCompleted(p.cita, p.ot, p.partida);
                const isSelected = selectedPartidas.includes(p.partida);
                return (
                    <TouchableOpacity
                        key={p.partida}
                        style={[
                            styles.partidaItem,
                            isSelected && styles.partidaItemSelected,
                            completed && !isSelected && { borderColor: '#27ae60', borderWidth: 1 },
                        ]}
                        onPress={() => togglePartida(p.partida)}
                    >
                        <Ionicons
                            name={isSelected ? 'checkbox' : 'square-outline'}
                            size={24}
                            color={isSelected ? '#3498db' : (completed ? '#27ae60' : '#fff')}
                        />
                        <View style={styles.partidaItemInfo}>
                            <Text style={[styles.partidaItemTitle, completed && !isSelected && { color: '#27ae60' }, { fontSize: 16 * textScale }]}>
                                Partida N° {p.partida}
                            </Text>
                            <Text style={[styles.partidaItemSubtitle, { fontSize: 13 * textScale }]}>
                                Terminal: {p.terminal || 'N/A'} | {p.tipo_incidente || 'Sin tipo'}
                            </Text>
                            {completed && (
                                <Text style={styles.partidaItemBadge}>✓ Ya gestionada (puede re-gestionar)</Text>
                            )}
                        </View>
                        <TouchableOpacity
                            onPress={() => { setPrevioPartida(p); setPrevioVisible(true); }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="information-circle-outline" size={24} color="#3498db" />
                        </TouchableOpacity>
                    </TouchableOpacity>
                );
            })}

            <TouchableOpacity
                style={[styles.continueButton, selectedPartidas.length === 0 && styles.continueButtonDisabled]}
                onPress={handleConfirmPartidas}
                disabled={selectedPartidas.length === 0}
            >
                <Text style={styles.continueButtonText}>
                    CONTINUAR ({selectedPartidas.length} seleccionada{selectedPartidas.length !== 1 ? 's' : ''})
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ height: insets.bottom + 16 }} />
        </ScrollView>
    );

    // ---- RENDER STEP 1 (materials per partida) ----
    const renderMaterialsStep = () => {
        const currentPartida = selectedPartidas[currentPartidaIndex];
        const isLastPartida = currentPartidaIndex === selectedPartidas.length - 1;

        return (
            <ScrollView style={styles.stepContent} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
                <View style={styles.partidaIndicator}>
                    <Ionicons name="cube-outline" size={20} color="#2980b9" />
                    <Text style={styles.partidaIndicatorText}>
                        Partida N° {currentPartida}
                        {selectedPartidas.length > 1 ? ` (${currentPartidaIndex + 1}/${selectedPartidas.length})` : ''}
                    </Text>
                </View>

                <Text style={[styles.stepTitle, { fontSize: 18 * textScale }]}>Materiales</Text>
                <Text style={[styles.stepSubtitle, { fontSize: 14 * textScale }]}>
                    Registre los materiales retirados y entregados
                </Text>

                {/* Datos del cliente (obligatorios, igual que generar orden) */}
                <View style={styles.materialSection}>
                    <Text style={[styles.materialTitle, { fontSize: 16 * textScale }]}>Datos del Cliente *</Text>
                    <View style={styles.clienteRow}>
                        <TextInput
                            style={[styles.input, styles.clienteInput]}
                            value={clienteNombre}
                            onChangeText={setClienteNombre}
                            placeholder="Nombre del cliente"
                            placeholderTextColor="#666"
                        />
                        <TextInput
                            style={[styles.input, styles.clienteInput]}
                            value={clienteDni}
                            onChangeText={setClienteDni}
                            placeholder="DNI"
                            placeholderTextColor="#666"
                            keyboardType="numeric"
                        />
                    </View>
                </View>

                <View style={styles.materialSection}>
                    <Text style={[styles.materialTitle, { fontSize: 16 * textScale }]}>Tipo de Cierre *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                        {closureTypes.map(ct => (
                            <TouchableOpacity
                                key={ct.id}
                                style={[
                                    styles.estadoChip,
                                    formData.tipo_cierre === ct.subestado && { backgroundColor: '#3498db', borderColor: '#3498db' },
                                ]}
                                onPress={() => setFormData(prev => ({ ...prev, tipo_cierre: ct.subestado }))}
                            >
                                <Text style={[styles.estadoChipText, formData.tipo_cierre === ct.subestado && styles.estadoChipTextSelected]}>
                                    {ct.subestado}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {closureTypes.length === 0 && (
                        <Text style={styles.emptyText}>Sin tipos de cierre disponibles. Sincronice la aplicación e intente nuevamente.</Text>
                    )}
                </View>

                {/* Plantilla selector */}
                {(() => {
                    const currentPartidaInfo = partidas.find(p => p.partida === currentPartida)
                        || partidas.find(p => String(p.partida) === String(currentPartida));
                    const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
                    const matching = plantillasMaterial.filter(p => {
                        if (p.tipo_incidente && norm(p.tipo_incidente) !== norm(currentPartidaInfo?.tipo_incidente)) return false;
                        if (p.tipo_cierre && norm(p.tipo_cierre) !== norm(formData.tipo_cierre)) return false;
                        if (p.producto && norm(p.producto) !== norm(currentPartidaInfo?.producto)) return false;
                        return true;
                    });
                    if (matching.length === 0) return null;
                    return (
                        <View style={{ marginBottom: 12 }}>
                            <TouchableOpacity
                                style={styles.plantillaButton}
                                onPress={() => setShowPlantillaModal(true)}
                            >
                                <Ionicons name="layers-outline" size={18} color="#fff" />
                                <Text style={styles.plantillaButtonText}>Aplicar Plantilla ({matching.length})</Text>
                            </TouchableOpacity>
                            <Modal
                                visible={showPlantillaModal}
                                transparent
                                animationType="fade"
                                onRequestClose={() => setShowPlantillaModal(false)}
                            >
                                <View style={styles.plantillaOverlay}>
                                    <View style={styles.plantillaContainer}>
                                        <View style={styles.plantillaHeader}>
                                            <Text style={styles.plantillaTitle}>Seleccionar Plantilla</Text>
                                            <TouchableOpacity onPress={() => setShowPlantillaModal(false)}>
                                                <Ionicons name="close" size={24} color="#333" />
                                            </TouchableOpacity>
                                        </View>
                                        <ScrollView>
                                            {matching.map((plantilla: any) => {
                                                const retiroCount = plantilla.items?.filter((it: any) => it.tipo === 'RETIRO').length || 0;
                                                const entregaCount = plantilla.items?.filter((it: any) => it.tipo === 'ENTREGA').length || 0;
                                                return (
                                                    <TouchableOpacity
                                                        key={plantilla.id}
                                                        style={styles.plantillaItem}
                                                        onPress={() => {
                                                            const retirados: MaterialItem[] = (plantilla.items || [])
                                                                .filter((it: any) => it.tipo === 'RETIRO')
                                                                .map((it: any) => ({
                                                                    id: `plantilla-ret-${it.id}-${Date.now()}`,
                                                                    material: it.codigo_material || '',
                                                                    nombre_material: it.nombre_material || it.codigo_material || '',
                                                                    serie_o_cantidad: it.unidad_medida === 'SERIALIZADO' ? '' : (it.cantidad ? String(it.cantidad) : '1'),
                                                                    condicion: 'BUENO',
                                                                    unidad_medida: it.unidad_medida || 'UNIDAD',
                                                                }));
                                                            const entregados: MaterialItem[] = (plantilla.items || [])
                                                                .filter((it: any) => it.tipo === 'ENTREGA')
                                                                .map((it: any) => ({
                                                                    id: `plantilla-ent-${it.id}-${Date.now()}`,
                                                                    material: it.codigo_material || '',
                                                                    nombre_material: it.nombre_material || it.codigo_material || '',
                                                                    serie_o_cantidad: it.unidad_medida === 'SERIALIZADO' ? '' : (it.cantidad ? String(it.cantidad) : '1'),
                                                                    condicion: 'BUENO',
                                                                    unidad_medida: it.unidad_medida || 'UNIDAD',
                                                                }));
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                material_retirado: retirados,
                                                                material_entregado: entregados,
                                                            }));
                                                            setShowPlantillaModal(false);
                                                        }}
                                                    >
                                                        <Text style={styles.plantillaItemName}>{plantilla.nombre}</Text>
                                                        <Text style={styles.plantillaItemMeta}>
                                                            {retiroCount > 0 ? `↑ ${retiroCount} retiro${retiroCount > 1 ? 's' : ''}` : ''}
                                                            {retiroCount > 0 && entregaCount > 0 ? '  ' : ''}
                                                            {entregaCount > 0 ? `↓ ${entregaCount} entrega${entregaCount > 1 ? 's' : ''}` : ''}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </ScrollView>
                                    </View>
                                </View>
                            </Modal>
                        </View>
                    );
                })()}

                {renderMaterialSection('retirado', formData.material_retirado)}
                {renderMaterialSection('entregado', formData.material_entregado)}

                <View style={styles.navButtons}>
                    {currentPartidaIndex > 0 ? (
                        <TouchableOpacity
                            style={styles.navButtonSecondary}
                            onPress={() => {
                                saveCurrentPartidaData();
                                const prevIndex = currentPartidaIndex - 1;
                                setCurrentPartidaIndex(prevIndex);
                                loadPartidaData(prevIndex);
                            }}
                        >
                            <Ionicons name="arrow-back" size={20} color="#fff" />
                            <Text style={styles.navButtonText}>Anterior</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.navButtonSecondary}
                            onPress={() => setCurrentStep(0)}
                        >
                            <Ionicons name="arrow-back" size={20} color="#fff" />
                            <Text style={styles.navButtonText}>Volver</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={[styles.navButtonPrimary, styles.stockConfirmButton]}
                        onPress={handleNext}
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Ionicons name={isLastPartida ? 'checkmark-circle' : 'arrow-forward'} size={20} color="#fff" />
                                <Text style={styles.navButtonText}>
                                    {isLastPartida ? 'CONFIRMAR' : 'Siguiente Partida'}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        );
    };

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: 'Aplicar Stock',
                    headerStyle: { backgroundColor: '#121212' },
                    headerTintColor: '#fff',
                }}
            />

            {currentStep === 0 ? renderStep0() : renderMaterialsStep()}

            {/* Servicio previo (misma terminal) */}
            <ServicioPrevioModal
                visible={previoVisible}
                onClose={() => setPrevioVisible(false)}
                serviciosPrevios={previoPartida?.servicios_previos || []}
                terminal={previoPartida?.terminal}
                contextLabel={previoPartida ? `Partida N° ${previoPartida.partida} · OT ${previoPartida.ot}` : undefined}
            />

            {/* Material Picker Modal */}
            <Modal visible={showPickerModal} animationType="slide" transparent onRequestClose={() => setShowPickerModal(false)}>
                <View style={styles.pickerModalOverlay}>
                    <View style={[styles.pickerModalContent, { paddingBottom: insets.bottom }]}>
                        <View style={styles.pickerModalHeader}>
                            <Text style={styles.pickerModalTitle}>Seleccionar Material</Text>
                            <TouchableOpacity onPress={() => setShowPickerModal(false)}>
                                <Ionicons name="close" size={24} color="#333" />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={styles.pickerSearchInput}
                            value={pickerSearch}
                            onChangeText={setPickerSearch}
                            placeholder="Buscar material..."
                            placeholderTextColor="#999"
                        />
                        <ScrollView style={styles.pickerModalList} contentContainerStyle={{ flexGrow: 1 }}>
                            {allMaterials
                                .filter(m =>
                                    !pickerSearch ||
                                    m.nombre?.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                                    m.codigo_material?.toLowerCase().includes(pickerSearch.toLowerCase())
                                )
                                .map((mat: any) => (
                                    <TouchableOpacity key={mat.codigo_material} style={styles.pickerModalItem} onPress={() => selectMaterial(mat)}>
                                        <Text style={styles.pickerModalItemText}>{mat.nombre}</Text>
                                        <Text style={styles.pickerModalItemSubtext}>
                                            {mat.codigo_material} • {mat.unidad_medida === 'SERIALIZADO' ? 'Serial' : 'Unidad'}
                                        </Text>
                                    </TouchableOpacity>
                                ))
                            }
                            {allMaterials.length === 0 && (
                                <Text style={styles.pickerNoData}>No se encontraron materiales.</Text>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Mi Stock Modal */}
            <Modal visible={showMiStockModal} animationType="slide" transparent onRequestClose={() => setShowMiStockModal(false)}>
                <View style={styles.pickerModalOverlay}>
                    <View style={[styles.pickerModalContent, { paddingBottom: insets.bottom }]}>
                        <View style={styles.pickerModalHeader}>
                            <Text style={styles.pickerModalTitle}>Seleccionar de Mi Stock</Text>
                            <TouchableOpacity onPress={() => setShowMiStockModal(false)}>
                                <Ionicons name="close" size={24} color="#333" />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={styles.pickerSearchInput}
                            value={miStockSearch}
                            onChangeText={setMiStockSearch}
                            placeholder="Buscar en mi stock..."
                            placeholderTextColor="#999"
                        />
                        <ScrollView style={styles.pickerModalList} contentContainerStyle={{ flexGrow: 1 }}>
                            {miStockItems
                                .filter(m =>
                                    m.nombre_material?.toLowerCase().includes(miStockSearch.toLowerCase()) ||
                                    m.codigo_material?.toLowerCase().includes(miStockSearch.toLowerCase()) ||
                                    (m.serie && m.serie.toLowerCase().includes(miStockSearch.toLowerCase()))
                                )
                                .map((item: any, idx: number) => (
                                    <TouchableOpacity
                                        key={`${item.codigo_material}-${item.serie || idx}`}
                                        style={styles.pickerModalItem}
                                        onPress={() => selectMiStockItem(item)}
                                    >
                                        <Text style={styles.pickerModalItemText}>{item.nombre_material}</Text>
                                        <Text style={[styles.pickerModalItemSubtext, { fontSize: 14, fontWeight: '600' }]}>
                                            {item.serie ? `Serie: ${item.serie}` : `Cantidad: ${item.cantidad}`}
                                        </Text>
                                        <Text style={styles.pickerModalItemSubtext}>
                                            {item.codigo_material} • <Text style={{ color: getConditionColor(item.condicion || 'BUENO') }}>{item.condicion || 'BUENO'}</Text>
                                        </Text>
                                    </TouchableOpacity>
                                ))
                            }
                            {miStockItems.length === 0 && (
                                <Text style={styles.pickerNoData}>No hay items en su stock.</Text>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Barcode Scanner Modal */}
            <Modal visible={showScannerModal} animationType="slide" onRequestClose={closeScanner}>
                <View style={styles.scannerContainer}>
                    <View style={styles.scannerHeader}>
                        <Text style={styles.scannerTitle}>{scannerTarget?.field === 'material' ? 'Escanear Código de Material' : 'Escanear Código de Barras'}</Text>
                        <TouchableOpacity onPress={closeScanner}>
                            <Ionicons name="close" size={28} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {showScannerModal && permission?.granted ? (
                        <View style={styles.scannerCameraContainer}>
                            <ScannerCamera
                                ref={cameraRef}
                                style={styles.scanner}
                                facing="back"
                                barcodeScannerSettings={{
                                    barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'code93', 'upc_a', 'upc_e', 'qr'],
                                }}
                                onBarcodeScanned={handleBarCodeScanned}
                            >
                                <View pointerEvents="none" style={styles.scanOverlay}>
                                    <View style={styles.scanOverlayTop} />
                                    <View style={styles.scanOverlayMiddle}>
                                        <View style={styles.scanOverlaySide} />
                                        <View style={styles.scanFrame}>
                                            <View style={[styles.cornerMarker, styles.cornerTopLeft]} />
                                            <View style={[styles.cornerMarker, styles.cornerTopRight]} />
                                            <View style={[styles.cornerMarker, styles.cornerBottomLeft]} />
                                            <View style={[styles.cornerMarker, styles.cornerBottomRight]} />
                                            <View style={styles.scanLine} />
                                        </View>
                                        <View style={styles.scanOverlaySide} />
                                    </View>
                                    <View style={styles.scanOverlayBottom}>
                                        <Text style={styles.scanOverlayText}>Alinee el código dentro del recuadro</Text>
                                    </View>
                                </View>
                            </ScannerCamera>
                        </View>
                    ) : (
                        <View style={styles.scannerPermission}>
                            <Ionicons name="camera-outline" size={64} color="#666" />
                            <Text style={styles.scannerPermissionText}>Se requiere permiso de cámara</Text>
                            <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                                <Text style={styles.permissionButtonText}>Otorgar Permiso</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={[styles.scannerFooter, { paddingBottom: Math.max(20, insets.bottom + 20) }]}>
                        <Text style={styles.scannerHint}>Apunte al código de barras</Text>
                        {scannerTarget?.field !== 'material' && <TouchableOpacity style={styles.manualCaptureButton} onPress={captureSerialPhoto}>
                            <Ionicons name="camera" size={24} color="#fff" />
                            <Text style={styles.manualCaptureText}>Capturar Foto (sin escaneo)</Text>
                        </TouchableOpacity>}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    stepContent: { padding: 16, flex: 1 },
    stepTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
    stepSubtitle: { fontSize: 14, color: '#888', marginBottom: 20 },
    selectAllRow: { marginBottom: 16 },
    selectAllButton: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#1e1e1e', borderRadius: 8 },
    selectAllText: { color: '#3498db', fontSize: 16, marginLeft: 12 },
    partidaItem: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 10, backgroundColor: '#1e1e1e', borderRadius: 10, borderWidth: 1, borderColor: '#333' },
    partidaItemSelected: { borderColor: '#3498db', backgroundColor: '#1a2a3a' },
    partidaItemInfo: { marginLeft: 12, flex: 1 },
    partidaItemTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    partidaItemSubtitle: { color: '#888', fontSize: 12, marginTop: 4 },
    partidaItemBadge: { color: '#f39c12', fontSize: 11, marginTop: 4, fontWeight: 'bold' },
    continueButton: { backgroundColor: '#3498db', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 10, marginTop: 20 },
    continueButtonDisabled: { backgroundColor: '#666' },
    continueButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginRight: 8 },
    partidaIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a2535', padding: 12, borderRadius: 8, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#2980b9' },
    partidaIndicatorText: { color: '#3498db', fontWeight: 'bold', marginLeft: 8 },
    materialSection: { marginBottom: 24, backgroundColor: '#1e1e1e', padding: 12, borderRadius: 12 },
    materialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    clienteRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    clienteInput: { flex: 1 },
    materialTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    addButton: { padding: 4, flexDirection: 'row', alignItems: 'center' },
    emptyText: { color: '#666', fontStyle: 'italic', textAlign: 'center', padding: 16 },
    materialCard: { backgroundColor: '#252525', borderRadius: 12, padding: 12, marginBottom: 12 },
    materialPickerButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#333', padding: 12, borderRadius: 8, marginBottom: 8 },
    materialPickerButtonError: { borderWidth: 2, borderColor: '#e74c3c' },
    materialPickerText: { color: '#fff', fontSize: 16, flex: 1 },
    materialPickerPlaceholder: { color: '#888', fontSize: 16, flex: 1 },
    materialRowInner: { marginBottom: 8 },
    miniLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
    input: { backgroundColor: '#1e1e1e', borderRadius: 8, padding: 12, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#333' },
    serieInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    serieInput: { flex: 1 },
    scanButton: { backgroundColor: '#3498db', padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    disabledInput: { backgroundColor: '#2a2a2a', justifyContent: 'center' },
    disabledInputText: { color: '#666', fontSize: 14, fontStyle: 'italic' },
    disabledScanButton: { backgroundColor: '#444' },
    photoIndicator: { marginLeft: 4 },
    estadoChip: { backgroundColor: '#333', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, borderWidth: 1, borderColor: '#555' },
    estadoChipText: { color: '#aaa', fontSize: 14 },
    estadoChipTextSelected: { color: '#fff', fontWeight: 'bold' },
    materialErrorContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(231,76,60,0.15)', padding: 10, borderRadius: 8, marginTop: 8, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
    materialErrorText: { color: '#e74c3c', fontSize: 13, flex: 1, marginLeft: 8 },
    deleteMaterialButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, padding: 8 },
    navButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
    navButtonPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#3498db', padding: 16, borderRadius: 12, gap: 8 },
    navButtonSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#333', padding: 16, borderRadius: 12, gap: 8 },
    navButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    stockConfirmButton: { backgroundColor: '#2980b9' },
    // Plantilla de materiales
    plantillaButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#8e44ad', padding: 12, borderRadius: 10, marginBottom: 4 },
    plantillaButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    plantillaOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    plantillaContainer: { backgroundColor: '#1e1e2e', borderRadius: 12, width: '100%', maxHeight: '70%', overflow: 'hidden' },
    plantillaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#333' },
    plantillaTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
    plantillaItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#2a2a3a' },
    plantillaItemName: { color: '#fff', fontSize: 15, fontWeight: '600' },
    plantillaItemMeta: { color: '#888', fontSize: 12, marginTop: 4 },
    pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    pickerModalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '70%' },
    pickerModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
    pickerModalTitle: { fontSize: 18, fontWeight: 'bold' },
    pickerSearchInput: { margin: 12, padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, fontSize: 15 },
    pickerModalList: { flex: 1, padding: 8 },
    pickerNoData: { padding: 20, textAlign: 'center', color: '#888' },
    pickerModalItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
    pickerModalItemText: { fontSize: 16, fontWeight: '600', color: '#333' },
    pickerModalItemSubtext: { fontSize: 12, color: '#888', marginTop: 2 },
    scannerContainer: { flex: 1, backgroundColor: '#000' },
    scannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 50, backgroundColor: 'rgba(0,0,0,0.7)' },
    scannerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    scannerCameraContainer: { flex: 1, position: 'relative' },
    scanner: { flex: 1 },
    scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    scanOverlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    scanOverlayMiddle: { flexDirection: 'row', height: 200 },
    scanOverlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    scanFrame: { width: 280, height: 200, position: 'relative', justifyContent: 'center', alignItems: 'center' },
    scanOverlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', paddingTop: 20 },
    scanOverlayText: { color: '#fff', fontSize: 14, textAlign: 'center' },
    cornerMarker: { position: 'absolute', width: 30, height: 30, borderColor: '#27ae60', borderWidth: 4 },
    cornerTopLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    cornerTopRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
    cornerBottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
    cornerBottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
    scanLine: { width: '90%', height: 3, backgroundColor: '#e74c3c', borderRadius: 2 },
    scannerPermission: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' },
    scannerPermissionText: { color: '#888', fontSize: 16, marginTop: 16, marginBottom: 24 },
    permissionButton: { backgroundColor: '#3498db', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
    permissionButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    scannerFooter: { padding: 20, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center' },
    scannerHint: { color: '#ccc', fontSize: 14, marginBottom: 16 },
    manualCaptureButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#e67e22', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
    manualCaptureText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
