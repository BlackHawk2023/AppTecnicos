# Plan de Implementación - Mobile Admin App

## Resumen Ejecutivo

La app `mobile-admin` fue construida contra un API hipotético que **no coincide con el backend real** de StDiscarV2. Este plan detalla la implementación de las correcciones necesarias.

**Problemas principales identificados:**
1. Endpoints incorrectos (usaba `/mobile/auth/login` en lugar de `/auth/login`)
2. Request/response shapes que no coinciden con el backend
3. Campo `zona_info` inventado (no existe en el backend)
4. AuthGuard no redirige al login cuando no hay sesión
5. Faltan archivos para rutas registradas

---

## Arquitectura de la Solución

```mermaid
graph TB
    subgraph App Mobile Admin
        A[Pantallas] --> B[Contextos]
        B --> C[Servicios]
        C --> D[API Client]
    end
    
    subgraph Backend StDiscarV2
        E[/auth/login] --> F[JWT Token]
        G[/auth/me] --> H[User Data]
        I[/stock-discar/*] --> J[Stock Data]
        K[/stock-discar/transferencias] --> L[Transferencias]
        M[/stock-discar/alertas] --> N[Alertas]
    end
    
    D --> E
    D --> G
    D --> I
    D --> K
    D --> M
```

---

## FASE 1: Servicios Base

### 1.1 `services/api.service.ts`
**Estado:** ✅ Mayormente correcto
**Cambios menores:**
- Verificar que `BASE_URL` sea configurable
- El refresh token ya usa `refresh_token` correctamente

### 1.2 `services/auth.service.ts` 
**Estado:** ❌ Requiere reescritura completa
**Cambios:**

```typescript
// NUEVAS INTERFACES
interface LoginRequest {
  username: string;  // era: usuario
  password: string;  // era: contrasena
}

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  // NOTA: NO incluye user, hay que llamar /auth/me
}

interface User {
  usuario: string;
  nombrecompleto: string;
  perfil: string;
  zona: string | null;
  is_active: boolean;
  email: string | null;
  // Eliminar zona_info - no existe
}
```

**Endpoint correcto:** `POST /auth/login` (NO `/mobile/auth/login`)

**Flujo de login:**
1. POST `/auth/login` con `{username, password}`
2. Guardar tokens
3. GET `/auth/me` para obtener datos del usuario
4. GET `/zonas` para obtener el código base del encargado
5. Guardar usuario y codigoBase en storage

---

## FASE 2: Contexto de Autenticación

### 2.1 `contexts/AuthContext.tsx`
**Estado:** ❌ Requiere modificaciones

**Cambios:**
1. Agregar `codigoBase: string | null` al contexto
2. Modificar `login(username, password)` para que:
   - Llame al servicio de login
   - Obtenga datos del usuario con `/auth/me`
   - Obtenga la base con `/zonas`
   - Navegue a `/(tabs)`
3. Modificar `checkAuth()` para:
   - Validar token con `/auth/me`
   - Intentar refresh si falla
   - Logout si refresh falla

---

## FASE 3: Servicios de Datos

### 3.1 `services/stock.service.ts`
**Estado:** ❌ Requiere reescritura completa

**Nuevas interfaces:**

```typescript
interface StockDiscarCompleto {
  id: number;
  codigo_material: string;     // era: material_codigo
  nombre_material: string;     // era: material_descripcion
  unidad_medida: string;       // SERIALIZADO | UNIDAD
  categoria: string | null;    // era: material_tipo
  codigo_base: string;         // NUEVO
  nombre_base: string;         // NUEVO
  ubicacion_id: number;
  ubicacion_codigo: string;    // NUEVO
  ubicacion_nombre: string;
  serie: string | null;        // era: numero_serie
  cantidad: number;            // era: cantidad_disponible
  estado: string;
  fecha_creacion: string;
  fecha_modificacion: string;
  observaciones: string | null;
}

interface StockDiscarCreate {
  codigo_material: string;  // REQUERIDO - era: material_id
  codigo_base: string;      // REQUERIDO - NUEVO
  ubicacion_id: number;     // REQUERIDO
  serie: string | null;     // requerido si SERIALIZADO
  cantidad: number;         // 1 si SERIALIZADO
  observaciones?: string;
}
```

**Endpoints correctos:**
- `GET /stock-discar/stock?codigo_base=X&skip=0&limit=100`
- `GET /stock-discar/stock/{id}`
- `POST /stock-discar/stock`
- `GET /stock-discar/ubicaciones?tipo=X&activo=true`
- `GET /stock-discar/dashboard?codigo_base=X`
- `GET /stock-discar/validar-serie?codigo_material=X&serie=Y` (es GET, no POST)

### 3.2 `services/transferencias.service.ts`
**Estado:** ❌ Requiere reescritura completa

**Endpoints correctos:**
- `GET /stock-discar/transferencias?estado=X&skip=0&limit=50`
- `POST /stock-discar/transferencias`
- `POST /stock-discar/transferencias/{id}/responder`
- `POST /stock-discar/transferencias/{id}/cancelar` (es POST, no DELETE)

**Request para crear:**
```typescript
interface TransferenciaCreate {
  origen_ubicacion: string;   // código ubicación
  destino_ubicacion: string;  // código ubicación
  comentario?: string;
  items: {
    codigo_material: string;
    serie?: string;
    cantidad: number;
  }[];
}
```

### 3.3 `services/alertas.service.ts`
**Estado:** ❌ Requiere reescritura completa

**Endpoints correctos:**
- `GET /stock-discar/alertas?resuelta=false&tipo=X`
- `GET /stock-discar/alertas/count`
- `POST /stock-discar/alertas/{id}/resolver`

**Cambios importantes:**
- Eliminar filtros de severidad (no existen)
- Agregar filtros por tipo: SERIE_DUPLICADA, STOCK_NEGATIVO
- Response usa `{total, alertas}` no `{total, items}`
- Eliminar función `marcarComoVista` (no existe)

---

## FASE 4: Layout y Navegación

### 4.1 `app/_layout.tsx`
**Estado:** ❌ Requiere correcciones

**Cambios:**
1. AuthGuard debe redirigir a login:
```tsx
function AuthGuard({ children }) {
  const { isLoading, isAuthenticated } = useAuth();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }
  
  return <>{children}</>;
}
```

2. Eliminar `Stack.Screen name="alertas"` (líneas 133-139) - conflicta con tab

---

## FASE 5: Pantallas de Autenticación

### 5.1 `app/(auth)/login.tsx`
**Cambios:**
- Usar el nuevo `login(username, password)` del AuthContext
- Eliminar doble navegación
- Manejar códigos de error: AUTH_001, AUTH_002

---

## FASE 6: Pantallas de Stock

### 6.1 `app/(tabs)/index.tsx` - Dashboard
**Cambios:**
- Usar `getDashboard(codigoBase)` del servicio actualizado
- Mapear response correctamente:
  - `total_items` → total de items
  - `items_serializados` / `items_unidad`
  - Alertas: `getAlertasCount().total`
  - Transferencias: `getTransferencias({estado: 'PENDIENTE'}).total`

### 6.2 `app/(tabs)/stock.tsx`
**Cambios en campos:**
| Campo actual | Campo correcto |
|-------------|----------------|
| material_codigo | codigo_material |
| material_descripcion | nombre_material |
| material_tipo | categoria |
| cantidad_disponible | cantidad |
| numero_serie | serie |
| es_serializado | unidad_medida === 'SERIALIZADO' |

**Paginación:** Cambiar de `page/totalPages` a `skip/limit`

### 6.3 `app/stock/cargar.tsx`
**Cambios:**
- Obtener `codigoBase` del contexto
- Request body:
```typescript
{
  codigo_material: selectedMaterial.codigo_material,
  codigo_base: codigoBase,
  ubicacion_id: selectedUbicacion.id,
  serie: esSerialized ? numeroSerie : null,
  cantidad: esSerialized ? 1 : parseInt(cantidad),
}
```

### 6.4 `app/stock/verificar.tsx`
**Cambios:**
- `validarSerie(codigoMaterial, serie)` - requiere código material
- Es GET, no POST
- Response: `{disponible, mensaje, ubicacion_actual?}`

### 6.5 `app/stock/detalle.tsx`
**Mapeo de campos igual que stock.tsx**

---

## FASE 7: Pantallas de Transferencias

### 7.1 `app/(tabs)/transferencias.tsx`
**Mapeo de campos:**
| Campo actual | Campo correcto |
|-------------|----------------|
| numero_transferencia | id |
| origen_nombre | construir desde origen_ubicacion |
| destino_nombre | construir desde destino_ubicacion |
| observaciones | comentario |

### 7.2 `app/transferencias/nueva.tsx`
**Cambios:**
- `getTecnicos()` → `GET /usuarios` filtrar por perfil
- `getBases()` → `GET /stock-discar/ubicaciones?tipo=FIJA`
- Request usa códigos string, no IDs numéricos

### 7.3 `app/transferencias/detalle.tsx`
**Cambios:**
- `cancelarTransferencia()` es POST, no DELETE

---

## FASE 8: Pantallas de Alertas

### 8.1 `app/(tabs)/alertas.tsx`
**Cambios mayores:**
- Eliminar filtros de severidad
- Agregar filtros por tipo: TODAS, SERIE_DUPLICADA, STOCK_NEGATIVO
- Agregar filtro por estado: Pendientes / Resueltas
- Mapeo de campos:
  - `titulo` → `tipo`
  - `mensaje` → `descripcion`
  - `estado` → `resuelta ? 'RESUELTA' : 'PENDIENTE'`
- Eliminar "Marcar vista"
- Response usa `{total, alertas}`

---

## FASE 9: Archivos Faltantes

### 9.1 CREAR `app/transferencias/recibir.tsx`
**Funcionalidad:** Ver transferencias pendientes y aceptar/rechazar

```tsx
// Implementación:
// 1. GET /stock-discar/transferencias?estado=PENDIENTE&ubicacion={codigoUbicacion}
// 2. Listar con botones aceptar/rechazar
// 3. POST /stock-discar/transferencias/{id}/responder
```

### 9.2 CREAR `app/auditoria/historial.tsx`
**Funcionalidad:** Placeholder (no hay endpoint aún)

```tsx
export default function HistorialAuditoriaScreen() {
  return (
    <SafeAreaView>
      <Text>📜 Historial de Auditorías</Text>
      <Text>Funcionalidad en desarrollo</Text>
    </SafeAreaView>
  );
}
```

---

## FASE 10: Testing y Verificación

### Checklist de Verificación

#### Autenticación
- [ ] Login funciona con credenciales de encargado
- [ ] Se obtiene correctamente el codigoBase
- [ ] Logout funciona
- [ ] AuthGuard redirige a login cuando no hay sesión
- [ ] Refresh token funciona cuando expira

#### Stock
- [ ] Dashboard carga datos reales
- [ ] Tab Stock lista items con datos correctos
- [ ] Filtros de stock funcionan
- [ ] Detalle de stock muestra datos correctos
- [ ] Cargar stock funciona
- [ ] Verificar serie funciona (con código material)

#### Transferencias
- [ ] Tab Transferencias lista transferencias
- [ ] Crear nueva transferencia funciona
- [ ] Detalle de transferencia muestra datos
- [ ] Aceptar/rechazar transferencia funciona
- [ ] Cancelar transferencia funciona (POST)
- [ ] Pantalla "recibir" funciona

#### Alertas
- [ ] Tab Alertas lista alertas
- [ ] Filtros por tipo funcionan
- [ ] Resolver alerta funciona

#### General
- [ ] `npx expo start` compila sin errores
- [ ] Perfil muestra datos correctos
- [ ] Sin errores en consola

---

## Orden de Ejecución Recomendado

1. **Servicios** → 2. **Contextos** → 3. **Layout** → 4. **Pantallas Auth** → 5. **Pantallas Stock** → 6. **Pantallas Transferencias** → 7. **Pantallas Alertas** → 8. **Archivos nuevos** → 9. **Testing**

---

## Notas Técnicas Importantes

1. **Paginación:** El backend usa `skip/limit`, no `page/limit`
   - `skip = (page - 1) * limit`

2. **Materiales:** No hay endpoint directo. Opciones:
   - Crear `GET /stock-discar/materiales` en backend
   - Extraer materiales únicos del stock actual

3. **Token:** Header `Authorization: Bearer {access_token}`

4. **NO usar** endpoints `/mobile/*` - son para app de técnicos

5. **Zona info:** No existe. La base se obtiene de `GET /zonas` filtrando por `user.zona`
