export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      duties: {
        Row: {
          assigned_by: string
          category: Database["public"]["Enums"]["duty_category"]
          created_at: string
          due_date: string
          employee_id: string
          group_assignment_id: string | null
          id: string
          scope_ayah_from: number
          scope_ayah_to: number
          scope_note: string | null
          scope_surah_from: number
          scope_surah_to: number
          status: Database["public"]["Enums"]["duty_status"]
          updated_at: string
        }
        Insert: {
          assigned_by: string
          category: Database["public"]["Enums"]["duty_category"]
          created_at?: string
          due_date: string
          employee_id: string
          group_assignment_id?: string | null
          id?: string
          scope_ayah_from: number
          scope_ayah_to: number
          scope_note?: string | null
          scope_surah_from: number
          scope_surah_to: number
          status?: Database["public"]["Enums"]["duty_status"]
          updated_at?: string
        }
        Update: {
          assigned_by?: string
          category?: Database["public"]["Enums"]["duty_category"]
          created_at?: string
          due_date?: string
          employee_id?: string
          group_assignment_id?: string | null
          id?: string
          scope_ayah_from?: number
          scope_ayah_to?: number
          scope_note?: string | null
          scope_surah_from?: number
          scope_surah_to?: number
          status?: Database["public"]["Enums"]["duty_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duties_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duties_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duties_group_assignment_id_fkey"
            columns: ["group_assignment_id"]
            isOneToOne: false
            referencedRelation: "duty_group_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_category_steps: {
        Row: {
          category: Database["public"]["Enums"]["duty_category"]
          step_key: string
          step_label: string
          step_order: number
        }
        Insert: {
          category: Database["public"]["Enums"]["duty_category"]
          step_key: string
          step_label: string
          step_order: number
        }
        Update: {
          category?: Database["public"]["Enums"]["duty_category"]
          step_key?: string
          step_label?: string
          step_order?: number
        }
        Relationships: []
      }
      duty_group_assignments: {
        Row: {
          assigned_by: string
          category: Database["public"]["Enums"]["duty_category"]
          created_at: string
          due_date: string
          group_id: string
          id: string
          scope_ayah_from: number
          scope_ayah_to: number
          scope_note: string | null
          scope_surah_from: number
          scope_surah_to: number
          updated_at: string
        }
        Insert: {
          assigned_by: string
          category: Database["public"]["Enums"]["duty_category"]
          created_at?: string
          due_date: string
          group_id: string
          id?: string
          scope_ayah_from: number
          scope_ayah_to: number
          scope_note?: string | null
          scope_surah_from: number
          scope_surah_to: number
          updated_at?: string
        }
        Update: {
          assigned_by?: string
          category?: Database["public"]["Enums"]["duty_category"]
          created_at?: string
          due_date?: string
          group_id?: string
          id?: string
          scope_ayah_from?: number
          scope_ayah_to?: number
          scope_note?: string | null
          scope_surah_from?: number
          scope_surah_to?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_group_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_group_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_step_progress: {
        Row: {
          completed_at: string | null
          duty_id: string
          id: string
          is_completed: boolean
          step_key: string
          step_order: number
        }
        Insert: {
          completed_at?: string | null
          duty_id: string
          id?: string
          is_completed?: boolean
          step_key: string
          step_order: number
        }
        Update: {
          completed_at?: string | null
          duty_id?: string
          id?: string
          is_completed?: boolean
          step_key?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "duty_step_progress_duty_id_fkey"
            columns: ["duty_id"]
            isOneToOne: false
            referencedRelation: "duties"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          group_id: string | null
          id: string
          is_active: boolean
          must_change_password: boolean
          role: Database["public"]["Enums"]["user_role"]
          username: string
        }
        Insert: {
          created_at?: string
          full_name: string
          group_id?: string | null
          id: string
          is_active?: boolean
          must_change_password?: boolean
          role: Database["public"]["Enums"]["user_role"]
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string
          group_id?: string | null
          id?: string
          is_active?: boolean
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_supervisor: { Args: never; Returns: boolean }
    }
    Enums: {
      duty_category: "new_memorization" | "minor_review" | "major_review"
      duty_status: "pending" | "in_progress" | "completed"
      user_role: "employee" | "supervisor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      duty_category: ["new_memorization", "minor_review", "major_review"],
      duty_status: ["pending", "in_progress", "completed"],
      user_role: ["employee", "supervisor"],
    },
  },
} as const
