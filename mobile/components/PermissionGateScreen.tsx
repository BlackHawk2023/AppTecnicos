import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PermissionStatus } from '../hooks/useAppPermissions';

interface PermissionGateScreenProps {
    permissions: PermissionStatus[];
    onRecheck: () => void;
}

export function PermissionGateScreen({ permissions, onRecheck }: PermissionGateScreenProps) {
    const handleOpenSettings = async () => {
        if (Platform.OS === 'ios') {
            await Linking.openURL('app-settings:');
        } else if (Platform.OS === 'android') {
            await Linking.openSettings();
        }
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <View style={styles.iconContainer}>
                        <Ionicons name="shield-checkmark" size={48} color="#3498db" />
                    </View>
                    <Text style={styles.title}>Permisos Requeridos</Text>
                    <Text style={styles.subtitle}>
                        Para utilizar la aplicación de técnicos, necesitamos acceso a las siguientes funciones de tu dispositivo.
                    </Text>
                </View>

                <View style={styles.permissionsList}>
                    {permissions.map((perm) => (
                        <View key={perm.name} style={styles.permissionItem}>
                            <View style={styles.permissionInfo}>
                                <View style={[styles.permIconContainer, perm.granted && styles.permIconContainerGranted]}>
                                    <Ionicons
                                        name={perm.icon as any}
                                        size={24}
                                        color={perm.granted ? "#2ecc71" : "#aaa"}
                                    />
                                </View>
                                <Text style={[styles.permissionLabel, perm.granted && styles.permissionLabelGranted]}>
                                    {perm.label}
                                </Text>
                            </View>
                            <Ionicons
                                name={perm.granted ? "checkmark-circle" : "close-circle"}
                                size={28}
                                color={perm.granted ? "#2ecc71" : "#e74c3c"}
                            />
                        </View>
                    ))}
                </View>

                <View style={styles.instructionsContainer}>
                    <Text style={styles.instructionText}>
                        1. Toca &quot;Abrir Configuración&quot;
                    </Text>
                    <Text style={styles.instructionText}>
                        2. Ve a la sección &quot;Permisos&quot;
                    </Text>
                    <Text style={styles.instructionText}>
                        3. Habilita todos los accesos requeridos
                    </Text>
                    <Text style={styles.instructionText}>
                        4. Vuelve a esta aplicación
                    </Text>
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity style={styles.primaryButton} onPress={handleOpenSettings}>
                        <Ionicons name="settings-outline" size={20} color="#fff" style={styles.buttonIcon} />
                        <Text style={styles.primaryButtonText}>Abrir Configuración</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.secondaryButton} onPress={onRecheck}>
                        <Ionicons name="refresh-outline" size={20} color="#3498db" style={styles.buttonIcon} />
                        <Text style={styles.secondaryButtonText}>Ya los activé (Revisar)</Text>
                    </TouchableOpacity>
                </View>
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
        flexGrow: 1,
        padding: 24,
        paddingTop: 60,
        paddingBottom: 40,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 12,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        color: '#aaaaaa',
        textAlign: 'center',
        lineHeight: 22,
        paddingHorizontal: 10,
    },
    permissionsList: {
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#333333',
    },
    permissionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#2a2a2a',
    },
    permissionInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    permIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#2a2a2a',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    permIconContainerGranted: {
        backgroundColor: 'rgba(46, 204, 113, 0.1)',
    },
    permissionLabel: {
        fontSize: 16,
        color: '#cccccc',
        fontWeight: '500',
    },
    permissionLabelGranted: {
        color: '#ffffff',
    },
    instructionsContainer: {
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 32,
        borderLeftWidth: 4,
        borderLeftColor: '#3498db',
    },
    instructionText: {
        color: '#cccccc',
        fontSize: 14,
        marginBottom: 6,
        lineHeight: 20,
    },
    actions: {
        marginTop: 'auto',
    },
    primaryButton: {
        backgroundColor: '#3498db',
        flexDirection: 'row',
        paddingVertical: 16,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    primaryButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    secondaryButton: {
        flexDirection: 'row',
        paddingVertical: 16,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#3498db',
    },
    secondaryButtonText: {
        color: '#3498db',
        fontSize: 16,
        fontWeight: '600',
    },
    buttonIcon: {
        marginRight: 8,
    },
});
