# App de Administradores de Stock - StDiscar

Aplicación móvil para gestión de stock por encargados de zona.

## Requisitos

- Node.js 18+
- Expo CLI
- React Native

## Instalación

```bash
cd mobile-admin
npm install
```

## Ejecución

```bash
# Iniciar en modo desarrollo
npm start

# Android
npm run android

# iOS
npm run ios
```

## Estructura del Proyecto

```
mobile-admin/
├── app/                    # Pantallas (Expo Router)
│   ├── (auth)/            # Grupo autenticación
│   │   └── login.tsx
│   ├── (tabs)/            # Navegación principal
│   │   ├── _layout.tsx
│   │   ├── index.tsx      # Home
│   │   ├── stock.tsx      # Stock
│   │   └── perfil.tsx     # Perfil
│   ├── transferir/        # Crear transferencia
│   ├── verificar/         # Verificar series
│   ├── cargar/            # Cargar stock
│   └── alertas/           # Alertas/Auditoría
├── components/            # Componentes reutilizables
├── services/              # Servicios API
├── contexts/              # Estado global
├── constants/             # Constantes y tema
└── utils/                 # Utilidades
```

## Funcionalidades

- **Stock**: Ver stock completo de la base asignada
- **Transferir**: Crear transferencias a técnicos o bases
- **Verificar**: Validar series en stock
- **Cargar**: Agregar stock manual o importando archivos
- **Alertas**: Gestionar alertas de auditoría
