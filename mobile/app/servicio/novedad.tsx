import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Alert,
    Image,
    ScrollView,
    ActivityIndicator,
    Platform
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useAuth } from '../../contexts/AuthContext';
import { useRoute } from '../../contexts/RouteContext';

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

export default function NovedadScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const { setReportedNovedad, getReportedNovedad, getServicesByOT, isServiceCompleted, rutaActiva } = useRoute();
    const { user } = useAuth();

    const { cita, ot } = params;

    // Step management: 0 = select partidas, 1 = fill novedad form
    const [currentStep, setCurrentStep] = useState(0);

    // Get all partidas for this OT
    const [partidas, setPartidas] = useState<any[]>([]);
    const [selectedPartidas, setSelectedPartidas] = useState<Set<number>>(new Set());

    const [note, setNote] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    // Load partidas for this OT
    useEffect(() => {
        if (cita && ot) {
            const foundPartidas = getServicesByOT(cita as string, ot as string);
            setPartidas(foundPartidas);
            // If only one partida, auto-select it and skip to form
            if (foundPartidas.length === 1) {
                setSelectedPartidas(new Set([foundPartidas[0].partida]));
                setCurrentStep(1);
            }
        }
    }, [cita, ot, getServicesByOT]);

    // Check if editing existing novedad (only when single partida selected)
    const existingNovedad = selectedPartidas.size === 1
        ? getReportedNovedad(cita as string, ot as string, Array.from(selectedPartidas)[0])
        : undefined;

    // Pre-fill form with existing data if editing
    useEffect(() => {
        if (existingNovedad) {
            setNote(existingNovedad.note || '');
            setImage(existingNovedad.imagePath || null);
            setIsEditing(true);
            // Use existing location if available
            if (existingNovedad.latitude && existingNovedad.longitude) {
                setLocation({
                    coords: {
                        latitude: existingNovedad.latitude,
                        longitude: existingNovedad.longitude,
                        altitude: null,
                        accuracy: null,
                        altitudeAccuracy: null,
                        heading: null,
                        speed: null
                    },
                    timestamp: Date.now()
                } as Location.LocationObject);
            }
        }
    }, [existingNovedad]);

    useEffect(() => {
        (async () => {
            try {
                let { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    setLocationError('Permiso de ubicación denegado');
                    return;
                }

                try {
                    let loc = await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.Balanced  // Faster than Highest, less prone to timeout
                    });
                    setLocation(loc);
                } catch (locError) {
                    console.warn('Could not get precise location, trying low accuracy fallback:', locError);
                    try {
                        let loc = await Location.getLastKnownPositionAsync();
                        if (loc) {
                            setLocation(loc);
                        } else {
                            setLocationError('No se pudo obtener la ubicación');
                        }
                    } catch (fallbackError) {
                        console.error('Location fallback failed:', fallbackError);
                        setLocationError('Error obteniendo ubicación');
                    }
                }
            } catch (error) {
                console.error('Location permission error:', error);
                setLocationError('Error solicitando permisos de ubicación');
            }
        })();
    }, []);

    const pickImage = async () => {
        // Request permission
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Necesitamos acceso a la galería para adjuntar fotos.');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false, // Don't allow editing, take full photo
            quality: 0.7, // Reduce quality slightly for storage
        });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    };

    const takePhoto = async () => {
        // Request camera permission
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara para tomar fotos.');
            return;
        }

        let result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.7,
        });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    };

    const handleSave = async () => {
        if (selectedPartidas.size === 0) {
            Alert.alert('Falta información', 'Por favor seleccione al menos una partida.');
            return;
        }

        if (!note.trim()) {
            Alert.alert('Falta información', 'Por favor ingrese una nota o motivo.');
            return;
        }

        // Photo is now optional as per user request
        /*
        if (!image) {
            Alert.alert('Falta información', 'Por favor adjunte una foto.');
            return;
        }
        */

        if (!location && !locationError) {
            Alert.alert('Ubicación', 'Estamos obteniendo tu ubicación, aguarda un momento...');
            return;
        }

        setLoading(true);
        try {
            const db = await loadDatabaseService();
            if (db) {
                // Save novedad for EACH selected partida using unified gestiones table
                for (const partidaNum of selectedPartidas) {
                    const partidaInfo = partidas.find(p => p.partida === partidaNum);
                    await db.saveGestion({
                        tipo: 'NOVEDAD',
                        ruta_id: rutaActiva?.id || 0,
                        cita: cita as string,
                        ot: ot as string,
                        partida: partidaNum,
                        terminal: partidaInfo?.terminal || '',
                        nota_novedad: note,
                        novedad_image_path: image || '',
                        latitude: location?.coords.latitude,
                        longitude: location?.coords.longitude,
                        timestamp: new Date().toISOString()
                    });

                    // Update context for each partida
                    setReportedNovedad(cita as string, ot as string, partidaNum, {
                        note: note,
                        imagePath: image || '',
                        latitude: location?.coords.latitude,
                        longitude: location?.coords.longitude,
                        reportedAt: new Date()
                    });
                }

                const partidaCount = selectedPartidas.size;
                Alert.alert(
                    'Éxito',
                    `Novedad reportada para ${partidaCount} partida${partidaCount > 1 ? 's' : ''}.`,
                    [{ text: 'OK', onPress: () => router.replace('/(tabs)/home') }]
                );
            } else {
                Alert.alert('Error', 'No se pudo acceder a la base de datos local.');
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Hubo un problema al guardar la novedad.');
        } finally {
            setLoading(false);
        }
    };

    // Toggle partida selection
    const togglePartida = (partidaNum: number) => {
        setSelectedPartidas(prev => {
            const newSet = new Set(prev);
            if (newSet.has(partidaNum)) {
                newSet.delete(partidaNum);
            } else {
                newSet.add(partidaNum);
            }
            return newSet;
        });
    };

    // Select/deselect all partidas
    const toggleSelectAll = () => {
        if (selectedPartidas.size === partidas.length) {
            setSelectedPartidas(new Set());
        } else {
            setSelectedPartidas(new Set(partidas.map(p => p.partida)));
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                title: currentStep === 0 ? 'Seleccionar Partidas' : (isEditing ? 'Editar Novedad' : 'Reportar Novedad')
            }} />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* STEP 0: Select Partidas */}
                {currentStep === 0 && (
                    <>
                        <View style={styles.section}>
                            <Text style={styles.stepTitle}>¿Para cuáles partidas aplica esta novedad?</Text>
                            <Text style={styles.stepSubtitle}>
                                Seleccione las partidas que tienen el mismo problema
                            </Text>
                        </View>

                        <View style={styles.section}>
                            <TouchableOpacity
                                style={styles.selectAllButton}
                                onPress={toggleSelectAll}
                            >
                                <Ionicons
                                    name={selectedPartidas.size === partidas.length ? "checkbox" : "square-outline"}
                                    size={24}
                                    color="#3498db"
                                />
                                <Text style={styles.selectAllText}>
                                    {selectedPartidas.size === partidas.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                                </Text>
                            </TouchableOpacity>

                            {partidas.map((p) => {
                                const isCompleted = isServiceCompleted(p.cita, p.ot, p.partida);
                                const isSelected = selectedPartidas.has(p.partida);

                                return (
                                    <TouchableOpacity
                                        key={p.partida}
                                        style={[
                                            styles.partidaCheckbox,
                                            isSelected && styles.partidaCheckboxSelected,
                                            isCompleted && !isSelected && { borderColor: '#27ae60', borderWidth: 1 }
                                        ]}
                                        onPress={() => togglePartida(p.partida)}
                                    >
                                        <Ionicons
                                            name={isSelected ? "checkbox" : "square-outline"}
                                            size={24}
                                            color={isSelected ? "#3498db" : (isCompleted ? "#27ae60" : "#fff")}
                                        />
                                        <View style={styles.partidaCheckboxInfo}>
                                            <Text style={[styles.partidaCheckboxTitle, isCompleted && !isSelected && { color: '#27ae60' }]}>
                                                Partida N° {p.partida}
                                            </Text>
                                            <Text style={styles.partidaCheckboxSubtitle}>
                                                {p.terminal || 'Sin terminal'} - {p.tipo_incidente || 'Sin tipo'}
                                            </Text>
                                            {isCompleted && (
                                                <Text style={[styles.partidaCompletedBadge, { backgroundColor: '#27ae60' }]}>
                                                    ✓ Ya gestionada (puede re-gestionar)
                                                </Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity
                            style={[
                                styles.continueButton,
                                selectedPartidas.size === 0 && styles.continueButtonDisabled
                            ]}
                            onPress={() => selectedPartidas.size > 0 && setCurrentStep(1)}
                            disabled={selectedPartidas.size === 0}
                        >
                            <Text style={styles.continueButtonText}>
                                CONTINUAR ({selectedPartidas.size} seleccionada{selectedPartidas.size !== 1 ? 's' : ''})
                            </Text>
                            <Ionicons name="arrow-forward" size={20} color="#fff" />
                        </TouchableOpacity>
                    </>
                )}

                {/* STEP 1: Fill Novedad Form */}
                {currentStep === 1 && (
                    <>
                        {/* Back button */}
                        {partidas.length > 1 && (
                            <TouchableOpacity
                                style={styles.backStepButton}
                                onPress={() => setCurrentStep(0)}
                            >
                                <Ionicons name="arrow-back" size={20} color="#3498db" />
                                <Text style={styles.backStepText}>Cambiar partidas ({selectedPartidas.size} seleccionadas)</Text>
                            </TouchableOpacity>
                        )}

                        <View style={styles.section}>
                            <Text style={styles.label}>Nota / Motivo:</Text>
                            <TextInput
                                style={styles.input}
                                multiline
                                numberOfLines={4}
                                placeholder="Describa el motivo por el cual no se pudo realizar el servicio (ej: Local Cerrado)..."
                                placeholderTextColor="#aaa"
                                value={note}
                                onChangeText={setNote}
                            />
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.label}>Adjuntar Foto (Opcional):</Text>
                            <View style={styles.photoButtonsContainer}>
                                <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                                    <Ionicons name="camera" size={24} color="#fff" />
                                    <Text style={styles.photoButtonText}>Tomar Foto</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                                    <Ionicons name="images" size={24} color="#fff" />
                                    <Text style={styles.photoButtonText}>Galería</Text>
                                </TouchableOpacity>
                            </View>

                            {image && (
                                <View style={styles.imagePreviewContainer}>
                                    <Image source={{ uri: image }} style={styles.imagePreview} />
                                    <TouchableOpacity
                                        style={styles.removeImageButton}
                                        onPress={() => setImage(null)}
                                    >
                                        <Ionicons name="close-circle" size={24} color="#ff4444" />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.label}>Ubicación:</Text>
                            {location ? (
                                <Text style={styles.locationText}>
                                    ✅ Capturada (Lat: {location.coords.latitude.toFixed(4)}, Lon: {location.coords.longitude.toFixed(4)})
                                </Text>
                            ) : locationError ? (
                                <Text style={styles.errorText}>❌ {locationError}</Text>
                            ) : (
                                <Text style={styles.locationText}>⏳ Obteniendo ubicación...</Text>
                            )}
                        </View>

                        <View style={styles.footer}>
                            <TouchableOpacity
                                style={[styles.saveButton, loading && styles.disabledButton]}
                                onPress={handleSave}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <>
                                        <Ionicons name={isEditing ? "create-outline" : "save-outline"} size={24} color="#fff" />
                                        <Text style={styles.saveButtonText}>
                                            {isEditing ? 'Actualizar Novedad' : `Guardar para ${selectedPartidas.size} partida${selectedPartidas.size > 1 ? 's' : ''}`}
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100,
    },
    section: {
        marginBottom: 25,
    },
    label: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    input: {
        backgroundColor: '#1e1e1e',
        color: '#fff',
        borderRadius: 8,
        padding: 15,
        fontSize: 16,
        textAlignVertical: 'top',
        borderWidth: 1,
        borderColor: '#333',
    },
    imageButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2c3e50',
        padding: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#34495e',
        borderStyle: 'dashed',
    },
    imageButtonText: {
        color: '#fff',
        fontSize: 16,
        marginLeft: 10,
    },
    imagePreviewContainer: {
        marginTop: 15,
        position: 'relative',
        alignItems: 'center',
    },
    imagePreview: {
        width: '100%',
        height: 250,
        borderRadius: 8,
        resizeMode: 'cover',
    },
    removeImageButton: {
        position: 'absolute',
        top: -10,
        right: -10,
        backgroundColor: '#fff',
        borderRadius: 20,
    },
    locationText: {
        color: '#4ade80', // Green
        fontSize: 14,
    },
    errorText: {
        color: '#ef4444', // Red
        fontSize: 14,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        backgroundColor: '#121212',
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    saveButton: {
        backgroundColor: '#f59e0b', // Amber/Orange
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 15,
        borderRadius: 8,
    },
    disabledButton: {
        opacity: 0.7,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginLeft: 10,
    },
    // Step Title Styles
    stepTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    stepSubtitle: {
        color: '#aaa',
        fontSize: 14,
    },
    // Select All Button
    selectAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginBottom: 12,
        borderRadius: 8,
        backgroundColor: '#1e1e1e',
    },
    selectAllText: {
        color: '#3498db',
        fontSize: 16,
        marginLeft: 12,
    },
    // Partida Checkbox
    partidaCheckbox: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        marginBottom: 10,
        borderRadius: 10,
        backgroundColor: '#1e1e1e',
        borderWidth: 1,
        borderColor: '#333',
    },
    partidaCheckboxSelected: {
        borderColor: '#3498db',
        backgroundColor: '#1a2a3a',
    },
    partidaCheckboxDisabled: {
        opacity: 0.5,
    },
    partidaCheckboxInfo: {
        marginLeft: 12,
        flex: 1,
    },
    partidaCheckboxTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    partidaCheckboxSubtitle: {
        color: '#888',
        fontSize: 12,
        marginTop: 4,
    },
    partidaCompletedBadge: {
        color: '#f39c12',
        fontSize: 11,
        marginTop: 4,
        fontWeight: 'bold',
    },
    // Continue Button
    continueButton: {
        backgroundColor: '#3498db',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 10,
        marginTop: 10,
    },
    continueButtonDisabled: {
        backgroundColor: '#666',
    },
    continueButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginRight: 8,
    },
    // Back Step Button
    backStepButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        padding: 8,
    },
    backStepText: {
        color: '#3498db',
        fontSize: 14,
        marginLeft: 8,
    },
    // Photo buttons for camera and gallery
    photoButtonsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginVertical: 10,
    },
    photoButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#3498db',
        padding: 12,
        borderRadius: 8,
        flex: 0.45,
        justifyContent: 'center',
    },
    photoButtonText: {
        color: '#fff',
        marginLeft: 8,
        fontSize: 14,
    },
});
