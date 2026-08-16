import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { ConsultasService, ServicioInfo } from '../../services/consultas.service';
import ServicioPrevioModal from '../../components/ServicioPrevioModal';

export default function ConsultasScreen() {
    const [terminal, setTerminal] = useState('');
    const [cuit, setCuit] = useState('');
    const [ot, setOt] = useState('');
    const [cita, setCita] = useState('');
    const [resultados, setResultados] = useState<ServicioInfo[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [buscado, setBuscado] = useState(false);
    const [historialCompleto, setHistorialCompleto] = useState(false);

    // Modal de detalle (reutiliza el mismo componente que el servicio previo)
    const [detalleVisible, setDetalleVisible] = useState(false);
    const [detalleServicio, setDetalleServicio] = useState<ServicioInfo | null>(null);

    const buscar = async (completo = false) => {
        if (!terminal.trim() && !cuit.trim() && !ot.trim() && !cita.trim()) {
            Alert.alert('Filtros requeridos', 'Ingrese al menos un criterio: terminal, CUIT, OT o cita.');
            return;
        }
        setLoading(true);
        setBuscado(true);
        setHistorialCompleto(completo);
        try {
            const data = await ConsultasService.consultarServicios({
                terminal: terminal.trim() || undefined,
                cuit: cuit.trim() || undefined,
                ot: ot.trim() || undefined,
                cita: cita.trim() || undefined,
                completo: completo || undefined,
            });
            setResultados(data);
        } catch (error: any) {
            setResultados([]);
            Alert.alert(
                'Error de conexión',
                error?.response?.data?.detail || 'No se pudo realizar la consulta. Verifique su conexión e intente nuevamente.'
            );
        } finally {
            setLoading(false);
        }
    };

    const limpiar = () => {
        setTerminal('');
        setCuit('');
        setOt('');
        setCita('');
        setResultados(null);
        setBuscado(false);
        setHistorialCompleto(false);
    };

    const abrirDetalle = (servicio: ServicioInfo) => {
        setDetalleServicio(servicio);
        setDetalleVisible(true);
    };

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 30 }}>
                <Text style={styles.subtitle}>
                    Consulta informativa de servicios. Podés buscar por terminal, CUIT, OT o cita (al menos uno).
                </Text>

                <View style={styles.formCard}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Terminal</Text>
                        <TextInput
                            style={styles.input}
                            value={terminal}
                            onChangeText={setTerminal}
                            placeholder="N° de terminal"
                            placeholderTextColor="#666"
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>CUIT</Text>
                        <TextInput
                            style={styles.input}
                            value={cuit}
                            onChangeText={setCuit}
                            placeholder="CUIT del cliente"
                            placeholderTextColor="#666"
                            keyboardType="numeric"
                        />
                    </View>

                    <View style={styles.inputRow}>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.inputLabel}>OT</Text>
                            <TextInput
                                style={styles.input}
                                value={ot}
                                onChangeText={setOt}
                                placeholder="Orden de trabajo"
                                placeholderTextColor="#666"
                                autoCapitalize="none"
                            />
                        </View>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.inputLabel}>Cita</Text>
                            <TextInput
                                style={styles.input}
                                value={cita}
                                onChangeText={setCita}
                                placeholder="CITA"
                                placeholderTextColor="#666"
                                autoCapitalize="none"
                            />
                        </View>
                    </View>

                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={styles.searchButton} onPress={() => buscar()} disabled={loading}>
                            {loading ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="search" size={18} color="#fff" />
                                    <Text style={styles.searchButtonText}>BUSCAR</Text>
                                </>
                            )}
                        </TouchableOpacity>
                        {(resultados !== null || buscado) && (
                            <TouchableOpacity style={styles.clearButton} onPress={limpiar}>
                                <Ionicons name="close" size={18} color="#888" />
                                <Text style={styles.clearButtonText}>Limpiar</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {buscado && !loading && resultados !== null && (
                    <>
                        <Text style={styles.resultsTitle}>
                            {resultados.length === 0
                                ? 'Sin resultados'
                                : `${resultados.length} servicio${resultados.length !== 1 ? 's' : ''} encontrado${resultados.length !== 1 ? 's' : ''}`}
                        </Text>
                        {resultados.length === 0 ? (
                            <View style={styles.emptyBox}>
                                <Ionicons name="search-outline" size={40} color="#555" />
                                <Text style={styles.emptyText}>
                                    No se encontraron servicios con los filtros indicados.
                                </Text>
                            </View>
                        ) : (
                            resultados.map(servicio => (
                                <TouchableOpacity
                                    key={`${servicio.cita}-${servicio.ot}-${servicio.partida}`}
                                    style={styles.resultCard}
                                    onPress={() => abrirDetalle(servicio)}
                                >
                                    <View style={styles.resultHeader}>
                                        <Text style={styles.resultTitle}>
                                            {servicio.denominacion || `OT ${servicio.ot} · Partida ${servicio.partida}`}
                                        </Text>
                                        <Ionicons name="chevron-forward" size={20} color="#888" />
                                    </View>
                                    <Text style={styles.resultMeta}>
                                        OT {servicio.ot} · Partida {servicio.partida} · Terminal {servicio.terminal || '—'}
                                    </Text>
                                    <Text style={styles.resultMeta}>
                                        Estado: {servicio.estado || '—'}
                                        {servicio.fecha_cierre ? ` · Cierre: ${new Date(servicio.fecha_cierre).toLocaleDateString('es-AR')}` : ''}
                                    </Text>
                                    {servicio.gestion && (
                                        <Text style={styles.resultGestion}>
                                            ✓ Gestión: {servicio.gestion.nombre || '—'} · {servicio.gestion.dni || '—'}
                                        </Text>
                                    )}
                                    <Text style={styles.resultHint}>Tocar para ver detalle completo</Text>
                                </TouchableOpacity>
                            ))
                        )}

                        {/* Historial completo: solo si la consulta estándar llegó al tope de 20 */}
                        {resultados.length >= 20 && !historialCompleto && (
                            <TouchableOpacity
                                style={styles.historialButton}
                                onPress={() => buscar(true)}
                            >
                                <Ionicons name="time-outline" size={18} color="#3498db" />
                                <Text style={styles.historialButtonText}>
                                    Ver historial completo
                                </Text>
                            </TouchableOpacity>
                        )}
                    </>
                )}
            </ScrollView>

            {/* Detalle del servicio (reutiliza el modal de servicio previo) */}
            <ServicioPrevioModal
                visible={detalleVisible}
                onClose={() => setDetalleVisible(false)}
                serviciosPrevios={detalleServicio ? [detalleServicio] : []}
                terminal={detalleServicio?.terminal}
                titleOverride="Detalle del servicio"
                defaultExpanded
                contextLabel={detalleServicio ? `OT ${detalleServicio.ot} · Partida N° ${detalleServicio.partida}` : undefined}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    content: {
        padding: 16,
    },
    subtitle: {
        color: '#888',
        fontSize: 13,
        marginBottom: 16,
        lineHeight: 18,
    },
    formCard: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
    },
    inputGroup: {
        marginBottom: 12,
    },
    inputRow: {
        flexDirection: 'row',
        gap: 12,
    },
    inputLabel: {
        color: '#888',
        fontSize: 12,
        marginBottom: 6,
    },
    input: {
        backgroundColor: '#121212',
        borderRadius: 8,
        padding: 12,
        color: '#fff',
        fontSize: 15,
        borderWidth: 1,
        borderColor: '#333',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 4,
    },
    searchButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#3498db',
        padding: 14,
        borderRadius: 10,
    },
    searchButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: 'bold',
    },
    clearButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#2a2a2a',
        paddingHorizontal: 16,
        borderRadius: 10,
    },
    clearButtonText: {
        color: '#888',
        fontSize: 14,
        fontWeight: '600',
    },
    resultsTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 10,
    },
    emptyBox: {
        alignItems: 'center',
        paddingVertical: 30,
    },
    emptyText: {
        color: '#888',
        fontSize: 14,
        marginTop: 10,
        textAlign: 'center',
    },
    resultCard: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#3498db',
        padding: 14,
        marginBottom: 10,
    },
    resultHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    resultTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
        flex: 1,
        marginRight: 8,
    },
    resultMeta: {
        color: '#aaa',
        fontSize: 12,
        marginBottom: 3,
    },
    resultGestion: {
        color: '#2ecc71',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 6,
    },
    resultHint: {
        color: '#555',
        fontSize: 11,
        marginTop: 8,
        fontStyle: 'italic',
    },
    historialButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: '#3498db',
        borderRadius: 10,
        padding: 14,
        marginTop: 8,
    },
    historialButtonText: {
        color: '#3498db',
        fontSize: 14,
        fontWeight: '600',
    },
});
