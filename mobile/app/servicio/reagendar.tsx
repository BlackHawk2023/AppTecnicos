import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Alert,
    ScrollView,
    ActivityIndicator,
    Platform
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../contexts/AuthContext';
import { useRoute } from '../../contexts/RouteContext';

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

const TURNOS = ['MAÑANA', 'SIESTA', 'TARDE'] as const;
type Turno = typeof TURNOS[number];

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const daysInMonth = (month: number, year: number) => new Date(year, month, 0).getDate();

const _spinnerColStyle: any = { flex: 1, alignItems: 'center', gap: 4 };
const _spinnerLabelStyle: any = { color: '#aaa', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 };
const _spinnerValueStyle: any = { backgroundColor: '#1e1e1e', borderRadius: 8, borderWidth: 1, borderColor: '#8e44ad', paddingVertical: 12, paddingHorizontal: 8, minWidth: 64, alignItems: 'center' };
const _spinnerValueTextStyle: any = { color: '#fff', fontSize: 20, fontWeight: 'bold' };

function SpinnerColumn({ label, display, onIncrement, onDecrement }: {
    label: string; display: string;
    onIncrement: () => void; onDecrement: () => void;
}) {
    return (
        <View style={_spinnerColStyle}>
            <Text style={_spinnerLabelStyle}>{label}</Text>
            <TouchableOpacity onPress={onIncrement} hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}>
                <Ionicons name="chevron-up" size={34} color="#8e44ad" />
            </TouchableOpacity>
            <View style={_spinnerValueStyle}>
                <Text style={_spinnerValueTextStyle}>{display}</Text>
            </View>
            <TouchableOpacity onPress={onDecrement} hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}>
                <Ionicons name="chevron-down" size={34} color="#8e44ad" />
            </TouchableOpacity>
        </View>
    );
}

export default function ReagendarScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const { setReagendamiento, getServicesByOT, isServiceCompleted, rutaActiva } = useRoute();
    const { user } = useAuth();

    const { cita, ot } = params;

    // Step management: 0 = select partidas, 1 = fill form
    const [currentStep, setCurrentStep] = useState(0);

    const [partidas, setPartidas] = useState<any[]>([]);
    const [selectedPartidas, setSelectedPartidas] = useState<Set<number>>(new Set());

    const _now = new Date();
    const [dateDay, setDateDay] = useState(_now.getDate());
    const [dateMonth, setDateMonth] = useState(_now.getMonth() + 1);
    const [dateYear, setDateYear] = useState(_now.getFullYear());
    const [turno, setTurno] = useState<Turno | null>(null);
    const [motivo, setMotivo] = useState('');

    const [loading, setLoading] = useState(false);
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const isSavingRef = useRef(false);

    // Load partidas for this OT
    useEffect(() => {
        if (cita && ot) {
            const found = getServicesByOT(cita as string, ot as string);
            setPartidas(found);
            if (found.length === 1) {
                setSelectedPartidas(new Set([found[0].partida]));
                setCurrentStep(1);
            }
        }
    }, [cita, ot, getServicesByOT]);

    // Capture location on mount
    useEffect(() => {
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    setLocationError('Permiso de ubicación denegado');
                    return;
                }
                try {
                    const loc = await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.Balanced,
                    });
                    setLocation(loc);
                } catch {
                    const loc = await Location.getLastKnownPositionAsync();
                    if (loc) setLocation(loc);
                    else setLocationError('No se pudo obtener la ubicación');
                }
            } catch {
                setLocationError('Error solicitando permisos de ubicación');
            }
        })();
    }, []);

    const togglePartida = (partidaNum: number) => {
        setSelectedPartidas(prev => {
            const next = new Set(prev);
            if (next.has(partidaNum)) next.delete(partidaNum);
            else next.add(partidaNum);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedPartidas.size === partidas.length) {
            setSelectedPartidas(new Set());
        } else {
            setSelectedPartidas(new Set(partidas.map(p => p.partida)));
        }
    };

    const handleSave = async () => {
        if (isSavingRef.current) return;

        if (selectedPartidas.size === 0) {
            Alert.alert('Falta información', 'Seleccione al menos una partida.');
            return;
        }

        const maxDay = daysInMonth(dateMonth, dateYear);
        if (dateDay < 1 || dateDay > maxDay || dateMonth < 1 || dateMonth > 12 || dateYear < 2020) {
            Alert.alert('Fecha inválida', 'La fecha seleccionada no es válida.');
            return;
        }
        const fechaISO = `${dateYear}-${String(dateMonth).padStart(2, '0')}-${String(dateDay).padStart(2, '0')}`;

        if (!turno) {
            Alert.alert('Falta turno', 'Seleccione el turno para el reagendamiento.');
            return;
        }

        if (!motivo.trim()) {
            Alert.alert('Falta motivo', 'Ingrese el motivo del reagendamiento.');
            return;
        }

        if (!location && !locationError) {
            Alert.alert('Ubicación', 'Estamos obteniendo tu ubicación, aguarda un momento...');
            return;
        }

        isSavingRef.current = true;
        setLoading(true);
        try {
            const db = await loadDatabaseService();
            if (db) {
                for (const partidaNum of selectedPartidas) {
                    const partidaInfo = partidas.find(p => p.partida === partidaNum);
                    await db.crearGestionOutboxPendiente({
                        tipo: 'REAGENDAMIENTO',
                        ruta_id: rutaActiva?.id || 0,
                        cita: cita as string,
                        ot: ot as string,
                        partida: partidaNum,
                        terminal: partidaInfo?.terminal || '',
                        nota_novedad: motivo,
                        fecha_reagendada: fechaISO,
                        turno_reagendamiento: turno,
                        latitude: location?.coords.latitude,
                        longitude: location?.coords.longitude,
                        timestamp: new Date().toISOString(),
                    });

                    // Update reagendamiento in context (dedicated map — also marks as completed)
                    setReagendamiento(cita as string, ot as string, partidaNum, {
                        fecha_reagendada: fechaISO,
                        turno_reagendamiento: turno,
                        nota: motivo,
                        reagendadoAt: new Date(),
                        latitude: location?.coords.latitude,
                        longitude: location?.coords.longitude,
                    });
                }

                const count = selectedPartidas.size;
                Alert.alert(
                    'Reagendamiento registrado',
                    `Reagendado para ${count} partida${count > 1 ? 's' : ''} — ${turno} del ${String(dateDay).padStart(2, '0')}/${String(dateMonth).padStart(2, '0')}/${dateYear}.`,
                    [{ text: 'OK', onPress: () => router.replace('/(tabs)/home') }]
                );
            } else {
                Alert.alert('Error', 'No se pudo acceder a la base de datos local.');
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Hubo un problema al guardar el reagendamiento.');
        } finally {
            isSavingRef.current = false;
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                title: currentStep === 0 ? 'Seleccionar Partidas' : 'Reagendar Servicio',
            }} />

            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* ── STEP 0: Select Partidas ── */}
                {currentStep === 0 && (
                    <>
                        <View style={styles.section}>
                            <Text style={styles.stepTitle}>¿Para cuáles partidas aplica el reagendamiento?</Text>
                            <Text style={styles.stepSubtitle}>Seleccione las partidas que se deben reagendar</Text>
                        </View>

                        <View style={styles.section}>
                            <TouchableOpacity style={styles.selectAllButton} onPress={toggleSelectAll}>
                                <Ionicons
                                    name={selectedPartidas.size === partidas.length ? 'checkbox' : 'square-outline'}
                                    size={24}
                                    color="#8e44ad"
                                />
                                <Text style={styles.selectAllText}>
                                    {selectedPartidas.size === partidas.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                                </Text>
                            </TouchableOpacity>

                            {partidas.map(p => {
                                const isCompleted = isServiceCompleted(p.cita, p.ot, p.partida);
                                const isSelected = selectedPartidas.has(p.partida);
                                return (
                                    <TouchableOpacity
                                        key={p.partida}
                                        style={[
                                            styles.partidaCheckbox,
                                            isSelected && styles.partidaCheckboxSelected,
                                            isCompleted && !isSelected && { borderColor: '#27ae60', borderWidth: 1 },
                                        ]}
                                        onPress={() => togglePartida(p.partida)}
                                    >
                                        <Ionicons
                                            name={isSelected ? 'checkbox' : 'square-outline'}
                                            size={24}
                                            color={isSelected ? '#8e44ad' : isCompleted ? '#27ae60' : '#fff'}
                                        />
                                        <View style={styles.partidaCheckboxInfo}>
                                            <Text style={[styles.partidaCheckboxTitle, isCompleted && !isSelected && { color: '#27ae60' }]}>
                                                Partida N° {p.partida}
                                            </Text>
                                            <Text style={styles.partidaCheckboxSubtitle}>
                                                {p.terminal || 'Sin terminal'} - {p.tipo_incidente || 'Sin tipo'}
                                            </Text>
                                            {isCompleted && (
                                                <Text style={styles.partidaCompletedBadge}>✓ Ya gestionada (puede re-gestionar)</Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity
                            style={[styles.continueButton, selectedPartidas.size === 0 && styles.continueButtonDisabled]}
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

                {/* ── STEP 1: Reagendamiento Form ── */}
                {currentStep === 1 && (
                    <>
                        {partidas.length > 1 && (
                            <TouchableOpacity style={styles.backStepButton} onPress={() => setCurrentStep(0)}>
                                <Ionicons name="arrow-back" size={20} color="#8e44ad" />
                                <Text style={styles.backStepText}>
                                    Cambiar partidas ({selectedPartidas.size} seleccionadas)
                                </Text>
                            </TouchableOpacity>
                        )}

                        {/* Nueva fecha */}
                        <View style={styles.section}>
                            <Text style={styles.label}>Nueva fecha:</Text>
                            <View style={styles.spinnerRow}>
                                <SpinnerColumn
                                    label="Día"
                                    display={String(dateDay).padStart(2, '0')}
                                    onIncrement={() => {
                                        const max = daysInMonth(dateMonth, dateYear);
                                        setDateDay(d => d >= max ? 1 : d + 1);
                                    }}
                                    onDecrement={() => {
                                        const max = daysInMonth(dateMonth, dateYear);
                                        setDateDay(d => d <= 1 ? max : d - 1);
                                    }}
                                />
                                <SpinnerColumn
                                    label="Mes"
                                    display={MONTH_NAMES[dateMonth - 1]}
                                    onIncrement={() => {
                                        const next = dateMonth >= 12 ? 1 : dateMonth + 1;
                                        setDateMonth(next);
                                        const maxD = daysInMonth(next, dateYear);
                                        if (dateDay > maxD) setDateDay(maxD);
                                    }}
                                    onDecrement={() => {
                                        const next = dateMonth <= 1 ? 12 : dateMonth - 1;
                                        setDateMonth(next);
                                        const maxD = daysInMonth(next, dateYear);
                                        if (dateDay > maxD) setDateDay(maxD);
                                    }}
                                />
                                <SpinnerColumn
                                    label="Año"
                                    display={String(dateYear)}
                                    onIncrement={() => setDateYear(y => y + 1)}
                                    onDecrement={() => setDateYear(y => y > 2020 ? y - 1 : y)}
                                />
                            </View>
                        </View>

                        {/* Turno */}
                        <View style={styles.section}>
                            <Text style={styles.label}>Turno:</Text>
                            <View style={styles.turnoRow}>
                                {TURNOS.map(t => (
                                    <TouchableOpacity
                                        key={t}
                                        style={[styles.turnoButton, turno === t && styles.turnoButtonActive]}
                                        onPress={() => setTurno(t)}
                                    >
                                        <Text style={[styles.turnoText, turno === t && styles.turnoTextActive]}>
                                            {t}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Motivo */}
                        <View style={styles.section}>
                            <Text style={styles.label}>Motivo del reagendamiento:</Text>
                            <TextInput
                                style={styles.input}
                                multiline
                                numberOfLines={4}
                                placeholder="Describa el motivo por el cual se reagenda el servicio..."
                                placeholderTextColor="#aaa"
                                value={motivo}
                                onChangeText={setMotivo}
                            />
                        </View>

                        {/* Location */}
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
                                        <Ionicons name="calendar-outline" size={24} color="#fff" />
                                        <Text style={styles.saveButtonText}>
                                            REAGENDAR {selectedPartidas.size} PARTIDA{selectedPartidas.size > 1 ? 'S' : ''}
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
        paddingBottom: 120,
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
        minHeight: 100,
    },
    spinnerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 8,
    },
    turnoRow: {
        flexDirection: 'row',
        gap: 10,
    },
    turnoButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        backgroundColor: '#1e1e1e',
        borderWidth: 1,
        borderColor: '#444',
    },
    turnoButtonActive: {
        backgroundColor: '#6c3483',
        borderColor: '#8e44ad',
    },
    turnoText: {
        color: '#888',
        fontWeight: 'bold',
        fontSize: 13,
    },
    turnoTextActive: {
        color: '#fff',
    },
    locationText: {
        color: '#4ade80',
        fontSize: 14,
    },
    errorText: {
        color: '#ef4444',
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
        backgroundColor: '#6c3483',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#8e44ad',
    },
    disabledButton: {
        opacity: 0.7,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 10,
    },
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
    selectAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginBottom: 12,
        borderRadius: 8,
        backgroundColor: '#1e1e1e',
    },
    selectAllText: {
        color: '#8e44ad',
        fontSize: 16,
        marginLeft: 12,
    },
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
        borderColor: '#8e44ad',
        backgroundColor: '#1f1229',
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
        color: '#27ae60',
        fontSize: 11,
        marginTop: 4,
    },
    continueButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#6c3483',
        padding: 16,
        borderRadius: 12,
        gap: 8,
        borderWidth: 1,
        borderColor: '#8e44ad',
    },
    continueButtonDisabled: {
        opacity: 0.4,
    },
    continueButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    backStepButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 6,
    },
    backStepText: {
        color: '#8e44ad',
        fontSize: 14,
    },
});
