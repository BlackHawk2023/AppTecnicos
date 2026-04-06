# Plan de Modificación: App Técnicos Sin Stock

## Objetivo
Crear una versión de la app de técnicos que **no gestione stock** pero mantenga toda la funcionalidad de ejecución de servicios, captura de materiales, sincronización y generación de órdenes.

## Resumen de cambios

| Área | Acción |
|------|--------|
| Tab Stock | **Eliminar** completamente |
| Botón "Mi Stock" en ejecución | **Eliminar** |
| Validación de stock en Material Entregado | **Eliminar** |
| Registro de movimientos de stock | **Eliminar** |
| Captura de materiales (retirado/entregado) | **Mantener sin cambios** |
| Catálogo de materiales (metadata) | **Mantener sin cambios** |
| Tipos de cierre | **Mantener sin cambios** |
| Sincronización de gestiones/órdenes | **Mantener sin cambios** |
| Sincronización de stock | **Desactivar** |
| Generación de órdenes HTML/imagen | **Mantener sin cambios** |

---

## Cambios detallados por archivo

---

### 1. `app/(tabs)/_layout.tsx` — Eliminar tab Stock

**Acción:** Eliminar el `Tabs.Screen` del stock de la navegación.

**Qué quitar (líneas ~56-63):**
```tsx
// ELIMINAR este bloque completo:
<Tabs.Screen
    name="stock"
    options={{
        title: 'Mi Stock',
        tabBarLabel: 'Stock',
        tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube" size={size} color={color} />
        ),
    }}
/>
```

**Resultado:** La app tendrá 3 tabs: Ruta, Guías, Perfil.

---

### 2. `app/(tabs)/stock.tsx` — Eliminar archivo completo

**Acción:** Eliminar el archivo `app/(tabs)/stock.tsx` por completo.

Ya no existe el tab, este archivo no se usa. Si Expo Router lo detecta automáticamente por estar en la carpeta `(tabs)`, su presencia generaría una ruta huérfana.

**Alternativa conservadora:** Si se prefiere no eliminar, se puede dejar el archivo vacío con un redirect:
```tsx
import { Redirect } from 'expo-router';
export default function StockScreen() {
    return <Redirect href="/(tabs)/home" />;
}
```
**Recomendación:** Eliminarlo directamente es más limpio.

---

### 3. `app/servicio/ejecucion.tsx` — Cambios en generación de órdenes

Este archivo requiere **4 modificaciones** independientes:

#### 3.1 Eliminar el botón "Mi Stock" del paso de materiales

**Ubicación:** Dentro de `renderMaterialSection` (~líneas 2038-2042)

**Qué quitar:**
```tsx
// ELIMINAR este bloque:
{type === 'entregado' && (
    <TouchableOpacity style={styles.addButton} onPress={() => openMiStockModal(type)}>
        <Ionicons name="cube" size={24} color="#3498db" />
        <Text style={{ color: '#3498db', marginLeft: 4 }}>Mi Stock</Text>
    </TouchableOpacity>
)}
```

**Efecto:** El técnico seguirá pudiendo seleccionar materiales desde el catálogo o escáner, pero no desde su stock local (que no existirá).

#### 3.2 Eliminar modal "Mi Stock" y su lógica

**Qué quitar:**
- State variables (~líneas 1961-1965):
  ```tsx
  const [showMiStockModal, setShowMiStockModal] = useState(false);
  const [miStockItems, setMiStockItems] = useState<any[]>([]);
  const [miStockSearch, setMiStockSearch] = useState('');
  ```
- Función `openMiStockModal` (~líneas 1977-1993)
- Función `selectMiStockItem` (~líneas 1996-2010)
- Componente `renderMiStockModal` completo (~líneas 2239-2300)
- La invocación de `{renderMiStockModal()}` en el JSX del return

#### 3.3 Eliminar validación de stock en `lookupSerialInStock`

**Ubicación:** ~líneas 1261-1361

La función `lookupSerialInStock` actualmente:
- Para **Material Entregado**: valida que la serie exista en el stock del técnico, valida cantidades suficientes
- Para **Material Retirado**: valida que la serie NO esté ya en el stock del técnico

**Acción:** Reemplazar toda la función por una versión simplificada que solo determine si el input es serie o cantidad, sin consultar `stock_local`:

```tsx
const lookupSerialInStock = async (type: 'retirado' | 'entregado', itemId: string, inputValue: string) => {
    if (!inputValue || inputValue.length < 1) {
        updateMaterialItem(type, itemId, 'error', '');
        return;
    }

    const items = type === 'retirado' ? formData.material_retirado : formData.material_entregado;
    const item = items.find(i => i.id === itemId);

    // Determinar si el input parece cantidad o serie
    const numericValue = parseInt(inputValue);
    const isLikelyQuantity = !isNaN(numericValue) && inputValue.length <= 4 && numericValue <= 1000;

    // Si ya tiene material seleccionado y es SERIALIZADO pero ingresó cantidad
    if (item?.material && item.unidad_medida === 'SERIALIZADO' && isLikelyQuantity) {
        updateMaterialItem(type, itemId, 'material', '');
        updateMaterialItem(type, itemId, 'nombre_material', '');
        updateMaterialItem(type, itemId, 'unidad_medida', '');
        updateMaterialItem(type, itemId, 'error', 'Ingresó una cantidad. Por favor seleccione un material por unidad.');
        return;
    }

    // Sin stock, no hay validaciones adicionales — limpiar error
    updateMaterialItem(type, itemId, 'error', '');

    // Si no tiene material seleccionado y parece serie, marcar como SERIALIZADO
    if (!item?.material && !isLikelyQuantity) {
        updateMaterialItem(type, itemId, 'unidad_medida', 'SERIALIZADO');
    }
};
```

**Efecto:** El técnico puede cargar cualquier serie o cantidad sin restricciones de stock.

#### 3.4 Eliminar validación de stock en `validateMaterials` (Validation 5)

**Ubicación:** ~líneas 964-1005 dentro de `validateMaterials`

**Qué quitar:** El bloque completo "Validation 5" que verifica materiales entregados contra `stock_local`:

```tsx
// ELIMINAR todo este bloque:
// Validation 5: Check that all serialized deliveries exist in technician's stock
try {
    const db = await loadDatabaseService();
    if (db) {
        const stockItems = await db.getStockLocal();
        // ... toda la validación de stock ...
        if (notInStock.length > 0) {
            Alert.alert('Material No Disponible', ...);
            return false;
        }
    }
} catch (stockCheckError) {
    console.warn('Could not validate stock:', stockCheckError);
}
```

**Efecto:** La validación de materiales solo verificará campos obligatorios (material seleccionado, serie/cantidad ingresada) pero NO verificará disponibilidad en stock.

#### 3.5 Eliminar `registerStockMovements` y sus invocaciones

**Ubicación:** ~líneas 1585-1650 (definición de la función)

**Qué quitar:**
1. La función `registerStockMovements` completa
2. Buscar TODAS las llamadas a `await registerStockMovements()` en el archivo (normalmente están al final del flujo de GENERAR y CARGAR orden) y eliminarlas

**Nota:** Buscar con cuidado. Las llamadas suelen estar en:
- Después de generar orden exitosamente
- Después de cargar orden exitosamente
- Cualquier variante del flujo de submit

**Efecto:** Al generar/cargar una orden NO se registrarán movimientos de stock locales ni se encolará nada para sincronizar con el backend.

#### 3.6 Eliminar auto-fill desde stock al escanear código de barras

**Ubicación:** En el handler de barcode scan (dentro de `ejecucion.tsx`)

Cuando se escanea un código sin material seleccionado, el sistema busca en `stock_local` para auto-completar. Esta búsqueda ahora no encontrará nada, pero igualmente conviene limpiar la lógica para evitar llamadas innecesarias a la DB.

**Buscar** en los handlers de escaneo (ej: `handleBarcodeScanned` o similar):
- Código que haga `db.getStockLocal()` seguido de `stockItems.find(...)` para auto-fill
- Reemplazar por simplemente setear el valor escaneado como serie sin buscar en stock

---

### 4. `services/sync.service.ts` — Desactivar sync de stock

#### 4.1 Vaciar `syncStockMovements`

**Ubicación:** ~líneas 477-511

**Reemplazar** el cuerpo de la función por un return inmediato:

```typescript
async syncStockMovements(): Promise<SyncResult> {
    // Sin stock — no hay movimientos que sincronizar
    return { success: true, message: 'Stock deshabilitado' };
}
```

**Razón:** La función sigue existiendo para no romper las llamadas desde `syncMetadata` y `RouteContext`, pero no hace nada.

#### 4.2 Vaciar `getMiStockDiscar`

**Ubicación:** ~líneas 543-554

```typescript
async getMiStockDiscar(): Promise<any[] | null> {
    // Sin stock — retornar array vacío
    return [];
}
```

#### 4.3 Vaciar `getTransferenciasPendientes`

**Ubicación:** ~líneas 514-522

```typescript
async getTransferenciasPendientes(): Promise<any[] | null> {
    // Sin stock — no hay transferencias
    return [];
}
```

#### 4.4 Vaciar `responderTransferencia`

**Ubicación:** ~líneas 524-542

```typescript
async responderTransferencia(...args: any[]): Promise<any> {
    // Sin stock — operación no disponible
    return { success: false, message: 'Stock deshabilitado' };
}
```

#### 4.5 Vaciar `solicitarDevolucion`

**Ubicación:** ~líneas 556-577

```typescript
async solicitarDevolucion(...args: any[]): Promise<any> {
    // Sin stock — operación no disponible
    return { success: false, message: 'Stock deshabilitado' };
}
```

#### 4.6 Eliminar descarga de stock en `syncMetadata`

**Ubicación:** ~líneas 145-165 (bloque "4. Download technician's current stock")

**Quitar** todo el bloque try/catch que descarga stock desde `/mobile/stock/tecnico` dentro de `syncMetadata`. También eliminar el paso 6 (`await this.syncStockMovements()`) ya que la función ahora no hace nada, pero se puede dejar por consistencia.

---

### 5. `contexts/RouteContext.tsx` — Desactivar sync de stock en pull-to-refresh

#### 5.1 Eliminar FASE 1.1 — Upload de movimientos de stock

**Ubicación:** Dentro de `syncWithBackend`, ~líneas 190-207

**Quitar** el bloque:
```tsx
// 1.1 Subir movimientos de stock pendientes (PRIMERO)
try {
    const pendingMovimientos = await db.getMovimientosPendientes();
    if (pendingMovimientos.length > 0) {
        // ... syncService.syncStockMovements() ...
    }
} catch (stockErrors) { ... }
```

**También quitar** la variable `stockMovementsSynced` y sus referencias en el mensaje de feedback (buscando `stockMovementsSynced` en el archivo).

#### 5.2 Eliminar FASE 3.2 — Download de stock actualizado

**Ubicación:** ~líneas 395-420

**Quitar** el bloque completo:
```tsx
// 3.2 Bajar stock actualizado
try {
    console.log('RouteContext: Downloading stock from backend...');
    const stockItems = await syncService.getMiStockDiscar();
    // ... entire stock download and save logic ...
} catch (stockError) { ... }
```

#### 5.3 Eliminar FASE 3.3 — Download de transferencias pendientes

**Ubicación:** ~líneas 422-434

**Quitar** el bloque completo:
```tsx
// 3.3 Bajar transferencias pendientes
try {
    console.log('RouteContext: Downloading pending transfers...');
    const transfers = await syncService.getTransferenciasPendientes();
    // ...
} catch (transferError) { ... }
```

---

### 6. `db/database.native.ts` — Limpieza de tablas de stock (OPCIONAL)

**Acción recomendada:** Dejar las tablas y funciones de DB como están. No causan daño y evitan romper imports o llamadas residuales.

Las tablas `stock_local`, `movimientos_pendientes`, `transferencias_pendientes` simplemente quedarán vacías ya que nadie las alimenta.

**Si se desea una limpieza más profunda** (no recomendado en primera instancia):
- Eliminar la creación de tablas `stock_local`, `movimientos_pendientes`, `transferencias_pendientes` del `init()`
- Eliminar funciones: `saveStockLocal`, `getStockLocal`, `updateStockLocal`, `addMovimientoPendiente`, `getMovimientosPendientes`, `markMovimientosSynced`, `clearSyncedMovimientos`, `changeCondicionLocal`, `saveTransferenciasPendientes`, `getTransferenciasPendientes`

---

### 7. `app.json` — Cambiar nombre de la app (OPCIONAL pero recomendado)

Para distinguir esta versión de la original en el dispositivo del técnico:

```json
{
    "name": "STDiscar Técnicos (Sin Stock)",
    "slug": "stdiscar-tecnicos-sin-stock",
    // ... etc
}
```

---

## Resumen de lo que NO se modifica

| Componente | Razón |
|------------|-------|
| **Catálogo de materiales** (`metadata_materials`) | Se sigue descargando en `syncMetadata` y se usa para seleccionar materiales en órdenes |
| **Tipos de cierre** | Se siguen descargando y usando normalmente |
| **Plantilla de orden** | Se sigue descargando y usando para generar HTML de la orden |
| **Captura de Material Retirado** | Se mantiene tal cual — el técnico registra qué retira |
| **Captura de Material Entregado** | Se mantiene pero **sin validación de stock** — el técnico puede cargar cualquier material/serie/cantidad |
| **Generación de orden (HTML + imagen)** | Sin cambios |
| **Sincronización de gestiones (órdenes + novedades)** | Sin cambios — las órdenes se suben al backend con sus materiales |
| **Escáner de códigos de barras** | Sin cambios — sigue funcionando para capturar series/códigos |
| **Captura de fotos de series** | Sin cambios |
| **Novedades** (`novedad.tsx`) | Sin cambios — no usa stock |
| **Vista de detalle** (`detalle.tsx`) | Sin cambios — muestra materiales de órdenes generadas pero no interactúa con stock |
| **Guías técnicas** | Sin cambios |
| **Perfil** | Sin cambios |
| **Ubicación / tracking GPS** | Sin cambios |
| **Finalización de ruta** | Sin cambios |
| **Sincronización de gestiones y fotos** | Sin cambios — los materiales se siguen subiendo como parte de la gestión |

---

## Consideraciones sobre la sincronización

La sincronización actual tiene este flujo:

```
SYNC:
  UPLOAD:
    1.1 Stock movements     ← ELIMINAR (no habrá movimientos)
    1.2 Gestiones (órdenes)  ← MANTENER
    1.3 Ubicaciones          ← MANTENER
  
  FINALIZACION:
    2.1 Finalizar ruta       ← MANTENER
  
  DOWNLOAD:
    3.1 Estado de ruta       ← MANTENER
    3.2 Stock actualizado    ← ELIMINAR (no hay stock)
    3.3 Transferencias       ← ELIMINAR (no hay transferencias)
    3.4 Notificaciones       ← MANTENER
  
  CLEANUP:
    4.x                      ← MANTENER
```

**Importante:** Las órdenes sincronizadas (`syncPendingOrders`) siguen incluyendo los campos `material_retirado` y `material_entregado` en el JSON. El backend recibirá estos materiales pero, al no haber stock registrado para la base, simplemente los almacena como información de la gestión sin generar movimientos de inventario. **Verificar con el backend que el endpoint `/mobile/sync/gestiones` no falle si no encuentra stock del técnico** — si el backend intenta mover stock y falla, habría que hacer un ajuste allá también.

---

## Sugerencias adicionales

1. **Diferenciar visualmente la app**: Considerar cambiar el color primario del header/tabs (ej: de `#3498db` azul a `#8e44ad` violeta) para que los técnicos distingan fácilmente qué versión tienen instalada.

2. **Backend**: Verificar el endpoint `POST /mobile/sync/gestiones` para asegurarse de que no intente registrar movimientos de stock cuando la base del técnico no tiene stock. Si lo hace, se necesita un flag o una lógica condicional en el backend.

3. **`package.json`**: Cambiar el `name` del paquete para diferenciar en el build:
   ```json
   "name": "mobile-sin-stock"
   ```

---

## Orden de implementación sugerido

1. **Tab y screen** — Quitar stock tab del layout y eliminar `stock.tsx` (cambio más visible y simple)
2. **Ejecución** — Quitar botón Mi Stock, registerStockMovements, validaciones de stock en `ejecucion.tsx`
3. **Sync y Context** — Desactivar operaciones de stock en `sync.service.ts` y `RouteContext.tsx`
4. **Build y test** — Compilar, verificar que no haya imports rotos ni errores de runtime
5. **Diferenciación** — Renombrar app y opcionalmente cambiar color primario
