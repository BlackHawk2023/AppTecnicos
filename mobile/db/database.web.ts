// Database Service - Web stub (SQLite not available on web)
// This file is loaded on web platform

import { GestionData, GestionRecord } from './database.native';

export interface DatabaseService {
    init(): Promise<void>;
    getDb(): Promise<any>;
    saveClosureTypes(closures: any[]): Promise<void>;
    saveMaterials(materials: any[]): Promise<void>;
    saveTemplate(key: string, content: string): Promise<void>;
    getMaterials(): Promise<any[]>;
    getClosureTypes(): Promise<any[]>;
    getTemplate(key: string): Promise<string | null>;
    // Gestiones (unified orders + novedades)
    saveGestion(gestion: GestionData): Promise<number>;
    getPendingGestiones(): Promise<GestionRecord[]>;
    markGestionSynced(id: number): Promise<void>;
    getGestionByService(cita: string, ot: string, partida: number): Promise<GestionRecord | null>;
    // Cleanup methods
    hasPendingGestiones(): Promise<boolean>;
    clearSyncedGestiones(): Promise<number>;
    clearAllGestiones(): Promise<number>;
    clearPendingImageUploads(): Promise<void>;
    // Plantillas de materiales
    savePlantillasMaterial(plantillas: any[]): Promise<void>;
    getPlantillasMaterial(tipo_incidente?: string, tipo_cierre?: string): Promise<any[]>;
}

// Web stub implementation - all methods are no-ops
class WebDatabaseStub implements DatabaseService {
    async init(): Promise<void> {
        console.log('Database: Web platform - no SQLite');
    }
    async getDb(): Promise<any> {
        throw new Error('SQLite not available on web');
    }
    async saveClosureTypes(_closures: any[]): Promise<void> {
        console.log('Database: Web - saveClosureTypes skipped');
    }
    async saveMaterials(_materials: any[]): Promise<void> {
        console.log('Database: Web - saveMaterials skipped');
    }
    async saveTemplate(_key: string, _content: string): Promise<void> {
        console.log('Database: Web - saveTemplate skipped');
    }
    async getMaterials(): Promise<any[]> {
        return [];
    }
    async getClosureTypes(): Promise<any[]> {
        return [];
    }
    async getTemplate(_key: string): Promise<string | null> {
        return null;
    }
    // Gestiones stubs
    async saveGestion(_gestion: GestionData): Promise<number> {
        console.log('Database: Web - saveGestion skipped');
        return 0;
    }
    async getPendingGestiones(): Promise<GestionRecord[]> {
        return [];
    }
    async markGestionSynced(_id: number): Promise<void> {
        console.log('Database: Web - markGestionSynced skipped');
    }
    async getGestionByService(_cita: string, _ot: string, _partida: number): Promise<GestionRecord | null> {
        return null;
    }
    // Cleanup stubs
    async hasPendingGestiones(): Promise<boolean> {
        return false;
    }
    async clearSyncedGestiones(): Promise<number> {
        console.log('Database: Web - clearSyncedGestiones skipped');
        return 0;
    }
    async clearAllGestiones(): Promise<number> {
        console.log('Database: Web - clearAllGestiones skipped');
        return 0;
    }
    async clearPendingImageUploads(): Promise<void> {
        console.log('Database: Web - clearPendingImageUploads skipped');
    }
    async getGestionesByRuta(_rutaId: number): Promise<GestionRecord[]> {
        return [];
    }
    async clearGestionesNotInRuta(_currentRutaId: number | null): Promise<number> {
        console.log('Database: Web - clearGestionesNotInRuta skipped');
        return 0;
    }
    async savePlantillasMaterial(_plantillas: any[]): Promise<void> {
        console.log('Database: Web - savePlantillasMaterial skipped');
    }
    async getPlantillasMaterial(_tipo_incidente?: string, _tipo_cierre?: string): Promise<any[]> {
        return [];
    }
}

// Singleton for web
const webStub = new WebDatabaseStub();

export const createDatabaseService = (_sqlite?: any): DatabaseService => {
    return webStub;
};

export const getDatabaseService = (): DatabaseService | null => {
    return webStub;
};
