// This file re-exports platform-specific database module
// React Native automatically resolves to .native.ts or .web.ts
// This base file is for TypeScript type resolution

export type {
    DatabaseService,
    GestionData,
    GestionRecord,
    StockLocalItem,
    MovimientoPendiente,
    AppNotificacion
} from './database.native';

export {
    createDatabaseService,
    getDatabaseService
} from './database.native';
