import type { DutyCategory } from './dutyCategories';

export type UserRole = 'employee' | 'supervisor';
export type DutyStatus = 'pending' | 'in_progress' | 'completed';

export interface Group {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: string;
}

export interface Profile {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  groupId: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface QuranScope {
  scopeSurahFrom: number;
  scopeAyahFrom: number;
  scopeSurahTo: number;
  scopeAyahTo: number;
  scopeNote: string | null;
}

export interface DutyGroupAssignment extends QuranScope {
  id: string;
  groupId: string;
  category: DutyCategory;
  dueDate: string;
  assignedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Duty extends QuranScope {
  id: string;
  employeeId: string;
  assignedBy: string;
  groupAssignmentId: string | null;
  category: DutyCategory;
  dueDate: string;
  status: DutyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DutyStepProgress {
  id: string;
  dutyId: string;
  stepOrder: number;
  stepKey: string;
  isCompleted: boolean;
  completedAt: string | null;
}

/** A duty with its checklist rows attached — the shape most screens actually render. */
export interface DutyWithSteps extends Duty {
  steps: DutyStepProgress[];
}
