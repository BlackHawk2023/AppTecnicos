import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Alert, Platform, TextInput, ScrollView, ActivityIndicator, Share } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTextSize } from '../../contexts/TextSizeContext';
import { useRoute } from '../../contexts/RouteContext';
import { StatusBar } from 'expo-status-bar';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ServerConfigService } from '../../services/serverConfig.service';
import { resetApi, initializeApi } from '../../services/api.service';
import Constants from 'expo-constants';

// Lazy load database for native only
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

export default function PerfilScreen() {
    const { user, signOut } = useAuth();
    const { textSize, setTextSize } = useTextSize();
    const { syncWithBackend } = useRoute();
    const insets = useSafeAreaInsets();
    const [signature, setSignature] = useState<string | null>(null);
    const [isSignatureModalVisible, setSignatureModalVisible] = useState(false);

    // Editable technician profile fields
    const [tecnicoNombre, setTecnicoNombre] = useState('');
    const [tecnicoDni, setTecnicoDni] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // NEW: Credential photo state
    const [credentialPhoto, setCredentialPhoto] = useState<string | null>(null);
    const [showCredentialModal, setShowCredentialModal] = useState(false);

    // Use ref to access signature canvas methods if needed
    const ref = useRef<SignatureViewRef>(null);

    useEffect(() => {
        loadProfileData();
        loadCredentialPhoto();
    }, []);

    const loadProfileData = async () => {
        if (Platform.OS === 'web') {
            console.log('Profile loading skipped on web');
            return;
        }
        try {
            const dbService = await loadDatabaseService();
            if (!dbService) return;

            const db = await dbService.getDb();
            const result: any = await db.getFirstAsync('SELECT nombre_completo, dni, signature_path FROM technician_profile WHERE id = 1');
            if (result) {
                if (result.signature_path) setSignature(result.signature_path);
                if (result.nombre_completo) setTecnicoNombre(result.nombre_completo);
                if (result.dni) setTecnicoDni(result.dni);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    };

    // NEW: Load credential photo from local DB
    const loadCredentialPhoto = async () => {
        if (Platform.OS === 'web') return;
        try {
            const dbService = await loadDatabaseService();
            if (!dbService) return;

            const result = await (dbService as any).getCredentialPhoto();
            if (result?.photo) {
                setCredentialPhoto(result.photo);
            }
        } catch (error) {
            console.error('Error loading credential photo:', error);
        }
    };

    const saveProfileData = async () => {
        if (Platform.OS === 'web') {
            Alert.alert('Info', 'Guardado no disponible en web');
            return;
        }

        if (!tecnicoNombre.trim()) {
            Alert.alert('Error', 'Por favor ingrese su nombre completo');
            return;
        }

        setIsSaving(true);
        try {
            const dbService = await loadDatabaseService();
            if (!dbService) return;

            const db = await dbService.getDb();
            // Check if profile exists
            const existing = await db.getFirstAsync('SELECT id FROM technician_profile WHERE id = 1');

            if (existing) {
                await db.runAsync(
                    'UPDATE technician_profile SET nombre_completo = ?, dni = ?, updated_at = ? WHERE id = 1',
                    [tecnicoNombre.trim(), tecnicoDni.trim(), Date.now()]
                );
            } else {
                await db.runAsync(
                    'INSERT INTO technician_profile (id, nombre_completo, dni, updated_at) VALUES (1, ?, ?, ?)',
                    [tecnicoNombre.trim(), tecnicoDni.trim(), Date.now()]
                );
            }

            Alert.alert('Éxito', 'Datos guardados correctamente');
        } catch (error) {
            Alert.alert('Error', 'No se pudieron guardar los datos');
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSignatureOK = async (signatureBase64: string) => {
        if (Platform.OS === 'web') {
            setSignature(signatureBase64);
            setSignatureModalVisible(false);
            Alert.alert('Info', 'Firma solo visible en preview (web mode)');
            return;
        }

        try {
            const dbService = await loadDatabaseService();
            if (!dbService) return;

            const db = await dbService.getDb();
            // Check if profile exists
            const existing = await db.getFirstAsync('SELECT id FROM technician_profile WHERE id = 1');

            if (existing) {
                await db.runAsync(
                    'UPDATE technician_profile SET signature_path = ?, updated_at = ? WHERE id = 1',
                    [signatureBase64, Date.now()]
                );
            } else {
                await db.runAsync(
                    'INSERT INTO technician_profile (id, signature_path, updated_at) VALUES (1, ?, ?)',
                    [signatureBase64, Date.now()]
                );
            }

            setSignature(signatureBase64);
            setSignatureModalVisible(false);
            Alert.alert('Éxito', 'Firma guardada correctamente');
        } catch (error) {
            Alert.alert('Error', 'No se pudo guardar la firma');
            console.error(error);
        }
    };

    const handleClear = () => {
        ref.current?.clearSignature();
    };

    const handleConfirm = () => {
        ref.current?.readSignature();
    };

    return (
        <ScrollView style={styles.container}>
            <StatusBar style="light" />

            <View style={styles.header}>
                <View style={styles.avatarContainer}>
                    <Text style={styles.avatarText}>
                        {tecnicoNombre?.charAt(0) || user?.usuario?.charAt(0) || 'T'}
                    </Text>
                </View>
                <Text style={styles.name}>{tecnicoNombre || user?.nombre_completo || user?.usuario || 'Técnico'}</Text>
                <Text style={styles.role}>Técnico de Campo</Text>
            </View>

            {/* Editable Profile Section */}
            <View style={styles.editableSection}>
                <Text style={styles.sectionTitle}>
                    <Ionicons name="person-outline" size={18} color="#3498db" /> Mis Datos
                </Text>

                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Nombre Completo *</Text>
                    <TextInput
                        style={styles.textInput}
                        value={tecnicoNombre}
                        onChangeText={setTecnicoNombre}
                        placeholder="Ingrese su nombre completo"
                        placeholderTextColor="#666"
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>DNI</Text>
                    <TextInput
                        style={styles.textInput}
                        value={tecnicoDni}
                        onChangeText={setTecnicoDni}
                        placeholder="Número de documento"
                        placeholderTextColor="#666"
                        keyboardType="numeric"
                    />
                </View>

                <TouchableOpacity
                    style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                    onPress={saveProfileData}
                    disabled={isSaving}
                >
                    <Ionicons name="save-outline" size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>
                        {isSaving ? 'GUARDANDO...' : 'GUARDAR DATOS'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Mi Firma Digital Section */}
            <View style={styles.signatureSection}>
                <Text style={styles.signatureTitle}>Mi Firma Digital</Text>
                {signature ? (
                    <View style={styles.signaturePreview}>
                        <Image
                            source={{ uri: signature }}
                            style={{ width: '100%', height: 100, resizeMode: 'contain' }}
                        />
                        <TouchableOpacity onPress={() => setSignatureModalVisible(true)}>
                            <Text style={styles.changeSignatureText}>Cambiar Firma</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={styles.addSignatureButton}
                        onPress={() => setSignatureModalVisible(true)}
                    >
                        <Text style={styles.addSignatureText}>+ CONFIGURAR FIRMA</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Credential Photo Section */}
            <View style={styles.credentialSection}>
                <Text style={styles.credentialTitle}>Mi Credencial</Text>
                {credentialPhoto ? (
                    <TouchableOpacity
                        style={styles.credentialPreview}
                        onPress={() => setShowCredentialModal(true)}
                    >
                        <Image
                            source={{ uri: credentialPhoto }}
                            style={styles.credentialThumbnail}
                            resizeMode="cover"
                        />
                        <Text style={styles.credentialHint}>Tocar para ver completa</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.noCredentialBox}>
                        <Ionicons name="card-outline" size={40} color="#666" />
                        <Text style={styles.noCredentialText}>Sin credencial configurada</Text>
                        <Text style={styles.noCredentialHint}>
                            Sube tu foto desde el sistema web y sincroniza
                        </Text>
                    </View>
                )}
            </View>

            {/* Info Section (User, Zone, Version) */}
            <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                    <Text style={styles.label}>Usuario:</Text>
                    <Text style={styles.value}>{user?.usuario}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                    <Text style={styles.label}>Zona Asignada:</Text>
                    <Text style={styles.value}>{user?.zona || 'Sin Zona'}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                    <Text style={styles.label}>Versión App:</Text>
                    <Text style={styles.value}>{Constants.expoConfig?.version || '2.3.1'}</Text>
                </View>
            </View>

            {/* Server Configuration Section */}
            <ServerConfigSection />

            {/* Sync Diagnostics Section */}
            <SyncDiagnosticsSection username={user?.usuario || ''} onSync={syncWithBackend} />

            {/* Text Size Configuration */}
            <View style={styles.editableSection}>
                <Text style={styles.sectionTitle}>
                    <Ionicons name="text-outline" size={18} color="#3498db" /> Tamaño de Texto
                </Text>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                    {['CHICO', 'MEDIANO', 'GRANDE'].map((size) => (
                        <TouchableOpacity
                            key={size}
                            style={[
                                styles.sizeButton,
                                textSize === size && styles.sizeButtonSelected
                            ]}
                            onPress={() => setTextSize(size as any)}
                        >
                            <Text style={[
                                styles.sizeButtonText,
                                textSize === size && styles.sizeButtonTextSelected,
                                { fontSize: size === 'CHICO' ? 12 : size === 'MEDIANO' ? 14 : 16 }
                            ]}>
                                {size}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <Text style={{ color: '#888', marginTop: 10, fontSize: 12 }}>
                    Ajusta el tamaño de letra en listas y formularios de la aplicación.
                </Text>
            </View>

            {/* Clear Data Section */}
            <ClearDataSection onLogout={signOut} />

            <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
                <Text style={styles.logoutText}>CERRAR SESIÓN</Text>
            </TouchableOpacity>

            <Modal visible={isSignatureModalVisible} animationType="slide">
                <View style={{ flex: 1, backgroundColor: '#fff' }}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Dibuje su firma</Text>
                        <TouchableOpacity onPress={() => setSignatureModalVisible(false)}>
                            <Text style={styles.closeModalText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                    <SignatureScreen
                        ref={ref}
                        onOK={handleSignatureOK}
                        onEmpty={() => console.log('Empty')}
                        webStyle={`.m-signature-pad--footer {display: none; margin: 0px;}`}
                    />
                    <View style={[styles.modalFooter, { paddingBottom: Math.max(16, insets.bottom + 16) }]}>
                        <TouchableOpacity style={styles.modalButtonSecondary} onPress={handleClear}>
                            <Text style={styles.modalButtonTextSec}>Borrar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modalButtonPrimary} onPress={handleConfirm}>
                            <Text style={styles.modalButtonTextPri}>Guardar Firma</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* NEW: Credential Fullscreen Modal */}
            <Modal
                visible={showCredentialModal}
                animationType="fade"
                transparent={false}
                onRequestClose={() => setShowCredentialModal(false)}
            >
                <TouchableOpacity
                    style={styles.credentialFullscreenContainer}
                    activeOpacity={1}
                    onPress={() => setShowCredentialModal(false)}
                >
                    {credentialPhoto && (
                        <Image
                            source={{ uri: credentialPhoto }}
                            style={styles.credentialFullscreenImage}
                            resizeMode="contain"
                        />
                    )}
                    <TouchableOpacity
                        style={styles.credentialCloseButton}
                        onPress={() => setShowCredentialModal(false)}
                    >
                        <Ionicons name="close-circle" size={44} color="#fff" />
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

// Server Configuration Sub-Component
function ServerConfigSection() {
    const [serverUrl, setServerUrl] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [tempUrl, setTempUrl] = useState('');
    const [testing, setTesting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [statusMessage, setStatusMessage] = useState('');

    useEffect(() => {
        loadServerUrl();
    }, []);

    const loadServerUrl = async () => {
        const url = await ServerConfigService.getServerUrl();
        if (url) {
            setServerUrl(url);
            setTempUrl(url);
        }
    };

    const handleTest = async () => {
        if (!tempUrl.trim()) return;
        setTesting(true);
        setStatus('idle');

        const result = await ServerConfigService.testConnection(tempUrl.trim());
        setStatus(result.success ? 'success' : 'error');
        setStatusMessage(result.message);
        setTesting(false);
    };

    const handleSave = async () => {
        if (!tempUrl.trim()) {
            Alert.alert('Error', 'Ingresa una URL válida');
            return;
        }

        await ServerConfigService.setServerUrl(tempUrl.trim());
        resetApi();
        await initializeApi();
        setServerUrl(tempUrl.trim());
        setShowModal(false);
        Alert.alert('Éxito', 'URL del servidor actualizada. Cierra sesión para aplicar los cambios.');
    };

    return (
        <>
            <View style={serverStyles.section}>
                <Text style={serverStyles.sectionTitle}>Configuración del Servidor</Text>
                <TouchableOpacity
                    style={serverStyles.serverRow}
                    onPress={() => {
                        setTempUrl(serverUrl);
                        setStatus('idle');
                        setShowModal(true);
                    }}
                >
                    <View style={serverStyles.serverInfo}>
                        <Ionicons name="server-outline" size={20} color="#3498db" />
                        <Text style={serverStyles.serverUrl} numberOfLines={1}>
                            {serverUrl ? serverUrl.replace(/^https?:\/\//, '') : 'No configurado'}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                </TouchableOpacity>
            </View>

            <Modal visible={showModal} animationType="slide" transparent>
                <View style={serverStyles.modalOverlay}>
                    <View style={serverStyles.modalContent}>
                        <View style={serverStyles.modalHeader}>
                            <Text style={serverStyles.modalTitle}>Servidor Backend</Text>
                            <TouchableOpacity onPress={() => setShowModal(false)}>
                                <Ionicons name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        <Text style={serverStyles.modalDesc}>
                            URL del servidor (ej: https://servidor.ddns.net)
                        </Text>

                        <TextInput
                            style={serverStyles.input}
                            value={tempUrl}
                            onChangeText={(t) => { setTempUrl(t); setStatus('idle'); }}
                            placeholder="https://servidor.ejemplo.com"
                            placeholderTextColor="#666"
                            autoCapitalize="none"
                            keyboardType="url"
                        />

                        {status !== 'idle' && (
                            <View style={[serverStyles.statusBox, status === 'success' ? serverStyles.statusSuccess : serverStyles.statusError]}>
                                <Ionicons
                                    name={status === 'success' ? 'checkmark-circle' : 'close-circle'}
                                    size={18}
                                    color={status === 'success' ? '#27ae60' : '#e74c3c'}
                                />
                                <Text style={status === 'success' ? serverStyles.statusTextOk : serverStyles.statusTextErr}>
                                    {statusMessage}
                                </Text>
                            </View>
                        )}

                        <View style={serverStyles.modalButtons}>
                            <TouchableOpacity style={serverStyles.testBtn} onPress={handleTest} disabled={testing}>
                                {testing ? (
                                    <ActivityIndicator size="small" color="#3498db" />
                                ) : (
                                    <>
                                        <Ionicons name="wifi" size={16} color="#3498db" />
                                        <Text style={serverStyles.testBtnText}>Probar</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity style={serverStyles.saveBtn} onPress={handleSave}>
                                <Text style={serverStyles.saveBtnText}>Guardar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

// Clear Data Sub-Component
function ClearDataSection({ onLogout }: { onLogout: () => void }) {
    const [clearing, setClearing] = useState(false);

    const handleClearData = () => {
        Alert.alert(
            'Limpiar Datos Locales',
            '¿Estás seguro? Esto eliminará:\n\n• Movimientos de stock pendientes\n• Stock local\n• Rutas y servicios\n• Gestiones pendientes\n\nNO se eliminarán:\n• Tu perfil y firma\n• Configuración del servidor\n\nDeberás volver a sincronizar después.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Limpiar Todo',
                    style: 'destructive',
                    onPress: performClearData
                }
            ]
        );
    };

    const performClearData = async () => {
        if (Platform.OS === 'web') {
            Alert.alert('Info', 'No disponible en web');
            return;
        }

        setClearing(true);
        try {
            const { createDatabaseService } = await import('../../db/database');
            const dbService = createDatabaseService();
            await dbService.init();
            const db = await dbService.getDb();

            // Clear operational data tables (NOT profile or signature)
            // Use try/catch for each table in case it doesn't exist
            const tablesToClear = [
                'movimientos_pendientes',
                'stock_local',
                'rutas',
                'servicios',
                'gestiones',
                'service_reports',
                'pending_image_uploads',
                'metadata_materials'
            ];

            for (const table of tablesToClear) {
                try {
                    await db.execAsync(`DELETE FROM ${table};`);
                    console.log(`Cleared table: ${table}`);
                } catch (e) {
                    console.log(`Table ${table} might not exist, skipping`);
                }
            }

            Alert.alert(
                'Datos Limpiados',
                'Los datos locales fueron eliminados. Se cerrará la sesión para que vuelva a sincronizar.',
                [{ text: 'OK', onPress: onLogout }]
            );
        } catch (error) {
            console.error('Error clearing data:', error);
            Alert.alert('Error', 'No se pudieron limpiar los datos. ' + String(error));
        } finally {
            setClearing(false);
        }
    };

    return (
        <View style={clearStyles.section}>
            <Text style={clearStyles.sectionTitle}>Mantenimiento</Text>
            <Text style={clearStyles.description}>
                Si tienes problemas de sincronización, puedes limpiar los datos locales y volver a sincronizar.
            </Text>
            <TouchableOpacity
                style={[clearStyles.clearButton, clearing && clearStyles.clearButtonDisabled]}
                onPress={handleClearData}
                disabled={clearing}
            >
                {clearing ? (
                    <ActivityIndicator size="small" color="#fff" />
                ) : (
                    <>
                        <Ionicons name="trash-outline" size={18} color="#fff" />
                        <Text style={clearStyles.clearButtonText}>LIMPIAR DATOS LOCALES</Text>
                    </>
                )}
            </TouchableOpacity>
        </View>
    );
}

const clearStyles = StyleSheet.create({
    section: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#f39c12' },
    sectionTitle: { color: '#f39c12', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
    description: { color: '#888', fontSize: 13, marginBottom: 14, lineHeight: 18 },
    clearButton: { backgroundColor: '#f39c12', borderRadius: 8, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    clearButtonDisabled: { opacity: 0.6 },
    clearButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});

// Sync Diagnostics Sub-Component
function SyncDiagnosticsSection({ username, onSync }: { username: string; onSync: () => Promise<void> }) {
    const [loading, setLoading] = useState(true);
    const [retrying, setRetrying] = useState(false);
    const [lastLog, setLastLog] = useState<{
        timestamp: string; success: number;
        upload_success: number; download_success: number;
        movimientos_enviados: number; gestiones_enviadas: number;
        error_detalle: string | null; duracion_ms: number;
    } | null>(null);
    const [movsList, setMovsList] = useState<any[]>([]);
    const [gestsList, setGestsList] = useState<any[]>([]);
    const [expandMovs, setExpandMovs] = useState(false);
    const [expandGests, setExpandGests] = useState(false);
    const [sharing, setSharing] = useState(false);

    useEffect(() => {
        loadDiagnostics();
    }, []);

    const loadDiagnostics = async () => {
        if (Platform.OS === 'web') { setLoading(false); return; }
        try {
            const dbService = await loadDatabaseService();
            if (!dbService) { setLoading(false); return; }

            if (typeof (dbService as any).getLastSyncLogs === 'function') {
                const logs = await (dbService as any).getLastSyncLogs(1);
                if (logs.length > 0) setLastLog(logs[0]);
            }

            const db = await dbService.getDb();
            const movs: any[] = await db.getAllAsync(
                'SELECT * FROM movimientos_pendientes WHERE synced = 0 ORDER BY fecha_hora ASC'
            );
            const gests: any[] = await db.getAllAsync(
                "SELECT * FROM gestiones WHERE status = 'PENDING' ORDER BY created_at ASC"
            );
            setMovsList(movs);
            setGestsList(gests);
        } catch (e) {
            console.error('SyncDiagnostics: Error loading:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleRetry = async () => {
        setRetrying(true);
        try {
            await onSync();
        } finally {
            // Reload after sync attempt regardless of outcome
            await loadDiagnostics();
            setRetrying(false);
        }
    };

    const confirmDeleteMov = (mov: any) => {
        const serieStr = mov.serie ? ` [SN:${mov.serie}]` : '';
        Alert.alert(
            'Eliminar movimiento',
            `¿Eliminar este movimiento pendiente?\n\n${mov.tipo_movimiento} ${mov.codigo_material}${serieStr} x${mov.cantidad}\nOT:${mov.ot} Cita:${mov.cita}\n\nEste movimiento NO se enviará al servidor.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const dbService = await loadDatabaseService();
                            const db = await dbService.getDb();
                            await db.runAsync('DELETE FROM movimientos_pendientes WHERE id = ?', [mov.id]);
                            await loadDiagnostics();
                        } catch (e) {
                            Alert.alert('Error', 'No se pudo eliminar el movimiento.');
                        }
                    },
                },
            ]
        );
    };

    const confirmDeleteGest = (g: any) => {
        Alert.alert(
            'Eliminar gestión',
            `¿Eliminar esta gestión pendiente?\n\n${g.tipo} OT:${g.ot} Cita:${g.cita} Part:${g.partida}\n\nEsta gestión NO se enviará al servidor.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const dbService = await loadDatabaseService();
                            const db = await dbService.getDb();
                            await db.runAsync('DELETE FROM gestiones WHERE id = ?', [g.id]);
                            await loadDiagnostics();
                        } catch (e) {
                            Alert.alert('Error', 'No se pudo eliminar la gestión.');
                        }
                    },
                },
            ]
        );
    };

    const formatRelativeTime = (ts: string) => {
        try {
            const diff = Date.now() - new Date(ts).getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return 'hace un momento';
            if (mins < 60) return `hace ${mins} min`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `hace ${hrs} h`;
            const d = new Date(ts);
            return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch { return ts; }
    };

    const handleShare = async () => {
        if (Platform.OS === 'web') return;
        setSharing(true);
        try {
            const dbService = await loadDatabaseService();
            if (!dbService) return;
            const db = await dbService.getDb();

            // Fetch full rows, not just counts
            const pendingMovs: any[] = await db.getAllAsync(
                'SELECT * FROM movimientos_pendientes WHERE synced = 0 ORDER BY fecha_hora ASC'
            );
            const pendingGests: any[] = await db.getAllAsync(
                "SELECT * FROM gestiones WHERE status = 'PENDING' ORDER BY created_at ASC"
            );

            const lines: string[] = [
                `=== DIAGNÓSTICO SYNC · ${username} ===`,
                `Generado: ${new Date().toLocaleString('es-AR')}`,
                '',
            ];

            // ── Movimientos de stock ──────────────────────────────────────
            lines.push(`MOVIMIENTOS DE STOCK PENDIENTES (${pendingMovs.length}):`);
            if (pendingMovs.length === 0) {
                lines.push('  Ninguno.');
            } else {
                for (const m of pendingMovs) {
                    const tsStr = (() => {
                        try { return new Date(m.fecha_hora).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
                        catch { return m.fecha_hora ?? '?'; }
                    })();
                    const serieStr = m.serie ? ` [SN:${m.serie}]` : '';
                    const condStr = m.condicion ? ` (${m.condicion})` : '';
                    lines.push(`  · [${tsStr}] ${m.tipo_movimiento}  ${m.codigo_material}${serieStr}  x${m.cantidad}${condStr}`);
                    lines.push(`      OT:${m.ot} Cita:${m.cita} Part:${m.partida}`);
                }
            }
            lines.push('');

            // ── Gestiones ─────────────────────────────────────────────────
            lines.push(`GESTIONES PENDIENTES (${pendingGests.length}):`);
            if (pendingGests.length === 0) {
                lines.push('  Ninguna.');
            } else {
                for (const g of pendingGests) {
                    const tsStr = (() => {
                        try { return new Date(g.timestamp).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
                        catch { return g.timestamp ?? '?'; }
                    })();
                    lines.push(`  · [${tsStr}] ${g.tipo}  OT:${g.ot} Cita:${g.cita} Part:${g.partida}`);
                    if (g.tipo_cierre) lines.push(`      Cierre: ${g.tipo_cierre}`);
                    if (g.detalle_trabajo) lines.push(`      Detalle: ${String(g.detalle_trabajo).slice(0, 80)}`);
                    if (g.nota_novedad) lines.push(`      Novedad: ${String(g.nota_novedad).slice(0, 80)}`);
                }
            }
            lines.push('');

            // ── Historial de syncs ────────────────────────────────────────
            lines.push('HISTORIAL (últimas 10 sincronizaciones):');
            if (typeof (dbService as any).getLastSyncLogs === 'function') {
                const logs = await (dbService as any).getLastSyncLogs(10);
                if (logs.length === 0) {
                    lines.push('  Sin registros aún.');
                } else {
                    for (const log of logs) {
                        const ts = new Date(log.timestamp).toLocaleString('es-AR', {
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        });
                        const st = log.success ? '✓ OK  ' : '✗ FALLO';
                        lines.push(
                            `  [${ts}] ${st}  Up:${log.upload_success ? '✓' : '✗'} Down:${log.download_success ? '✓' : '✗'}  Mov:${log.movimientos_enviados} Gest:${log.gestiones_enviadas}  ${log.duracion_ms}ms`
                        );
                        if (log.error_detalle) lines.push(`         └ ${log.error_detalle}`);
                    }
                }
            } else {
                lines.push('  Tabla de log no disponible. Sincroniza una vez para activar.');
            }

            await Share.share({ message: lines.join('\n'), title: 'Diagnóstico de Sincronización' });
        } catch (e) {
            Alert.alert('Error', 'No se pudo generar el diagnóstico.');
            console.error('SyncDiagnostics: Share error:', e);
        } finally {
            setSharing(false);
        }
    };

    const pendingMovimientos = movsList.length;
    const pendingGestiones = gestsList.length;
    const hasPending = pendingMovimientos > 0 || pendingGestiones > 0;
    const lastSyncOk = lastLog?.success === 1;
    const statusColor = !lastLog ? '#888' : lastSyncOk ? '#27ae60' : '#e74c3c';
    const statusIcon = !lastLog
        ? 'time-outline'
        : lastSyncOk ? 'checkmark-circle-outline' : 'alert-circle-outline';
    const statusText = !lastLog
        ? 'Sin sincronizaciones registradas'
        : lastSyncOk
            ? `Exitosa — ${formatRelativeTime(lastLog.timestamp)}`
            : `Falló — ${formatRelativeTime(lastLog.timestamp)}`;

    return (
        <View style={diagStyles.section}>
            <Text style={diagStyles.sectionTitle}>Estado de Sincronización</Text>
            {loading ? (
                <ActivityIndicator size="small" color="#3498db" style={{ marginVertical: 12 }} />
            ) : (
                <>
                    {/* ── Última sync ─────────────────────────────── */}
                    <View style={diagStyles.row}>
                        <Ionicons name={statusIcon as any} size={18} color={statusColor} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={diagStyles.rowLabel}>Última sincronización</Text>
                            <Text style={[diagStyles.rowValue, { color: statusColor }]}>{statusText}</Text>
                            {lastLog?.error_detalle ? (
                                <Text style={diagStyles.errorDetail} numberOfLines={2}>{lastLog.error_detalle}</Text>
                            ) : null}
                        </View>
                    </View>

                    {/* ── Retry button ─────────────────────────────── */}
                    <TouchableOpacity
                        style={[diagStyles.retryButton, retrying && diagStyles.buttonDisabled]}
                        onPress={handleRetry}
                        disabled={retrying}
                    >
                        {retrying ? (
                            <ActivityIndicator size="small" color="#2ecc71" />
                        ) : (
                            <>
                                <Ionicons name="refresh-outline" size={16} color="#2ecc71" />
                                <Text style={diagStyles.retryButtonText}>Reintentar sincronización</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <View style={diagStyles.divider} />

                    {/* ── Movimientos pendientes ───────────────────── */}
                    <TouchableOpacity
                        style={diagStyles.pendingHeader}
                        onPress={() => setExpandMovs(v => !v)}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name={pendingMovimientos > 0 ? 'warning-outline' : 'checkmark-done-outline'}
                            size={16}
                            color={pendingMovimientos > 0 ? '#f39c12' : '#27ae60'}
                        />
                        <Text style={[diagStyles.pendingHeaderText, { color: pendingMovimientos > 0 ? '#f39c12' : '#27ae60' }]}>
                            {pendingMovimientos > 0
                                ? `${pendingMovimientos} movimiento${pendingMovimientos > 1 ? 's' : ''} de stock pendiente${pendingMovimientos > 1 ? 's' : ''}`
                                : 'Stock sincronizado'}
                        </Text>
                        {pendingMovimientos > 0 && (
                            <Ionicons
                                name={expandMovs ? 'chevron-up' : 'chevron-down'}
                                size={16}
                                color="#888"
                                style={{ marginLeft: 'auto' }}
                            />
                        )}
                    </TouchableOpacity>

                    {expandMovs && movsList.map((mov) => {
                        const serieStr = mov.serie ? ` SN:${mov.serie}` : '';
                        const condStr = mov.condicion ? ` · ${mov.condicion}` : '';
                        const tsStr = (() => { try { return new Date(mov.fecha_hora).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return mov.fecha_hora; } })();
                        return (
                            <View key={mov.id} style={diagStyles.pendingItem}>
                                <View style={{ flex: 1 }}>
                                    <Text style={diagStyles.pendingItemTitle}>
                                        {mov.tipo_movimiento}  {mov.codigo_material}{serieStr}  ×{mov.cantidad}{condStr}
                                    </Text>
                                    <Text style={diagStyles.pendingItemSub}>
                                        OT:{mov.ot}  Cita:{mov.cita}  Part:{mov.partida}  ·  {tsStr}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    style={diagStyles.deleteBtn}
                                    onPress={() => confirmDeleteMov(mov)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Ionicons name="trash-outline" size={18} color="#e74c3c" />
                                </TouchableOpacity>
                            </View>
                        );
                    })}

                    <View style={diagStyles.divider} />

                    {/* ── Gestiones pendientes ─────────────────────── */}
                    <TouchableOpacity
                        style={diagStyles.pendingHeader}
                        onPress={() => setExpandGests(v => !v)}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name={pendingGestiones > 0 ? 'warning-outline' : 'checkmark-done-outline'}
                            size={16}
                            color={pendingGestiones > 0 ? '#f39c12' : '#27ae60'}
                        />
                        <Text style={[diagStyles.pendingHeaderText, { color: pendingGestiones > 0 ? '#f39c12' : '#27ae60' }]}>
                            {pendingGestiones > 0
                                ? `${pendingGestiones} gestión${pendingGestiones > 1 ? 'es' : ''} pendiente${pendingGestiones > 1 ? 's' : ''}`
                                : 'Gestiones sincronizadas'}
                        </Text>
                        {pendingGestiones > 0 && (
                            <Ionicons
                                name={expandGests ? 'chevron-up' : 'chevron-down'}
                                size={16}
                                color="#888"
                                style={{ marginLeft: 'auto' }}
                            />
                        )}
                    </TouchableOpacity>

                    {expandGests && gestsList.map((g) => {
                        const tsStr = (() => { try { return new Date(g.timestamp).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return g.timestamp; } })();
                        const detail = g.tipo_cierre || g.nota_novedad || g.detalle_trabajo || '';
                        return (
                            <View key={g.id} style={diagStyles.pendingItem}>
                                <View style={{ flex: 1 }}>
                                    <Text style={diagStyles.pendingItemTitle}>
                                        {g.tipo}  OT:{g.ot}  Part:{g.partida}
                                    </Text>
                                    <Text style={diagStyles.pendingItemSub}>
                                        Cita:{g.cita}  ·  {tsStr}
                                    </Text>
                                    {detail ? <Text style={diagStyles.pendingItemDetail} numberOfLines={1}>{String(detail).slice(0, 60)}</Text> : null}
                                </View>
                                <TouchableOpacity
                                    style={diagStyles.deleteBtn}
                                    onPress={() => confirmDeleteGest(g)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Ionicons name="trash-outline" size={18} color="#e74c3c" />
                                </TouchableOpacity>
                            </View>
                        );
                    })}

                    <View style={diagStyles.divider} />

                    {/* ── Compartir diagnóstico ────────────────────── */}
                    <TouchableOpacity
                        style={[diagStyles.shareButton, sharing && diagStyles.buttonDisabled]}
                        onPress={handleShare}
                        disabled={sharing}
                    >
                        {sharing ? (
                            <ActivityIndicator size="small" color="#3498db" />
                        ) : (
                            <>
                                <Ionicons name="share-outline" size={16} color="#3498db" />
                                <Text style={diagStyles.shareButtonText}>Compartir diagnóstico</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </>
            )}
        </View>
    );
}

const diagStyles = StyleSheet.create({
    section: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 16, marginBottom: 20 },
    sectionTitle: { color: '#3498db', fontSize: 12, fontWeight: '600', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
    row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    rowLabel: { color: '#888', fontSize: 12, marginBottom: 2 },
    rowValue: { color: '#fff', fontSize: 14, fontWeight: '500' },
    errorDetail: { color: '#e74c3c', fontSize: 11, marginTop: 3, fontStyle: 'italic' },
    divider: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 12 },
    // Retry button
    retryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(46,204,113,0.08)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(46,204,113,0.4)', padding: 11, marginBottom: 12 },
    retryButtonText: { color: '#2ecc71', fontSize: 14, fontWeight: '600' },
    // Pending item rows
    pendingHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    pendingHeaderText: { fontSize: 13, fontWeight: '600' },
    pendingItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#252525', borderRadius: 8, padding: 10, marginBottom: 6 },
    pendingItemTitle: { color: '#fff', fontSize: 13, fontWeight: '500' },
    pendingItemSub: { color: '#888', fontSize: 11, marginTop: 2 },
    pendingItemDetail: { color: '#aaa', fontSize: 11, marginTop: 2, fontStyle: 'italic' },
    deleteBtn: { padding: 4, marginLeft: 8 },
    // Shared
    buttonDisabled: { opacity: 0.5 },
    shareButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(52,152,219,0.08)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(52,152,219,0.4)', padding: 11 },
    shareButtonText: { color: '#3498db', fontSize: 14, fontWeight: '600' },
});

const serverStyles = StyleSheet.create({
    section: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 16, marginBottom: 20 },
    sectionTitle: { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase' },
    serverRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    serverInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    serverUrl: { color: '#fff', fontSize: 14, flex: 1 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#2a2a2a', borderRadius: 16, padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    modalDesc: { color: '#aaa', fontSize: 13, marginBottom: 16 },
    input: { backgroundColor: '#333', borderRadius: 10, padding: 14, color: '#fff', fontSize: 15, marginBottom: 12 },
    statusBox: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, marginBottom: 12, gap: 8 },
    statusSuccess: { backgroundColor: 'rgba(39,174,96,0.1)' },
    statusError: { backgroundColor: 'rgba(231,76,60,0.1)' },
    statusTextOk: { color: '#27ae60', fontSize: 13 },
    statusTextErr: { color: '#e74c3c', fontSize: 13 },
    modalButtons: { flexDirection: 'row', gap: 12 },
    testBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#333', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#3498db', gap: 6 },
    testBtnText: { color: '#3498db', fontWeight: '600' },
    saveBtn: { flex: 1, backgroundColor: '#3498db', padding: 12, borderRadius: 8, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontWeight: 'bold' },
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
        padding: 20,
    },
    header: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 30,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 2,
        borderColor: '#3498db',
    },
    avatarText: {
        color: '#fff',
        fontSize: 32,
        fontWeight: 'bold',
    },
    name: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    role: {
        fontSize: 14,
        color: '#888',
    },
    infoSection: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    label: {
        color: '#aaa',
        fontSize: 14,
    },
    value: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    divider: {
        height: 1,
        backgroundColor: '#333',
        marginVertical: 4,
    },
    // Editable Section Styles
    editableSection: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#3498db',
    },
    sectionTitle: {
        color: '#3498db',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputLabel: {
        color: '#aaa',
        fontSize: 14,
        marginBottom: 6,
    },
    textInput: {
        backgroundColor: '#252525',
        borderRadius: 8,
        padding: 12,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#333',
    },
    saveButton: {
        backgroundColor: '#3498db',
        borderRadius: 8,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },

    // Text Size Buttons
    sizeButton: {
        flex: 1,
        backgroundColor: '#252525',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#444',
    },
    sizeButtonSelected: {
        backgroundColor: '#3498db',
        borderColor: '#3498db',
    },
    sizeButtonText: {
        color: '#aaa',
        fontWeight: '600',
    },
    sizeButtonTextSelected: {
        color: '#fff',
        fontWeight: 'bold',
    },
    signatureSection: {
        marginBottom: 30,
    },
    signatureTitle: {
        color: '#aaa',
        marginBottom: 10,
        fontSize: 14,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    signaturePreview: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 10,
        alignItems: 'center',
    },
    changeSignatureText: {
        color: '#3498db',
        marginTop: 8,
        fontWeight: 'bold',
    },
    addSignatureButton: {
        backgroundColor: '#2ecc71',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    addSignatureText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    logoutButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#e74c3c',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 'auto',
    },
    logoutText: {
        color: '#e74c3c',
        fontWeight: 'bold',
        fontSize: 16,
    },

    // Modal Styles
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    closeModalText: {
        color: '#e74c3c',
        fontSize: 16,
    },
    modalFooter: {
        flexDirection: 'row',
        padding: 16,
        // paddingBottom is now applied dynamically via insets.bottom
        gap: 12,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    modalButtonPrimary: {
        flex: 1,
        backgroundColor: '#3498db',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalButtonSecondary: {
        flex: 1,
        backgroundColor: '#ecf0f1',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalButtonTextPri: {
        color: '#fff',
        fontWeight: 'bold',
    },
    modalButtonTextSec: {
        color: '#333',
        fontWeight: 'bold',
    },
    // NEW: Credential Photo Styles
    credentialSection: {
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
    },
    credentialTitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 12,
        fontWeight: '600',
    },
    credentialPreview: {
        alignItems: 'center',
    },
    credentialThumbnail: {
        width: '100%',
        height: 150,
        borderRadius: 8,
        backgroundColor: '#eee',
    },
    credentialHint: {
        color: '#888',
        fontSize: 12,
        marginTop: 8,
    },
    noCredentialBox: {
        alignItems: 'center',
        padding: 24,
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ddd',
        borderStyle: 'dashed',
    },
    noCredentialText: {
        color: '#666',
        fontSize: 14,
        fontWeight: '500',
        marginTop: 12,
    },
    noCredentialHint: {
        color: '#888',
        fontSize: 12,
        marginTop: 4,
        textAlign: 'center',
    },
    credentialFullscreenContainer: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    credentialFullscreenImage: {
        width: '100%',
        height: '100%',
    },
    credentialCloseButton: {
        position: 'absolute',
        top: 50,
        right: 20,
    },
});
