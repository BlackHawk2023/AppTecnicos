/**
 * Pantalla de Inicio - Dashboard
 * Muestra resumen del stock y accesos rápidos
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboard, StockDashboard } from '../../services/stock.service';
import { getAlertasCount, AlertasCount } from '../../services/alertas.service';
import { getTransferencias } from '../../services/transferencias.service';
import { Colors, Spacing, FontSizes, Shadows, BorderRadius } from '../../constants/theme';

export default function HomeScreen() {
  const { user, codigoBase } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<StockDashboard | null>(null);
  const [alertasCount, setAlertasCount] = useState<AlertasCount | null>(null);
  const [transferenciasCount, setTransferenciasCount] = useState(0);

  // Cargar datos
  const loadData = async () => {
    try {
      const [dashboardData, alertasData, transferenciasData] = await Promise.all([
        getDashboard(codigoBase || undefined),
        getAlertasCount(),
        getTransferencias({ estado: 'PENDIENTE', limit: 1 }),
      ]);

      setDashboard(dashboardData);
      setAlertasCount(alertasData);
      setTransferenciasCount(transferenciasData.total);
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  // Navegación rápida
  const quickActions = [
    { icon: '📦', label: 'Ver Stock', route: '/stock' },
    { icon: '➕', label: 'Cargar', route: '/stock/cargar' },
    { icon: '🔍', label: 'Verificar', route: '/stock/verificar' },
    { icon: '🔄', label: 'Transferir', route: '/transferencias/nueva' },
    { icon: '🚚', label: 'Despachos', route: '/despachos' },
    { icon: '📋', label: 'Auditoría', route: '/auditoria/realizar' },
  ];

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {/* Bienvenida */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>
            Hola, {user?.nombrecompleto || user?.usuario || 'Encargado'}
          </Text>
          {codigoBase && (
            <Text style={styles.baseText}>Base: {user?.nombreBase || codigoBase}</Text>
          )}
        </View>

        {/* Resumen de Stock */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumen de Stock</Text>

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: Colors.primaryLight + '20' }]}>
              <Text style={styles.statValue}>{dashboard?.total_items || 0}</Text>
              <Text style={styles.statLabel}>Total Items</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: Colors.success + '20' }]}>
              <Text style={styles.statValue}>{dashboard?.total_cantidad || 0}</Text>
              <Text style={styles.statLabel}>Cantidad Total</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: '#e8f4fd' }]}>
              <Text style={styles.statValue}>{dashboard?.items_serializados || 0}</Text>
              <Text style={styles.statLabel}>Serializados</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: '#fff3e0' }]}>
              <Text style={styles.statValue}>{dashboard?.items_unidad || 0}</Text>
              <Text style={styles.statLabel}>Por Unidad</Text>
            </View>
          </View>
        </View>

        {/* Alertas y Transferencias */}
        <View style={styles.section}>
          <View style={styles.row}>
            {/* Alertas */}
            <TouchableOpacity
              style={[styles.infoCard, { borderLeftColor: Colors.error }]}
              onPress={() => router.push('/(tabs)/alertas')}
            >
              <Text style={styles.infoIcon}>⚠️</Text>
              <View style={styles.infoContent}>
                <Text style={styles.infoValue}>{alertasCount?.total || 0}</Text>
                <Text style={styles.infoLabel}>Alertas</Text>
              </View>
            </TouchableOpacity>

            {/* Transferencias */}
            <TouchableOpacity
              style={[styles.infoCard, { borderLeftColor: Colors.warning }]}
              onPress={() => router.push('/(tabs)/transferencias')}
            >
              <Text style={styles.infoIcon}>🔄</Text>
              <View style={styles.infoContent}>
                <Text style={styles.infoValue}>{transferenciasCount}</Text>
                <Text style={styles.infoLabel}>Pendientes</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Distribución por Categoría */}
        {dashboard?.por_categoria && Object.keys(dashboard.por_categoria).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Por Categoría</Text>
            {Object.entries(dashboard.por_categoria).slice(0, 5).map(([cat, qty]) => (
              <View key={cat} style={styles.categoryItem}>
                <Text style={styles.categoryName}>{cat}</Text>
                <Text style={styles.categoryQty}>{qty}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Acciones Rápidas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones Rápidas</Text>

          <View style={styles.actionsGrid}>
            {quickActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={styles.actionButton}
                onPress={() => router.push(action.route as any)}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  welcomeSection: {
    marginBottom: Spacing.lg,
  },
  welcomeText: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.text,
  },
  baseText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    ...Shadows.sm,
  },
  statValue: {
    fontSize: FontSizes.xxl,
    fontWeight: 'bold',
    color: Colors.text,
  },
  statLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  infoCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    ...Shadows.sm,
  },
  infoIcon: {
    fontSize: 24,
    marginRight: Spacing.sm,
  },
  infoContent: {
    flex: 1,
  },
  infoValue: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.text,
  },
  infoLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  categoryName: {
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  categoryQty: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  actionButton: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.sm,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: Spacing.xs,
  },
  actionLabel: {
    fontSize: FontSizes.sm,
    color: Colors.text,
    fontWeight: '500',
  },
});
