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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      adjudication_runs: {
        Row: {
          claim_id: string
          created_at: string
          is_retro: boolean
          payload: Json
          run_id: string
          total_member_responsibility_cents: number
          total_plan_paid_cents: number
        }
        Insert: {
          claim_id: string
          created_at?: string
          is_retro?: boolean
          payload: Json
          run_id: string
          total_member_responsibility_cents?: number
          total_plan_paid_cents?: number
        }
        Update: {
          claim_id?: string
          created_at?: string
          is_retro?: boolean
          payload?: Json
          run_id?: string
          total_member_responsibility_cents?: number
          total_plan_paid_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "adjudication_runs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      case_claim_links: {
        Row: {
          case_id: string
          claim_id: string
          linked_at: string
        }
        Insert: {
          case_id: string
          claim_id: string
          linked_at?: string
        }
        Update: {
          case_id?: string
          claim_id?: string
          linked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_claim_links_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_claim_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      case_events: {
        Row: {
          case_id: string
          claim_id: string | null
          description: string
          event_id: string
          event_type: string
          metadata: Json | null
          occurred_at: string
        }
        Insert: {
          case_id: string
          claim_id?: string | null
          description: string
          event_id: string
          event_type: string
          metadata?: Json | null
          occurred_at?: string
        }
        Update: {
          case_id?: string
          claim_id?: string | null
          description?: string
          event_id?: string
          event_type?: string
          metadata?: Json | null
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      cases: {
        Row: {
          case_id: string
          created_at: string
          description: string | null
          member_id: string
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          description?: string | null
          member_id: string
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          description?: string | null
          member_id?: string
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      claim_assignments: {
        Row: {
          assignee: string | null
          claim_id: string
          created_at: string
          status: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          claim_id: string
          created_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          claim_id?: string
          created_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_assignments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "claims"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      claims: {
        Row: {
          claim_id: string
          created_at: string
          member_id: string
          payload: Json
          provider_name: string | null
          service_date_from: string
          service_date_to: string | null
          status: string
          total_billed_cents: number
          updated_at: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          member_id: string
          payload: Json
          provider_name?: string | null
          service_date_from: string
          service_date_to?: string | null
          status: string
          total_billed_cents?: number
          updated_at?: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          member_id?: string
          payload?: Json
          provider_name?: string | null
          service_date_from?: string
          service_date_to?: string | null
          status?: string
          total_billed_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      field_mappings: {
        Row: {
          created_at: string
          mapping: Json
          mapping_id: string
          name: string
          source_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          mapping?: Json
          mapping_id?: string
          name: string
          source_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          mapping?: Json
          mapping_id?: string
          name?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          batch_id: string
          committed_at: string | null
          created_at: string
          error_count: number
          expected_recovery_cents: number
          file_name: string
          generated_claim_ids: Json
          import_score: number
          mapping: Json
          record_count: number
          source_type: string
          status: string
          success_count: number
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          validation: Json
          warning_count: number
        }
        Insert: {
          batch_id?: string
          committed_at?: string | null
          created_at?: string
          error_count?: number
          expected_recovery_cents?: number
          file_name: string
          generated_claim_ids?: Json
          import_score?: number
          mapping?: Json
          record_count?: number
          source_type: string
          status?: string
          success_count?: number
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          validation?: Json
          warning_count?: number
        }
        Update: {
          batch_id?: string
          committed_at?: string | null
          created_at?: string
          error_count?: number
          expected_recovery_cents?: number
          file_name?: string
          generated_claim_ids?: Json
          import_score?: number
          mapping?: Json
          record_count?: number
          source_type?: string
          status?: string
          success_count?: number
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          validation?: Json
          warning_count?: number
        }
        Relationships: []
      }
      member_accumulators: {
        Row: {
          family_deductible_used_cents: number
          family_oop_used_cents: number
          individual_deductible_used_cents: number
          individual_oop_used_cents: number
          member_id: string
          payload: Json | null
          plan_year: number
          updated_at: string
        }
        Insert: {
          family_deductible_used_cents?: number
          family_oop_used_cents?: number
          individual_deductible_used_cents?: number
          individual_oop_used_cents?: number
          member_id: string
          payload?: Json | null
          plan_year: number
          updated_at?: string
        }
        Update: {
          family_deductible_used_cents?: number
          family_oop_used_cents?: number
          individual_deductible_used_cents?: number
          individual_oop_used_cents?: number
          member_id?: string
          payload?: Json | null
          plan_year?: number
          updated_at?: string
        }
        Relationships: []
      }
      ops_events: {
        Row: {
          actor: string | null
          claim_id: string | null
          created_at: string
          event_id: string
          kind: string
          occurred_at: string
          payload: Json | null
          summary: string
        }
        Insert: {
          actor?: string | null
          claim_id?: string | null
          created_at?: string
          event_id: string
          kind: string
          occurred_at?: string
          payload?: Json | null
          summary: string
        }
        Update: {
          actor?: string | null
          claim_id?: string | null
          created_at?: string
          event_id?: string
          kind?: string
          occurred_at?: string
          payload?: Json | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      recovery_outcomes: {
        Row: {
          claim_id: string
          created_at: string
          denial_id: string | null
          denied_amount_cents: number
          notes: string | null
          outcome_id: string
          payer_id: string | null
          payload: Json | null
          recovered_amount_cents: number
          resolution_date: string
          resolution_type: string
          unrecovered_amount_cents: number
          updated_at: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          denial_id?: string | null
          denied_amount_cents?: number
          notes?: string | null
          outcome_id: string
          payer_id?: string | null
          payload?: Json | null
          recovered_amount_cents?: number
          resolution_date: string
          resolution_type: string
          unrecovered_amount_cents?: number
          updated_at?: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          denial_id?: string | null
          denied_amount_cents?: number
          notes?: string | null
          outcome_id?: string
          payer_id?: string | null
          payload?: Json | null
          recovered_amount_cents?: number
          resolution_date?: string
          resolution_type?: string
          unrecovered_amount_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_outcomes_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      traces: {
        Row: {
          claim_id: string
          created_at: string
          payload: Json
          run_id: string
          trace_id: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          payload: Json
          run_id: string
          trace_id: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          payload?: Json
          run_id?: string
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "traces_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "traces_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "adjudication_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
