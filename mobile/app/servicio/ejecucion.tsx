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
    Image,
    KeyboardAvoidingView,
    AppState,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '../../contexts/RouteContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTextSize } from '../../contexts/TextSizeContext';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import * as MailComposer from 'expo-mail-composer';
import Mustache from 'mustache';
import { captureRef } from 'react-native-view-shot';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { PAYWAY_LOGO_BASE64, DISCAR_LOGO_BASE64 } from '../../constants/logo';
import { generateUUIDv4 } from '../../utils/uuid';

// Types
interface MaterialItem {
    id: string;
    material: string;  // codigo_material
    nombre_material?: string;  // nombre del material
    serie_o_cantidad: string;
    condicion: string;  // Physical condition: BUENO, CONTROL, BLOQUEADO
    unidad_medida: string;  // Type: SERIALIZADO or UNIDAD
    foto_serie?: string;  // Path to photo of serial number
    error?: string;  // Validation error message
}

interface FormData {
    // Step 1: Service Data
    terminal: string;
    cliente: string;
    cuit: string;
    domicilio: string;
    telefono: string;
    ot: string;
    tipo_servicio: string;
    // Step 2: Technical Report
    detalle_trabajo: string;
    tipo_cierre: string;
    observaciones: string;
    // Step 3: Materials
    material_retirado: MaterialItem[];
    material_entregado: MaterialItem[];
    // Step 4: Signatures
    cliente_nombre: string;
    cliente_dni: string;
    cliente_firma: string;
    tecnico_nombre: string;
    tecnico_dni: string;
    tecnico_firma: string;
}

// Lazy load database
let databaseService: any = null;
const loadDatabaseService = async () => {
    if (Platform.OS !== 'web' && !databaseService) {
        const { createDatabaseService } = await import('../../db/database');
        databaseService = createDatabaseService();
        // Initialize database to create tables
        await databaseService.init();
    }
    return databaseService;
};

export default function EjecucionScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const { getServicesByOT, setGeneratedOrder, isServiceCompleted, rutaActiva } = useRoute();
    const { user } = useAuth();
    const { textScale } = useTextSize();
    const insets = useSafeAreaInsets();

    const { cita, ot } = params;
    const draftKey = `service-draft:ORDEN:${user?.id || user?.usuario || 'anon'}:${String(cita || '')}:${String(ot || '')}`;
    const draftHydratedRef = useRef(false);
    const draftCompletedRef = useRef(false);

    // Step management: 0=select partidas, 1=client data, 2=informe técnico (loop per partida), 3=materials (loop per partida), 4=signatures
    const [currentStep, setCurrentStep] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    // Multi-partida state
    const [partidas, setPartidas] = useState<any[]>([]);
    const [selectedPartidas, setSelectedPartidas] = useState<number[]>([]);
    const [currentPartidaIndex, setCurrentPartidaIndex] = useState(0);

    // Per-partida form data (indexed by partida number)
    const [partidaFormData, setPartidaFormData] = useState<Map<number, any>>(new Map());

    // Accumulated file paths for email attachment
    const [generatedOrderPaths, setGeneratedOrderPaths] = useState<string[]>([]);

    // CARGAR ORDEN state (manual order upload with photo)
    const [orderMode, setOrderMode] = useState<'generate' | 'upload' | null>(null);
    const [uploadedOrderPhotos, setUploadedOrderPhotos] = useState<Map<number, string>>(new Map());
    const [showOrderPhotoModal, setShowOrderPhotoModal] = useState(false);
    const [capturingPhotoForPartida, setCapturingPhotoForPartida] = useState<number | null>(null);
    const [isUploadingOrder, setIsUploadingOrder] = useState(false);

    // Shared client info (from first partida)
    const [clientInfo, setClientInfo] = useState<any>(null);

    // Metadata from DB
    const [closureTypes, setClosureTypes] = useState<any[]>([]);
    const [materials, setMaterials] = useState<any[]>([]);
    const [plantillasMaterial, setPlantillasMaterial] = useState<any[]>([]);
    const [showPlantillaModal, setShowPlantillaModal] = useState(false);

    // Embedded HTML template (with html2canvas for image export)
    const HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Orden de Servicio</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; padding: 20px; margin: 0; background: #f0f0f0; min-width: 850px; }
    #content { background: #fff; border: 3px solid #2c3e50; border-radius: 12px; padding: 25px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); width: 810px; margin: 0 auto; }
    .header-container { margin-bottom: 20px; border-bottom: 2px solid #2c3e50; padding-bottom: 5px; }
    .main-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px; }
    .header-left { flex: 1; text-align: left; }
    .header-left img { height: 50px; }
    .header-center { flex: 2; text-align: center; }
    .header-center h1 { margin: 0; font-size: 20px; color: #2c3e50; }
    .header-center p { margin: 5px 0 0 0; font-size: 12px; color: #666; }
    .header-right { flex: 1; text-align: right; }
    .header-right img { height: 80px; }
    .date-time-row { text-align: right; font-size: 13px; color: #2c3e50; margin-top: 5px; font-weight: bold; }
    
    .data-row { display: flex; gap: 20px; margin-top: 15px; }
    .data-col { flex: 1; }
    .section { margin-top: 15px; }
    .section h3 { border-bottom: 2px solid #2c3e50; padding-bottom: 5px; margin-bottom: 10px; font-size: 15px; color: #2c3e50; }
    .section p { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    table th, table td { border: 1px solid #333; padding: 8px; text-align: left; font-size: 13px; }
    table th { background-color: #ecf0f1; }
    .footer { margin-top: 25px; display: flex; justify-content: space-between; gap: 20px; }
    .signature { text-align: center; flex: 1; border: 2px solid #2c3e50; padding: 15px; border-radius: 8px; background: #f8f9fa; }
    .signature img { width: 100%; height: 150px; object-fit: contain; margin: 8px 0; }
    .signature p { margin: 5px 0; font-size: 13px; }
    .signature strong { font-size: 14px; color: #2c3e50; }
    .observaciones { background-color: #f8f9fa; padding: 10px; border-radius: 5px; margin-top: 8px; border-left: 4px solid #2c3e50; }
    .capture-section { margin-top: 30px; padding: 15px; text-align: center; border-top: 2px dashed #27ae60; }
    #captureBtn { display: inline-block; padding: 15px 30px; background: #27ae60; color: #fff; border: none; border-radius: 10px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(39, 174, 96, 0.4); }
    #captureBtn:disabled { background: #95a5a6; box-shadow: none; }
  </style>
</head>
<body>
  <div id="content">
    <div class="header-container">
      <div class="main-header">
        <div class="header-left">
          <img src="${PAYWAY_LOGO_BASE64}" alt="Payway">
        </div>
        <div class="header-center">
          <h1>Comprobante de Atención Técnica</h1>
          <p>0810-333-0300 | www.Payway.com.ar</p>
        </div>
        <div class="header-right">
          <img src="${DISCAR_LOGO_BASE64}" alt="Discar">
        </div>
      </div>
      <div class="date-time-row">
        Fecha: {{fecha}} - Hora: {{hora}}
      </div>
    </div>

    <div class="data-row">
      <div class="data-col section">
        <h3>Datos del Cliente</h3>
        <p><strong>Terminal:</strong> {{terminal}}</p>
        <p><strong>Cliente:</strong> {{cliente}}</p>
        <p><strong>CUIT:</strong> {{cuit}}</p>
        <p><strong>Domicilio:</strong> {{domicilio}}</p>
        <p><strong>Teléfono:</strong> {{telefono}}</p>
      </div>
      <div class="data-col section">
        <h3>Datos del Servicio</h3>
        <p><strong>OT:</strong> {{ot}}</p>
        <p><strong>Tipo de Servicio:</strong> {{tipo_servicio}}</p>
        <p><strong>Técnico:</strong> {{tecnico_nombre}}</p>
        <p><strong>Tipo de Cierre:</strong> {{tipo_cierre}}</p>
      </div>
    </div>

    <div class="section">
      <h3>Detalle del Trabajo</h3>
      <p>{{detalle_trabajo}}</p>
      {{#observaciones}}
      <div class="observaciones">
        <p><strong>Observaciones:</strong> {{observaciones}}</p>
      </div>
      {{/observaciones}}
    </div>

    <div class="section">
      <h3>Material Retirado</h3>
      <table>
        <thead><tr><th>Material</th><th>Serie/Cantidad</th><th>Condición</th></tr></thead>
        <tbody>
          {{#material_retirado}}
          <tr><td>{{material}} - {{nombre_material}}</td><td>{{serie_o_cantidad}}</td><td>{{condicion}}</td></tr>
          {{/material_retirado}}
          {{^material_retirado}}
          <tr><td colspan="3" style="text-align:center; color:#999;">Sin materiales retirados</td></tr>
          {{/material_retirado}}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h3>Material Entregado</h3>
      <table>
        <thead><tr><th>Material</th><th>Serie/Cantidad</th><th>Condición</th></tr></thead>
        <tbody>
          {{#material_entregado}}
          <tr><td>{{material}} - {{nombre_material}}</td><td>{{serie_o_cantidad}}</td><td>{{condicion}}</td></tr>
          {{/material_entregado}}
          {{^material_entregado}}
          <tr><td colspan="3" style="text-align:center; color:#999;">Sin materiales entregados</td></tr>
          {{/material_entregado}}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <div class="signature">
        <p><strong>Técnico</strong></p>
        <img src="{{tecnico_firma}}" alt="Firma técnico">
        <p>{{tecnico_nombre}}</p>
        <p>DNI: {{tecnico_dni}}</p>
      </div>
      <div class="signature">
        <p><strong>Recibido por</strong></p>
        <img src="{{cliente_firma}}" alt="Firma cliente">
        <p>{{cliente_nombre}}</p>
        <p>DNI: {{cliente_dni}}</p>
      </div>
    </div>
  </div>

  <div class="capture-section">
    <button id="captureBtn" onclick="captureImage()">📷 CAPTURAR Y COMPARTIR</button>
  </div>

  <script>
    function captureImage() {
      var btn = document.getElementById('captureBtn');
      btn.disabled = true;
      btn.textContent = 'Capturando...';
      
      html2canvas(document.getElementById('content'), {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      }).then(function(canvas) {
        var dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'capture', data: dataUrl }));
      }).catch(function(error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: error.toString() }));
        btn.disabled = false;
        btn.textContent = '📷 CAPTURAR IMAGEN';
      });
    }
  </script>
</body>
</html>`;
    const [htmlTemplate, setHtmlTemplate] = useState<string>(HTML_TEMPLATE);

    // Signature modal
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const signatureRef = useRef<SignatureViewRef>(null);

    // Order preview modal (visible preview before capture)
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewHtml, setPreviewHtml] = useState<string>('');
    const [isCapturing, setIsCapturing] = useState(false);
    const previewWebViewRef = useRef<View>(null);

    // Barcode scanner modal
    const [showScannerModal, setShowScannerModal] = useState(false);
    const [scannerTarget, setScannerTarget] = useState<{ type: 'retirado' | 'entregado', id: string; field: 'serie' | 'material' } | null>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);

    // Form state
    const [formData, setFormData] = useState<FormData>({
        terminal: '',
        cliente: '',
        cuit: '',
        domicilio: '',
        telefono: '',
        ot: '',
        tipo_servicio: '',
        detalle_trabajo: '',
        tipo_cierre: '',
        observaciones: '',
        material_retirado: [],
        material_entregado: [],
        cliente_nombre: '',
        cliente_dni: '',
        cliente_firma: '',
        tecnico_nombre: '',
        tecnico_dni: '',
        tecnico_firma: '',
    });

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            // 1. Load all partidas for this OT
            if (cita && ot) {
                const foundPartidas = getServicesByOT(cita as string, ot as string);
                if (foundPartidas.length > 0) {
                    setPartidas(foundPartidas);
                    setClientInfo(foundPartidas[0]);

                    // If only one partida, auto-select it and skip to step 1
                    if (foundPartidas.length === 1) {
                        const p = foundPartidas[0];
                        setSelectedPartidas([p.partida]);
                        setCurrentStep(1);

                        // Initialize form data for this single partida
                        const newFormData = new Map();
                        newFormData.set(p.partida, {
                            terminal: p.terminal || '',
                            tipo_servicio: p.tipo_incidente || '',
                            detalle_trabajo: '',
                            tipo_cierre: '',
                            observaciones: '',
                            material_retirado: [],
                            material_entregado: []
                        });
                        setPartidaFormData(newFormData);
                    }

                    // Pre-fill shared form data from first partida
                    setFormData(prev => ({
                        ...prev,
                        cliente: foundPartidas[0].denominacion || '',
                        cuit: foundPartidas[0].cuit || '',
                        domicilio: foundPartidas[0].domicilio || '',
                        telefono: foundPartidas[0].telefono || '',
                        ot: foundPartidas[0].ot || '',
                        tecnico_nombre: user?.nombre_completo || user?.usuario || 'Técnico',
                    }));
                }
            }

            // 2. Load closure types from local DB
            const db = await loadDatabaseService();
            if (db) {
                await db.init();
                const types = await db.getClosureTypes();
                if (types && types.length > 0) {
                    setClosureTypes(types);
                }

                // Load materials catalog
                const mats = await db.getMaterials();
                if (mats && mats.length > 0) {
                    setMaterials(mats);
                }

                // Load material templates
                const plantillas = await db.getPlantillasMaterial();
                console.log(`[Ejecucion] loadInitialData: ${plantillas?.length ?? 0} plantillas cargadas desde DB`, plantillas?.map((p: any) => ({ id: p.id, nombre: p.nombre, items: p.items?.length })));
                if (plantillas && plantillas.length > 0) {
                    setPlantillasMaterial(plantillas);
                }

                // Load technician profile (using direct SQL like perfil.tsx)
                const dbInstance = await db.getDb();
                const profile: any = await dbInstance.getFirstAsync(
                    'SELECT nombre_completo, dni, signature_path FROM technician_profile WHERE id = 1'
                );
                if (profile) {
                    setFormData(prev => ({
                        ...prev,
                        tecnico_nombre: profile.nombre_completo || prev.tecnico_nombre,
                        tecnico_dni: profile.dni || '',
                        tecnico_firma: profile.signature_path || ''
                    }));
                }

                const draft = await db.getServiceDraft(draftKey);
                if (draft?.flow === 'ORDEN') {
                    setSelectedPartidas(draft.selectedPartidas || []);
                    setCurrentPartidaIndex(draft.currentPartidaIndex || 0);
                    setCurrentStep(draft.currentStep || 0);
                    setPartidaFormData(new Map(draft.partidaFormData || []));
                    if (draft.formData) setFormData(draft.formData);
                    setGeneratedOrderPaths(draft.generatedOrderPaths || []);
                    setUploadedOrderPhotos(new Map(draft.uploadedOrderPhotos || []));
                    Alert.alert('Borrador recuperado', 'Se restauraron los datos que estaban en carga.');
                }
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            draftHydratedRef.current = true;
            setIsLoading(false);
        }
    };

    const persistDraft = async () => {
        if (!draftHydratedRef.current || draftCompletedRef.current || !cita || !ot) return;
        const db = await loadDatabaseService();
        if (!db) return;
        await db.saveServiceDraft(draftKey, {
            flow: 'ORDEN', currentStep, selectedPartidas, currentPartidaIndex,
            partidaFormData: Array.from(partidaFormData.entries()), formData,
            generatedOrderPaths, uploadedOrderPhotos: Array.from(uploadedOrderPhotos.entries()),
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
    }, [currentStep, selectedPartidas, currentPartidaIndex, partidaFormData, formData, generatedOrderPaths, uploadedOrderPhotos]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', state => {
            if (state === 'inactive' || state === 'background') void persistDraft().catch(e => console.warn('Draft background save error:', e));
        });
        return () => subscription.remove();
    }, [currentStep, selectedPartidas, currentPartidaIndex, partidaFormData, formData, generatedOrderPaths, uploadedOrderPhotos]);

    // Save current partida form data before moving on
    const saveCurrentPartidaData = () => {
        const currentPartida = selectedPartidas[currentPartidaIndex];
        if (currentPartida !== undefined) {
            setPartidaFormData(prev => {
                const newMap = new Map(prev);
                newMap.set(currentPartida, {
                    terminal: formData.terminal,
                    tipo_servicio: formData.tipo_servicio,
                    detalle_trabajo: formData.detalle_trabajo,
                    tipo_cierre: formData.tipo_cierre,
                    observaciones: formData.observaciones,
                    material_retirado: formData.material_retirado,
                    material_entregado: formData.material_entregado
                });
                return newMap;
            });
        }
    };

    // Load form data for a specific partida
    const loadPartidaData = (partidaIndex: number) => {
        const partidaNum = selectedPartidas[partidaIndex];
        const partidaInfo = partidas.find(p => p.partida === partidaNum);
        const savedData = partidaFormData.get(partidaNum);

        setFormData(prev => ({
            ...prev,
            terminal: partidaInfo?.terminal || '',
            tipo_servicio: partidaInfo?.tipo_incidente || '',
            detalle_trabajo: savedData?.detalle_trabajo || '',
            tipo_cierre: savedData?.tipo_cierre || '',
            observaciones: savedData?.observaciones || '',
            material_retirado: savedData?.material_retirado || [],
            material_entregado: savedData?.material_entregado || []
        }));
    };

    const handleNext = async () => {
        // A closing type is required before material templates can be evaluated
        // and before an order can progress to the materials step.
        if (currentStep === 2 && !formData.tipo_cierre?.trim()) {
            Alert.alert('Tipo de cierre requerido', 'Seleccione un tipo de cierre antes de continuar.');
            return;
        }

        // Step 3 -> validate materials before proceeding
        if (currentStep === 3) {
            // Validate materials first (async - checks stock)
            const isValid = await validateMaterials();
            if (!isValid) {
                return; // Validation failed, don't proceed
            }

            saveCurrentPartidaData();

            // If more partidas to process, go back to step 2 with next partida
            if (currentPartidaIndex < selectedPartidas.length - 1) {
                const nextIndex = currentPartidaIndex + 1;
                setCurrentPartidaIndex(nextIndex);
                loadPartidaData(nextIndex);
                setCurrentStep(2); // Back to informe for next partida
                return;
            }
        }

        // Normal next step
        if (currentStep < 4) setCurrentStep(currentStep + 1);
    };

    const handleBack = () => {
        // Step 2 -> check if we need to go back to previous partida's step 3
        if (currentStep === 2 && currentPartidaIndex > 0) {
            saveCurrentPartidaData();
            const prevIndex = currentPartidaIndex - 1;
            setCurrentPartidaIndex(prevIndex);
            loadPartidaData(prevIndex);
            setCurrentStep(3); // Go to materials of previous partida
            return;
        }

        // Step 4 and multiple partidas -> back to step 3 of last partida
        if (currentStep === 4 && selectedPartidas.length > 0) {
            const lastIndex = selectedPartidas.length - 1;
            setCurrentPartidaIndex(lastIndex);
            loadPartidaData(lastIndex);
            setCurrentStep(3);
            return;
        }

        // Normal back
        if (currentStep > 0) setCurrentStep(currentStep - 1);
    };

    // Toggle partida selection
    const togglePartida = (partidaNum: number) => {
        setSelectedPartidas(prev => {
            if (prev.includes(partidaNum)) {
                return prev.filter(p => p !== partidaNum);
            } else {
                return [...prev, partidaNum];
            }
        });
    };

    // Select/deselect all partidas (including already completed - they can be re-gestioned)
    const toggleSelectAll = () => {
        if (selectedPartidas.length === partidas.length) {
            setSelectedPartidas([]);
        } else {
            setSelectedPartidas(partidas.map(p => p.partida));
        }
    };

    // Continue from step 0 to step 1 (initialize partidaFormData for selected partidas)
    const handleConfirmPartidas = () => {
        if (selectedPartidas.length === 0) {
            Alert.alert('Error', 'Seleccione al menos una partida');
            return;
        }

        // Initialize form data for each selected partida
        const newFormData = new Map<number, any>();
        for (const partidaNum of selectedPartidas) {
            const p = partidas.find(part => part.partida === partidaNum);
            if (p) {
                newFormData.set(partidaNum, {
                    terminal: p.terminal || '',
                    tipo_servicio: p.tipo_incidente || '',
                    detalle_trabajo: '',
                    tipo_cierre: '',
                    observaciones: '',
                    material_retirado: [] as MaterialItem[],
                    material_entregado: [] as MaterialItem[]
                });
            }
        }
        setPartidaFormData(newFormData);

        // Sync formData with first partida's data immediately
        const firstPartidaNum = selectedPartidas[0];
        const firstPartidaInfo = partidas.find(p => p.partida === firstPartidaNum);
        if (firstPartidaInfo) {
            setFormData(prev => ({
                ...prev,
                terminal: firstPartidaInfo.terminal || '',
                tipo_servicio: firstPartidaInfo.tipo_incidente || '',
                detalle_trabajo: '',
                tipo_cierre: '',
                observaciones: '',
                material_retirado: [],
                material_entregado: []
            }));
        }

        setCurrentPartidaIndex(0);
        setCurrentStep(1);
    };

    const handleClientSignatureOK = (sig: string) => {
        setFormData(prev => ({ ...prev, cliente_firma: sig }));
        setShowSignatureModal(false);
    };

    const addMaterialItem = (type: 'retirado' | 'entregado') => {
        const items = type === 'retirado' ? formData.material_retirado : formData.material_entregado;

        // Validate all existing items are complete before adding new
        const incompleteItems = items.filter(item => {
            const hasMaterial = item.material && item.material.trim() !== '';
            const hasSerie = item.serie_o_cantidad && item.serie_o_cantidad.trim() !== '';
            // Incomplete if has one but not the other
            return (hasMaterial && !hasSerie) || (!hasMaterial && hasSerie);
        });

        if (incompleteItems.length > 0) {
            Alert.alert(
                'Material Incompleto',
                'Complete el material anterior antes de agregar uno nuevo. Cada material requiere código y serie/cantidad.',
                [{ text: 'Entendido' }]
            );
            return;
        }

        const newItem: MaterialItem = {
            id: Date.now().toString(),
            material: '',
            serie_o_cantidad: '',
            condicion: 'BUENO',
            unidad_medida: '',  // Will be set when material is selected
        };
        // Add new item at TOP of list so technician doesn't need to scroll
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
        const updateFn = (items: MaterialItem[]) => items.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        );
        if (type === 'retirado') {
            setFormData(prev => ({ ...prev, material_retirado: updateFn(prev.material_retirado) }));
        } else {
            setFormData(prev => ({ ...prev, material_entregado: updateFn(prev.material_entregado) }));
        }
    };

    // Helper to update material with photo path
    const updateMaterialPhoto = (type: 'retirado' | 'entregado', id: string, photoPath: string) => {
        const updateFn = (items: MaterialItem[]) => items.map(item =>
            item.id === id ? { ...item, foto_serie: photoPath } : item
        );
        if (type === 'retirado') {
            setFormData(prev => ({ ...prev, material_retirado: updateFn(prev.material_retirado) }));
        } else {
            setFormData(prev => ({ ...prev, material_entregado: updateFn(prev.material_entregado) }));
        }
    };

    // Validate materials before proceeding to next step
    // Returns true if validation passes, false otherwise
    const validateMaterials = async (): Promise<boolean> => {
        const allMaterials = [
            ...formData.material_retirado.map(m => ({ ...m, tipo: 'retirado' })),
            ...formData.material_entregado.map(m => ({ ...m, tipo: 'entregado' }))
        ];

        // Filter out completely empty entries (no material and no serie_o_cantidad)
        // These are silently removed - only entries with some data are validated
        const filledEntries = allMaterials.filter(m => m.material || m.serie_o_cantidad);

        // Validation 1: Check for entries with data but no material selected
        const missingMaterial = filledEntries.filter(m => !m.material && m.serie_o_cantidad);
        if (missingMaterial.length > 0) {
            Alert.alert(
                'Material Requerido',
                'Hay materiales sin seleccionar. Por favor seleccione el tipo de material o elimine las entradas incompletas.',
                [{ text: 'Entendido' }]
            );
            return false;
        }

        // Validation 2: Check for entries with material but no serie/cantidad
        const missingData = filledEntries.filter(m => m.material && !m.serie_o_cantidad);
        if (missingData.length > 0) {
            Alert.alert(
                'Datos Incompletos',
                'Hay materiales seleccionados sin número de serie o cantidad. Por favor complete los datos o elimine las entradas.',
                [{ text: 'Entendido' }]
            );
            return false;
        }

        // Validation 3: Check for non-serialized materials with large numbers (>1000)
        const suspiciousEntries = filledEntries.filter(m => {
            if (m.unidad_medida !== 'SERIALIZADO') {
                const value = parseInt(m.serie_o_cantidad);
                return !isNaN(value) && value > 1000;
            }
            return false;
        });

        if (suspiciousEntries.length > 0) {
            Alert.alert(
                'Posible Error de Carga',
                'Ha ingresado una cantidad mayor a 1000 en un material por unidad. Si es un número de serie, seleccione un material serializado. Si realmente es una cantidad grande, divídala en múltiples entregas o contacte a su supervisor.',
                [{ text: 'Revisar' }]
            );
            return false;
        }

        // Validation 4: Check for duplicate serialized items in material_entregado
        const serializedEntregados = formData.material_entregado.filter(
            m => m.unidad_medida === 'SERIALIZADO' && m.serie_o_cantidad
        );
        const serialSet = new Set<string>();
        const duplicates: string[] = [];

        for (const item of serializedEntregados) {
            const serial = item.serie_o_cantidad.toLowerCase();
            if (serialSet.has(serial)) {
                duplicates.push(item.serie_o_cantidad);
            } else {
                serialSet.add(serial);
            }
        }

        if (duplicates.length > 0) {
            Alert.alert(
                'Seriales Duplicados',
                `Los siguientes números de serie están duplicados en Material Entregado: ${duplicates.join(', ')}. Cada serial solo puede entregarse una vez.`,
                [{ text: 'Revisar' }]
            );
            return false;
        }

        // Validation 4b: Check for duplicate serialized items in material_retirado
        // (espejo del check de ENTREGA). El backend ya rechaza el segundo retiro
        // como PENDIENTE, pero evitamos cargar una gestión que quedaría incompleta.
        const serializedRetiradosDup = formData.material_retirado.filter(
            m => m.unidad_medida === 'SERIALIZADO' && m.serie_o_cantidad
        );
        const retiroSet = new Set<string>();
        const retiroDuplicates: string[] = [];

        for (const item of serializedRetiradosDup) {
            const serial = item.serie_o_cantidad.toLowerCase();
            if (retiroSet.has(serial)) {
                retiroDuplicates.push(item.serie_o_cantidad);
            } else {
                retiroSet.add(serial);
            }
        }

        if (retiroDuplicates.length > 0) {
            Alert.alert(
                'Seriales Duplicados',
                `Los siguientes números de serie están duplicados en Material Retirado: ${retiroDuplicates.join(', ')}. Cada serial solo puede retirarse una vez.`,
                [{ text: 'Revisar' }]
            );
            return false;
        }

        // Validation 4c: Un mismo serial no puede estar simultáneamente en retirado y entregado
        const serieEnRetiroYEntrega = [...retiroSet].filter(s => serialSet.has(s));
        if (serieEnRetiroYEntrega.length > 0) {
            Alert.alert(
                'Serial Duplicado',
                `El serial "${serieEnRetiroYEntrega.join('", "')}" está cargado simultáneamente en Material Retirado y Material Entregado. Retirar y entregar el mismo serial en una misma gestión no es válido.`,
                [{ text: 'Revisar' }]
            );
            return false;
        }

        // Validation 5: Check that all serialized deliveries exist in technician's stock
        try {
            const db = await loadDatabaseService();
            if (db) {
                const stockItems = await db.getStockLocal();
                const notInStock: string[] = [];

                for (const item of serializedEntregados) {
                    const hasInStock = stockItems.some((s: any) =>
                        s.codigo_material === item.material &&
                        (s.serie?.toLowerCase() === item.serie_o_cantidad.toLowerCase()) &&
                        s.condicion === item.condicion // FIX #2: Check condition match
                    );
                    if (!hasInStock) {
                        // Hint accionable: si la serie está bajo otro material, se lo decimos.
                        const enOtro = stockItems.find((s: any) =>
                            s.serie?.toLowerCase() === item.serie_o_cantidad.toLowerCase() &&
                            s.codigo_material !== item.material
                        );
                        if (enOtro) {
                            notInStock.push(`${item.material} (${item.serie_o_cantidad}): la serie está en su stock como ${enOtro.codigo_material} - ${enOtro.nombre_material}. Seleccione ese material.`);
                        } else {
                            const condText = item.condicion !== 'BUENO' ? ` en condición ${item.condicion}` : '';
                            notInStock.push(`${item.material} (${item.serie_o_cantidad})${condText}`);
                        }
                    }
                }

                // Also check non-serialized deliveries have sufficient stock
                const nonSerializedEntregados = formData.material_entregado.filter(
                    m => m.unidad_medida !== 'SERIALIZADO' && m.material && m.serie_o_cantidad
                );

                for (const item of nonSerializedEntregados) {
                    const cantidad = parseInt(item.serie_o_cantidad) || 0;
                    const stockItem = stockItems.find((s: any) =>
                        s.codigo_material === item.material &&
                        !s.serie &&
                        s.condicion === item.condicion // FIX #2: Check condition match
                    );
                    const stockCantidad = stockItem?.cantidad || 0;

                    if (cantidad > stockCantidad) {
                        const condText = item.condicion !== 'BUENO' ? ` (${item.condicion})` : '';
                        notInStock.push(`${item.material}${condText}: requiere ${cantidad}, tiene ${stockCantidad}`);
                    }
                }

                if (notInStock.length > 0) {
                    Alert.alert(
                        'Material No Disponible',
                        `Los siguientes materiales no están en su stock o tienen cantidad insuficiente:\n\n${notInStock.join('\n')}\n\nSolo puede entregar materiales que tenga en su stock.`,
                        [{ text: 'Revisar' }]
                    );
                    return false;
                }
            }
        } catch (stockCheckError) {
            console.warn('Could not validate stock:', stockCheckError);
            Alert.alert(
                'Error de Validación',
                'No se pudo verificar el stock disponible. Por favor intente nuevamente o contacte a su supervisor.',
                [{ text: 'Entendido' }]
            );
            return false;
        }

        // Validation 6: Check for already existing serialized items in technician's stock (prevent duplicates)
        const serializedRetirados = formData.material_retirado.filter(
            m => m.unidad_medida === 'SERIALIZADO' && m.serie_o_cantidad
        );

        if (serializedRetirados.length > 0) {
            try {
                const db = await loadDatabaseService();
                if (db) {
                    const stockItems = await db.getStockLocal();
                    const alreadyInStock: string[] = [];

                    for (const item of serializedRetirados) {
                        const hasInStock = stockItems.some((s: any) =>
                            s.codigo_material === item.material &&
                            (s.serie?.toLowerCase() === item.serie_o_cantidad.toLowerCase())
                        );
                        if (hasInStock) {
                            alreadyInStock.push(`${item.material} (${item.serie_o_cantidad})`);
                        }
                    }

                    if (alreadyInStock.length > 0) {
                        Alert.alert(
                            'Material Ya en Stock',
                            `Los siguientes materiales ya existen en su stock local:\n\n${alreadyInStock.join('\n')}\n\nNo puede retirar un material que ya tiene asignado.`,
                            [{ text: 'Entendido' }]
                        );
                        return false;
                    }
                }
            } catch (error) {
                console.error("Stock duplicate check error:", error);
            }
        }

        return true;
    };

    // Open barcode scanner for a specific material item
    const openScanner = async (type: 'retirado' | 'entregado', itemId: string, field: 'serie' | 'material' = 'serie') => {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert('Permiso Requerido', 'Se necesita acceso a la cámara para escanear códigos de barras');
                return;
            }
        }
        setScannerTarget({ type, id: itemId, field });
        setShowScannerModal(true);
    };

    // Handle barcode detection
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
        console.log('Scanned barcode:', scannedCode);

        // Get current item to check if material is already selected
        const items = scannerTarget.type === 'retirado' ? formData.material_retirado : formData.material_entregado;
        const currentItem = items.find(i => i.id === scannerTarget.id);

        // CASE 1: Material already selected - just use scanned code as serie/cantidad
        if (currentItem?.material) {
            console.log('Material already selected:', currentItem.material, 'unidad:', currentItem.unidad_medida);

            if (currentItem.unidad_medida === 'SERIALIZADO') {
                // For serialized: scanned code is the serial number
                updateMaterialItem(scannerTarget.type, scannerTarget.id, 'serie_o_cantidad', scannedCode);
                console.log('Set serie to:', scannedCode);
            } else {
                // For non-serialized: scanning doesn't make sense, show warning
                Alert.alert(
                    'Material por Unidad',
                    'Este material se mide por cantidad, no por número de serie. Ingrese la cantidad manualmente.',
                    [{ text: 'Entendido' }]
                );
                setShowScannerModal(false);
                setScannerTarget(null);
                return;
            }

            // Capture photo of the barcode
            await captureSerialPhoto();
            return;
        }

        // CASE 2: No material selected - try to find material in local database
        try {
            const db = await loadDatabaseService();
            if (db) {
                // First, check if this serial exists in tech's stock (for serialized items the tech already has)
                const stockItems = await db.getStockLocal();
                const stockItem = stockItems.find((s: any) =>
                    s.serie === scannedCode || s.serie?.toLowerCase() === scannedCode.toLowerCase()
                );

                if (stockItem) {
                    // Found in tech's stock - auto-fill with material info from stock
                    console.log('Serial found in stock:', stockItem.codigo_material);

                    // Also lookup the material name from catalog
                    const materials = await db.getMaterials();
                    const materialInfo = materials.find((m: any) =>
                        m.codigo_material === stockItem.codigo_material
                    );

                    updateMaterialItem(scannerTarget.type, scannerTarget.id, 'material', stockItem.codigo_material);
                    updateMaterialItem(scannerTarget.type, scannerTarget.id, 'nombre_material', materialInfo?.nombre || stockItem.nombre_material || '');
                    updateMaterialItem(scannerTarget.type, scannerTarget.id, 'unidad_medida', stockItem.unidad_medida || 'SERIALIZADO');
                    updateMaterialItem(scannerTarget.type, scannerTarget.id, 'serie_o_cantidad', scannedCode);
                } else {
                    // Not in stock - check if it's a material code
                    const materials = await db.getMaterials();
                    const foundMaterial = materials.find((m: any) =>
                        m.codigo_material === scannedCode ||
                        m.codigo_material?.toLowerCase() === scannedCode.toLowerCase()
                    );

                    if (foundMaterial) {
                        // Material found - auto-complete
                        console.log('Material found:', foundMaterial.nombre);
                        updateMaterialItem(scannerTarget.type, scannerTarget.id, 'material', foundMaterial.codigo_material);
                        updateMaterialItem(scannerTarget.type, scannerTarget.id, 'nombre_material', foundMaterial.nombre || '');
                        updateMaterialItem(scannerTarget.type, scannerTarget.id, 'unidad_medida', foundMaterial.unidad_medida || 'UNIDAD');

                        // For UNIDAD, default quantity to 1; for SERIALIZADO, leave empty (will scan next)
                        if (foundMaterial.unidad_medida !== 'SERIALIZADO') {
                            updateMaterialItem(scannerTarget.type, scannerTarget.id, 'serie_o_cantidad', '1');
                        }
                        // Note: For SERIALIZADO materials, serie_o_cantidad stays empty
                        // The tech will need to scan again or input manually
                    } else {
                        // Code not found as material - assume it's a serial number
                        updateMaterialItem(scannerTarget.type, scannerTarget.id, 'serie_o_cantidad', scannedCode);
                        // Mark as SERIALIZADO since we're treating this as a serial number
                        updateMaterialItem(scannerTarget.type, scannerTarget.id, 'unidad_medida', 'SERIALIZADO');
                    }
                }
            } else {
                // No database - just put scanned code in serie field and assume serialized
                updateMaterialItem(scannerTarget.type, scannerTarget.id, 'serie_o_cantidad', scannedCode);
                updateMaterialItem(scannerTarget.type, scannerTarget.id, 'unidad_medida', 'SERIALIZADO');
            }
        } catch (error) {
            console.error('Error looking up material:', error);
            // Fallback - put code in serie field and assume serialized
            updateMaterialItem(scannerTarget.type, scannerTarget.id, 'serie_o_cantidad', scannedCode);
            updateMaterialItem(scannerTarget.type, scannerTarget.id, 'unidad_medida', 'SERIALIZADO');
        }

        // Capture photo of the barcode
        await captureSerialPhoto();
    };

    // Capture photo of serial (with or without barcode detection)
    const captureSerialPhoto = async () => {
        if (!cameraRef.current || !scannerTarget) return;

        try {
            // Small delay to let camera stabilize before taking photo
            await new Promise(resolve => setTimeout(resolve, 300));

            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.85,
                base64: false,
            });

            if (photo?.uri) {
                // Crop to the center strip of the image where the serial label/barcode is.
                // The scan frame overlay covers approx 80% width × 50% height of the camera area.
                const cropWidth = Math.round(photo.width * 0.8);
                const cropHeight = Math.round(photo.height * 0.5);
                const cropOriginX = Math.round((photo.width - cropWidth) / 2);
                const cropOriginY = Math.round((photo.height - cropHeight) / 2);

                const cropped = await ImageManipulator.manipulateAsync(
                    photo.uri,
                    [{ crop: { originX: cropOriginX, originY: cropOriginY, width: cropWidth, height: cropHeight } }],
                    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
                );

                // Save to permanent location
                const fileName = `serie_${scannerTarget.id}_${Date.now()}.jpg`;
                const permanentPath = (FileSystem.documentDirectory || '') + fileName;
                await FileSystem.moveAsync({ from: cropped.uri, to: permanentPath });

                // Update material with photo path
                updateMaterialPhoto(scannerTarget.type, scannerTarget.id, permanentPath);
            }
        } catch (error) {
            console.error('Error capturing photo:', error);
        }

        // Close scanner
        setShowScannerModal(false);
        setScannerTarget(null);
    };

    // Close scanner without capturing
    const closeScanner = () => {
        setShowScannerModal(false);
        setScannerTarget(null);
    };

    // Handle serie/cantidad input on blur - lookup, validate, and manage conflicts
    const lookupSerialInStock = async (type: 'retirado' | 'entregado', itemId: string, inputValue: string) => {
        if (!inputValue || inputValue.length < 1) {
            updateMaterialItem(type, itemId, 'error', '');
            return;
        }

        const items = type === 'retirado' ? formData.material_retirado : formData.material_entregado;
        const item = items.find(i => i.id === itemId);

        // Determine if input looks like a quantity (pure number) or a serial
        const numericValue = parseInt(inputValue);
        const isLikelyQuantity = !isNaN(numericValue) && inputValue.length <= 4 && numericValue <= 1000;
        const isLikelySerial = !isLikelyQuantity;

        try {
            const db = await loadDatabaseService();
            if (!db) return;
            const stockItems = await db.getStockLocal();

            // CASE 1: Material already selected
            if (item?.material) {
                // If material is SERIALIZADO but user entered a quantity
                if (item.unidad_medida === 'SERIALIZADO' && isLikelyQuantity) {
                    // Clear the material - user needs to select a non-serialized material
                    updateMaterialItem(type, itemId, 'material', '');
                    updateMaterialItem(type, itemId, 'nombre_material', '');
                    updateMaterialItem(type, itemId, 'unidad_medida', '');
                    updateMaterialItem(type, itemId, 'error', 'Ingresó una cantidad. Por favor seleccione un material por unidad.');
                    return;
                }

                // If material is not SERIALIZADO (by unit) - validate quantity for entregado
                if (item.unidad_medida !== 'SERIALIZADO' && type === 'entregado') {
                    const cantidad = numericValue || 0;
                    const stockItem = stockItems.find((s: any) =>
                        s.codigo_material === item.material && !s.serie
                    );
                    const stockCantidad = stockItem?.cantidad || 0;

                    if (cantidad > stockCantidad) {
                        updateMaterialItem(type, itemId, 'error', `Cantidad insuficiente. Tiene ${stockCantidad} disponibles`);
                    } else {
                        updateMaterialItem(type, itemId, 'error', '');
                    }
                    return;
                }

                // If material is SERIALIZADO and user entered a serial - validate for entregado
                if (item.unidad_medida === 'SERIALIZADO' && type === 'entregado') {
                    updateMaterialItem(type, itemId, 'error', getSerieEntregaError(stockItems, item.material, inputValue));
                    return;
                }

                // For retirado - clear any error (no stock validation needed for pickups)
                updateMaterialItem(type, itemId, 'error', '');
                return;
            }

            // CASE 2: No material selected yet - try to auto-fill ONLY for entregado
            if (type === 'entregado' && isLikelySerial) {
                // Look for this serial in technician's stock
                const stockItem = stockItems.find((s: any) =>
                    s.serie?.toLowerCase() === inputValue.toLowerCase()
                );

                if (stockItem) {
                    console.log('Auto-fill from stock (entregado):', stockItem.codigo_material);
                    updateMaterialItem(type, itemId, 'material', stockItem.codigo_material);
                    updateMaterialItem(type, itemId, 'nombre_material', stockItem.nombre_material || '');
                    updateMaterialItem(type, itemId, 'unidad_medida', stockItem.unidad_medida || 'SERIALIZADO');
                    updateMaterialItem(type, itemId, 'error', ''); // Found in stock, no error
                    return;
                }
            }

            // CASE 3: For retirado - never auto-fill, just mark as serialized if looks like serial
            if (type === 'retirado' && isLikelySerial) {
                // Check if this serial is ALREADY in technician's stock (shouldn't pick up what you have)
                const alreadyInStock = stockItems.some((s: any) =>
                    s.serie?.toLowerCase() === inputValue.toLowerCase()
                );

                if (alreadyInStock) {
                    updateMaterialItem(type, itemId, 'error', 'Esta serie ya está en su stock. No puede retirar material que ya tiene.');
                } else {
                    updateMaterialItem(type, itemId, 'unidad_medida', 'SERIALIZADO');
                    updateMaterialItem(type, itemId, 'error', '');
                }
                return;
            }

            // Default: set as likely type and no error (will be validated at submission)
            if (isLikelySerial) {
                updateMaterialItem(type, itemId, 'unidad_medida', 'SERIALIZADO');
            }
            updateMaterialItem(type, itemId, 'error', '');

        } catch (error) {
            console.error('Error in lookupSerialInStock:', error);
        }
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

    // Validate material against stock in real-time (for entregado only)
    const validateMaterialStock = async (
        type: 'retirado' | 'entregado',
        itemId: string,
        material: string,
        unidadMedida: string,
        serieOCantidad: string,
        condicion?: string
    ) => {
        // Only validate for entregado (deliveries)
        if (type !== 'entregado') {
            updateMaterialItem(type, itemId, 'error', '');
            return;
        }

        if (!material || !serieOCantidad) {
            updateMaterialItem(type, itemId, 'error', '');
            return;
        }

        try {
            const db = await loadDatabaseService();
            if (!db) return;

            const stockItems = await db.getStockLocal();

            if (unidadMedida === 'SERIALIZADO') {
                // Mensaje accionable: si la serie está en el stock bajo OTRO material,
                // le decimos cuál es en lugar de un genérico "no encontrada".
                updateMaterialItem(type, itemId, 'error', getSerieEntregaError(stockItems, material, serieOCantidad, condicion));
            } else {
                // Check if quantity is available with matching condition
                const cantidad = parseInt(serieOCantidad) || 0;
                const stockItem = stockItems.find((s: any) =>
                    s.codigo_material === material && !s.serie &&
                    (!condicion || s.condicion === condicion)
                );
                const stockCantidad = stockItem?.cantidad || 0;

                if (cantidad > stockCantidad) {
                    updateMaterialItem(type, itemId, 'error', `Cantidad insuficiente. Tiene ${stockCantidad} disponibles`);
                } else {
                    updateMaterialItem(type, itemId, 'error', '');
                }
            }
        } catch (error) {
            console.error('Error validating stock:', error);
        }
    };

            // Step 1: Generate renders HTML and shows preview modal
    // For multi-partida, we generate one order per partida sequentially
    const [generatingPartidaIndex, setGeneratingPartidaIndex] = useState(0);

    const generateOrder = async () => {
        if (!formData.cliente_nombre || formData.cliente_nombre.trim() === '') {
            Alert.alert('Error', 'Por favor ingrese el nombre del cliente');
            return;
        }
        if (!formData.cliente_dni || formData.cliente_dni.trim() === '') {
            Alert.alert('Error', 'Por favor ingrese el DNI del cliente');
            return;
        }
        if (!formData.cliente_firma) {
            Alert.alert('Error', 'Por favor capture la firma del cliente');
            return;
        }

        // Save current partida data before generating
        saveCurrentPartidaData();

        // Start generating from the first selected partida
        setGeneratingPartidaIndex(0);
        await generateOrderForPartida(0);
    };

    // Generate order for a specific partida index
    const generateOrderForPartida = async (partidaIdx: number) => {
        const partidaNum = selectedPartidas[partidaIdx];
        const partidaInfo = partidas.find(p => p.partida === partidaNum);
        const savedData = partidaFormData.get(partidaNum);

        if (!partidaInfo || !savedData) {
            Alert.alert('Error', `No se encontraron datos para la partida ${partidaNum}`);
            return;
        }

        setIsGenerating(true);
        try {
            const now = new Date();

            // Build template data combining client info + partida-specific info
            const templateData = {
                // Client data (shared)
                cliente: formData.cliente,
                cuit: formData.cuit,
                domicilio: formData.domicilio,
                telefono: formData.telefono,
                ot: formData.ot,
                // Partida-specific data
                terminal: partidaInfo.terminal || '',
                tipo_servicio: partidaInfo.tipo_incidente || '',
                detalle_trabajo: savedData.detalle_trabajo || '',
                tipo_cierre: savedData.tipo_cierre || '',
                observaciones: savedData.observaciones || '',
                // Filter out empty entries before rendering - only include items with material AND serie_o_cantidad
                material_retirado: (savedData.material_retirado || []).filter((m: MaterialItem) => m.material && m.serie_o_cantidad),
                material_entregado: (savedData.material_entregado || []).filter((m: MaterialItem) => m.material && m.serie_o_cantidad),
                // Signatures (shared)
                cliente_nombre: formData.cliente_nombre,
                cliente_dni: formData.cliente_dni,
                cliente_firma: formData.cliente_firma,
                tecnico_nombre: formData.tecnico_nombre,
                tecnico_dni: formData.tecnico_dni,
                tecnico_firma: formData.tecnico_firma,
                // Metadata
                fecha: now.toLocaleDateString('es-AR'),
                hora: now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
                partida: partidaNum,
                partida_info: `Partida ${partidaIdx + 1} de ${selectedPartidas.length}`
            };

            const renderedHtml = Mustache.render(htmlTemplate, templateData);

            // Show the preview modal with the rendered HTML
            setPreviewHtml(renderedHtml);
            setShowPreviewModal(true);
        } catch (error) {
            console.error('Error generating order:', error);
            Alert.alert('Error', 'No se pudo generar la orden');
        } finally {
            setIsGenerating(false);
        }
    };

    // =====================================================
    // CARGAR ORDEN (Manual order upload with photo)
    // =====================================================

    const startUploadOrderFlow = () => {
        // Validate nombre y DNI (NO firma required)
        if (!formData.cliente_nombre || formData.cliente_nombre.trim() === '') {
            Alert.alert('Error', 'Por favor ingrese el nombre del cliente');
            return;
        }
        if (!formData.cliente_dni || formData.cliente_dni.trim() === '') {
            Alert.alert('Error', 'Por favor ingrese el DNI del cliente');
            return;
        }

        saveCurrentPartidaData();
        setOrderMode('upload');
        setUploadedOrderPhotos(new Map());
        setCapturingPhotoForPartida(selectedPartidas[0]);
        setShowOrderPhotoModal(true);
    };

    const pickOrderPhoto = async (source: 'camera' | 'gallery') => {
        try {
            let result;
            if (source === 'camera') {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Error', 'Se requiere permiso de cámara');
                    return;
                }
                result = await ImagePicker.launchCameraAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    quality: 0.8,
                    allowsEditing: false,
                });
            } else {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Error', 'Se requiere permiso de galería');
                    return;
                }
                result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    quality: 0.8,
                    allowsEditing: false,
                });
            }

            if (!result.canceled && result.assets && result.assets[0]) {
                const photoUri = result.assets[0].uri;
                if (capturingPhotoForPartida !== null) {
                    setUploadedOrderPhotos(prev => {
                        const newMap = new Map(prev);
                        newMap.set(capturingPhotoForPartida, photoUri);
                        return newMap;
                    });
                }
            }
        } catch (error) {
            console.error('Error picking photo:', error);
            Alert.alert('Error', 'No se pudo obtener la imagen');
        }
    };

    const nextPartidaPhoto = () => {
        if (capturingPhotoForPartida === null) return;

        // Check if current partida has photo
        if (!uploadedOrderPhotos.get(capturingPhotoForPartida)) {
            Alert.alert('Error', `Debe cargar la foto de la orden para la partida ${capturingPhotoForPartida}`);
            return;
        }

        // Find next partida
        const currentIndex = selectedPartidas.indexOf(capturingPhotoForPartida);
        if (currentIndex < selectedPartidas.length - 1) {
            setCapturingPhotoForPartida(selectedPartidas[currentIndex + 1]);
        }
    };

    const finishUploadOrderFlow = async () => {
        // Verify ALL partidas have photos
        for (const partidaNum of selectedPartidas) {
            if (!uploadedOrderPhotos.get(partidaNum)) {
                Alert.alert('Error', `Falta foto de orden para partida ${partidaNum}`);
                setCapturingPhotoForPartida(partidaNum);
                return;
            }
        }

        setIsUploadingOrder(true);
        setShowOrderPhotoModal(false);

        try {
            // Capture technician's GPS location
            let technicianLocation: { latitude: number; longitude: number } | null = null;
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
                    technicianLocation = {
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude
                    };
                }
            } catch (locError) {
                console.warn('Could not get location:', locError);
            }

            // Load database service
            if (!databaseService) {
                await loadDatabaseService();
            }

            const now = new Date();
            const gestiones: any[] = [];

            // Process each partida
            for (let i = 0; i < selectedPartidas.length; i++) {
                const partidaNum = selectedPartidas[i];
                const partidaInfo = partidas.find((p: any) => p.partida === partidaNum);
                const savedData = partidaFormData.get(partidaNum);
                const photoUri = uploadedOrderPhotos.get(partidaNum);

                if (!partidaInfo || !savedData || !photoUri) continue;

                // Copy photo to persistent storage
                const fileName = `orden_cargada_${cita}_${ot}_p${partidaNum}_${Date.now()}.jpg`;
                const destPath = `${FileSystem.documentDirectory}ordenes/${fileName}`;

                await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}ordenes/`, { intermediates: true });
                await FileSystem.copyAsync({ from: photoUri, to: destPath });

                // Build gestion object - using correct field names from GestionData interface
                const gestion = {
                    tipo: 'ORDEN' as 'ORDEN' | 'NOVEDAD', // Use ORDEN (CARGADA identified by observaciones)
                    ruta_id: rutaActiva?.id || 0,
                    cita: cita as string,
                    ot: ot as string,
                    partida: partidaNum,
                    terminal: partidaInfo.terminal || '',
                    tipo_cierre: savedData.tipo_cierre || '',
                    detalle_trabajo: savedData.detalle_trabajo || '',
                    observaciones: `[ORDEN CARGADA] ${savedData.observaciones || ''}`,
                    material_retirado: JSON.stringify(savedData.material_retirado || []),
                    material_entregado: JSON.stringify(savedData.material_entregado || []),
                    cliente_nombre: formData.cliente_nombre,
                    cliente_dni: formData.cliente_dni,
                    cliente_firma: undefined, // No signature for uploaded orders
                    tecnico_nombre: formData.tecnico_nombre || user?.nombrecompleto || '',
                    tecnico_firma: formData.tecnico_firma || undefined,
                    order_image_path: destPath, // Photo path for uploaded order
                    latitude: technicianLocation?.latitude || null,
                    longitude: technicianLocation?.longitude || null,
                    timestamp: now.toISOString()
                };

                gestiones.push(gestion);
            }

            // No guardar estas gestiones por el canal histórico: el outbox
            // transaccional las persiste junto con sus movimientos y el backend
            // crea la única HistorialGestion asociada a la operación.

            // Register stock movements via outbox (idéntico al call site de generar orden)
            try {
                const dbServicio = await loadDatabaseService();
                if (dbServicio) {
                    await dbServicio.registerStockMovementsOutbox({
                        cita: cita as string,
                        ot: ot as string,
                        formData: partidaFormData,
                        selectedPartidas,
                        user,
                        rutaActiva,
                        formDataGlobal: formData,
                        uploadedOrderPhotos,
                        technicianLocation,
                    });
                }
            } catch (stockError) {
                console.error('Stock movements failed after saving gestiones:', stockError);
                Alert.alert(
                    'Aviso de Stock',
                    'No se pudo guardar la operación de stock localmente. Reintentá cerrar la orden antes de continuar; si persiste, contactá a tu supervisor.',
                    [{ text: 'Entendido' }]
                );
            }

            // Note: Services are tracked via gestiones with PENDING status
            // No need to mark as completed locally - will be synced to server
            await clearDraft();

            Alert.alert(
                'Órdenes Cargadas',
                `Se cargaron ${gestiones.length} orden(es) correctamente. Se sincronizarán automáticamente.`,
                [{ text: 'OK', onPress: () => router.back() }]
            );

        } catch (error) {
            console.error('Error finishing upload order:', error);
            Alert.alert('Error', 'No se pudieron guardar las órdenes');
        } finally {
            setIsUploadingOrder(false);
            setOrderMode(null);
        }
    };

    const closeOrderPhotoModal = () => {
        Alert.alert(
            'Cancelar',
            '¿Desea cancelar la carga de órdenes?',
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Sí',
                    onPress: () => {
                        setShowOrderPhotoModal(false);
                        setOrderMode(null);
                        setUploadedOrderPhotos(new Map());
                        setCapturingPhotoForPartida(null);
                    }
                }
            ]
        );
    };


    // Handle message from WebView (receives base64 image from html2canvas)
    const handleWebViewMessage = async (event: any) => {
        try {
            const message = JSON.parse(event.nativeEvent.data);

            if (message.type === 'capture') {
                setIsCapturing(true);

                // Capture technician's GPS location for backend verification
                let technicianLocation: { latitude: number; longitude: number } | null = null;
                try {
                    const { status } = await Location.requestForegroundPermissionsAsync();
                    if (status === 'granted') {
                        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
                        technicianLocation = {
                            latitude: loc.coords.latitude,
                            longitude: loc.coords.longitude
                        };
                        console.log('Order generated at location:', technicianLocation);
                    }
                } catch (locError) {
                    console.warn('Could not capture location for order:', locError);
                }

                // Extract base64 data (remove data:image/jpeg;base64, prefix)
                const base64Data = message.data.replace(/^data:image\/\w+;base64,/, '');

                // Get partida info for filename
                const currentPartidaNum = selectedPartidas[generatingPartidaIndex];
                const currentPartidaInfo = partidas.find(p => p.partida === currentPartidaNum);
                const terminal = currentPartidaInfo?.terminal?.trim();

                // Build filename: terminal-ot-partida.jpg or ot-partida.jpg if no terminal
                const jpgFileName = terminal
                    ? `${terminal}-${formData.ot}-${currentPartidaNum}.jpg`
                    : `${formData.ot}-${currentPartidaNum}.jpg`;
                const jpgPath = (FileSystem.documentDirectory || '') + jpgFileName;
                await FileSystem.writeAsStringAsync(jpgPath, base64Data, {
                    encoding: FileSystem.EncodingType.Base64,
                });

                // Save to device gallery in a dedicated album for easy access
                // Using writeOnly: true to only request photo write permissions (not audio/video)
                let savedToGallery = false;
                try {
                    // Request ONLY write permissions (avoids AUDIO permission requirement)
                    const { status } = await MediaLibrary.requestPermissionsAsync(true);
                    if (status === 'granted') {
                        // Create asset from the saved file
                        const asset = await MediaLibrary.createAssetAsync(jpgPath);

                        // Try to add to "Ordenes Servicio" album (create if doesn't exist)
                        const albumName = 'Ordenes Servicio';
                        let album = await MediaLibrary.getAlbumAsync(albumName);

                        if (album === null) {
                            // Create album with the first asset
                            await MediaLibrary.createAlbumAsync(albumName, asset, false);
                        } else {
                            // Add asset to existing album
                            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
                        }

                        console.log('Order image saved to album: Ordenes Servicio');
                        savedToGallery = true;
                    } else {
                        console.log('MediaLibrary permission denied');
                    }
                } catch (galleryError: any) {
                    // In Expo Go, MediaLibrary won't work without a dev build
                    if (galleryError?.message?.includes('AUDIO permission')) {
                        console.log('MediaLibrary requires development build. Gallery save skipped.');
                    } else {
                        console.warn('Could not save to gallery:', galleryError);
                    }
                }

                // Also save HTML version for backup
                const htmlFileName = `orden_${formData.ot}_${Date.now()}.html`;
                const htmlFilePath = (FileSystem.documentDirectory || '') + htmlFileName;
                await FileSystem.writeAsStringAsync(htmlFilePath, previewHtml);

                // Accumulate file path for final email
                setGeneratedOrderPaths(prev => [...prev, jpgPath]);

                // Get current partida being processed and its tipo_cierre
                const processingPartida = selectedPartidas[generatingPartidaIndex];
                const processingPartidaData = partidaFormData.get(processingPartida);

                // Store order info in RouteContext for this partida
                const now = new Date();
                setGeneratedOrder(
                    cita as string,
                    ot as string,
                    processingPartida,
                    {
                        filePath: jpgPath,
                        generatedAt: now,
                        tipoCierre: processingPartidaData?.tipo_cierre || '',
                        latitude: technicianLocation?.latitude,
                        longitude: technicianLocation?.longitude
                    }
                );

                // La persistencia local de la gestión se hace una sola vez al
                // finalizar todas las partidas, dentro de registerStockMovementsOutbox.
                // Guardarla acá también la enviaba por /sync/gestiones y
                // duplicaba el historial frente a /sync-operaciones.

                // Check if there are more partidas to process
                if (generatingPartidaIndex < selectedPartidas.length - 1) {
                    // Generate order for next partida
                    const nextIdx = generatingPartidaIndex + 1;
                    setGeneratingPartidaIndex(nextIdx);

                    // Close current preview and generate next
                    setShowPreviewModal(false);
                    setPreviewHtml('');
                    setIsCapturing(false);

                    // Small delay to let state update, then generate next
                    setTimeout(() => {
                        generateOrderForPartida(nextIdx);
                    }, 500);
                    return;
                }

                // All partidas processed. Persistir primero la operación local:
                // al abrir el cliente de correo la app pasa a background/foreground y
                // puede disparar un sync automático que también usa SQLite. Así el
                // outbox queda atómico antes de ceder el control a otra app.
                setShowPreviewModal(false);
                setPreviewHtml('');
                setIsCapturing(false);

                try {
                    const dbServicio = await loadDatabaseService();
                    if (dbServicio) {
                        await dbServicio.registerStockMovementsOutbox({
                            cita: cita as string,
                            ot: ot as string,
                            formData: partidaFormData,
                            selectedPartidas,
                            user,
                            rutaActiva,
                            formDataGlobal: formData,
                            uploadedOrderPhotos,
                            technicianLocation,
                        });
                    }
                } catch (stockError) {
                    console.error('No se pudo persistir la operación de stock local:', stockError);
                    Alert.alert(
                        'Aviso de Stock',
                        'No se pudo guardar la operación de stock localmente. Reintentá cerrar la orden antes de continuar; si persiste, contactá a tu supervisor.',
                        [{ text: 'Entendido' }]
                    );
                    return;
                }

                // Build list of all generated paths (including current one)
                const allPaths = [...generatedOrderPaths, jpgPath];

                // Email/compartir es "best effort": un fallo acá NO debe abortar
                // el registro de movimientos de stock (que corre recién después).
                try {
                    // Check if email is available
                    const isAvailable = await MailComposer.isAvailableAsync();
                    if (isAvailable) {
                        // Compose email with all orders attached
                        const partidasList = selectedPartidas.join(', ');
                        await MailComposer.composeAsync({
                            subject: `Órdenes de Servicio - OT ${formData.ot}`,
                            body: `Adjunto las órdenes de servicio generadas:\n\n` +
                                `• OT: ${formData.ot}\n` +
                                `• Cliente: ${formData.cliente}\n` +
                                `• Partidas: ${partidasList}\n` +
                                `• Cantidad de órdenes: ${allPaths.length}\n\n` +
                                `Generado desde la aplicación de técnicos.`,
                            attachments: allPaths,
                        });
                    } else {
                        // Fallback to individual sharing if email not available
                        Alert.alert(
                            'Email no disponible',
                            'No se puede enviar por email. ¿Desea compartir las órdenes individualmente?',
                            [
                                { text: 'Cancelar', style: 'cancel' },
                                {
                                    text: 'Compartir',
                                    onPress: async () => {
                                        for (const path of allPaths) {
                                            if (await Sharing.isAvailableAsync()) {
                                                await Sharing.shareAsync(path);
                                            }
                                        }
                                    }
                                }
                            ]
                        );
                    }
                } catch (shareError) {
                    console.error('Error compartiendo órdenes (el registro de stock continúa igualmente):', shareError);
                }

                // Clear accumulated paths for next use
                setGeneratedOrderPaths([]);

                // Navigate to detail
                await clearDraft();
                router.replace({
                    pathname: '/detalle' as any,
                    params: { cita, ot }
                });
            } else if (message.type === 'error') {
                console.error('WebView capture error:', message.message);
                Alert.alert('Error', 'Error al capturar la imagen');
                setIsCapturing(false);
            }
        } catch (error) {
            console.error('Error processing WebView message:', error);
            setIsCapturing(false);
        }
    };

    // Close preview and go back
    const closePreview = () => {
        setShowPreviewModal(false);
        setPreviewHtml('');
    };

    const shareFile = async (path: string) => {
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(path);
        }
    };

    // --- RENDER STEPS ---

    const renderStep0 = () => (
        <ScrollView style={styles.stepContent}>
            <Text style={styles.stepTitle}>Seleccionar Partidas</Text>
            <Text style={styles.stepSubtitle}>
                Seleccione las partidas para las que generará ordenes de servicio
            </Text>

            <View style={styles.selectAllRow}>
                <TouchableOpacity style={styles.selectAllButton} onPress={toggleSelectAll}>
                    <Ionicons
                        name={selectedPartidas.length === partidas.length ? "checkbox" : "square-outline"}
                        size={24}
                        color="#3498db"
                    />
                    <Text style={styles.selectAllText}>Seleccionar todo</Text>
                </TouchableOpacity>
            </View>

            {partidas.map((p) => {
                const completed = isServiceCompleted(p.cita, p.ot, p.partida);
                const isSelected = selectedPartidas.includes(p.partida);

                return (
                    <TouchableOpacity
                        key={p.partida}
                        style={[
                            styles.partidaItem,
                            isSelected && styles.partidaItemSelected,
                            completed && !isSelected && { borderColor: '#27ae60', borderWidth: 1 }
                        ]}
                        onPress={() => togglePartida(p.partida)}
                    >
                        <Ionicons
                            name={isSelected ? "checkbox" : "square-outline"}
                            size={24}
                            color={isSelected ? "#3498db" : (completed ? "#27ae60" : "#fff")}
                        />
                        <View style={styles.partidaItemInfo}>
                            <Text style={[styles.partidaItemTitle, completed && !isSelected && { color: '#27ae60', fontSize: 16 * textScale }]}>
                                Partida N° {p.partida}
                            </Text>
                            <Text style={[styles.partidaItemSubtitle, { fontSize: 13 * textScale }]}>
                                Terminal: {p.terminal || 'N/A'} | {p.tipo_incidente || 'Sin tipo'}
                            </Text>
                            {completed && (
                                <Text style={[styles.partidaItemBadge, { backgroundColor: '#27ae60' }]}>
                                    ✓ Ya gestionada (puede re-gestionar)
                                </Text>
                            )}
                        </View>
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

            {/* Bottom spacer for navigation bar */}
            <View style={{ height: insets.bottom + 16 }} />
        </ScrollView>
    );

    const renderStep1 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Paso 1: Datos del Cliente</Text>
            <Text style={styles.stepSubtitle}>Confirme la información del cliente (aplica a todas las partidas)</Text>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Cliente</Text>
                <TextInput
                    style={styles.input}
                    value={formData.cliente}
                    onChangeText={v => setFormData(p => ({ ...p, cliente: v }))}
                    placeholder="Nombre del cliente"
                    placeholderTextColor="#666"
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>CUIT</Text>
                <TextInput
                    style={styles.input}
                    value={formData.cuit}
                    onChangeText={v => setFormData(p => ({ ...p, cuit: v }))}
                    placeholder="00-00000000-0"
                    placeholderTextColor="#666"
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Domicilio</Text>
                <TextInput
                    style={styles.input}
                    value={formData.domicilio}
                    onChangeText={v => setFormData(p => ({ ...p, domicilio: v }))}
                    placeholder="Dirección"
                    placeholderTextColor="#666"
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                    style={styles.input}
                    value={formData.telefono}
                    onChangeText={v => setFormData(p => ({ ...p, telefono: v }))}
                    placeholder="Número de contacto"
                    placeholderTextColor="#666"
                    keyboardType="phone-pad"
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>OT</Text>
                <TextInput
                    style={[styles.input, styles.inputDisabled]}
                    value={formData.ot}
                    editable={false}
                />
            </View>

            {/* Show selected partidas summary */}
            <View style={styles.selectedPartidasSummary}>
                <Text style={styles.label}>Partidas seleccionadas: {selectedPartidas.length}</Text>
                <Text style={styles.partidasSummaryText}>
                    {selectedPartidas.map(p => `#${p}`).join(', ')}
                </Text>
            </View>
        </View>
    );

    const renderStep2 = () => {
        // Get current partida info (for now, use first selected)
        const currentPartida = selectedPartidas[currentPartidaIndex] || selectedPartidas[0];
        const partidaInfo = partidas.find(p => p.partida === currentPartida);

        return (
            <View style={styles.stepContent}>
                {/* Partida indicator */}
                <View style={styles.partidaIndicator}>
                    <Ionicons name="document-text" size={20} color="#3498db" />
                    <Text style={styles.partidaIndicatorText}>
                        Partida N° {currentPartida} {selectedPartidas.length > 1 ? `(${currentPartidaIndex + 1}/${selectedPartidas.length})` : ''}
                    </Text>
                </View>

                <Text style={[styles.stepTitle, { fontSize: 18 * textScale }]}>Paso 2: Informe Técnico</Text>
                <Text style={styles.stepSubtitle}>Registre el resultado del servicio</Text>

                {/* Terminal (readonly) */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Terminal</Text>
                    <TextInput
                        style={[styles.input, styles.inputDisabled]}
                        value={partidaInfo?.terminal || 'N/A'}
                        editable={false}
                    />
                </View>

                {/* Tipo de Incidente (readonly) */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Tipo de Incidente</Text>
                    <TextInput
                        style={[styles.input, styles.inputDisabled]}
                        value={partidaInfo?.tipo_incidente || 'N/A'}
                        editable={false}
                    />
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Tipo de Cierre</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer}>
                        {closureTypes.slice(0, 10).map(ct => (
                            <TouchableOpacity
                                key={ct.id}
                                style={[styles.chip, formData.tipo_cierre === ct.subestado && styles.chipSelected]}
                                onPress={() => setFormData(p => ({ ...p, tipo_cierre: ct.subestado }))}
                            >
                                <Text style={[styles.chipText, formData.tipo_cierre === ct.subestado && styles.chipTextSelected]}>
                                    {ct.subestado}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Detalle del Trabajo Realizado</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        value={formData.detalle_trabajo}
                        onChangeText={v => setFormData(p => ({ ...p, detalle_trabajo: v }))}
                        placeholder="Describa el trabajo realizado..."
                        placeholderTextColor="#666"
                        multiline
                        numberOfLines={4}
                    />
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Observaciones Adicionales</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        value={formData.observaciones}
                        onChangeText={v => setFormData(p => ({ ...p, observaciones: v }))}
                        placeholder="Observaciones opcionales..."
                        placeholderTextColor="#666"
                        multiline
                        numberOfLines={3}
                    />
                </View>
            </View>
        );
    };

    // Condition options
    const conditionOptions = ['BUENO', 'CONTROL', 'BLOQUEADO'];

    const getConditionColor = (condicion: string) => {
        switch (condicion) {
            case 'BUENO': return '#27ae60';
            case 'CONTROL': return '#f39c12';
            case 'BLOQUEADO': return '#c0392b';
            default: return '#7f8c8d';
        }
    };

    const [showMaterialPicker, setShowMaterialPicker] = useState(false);
    const [currentMaterialType, setCurrentMaterialType] = useState<'retirado' | 'entregado'>('retirado');
    const [currentMaterialId, setCurrentMaterialId] = useState<string>('');
    const [materialSearchQuery, setMaterialSearchQuery] = useState('');

    // Mi Stock Modal State
    const [showMiStockModal, setShowMiStockModal] = useState(false);
    const [miStockItems, setMiStockItems] = useState<any[]>([]);
    const [miStockSearch, setMiStockSearch] = useState('');

    const openMaterialPicker = (type: 'retirado' | 'entregado', itemId: string) => {
        setCurrentMaterialType(type);
        setCurrentMaterialId(itemId);
        setMaterialSearchQuery('');
        setShowMaterialPicker(true);
    };

    const openMiStockModal = async (type: 'retirado' | 'entregado') => {
        setCurrentMaterialType(type);
        setMiStockSearch('');

        try {
            const db = await loadDatabaseService();
            if (db) {
                const stock = await db.getStockLocal();
                // Filter by BUENO for entregado (installation)?
                // For now show all, maybe sort BUENO first?
                // The requirement is "Only show BUENO stock" for installation.
                let filteredStock = stock;
                if (type === 'entregado') {
                    filteredStock = stock.filter((s: any) => s.condicion === 'BUENO');
                }
                setMiStockItems(filteredStock);
                setShowMiStockModal(true);
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo cargar el stock');
        }
    };

    const selectMiStockItem = (item: any) => {
        // Add new item with selected stock data
        const newItem: MaterialItem = {
            id: Date.now().toString(),
            material: item.codigo_material,
            nombre_material: item.nombre_material,
            serie_o_cantidad: item.serie || '',
            condicion: item.condicion || 'BUENO',
            unidad_medida: item.unidad_medida,
            foto_serie: undefined
        };

        if (currentMaterialType === 'retirado') {
            setFormData(prev => ({ ...prev, material_retirado: [newItem, ...prev.material_retirado] }));
        } else {
            setFormData(prev => ({ ...prev, material_entregado: [newItem, ...prev.material_entregado] }));
        }

        setShowMiStockModal(false);
    };

    const selectMaterial = async (mat: { codigo_material: string; nombre: string; unidad_medida: string }, target = { type: currentMaterialType, id: currentMaterialId }) => {
        updateMaterialItem(target.type, target.id, 'material', mat.codigo_material);
        updateMaterialItem(target.type, target.id, 'nombre_material', mat.nombre);
        // Set the material's unidad_medida to determine if serializado or unidad
        updateMaterialItem(target.type, target.id, 'unidad_medida', mat.unidad_medida || 'UNIDAD');
        updateMaterialItem(target.type, target.id, 'error', ''); // Clear any previous error
        setShowMaterialPicker(false);

        // If there's already a serie/cantidad, validate stock immediately
        const items = target.type === 'retirado' ? formData.material_retirado : formData.material_entregado;
        const item = items.find(i => i.id === target.id);
        if (item?.serie_o_cantidad && target.type === 'entregado') {
            await validateMaterialStock(target.type, target.id, mat.codigo_material, mat.unidad_medida, item.serie_o_cantidad, item.condicion);
        }
    };

    const renderMaterialSection = (type: 'retirado' | 'entregado', items: MaterialItem[]) => (
        <View style={styles.materialSection}>
            <View style={styles.materialHeader}>
                <Text style={[styles.materialTitle, { fontSize: 16 * textScale }]}>Material {type === 'retirado' ? 'Retirado' : 'Entregado'}</Text>
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
            {items.map(item => (
                <View key={item.id} style={styles.materialCard}>
                    {/* Material Selector */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                            style={[{ flex: 1 }, styles.materialPickerButton, item.error && styles.materialPickerButtonError]}
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

                    {/* Serie/Cantidad Input */}
                    <View style={styles.materialRowInner}>
                        <View style={styles.materialRowInner}>
                            <Text style={styles.miniLabel}>Serie / Cantidad</Text>
                            {/* For RETIRO: disable until material is selected */}
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
                                            // For RETIRADO + SERIALIZADO: disable until scan/photo first
                                            // For ENTREGADO: always enabled
                                            (type === 'retirado' && item.unidad_medida === 'SERIALIZADO' && !item.serie_o_cantidad && !item.foto_serie) && styles.disabledInput
                                        ]}
                                        value={item.serie_o_cantidad}
                                        onChangeText={v => updateMaterialItem(type, item.id, 'serie_o_cantidad', v)}
                                        onBlur={() => lookupSerialInStock(type, item.id, item.serie_o_cantidad)}
                                        placeholder={item.unidad_medida === 'SERIALIZADO' ? (type === 'retirado' ? 'Escanear serie' : 'Ingrese serie') : 'Ingrese cantidad'}
                                        placeholderTextColor="#666"
                                        editable={
                                            type === 'entregado' || // Entregado: always editable
                                            item.unidad_medida !== 'SERIALIZADO' || // Not serialized: always editable
                                            !!item.serie_o_cantidad || // Has value: editable
                                            !!item.foto_serie // Has photo: editable
                                        }
                                    />
                                    <TouchableOpacity
                                        style={[
                                            styles.scanButton,
                                            // For RETIRADO: disable scanner if not SERIALIZADO
                                            // For ENTREGADO: always enable scanner
                                            (type === 'retirado' && item.unidad_medida !== 'SERIALIZADO') && styles.disabledScanButton
                                        ]}
                                        onPress={() => {
                                            // For ENTREGADO: always allow scanning
                                            // For RETIRADO: only if SERIALIZADO
                                            if (type === 'entregado' || item.unidad_medida === 'SERIALIZADO') {
                                                openScanner(type, item.id);
                                            }
                                        }}
                                        disabled={type === 'retirado' && item.unidad_medida !== 'SERIALIZADO'}
                                    >
                                        <Ionicons name="barcode-outline" size={24} color={(type === 'entregado' || item.unidad_medida === 'SERIALIZADO') ? "#fff" : "#999"} />
                                    </TouchableOpacity>
                                    {item.foto_serie && (
                                        <View style={styles.photoIndicator}>
                                            <Ionicons name="checkmark-circle" size={20} color="#27ae60" />
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Condición Selector */}
                    <View style={styles.materialRowInner}>
                        <Text style={[styles.miniLabel, { fontSize: 12 * textScale }]}>Condición</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {conditionOptions.map(cond => {
                                // For ENTREGADO: Only allow BUENO (or simplify UI)
                                if (type === 'entregado' && cond !== 'BUENO') return null;

                                return (
                                    <TouchableOpacity
                                        key={cond}
                                        style={[styles.estadoChip, item.condicion === cond && {
                                            backgroundColor: getConditionColor(cond),
                                            borderColor: getConditionColor(cond)
                                        }]}
                                        onPress={() => {
                                            // For ENTREGADO, prevent changing (though we hid others, prevent logic too)
                                            if (type !== 'entregado') {
                                                updateMaterialItem(type, item.id, 'condicion', cond);
                                            }
                                        }}
                                        disabled={type === 'entregado'}
                                    >
                                        <Text style={[styles.estadoChipText, item.condicion === cond && { color: 'white' }]}>
                                            {cond}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* Delete Button */}
                    <TouchableOpacity
                        style={styles.deleteMaterialButton}
                        onPress={() => removeMaterialItem(type, item.id)}
                    >
                        <Ionicons name="trash-outline" size={18} color="#e74c3c" />
                        <Text style={{ color: '#e74c3c', marginLeft: 4 }}>Eliminar</Text>
                    </TouchableOpacity>

                    {/* Error Message Display */}
                    {item.error && (
                        <View style={styles.materialErrorContainer}>
                            <Ionicons name="warning" size={16} color="#e74c3c" />
                            <Text style={styles.materialErrorText}>{item.error}</Text>
                        </View>
                    )}
                </View>
            ))}
            {items.length === 0 && (
                <TouchableOpacity style={styles.emptyAddButton} onPress={() => addMaterialItem(type)}>
                    <Ionicons name="add-circle-outline" size={32} color="#666" />
                    <Text style={styles.emptyText}>Toque aquí para agregar material</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    const renderMaterialPickerModal = () => (
        <Modal visible={showMaterialPicker} animationType="slide" transparent>
            <View style={styles.pickerModalOverlay}>
                <View style={[styles.pickerModalContent, { paddingBottom: insets.bottom }]}>
                    <View style={styles.pickerModalHeader}>
                        <Text style={styles.pickerModalTitle}>Seleccionar Material</Text>
                        <TouchableOpacity onPress={() => setShowMaterialPicker(false)}>
                            <Ionicons name="close" size={24} color="#333" />
                        </TouchableOpacity>
                    </View>
                    <View style={{ padding: 10 }}>
                        <TextInput
                            style={[styles.input, { backgroundColor: '#f0f0f0', color: '#333' }]}
                            placeholder="Buscar material..."
                            placeholderTextColor="#888"
                            value={materialSearchQuery}
                            onChangeText={setMaterialSearchQuery}
                            autoFocus
                        />
                    </View>
                    <ScrollView style={styles.pickerModalList} contentContainerStyle={{ flexGrow: 1 }}>
                        {materials.filter(m =>
                            m.nombre?.toLowerCase().includes(materialSearchQuery.toLowerCase()) ||
                            m.codigo_material?.toLowerCase().includes(materialSearchQuery.toLowerCase())
                        ).length === 0 ? (
                            <Text style={styles.pickerNoData}>No se encontraron materiales.</Text>
                        ) : (
                            materials.filter(m =>
                                m.nombre?.toLowerCase().includes(materialSearchQuery.toLowerCase()) ||
                                m.codigo_material?.toLowerCase().includes(materialSearchQuery.toLowerCase())
                            ).map(mat => (
                                <TouchableOpacity
                                    key={mat.id}
                                    style={styles.pickerModalItem}
                                    onPress={() => selectMaterial({ codigo_material: mat.codigo_material, nombre: mat.nombre, unidad_medida: mat.unidad_medida })}
                                >
                                    <Text style={styles.pickerModalItemText}>{mat.nombre}</Text>
                                    <Text style={styles.pickerModalItemSubtext}>{mat.codigo_material} • {mat.unidad_medida === 'SERIALIZADO' ? 'Serial' : 'Unidad'}</Text>
                                </TouchableOpacity>
                            ))
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );

    const renderMiStockModal = () => (
        <Modal visible={showMiStockModal} animationType="slide" transparent>
            <View style={styles.pickerModalOverlay}>
                <View style={[styles.pickerModalContent, { paddingBottom: insets.bottom }]}>
                    <View style={styles.pickerModalHeader}>
                        <Text style={styles.pickerModalTitle}>Seleccionar de Mi Stock</Text>
                        <TouchableOpacity onPress={() => setShowMiStockModal(false)}>
                            <Ionicons name="close" size={24} color="#333" />
                        </TouchableOpacity>
                    </View>
                    <View style={{ padding: 10 }}>
                        <TextInput
                            style={[styles.input, { backgroundColor: '#f0f0f0', color: '#333' }]}
                            placeholder="Buscar en mi stock..."
                            placeholderTextColor="#888"
                            value={miStockSearch}
                            onChangeText={setMiStockSearch}
                        />
                    </View>
                    <ScrollView style={styles.pickerModalList} contentContainerStyle={{ flexGrow: 1 }}>
                        {miStockItems.filter(m =>
                            m.nombre_material?.toLowerCase().includes(miStockSearch.toLowerCase()) ||
                            m.codigo_material?.toLowerCase().includes(miStockSearch.toLowerCase()) ||
                            (m.serie && m.serie.toLowerCase().includes(miStockSearch.toLowerCase()))
                        ).length === 0 ? (
                            <Text style={styles.pickerNoData}>No hay stock disponible con ese criterio.</Text>
                        ) : (
                            miStockItems.filter(m =>
                                m.nombre_material?.toLowerCase().includes(miStockSearch.toLowerCase()) ||
                                m.codigo_material?.toLowerCase().includes(miStockSearch.toLowerCase()) ||
                                (m.serie && m.serie.toLowerCase().includes(miStockSearch.toLowerCase()))
                            ).map((item, index) => (
                                <TouchableOpacity
                                    key={`${item.codigo_material}-${item.serie}-${index}`}
                                    style={styles.pickerModalItem}
                                    onPress={() => selectMiStockItem(item)}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.pickerModalItemText}>{item.nombre_material}</Text>
                                        <Text style={[styles.pickerModalItemSubtext, { fontSize: 14, fontWeight: '600' }]}>
                                            {item.codigo_material} • {item.serie ? `Serie: ${item.serie}` : `Cant: ${item.cantidad}`}
                                        </Text>
                                    </View>
                                    <View style={{
                                        backgroundColor: getConditionColor(item.condicion || 'BUENO'),
                                        paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 8
                                    }}>
                                        <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                                            {item.condicion || 'BUENO'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );

    const renderStep3 = () => {
        const currentPartida = selectedPartidas[currentPartidaIndex] || selectedPartidas[0];

        return (
            <View style={styles.stepContent}>
                {/* Partida indicator */}
                <View style={styles.partidaIndicator}>
                    <Ionicons name="document-text" size={20} color="#3498db" />
                    <Text style={styles.partidaIndicatorText}>
                        Partida N° {currentPartida} {selectedPartidas.length > 1 ? `(${currentPartidaIndex + 1}/${selectedPartidas.length})` : ''}
                    </Text>
                </View>

                <Text style={[styles.stepTitle, { fontSize: 18 * textScale }]}>Paso 3: Materiales</Text>
                <Text style={[styles.stepSubtitle, { fontSize: 14 * textScale }]}>Registre los materiales retirados y entregados</Text>

                {/* Plantilla selector */}
                {(() => {
                    const currentPartidaInfo = partidas.find(p => p.partida === currentPartida)
                        || partidas.find(p => String(p.partida) === String(currentPartida));
                    const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
                    if (plantillasMaterial.length > 0) {
                        console.log(`[Ejecucion] Filtro plantillas: total=${plantillasMaterial.length} | partida=${currentPartida} ti="${currentPartidaInfo?.tipo_incidente}" tc="${formData.tipo_cierre}" prod="${currentPartidaInfo?.producto}"`);
                        plantillasMaterial.forEach((p: any) => {
                            const failTi = p.tipo_incidente && norm(p.tipo_incidente) !== norm(currentPartidaInfo?.tipo_incidente);
                            const failTc = p.tipo_cierre && norm(p.tipo_cierre) !== norm(formData.tipo_cierre);
                            const failProd = p.producto && norm(p.producto) !== norm(currentPartidaInfo?.producto);
                            console.log(`  plantilla id=${p.id} "${p.nombre}" ti="${p.tipo_incidente}" tc="${p.tipo_cierre}" prod="${p.producto}" => ${failTi ? 'FALLA_TI' : failTc ? 'FALLA_TC' : failProd ? 'FALLA_PROD' : 'PASA'}`);
                        });
                    }
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
                {renderMaterialPickerModal()}
                {renderMiStockModal()}

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
                                    {/* Scan overlay with frame and line */}
                                    <View pointerEvents="none" style={styles.scanOverlay}>
                                        <View style={styles.scanOverlayTop} />
                                        <View style={styles.scanOverlayMiddle}>
                                            <View style={styles.scanOverlaySide} />
                                            <View style={styles.scanFrame}>
                                                {/* Corner markers */}
                                                <View style={[styles.cornerMarker, styles.cornerTopLeft]} />
                                                <View style={[styles.cornerMarker, styles.cornerTopRight]} />
                                                <View style={[styles.cornerMarker, styles.cornerBottomLeft]} />
                                                <View style={[styles.cornerMarker, styles.cornerBottomRight]} />
                                                {/* Scan line */}
                                                <View style={styles.scanLine} />
                                            </View>
                                            <View style={styles.scanOverlaySide} />
                                        </View>
                                        <View style={styles.scanOverlayBottom}>
                                            <Text style={styles.scanOverlayText}>Alinee el código de barras dentro del recuadro</Text>
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
            </View >
        );
    };


    const renderStep4 = () => (
        <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { fontSize: 18 * textScale }]}>Paso 4: Firmas</Text>
            <Text style={[styles.stepSubtitle, { fontSize: 14 * textScale }]}>Capture las firmas de conformidad</Text>

            <View style={styles.signatureSection}>
                <Text style={[styles.label, { fontSize: 14 * textScale }]}>Firma del Técnico</Text>
                {formData.tecnico_firma ? (
                    <View style={styles.signaturePreview}>
                        <Text style={styles.signatureOk}>✓ Firma cargada desde perfil</Text>
                    </View>
                ) : (
                    <Text style={styles.signatureWarning}>⚠ Configure su firma en Perfil</Text>
                )}
            </View>

            <View style={styles.signatureSection}>
                <Text style={[styles.label, { fontSize: 14 * textScale }]}>Nombre de Quien Recibe</Text>
                <TextInput
                    style={[styles.input, { fontSize: 16 * textScale }]}
                    value={formData.cliente_nombre}
                    onChangeText={v => setFormData(p => ({ ...p, cliente_nombre: v }))}
                    placeholder="Nombre completo"
                    placeholderTextColor="#666"
                />
            </View>

            <View style={styles.signatureSection}>
                <Text style={styles.label}>DNI</Text>
                <TextInput
                    style={styles.input}
                    value={formData.cliente_dni}
                    onChangeText={v => setFormData(p => ({ ...p, cliente_dni: v }))}
                    placeholder="Número de documento"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                />
            </View>

            <View style={styles.signatureSection}>
                <Text style={[styles.label, { fontSize: 14 * textScale }]}>Firma del Cliente</Text>
                {formData.cliente_firma ? (
                    <View style={styles.signaturePreview}>
                        <Text style={styles.signatureOk}>✓ Firma capturada</Text>
                        <TouchableOpacity onPress={() => setShowSignatureModal(true)}>
                            <Text style={styles.changeSignature}>Cambiar firma</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.signatureButton} onPress={() => setShowSignatureModal(true)}>
                        <Ionicons name="create" size={24} color="#fff" />
                        <Text style={styles.signatureButtonText}>CAPTURAR FIRMA</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3498db" />
                <Text style={styles.loadingText}>Cargando datos...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <Stack.Screen options={{ title: currentStep === 0 ? 'Seleccionar Partidas' : 'Ejecutar Orden', headerShown: true }} />

            {/* Progress Indicator (only show for steps 1-4) */}
            {currentStep > 0 && (
                <View style={styles.progressBar}>
                    {[1, 2, 3, 4].map(step => (
                        <View key={step} style={[styles.progressStep, currentStep >= step && styles.progressStepActive]}>
                            <Text style={[styles.progressText, currentStep >= step && styles.progressTextActive]}>{step}</Text>
                        </View>
                    ))}
                </View>
            )}

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
            >
                <ScrollView
                    style={styles.scrollView}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
                >
                    {currentStep === 0 && renderStep0()}
                    {currentStep === 1 && renderStep1()}
                    {currentStep === 2 && renderStep2()}
                    {currentStep === 3 && renderStep3()}
                    {currentStep === 4 && renderStep4()}
                </ScrollView>

                {/* Navigation Buttons - inside KeyboardAvoidingView to respond to keyboard */}
                {currentStep > 0 && (
                    <View style={[styles.navButtons, { paddingBottom: insets.bottom + 16 }]}>
                        {currentStep > 1 && (
                            <TouchableOpacity
                                style={[styles.navButtonSecondary, currentStep === 4 && { flex: 0.6 }]}
                                onPress={handleBack}
                            >
                                <Ionicons name="arrow-back" size={20} color="#fff" />
                                <Text style={styles.navButtonText}>Anterior</Text>
                            </TouchableOpacity>
                        )}
                        {currentStep === 1 && partidas.length > 1 && (
                            <TouchableOpacity style={styles.navButtonSecondary} onPress={() => setCurrentStep(0)}>
                                <Ionicons name="arrow-back" size={20} color="#fff" />
                                <Text style={styles.navButtonText}>Partidas</Text>
                            </TouchableOpacity>
                        )}
                        {currentStep < 4 ? (
                            <TouchableOpacity style={styles.navButtonPrimary} onPress={handleNext}>
                                <Text style={styles.navButtonText}>Siguiente</Text>
                                <Ionicons name="arrow-forward" size={20} color="#fff" />
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.orderButtonsContainer}>
                                <TouchableOpacity
                                    style={[styles.navButtonPrimary, styles.generateButton]}
                                    onPress={generateOrder}
                                    disabled={isGenerating || !formData.cliente_firma}
                                >
                                    {isGenerating ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <Ionicons name="document-text" size={18} color="#fff" />
                                            <Text style={styles.orderButtonText}>GENERAR</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.navButtonPrimary, styles.uploadButton]}
                                    onPress={startUploadOrderFlow}
                                    disabled={isUploadingOrder}
                                >
                                    {isUploadingOrder ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <Ionicons name="camera" size={18} color="#fff" />
                                            <Text style={styles.orderButtonText}>CARGAR</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}
            </KeyboardAvoidingView>



            {/* Order Preview Modal */}
            <Modal visible={showPreviewModal} animationType="slide">
                <View style={styles.previewModalContainer}>
                    <View style={styles.previewHeader}>
                        <Text style={styles.previewTitle}>Vista Previa de Orden</Text>
                        <TouchableOpacity onPress={closePreview}>
                            <Text style={styles.modalCancel}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.previewContent}>
                        <WebView
                            source={{ html: previewHtml }}
                            style={styles.previewWebView}
                            scrollEnabled={true}
                            showsVerticalScrollIndicator={true}
                            onMessage={handleWebViewMessage}
                            javaScriptEnabled={true}
                            originWhitelist={['*']}
                        />
                    </View>

                    <View style={[styles.previewFooter, { paddingBottom: Math.max(16, insets.bottom + 16) }]}>
                        <TouchableOpacity
                            style={styles.previewButtonSecondary}
                            onPress={closePreview}
                            disabled={isCapturing}
                        >
                            <Ionicons name="arrow-back" size={20} color="#333" />
                            <Text style={styles.previewButtonTextSec}>Volver</Text>
                        </TouchableOpacity>
                        <View style={styles.captureHint}>
                            {isCapturing ? (
                                <>
                                    <ActivityIndicator color="#27ae60" />
                                    <Text style={styles.captureHintText}>Guardando imagen...</Text>
                                </>
                            ) : (
                                <Text style={styles.captureHintText}>👆 Use el botón verde en la orden para capturar</Text>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* CARGAR ORDEN Photo Capture Modal */}
            <Modal visible={showOrderPhotoModal} animationType="slide">
                <View style={styles.orderPhotoModalContainer}>
                    <View style={styles.orderPhotoModalHeader}>
                        <View>
                            <Text style={styles.orderPhotoModalTitle}>Cargar Foto de Orden</Text>
                            <Text style={styles.orderPhotoModalSubtitle}>
                                Partida N° {capturingPhotoForPartida}
                                {selectedPartidas.length > 1 && ` (${selectedPartidas.indexOf(capturingPhotoForPartida || 0) + 1}/${selectedPartidas.length})`}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={closeOrderPhotoModal}>
                            <Ionicons name="close" size={28} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.orderPhotoContent}>
                        {capturingPhotoForPartida && uploadedOrderPhotos.get(capturingPhotoForPartida) ? (
                            <Image
                                source={{ uri: uploadedOrderPhotos.get(capturingPhotoForPartida) }}
                                style={styles.orderPhotoPreview}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={styles.orderPhotoPlaceholder}>
                                <Ionicons name="document-attach-outline" size={64} color="#444" />
                                <Text style={styles.orderPhotoPlaceholderText}>Sin foto cargada</Text>
                            </View>
                        )}

                        <View style={styles.orderPhotoButtons}>
                            <TouchableOpacity
                                style={styles.orderPhotoCameraButton}
                                onPress={() => pickOrderPhoto('camera')}
                            >
                                <Ionicons name="camera" size={24} color="#fff" />
                                <Text style={styles.orderPhotoButtonText}>Cámara</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.orderPhotoGalleryButton}
                                onPress={() => pickOrderPhoto('gallery')}
                            >
                                <Ionicons name="images" size={24} color="#fff" />
                                <Text style={styles.orderPhotoButtonText}>Galería</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.orderPhotoFooter}>
                        <Text style={styles.orderPhotoProgressText}>
                            {uploadedOrderPhotos.size} de {selectedPartidas.length} foto(s) cargada(s)
                        </Text>

                        {capturingPhotoForPartida !== null &&
                            selectedPartidas.indexOf(capturingPhotoForPartida) < selectedPartidas.length - 1 ? (
                            <TouchableOpacity
                                style={[
                                    styles.orderPhotoNextButton,
                                    !uploadedOrderPhotos.get(capturingPhotoForPartida) && styles.orderPhotoNextButtonDisabled
                                ]}
                                onPress={nextPartidaPhoto}
                                disabled={!uploadedOrderPhotos.get(capturingPhotoForPartida)}
                            >
                                <Text style={styles.orderPhotoNextButtonText}>Siguiente Partida</Text>
                                <Ionicons name="arrow-forward" size={20} color="#fff" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[
                                    styles.orderPhotoFinishButton,
                                    uploadedOrderPhotos.size < selectedPartidas.length && styles.orderPhotoNextButtonDisabled
                                ]}
                                onPress={finishUploadOrderFlow}
                                disabled={uploadedOrderPhotos.size < selectedPartidas.length}
                            >
                                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                                <Text style={styles.orderPhotoNextButtonText}>Finalizar Carga</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Signature Modal */}
            <Modal visible={showSignatureModal} animationType="slide">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Firma del Cliente</Text>
                        <TouchableOpacity onPress={() => setShowSignatureModal(false)}>
                            <Text style={styles.modalCancel}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                    <SignatureScreen
                        ref={signatureRef}
                        onOK={handleClientSignatureOK}
                        onEmpty={() => Alert.alert('Error', 'Por favor dibuje la firma')}
                        webStyle={`.m-signature-pad--footer { display: none; }`}
                    />
                    <View style={[styles.modalFooter, { paddingBottom: Math.max(16, insets.bottom + 16) }]}>
                        <TouchableOpacity style={styles.modalButtonSecondary} onPress={() => signatureRef.current?.clearSignature()}>
                            <Text style={styles.modalButtonTextSec}>Borrar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modalButtonPrimary} onPress={() => signatureRef.current?.readSignature()}>
                            <Text style={styles.modalButtonTextPri}>Guardar Firma</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
    loadingText: { color: '#fff', marginTop: 10 },
    scrollView: { flex: 1 },
    progressBar: { flexDirection: 'row', justifyContent: 'center', padding: 16, gap: 8 },
    progressStep: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
    progressStepActive: { backgroundColor: '#3498db' },
    progressText: { color: '#666', fontWeight: 'bold' },
    progressTextActive: { color: '#fff' },
    stepContent: { padding: 16 },
    stepTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
    stepSubtitle: { fontSize: 14, color: '#888', marginBottom: 20 },
    formGroup: { marginBottom: 16 },
    label: { color: '#aaa', marginBottom: 6, fontSize: 14 },
    input: { backgroundColor: '#1e1e1e', borderRadius: 8, padding: 12, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#333' },
    inputDisabled: { backgroundColor: '#252525', color: '#888' },
    textArea: { height: 100, textAlignVertical: 'top' },
    chipContainer: { flexDirection: 'row', marginBottom: 8 },
    chip: { backgroundColor: '#333', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
    chipSelected: { backgroundColor: '#3498db' },
    chipText: { color: '#aaa' },
    chipTextSelected: { color: '#fff', fontWeight: 'bold' },
    materialSection: { marginBottom: 24, backgroundColor: '#1e1e1e', padding: 12, borderRadius: 12 },
    materialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    materialTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    addButton: { padding: 4 },
    materialRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    materialInput: { flex: 2 },
    materialInputSmall: { flex: 1 },
    emptyText: { color: '#666', fontStyle: 'italic', textAlign: 'center', padding: 16 },
    signatureSection: { marginBottom: 24 },
    signaturePreview: { backgroundColor: '#1e1e1e', padding: 16, borderRadius: 12, alignItems: 'center' },
    signatureOk: { color: '#2ecc71', fontSize: 16 },
    signatureWarning: { color: '#f39c12', fontSize: 14, padding: 16, backgroundColor: '#1e1e1e', borderRadius: 8 },
    changeSignature: { color: '#3498db', marginTop: 8 },
    signatureButton: { backgroundColor: '#3498db', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, gap: 8 },
    signatureButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    navButtons: { flexDirection: 'row', padding: 16, gap: 12 },
    navButtonPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#3498db', padding: 16, borderRadius: 12, gap: 8 },
    navButtonSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#333', padding: 16, borderRadius: 12, gap: 8 },
    navButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    generateButton: { backgroundColor: '#2ecc71' },
    modalContainer: { flex: 1, backgroundColor: '#fff' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    modalCancel: { color: '#e74c3c', fontSize: 16 },
    modalFooter: { flexDirection: 'row', padding: 16, gap: 12 },  // paddingBottom applied dynamically via insets
    modalButtonPrimary: { flex: 1, backgroundColor: '#3498db', padding: 14, borderRadius: 8, alignItems: 'center' },
    modalButtonSecondary: { flex: 1, backgroundColor: '#ecf0f1', padding: 14, borderRadius: 8, alignItems: 'center' },
    modalButtonTextPri: { color: '#fff', fontWeight: 'bold' },
    modalButtonTextSec: { color: '#333', fontWeight: 'bold' },
    // Material Picker Styles
    materialCard: { backgroundColor: '#252525', borderRadius: 12, padding: 12, marginBottom: 12 },
    materialPickerButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#333', padding: 12, borderRadius: 8, marginBottom: 8 },
    materialPickerButtonError: { borderWidth: 2, borderColor: '#e74c3c' },
    materialPickerText: { color: '#fff', fontSize: 16 },
    materialPickerPlaceholder: { color: '#888', fontSize: 16 },
    materialRowInner: { marginBottom: 8 },
    miniLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
    estadoChip: { backgroundColor: '#333', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8 },
    estadoChipSelected: { backgroundColor: '#2ecc71' },
    estadoChipText: { color: '#aaa', fontSize: 14 },
    estadoChipTextSelected: { color: '#fff', fontWeight: 'bold' },
    deleteMaterialButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, padding: 8 },
    materialErrorContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(231, 76, 60, 0.15)', padding: 10, borderRadius: 8, marginTop: 8, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
    materialErrorText: { color: '#e74c3c', fontSize: 13, flex: 1, marginLeft: 8 },
    emptyAddButton: { alignItems: 'center', padding: 20, borderWidth: 1, borderColor: '#333', borderStyle: 'dashed', borderRadius: 12 },
    pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    pickerModalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '70%' },
    pickerModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
    pickerModalTitle: { fontSize: 18, fontWeight: 'bold' },
    pickerModalList: { flex: 1, padding: 8 },
    pickerNoData: { padding: 20, textAlign: 'center', color: '#888' },
    pickerModalItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
    pickerModalItemText: { fontSize: 16, fontWeight: '600', color: '#333' },
    pickerModalItemSubtext: { fontSize: 12, color: '#888', marginTop: 2 },
    // Order Preview Modal Styles
    previewModalContainer: { flex: 1, backgroundColor: '#fff' },
    previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#f8f8f8' },
    previewTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    previewContent: { flex: 1, backgroundColor: '#fff' },
    previewWebViewWrapper: { flex: 1, backgroundColor: '#fff' },
    previewWebView: { flex: 1 },
    previewFooter: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#f8f8f8' },  // paddingBottom applied dynamically via insets
    previewButtonPrimary: { flex: 2, flexDirection: 'row', backgroundColor: '#27ae60', padding: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 8 },
    previewButtonSecondary: { flex: 1, flexDirection: 'row', backgroundColor: '#ecf0f1', padding: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 8 },
    previewButtonTextPri: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    previewButtonTextSec: { color: '#333', fontWeight: 'bold', fontSize: 14 },
    captureHint: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    captureHintText: { color: '#27ae60', fontSize: 14, fontWeight: '500' },
    // Serie input with scan button
    serieInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    serieInput: { flex: 1 },
    scanButton: { backgroundColor: '#3498db', padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    photoIndicator: { marginLeft: 4 },
    // Disabled input styles (for RETIRO without material selected)
    disabledInput: { backgroundColor: '#2a2a2a', justifyContent: 'center' },
    disabledInputText: { color: '#666', fontSize: 14, fontStyle: 'italic' },
    disabledScanButton: { backgroundColor: '#444' },
    // Scanner modal styles
    scannerContainer: { flex: 1, backgroundColor: '#000' },
    scannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 50, backgroundColor: 'rgba(0,0,0,0.7)' },
    scannerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    scanner: { flex: 1 },
    scannerPermission: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' },
    scannerPermissionText: { color: '#888', fontSize: 16, marginTop: 16, marginBottom: 24 },
    permissionButton: { backgroundColor: '#3498db', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
    permissionButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    scannerFooter: { padding: 20, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center' },  // paddingBottom applied dynamically via insets
    scannerHint: { color: '#ccc', fontSize: 14, marginBottom: 16 },
    manualCaptureButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#e67e22', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
    manualCaptureText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    // Scan overlay styles
    scannerCameraContainer: { flex: 1, position: 'relative' },
    scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    scanOverlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    scanOverlayMiddle: { flexDirection: 'row', height: 200 },
    scanOverlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    scanFrame: { width: 280, height: 200, position: 'relative', justifyContent: 'center', alignItems: 'center' },
    scanOverlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', paddingTop: 20 },
    scanOverlayText: { color: '#fff', fontSize: 14, textAlign: 'center' },
    // Corner markers
    cornerMarker: { position: 'absolute', width: 30, height: 30, borderColor: '#27ae60', borderWidth: 4 },
    cornerTopLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    cornerTopRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
    cornerBottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
    cornerBottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
    // Scan line
    scanLine: { width: '90%', height: 3, backgroundColor: '#e74c3c', borderRadius: 2, shadowColor: '#e74c3c', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4 },
    // Step 0: Partida selection styles
    selectAllRow: { marginBottom: 16 },
    selectAllButton: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#1e1e1e', borderRadius: 8 },
    selectAllText: { color: '#3498db', fontSize: 16, marginLeft: 12 },
    partidaItem: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 10, backgroundColor: '#1e1e1e', borderRadius: 10, borderWidth: 1, borderColor: '#333' },
    partidaItemSelected: { borderColor: '#3498db', backgroundColor: '#1a2a3a' },
    partidaItemDisabled: { opacity: 0.5 },
    partidaItemInfo: { marginLeft: 12, flex: 1 },
    partidaItemTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    partidaItemSubtitle: { color: '#888', fontSize: 12, marginTop: 4 },
    partidaItemBadge: { color: '#f39c12', fontSize: 11, marginTop: 4, fontWeight: 'bold' },
    continueButton: { backgroundColor: '#3498db', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 10, marginTop: 20 },
    continueButtonDisabled: { backgroundColor: '#666' },
    continueButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginRight: 8 },
    // Step 1: Partidas summary
    selectedPartidasSummary: { marginTop: 16, padding: 12, backgroundColor: '#1a2a3a', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#3498db' },
    partidasSummaryText: { color: '#3498db', fontSize: 14, marginTop: 4 },
    // Partida indicator for steps 2 and 3
    partidaIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a2a3a', padding: 12, borderRadius: 8, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#3498db' },
    partidaIndicatorText: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginLeft: 8 },
    // CARGAR ORDEN styles
    orderButtonsContainer: { flexDirection: 'row', gap: 10, flex: 1 },
    orderButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    uploadButton: { backgroundColor: '#3498db' },
    // Photo capture modal for CARGAR ORDEN
    orderPhotoModalContainer: { flex: 1, backgroundColor: '#121212' },
    orderPhotoModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 50, backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#333' },
    orderPhotoModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    orderPhotoModalSubtitle: { fontSize: 14, color: '#3498db', marginTop: 4 },
    orderPhotoContent: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
    orderPhotoPreview: { width: 280, height: 380, borderRadius: 12, marginBottom: 20, backgroundColor: '#2a2a2a' },
    orderPhotoPlaceholder: { width: 280, height: 380, borderRadius: 12, borderWidth: 2, borderColor: '#444', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginBottom: 20, backgroundColor: '#1a1a1a' },
    orderPhotoPlaceholderText: { color: '#666', fontSize: 16, marginTop: 12 },
    orderPhotoButtons: { flexDirection: 'row', gap: 16, marginBottom: 30 },
    orderPhotoCameraButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#27ae60', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10 },
    orderPhotoGalleryButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#9b59b6', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10 },
    orderPhotoButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    orderPhotoFooter: { padding: 20, paddingBottom: 40, backgroundColor: '#1a1a1a', borderTopWidth: 1, borderTopColor: '#333' },
    orderPhotoProgressText: { color: '#888', fontSize: 12, textAlign: 'center', marginBottom: 12 },
    orderPhotoNextButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3498db', padding: 16, borderRadius: 10 },
    orderPhotoFinishButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#27ae60', padding: 16, borderRadius: 10 },
    orderPhotoNextButtonDisabled: { backgroundColor: '#444' },
    orderPhotoNextButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
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
});
