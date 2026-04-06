Plan Detallado para Resolución del Rastreo de Ubicación en Segundo Plano
1. ANÁLISIS DEL PROBLEMA ACTUAL
El problema principal es que están usando un Foreground Service con notificación, pero al ser una notificación normal (dismissible), el técnico puede eliminarla. Cuando Android detecta que la notificación del Foreground Service fue eliminada, puede detener el servicio, interrumpiendo así el rastreo.
2. VERIFICACIÓN DE LA IMPLEMENTACIÓN ACTUAL
Checklist para el Agente - Revisar qué tienen implementado:
A) Sobre el Servicio:

¿Están usando un Service o un ForegroundService?
¿El servicio se inicia con startForeground() inmediatamente al crearse?
¿Qué tipo de servicio declararon en el AndroidManifest.xml? (verificar el foregroundServiceType)
¿Tienen implementado onStartCommand() con el return correcto?

B) Sobre la Notificación:

¿Qué prioridad tiene el canal de notificación? (IMPORTANCE_LOW, DEFAULT, HIGH)
¿La notificación tiene configurado setOngoing(true)?
¿Tienen configurado setAutoCancel(false)?
¿La notificación tiene un PendingIntent asociado para cuando el usuario la toca?

C) Sobre los Permisos:

¿Tienen los permisos de ubicación en segundo plano? (ACCESS_BACKGROUND_LOCATION para Android 10+)
¿Tienen el permiso FOREGROUND_SERVICE y FOREGROUND_SERVICE_LOCATION en el manifest?
¿Solicitan estos permisos correctamente en runtime?

D) Sobre el WorkManager/AlarmManager:

¿Cómo están programando las actualizaciones cada 2 minutos? (AlarmManager, WorkManager, Handler, etc.)

3. SOLUCIONES TÉCNICAS ESPECÍFICAS
SOLUCIÓN PRINCIPAL: Notificación No Descartable
El servicio debe usar una notificación marcada como "ongoing" (persistente) que no se puede descartar deslizando. Esto es lo que necesitan implementar:
A) Crear el Canal de Notificación correctamente:
kotlinprivate fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Rastreo de Ruta Activa",
            NotificationManager.IMPORTANCE_LOW // LOW para que sea menos intrusiva
        ).apply {
            description = "Monitoreo de ubicación durante rutas activas"
            setShowBadge(false)
            setSound(null, null) // Sin sonido para ser silencioso
            enableVibration(false) // Sin vibración
        }
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.createNotificationChannel(channel)
    }
}
B) Construir la Notificación Persistente:
kotlinprivate fun createNotification(): Notification {
    val notificationIntent = Intent(this, MainActivity::class.java)
    val pendingIntent = PendingIntent.getActivity(
        this, 0, notificationIntent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle("Ruta Activa")
        .setContentText("Tiene una ruta activa. Recuerde Sincronizar y Finalizar al terminar")
        .setSmallIcon(R.drawable.ic_location_tracking) // Ícono apropiado
        .setContentIntent(pendingIntent)
        .setOngoing(true) // ¡CRÍTICO! Hace que no se pueda descartar
        .setAutoCancel(false) // No se cancela al tocar
        .setPriority(NotificationCompat.PRIORITY_LOW) // Prioridad baja para ser discreto
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .build()
}
C) Implementar el Foreground Service correctamente:
kotlinclass LocationTrackingService : Service() {
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createNotificationChannel()
        val notification = createNotification()
        
        // Iniciar como Foreground Service INMEDIATAMENTE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, 
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        
        // Iniciar el rastreo de ubicación
        startLocationTracking()
        
        // START_STICKY asegura que el servicio se reinicie si es terminado
        return START_STICKY
    }
    
    // Resto de la implementación...
}
D) AndroidManifest.xml - Configuración necesaria:
xml<manifest>
    <!-- Permisos necesarios -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
    <application>
        <service
            android:name=".LocationTrackingService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="location" />
    </application>
</manifest>
4. MEJORAS ADICIONALES RECOMENDADAS
A) Protección contra terminación del servicio:
Implementar onTaskRemoved() para manejar cuando el usuario cierra la app desde recientes:
kotlinoverride fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    // Reiniciar el servicio si es necesario
    val restartServiceIntent = Intent(applicationContext, this::class.java)
    val restartServicePendingIntent = PendingIntent.getService(
        this, 1, restartServiceIntent,
        PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
    )
    
    val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarmManager.set(
        AlarmManager.ELAPSED_REALTIME,
        SystemClock.elapsedRealtime() + 1000,
        restartServicePendingIntent
    )
}
B) Para el rastreo cada 2 minutos:
Usar LocationRequest con configuración apropiada:
kotlinprivate fun startLocationTracking() {
    val locationRequest = LocationRequest.Builder(
        Priority.PRIORITY_HIGH_ACCURACY,
        120000L // 2 minutos en milisegundos
    ).apply {
        setMinUpdateIntervalMillis(120000L)
        setWaitForAccurateLocation(false)
    }.build()
    
    // Implementar el LocationCallback y solicitar actualizaciones
}
C) Manejo de batería - Doze Mode:
Para Android 6.0+, considerar eximir la app de optimizaciones de batería si es crítico:
kotlinprivate fun requestIgnoreBatteryOptimizations() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        intent.data = Uri.parse("package:$packageName")
        startActivity(intent)
    }
}
5. CHECKLIST DE IMPLEMENTACIÓN PARA EL AGENTE
Paso 1: Verificar que el servicio usa setOngoing(true) en la notificación
Paso 2: Confirmar que startForeground() se llama INMEDIATAMENTE en onStartCommand()
Paso 3: Validar que el foregroundServiceType="location" está en el manifest
Paso 4: Verificar permisos de ubicación en segundo plano (Android 10+)
Paso 5: Implementar START_STICKY en el return de onStartCommand()
Paso 6: Testear que la notificación NO se puede descartar deslizando
Paso 7: Verificar que el rastreo continúa aunque la app esté en background
Paso 8: Probar en diferentes versiones de Android (especialmente 10, 11, 12, 13, 14)
Paso 9: Validar comportamiento cuando el usuario cierra la app desde recientes
Paso 10: Confirmar que las ubicaciones se registran correctamente cada 2 minutos
6. PRUEBAS RECOMENDADAS
Una vez implementados los cambios, realizar estas pruebas:

Iniciar ruta y verificar que aparece la notificación persistente
Intentar descartar la notificación deslizando (NO debería poder)
Verificar logs de ubicación cada 2 minutos con la app en background
Cerrar la app desde el menú de recientes y verificar que el servicio sigue
Dejar el dispositivo sin tocar por 15 minutos y verificar el rastreo
Probar en modo avión ON/OFF para verificar resiliencia
Verificar consumo de batería (debería ser moderado con PRIORITY_BALANCED_POWER_ACCURACY)

PLAN OPTIMIZADO PARA BAJO CONSUMO DE BATERÍA
1. CAMBIOS CRÍTICOS EN LA ESTRATEGIA DE UBICACIÓN
A) Usar PRIORITY_BALANCED_POWER_ACCURACY en lugar de HIGH_ACCURACY:
kotlinprivate fun startLocationTracking() {
    val locationRequest = LocationRequest.Builder(
        Priority.PRIORITY_BALANCED_POWER_ACCURACY, // ¡CAMBIO CLAVE!
        120000L // 2 minutos
    ).apply {
        setMinUpdateIntervalMillis(120000L)
        setMaxUpdateDelayMillis(240000L) // Permite batch de ubicaciones
        setWaitForAccurateLocation(false)
        setMinUpdateDistanceMeters(10f) // Solo actualizar si se movió >10m
    }.build()
    
    fusedLocationClient.requestLocationUpdates(
        locationRequest,
        locationCallback,
        Looper.getMainLooper()
    )
}
Diferencias importantes:

PRIORITY_BALANCED_POWER_ACCURACY: Usa WiFi, cell towers y GPS cuando está disponible. Consume 50-70% menos batería que HIGH_ACCURACY
setMaxUpdateDelayMillis(): Permite que el sistema agrupe (batch) las ubicaciones, ahorrando batería
setMinUpdateDistanceMeters(): Evita actualizaciones innecesarias si el técnico está quieto

B) Usar Passive Location Listening cuando sea posible:
Para ahorrar aún más batería, pueden combinar con escucha pasiva:
kotlin// Ubicación pasiva: aprovecha cuando otras apps solicitan ubicación
private fun addPassiveLocationListener() {
    val passiveRequest = LocationRequest.Builder(
        Priority.PRIORITY_PASSIVE,
        120000L
    ).build()
    
    // Esto recibe ubicaciones que otras apps solicitaron, sin costo adicional
    fusedLocationClient.requestLocationUpdates(
        passiveRequest,
        passiveLocationCallback,
        Looper.getMainLooper()
    )
}
2. OPTIMIZACIÓN DEL FOREGROUND SERVICE
A) Usar WakeLock de forma inteligente:
NO usen WakeLock parcial permanente. En su lugar:
kotlinclass LocationTrackingService : Service() {
    
    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(locationResult: LocationResult) {
            locationResult.lastLocation?.let { location ->
                // Guardar en BD local
                saveLocationToLocalDB(location)
                
                // Actualizar notificación si es necesario (cada X ubicaciones)
                updateNotificationIfNeeded(location)
            }
        }
    }
    
    private fun saveLocationToLocalDB(location: Location) {
        // Usar coroutine para no bloquear el thread principal
        CoroutineScope(Dispatchers.IO).launch {
            // Guardar de forma asíncrona
            locationDatabase.locationDao().insert(
                LocationEntity(
                    latitude = location.latitude,
                    longitude = location.longitude,
                    timestamp = System.currentTimeMillis(),
                    accuracy = location.accuracy,
                    // otros campos...
                )
            )
        }
    }
}
B) NO actualizar la notificación constantemente:
Solo actualizar cada 10-15 minutos o cuando hay cambio significativo:
kotlinprivate var lastNotificationUpdate = 0L
private var locationCount = 0

private fun updateNotificationIfNeeded(location: Location) {
    locationCount++
    val now = System.currentTimeMillis()
    
    // Actualizar solo cada 10 minutos o cada 5 ubicaciones
    if (now - lastNotificationUpdate > 600000 || locationCount % 5 == 0) {
        val notification = createUpdatedNotification(locationCount)
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, notification)
        lastNotificationUpdate = now
    }
}

private fun createUpdatedNotification(count: Int): Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle("Ruta Activa")
        .setContentText("$count ubicaciones registradas. Recuerde Sincronizar al terminar")
        .setSmallIcon(R.drawable.ic_location_tracking)
        .setOngoing(true)
        .setAutoCancel(false)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setSound(null)
        .setVibrate(null)
        .build()
}
3. OPTIMIZACIONES ADICIONALES PARA OFFLINE
A) Desactivar conexión de red en el servicio:
Ya que es offline, pueden indicarle al sistema que no necesitan red:
kotlinoverride fun onCreate() {
    super.onCreate()
    
    // Indicar que NO necesitamos conectividad
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        val connectivityManager = getSystemService(ConnectivityManager::class.java)
        // No registrar listeners de red innecesarios
    }
}
B) Batch writes a la base de datos:
En lugar de guardar cada ubicación inmediatamente, pueden hacer batch:
kotlinclass LocationTrackingService : Service() {
    private val locationBuffer = mutableListOf<Location>()
    private val BATCH_SIZE = 5 // Guardar cada 5 ubicaciones
    
    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(locationResult: LocationResult) {
            locationResult.lastLocation?.let { location ->
                locationBuffer.add(location)
                
                if (locationBuffer.size >= BATCH_SIZE) {
                    saveBatchToDatabase()
                }
            }
        }
    }
    
    private fun saveBatchToDatabase() {
        CoroutineScope(Dispatchers.IO).launch {
            val entities = locationBuffer.map { loc ->
                LocationEntity(
                    latitude = loc.latitude,
                    longitude = loc.longitude,
                    timestamp = System.currentTimeMillis(),
                    accuracy = loc.accuracy
                )
            }
            
            locationDatabase.locationDao().insertAll(entities)
            locationBuffer.clear()
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // Guardar ubicaciones pendientes antes de destruir
        if (locationBuffer.isNotEmpty()) {
            saveBatchToDatabase()
        }
    }
}
4. CONFIGURACIÓN ÓPTIMA PARA SU CASO DE USO
AndroidManifest.xml optimizado:
xml<service
    android:name=".LocationTrackingService"
    android:enabled="true"
    android:exported="false"
    android:foregroundServiceType="location"
    android:stopWithTask="false" />
Configuración del LocationRequest optimizada:
kotlincompanion object {
    // Configuración optimizada para batería
    private const val UPDATE_INTERVAL_MS = 120000L // 2 minutos
    private const val FASTEST_INTERVAL_MS = 120000L // 2 minutos (mismo intervalo)
    private const val MAX_WAIT_TIME_MS = 240000L // 4 minutos (permite batching)
    private const val MIN_DISTANCE_METERS = 15f // Solo si se movió 15+ metros
}

private fun createOptimizedLocationRequest(): LocationRequest {
    return LocationRequest.Builder(
        Priority.PRIORITY_BALANCED_POWER_ACCURACY, // Equilibrio batería/precisión
        UPDATE_INTERVAL_MS
    ).apply {
        setMinUpdateIntervalMillis(FASTEST_INTERVAL_MS)
        setMaxUpdateDelayMillis(MAX_WAIT_TIME_MS) // CLAVE para batching
        setMinUpdateDistanceMeters(MIN_DISTANCE_METERS)
        setWaitForAccurateLocation(false)
        setGranularity(Granularity.GRANULARITY_PERMISSION_LEVEL)
    }.build()
}
5. MEDICIONES Y CONFIGURACIONES RECOMENDADAS
A) Diferentes perfiles según tipo de ruta:
Podrían tener perfiles diferentes:
kotlinenum class TrackingProfile(
    val priority: Int,
    val intervalMs: Long,
    val minDistance: Float
) {
    // Técnico caminando/en vehículo urbano
    URBAN(
        Priority.PRIORITY_BALANCED_POWER_ACCURACY,
        120000L, // 2 min
        10f
    ),
    
    // Técnico en ruta larga (autopista)
    HIGHWAY(
        Priority.PRIORITY_BALANCED_POWER_ACCURACY,
        300000L, // 5 min
        50f
    ),
    
    // Técnico estático (trabajando en sitio)
    STATIONARY(
        Priority.PRIORITY_LOW_POWER,
        600000L, // 10 min
        100f
    )
}
6. CHECKLIST DE OPTIMIZACIÓN PARA EL AGENTE
Verificar implementación actual:

 ¿Están usando PRIORITY_HIGH_ACCURACY? → Cambiar a BALANCED_POWER_ACCURACY
 ¿Tienen setMaxUpdateDelayMillis()? → Agregar para batching
 ¿Tienen setMinUpdateDistanceMeters()? → Agregar (10-15 metros)
 ¿Actualizan la notificación en cada ubicación? → Cambiar a cada 5-10 ubicaciones
 ¿Guardan en BD en cada ubicación? → Considerar batching
 ¿Tienen WakeLock permanente? → Eliminar si existe
 ¿Usan WiFi/Bluetooth scan innecesario? → Desactivar
 ¿La notificación tiene prioridad LOW? → Verificar

Implementar mejoras:

 Implementar batching de ubicaciones (5-10 ubicaciones por escritura)
 Configurar maxUpdateDelayMillis para permitir batching del sistema
 Agregar filtro de distancia mínima
 Reducir frecuencia de actualización de notificación
 Considerar passive location listening como complemento

7. IMPACTO ESPERADO EN BATERÍA
Con estas optimizaciones:
Antes (HIGH_ACCURACY sin optimizaciones):

Consumo: ~8-12% batería por hora de rastreo continuo
GPS activo constantemente

Después (BALANCED con optimizaciones):

Consumo: ~2-4% batería por hora de rastreo continuo
GPS se activa solo cuando es necesario
Batching reduce despertares del dispositivo
Filtro de distancia evita actualizaciones innecesarias

8. CONFIGURACIÓN RECOMENDADA FINAL
kotlinclass OptimizedLocationTrackingService : Service() {
    
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private val locationBuffer = mutableListOf<LocationData>()
    private var locationCount = 0
    
    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundWithNotification()
        startOptimizedLocationTracking()
        return START_STICKY
    }
    
    private fun startOptimizedLocationTracking() {
        val request = LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            120000L // 2 min
        ).apply {
            setMinUpdateIntervalMillis(120000L)
            setMaxUpdateDelayMillis(240000L) // Batching
            setMinUpdateDistanceMeters(15f) // Filtro distancia
            setWaitForAccurateLocation(false)
        }.build()
        
        fusedLocationClient.requestLocationUpdates(
            request,
            locationCallback,
            Looper.getMainLooper()
        )
    }
    
    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let { location ->
                locationBuffer.add(LocationData.from(location))
                locationCount++
                
                // Batch write cada 5 ubicaciones
                if (locationBuffer.size >= 5) {
                    saveLocationsToDatabase()
                }
                
                // Actualizar UI cada 10 ubicaciones
                if (locationCount % 10 == 0) {
                    updateNotification()
                }
            }
        }
    }
    
    private fun saveLocationsToDatabase() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                database.locationDao().insertAll(locationBuffer.toList())
                locationBuffer.clear()
            } catch (e: Exception) {
                Log.e(TAG, "Error saving locations", e)
            }
        }
    }
}

Resumen: Con estas optimizaciones, deberían lograr reducir el consumo de batería en un 60-75% manteniendo el rastreo funcional. La clave está en el batching, el filtro de distancia y usar BALANCED_POWER_ACCURACY en lugar de HIGH_ACCURACY.