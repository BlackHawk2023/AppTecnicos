import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRoute } from '../contexts/RouteContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotificacionesAppModal } from '../components/NotificacionesAppModal';
import { createDatabaseService } from '../db/database';
import type { AppNotificacion } from '../db/database';

export default function ServiceDetailScreen() {
    console.log('ServiceDetailScreen MOUNTED');
    const params = useLocalSearchParams();
    const router = useRouter();
    const { getServicesByOT, getGeneratedOrder, getReportedNovedad, isServiceCompleted } = useRoute();
    const [partidas, setPartidas] = useState<any[]>([]);
    const insets = useSafeAreaInsets();

    // Novedades modal state
    const [novedadesModal, setNovedadesModal] = useState<{
        visible: boolean;
        novedades: any[];
    }>({ visible: false, novedades: [] });

    // App notificaciones modal state
    const [notifModal, setNotifModal] = useState<{
        visible: boolean;
        items: AppNotificacion[];
    }>({ visible: false, items: [] });
    // Prevenir re-apertura en la misma sesión
    const notificacionesYaMostradas = useRef(false);

    const { cita, ot } = params;

    // Get all partidas for this OT
    useEffect(() => {
        if (cita && ot) {
            const foundPartidas = getServicesByOT(cita as string, ot as string);
            if (foundPartidas.length > 0) {
                setPartidas(foundPartidas);
                console.log(`ServiceDetail: Found ${foundPartidas.length} partidas for OT ${ot}`);
                // Check app notifications for this set of partidas
                checkAppNotificaciones(foundPartidas);
            } else {
                console.log('ServiceDetail: No partidas found for this OT');
            }
        }
    }, [cita, ot, getServicesByOT]);

    // Check if any app notification matches this set of partidas
    const checkAppNotificaciones = async (currentPartidas: any[]) => {
        if (notificacionesYaMostradas.current) return;
        try {
            const db = createDatabaseService();
            await db.init();
            const all = await db.getAppNotificaciones();
            console.log(`ServiceDetail: Fetched ${all?.length || 0} app notifications from local DB`);
            if (all && all.length > 0) {
                console.log(`ServiceDetail: NOTIF DBS DUMP: ${JSON.stringify(all)}`);
            }
            if (!all || all.length === 0) return;

            const matchedIds = new Set<string>();
            const matched: AppNotificacion[] = [];

            for (const notif of all) {
                if (matchedIds.has(notif.id)) continue;
                // A notification matches if ALL non-empty conditions match at least one partida
                const matchesSomePartida = currentPartidas.some(p => {
                    const bCamp = p['campaña'] || p.campania || '';
                    const tipoOk = !notif.tipo_incidente || notif.tipo_incidente.trim() === (p.tipo_incidente || '').trim();
                    const productoOk = !notif.producto || notif.producto.trim() === (p.producto || '').trim();
                    const campaniaOk = !notif.campania || notif.campania.trim() === bCamp.trim();

                    console.log(`ServiceDetail: Comparing n.tipo="${notif.tipo_incidente}" vs p.tipo="${p.tipo_incidente}" -> ${tipoOk}`);
                    console.log(`ServiceDetail: Comparing n.prod="${notif.producto}" vs p.prod="${p.producto}" -> ${productoOk}`);
                    console.log(`ServiceDetail: Comparing n.camp="${notif.campania}" vs p.camp="${bCamp}" -> ${campaniaOk}`);

                    return tipoOk && productoOk && campaniaOk;
                });
                if (matchesSomePartida) {
                    console.log(`ServiceDetail: -> MATCHED Notification ${notif.id}`);
                    matchedIds.add(notif.id);
                    matched.push(notif);
                }
            }

            if (matched.length > 0) {
                notificacionesYaMostradas.current = true;
                setNotifModal({ visible: true, items: matched });
                console.log(`ServiceDetail: Showing ${matched.length} app notification(s)`);
            }
        } catch (e) {
            console.log('ServiceDetail: Error checking app notifications:', e);
        }
    };

    // Use first partida for client info (all have same client data)
    const clientInfo = partidas.length > 0 ? partidas[0] : null;

    const handleOpenMap = () => {
        if (!clientInfo) return;

        const { latitud, longitud, domicilio, localidad } = clientInfo;
        const query = latitud && longitud
            ? `${latitud},${longitud}`
            : `${domicilio}, ${localidad}`;

        const url = Platform.select({
            ios: `maps:0,0?q=${query}`,
            android: `geo:0,0?q=${query}`,
            web: `https://www.google.com/maps/search/?api=1&query=${query}`
        });

        if (url) {
            Linking.openURL(url);
        }
    };

    // Navigate to novedad screen (will need to select partidas there)
    const handleCargarNovedad = () => {
        router.push({
            pathname: '/servicio/novedad',
            params: {
                cita: cita as string,
                ot: ot as string,
            }
        });
    };

    // Navigate to order generation (will need to select partidas there)
    const handleGenerarOrden = () => {
        router.push({
            pathname: '/servicio/ejecucion' as any,
            params: {
                cita: cita as string,
                ot: ot as string,
            }
        });
    };

    // Helper to get partida status (order or novedad)
    const getPartidaStatus = (p: any) => {
        const order = getGeneratedOrder(p.cita, p.ot, p.partida);
        const novedad = getReportedNovedad(p.cita, p.ot, p.partida);
        if (order) return { type: 'orden', data: order };
        if (novedad) return { type: 'novedad', data: novedad };
        return { type: 'pendiente', data: null };
    };

    // Check how many partidas are completed
    const completedCount = partidas.filter(p => isServiceCompleted(p.cita, p.ot, p.partida)).length;
    const allCompleted = partidas.length > 0 && completedCount === partidas.length;

    // Handle phone call
    const handleCall = () => {
        const telefono = clientInfo?.telefono || clientInfo?.telefono1;

        if (!telefono) {
            Alert.alert('Sin teléfono', 'Este servicio no tiene teléfono registrado');
            return;
        }

        const numeroLimpio = telefono.replace(/[^0-9+]/g, '');

        Linking.openURL(`tel:${numeroLimpio}`).catch(err => {
            Alert.alert('Error', 'No se pudo abrir la aplicación de teléfono');
        });
    };

    // Show novedades previas modal
    const handleShowNovedades = () => {
        // Collect all novedades from all partidas
        const allNovedades: any[] = [];
        partidas.forEach(p => {
            if (p.novedades_previas && p.novedades_previas.length > 0) {
                allNovedades.push(...p.novedades_previas);
            }
        });

        if (allNovedades.length === 0) {
            Alert.alert('Sin novedades', 'No hay novedades previas registradas');
            return;
        }
        setNovedadesModal({ visible: true, novedades: allNovedades });
    };

    // Count total novedades previas
    const totalNovedadesPrevias = partidas.reduce((acc, p) =>
        acc + (p.novedades_previas?.length || 0), 0
    );

    // Render a single partida card
    const renderPartidaCard = (p: any, index: number) => {
        const status = getPartidaStatus(p);

        return (
            <View key={p.partida} style={styles.partidaCard}>
                <View style={styles.partidaHeader}>
                    <Text style={styles.partidaTitle}>Partida N° {p.partida}</Text>
                    <View style={[
                        styles.partidaStatus,
                        status.type === 'orden' ? { backgroundColor: '#2ecc71' } :
                            status.type === 'novedad' ? { backgroundColor: '#f39c12' } :
                                { backgroundColor: '#95a5a6' }
                    ]}>
                        <Text style={styles.partidaStatusText}>
                            {status.type === 'orden' ? 'ORDEN' : status.type === 'novedad' ? 'NOVEDAD' : 'PENDIENTE'}
                        </Text>
                    </View>
                </View>

                <View style={styles.partidaContent}>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Terminal:</Text>
                        <Text style={styles.value}>{p.terminal || 'N/A'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Tipo Incidente:</Text>
                        <Text style={styles.value}>{p.tipo_incidente || 'No especificado'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Producto:</Text>
                        <Text style={styles.value}>{p.producto || 'No especificado'}</Text>
                    </View>
                    {p.descripcion_procesada && (
                        <View style={styles.infoRow}>
                            <Text style={styles.label}>Descripción:</Text>
                            <Text style={styles.value} numberOfLines={2}>{p.descripcion_procesada}</Text>
                        </View>
                    )}
                    {p.campaña && (
                        <View style={styles.infoRow}>
                            <Text style={styles.label}>Campaña:</Text>
                            <Text style={styles.value}>{p.campaña}</Text>
                        </View>
                    )}
                    {p.cantidad_papel !== null && p.cantidad_papel !== undefined && (
                        <View style={styles.infoRow}>
                            <Text style={styles.label}>Papel:</Text>
                            <Text style={styles.value}>{p.cantidad_papel} rollo(s)</Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    if (clientInfo) {
        return (
            <ScrollView style={styles.container}>
                <StatusBar style="light" />
                <Stack.Screen options={{ headerShown: false }} />

                <View style={styles.topBar}>
                    <TouchableOpacity onPress={() => router.replace('/(tabs)/home')} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                        <Text style={styles.backButtonText}>Volver</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>OT: {clientInfo.ot}</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Client Info Section */}
                <View style={styles.header}>
                    <View style={styles.titleRow}>
                        <Text style={styles.clientName}>{clientInfo.denominacion || 'Cliente Sin Nombre'}</Text>
                        <View style={[styles.badge, { backgroundColor: allCompleted ? '#2ecc71' : '#f39c12' }]}>
                            <Text style={styles.badgeText}>{completedCount}/{partidas.length} Listas</Text>
                        </View>
                    </View>
                    <Text style={styles.address}>{clientInfo.domicilio}</Text>
                    {!!clientInfo.localidad && (
                        <Text style={styles.location}>{clientInfo.localidad}, {clientInfo.provincia}</Text>
                    )}
                </View>

                <View style={styles.actionsContainer}>
                    <TouchableOpacity style={styles.mapButton} onPress={handleOpenMap}>
                        <Ionicons name="map" size={20} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.mapButtonText}>ABRIR EN MAPA</Text>
                    </TouchableOpacity>

                    {(clientInfo?.telefono || clientInfo?.telefono1) && (
                        <TouchableOpacity style={styles.callButton} onPress={handleCall}>
                            <Ionicons name="call" size={20} color="#fff" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Novedades Previas Button */}
                {totalNovedadesPrevias > 0 && (
                    <TouchableOpacity style={styles.novedadesHistorialButton} onPress={handleShowNovedades}>
                        <Ionicons name="information-circle" size={20} color="#e67e22" />
                        <Text style={styles.novedadesHistorialText}>
                            Ver {totalNovedadesPrevias} novedad(es) previa(s)
                        </Text>
                    </TouchableOpacity>
                )}

                {/* Partidas Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Partidas ({partidas.length})</Text>
                    {partidas.map((p, i) => renderPartidaCard(p, i))}
                </View>

                {/* Action Buttons */}
                <View style={[styles.bottomActions, { marginBottom: insets.bottom + 20 }]}>
                    <TouchableOpacity style={styles.novedadButton} onPress={handleCargarNovedad}>
                        <Ionicons name="alert-circle-outline" size={24} color="#fff" />
                        <Text style={styles.novedadButtonText}>REPORTAR NOVEDAD</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.orderButtonEnabled} onPress={handleGenerarOrden}>
                        <Ionicons name="document-text-outline" size={24} color="#fff" />
                        <Text style={styles.orderButtonTextEnabled}>GENERAR ORDEN</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ height: 40 }} />

                {/* Novedades History Modal */}
                <Modal
                    visible={novedadesModal.visible}
                    animationType="slide"
                    transparent
                    onRequestClose={() => setNovedadesModal({ visible: false, novedades: [] })}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Novedades Previas</Text>
                                <TouchableOpacity onPress={() => setNovedadesModal({ visible: false, novedades: [] })}>
                                    <Ionicons name="close" size={24} color="#333" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.modalScroll}>
                                {novedadesModal.novedades.map((novedad, index) => (
                                    <View key={index} style={styles.novedadHistorialItem}>
                                        <View style={styles.novedadItemHeader}>
                                            <View style={styles.partidaBadgeModal}>
                                                <Text style={styles.partidaBadgeText}>Partida {novedad.partida}</Text>
                                            </View>
                                            <Text style={styles.novedadFecha}>
                                                {novedad.fecha ? new Date(novedad.fecha).toLocaleString('es-AR') : 'Fecha no disponible'}
                                            </Text>
                                        </View>
                                        <Text style={styles.novedadTexto}>{novedad.texto || 'Sin detalle'}</Text>
                                        <Text style={styles.novedadTecnico}>— {novedad.tecnico || 'Técnico'}</Text>
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                {/* App Notifications Modal — mandatory read */}
                <NotificacionesAppModal
                    visible={notifModal.visible}
                    notificaciones={notifModal.items}
                    onClose={() => setNotifModal({ visible: false, items: [] })}
                />
            </ScrollView>
        );
    }

    return (
        <View style={styles.loadingContainer}>
            <Stack.Screen options={{ title: 'Cargando...', headerShown: true }} />
            <Text style={styles.loadingText}>Cargando información...</Text>
            <Text style={{ color: '#666', marginTop: 10 }}>Buscando OT {ot}...</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
        padding: 16,
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: '#121212',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#fff',
        fontSize: 16,
    },
    header: {
        marginBottom: 20,
        backgroundColor: '#1e1e1e',
        padding: 16,
        borderRadius: 12,
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    clientName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        flex: 1,
        marginRight: 10,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    address: {
        fontSize: 16,
        color: '#ddd',
        marginBottom: 4,
    },
    location: {
        fontSize: 14,
        color: '#aaa',
    },
    actionsContainer: {
        flexDirection: 'row',
        marginBottom: 24,
    },
    mapButton: {
        backgroundColor: '#2980b9',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        flex: 1,
    },
    mapButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    section: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        paddingBottom: 8,
    },
    infoRow: {
        flexDirection: 'row',
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        paddingBottom: 8,
    },
    label: {
        color: '#888',
        width: 120,
        fontWeight: '600',
    },
    value: {
        color: '#ddd',
        flex: 1,
    },
    descriptionBox: {
        marginTop: 8,
        backgroundColor: '#252525',
        padding: 12,
        borderRadius: 8,
    },
    descriptionText: {
        color: '#ddd',
        marginTop: 4,
        lineHeight: 20,
    },
    bottomActions: {
        gap: 16,
        marginBottom: 20,
    },
    novedadButton: {
        backgroundColor: '#c0392b',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e74c3c',
    },
    novedadButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
        marginTop: 4,
    },
    novedadSubText: {
        color: '#ffcccc',
        fontSize: 12,
    },
    orderButton: {
        backgroundColor: '#1e1e1e',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
        opacity: 0.7,
    },
    orderButtonText: {
        color: '#aaa',
        fontWeight: 'bold',
        fontSize: 16,
        marginTop: 4,
    },
    orderSubText: {
        color: '#666',
        fontSize: 12,
    },
    orderButtonEnabled: {
        backgroundColor: '#2ecc71',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#27ae60',
    },
    orderButtonTextEnabled: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
        marginTop: 4,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingHorizontal: 8,
        paddingTop: 10,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
    },
    backButtonText: {
        color: '#fff',
        fontSize: 16,
        marginLeft: 4,
        fontWeight: '600',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Order Generated Section Styles
    orderGeneratedSection: {
        backgroundColor: '#1e3a2f',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#2ecc71',
    },
    orderGeneratedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    orderGeneratedTitle: {
        color: '#2ecc71',
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 8,
        flex: 1,
    },
    orderGeneratedStatus: {
        color: '#2ecc71',
        fontSize: 12,
        fontWeight: 'bold',
        backgroundColor: '#145a32',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    orderActions: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    orderActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#252525',
        borderRadius: 8,
        flex: 1,
        justifyContent: 'center',
        marginHorizontal: 4,
    },
    orderActionText: {
        color: '#fff',
        marginLeft: 6,
        fontSize: 14,
    },
    // Novedad Reported Section Styles
    novedadReportedSection: {
        backgroundColor: '#3a2f1e',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#f39c12',
    },
    novedadReportedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    novedadReportedTitle: {
        color: '#f39c12',
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 8,
        flex: 1,
    },
    novedadReportedStatus: {
        color: '#f39c12',
        fontSize: 12,
        fontWeight: 'bold',
        backgroundColor: '#5a3a14',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    novedadContent: {
        marginBottom: 12,
    },
    novedadNoteLabel: {
        color: '#aaa',
        fontSize: 12,
        marginBottom: 4,
    },
    novedadNoteText: {
        color: '#fff',
        fontSize: 14,
    },
    novedadThumbnail: {
        width: '100%',
        height: 120,
        borderRadius: 8,
        marginBottom: 12,
    },
    // Partida Card Styles
    partidaCard: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#333',
    },
    partidaHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    partidaTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    partidaStatus: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    partidaStatusText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    partidaContent: {
        gap: 8,
    },
    // Call button
    callButton: {
        backgroundColor: '#27ae60',
        padding: 12,
        borderRadius: 8,
        marginLeft: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Novedades historial button
    novedadesHistorialButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2d2d2d',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e67e22',
    },
    novedadesHistorialText: {
        color: '#e67e22',
        marginLeft: 8,
        fontSize: 14,
        fontWeight: '600',
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 12,
        maxHeight: '70%',
        padding: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 10,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    modalScroll: {
        maxHeight: 400,
    },
    novedadHistorialItem: {
        padding: 12,
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        marginBottom: 10,
    },
    novedadFecha: {
        fontSize: 12,
        color: '#666',
        marginBottom: 5,
    },
    novedadTexto: {
        fontSize: 14,
        color: '#333',
        marginBottom: 5,
    },
    novedadTecnico: {
        fontSize: 12,
        color: '#888',
        fontStyle: 'italic',
    },
    novedadItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    partidaBadgeModal: {
        backgroundColor: '#3498db',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    partidaBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold',
    },
});
