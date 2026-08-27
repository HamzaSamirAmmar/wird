import Dexie, { type EntityTable } from 'dexie';
import type { DutyCategory, DutyStatus } from '@wird/domain';

export interface CachedDuty {
  id: string;
  employeeId: string;
  category: DutyCategory;
  dueDate: string;
  scopeSurahFrom: number;
  scopeAyahFrom: number;
  scopeSurahTo: number;
  scopeAyahTo: number;
  scopeNote: string | null;
  status: DutyStatus;
}

export interface CachedStep {
  id: string;
  dutyId: string;
  stepOrder: number;
  stepKey: string;
  isCompleted: boolean;
  completedAt: string | null;
}

export interface OutboxEntry {
  id?: number;
  createdAt: number;
  stepId: string;
  isCompleted: boolean;
  completedAt: string | null;
}

const db = new Dexie('wird-offline') as Dexie & {
  duties: EntityTable<CachedDuty, 'id'>;
  steps: EntityTable<CachedStep, 'id'>;
  outbox: EntityTable<OutboxEntry, 'id'>;
};

db.version(1).stores({
  duties: 'id, employeeId, dueDate',
  steps: 'id, dutyId',
  outbox: '++id, stepId',
});

export { db };
