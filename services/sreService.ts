
import { AuditLog, User, Lead } from '../types';
import { auditApi, configApi } from './api';

export type CiatosEnv = 'PRODUCTION' | 'STAGING';

class SREEngine {
  private currentEnv: CiatosEnv = 'PRODUCTION';

  constructor() {
    // Carrega env do backend config
    configApi.getKey('ciatos_env').then((r: any) => {
      if (r && r.value) this.currentEnv = r.value as CiatosEnv;
    }).catch(() => {});
  }

  public getEnv(): CiatosEnv {
    return this.currentEnv;
  }

  public async setEnv(env: CiatosEnv) {
    this.currentEnv = env;
    try { await configApi.setKey('ciatos_env', env); } catch (e) { /* silent */ }
    window.location.reload();
  }

  public getStorageKey(baseKey: string): string {
    return this.currentEnv === 'PRODUCTION' ? baseKey : `staging_${baseKey}`;
  }

  // Sistema de Auditoria — salva no backend
  public async logAction(action: string, entityId: string, userId: string, userName: string, oldData?: any, newData?: any) {
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      action,
      entityId,
      userId,
      userName,
      timestamp: new Date().toISOString(),
      previousState: oldData,
      newState: newData
    };

    try { await auditApi.createLog(newLog); } catch (e) { console.error('[SRE] audit log error', e); }

    if (action.includes('DELETE') || action.includes('PURGE')) {
      console.warn(`[SRE ALERT] Operação destrutiva detectada: ${action} por ${userName}`);
    }
  }

  // Snapshot agora vem do backend (contagem de tabelas)
  public async createSnapshot(_leads: Lead[], _users: User[]) {
    try {
      const snap = await auditApi.getLogs({ limit: '1' });
      console.log(`[SRE] Snapshot request completed. Last log:`, snap[0]?.id || 'none');
    } catch (e) {
      console.error("[SRE] Falha ao consultar snapshot:", e);
    }
  }

  public async getSnapshots() {
    try {
      const res = await fetch(`${(import.meta as any).env?.VITE_API_URL || '/crm-api'}/audit/snapshots`);
      return await res.json();
    } catch (e) { return { counts: {} }; }
  }

  public async getAuditTrail(): Promise<AuditLog[]> {
    try { return await auditApi.getLogs(); } catch (e) { return []; }
  }

  // Disaster Recovery — retorna snapshot do banco
  public async restoreFromSnapshot(snapshotId: string): Promise<{ leads: Lead[], users: User[] } | null> {
    await this.logAction('DISASTER_RECOVERY_RESTORE', snapshotId, 'system', 'SRE Engine', null, null);
    return null; // Real restore seria via dump MySQL
  }
}

export const sreEngine = new SREEngine();
