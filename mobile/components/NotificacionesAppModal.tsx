import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    StatusBar,
} from 'react-native';
import type { AppNotificacion } from '../db/database';

// ─── Props ────────────────────────────────────────────────────────────────────

interface NotificacionesAppModalProps {
    visible: boolean;
    notificaciones: AppNotificacion[];
    onClose: () => void;
}

// ─── Color por prioridad ──────────────────────────────────────────────────────

const PRIORIDAD_COLORS: Record<string, { bg: string; border: string; badge: string; text: string }> = {
    critico: { bg: '#fff0f0', border: '#dc2626', badge: '#dc2626', text: '#7f1d1d' },
    importante: { bg: '#fffbeb', border: '#d97706', badge: '#d97706', text: '#78350f' },
    info: { bg: '#eff6ff', border: '#2563eb', badge: '#2563eb', text: '#1e3a8a' },
};

const PRIORIDAD_LABELS: Record<string, string> = {
    critico: '🔴 CRÍTICO',
    importante: '🟡 IMPORTANTE',
    info: '🔵 INFORMACIÓN',
};

// ─── Componente ───────────────────────────────────────────────────────────────

export const NotificacionesAppModal: React.FC<NotificacionesAppModalProps> = ({
    visible,
    notificaciones,
    onClose,
}) => {
    const [leido, setLeido] = useState(false);

    // Reset checkbox cada vez que se abre
    React.useEffect(() => {
        if (visible) setLeido(false);
    }, [visible]);

    if (!visible || notificaciones.length === 0) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={false}
            statusBarTranslucent
            onRequestClose={() => { /* bloquear back button */ }}
        >
            <StatusBar backgroundColor="#1a1a2e" barStyle="light-content" />
            <SafeAreaView style={styles.safeArea}>

                {/* ── Header ──────────────────────────────────────────────────── */}
                <View style={styles.header}>
                    <Text style={styles.headerEmoji}>⚠️</Text>
                    <View style={styles.headerTextContainer}>
                        <Text style={styles.headerTitle}>¡¡ INFORMACIÓN IMPORTANTE !!</Text>
                        <Text style={styles.headerSubtitle}>
                            {notificaciones.length === 1
                                ? '1 notificación requiere tu atención'
                                : `${notificaciones.length} notificaciones requieren tu atención`}
                        </Text>
                    </View>
                </View>

                {/* ── Cuerpo — lista de notificaciones ────────────────────────── */}
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator
                >
                    {notificaciones.map((n, i) => {
                        const colors = PRIORIDAD_COLORS[n.prioridad] || PRIORIDAD_COLORS.info;
                        return (
                            <View
                                key={n.id}
                                style={[
                                    styles.card,
                                    { backgroundColor: colors.bg, borderLeftColor: colors.border }
                                ]}
                            >
                                {/* Badge de prioridad */}
                                <View style={[styles.badge, { backgroundColor: colors.badge }]}>
                                    <Text style={styles.badgeText}>{PRIORIDAD_LABELS[n.prioridad] || 'INFO'}</Text>
                                </View>

                                {/* Número cuando hay múltiples */}
                                {notificaciones.length > 1 && (
                                    <Text style={[styles.cardNumber, { color: colors.text }]}>
                                        Notificación {i + 1} de {notificaciones.length}
                                    </Text>
                                )}

                                {/* Mensaje */}
                                <Text style={[styles.cardMessage, { color: colors.text }]}>{n.mensaje}</Text>

                                {/* Condiciones de match (info para el técnico) */}
                                {(n.tipo_incidente || n.producto || n.campania) && (
                                    <View style={styles.condiciones}>
                                        {n.tipo_incidente ? <Text style={styles.condicionText}>📋 Tipo: {n.tipo_incidente}</Text> : null}
                                        {n.producto ? <Text style={styles.condicionText}>📦 Producto: {n.producto}</Text> : null}
                                        {n.campania ? <Text style={styles.condicionText}>📣 Campaña: {n.campania}</Text> : null}
                                    </View>
                                )}
                            </View>
                        );
                    })}

                    {/* Spacer bottom */}
                    <View style={{ height: 12 }} />
                </ScrollView>

                {/* ── Footer — confirmación ────────────────────────────────────── */}
                <View style={styles.footer}>
                    {/* Checkbox de confirmación */}
                    <TouchableOpacity
                        style={styles.checkboxRow}
                        activeOpacity={0.7}
                        onPress={() => setLeido(!leido)}
                    >
                        <View style={[styles.checkbox, leido && styles.checkboxChecked]}>
                            {leido && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={styles.checkboxLabel}>
                            He leído y entendido toda la información anterior
                        </Text>
                    </TouchableOpacity>

                    {/* Botón cerrar */}
                    <TouchableOpacity
                        style={[styles.closeButton, !leido && styles.closeButtonDisabled]}
                        disabled={!leido}
                        activeOpacity={0.8}
                        onPress={onClose}
                    >
                        <Text style={[styles.closeButtonText, !leido && styles.closeButtonTextDisabled]}>
                            {leido ? 'Confirmar y Continuar' : 'Debe confirmar la lectura primero'}
                        </Text>
                    </TouchableOpacity>
                </View>

            </SafeAreaView>
        </Modal>
    );
};

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        paddingHorizontal: 20,
        paddingTop: 48, // Added padding to avoid status bar overlap
        paddingBottom: 18,
        gap: 14,
    },
    headerEmoji: {
        fontSize: 36,
    },
    headerTextContainer: {
        flex: 1,
    },
    headerTitle: {
        color: '#fbbf24',
        fontSize: 20, // Increased size
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    headerSubtitle: {
        color: '#94a3b8',
        fontSize: 13,
        marginTop: 2,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        gap: 12,
    },
    card: {
        borderRadius: 12,
        borderLeftWidth: 5,
        padding: 16,
        marginBottom: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 3,
    },
    badge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 20,
        marginBottom: 10,
    },
    badgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    cardNumber: {
        fontSize: 11,
        fontWeight: '600',
        marginBottom: 6,
        opacity: 0.7,
    },
    cardMessage: {
        fontSize: 18, // Increased size from 15 to 18
        fontWeight: '500',
        lineHeight: 26, // Adjusted line height
    },
    condiciones: {
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.08)',
        gap: 3,
    },
    condicionText: {
        fontSize: 12,
        color: '#64748b',
    },
    footer: {
        backgroundColor: '#fff',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 40, // Increased bottom padding to avoid navigation bar overlap
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        gap: 14,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#94a3b8',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
        flexShrink: 0,
    },
    checkboxChecked: {
        backgroundColor: '#16a34a',
        borderColor: '#16a34a',
    },
    checkmark: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '900',
    },
    checkboxLabel: {
        flex: 1,
        fontSize: 14,
        color: '#374151',
        lineHeight: 20,
        fontWeight: '500',
    },
    closeButton: {
        backgroundColor: '#16a34a',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#16a34a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    closeButtonDisabled: {
        backgroundColor: '#e2e8f0',
        shadowOpacity: 0,
        elevation: 0,
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    closeButtonTextDisabled: {
        color: '#94a3b8',
    },
});

export default NotificacionesAppModal;
