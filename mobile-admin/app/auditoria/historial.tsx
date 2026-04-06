/**
 * Pantalla de Historial de Auditorías
 * Muestra el historial de auditorías realizadas
 * 
 * NOTA: El backend no tiene un endpoint dedicado para historial de auditorías.
 * Esta pantalla es un placeholder que muestra información básica.
 * A futuro se puede conectar con un endpoint /audit/historial cuando se implemente.
 */
import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

export default function HistorialAuditoriasScreen() {
    const { user, codigoBase } = useAuth();

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Header informativo */}
                <View style={styles.infoCard}>
                    <Text style={styles.infoIcon}>📋</Text>
                    <Text style={styles.infoTitle}>Historial de Auditorías</Text>
                    <Text style={styles.infoText}>
                        Aquí se mostrarán las auditorías realizadas en la base {codigoBase || 'N/A'}.
                    </Text>
                </View>

                {/* Placeholder - No hay endpoint backend aún */}
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>🔍</Text>
                    <Text style={styles.emptyText}>Funcionalidad en desarrollo</Text>
                    <Text style={styles.emptySubtext}>
                        El historial de auditorías estará disponible próximamente.
                        Por ahora puede realizar auditorías desde la opción "Realizar Auditoría".
                    </Text>
                </View>

                {/* Botón para realizar nueva auditoría */}
                <TouchableOpacity
                    style={styles.newAuditButton}
                    onPress={() => router.push('/auditoria/realizar')}
                >
                    <Text style={styles.newAuditIcon}>🔍</Text>
                    <Text style={styles.newAuditText}>Realizar Nueva Auditoría</Text>
                </TouchableOpacity>

                {/* Botón volver */}
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Text style={styles.backButtonText}>Volver</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    scrollContent: {
        padding: Spacing.md,
        paddingBottom: Spacing.xxl,
    },
    infoCard: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        alignItems: 'center',
        marginBottom: Spacing.lg,
        ...Shadows.sm,
    },
    infoIcon: {
        fontSize: 40,
        marginBottom: Spacing.sm,
    },
    infoTitle: {
        fontSize: FontSizes.xl,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: Spacing.xs,
    },
    infoText: {
        fontSize: FontSizes.md,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: Spacing.xxl,
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.lg,
        ...Shadows.sm,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: Spacing.md,
    },
    emptyText: {
        fontSize: FontSizes.lg,
        color: Colors.text,
        fontWeight: '500',
        marginBottom: Spacing.sm,
    },
    emptySubtext: {
        fontSize: FontSizes.md,
        color: Colors.textSecondary,
        textAlign: 'center',
        paddingHorizontal: Spacing.lg,
    },
    newAuditButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginBottom: Spacing.md,
        ...Shadows.sm,
    },
    newAuditIcon: {
        fontSize: 20,
        marginRight: Spacing.sm,
    },
    newAuditText: {
        color: Colors.white,
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    backButton: {
        alignItems: 'center',
        padding: Spacing.md,
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    backButtonText: {
        fontSize: FontSizes.md,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
});
