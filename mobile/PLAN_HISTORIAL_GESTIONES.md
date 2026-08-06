# Plan de Implementación: Historial de Gestiones por Cita

## Objetivo
Permitir al técnico visualizar, mientras la ruta está activa, todas las gestiones (órdenes, novedades, fotos) que fue cargando por cada cita. Los datos deben ser visibles incluso post-sincronización, y eliminarse completamente del dispositivo al finalizar la ruta.

---

## Arquitectura Existente (NO modificar a menos que se indique)

### Base de datos SQLite (`db/database.native.ts`)
- **Tabla `gestiones`**: Almacena ORDEN y NOVEDAD unificadas
- **Interface `GestionRecord`**: `{ id, tipo, ruta_id, cita, ot, partida, terminal, tipo_cierre, detalle_trabajo, observaciones, material_retirado, material_entregado, cliente_nombre, cliente_dni, cliente_firma, tecnico_nombre, tecnico_dni, tecnico_firma, order_image_path, nota_novedad, novedad_image_path, latitude, longitude, timestamp, status ('PENDING'|'SYNCED'), created_at }`
- **`getGestionesByRuta(rutaId)`**: Ya retorna todas las gestiones de una ruta, ordenadas por `created_at ASC`
- **`getGestionByService(cita, ot, partida)`**: Ya retorna una gestión individual

### Contexto (`contexts/RouteContext.tsx`)
- **State**: `generatedOrders: Map<string, GeneratedOrder>`, `reportedNovedades: Map<string, ReportedNovedad>` (key: `${cita}-${ot}-${partida}`)
- **`servicios: any[]`**: Lista de servicios de la ruta con `cita`, `ot`, `partida`, `denominacion`, `domicilio`, etc.
- **`rutaActiva: RutaResumen`**: Ruta activa con `.id`, `.estado`, `.fecha_creacion`

### Screens existentes (referencia de patrones)
- `app/(tabs)/home.tsx` → Lista de servicios agrupados por OT con pull-to-refresh, dark theme (`#121212` bg, `#1a1a1a` cards, `#3498db` accent)
- `app/detalle.tsx` → Detalle de servicio individual
- `app/_layout.tsx` → Stack navigator root con `AuthProvider > TextSizeProvider > RouteProvider > ThemeProvider`
- `app/(tabs)/_layout.tsx` → Tabs: home, stock, guias, perfil (Ionicons)

---

## TAREA 1: Nueva pantalla `app/(tabs)/gestiones.tsx`

### 1.1 Crear el archivo
**Ruta**: `app/(tabs)/gestiones.tsx`

### 1.2 Lógica principal
```
- Importar `useRoute` de `contexts/RouteContext`
- Importar `loadDatabaseService` de `db/database`  
- Al montar (useFocusEffect), si hay rutaActiva:
  - llamar `db.getGestionesByRuta(rutaActiva.id)` 
  - Agrupar resultados por `cita` (Map<string, GestionRecord[]>)
- Mostrar SectionList agrupada por cita
```

### 1.3 Estructura de datos para la UI
```typescript
interface GestionGroup {
  cita: string;
  denominacion: string;  // Buscar en `servicios` la denominación para esa cita
  domicilio: string;     // Ídem
  gestiones: GestionRecord[];
  resumen: {
    ordenes: number;      // count donde tipo === 'ORDEN'
    novedades: number;    // count donde tipo === 'NOVEDAD'
    conFoto: number;      // count donde order_image_path || novedad_image_path no vacío
    pendientes: number;   // count donde status === 'PENDING'
    sincronizadas: number; // count donde status === 'SYNCED'
  };
}
```

### 1.4 Componentes de la pantalla

**Estado vacío**: Si no hay ruta activa o no hay gestiones, mostrar un ícono centrado con texto "No hay gestiones cargadas aún".

**Header summary** (arriba de la lista):
- Total gestiones cargadas
- Órdenes / Novedades (conteos)
- Pendientes de sincronización (si > 0, en color naranja)

**SectionList**:
- **Section header por cita**: 
  - Cita + Denominación
  - Domicilio (texto secundario)
  - Badge con conteo: `3 órdenes · 1 novedad`
- **Items dentro de cada sección** (cada gestión):
  - Ícono: `document-text` (ORDEN) o `alert-circle` (NOVEDAD) de Ionicons
  - Línea 1: `OT: {ot} - Partida {partida}` + badge tipo_cierre si ORDEN
  - Línea 2: Timestamp formateado (`HH:mm` del día)
  - Línea 3: Si NOVEDAD → mostrar nota_novedad (truncada a 80 chars)
  - Línea 3: Si ORDEN con `[ORDEN CARGADA]` en observaciones → indicar "Orden cargada (foto)"
  - Indicador de foto: ícono cámara si tiene `order_image_path` o `novedad_image_path`
  - Badge de estado sync: punto verde (SYNCED) o naranja intermitente (PENDING)
  
**Pull-to-refresh**: Recargar gestiones desde SQLite.

**Tap en gestión individual**: Abrir un modal o navegar a detalle mostrando toda la info de ese GestionRecord (incluida la foto si existe, usando `Image` con la ruta local de `order_image_path` o `novedad_image_path`).

### 1.5 Estilos
Seguir el dark theme del proyecto:
- Background: `#121212`
- Cards: `#1a1a1a` con border `#333`
- Texto primario: `#fff`
- Texto secundario: `#aaa`
- Accent: `#3498db`
- ORDEN color: `#2ecc71` (verde)
- NOVEDAD color: `#f39c12` (naranja)
- PENDING badge: `#e67e22`
- SYNCED badge: `#2ecc71`

---

## TAREA 2: Registrar la nueva tab en `app/(tabs)/_layout.tsx`

### 2.1 Agregar nueva Tab.Screen
En `app/(tabs)/_layout.tsx`, agregar un nuevo `<Tabs.Screen>` **entre** "home" y "stock":

```tsx
<Tabs.Screen
  name="gestiones"
  options={{
    title: 'Mis Gestiones',
    tabBarLabel: 'Gestiones',
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="clipboard" size={size} color={color} />
    ),
  }}
/>
```

**Posición**: Después de `home` y antes de `stock` en el orden de tabs.

---

## TAREA 3: Pantalla de detalle de gestión individual

### 3.1 Opción A (recomendada): Modal inline en la misma pantalla
Usar un `<Modal>` de React Native dentro de `gestiones.tsx`:
- Se activa al hacer tap en una gestión
- Muestra todos los campos del `GestionRecord`
- Si tiene foto (`order_image_path` / `novedad_image_path`), mostrarla con `<Image source={{ uri: path }}>`
- Botón cerrar arriba

### 3.2 Información a mostrar en el detalle
```
- Tipo: ORDEN / NOVEDAD (con ícono y color)
- Cita / OT / Partida / Terminal
- Timestamp (fecha y hora completa)
- Estado: PENDING / SYNCED
--- Si ORDEN ---
- Tipo de cierre
- Detalle de trabajo
- Observaciones
- Material retirado (parsear JSON, mostrar lista)
- Material entregado (parsear JSON, mostrar lista)
- Datos cliente (nombre, DNI)
- Foto de la orden (si order_image_path no vacío)
--- Si NOVEDAD ---
- Nota de novedad
- Foto (si novedad_image_path no vacío)
```

---

## TAREA 4: Limpieza completa al finalizar ruta

### 4.1 Modificar `contexts/RouteContext.tsx` - Flujo de limpieza post-finalización

Hay **3 puntos** en el código donde se ejecuta cleanup. En TODOS ellos agregar la limpieza de archivos:

#### Punto 1: Finalización exitosa (línea ~252, FASE 2)
Código actual:
```typescript
await db.clearRutaActiva();
await db.clearGestionesNotInRuta(null);
```
Reemplazar con:
```typescript
await db.clearRutaActiva();
await db.clearAllGestiones();  // Borrar TODAS (no solo SYNCED)
await db.runAsync('DELETE FROM pending_image_uploads');  // Limpiar cola de imágenes
// Borrar archivos de imagen del disco
try {
  const FileSystem = require('expo-file-system');
  const ordenesDir = `${FileSystem.documentDirectory}ordenes/`;
  const dirInfo = await FileSystem.getInfoAsync(ordenesDir);
  if (dirInfo.exists) {
    await FileSystem.deleteAsync(ordenesDir, { idempotent: true });
  }
} catch (cleanupErr) {
  console.warn('RouteContext: Error cleaning image files:', cleanupErr);
}
```

#### Punto 2: Ruta cancelada desde backend (SCENARIO 5, bloque `rutaActiva.estado !== 'FINALIZADA'`, línea ~320 aprox)
Código actual:
```typescript
await db.clearRutaActiva();
await db.clearGestionesNotInRuta(null);
if (typeof db.clearSyncedGestiones === 'function') {
    await db.clearSyncedGestiones();
}
```
Reemplazar con:
```typescript
await db.clearRutaActiva();
await db.clearAllGestiones();
await db.runAsync('DELETE FROM pending_image_uploads');
try {
  const FileSystem = require('expo-file-system');
  const ordenesDir = `${FileSystem.documentDirectory}ordenes/`;
  const dirInfo = await FileSystem.getInfoAsync(ordenesDir);
  if (dirInfo.exists) {
    await FileSystem.deleteAsync(ordenesDir, { idempotent: true });
  }
} catch (cleanupErr) {
  console.warn('RouteContext: Error cleaning image files:', cleanupErr);
}
```

#### Punto 3: Ruta finalizada localmente pero post-transition cleanup (SCENARIO 5, bloque else, línea ~330 aprox)
Aplicar el mismo patrón que Punto 2.

### 4.2 Extraer función helper (DRY)
Para no repetir el código 3 veces, crear una función helper dentro de `RouteProvider`:

```typescript
const cleanupRouteData = async (db: DatabaseService) => {
  await db.clearRutaActiva();
  await db.clearAllGestiones();
  
  // Limpiar cola de imágenes pendientes
  const rawDb = await db.getDb();
  await rawDb.runAsync('DELETE FROM pending_image_uploads');
  
  // Borrar archivos físicos de órdenes/novedades
  try {
    const FileSystem = require('expo-file-system');
    const ordenesDir = `${FileSystem.documentDirectory}ordenes/`;
    const dirInfo = await FileSystem.getInfoAsync(ordenesDir);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(ordenesDir, { idempotent: true });
    }
  } catch (err) {
    console.warn('RouteContext: Error cleaning image files:', err);
  }
};
```

Luego en los 3 puntos de cleanup simplemente llamar:
```typescript
await cleanupRouteData(db);
setRutaActiva(null);
setServicios([]);
setGeneratedOrders(new Map());
setReportedNovedades(new Map());
setHasRoute(false);
```

### 4.3 Agregar método `clearPendingImageUploads` al `DatabaseService` (opcional, más limpio)
En `db/database.native.ts`, agregar al interface y a la implementación:

```typescript
// Interface (línea ~35 aprox)
clearPendingImageUploads(): Promise<void>;

// Implementación
async clearPendingImageUploads(): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('DELETE FROM pending_image_uploads');
    console.log('DatabaseService: Cleared all pending image uploads');
}
```

---

## TAREA 5: Refrescar datos al volver a la tab

### 5.1 useFocusEffect en gestiones.tsx
```typescript
useFocusEffect(
  useCallback(() => {
    loadGestiones();
  }, [rutaActiva?.id])
);
```
Esto asegura que cada vez que el técnico vuelve a la tab "Gestiones", ve datos actualizados (post-sync, nuevas cargas, etc.)

---

## Resumen de archivos a crear/modificar

| Archivo | Acción | Descripción |
|---|---|---|
| `app/(tabs)/gestiones.tsx` | **CREAR** | Nueva pantalla con SectionList de gestiones agrupadas por cita + modal de detalle |
| `app/(tabs)/_layout.tsx` | **MODIFICAR** | Agregar tab "Gestiones" con ícono clipboard entre home y stock |
| `contexts/RouteContext.tsx` | **MODIFICAR** | Extraer `cleanupRouteData()`, reemplazar los 3 puntos de cleanup para borrar ALL gestiones + archivos de imagen + pending_image_uploads |
| `db/database.native.ts` | **MODIFICAR** | Agregar `clearPendingImageUploads()` al interface y la implementación |
| `db/database.web.ts` | **MODIFICAR** | Agregar stub `clearPendingImageUploads()` al web mock |

---

## Consideraciones técnicas

1. **No requiere cambios en backend** — Todo es lectura de SQLite local.
2. **Las fotos se leen con URI local** — `Image source={{ uri: record.order_image_path }}` funciona directo con paths de `FileSystem.documentDirectory`.
3. **Performance** — `getGestionesByRuta` es una query simple sin JOINs. Para rutas típicas (20-60 servicios × 1-2 gestiones) los datos son mínimos.
4. **Las gestiones PENDING también se muestran** — El técnico debe ver TODO lo que cargó, sin importar si ya se sincronizó o no.
5. **No editar gestiones** — Esta pantalla es solo lectura/consulta. No permite modificar ni eliminar gestiones individuales.
6. **El web stub** (`database.web.ts`) necesita el método `clearPendingImageUploads` aunque sea un no-op, para que TypeScript no se queje.

---

## Criterios de aceptación

- [ ] Al abrir la tab "Gestiones" con ruta activa, se ven las gestiones agrupadas por cita
- [ ] Cada gestión muestra su tipo (ORDEN/NOVEDAD), OT, partida, hora, y si tiene foto
- [ ] Al tocar una gestión, se abre el detalle completo con foto si existe
- [ ] Sin ruta activa, la pantalla muestra estado vacío
- [ ] Pull-to-refresh recarga desde SQLite
- [ ] Al finalizar ruta (botón, backend, o nueva asignación), todas las gestiones + archivos de imagen se borran del dispositivo
- [ ] La tabla `pending_image_uploads` se limpia en la finalización
- [ ] El directorio `ordenes/` se elimina del filesystem en la finalización
