import AsyncStorage from '@react-native-async-storage/async-storage';
import { StockItem } from '../services/stock.service';

export interface TransferenciaDraft {
  origenId: number | null;
  destinoId: number | null;
  items: Array<{ stockItem: StockItem; cantidad: number }>;
  comentario: string;
  updatedAt: number;
}

const getKey = (userId: string | number | undefined) =>
  `transferencia_borrador:${userId ?? 'anon'}`;

export async function getTransferenciaDraft(userId: string | number | undefined): Promise<TransferenciaDraft | null> {
  try {
    const value = await AsyncStorage.getItem(getKey(userId));
    return value ? JSON.parse(value) as TransferenciaDraft : null;
  } catch (error) {
    console.warn('No se pudo recuperar el borrador de transferencia:', error);
    return null;
  }
}

export async function saveTransferenciaDraft(
  userId: string | number | undefined,
  draft: Omit<TransferenciaDraft, 'updatedAt'>
): Promise<void> {
  await AsyncStorage.setItem(getKey(userId), JSON.stringify({ ...draft, updatedAt: Date.now() }));
}

export async function clearTransferenciaDraft(userId: string | number | undefined): Promise<void> {
  await AsyncStorage.removeItem(getKey(userId));
}
