
import { AuditLog, User, Lead } from '../types';

const BACKUP_KEY = 'ciatos_db_snapshots';
const AUDIT_KEY = 'ciatos_audit_trail';
const ENV_KEY = 'ciatos_current_env';

export type CiatosEnv = 'PRODUCTION' | 'STAGING';

class SREEngine {
  private currentEnv: CiatosEnv = 'PRODUCTION';

  constructor() {
    const savedEnv = localStorage.getItem(ENV_KEY);
    if (savedEnv) this.currentEnv = savedEnv as CiatosEnv;
  }

  public getEnv(): CiatosEnv {
    return this.currentEnv;
  }

  public setEnv(env: CiatosEnv) {
    this.currentEnv = env;
    localStorage.setItem(ENV_KEY, env);
    window.location.reload(); // Hard reset para isolar contexto
  }

  // Obter prefixo da chave com base no ambiente
  public getStorageKey(baseKey: string): string {
    return this.currentEnv === 'PRODUCTION' ? baseKey : `staging_${baseKey}`;
  }

  // Sistema de Auditoria
  public logAction(action: string, entityId: string, userId: string, userName: string, oldData?: any, newData?: any) {
    const logs: AuditLog[] = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
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
    
    // Manter apenas os últimos 500 logs para performance
    const updatedLogs = [newLog, ...logs].slice(0, 500);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(updatedLogs));

    // Alerta de Operação Destrutiva
    if (action.includes('DELETE') || action.includes('PURGE')) {
      console.warn(`[SRE ALERT] Operação destrutiva detectada: ${action} por ${userName}`);
    }
  }

  // Sistema de Backup (Snapshots)
  public createSnapshot(leads: Lead[], users: User[]) {
    try {
      const snapshots = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
      const newSnapshot = {
        timestamp: new Date().toISOString(),
        env: this.currentEnv,
        data: { leads, users },
        id: `snap-${Date.now()}`
      };

      // Manter 7 dias de snapshots (backups diários simulados)
      const updatedSnapshots = [newSnapshot, ...snapshots].slice(0, 7);
      localStorage.setItem(BACKUP_KEY, JSON.stringify(updatedSnapshots));
      console.log(`[SRE] Snapshot criado com sucesso em ${newSnapshot.timestamp}`);
    } catch (e) {
      console.error("[SRE] Falha crítica ao gerar backup:", e);
    }
  }

  public getSnapshots() {
    return JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
  }

  public getAuditTrail() {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
  }

  // Procedimento de Restauração (Disaster Recovery)
  public restoreFromSnapshot(snapshotId: string): { leads: Lead[], users: User[] } | null {
    const snapshots = this.getSnapshots();
    const snap = snapshots.find((s: any) => s.id === snapshotId);
    if (!snap) return null;
    
    this.logAction('DISASTER_RECOVERY_RESTORE', snap.id, 'system', 'SRE Engine', null, snap.data);
    return snap.data;
  }
}

export const sreEngine = new SREEngine();
