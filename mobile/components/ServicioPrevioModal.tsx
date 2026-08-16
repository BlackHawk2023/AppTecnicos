import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ConsultasService, ServicioInfo } from '../services/consultas.service';

interface Props {
    visible: boolean;
    onClose: () => void;
    /** Servicios previos sincronizados (offline) — máximo 1 (el último de la terminal) */
    serviciosPrevios?: ServicioInfo[];
    /** Terminal para consultar el historial completo online */
    terminal?: string | null;
    /** Identificación de la partida actual (solo contexto visual) */
    contextLabel?: string;
    /** Título alternativo (p. ej. para resultados de consulta) */
    titleOverride?: string;
    /** Si true, las cards se renderizan expandidas por defecto (sin paso extra de selección) */
    defaultExpanded?: boolean;
}

const formatFecha = (fecha?: string | null) => {
    if (!fecha) return '—';
    try {
        const d = new Date(fecha);
        if (isNaN(d.getTime())) return fecha;
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return fecha;
    }
};

const formatMateriales = (items?: any[] | null): string => {
    if (!items || items.length === 0) return 'Sin materiales';
    return items
        .map(m => {
            const cod = m?.codigo_material || m?.material || 'Material';
            const serie = m?.serie || m?.serie_o_cantidad;
            const cant = m?.cantidad;
            const nombre = m?.nombre || m?.nombre_material;
            const cond = m?.condicion ? ` · ${m.condicion}` : '';
            const detalle = serie ? ` (${serie})` : cant ? ` x${cant}` : '';
            return `${cod}${nombre ? ` - ${nombre}` : ''}${detalle}${cond}`;
        })
        .join('\n');
};

interface CardProps {
    servicio: ServicioInfo;
    expanded?: boolean;
    onToggle?: () => void;
}

function ServicioPrevioCard({ servicio, expanded, onToggle }: CardProps) {
    const gestion = servicio.gestion;
    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                    {servicio.denominacion || `OT ${servicio.ot} · Partida ${servicio.partida}`}
                </Text>
                {onToggle && (
                    <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#888" />
                    </TouchableOpacity>
                )}
            </View>

            {expanded && (
                <View style={styles.cardBody}>
                    <Field label="Cita" value={servicio.cita} />
                    <Field label="OT" value={servicio.ot} />
                    <Field label="Partida" value={String(servicio.partida)} />
                    <Field label="Tipo de Incidente" value={servicio.tipo_incidente} />
                    <Field label="Fecha de Cierre" value={formatFecha(servicio.fecha_cierre)} />
                    <Field label="Estado" value={servicio.estado} />
                    <Field label="Sub Estado" value={servicio.subestado} />
                    <Field label="Motivo de Cierre" value={servicio.motivo_cierre} />
                    <Field label="Sub Motivo" value={servicio.sub_motivo_cierre} />
                    <Field label="Observaciones de Cierre" value={servicio.observaciones_cierre} multiline />
                    <Field label="Recurso" value={servicio.recurso} />

                    {gestion ? (
                        <View style={styles.gestionBox}>
                            <Text style={styles.gestionTitle}>GESTIÓN</Text>
                            <Field label="Nombre" value={gestion.nombre} />
                            <Field label="DNI" value={gestion.dni} />
                            <Field label="Técnico" value={gestion.tecnico_nombre} />
                            <Field label="Tipo" value={gestion.tipo_gestion} />
                            <Field label="Fecha" value={formatFecha(gestion.fecha_gestion)} />
                            <Field label="Materiales Entregados" value={formatMateriales(gestion.material_entregado)} multiline />
                            <Field label="Materiales Retirados" value={formatMateriales(gestion.material_retirado)} multiline />
                        </View>
                    ) : (
                        <Text style={styles.sinGestion}>Sin gestión registrada para este servicio.</Text>
                    )}
                </View>
            )}
        </View>
    );
}

const Field = ({ label, value, multiline }: { label: string; value?: string | null; multiline?: boolean }) => (
    <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{label}:</Text>
        <Text style={[styles.fieldValue, multiline && styles.fieldValueMultiline]} numberOfLines={multiline ? undefined : 2}>
            {value && String(value).trim() ? String(value) : '—'}
        </Text>
    </View>
);

export default function ServicioPrevioModal({ visible, onClose, serviciosPrevios = [], terminal, contextLabel, titleOverride, defaultExpanded = false }: Props) {
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
    const [historial, setHistorial] = useState<ServicioInfo[] | null>(null);
    const [loadingHistorial, setLoadingHistorial] = useState(false);

    const keyOf = (s: ServicioInfo) => `${s.cita}-${s.ot}-${s.partida}`;

    useEffect(() => {
        if (visible) {
            setHistorial(null);
            setExpandedKeys(defaultExpanded ? new Set(serviciosPrevios.map(keyOf)) : new Set());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, defaultExpanded]);

    const toggle = (key: string) => {
        setExpandedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const fetchHistorialCompleto = async () => {
        if (!terminal) return;
        setLoadingHistorial(true);
        try {
            const result = await ConsultasService.consultarServicios({ terminal, completo: true });
            setHistorial(result);
            if (defaultExpanded) {
                setExpandedKeys(new Set(result.map(keyOf)));
            }
        } catch (error: any) {
            Alert.alert(
                'Error de conexión',
                error?.response?.data?.detail || 'No se pudo consultar el historial. Verifique su conexión e intente nuevamente.'
            );
        } finally {
            setLoadingHistorial(false);
        }
    };

    const displayList = historial !== null ? historial : serviciosPrevios;
    const showingHistory = historial !== null;

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <Ionicons name="information-circle-outline" size={22} color="#3498db" />
                            <Text style={styles.headerTitle}>
                                {titleOverride || (showingHistory ? 'Historial de la terminal' : 'Servicio previo')}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="close" size={26} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {contextLabel ? <Text style={styles.contextLabel}>{contextLabel}</Text> : null}

                    <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 24 }}>
                        {displayList.length === 0 ? (
                            <View style={styles.emptyBox}>
                                <Ionicons name="archive-outline" size={40} color="#555" />
                                <Text style={styles.emptyText}>
                                    {showingHistory
                                        ? 'No se encontraron servicios previos para esta terminal.'
                                        : 'No hay servicios previos para esta terminal.'}
                                </Text>
                            </View>
                        ) : (
                            displayList.map(servicio => {
                                const key = keyOf(servicio);
                                const expanded = expandedKeys.has(key);
                                return (
                                    <ServicioPrevioCard
                                        key={key}
                                        servicio={servicio}
                                        expanded={expanded}
                                        onToggle={defaultExpanded ? undefined : () => toggle(key)}
                                    />
                                );
                            })
                        )}

                        {!showingHistory && terminal && (
                            <TouchableOpacity
                                style={[styles.historyButton, loadingHistorial && styles.historyButtonDisabled]}
                                onPress={fetchHistorialCompleto}
                                disabled={loadingHistorial}
                            >
                                {loadingHistorial ? (
                                    <ActivityIndicator size="small" color="#3498db" />
                                ) : (
                                    <>
                                        <Ionicons name="time-outline" size={16} color="#3498db" />
                                        <Text style={styles.historyButtonText}>Ver historial completo</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: '#1a1a1a',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '85%',
        paddingTop: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#2a2a2a',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    contextLabel: {
        color: '#888',
        fontSize: 12,
        paddingHorizontal: 16,
        paddingTop: 10,
    },
    body: {
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    card: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#3498db',
        padding: 12,
        marginBottom: 10,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cardTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
        marginRight: 8,
    },
    cardBody: {
        marginTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#2a2a2a',
        paddingTop: 10,
    },
    fieldRow: {
        flexDirection: 'row',
        marginBottom: 5,
    },
    fieldLabel: {
        color: '#888',
        width: 130,
        fontSize: 12,
    },
    fieldValue: {
        color: '#ddd',
        flex: 1,
        fontSize: 12,
    },
    fieldValueMultiline: {
        lineHeight: 17,
    },
    gestionBox: {
        backgroundColor: '#252525',
        borderRadius: 8,
        padding: 10,
        marginTop: 8,
    },
    gestionTitle: {
        color: '#3498db',
        fontSize: 11,
        fontWeight: 'bold',
        marginBottom: 6,
        letterSpacing: 0.5,
    },
    sinGestion: {
        color: '#666',
        fontSize: 12,
        fontStyle: 'italic',
        marginTop: 8,
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
    historyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: '#3498db',
        borderRadius: 8,
        padding: 12,
        marginTop: 6,
    },
    historyButtonDisabled: {
        opacity: 0.6,
    },
    historyButtonText: {
        color: '#3498db',
        fontSize: 14,
        fontWeight: '600',
    },
});
