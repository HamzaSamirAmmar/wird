// Hand-authored to match supabase/migrations/20260827074248_initial_schema.sql.
// Once the project is linked, regenerate the real thing with:
//   supabase gen types typescript --linked > src/database.types.ts
// (same `Database` shape, so nothing downstream should need to change).

export type UserRole = 'employee' | 'supervisor';
export type DutyCategoryEnum = 'new_memorization' | 'minor_review' | 'major_review';
export type DutyStatusEnum = 'pending' | 'in_progress' | 'completed';

export interface Database {
  public: {
    Tables: {
      groups: {
        Row: {
          id: string;
          name: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['groups']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          username: string;
          full_name: string;
          role: UserRole;
          group_id: string | null;
          must_change_password: boolean;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          full_name: string;
          role: UserRole;
          group_id?: string | null;
          must_change_password?: boolean;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      duty_category_steps: {
        Row: {
          category: DutyCategoryEnum;
          step_order: number;
          step_key: string;
          step_label: string;
        };
        Insert: Database['public']['Tables']['duty_category_steps']['Row'];
        Update: Partial<Database['public']['Tables']['duty_category_steps']['Row']>;
        Relationships: [];
      };
      duty_group_assignments: {
        Row: {
          id: string;
          group_id: string;
          category: DutyCategoryEnum;
          due_date: string;
          scope_surah_from: number;
          scope_ayah_from: number;
          scope_surah_to: number;
          scope_ayah_to: number;
          scope_note: string | null;
          assigned_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          category: DutyCategoryEnum;
          due_date: string;
          scope_surah_from: number;
          scope_ayah_from: number;
          scope_surah_to: number;
          scope_ayah_to: number;
          scope_note?: string | null;
          assigned_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['duty_group_assignments']['Insert']>;
        Relationships: [];
      };
      duties: {
        Row: {
          id: string;
          employee_id: string;
          assigned_by: string;
          group_assignment_id: string | null;
          category: DutyCategoryEnum;
          due_date: string;
          scope_surah_from: number;
          scope_ayah_from: number;
          scope_surah_to: number;
          scope_ayah_to: number;
          scope_note: string | null;
          status: DutyStatusEnum;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          assigned_by: string;
          group_assignment_id?: string | null;
          category: DutyCategoryEnum;
          due_date: string;
          scope_surah_from: number;
          scope_ayah_from: number;
          scope_surah_to: number;
          scope_ayah_to: number;
          scope_note?: string | null;
          status?: DutyStatusEnum;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['duties']['Insert']>;
        Relationships: [];
      };
      duty_step_progress: {
        Row: {
          id: string;
          duty_id: string;
          step_order: number;
          step_key: string;
          is_completed: boolean;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          duty_id: string;
          step_order: number;
          step_key: string;
          is_completed?: boolean;
          completed_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['duty_step_progress']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      duty_category: DutyCategoryEnum;
      duty_status: DutyStatusEnum;
    };
    CompositeTypes: Record<string, never>;
  };
}
