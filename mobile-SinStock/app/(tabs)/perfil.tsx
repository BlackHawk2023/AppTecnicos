import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Alert, Platform, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTextSize } from '../../contexts/TextSizeContext';
import { StatusBar } from 'expo-status-bar';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ServerConfigService } from '../../services/serverConfig.service';
import { resetApi, initializeApi } from '../../services/api.service';

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
                    <Text style={styles.value}>1.0.0</Text>
                </View>
            </View>

            {/* Server Configuration Section */}
            <ServerConfigSection />

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
