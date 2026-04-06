Lo que necesitas es que OSRM:
Parta desde la ubicación actual del técnico (origen fijo)
Optimice el orden de visita a todos los servicios (resuelva el TSP)
Termine en el último servicio óptimo (no vuelva al origen)
Esto se logra con los parámetros correctos en el endpoint /trip/v1/ de OSRM.
Configuración exacta para tu caso
http
Copy
GET http://router.project-osrm.org/trip/v1/driving/
  {lon_origen},{lat_origen};      <!-- Ubicación actual del técnico -->
  {lon_servicio1},{lat_servicio1};
  {lon_servicio2},{lat_servicio2};
  {lon_servicio3},{lat_servicio3};
  ...
  ?roundtrip=false&source=first&geometries=geojson&overview=full
Parámetros clave explicados:
Table
Copy
Parámetro	Valor	Significado para tu caso
roundtrip	false	NO vuelve al origen. Termina en el último punto de la ruta óptima
source	first	El primer punto (técnico) es siempre el punto de partida
destination	(omitido)	Cuando roundtrip=false y no se especifica destination, el algoritmo elige el mejor punto final
Importante: Cuando roundtrip=false sin destination, OSRM determina automáticamente cuál de los servicios debe ser el último para minimizar la distancia/tiempo total.
Ejemplo práctico
Supongamos que tu técnico está en Málaga centro y tiene 4 servicios:
http
Copy
GET https://router.project-osrm.org/trip/v1/driving/
  -4.4213,36.7213;    <!-- Técnico (origen fijo) -->
  -4.4250,36.7100;    <!-- Servicio A -->
  -4.4100,36.7300;    <!-- Servicio B -->
  -4.4300,36.7150;    <!-- Servicio C -->
  -4.4150,36.7250     <!-- Servicio D -->
  ?roundtrip=false&source=first&geometries=geojson&overview=full
Respuesta de OSRM:
JSON
Copy
{
  "code": "Ok",
  "waypoints": [
    {
      "location": [-4.4213, 36.7213],
      "waypoint_index": 0,    // ← Siempre 0 (origen)
      "trips_index": 0
    },
    {
      "location": [-4.4100, 36.7300],
      "waypoint_index": 1,    // ← Segundo en visitar (Servicio B)
      "trips_index": 0
    },
    {
      "location": [-4.4250, 36.7100],
      "waypoint_index": 2,    // ← Tercero en visitar (Servicio A)
      "trips_index": 0
    },
    {
      "location": [-4.4150, 36.7250],
      "waypoint_index": 3,    // ← Cuarto en visitar (Servicio D)
      "trips_index": 0
    },
    {
      "location": [-4.4300, 36.7150],
      "waypoint_index": 4,    // ← QUINTO y ÚLTIMO (Servicio C) ← FIN DE RUTA
      "trips_index": 0
    }
  ],
  "trips": [{
    "geometry": { /* GeoJSON para dibujar en el mapa */ },
    "distance": 5200,    // metros totales
    "duration": 780,     // segundos totales (13 min)
    "legs": [
      {"distance": 1200, "duration": 180, "summary": "Calle Larios → Av. Andalucía"}, // Origen → B
      {"distance": 2000, "duration": 300, "summary": "Av. Andalucía → Calle Marqués"}, // B → A
      {"distance": 1500, "duration": 220, "summary": "Calle Marqués → Plaza Mayor"},   // A → D
      {"distance": 500,  "duration": 80,  "summary": "Plaza Mayor → Calle Alcazabilla"} // D → C (FINAL)
    ]
  }]
}
Interpretación de la respuesta
El campo waypoint_index te dice el orden óptimo de visita:
Table
Copy
waypoint_index	Ubicación	Tipo	Orden de visita
0	[-4.4213, 36.7213]	Origen técnico	Salida
1	[-4.4100, 36.7300]	Servicio B	1° servicio
2	[-4.4250, 36.7100]	Servicio A	2° servicio
3	[-4.4150, 36.7250]	Servicio D	3° servicio
4	[-4.4300, 36.7150]	Servicio C	4° servicio (FINAL)
El último waypoint_index (el mayor número) es donde termina el técnico. En este ejemplo, termina en el Servicio C.
Implementación en FastAPI
Python
Copy
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import httpx

app = FastAPI()

class Location(BaseModel):
    lon: float
    lat: float

class RouteRequest(BaseModel):
    technician_location: Location  # Ubicación actual del técnico
    service_locations: List[Location]  # Lista de servicios a visitar

class OptimizedRoute(BaseModel):
    ordered_services: List[dict]  # Servicios en orden óptimo
    total_distance_meters: float
    total_duration_seconds: float
    final_location: dict  # Último servicio (donde termina)
    geometry: dict  # GeoJSON para el mapa

OSRM_BASE_URL = "http://router.project-osrm.org/trip/v1/driving"

@app.post("/optimize-route", response_model=OptimizedRoute)
async def optimize_route(request: RouteRequest):
    if not request.service_locations:
        raise HTTPException(400, "Debe proporcionar al menos un servicio")
    
    # Construir string de coordenadas: lon,lat;lon,lat;...
    # IMPORTANTE: Primero el técnico, luego todos los servicios
    coordinates = [request.technician_location] + request.service_locations
    coords_str = ";".join([f"{loc.lon},{loc.lat}" for loc in coordinates])
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{OSRM_BASE_URL}/{coords_str}",
                params={
                    "roundtrip": "false",    # NO vuelve al origen
                    "source": "first",       # El técnico es el origen
                    "geometries": "geojson", # Para dibujar en el mapa
                    "overview": "full",
                    "steps": "true"          # Instrucciones detalladas
                }
            )
            response.raise_for_status()
            data = response.json()
            
    except httpx.RequestError as e:
        raise HTTPException(503, f"Error conectando con OSRM: {str(e)}")
    
    if data.get("code") != "Ok":
        raise HTTPException(500, f"Error en OSRM: {data.get('message', 'Unknown')}")
    
    # Procesar waypoints para obtener el orden óptimo
    waypoints = data["waypoints"]
    
    # Ordenar waypoints por waypoint_index (el orden de visita)
    sorted_waypoints = sorted(waypoints, key=lambda x: x["waypoint_index"])
    
    # El origen es siempre el primero (índice 0)
    origin = sorted_waypoints[0]
    
    # Los servicios son el resto (índices 1 en adelante)
    ordered_services = []
    for i, wp in enumerate(sorted_waypoints[1:], start=1):
        ordered_services.append({
            "order": i,
            "location": wp["location"],
            "original_index": waypoints.index(wp) - 1  # Índice en el input original
        })
    
    # El último servicio es donde termina el técnico
    final_service = ordered_services[-1] if ordered_services else None
    
    trip = data["trips"][0]
    
    return OptimizedRoute(
        ordered_services=ordered_services,
        total_distance_meters=trip["distance"],
        total_duration_seconds=trip["duration"],
        final_location=final_service,
        geometry=trip["geometry"]
    )
Ejemplo de uso con tu frontend React
JavaScript
Copy
// Enviar petición desde React
const optimizeRoute = async (technicianLoc, services) => {
  const response = await fetch('/optimize-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      technician_location: technicianLoc,  // {lon: -4.4213, lat: 36.7213}
      service_locations: services          // Array de {lon, lat}
    })
  });
  
  const data = await response.json();
  
  // data.ordered_services tiene el orden óptimo
  // data.final_location es el último servicio
  // data.geometry es el GeoJSON para dibujar la ruta
  
  return data;
};
Resumen visual del flujo
plain
Copy
UBICACIONES DE ENTRADA:
┌─────────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Técnico (Origen) │     │ Servicio 1  │     │ Servicio 2  │     │ Servicio 3  │
│  [-4.42, 36.72]   │     │ [-4.41, 36.73]│    │ [-4.43, 36.71]│    │ [-4.40, 36.74]│
└────────┬────────┘     └─────────────┘     └─────────────┘     └─────────────┘
         │
         ▼
    OSRM /trip/v1/driving
    (roundtrip=false, source=first)
         │
         ▼
RUTA OPTIMIZADA DE SALIDA:
┌─────────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   INICIO        │ ──▶ │   2° visita │ ──▶ │   1° visita │ ──▶ │   FIN (3°)  │
│  Técnico        │     │ Servicio 2  │     │ Servicio 1  │     │ Servicio 3  │
│                 │     │             │     │             │     │  [FINAL]    │
└─────────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
   waypoint_index: 0      waypoint_index: 1   waypoint_index: 2   waypoint_index: 3
¿Te gustaría que profundice en cómo manejar múltiples técnicos (asignación de servicios) o la instalación de tu propio servidor OSRM para evitar los límites de la API pública?
ok excelente, teniendo en cuenta esto el tecnico lo solicitaria desde su app movil, la solicitud llegaria al backend y este lo pasaria a OSRM, OSRM luego le devuelve al backend la ruta optimizada y el backend le devuelve al tecnico, la app del tecnico la recibe y abre google maps mostrandole la ruta optimizada, se puede hacer esto?
Edit
Copy
Share
¡Absolutamente sí! Ese flujo es completamente viable y es una arquitectura muy común en aplicaciones de logística y field service. Te detallo cómo implementar cada parte:
Arquitectura del flujo completo
plain
Copy
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  App Móvil  │ ──▶ │   Backend   │ ──▶ │    OSRM     │ ──▶ │   Backend   │
│  (Técnico)  │     │  (FastAPI)  │     │  (Routing)  │     │  (FastAPI)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       ▲                                                            │
       │                                                            ▼
       │                                                     ┌─────────────┐
       │                                                     │  Procesa    │
       │                                                     │  respuesta  │
       │                                                     └──────┬──────┘
       │                                                            │
       │                     ┌─────────────┐                        │
       └─────────────────────│ Google Maps │◄───────────────────────┘
         (Deep Link/Intent)  │   (Abre)    │
                             └─────────────┘
Paso 1: App móvil → Backend
En tu app (React Native / Flutter / Nativa)
JavaScript
Copy
// React Native ejemplo
const requestOptimizedRoute = async () => {
  const technicianLocation = await getCurrentPosition(); // GPS actual
  
  const response = await fetch('https://tu-api.com/optimize-route', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` // Auth del técnico
    },
    body: JSON.stringify({
      technician_location: {
        lon: technicianLocation.longitude,
        lat: technicianLocation.latitude
      },
      service_locations: [
        { lon: -4.4250, lat: 36.7100 }, // Servicio 1
        { lon: -4.4100, lat: 36.7300 }, // Servicio 2
        { lon: -4.4300, lat: 36.7150 }  // Servicio 3
      ]
    })
  });
  
  const routeData = await response.json();
  
  // Abrir Google Maps con la ruta optimizada
  openGoogleMaps(routeData);
};
Paso 2: Backend procesa y devuelve datos listos para Google Maps
FastAPI - Endpoint optimizado
Python
Copy
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import httpx

app = FastAPI()

class Location(BaseModel):
    lon: float
    lat: float

class RouteRequest(BaseModel):
    technician_location: Location
    service_locations: List[Location]

class RouteResponse(BaseModel):
    # Datos para mostrar en tu app
    ordered_services: List[dict]
    total_distance_km: float
    total_duration_min: int
    estimated_arrival_times: List[str]  # ETA por parada
    
    # Datos para Google Maps
    google_maps_url: str  # Deep link universal
    waypoints_coords: List[str]  # Para apps que construyen URL manual
    
    # GeoJSON para mapa propio (opcional)
    route_geometry: dict

OSRM_URL = "http://router.project-osrm.org/trip/v1/driving"

@app.post("/optimize-route", response_model=RouteResponse)
async def optimize_route(request: RouteRequest):
    if len(request.service_locations) > 25:  # Límite práctico de OSRM/GMaps
        raise HTTPException(400, "Máximo 25 servicios por ruta")
    
    # 1. Construir coordenadas
    coords = [request.technician_location] + request.service_locations
    coords_str = ";".join([f"{loc.lon},{loc.lat}" for loc in coords])
    
    # 2. Consultar OSRM
    async with httpx.AsyncClient(timeout=30.0) as client:
        osrm_response = await client.get(
            f"{OSRM_URL}/{coords_str}",
            params={
                "roundtrip": "false",
                "source": "first",
                "geometries": "geojson",
                "overview": "full"
            }
        )
        osrm_data = osrm_response.json()
    
    if osrm_data.get("code") != "Ok":
        raise HTTPException(500, "Error calculando ruta")
    
    # 3. Procesar orden óptimo
    waypoints = sorted(osrm_data["waypoints"], key=lambda x: x["waypoint_index"])
    
    ordered_services = []
    waypoints_for_gmaps = []
    
    for i, wp in enumerate(waypoints[1:], start=1):  # Excluir origen
        lon, lat = wp["location"]
        ordered_services.append({
            "order": i,
            "coords": {"lat": lat, "lon": lon},
            "estimated_arrival": calculate_eta(osrm_data, i)  # Función auxiliar
        })
        waypoints_for_gmaps.append(f"{lat},{lon}")
    
    # 4. Generar URL de Google Maps
    origin = f"{request.technician_location.lat},{request.technician_location.lon}"
    destination = waypoints_for_gmaps[-1]  # Último servicio
    via_points = "|".join(waypoints_for_gmaps[:-1]) if len(waypoints_for_gmaps) > 1 else ""
    
    # URL universal de Google Maps (funciona en iOS y Android)
    google_maps_url = build_google_maps_url(origin, destination, via_points)
    
    trip = osrm_data["trips"][0]
    
    return RouteResponse(
        ordered_services=ordered_services,
        total_distance_km=round(trip["distance"] / 1000, 1),
        total_duration_min=round(trip["duration"] / 60),
        estimated_arrival_times=[s["estimated_arrival"] for s in ordered_services],
        google_maps_url=google_maps_url,
        waypoints_coords=waypoints_for_gmaps,
        route_geometry=osrm_data["trips"][0]["geometry"]
    )

def build_google_maps_url(origin: str, destination: str, waypoints: str) -> str:
    """
    Construye URL universal de Google Maps.
    Formatos:
    - Universal: https://www.google.com/maps/dir/?api=1&...
    - iOS: comgooglemaps://...
    - Android: geo:...
    """
    base_url = "https://www.google.com/maps/dir/?api=1"
    
    params = [
        f"origin={origin}",
        f"destination={destination}",
        "travelmode=driving"  # o walking, bicycling
    ]
    
    if waypoints:
        # waypoints=via:lat1,lng1|via:lat2,lng2 (optimiza orden en GMaps también)
        params.append(f"waypoints={waypoints}")
    
    return f"{base_url}&{'&'.join(params)}"

def calculate_eta(osrm_data, stop_index: int) -> str:
    """Calcula hora estimada de llegada basada en duración acumulada"""
    from datetime import datetime, timedelta
    
    legs = osrm_data["trips"][0]["legs"][:stop_index]
    total_seconds = sum(leg["duration"] for leg in legs)
    eta = datetime.now() + timedelta(seconds=total_seconds)
    
    return eta.strftime("%H:%M")
Paso 3: App recibe y abre Google Maps
Opción A: Abrir URL universal (Recomendado - funciona en iOS y Android)
JavaScript
Copy
// React Native
import { Linking, Platform } from 'react-native';

const openGoogleMaps = (routeData) => {
  // Usar la URL que viene del backend
  const url = routeData.google_maps_url;
  
  // Ejemplo de URL generada:
  // https://www.google.com/maps/dir/?api=1&origin=36.7213,-4.4213
  // &destination=36.7150,-4.4300
  // &waypoints=36.7100,-4.4250|36.7300,-4.4100
  // &travelmode=driving
  
  Linking.canOpenURL(url).then(supported => {
    if (supported) {
      Linking.openURL(url);
    } else {
      // Fallback: abrir en navegador
      Linking.openURL(url);
    }
  });
};
Opción B: URLs específicas por plataforma (más control)
JavaScript
Copy
const openMapsWithRoute = (routeData) => {
  const { waypoints_coords } = routeData;
  const origin = waypoints_coords[0]; // "lat,lon"
  const destination = waypoints_coords[waypoints_coords.length - 1];
  const middlePoints = waypoints_coords.slice(1, -1).join('|');
  
  let url = '';
  
  if (Platform.OS === 'ios') {
    // Intentar Google Maps primero, fallback a Apple Maps
    url = `comgooglemaps://?daddr=${destination}&saddr=${origin}&directionsmode=driving`;
    
    // Si no tiene Google Maps instalado, usar Apple Maps:
    // url = `http://maps.apple.com/?daddr=${destination}&saddr=${origin}&dirflg=d`;
    
  } else if (Platform.OS === 'android') {
    // Intentar Google Maps
    url = `google.navigation:q=${destination}&mode=d`;
    
    // O con waypoints (requiere intent específico):
    // url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${middlePoints}`;
  }
  
  Linking.openURL(url).catch(err => {
    // Fallback a URL web universal
    Linking.openURL(routeData.google_maps_url);
  });
};
Ejemplo de respuesta del backend
JSON
Copy
{
  "ordered_services": [
    {
      "order": 1,
      "coords": {"lat": 36.7100, "lon": -4.4250},
      "estimated_arrival": "09:15"
    },
    {
      "order": 2,
      "coords": {"lat": 36.7300, "lon": -4.4100},
      "estimated_arrival": "09:35"
    },
    {
      "order": 3,
      "coords": {"lat": 36.7150, "lon": -4.4300},
      "estimated_arrival": "09:50"
    }
  ],
  "total_distance_km": 12.5,
  "total_duration_min": 35,
  "estimated_arrival_times": ["09:15", "09:35", "09:50"],
  
  "google_maps_url": "https://www.google.com/maps/dir/?api=1&origin=36.7213,-4.4213&destination=36.7150,-4.4300&waypoints=36.7100,-4.4250|36.7300,-4.4100&travelmode=driving",
  
  "waypoints_coords": [
    "36.7213,-4.4213",
    "36.7100,-4.4250",
    "36.7300,-4.4100",
    "36.7150,-4.4300"
  ],
  
  "route_geometry": {
    "type": "LineString",
    "coordinates": [[-4.4213, 36.7213], [-4.4200, 36.7200], ...]
  }
}
Consideraciones importantes
Table
Copy
Aspecto	Solución
Google Maps re-optimiza la ruta	La URL con waypoints sin via: permite que GMaps reordene. Usa via: para forzar el orden de OSRM
Límite de waypoints	Google Maps permite ~25 waypoints en la URL
Sin app de maps instalada	La URL universal abre el navegador con Google Maps web
Precisión vs OSRM	OSRM y Google Maps pueden calcular rutas ligeramente diferentes (tráfico en tiempo real en GMaps)
URL con orden forzado (sin re-optimización de GMaps)
Si quieres que Google Maps respete exactamente el orden que calculó OSRM (para que el técnico siga tu optimización), usa el prefijo via: en cada waypoint:
plain
Copy
https://www.google.com/maps/dir/?api=1
  &origin=36.7213,-4.4213
  &destination=36.7150,-4.4300
  &waypoints=via:36.7100,-4.4250|via:36.7300,-4.4100
  &travelmode=driving
Sin via:: Google Maps puede reordenar los waypoints si cree que hay una ruta mejor.
Con via:: Google Maps respeta el orden exacto que le pasaste.
Flujo completo visual
plain
Copy
1. TÉCNICO ABRE APP
   "Optimizar mi ruta de hoy"
   
2. APP ENVÍA AL BACKEND
   POST /optimize-route
   {
     "technician_location": {"lon": -4.42, "lat": 36.72},
     "service_locations": [...]
   }
   
3. BACKEND → OSRM → BACKEND
   Calcula orden óptimo: Técnico → B → A → C (FIN)
   
4. BACKEND RESPONDE A APP
   {
     "ordered_services": [B, A, C],
     "google_maps_url": "https://www.google.com/maps/dir/..."
   }
   
5. APP ABRE GOOGLE MAPS
   Linking.openURL(response.google_maps_url)
   
6. GOOGLE MAPS MUESTRA
   [Inicio] → [Parada 1: Servicio B] → [Parada 2: Servicio A] → [Fin: Servicio C]
   
7. TÉCNICO SIGUE NAVEGACIÓN
   Turn-by-turn de Google Maps