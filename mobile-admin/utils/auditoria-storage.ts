import { File, Paths } from 'expo-file-system/next';
import { StockItem } from '../services/stock.service';

export interface ItemAuditadoPersisted {
  stockItem: StockItem;
  encontrado: boolean;
  cantidadFisica?: number;
}

export interface ItemNoEnStockPersisted {
  codigo_base: string;
  codigo_material: string;
  nombre_material: string;
  unidad_medida: string;
  serie: string | null;
  cantidad: number;
  ubicacion: string | null;
  condicion: string;
}

export interface AuditoriaDraft {
  codigoBase: string;
  savedAt: number;
  stockTotal: StockItem[];
  itemsAuditados: ItemAuditadoPersisted[];
  itemsNoEnStock: ItemNoEnStockPersisted[];
}

const getFile = (codigoBase: string) =>
  new File(Paths.document, `auditoria_draft_${codigoBase}.json`);

export async function saveAuditoriaDraft(draft: AuditoriaDraft): Promise<void> {
  try {
    const file = getFile(draft.codigoBase);
    file.write(JSON.stringify(draft));
  } catch (e) {
    console.warn('Error saving audit draft:', e);
  }
}

export async function loadAuditoriaDraft(codigoBase: string): Promise<AuditoriaDraft | null> {
  try {
    const file = getFile(codigoBase);
    if (!file.exists) return null;
    const raw = await file.text();
    return JSON.parse(raw) as AuditoriaDraft;
  } catch (e) {
    console.warn('Error loading audit draft:', e);
    return null;
  }
}

export async function clearAuditoriaDraft(codigoBase: string): Promise<void> {
  try {
    const file = getFile(codigoBase);
    if (file.exists) {
      file.delete();
    }
  } catch (e) {
    console.warn('Error clearing audit draft:', e);
  }
}
