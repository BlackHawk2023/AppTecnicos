import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useRoute } from '../../contexts/RouteContext';
import { createDatabaseService, GestionRecord } from '../../db/database';

interface GestionGroup {
  cita: string;
  denominacion: string;
  domicilio: string;
  gestiones: GestionRecord[];
  resumen: {
    ordenes: number;
    novedades: number;
    stocks: number;
    conFoto: number;
    pendientes: number;
    sincronizadas: number;
  };
}

const formatTime = (timestamp: string) => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timestamp;
  }
};

const photoCount = (gestion: GestionRecord) => {
  return gestion.order_image_path || gestion.novedad_image_path ? 1 : 0;
};

const GestionesScreen = () => {
  const { rutaActiva, servicios } = useRoute();
  const [groups, setGroups] = useState<GestionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGestion, setSelectedGestion] = useState<GestionRecord | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const buildGroups = (gestiones: GestionRecord[]) => {
    const map = new Map<string, GestionGroup>();

    for (const gestion of gestiones) {
      const key = gestion.cita;
      const service = servicios.find(s => s.cita === gestion.cita);
      const denominacion = service?.denominacion || 'Sin denominación';
      const domicilio = service?.domicilio || '';

      if (!map.has(key)) {
        map.set(key, {
          cita: gestion.cita,
          denominacion,
          domicilio,
          gestiones: [],
          resumen: {
            ordenes: 0,
            novedades: 0,
            stocks: 0,
            conFoto: 0,
            pendientes: 0,
            sincronizadas: 0,
          },
        });
      }

      const group = map.get(key)!;
      group.gestiones.push(gestion);

      if (gestion.tipo === 'ORDEN') {
        group.resumen.ordenes += 1;
      } else if (gestion.tipo === 'STOCK') {
        group.resumen.stocks += 1;
      } else {
        group.resumen.novedades += 1;
      }

      group.resumen.conFoto += photoCount(gestion);
      group.resumen.pendientes += gestion.status === 'PENDING' ? 1 : 0;
      group.resumen.sincronizadas += gestion.status === 'SYNCED' ? 1 : 0;
    }

    return Array.from(map.values()).sort((a, b) => a.cita.localeCompare(b.cita));
  };

  const loadGestiones = useCallback(
    async (isRefresh = false) => {
      if (!rutaActiva) {
        setGroups([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const db = createDatabaseService();
        await db.init();
        const gestiones = await db.getGestionesByRuta(rutaActiva.id);
        setGroups(buildGroups(gestiones));
      } catch (error) {
        console.error('Gestiones: Error loading gestiones', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [rutaActiva, servicios]
  );

  useFocusEffect(
    useCallback(() => {
      loadGestiones();
    }, [loadGestiones])
  );

  const openGestionDetail = (gestion: GestionRecord) => {
    setSelectedGestion(gestion);
    setDetailVisible(true);
  };

  const closeGestionDetail = () => {
    setDetailVisible(false);
    setSelectedGestion(null);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3498db" />
      </View>
    );
  }

  if (!rutaActiva) {
    return (
      <View style={styles.centered}>
        <Ionicons name="information-circle-outline" size={48} color="#888" />
        <Text style={styles.emptyTitle}>No hay ruta activa</Text>
        <Text style={styles.emptySubtitle}>Abre la ruta desde la pantalla principal para ver tus gestiones.</Text>
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="help-circle-outline" size={48} color="#888" />
        <Text style={styles.emptyTitle}>No hay gestiones cargadas</Text>
        <Text style={styles.emptySubtitle}>Aún no has registrado órdenes ni novedades en esta ruta.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={groups.map(group => ({ title: group.cita, data: group.gestiones, group }))}
        keyExtractor={item => item.id.toString()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadGestiones(true)}
            tintColor="#3498db"
          />
        }
        renderSectionHeader={({ section }) => {
          const group: GestionGroup = section.group;
          return (
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.citaText}>{group.cita}</Text>
                <Text style={styles.denominacionText}>{group.denominacion}</Text>
                {group.domicilio ? <Text style={styles.domicilioText}>{group.domicilio}</Text> : null}
              </View>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, styles.badgeSecondary, styles.badgeMargin]}>
                  <Text style={styles.badgeLabel}>{group.resumen.ordenes} órdenes</Text>
                </View>
                <View style={[styles.badge, styles.badgeWarning, styles.badgeMargin]}>
                  <Text style={styles.badgeLabel}>{group.resumen.novedades} novedades</Text>
                </View>
                {group.resumen.stocks > 0 && (
                  <View style={[styles.badge, styles.badgeStock]}>
                    <Text style={styles.badgeLabel}>{group.resumen.stocks} stocks</Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
        renderItem={({ item }) => {
          const hasPhoto = !!item.order_image_path || !!item.novedad_image_path;
          const isPending = item.status === 'PENDING';
          return (
            <TouchableOpacity style={styles.itemCard} onPress={() => openGestionDetail(item)}>
              <View style={styles.itemLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name={item.tipo === 'STOCK' ? 'layers' : item.tipo === 'ORDEN' ? 'document-text' : 'alert-circle'}
                    size={20}
                    color={item.tipo === 'STOCK' ? '#2980b9' : item.tipo === 'ORDEN' ? '#2ecc71' : '#f39c12'}
                  />
                </View>
              </View>
              <View style={styles.itemBody}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>OT {item.ot} · P.{item.partida}</Text>
                  <Text style={styles.itemTime}>{formatTime(item.timestamp)}</Text>
                </View>
                <Text style={styles.itemSubtitle}>{item.tipo === 'STOCK' ? 'Stock aplicado' : item.tipo === 'ORDEN' ? 'Orden cargada' : 'Novedad reportada'}</Text>
                <View style={styles.statusRow}>
                  {hasPhoto ? (
                    <View style={[styles.photoBadge, styles.badgeMargin]}>
                      <Ionicons name="camera" size={14} color="#fff" />
                      <Text style={styles.photoText}>Foto</Text>
                    </View>
                  ) : null}
                  <View style={[styles.statusBadge, isPending ? styles.statusPending : styles.statusSynced]}>
                    <Text style={styles.statusText}>{isPending ? 'PENDIENTE' : 'SINCRONIZADO'}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <Modal visible={detailVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalle de gestión</Text>
              <TouchableOpacity onPress={closeGestionDetail} style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {selectedGestion ? (
                <>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Tipo</Text>
                    <Text style={styles.metaValue}>{selectedGestion.tipo}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Cita</Text>
                    <Text style={styles.metaValue}>{selectedGestion.cita}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>OT</Text>
                    <Text style={styles.metaValue}>{selectedGestion.ot}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Partida</Text>
                    <Text style={styles.metaValue}>{selectedGestion.partida}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Estado</Text>
                    <Text style={styles.metaValue}>{selectedGestion.status}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Hora</Text>
                    <Text style={styles.metaValue}>{formatTime(selectedGestion.timestamp)}</Text>
                  </View>
                  {selectedGestion.tipo === 'ORDEN' ? (
                    <>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Tipo de cierre</Text>
                        <Text style={styles.metaValue}>{selectedGestion.tipo_cierre || 'N/A'}</Text>
                      </View>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Detalle</Text>
                        <Text style={styles.metaValue}>{selectedGestion.detalle_trabajo || 'Sin detalle'}</Text>
                      </View>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Observaciones</Text>
                        <Text style={styles.metaValue}>{selectedGestion.observaciones || 'Sin observaciones'}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Nota</Text>
                      <Text style={styles.metaValue}>{selectedGestion.nota_novedad || 'Sin nota'}</Text>
                    </View>
                  )}
                  {selectedGestion.material_retirado ? (
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Material retirado</Text>
                      <Text style={styles.metaValue}>{selectedGestion.material_retirado}</Text>
                    </View>
                  ) : null}
                  {selectedGestion.material_entregado ? (
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Material entregado</Text>
                      <Text style={styles.metaValue}>{selectedGestion.material_entregado}</Text>
                    </View>
                  ) : null}
                  {(selectedGestion.order_image_path || selectedGestion.novedad_image_path) ? (
                    <View style={styles.imageWrapper}>
                      <Text style={styles.metaLabel}>Foto</Text>
                      <Image
                        source={{ uri: selectedGestion.order_image_path || selectedGestion.novedad_image_path || '' }}
                        style={styles.image}
                        resizeMode="contain"
                      />
                    </View>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#121212',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: '#1a1a1a',
  },
  sectionHeaderText: {
    marginBottom: 8,
  },
  citaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  denominacionText: {
    color: '#ccc',
    fontSize: 14,
    marginTop: 4,
  },
  domicilioText: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    marginTop: 6,
  },
  badgeSecondary: {
    backgroundColor: '#2c3e50',
  },
  badgeWarning: {
    backgroundColor: '#2d2e2f',
  },
  badgeStock: {
    backgroundColor: '#1a3a4a',
  },
  badgeLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1a1a1a',
  },
  itemLeft: {
    marginRight: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  itemTime: {
    color: '#888',
    fontSize: 12,
  },
  itemSubtitle: {
    color: '#aaa',
    marginTop: 6,
    fontSize: 13,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  photoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3498db',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
  },
  photoText: {
    color: '#fff',
    marginLeft: 6,
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
  },
  statusPending: {
    backgroundColor: '#e67e22',
  },
  statusSynced: {
    backgroundColor: '#2ecc71',
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: '#252525',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '85%',
    backgroundColor: '#121212',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomColor: '#2c2c2c',
    borderBottomWidth: 1,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  metaRow: {
    marginTop: 14,
  },
  metaLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  metaValue: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  imageWrapper: {
    marginTop: 16,
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginTop: 10,
    backgroundColor: '#1a1a1a',
  },
  badgeMargin: {
    marginRight: 8,
  },
});

export default GestionesScreen;
