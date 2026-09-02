import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { StockLocalItem, AuditoriaCampoLocal } from '../db/database';
import { syncService } from '../services/sync.service';

type AuditItem = StockLocalItem & { cantidad_sistema: number; cantidad_fisica: number; confirmado?: boolean; es_sobrante?: boolean; tipo?: 'FALTANTE' | 'SOBRANTE' };
type MaterialRef = { codigo_material: string; nombre_material: string; unidad_medida: string };
let databaseService: any = null;

async function db() {
  if (Platform.OS === 'web') throw new Error('La auditoría de campo requiere la app móvil.');
  if (!databaseService) {
    const { createDatabaseService } = await import('../db/database');
    databaseService = createDatabaseService();
    await databaseService.init();
  }
  return databaseService;
}

export default function AuditoriaCampoScreen() {
  const [audit, setAudit] = useState<AuditoriaCampoLocal | null>(null);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [history, setHistory] = useState<AuditoriaCampoLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [surplusStep, setSurplusStep] = useState<'code' | 'details' | null>(null);
  const [surplusCode, setSurplusCode] = useState('');
  const [surplusMaterial, setSurplusMaterial] = useState<MaterialRef | null>(null);
  const [surplusQuantity, setSurplusQuantity] = useState('1');
  const [surplusSerie, setSurplusSerie] = useState('');
  const [surplusCondition, setSurplusCondition] = useState('BUENO');
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<AuditoriaCampoLocal | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanTarget, setScanTarget] = useState<'search' | 'surplusSerie'>('search');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const load = useCallback(async () => {
    try {
      const service = await db();
      const active = await service.getAuditoriaCampoLocalActiva();
      setAudit(active);
      setItems(active?.items || []);
      setHistory(await service.getAuditoriasCampoFinalizadas(10));
    } catch (error: any) { Alert.alert('Auditoría', error.message || 'No se pudo abrir la auditoría.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const start = async () => {
    const service = await db();
    const stock: StockLocalItem[] = await service.getStockLocal();
    const snapshot: AuditItem[] = stock.map(item => ({ ...item, cantidad_sistema: item.cantidad, cantidad_fisica: item.cantidad, confirmado: false }));
    const id = await service.crearAuditoriaCampoLocal(snapshot, new Date().toISOString());
    setAudit(await service.getAuditoriaCampoLocalActiva());
    setItems(snapshot);
    if (!id) Alert.alert('Auditoría', 'No se pudo iniciar.');
  };

  const updateQuantity = (index: number, value: string) => {
    if (items[index]?.unidad_medida === 'SERIALIZADO') return;
    const cantidad = Math.max(0, Number(value.replace(',', '.')) || 0);
    const next = items.map((item, i) => i === index ? { ...item, cantidad_fisica: cantidad, confirmado: false } : item);
    setItems(next);
  };

  const confirmarItem = async (index: number) => {
    const next = items.map((item, i) => i === index ? { ...item, confirmado: true } : item);
    setItems(next);
    if (audit) await (await db()).guardarItemsAuditoriaCampoLocal(audit.id, next);
    setSearchQuery('');
  };

  const pendientes = items.filter(item => !item.confirmado);
  const confirmados = items.filter(item => item.confirmado);
  const visibleItems = useMemo(() => {
    const source = items.filter(item => showConfirmed ? item.confirmado : !item.confirmado);
    const query = searchQuery.trim().toLowerCase();
    if (!query) return source;
    return source.filter(item => item.codigo_material.toLowerCase().includes(query) || (item.nombre_material || '').toLowerCase().includes(query) || (item.serie || '').toLowerCase().includes(query));
  }, [items, searchQuery, showConfirmed]);

  const saveProgress = async () => {
    if (!audit) return;
    await (await db()).guardarItemsAuditoriaCampoLocal(audit.id, items);
  };

  const openSurplus = () => { setSurplusCode(''); setSurplusMaterial(null); setSurplusQuantity('1'); setSurplusSerie(''); setSurplusCondition('BUENO'); setSurplusStep('code'); };
  const validateSurplusCode = async () => {
    const code = surplusCode.trim().toUpperCase();
    if (!code) return Alert.alert('Excedente', 'Ingresá el código del material.');
    const service = await db();
    const catalog: any[] = await service.getMaterials();
    const catalogItem = catalog.find(item => (item.codigo_material || '').toUpperCase() === code);
    const stockItem = items.find(item => item.codigo_material.toUpperCase() === code);
    const material: MaterialRef | null = catalogItem ? { codigo_material: code, nombre_material: catalogItem.nombre || '', unidad_medida: catalogItem.unidad_medida || 'UNIDAD' } : stockItem ? { codigo_material: code, nombre_material: stockItem.nombre_material || '', unidad_medida: stockItem.unidad_medida || 'UNIDAD' } : null;
    if (!material) return Alert.alert('Código no válido', 'El material no existe en el catálogo local. Sincronizá los datos e intentá nuevamente.');
    setSurplusMaterial(material); setSurplusStep('details');
  };
  const addSurplus = async () => {
    if (!surplusMaterial) return;
    const serialized = surplusMaterial.unidad_medida === 'SERIALIZADO';
    const serie = surplusSerie.trim().toUpperCase();
    const quantity = Math.max(1, Number(surplusQuantity.replace(',', '.')) || 0);
    if (serialized && !serie) return Alert.alert('Excedente serializado', 'Ingresá o escaneá el número de serie.');
    if (!serialized && !quantity) return Alert.alert('Excedente', 'Ingresá una cantidad válida.');
    const duplicated = serialized
      ? items.some(item => item.codigo_material.toUpperCase() === surplusMaterial.codigo_material && (item.serie || '').toUpperCase() === serie)
      : items.some(item => item.codigo_material.toUpperCase() === surplusMaterial.codigo_material && !item.serie && item.condicion === surplusCondition);
    if (duplicated) return Alert.alert('Material duplicado', serialized ? 'Ese código y número de serie ya existen en el stock o fueron cargados como excedente.' : 'Ese código y condición ya existen en el stock o fueron cargados como excedente. Corregí la cantidad del ítem existente si corresponde.');
    const next: AuditItem[] = [...items, { codigo_material: surplusMaterial.codigo_material, nombre_material: surplusMaterial.nombre_material, unidad_medida: surplusMaterial.unidad_medida, serie: serialized ? serie : null, cantidad: 0, condicion: surplusCondition, cantidad_sistema: 0, cantidad_fisica: serialized ? 1 : quantity, confirmado: true, es_sobrante: true, tipo: 'SOBRANTE' }];
    setItems(next);
    if (audit) await (await db()).guardarItemsAuditoriaCampoLocal(audit.id, next);
    setSurplusStep(null);
  };

  const startScanning = async (target: 'search' | 'surplusSerie') => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) return Alert.alert('Permiso requerido', 'Necesitás permitir el acceso a la cámara para escanear.');
    }
    setScanTarget(target); setIsScanning(true);
  };
  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setIsScanning(false);
    if (scanTarget === 'search') { setSearchQuery(data); setShowConfirmed(false); }
    else setSurplusSerie(data);
  };

  const complete = async () => {
    if (!audit) return;
    await saveProgress();
    // Un ítem que no fue confirmado se considera físicamente ausente. Esto
    // permite cerrar una auditoría incompleta sin ocultar sus faltantes.
    const auditedItems = items.map(item => !item.confirmado && !item.es_sobrante
      ? { ...item, cantidad_fisica: 0 }
      : item);
    const finalizedItems: AuditItem[] = auditedItems.map(item => ({
      ...item,
      tipo: item.cantidad_fisica > item.cantidad_sistema ? 'SOBRANTE' : item.cantidad_fisica < item.cantidad_sistema ? 'FALTANTE' : undefined,
    }));
    const differences = finalizedItems.filter(item => item.tipo).map(item => ({
      codigo_material: item.codigo_material, nombre_material: item.nombre_material, unidad_medida: item.unidad_medida,
      serie: item.serie, condicion: item.condicion, cantidad_sistema: item.cantidad_sistema,
      cantidad_fisica: item.cantidad_fisica, tipo: item.cantidad_fisica > item.cantidad_sistema ? 'SOBRANTE' : 'FALTANTE',
    }));
    const faltantes = differences.filter(item => item.tipo === 'FALTANTE').length;
    const sobrantes = differences.filter(item => item.tipo === 'SOBRANTE').length;
    await (await db()).guardarItemsAuditoriaCampoLocal(audit.id, finalizedItems);
    await (await db()).completarAuditoriaCampoLocal(audit.id, faltantes, sobrantes, differences.length ? 'CON_DIFERENCIAS' : 'OK', new Date().toISOString());
    await syncService.syncAuditoriasCampo();
    Alert.alert('Auditoría completada', differences.length ? `${differences.length} diferencia(s) registrada(s).` : 'Stock verificado sin diferencias.');
    await load();
  };

  const cancel = () => Alert.alert('Cancelar auditoría', 'Se eliminará el borrador local.', [
    { text: 'Volver', style: 'cancel' },
    { text: 'Cancelar auditoría', style: 'destructive', onPress: async () => { if (audit) await (await db()).cancelarAuditoriaCampoLocal(audit.id); await load(); } },
  ]);

  if (loading) return <View style={styles.center}><Text style={styles.text}>Cargando…</Text></View>;
  return <View style={styles.page}>
    <Stack.Screen options={{ title: 'Auditoría de campo' }} />
    {!audit ? <>
      <Text style={styles.title}>Control de stock</Text>
      <Text style={styles.muted}>El snapshot se toma de tu stock local y podés continuar sin conexión.</Text>
      <TouchableOpacity style={styles.primary} onPress={start}><Ionicons name="play" size={18} color="#fff" /><Text style={styles.primaryText}>Iniciar auditoría</Text></TouchableOpacity>
      <Text style={styles.section}>Últimas 10 auditorías</Text>
      <FlatList data={history} keyExtractor={item => String(item.id)} ListEmptyComponent={<Text style={styles.muted}>Todavía no hay auditorías finalizadas.</Text>} renderItem={({ item }) => <TouchableOpacity style={styles.history} onPress={() => setHistoryDetail(item)}><Text style={styles.text}>{item.resultado === 'OK' ? 'Sin diferencias' : `${item.faltantes + item.sobrantes} diferencia(s)`}</Text><Text style={styles.muted}>{new Date(item.fecha_fin!).toLocaleString()} · {item.pendiente_sync ? 'Pendiente de sync' : 'Sincronizada'}</Text><Text style={styles.historyAction}>Ver detalle ›</Text></TouchableOpacity>} />
    </> : <>
      <View style={styles.topline}><View><Text style={styles.title}>Verificá las cantidades</Text><Text style={styles.muted}>{confirmados.length}/{items.length} confirmados</Text></View><TouchableOpacity onPress={cancel}><Text style={styles.danger}>Cancelar</Text></TouchableOpacity></View>
      <View style={styles.progressBg}><View style={[styles.progressFill, { width: `${items.length ? (confirmados.length / items.length) * 100 : 0}%` }]} /></View>
      <View style={styles.searchRow}><Ionicons name="search" size={19} color="#aaa" /><TextInput style={styles.searchInput} value={searchQuery} onChangeText={setSearchQuery} placeholder="Código, material o serie..." placeholderTextColor="#888" autoCapitalize="characters" /><TouchableOpacity onPress={() => startScanning('search')} style={styles.scanButton}><Ionicons name="camera-outline" size={22} color="#5dc4f6" /></TouchableOpacity></View>
      <View style={styles.tabs}><TouchableOpacity style={[styles.tab, !showConfirmed && styles.tabActive]} onPress={() => setShowConfirmed(false)}><Text style={styles.tabText}>Pendientes ({pendientes.length})</Text></TouchableOpacity><TouchableOpacity style={[styles.tab, showConfirmed && styles.tabActive]} onPress={() => setShowConfirmed(true)}><Text style={styles.tabText}>Confirmados ({confirmados.length})</Text></TouchableOpacity></View>
      <FlatList data={visibleItems} keyExtractor={(item, index) => `${item.codigo_material}-${item.serie || index}-${item.condicion}`} contentContainerStyle={styles.list} ListEmptyComponent={<Text style={styles.muted}>{searchQuery ? 'Sin resultados.' : showConfirmed ? 'Aún no hay ítems confirmados.' : 'No hay ítems pendientes.'}</Text>} renderItem={({ item }) => { const index = items.indexOf(item); return <View style={[styles.card, item.confirmado && styles.cardConfirmed]}>
        <Text style={styles.text}>{item.nombre_material || item.codigo_material}</Text><Text style={styles.muted}>{item.codigo_material}{item.serie ? ` · Serie ${item.serie}` : ''} · {item.condicion}</Text>
        <View style={styles.quantity}><Text style={styles.muted}>Sistema: {item.cantidad_sistema}</Text><TextInput editable={!item.confirmado && item.unidad_medida !== 'SERIALIZADO'} style={[styles.input, (item.confirmado || item.unidad_medida === 'SERIALIZADO') && styles.inputLocked]} value={String(item.unidad_medida === 'SERIALIZADO' ? 1 : item.cantidad_fisica)} keyboardType="decimal-pad" onChangeText={value => updateQuantity(index, value)} /><Text style={styles.muted}>Físico</Text></View>
        <TouchableOpacity style={[styles.confirmButton, item.confirmado && styles.confirmedButton]} onPress={() => item.confirmado ? updateQuantity(index, String(item.cantidad_fisica)) : confirmarItem(index)}><Ionicons name={item.confirmado ? 'checkmark-circle' : 'checkmark-circle-outline'} size={18} color="#fff" /><Text style={styles.confirmText}>{item.confirmado ? 'Confirmado · Editar' : 'Confirmar ítem'}</Text></TouchableOpacity>
      </View>}} />
      <TouchableOpacity style={styles.sobrante} onPress={openSurplus}><Ionicons name="add-circle-outline" size={20} color="#58b9ef" /><Text style={styles.add}>Registrar excedente</Text></TouchableOpacity>
      <TouchableOpacity style={styles.primary} onPress={complete}><Ionicons name="checkmark" size={20} color="#fff" /><Text style={styles.primaryText}>Completar auditoría</Text></TouchableOpacity>
    </>}
    <Modal visible={surplusStep !== null} transparent animationType="fade" onRequestClose={() => setSurplusStep(null)}><View style={styles.modalBackdrop}><View style={styles.modalCard}>{surplusStep === 'code' ? <><Text style={styles.modalTitle}>Registrar excedente</Text><Text style={styles.muted}>Ingresá el código de material para validarlo.</Text><TextInput style={styles.modalInput} value={surplusCode} onChangeText={setSurplusCode} autoCapitalize="characters" placeholder="Código de material" placeholderTextColor="#888" autoFocus onSubmitEditing={validateSurplusCode} /><View style={styles.modalActions}><TouchableOpacity onPress={() => setSurplusStep(null)}><Text style={styles.danger}>Cancelar</Text></TouchableOpacity><TouchableOpacity style={styles.smallPrimary} onPress={validateSurplusCode}><Text style={styles.primaryText}>Validar</Text></TouchableOpacity></View></> : <><Text style={styles.modalTitle}>{surplusMaterial?.nombre_material || surplusMaterial?.codigo_material}</Text><Text style={styles.muted}>{surplusMaterial?.codigo_material} · {surplusMaterial?.unidad_medida === 'SERIALIZADO' ? 'Serializado' : 'No serializado'}</Text>{surplusMaterial?.unidad_medida === 'SERIALIZADO' ? <View style={styles.seriesRow}><TextInput style={[styles.modalInput, styles.seriesInput]} value={surplusSerie} onChangeText={setSurplusSerie} autoCapitalize="characters" placeholder="Número de serie" placeholderTextColor="#888" /><TouchableOpacity onPress={() => startScanning('surplusSerie')} style={styles.cameraSquare}><Ionicons name="camera-outline" size={22} color="#fff" /></TouchableOpacity></View> : <TextInput style={styles.modalInput} value={surplusQuantity} onChangeText={setSurplusQuantity} keyboardType="decimal-pad" placeholder="Cantidad" placeholderTextColor="#888" />}<Text style={styles.conditionLabel}>Condición</Text><View style={styles.conditions}>{['BUENO', 'CONTROL', 'BLOQUEADO'].map(condition => <TouchableOpacity key={condition} onPress={() => setSurplusCondition(condition)} style={[styles.conditionButton, surplusCondition === condition && styles.conditionActive]}><Text style={styles.conditionText}>{condition}</Text></TouchableOpacity>)}</View><View style={styles.modalActions}><TouchableOpacity onPress={() => setSurplusStep(null)}><Text style={styles.danger}>Cancelar</Text></TouchableOpacity><TouchableOpacity style={styles.smallPrimary} onPress={addSurplus}><Text style={styles.primaryText}>Agregar</Text></TouchableOpacity></View></>}</View></View></Modal>
    <Modal visible={isScanning} animationType="slide" onRequestClose={() => setIsScanning(false)}><View style={styles.scanner}><CameraView style={StyleSheet.absoluteFillObject} barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'] }} onBarcodeScanned={handleBarCodeScanned} /><View style={styles.scannerTop}><Text style={styles.scannerText}>{scanTarget === 'search' ? 'Escaneá código o serie' : 'Escaneá el número de serie'}</Text><TouchableOpacity onPress={() => setIsScanning(false)} style={styles.scannerClose}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity></View></View></Modal>
    <Modal visible={historyDetail !== null} animationType="slide" onRequestClose={() => setHistoryDetail(null)}><View style={styles.page}><View style={styles.topline}><View><Text style={styles.title}>Detalle de auditoría</Text><Text style={styles.muted}>{historyDetail?.fecha_fin ? new Date(historyDetail.fecha_fin).toLocaleString() : ''}</Text></View><TouchableOpacity onPress={() => setHistoryDetail(null)}><Text style={styles.danger}>Cerrar</Text></TouchableOpacity></View><ScrollView contentContainerStyle={styles.list}><Text style={styles.section}>Resumen por material</Text>{historyDetail && summaryForHistory(historyDetail.items || []).map(row => <View key={row.key} style={styles.card}><Text style={styles.text}>{row.codigo_material} · {row.nombre_material || 'Sin nombre'}</Text><Text style={styles.muted}>Sistema: {row.sistema} · Físico: {row.fisica} · Diferencia: {row.diferencia}</Text></View>)}<Text style={styles.section}>Faltantes</Text>{historyDetail?.items.filter((item: AuditItem) => item.cantidad_fisica < item.cantidad_sistema).map((item: AuditItem, index: number) => <DetailItem key={`f-${index}`} item={item} />)}<Text style={styles.section}>Excedentes</Text>{historyDetail?.items.filter((item: AuditItem) => item.cantidad_fisica > item.cantidad_sistema).map((item: AuditItem, index: number) => <DetailItem key={`e-${index}`} item={item} />)}</ScrollView></View></Modal>
  </View>;
}

function summaryForHistory(items: AuditItem[]) {
  const grouped = new Map<string, { key: string; codigo_material: string; nombre_material: string; sistema: number; fisica: number; diferencia: number }>();
  for (const item of items) { const key = `${item.codigo_material}-${item.nombre_material || ''}`; const current = grouped.get(key) || { key, codigo_material: item.codigo_material, nombre_material: item.nombre_material || '', sistema: 0, fisica: 0, diferencia: 0 }; current.sistema += item.cantidad_sistema; current.fisica += item.cantidad_fisica; current.diferencia = current.fisica - current.sistema; grouped.set(key, current); }
  return [...grouped.values()];
}
function DetailItem({ item }: { item: AuditItem }) { return <View style={styles.card}><Text style={styles.text}>{item.codigo_material} · {item.nombre_material || 'Sin nombre'}</Text><Text style={styles.muted}>{item.serie ? `Serie: ${item.serie} · ` : ''}{item.condicion || 'Sin condición'} · Sistema: {item.cantidad_sistema} · Físico: {item.cantidad_fisica}</Text></View>; }

const styles = StyleSheet.create({ page:{flex:1,backgroundColor:'#121212',padding:18},center:{flex:1,backgroundColor:'#121212',alignItems:'center',justifyContent:'center'},title:{color:'#fff',fontSize:22,fontWeight:'700'},text:{color:'#fff',fontSize:15},muted:{color:'#a5a5a5',fontSize:13,marginTop:4},section:{color:'#fff',fontWeight:'700',fontSize:16,marginTop:30,marginBottom:10},primary:{backgroundColor:'#3498db',padding:15,borderRadius:10,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8,marginTop:20},primaryText:{color:'#fff',fontWeight:'700'},history:{padding:14,borderBottomWidth:1,borderBottomColor:'#2b2b2b'},historyAction:{color:'#58b9ef',fontSize:13,fontWeight:'700',marginTop:7},topline:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12},danger:{color:'#ff6b6b',fontWeight:'700'},list:{paddingBottom:12},card:{backgroundColor:'#1d1d1d',padding:14,borderRadius:10,marginBottom:9},cardConfirmed:{borderLeftWidth:3,borderLeftColor:'#27ae60'},quantity:{flexDirection:'row',alignItems:'center',gap:9,marginTop:12},input:{backgroundColor:'#303030',color:'#fff',borderRadius:7,width:64,textAlign:'center',padding:8,fontWeight:'700'},inputLocked:{opacity:.55},sobrante:{backgroundColor:'#202020',borderRadius:10,padding:14,marginTop:6,flexDirection:'row',gap:8,alignItems:'center'},add:{color:'#58b9ef',fontWeight:'700'},progressBg:{height:6,backgroundColor:'#303030',borderRadius:5,marginBottom:14},progressFill:{height:6,backgroundColor:'#27ae60',borderRadius:5},searchRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#1d1d1d',borderRadius:10,paddingLeft:12,marginBottom:10},searchInput:{flex:1,color:'#fff',paddingVertical:12,paddingLeft:8},scanButton:{padding:11},tabs:{flexDirection:'row',gap:8,marginBottom:12},tab:{paddingVertical:8,paddingHorizontal:12,borderRadius:8,backgroundColor:'#242424'},tabActive:{backgroundColor:'#245b78'},tabText:{color:'#fff',fontWeight:'600',fontSize:13},confirmButton:{backgroundColor:'#2381b5',paddingVertical:10,borderRadius:8,marginTop:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},confirmedButton:{backgroundColor:'#287247'},confirmText:{color:'#fff',fontWeight:'700'},modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.7)',justifyContent:'center',padding:22},modalCard:{backgroundColor:'#1d1d1d',borderRadius:14,padding:20},modalTitle:{color:'#fff',fontSize:19,fontWeight:'700'},modalInput:{backgroundColor:'#303030',borderRadius:8,color:'#fff',padding:12,marginTop:16},modalActions:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:22},smallPrimary:{backgroundColor:'#3498db',paddingHorizontal:18,paddingVertical:10,borderRadius:8},seriesRow:{flexDirection:'row',alignItems:'center',gap:8},seriesInput:{flex:1},cameraSquare:{backgroundColor:'#3498db',borderRadius:8,padding:11,marginTop:16},conditionLabel:{color:'#fff',fontWeight:'700',marginTop:18},conditions:{flexDirection:'row',gap:7,marginTop:9},conditionButton:{backgroundColor:'#303030',paddingVertical:8,paddingHorizontal:9,borderRadius:7},conditionActive:{backgroundColor:'#276c92'},conditionText:{color:'#fff',fontSize:12,fontWeight:'600'},scanner:{flex:1,backgroundColor:'#000'},scannerTop:{position:'absolute',top:50,left:18,right:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},scannerText:{color:'#fff',fontWeight:'700',fontSize:17},scannerClose:{backgroundColor:'rgba(0,0,0,.55)',borderRadius:20,padding:6} });
