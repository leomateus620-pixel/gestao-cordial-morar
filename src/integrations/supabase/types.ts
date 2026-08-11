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
      agenciamento_bonuses: {
        Row: {
          achieved_at: string
          categoria: string
          corretor_id: string
          corretor_nome: string | null
          created_at: string
          id: string
          listings_count: number
          nivel: number
          periodo_ref: string | null
          placas_count: number
          status: string
          updated_at: string
        }
        Insert: {
          achieved_at?: string
          categoria: string
          corretor_id: string
          corretor_nome?: string | null
          created_at?: string
          id?: string
          listings_count?: number
          nivel: number
          periodo_ref?: string | null
          placas_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          achieved_at?: string
          categoria?: string
          corretor_id?: string
          corretor_nome?: string | null
          created_at?: string
          id?: string
          listings_count?: number
          nivel?: number
          periodo_ref?: string | null
          placas_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      agenciamentos: {
        Row: {
          bairro: string | null
          cadastrado_cordial: boolean
          cadastrado_morar: boolean
          cadastrado_site: boolean
          cidade: string | null
          codigo_cordial: string | null
          codigo_morar: string | null
          corretor_id: string
          corretor_nome: string
          created_at: string
          created_by: string
          criado_por_nome: string | null
          data_agenciamento: string
          descricao_imovel: string | null
          drive_folder_url: string | null
          endereco: string
          finalidade: string | null
          fotos_drive: boolean
          fotos_horizontal: boolean
          fotos_realizadas: boolean
          fotos_vertical: boolean
          id: string
          imobiliaria: string
          observacoes_internas: string | null
          origem: string
          placa_instalada: boolean
          proprietario_contato_preferencial: string | null
          proprietario_nome: string
          proprietario_observacoes: string | null
          proprietario_telefone: string
          reprovado_em: string | null
          reprovado_motivo: string | null
          reprovado_por_id: string | null
          reprovado_por_nome: string | null
          site_url: string | null
          status: string
          tipo_imovel: string
          updated_at: string
          validado: boolean
          validado_em: string | null
          validado_por_id: string | null
          validado_por_nome: string | null
          video_realizado: boolean
        }
        Insert: {
          bairro?: string | null
          cadastrado_cordial?: boolean
          cadastrado_morar?: boolean
          cadastrado_site?: boolean
          cidade?: string | null
          codigo_cordial?: string | null
          codigo_morar?: string | null
          corretor_id: string
          corretor_nome: string
          created_at?: string
          created_by: string
          criado_por_nome?: string | null
          data_agenciamento: string
          descricao_imovel?: string | null
          drive_folder_url?: string | null
          endereco: string
          finalidade?: string | null
          fotos_drive?: boolean
          fotos_horizontal?: boolean
          fotos_realizadas?: boolean
          fotos_vertical?: boolean
          id?: string
          imobiliaria: string
          observacoes_internas?: string | null
          origem?: string
          placa_instalada?: boolean
          proprietario_contato_preferencial?: string | null
          proprietario_nome: string
          proprietario_observacoes?: string | null
          proprietario_telefone: string
          reprovado_em?: string | null
          reprovado_motivo?: string | null
          reprovado_por_id?: string | null
          reprovado_por_nome?: string | null
          site_url?: string | null
          status?: string
          tipo_imovel: string
          updated_at?: string
          validado?: boolean
          validado_em?: string | null
          validado_por_id?: string | null
          validado_por_nome?: string | null
          video_realizado?: boolean
        }
        Update: {
          bairro?: string | null
          cadastrado_cordial?: boolean
          cadastrado_morar?: boolean
          cadastrado_site?: boolean
          cidade?: string | null
          codigo_cordial?: string | null
          codigo_morar?: string | null
          corretor_id?: string
          corretor_nome?: string
          created_at?: string
          created_by?: string
          criado_por_nome?: string | null
          data_agenciamento?: string
          descricao_imovel?: string | null
          drive_folder_url?: string | null
          endereco?: string
          finalidade?: string | null
          fotos_drive?: boolean
          fotos_horizontal?: boolean
          fotos_realizadas?: boolean
          fotos_vertical?: boolean
          id?: string
          imobiliaria?: string
          observacoes_internas?: string | null
          origem?: string
          placa_instalada?: boolean
          proprietario_contato_preferencial?: string | null
          proprietario_nome?: string
          proprietario_observacoes?: string | null
          proprietario_telefone?: string
          reprovado_em?: string | null
          reprovado_motivo?: string | null
          reprovado_por_id?: string | null
          reprovado_por_nome?: string | null
          site_url?: string | null
          status?: string
          tipo_imovel?: string
          updated_at?: string
          validado?: boolean
          validado_em?: string | null
          validado_por_id?: string | null
          validado_por_nome?: string | null
          video_realizado?: boolean
        }
        Relationships: []
      }
      agenda_event_checklist: {
        Row: {
          created_at: string
          done: boolean
          event_id: string
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          event_id: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          event_id?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_event_checklist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "agenda_events"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_event_google_syncs: {
        Row: {
          calendar_id: string
          created_at: string
          event_id: string
          google_event_id: string
          id: string
          last_error: string | null
          last_synced_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_id?: string
          created_at?: string
          event_id: string
          google_event_id: string
          id?: string
          last_error?: string | null
          last_synced_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          event_id?: string
          google_event_id?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_event_google_syncs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "agenda_events"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_event_guests: {
        Row: {
          created_at: string
          email: string
          event_id: string
          id: string
          nome: string | null
          response_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          event_id: string
          id?: string
          nome?: string | null
          response_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          nome?: string | null
          response_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_event_guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "agenda_events"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_event_participants: {
        Row: {
          created_at: string
          event_id: string
          id: string
          nome: string
          papel: Database["public"]["Enums"]["agenda_participant_papel"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          nome: string
          papel?: Database["public"]["Enums"]["agenda_participant_papel"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          nome?: string
          papel?: Database["public"]["Enums"]["agenda_participant_papel"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agenda_event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "agenda_events"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_event_reminders: {
        Row: {
          antecedencia_min: number
          ativo: boolean
          canal_futuro: boolean
          created_at: string
          event_id: string
          id: string
          tipo: Database["public"]["Enums"]["agenda_reminder_tipo"]
        }
        Insert: {
          antecedencia_min?: number
          ativo?: boolean
          canal_futuro?: boolean
          created_at?: string
          event_id: string
          id?: string
          tipo?: Database["public"]["Enums"]["agenda_reminder_tipo"]
        }
        Update: {
          antecedencia_min?: number
          ativo?: boolean
          canal_futuro?: boolean
          created_at?: string
          event_id?: string
          id?: string
          tipo?: Database["public"]["Enums"]["agenda_reminder_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "agenda_event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "agenda_events"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_events: {
        Row: {
          agenciamento_id: string | null
          atendimento_id: string | null
          cliente_id: string | null
          cliente_nome: string | null
          concluido_em: string | null
          created_at: string
          created_by: string
          criado_por_nome: string | null
          deleted_at: string | null
          descricao: string | null
          dia_inteiro: boolean
          duracao_min: number | null
          fim: string | null
          google_calendar_sync_error: string | null
          google_calendar_sync_status: string
          google_event_id: string | null
          google_synced_at: string | null
          id: string
          imobiliaria: Database["public"]["Enums"]["agenda_imobiliaria"]
          imovel_descricao: string | null
          imovel_endereco: string | null
          imovel_id: string | null
          imovel_nome: string | null
          inicio: string
          local: string | null
          observacoes: string | null
          owner_user_id: string | null
          prioridade: Database["public"]["Enums"]["agenda_prioridade"]
          repeticao: string
          responsavel_nome: string | null
          status: Database["public"]["Enums"]["agenda_status"]
          tipo: Database["public"]["Enums"]["agenda_tipo"]
          titulo: string
          updated_at: string
          video_call_url: string | null
        }
        Insert: {
          agenciamento_id?: string | null
          atendimento_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          concluido_em?: string | null
          created_at?: string
          created_by: string
          criado_por_nome?: string | null
          deleted_at?: string | null
          descricao?: string | null
          dia_inteiro?: boolean
          duracao_min?: number | null
          fim?: string | null
          google_calendar_sync_error?: string | null
          google_calendar_sync_status?: string
          google_event_id?: string | null
          google_synced_at?: string | null
          id?: string
          imobiliaria?: Database["public"]["Enums"]["agenda_imobiliaria"]
          imovel_descricao?: string | null
          imovel_endereco?: string | null
          imovel_id?: string | null
          imovel_nome?: string | null
          inicio: string
          local?: string | null
          observacoes?: string | null
          owner_user_id?: string | null
          prioridade?: Database["public"]["Enums"]["agenda_prioridade"]
          repeticao?: string
          responsavel_nome?: string | null
          status?: Database["public"]["Enums"]["agenda_status"]
          tipo?: Database["public"]["Enums"]["agenda_tipo"]
          titulo: string
          updated_at?: string
          video_call_url?: string | null
        }
        Update: {
          agenciamento_id?: string | null
          atendimento_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          concluido_em?: string | null
          created_at?: string
          created_by?: string
          criado_por_nome?: string | null
          deleted_at?: string | null
          descricao?: string | null
          dia_inteiro?: boolean
          duracao_min?: number | null
          fim?: string | null
          google_calendar_sync_error?: string | null
          google_calendar_sync_status?: string
          google_event_id?: string | null
          google_synced_at?: string | null
          id?: string
          imobiliaria?: Database["public"]["Enums"]["agenda_imobiliaria"]
          imovel_descricao?: string | null
          imovel_endereco?: string | null
          imovel_id?: string | null
          imovel_nome?: string | null
          inicio?: string
          local?: string | null
          observacoes?: string | null
          owner_user_id?: string | null
          prioridade?: Database["public"]["Enums"]["agenda_prioridade"]
          repeticao?: string
          responsavel_nome?: string | null
          status?: Database["public"]["Enums"]["agenda_status"]
          tipo?: Database["public"]["Enums"]["agenda_tipo"]
          titulo?: string
          updated_at?: string
          video_call_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agenda_events_agenciamento_id_fkey"
            columns: ["agenciamento_id"]
            isOneToOne: false
            referencedRelation: "agenciamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_google_sync_queue: {
        Row: {
          attempts: number
          created_at: string
          event_id: string
          last_error: string | null
          next_attempt_at: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_id: string
          last_error?: string | null
          next_attempt_at?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_id?: string
          last_error?: string | null
          next_attempt_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_google_sync_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "agenda_events"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_reminder_deliveries: {
        Row: {
          channel: string
          delivered_at: string
          event_id: string
          offset_min: number
          user_id: string
        }
        Insert: {
          channel?: string
          delivered_at?: string
          event_id: string
          offset_min: number
          user_id: string
        }
        Update: {
          channel?: string
          delivered_at?: string
          event_id?: string
          offset_min?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_reminder_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "agenda_events"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      attendance_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          attendance_id: string
          broker_id: string
          cancelled_at: string | null
          created_at: string
          first_opened_at: string | null
          first_opened_by: string | null
          id: string
          imobiliaria: string | null
          response_time_seconds: number | null
          status: Database["public"]["Enums"]["attendance_assignment_status"]
          superseded_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          attendance_id: string
          broker_id: string
          cancelled_at?: string | null
          created_at?: string
          first_opened_at?: string | null
          first_opened_by?: string | null
          id?: string
          imobiliaria?: string | null
          response_time_seconds?: number | null
          status?: Database["public"]["Enums"]["attendance_assignment_status"]
          superseded_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          attendance_id?: string
          broker_id?: string
          cancelled_at?: string | null
          created_at?: string
          first_opened_at?: string | null
          first_opened_by?: string | null
          id?: string
          imobiliaria?: string | null
          response_time_seconds?: number | null
          status?: Database["public"]["Enums"]["attendance_assignment_status"]
          superseded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_assignments_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_history: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          attendance_id: string
          client_id: string | null
          created_at: string
          description: string | null
          event_type: string
          id: string
          metadata: Json
          new_value: Json | null
          previous_value: Json | null
          source: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          attendance_id: string
          client_id?: string | null
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          metadata?: Json
          new_value?: Json | null
          previous_value?: Json | null
          source?: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          attendance_id?: string
          client_id?: string | null
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          new_value?: Json | null
          previous_value?: Json | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_history_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
        ]
      }
      attendances: {
        Row: {
          bairro_interesse: string | null
          cliente_convertido_id: string | null
          cliente_id: string | null
          cliente_nome: string
          contato_preferencial: string
          convertido_em_cliente: boolean
          corretor_id: string | null
          corretor_nome: string | null
          created_at: string
          created_by: string
          dormitorios: string | null
          email: string | null
          finalidade: string
          fonte_prospeccao: string | null
          historico_inicial: string | null
          id: string
          imobiliaria: string
          imovel_bairro: string | null
          imovel_cidade: string | null
          imovel_codigo: string | null
          imovel_descricao: string | null
          imovel_endereco: string | null
          imovel_id: string | null
          imovel_ref: string | null
          imovel_tipo: string | null
          imovel_valor: number | null
          interesse_descricao: string | null
          motivo_perda: string | null
          observacoes: string | null
          opened_at: string | null
          opened_by: string | null
          orcamento_max: number | null
          orcamento_min: number | null
          origem: string
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          prioridade: string
          proximo_passo: string | null
          proximo_retorno: string | null
          status: string
          telefone: string
          tipo_imovel: string
          updated_at: string
        }
        Insert: {
          bairro_interesse?: string | null
          cliente_convertido_id?: string | null
          cliente_id?: string | null
          cliente_nome: string
          contato_preferencial?: string
          convertido_em_cliente?: boolean
          corretor_id?: string | null
          corretor_nome?: string | null
          created_at?: string
          created_by: string
          dormitorios?: string | null
          email?: string | null
          finalidade?: string
          fonte_prospeccao?: string | null
          historico_inicial?: string | null
          id?: string
          imobiliaria: string
          imovel_bairro?: string | null
          imovel_cidade?: string | null
          imovel_codigo?: string | null
          imovel_descricao?: string | null
          imovel_endereco?: string | null
          imovel_id?: string | null
          imovel_ref?: string | null
          imovel_tipo?: string | null
          imovel_valor?: number | null
          interesse_descricao?: string | null
          motivo_perda?: string | null
          observacoes?: string | null
          opened_at?: string | null
          opened_by?: string | null
          orcamento_max?: number | null
          orcamento_min?: number | null
          origem?: string
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          prioridade?: string
          proximo_passo?: string | null
          proximo_retorno?: string | null
          status?: string
          telefone: string
          tipo_imovel?: string
          updated_at?: string
        }
        Update: {
          bairro_interesse?: string | null
          cliente_convertido_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string
          contato_preferencial?: string
          convertido_em_cliente?: boolean
          corretor_id?: string | null
          corretor_nome?: string | null
          created_at?: string
          created_by?: string
          dormitorios?: string | null
          email?: string | null
          finalidade?: string
          fonte_prospeccao?: string | null
          historico_inicial?: string | null
          id?: string
          imobiliaria?: string
          imovel_bairro?: string | null
          imovel_cidade?: string | null
          imovel_codigo?: string | null
          imovel_descricao?: string | null
          imovel_endereco?: string | null
          imovel_id?: string | null
          imovel_ref?: string | null
          imovel_tipo?: string | null
          imovel_valor?: number | null
          interesse_descricao?: string | null
          motivo_perda?: string | null
          observacoes?: string | null
          opened_at?: string | null
          opened_by?: string | null
          orcamento_max?: number | null
          orcamento_min?: number | null
          origem?: string
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          prioridade?: string
          proximo_passo?: string | null
          proximo_retorno?: string | null
          status?: string
          telefone?: string
          tipo_imovel?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          approximate_income: number | null
          assigned_broker_id: string | null
          assigned_broker_name: string | null
          bedrooms: string | null
          brand: string
          client_type: string
          contact_preference: string
          created_at: string
          created_by: string
          document: string | null
          email: string | null
          full_name: string
          id: string
          lead_origin: string
          max_budget: number | null
          min_budget: number | null
          neighborhood: string | null
          next_follow_up_at: string | null
          next_step: string | null
          notes: string | null
          phone: string
          profession: string | null
          property_type: string
          purpose: string
          restrictions: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approximate_income?: number | null
          assigned_broker_id?: string | null
          assigned_broker_name?: string | null
          bedrooms?: string | null
          brand?: string
          client_type?: string
          contact_preference?: string
          created_at?: string
          created_by?: string
          document?: string | null
          email?: string | null
          full_name: string
          id?: string
          lead_origin?: string
          max_budget?: number | null
          min_budget?: number | null
          neighborhood?: string | null
          next_follow_up_at?: string | null
          next_step?: string | null
          notes?: string | null
          phone?: string
          profession?: string | null
          property_type?: string
          purpose?: string
          restrictions?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approximate_income?: number | null
          assigned_broker_id?: string | null
          assigned_broker_name?: string | null
          bedrooms?: string | null
          brand?: string
          client_type?: string
          contact_preference?: string
          created_at?: string
          created_by?: string
          document?: string | null
          email?: string | null
          full_name?: string
          id?: string
          lead_origin?: string
          max_budget?: number | null
          min_budget?: number | null
          neighborhood?: string | null
          next_follow_up_at?: string | null
          next_step?: string | null
          notes?: string | null
          phone?: string
          profession?: string | null
          property_type?: string
          purpose?: string
          restrictions?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_dispatch_claims: {
        Row: {
          claim_key: string
          created_at: string
          error_message: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          claim_key: string
          created_at?: string
          error_message?: string | null
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          claim_key?: string
          created_at?: string
          error_message?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          attendance_id: string
          created_at: string
          created_by: string | null
          email_type: string
          error_message: string | null
          id: string
          provider: string | null
          provider_message_id: string | null
          recipient_email: string | null
          sent_at: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          attendance_id: string
          created_at?: string
          created_by?: string | null
          email_type: string
          error_message?: string | null
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          sent_at?: string | null
          status: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          attendance_id?: string
          created_at?: string
          created_by?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      financeiro_lancamentos: {
        Row: {
          categoria: string
          corretor_id: string | null
          created_at: string
          data_competencia: string
          data_pagamento: string | null
          deleted_at: string | null
          descricao: string
          id: string
          imobiliaria: string
          observacoes: string | null
          origem: string | null
          origem_id: string | null
          origem_ref: string | null
          status: string
          tipo: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          categoria: string
          corretor_id?: string | null
          created_at?: string
          data_competencia: string
          data_pagamento?: string | null
          deleted_at?: string | null
          descricao: string
          id?: string
          imobiliaria: string
          observacoes?: string | null
          origem?: string | null
          origem_id?: string | null
          origem_ref?: string | null
          status?: string
          tipo: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          categoria?: string
          corretor_id?: string | null
          created_at?: string
          data_competencia?: string
          data_pagamento?: string | null
          deleted_at?: string | null
          descricao?: string
          id?: string
          imobiliaria?: string
          observacoes?: string | null
          origem?: string | null
          origem_id?: string | null
          origem_ref?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      financeiro_sheet_config: {
        Row: {
          created_at: string
          header_row: number
          id: string
          last_import_at: string | null
          last_import_count: number | null
          range: string
          sheet_name: string
          spreadsheet_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          header_row?: number
          id?: string
          last_import_at?: string | null
          last_import_count?: number | null
          range?: string
          sheet_name?: string
          spreadsheet_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          header_row?: number
          id?: string
          last_import_at?: string | null
          last_import_count?: number | null
          range?: string
          sheet_name?: string
          spreadsheet_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      financeiro_sync_log: {
        Row: {
          config_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          errors: Json
          id: string
          inserted: number
          ok: boolean
          ran_at: string
          skipped: number
          soft_deleted: number
          triggered_by: string
          updated: number
        }
        Insert: {
          config_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          errors?: Json
          id?: string
          inserted?: number
          ok?: boolean
          ran_at?: string
          skipped?: number
          soft_deleted?: number
          triggered_by?: string
          updated?: number
        }
        Update: {
          config_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          errors?: Json
          id?: string
          inserted?: number
          ok?: boolean
          ran_at?: string
          skipped?: number
          soft_deleted?: number
          triggered_by?: string
          updated?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_sync_log_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "financeiro_sheet_config"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_connections: {
        Row: {
          access_token: string
          calendar_id: string
          created_at: string
          expires_at: string
          google_email: string
          last_error: string | null
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          calendar_id?: string
          created_at?: string
          expires_at: string
          google_email: string
          last_error?: string | null
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          calendar_id?: string
          created_at?: string
          expires_at?: string
          google_email?: string
          last_error?: string | null
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      internal_documents: {
        Row: {
          category: string
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          title: string
          updated_at: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          canal: string
          created_at: string
          data_fim: string
          data_inicio: string
          diagnostico: string | null
          id: string
          imobiliaria: string
          investimento: number
          leads_esperados: number | null
          nome: string
          objetivo: string
          observacoes: string | null
          referencia_url: string | null
          responsavel: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          canal: string
          created_at?: string
          data_fim: string
          data_inicio: string
          diagnostico?: string | null
          id?: string
          imobiliaria: string
          investimento?: number
          leads_esperados?: number | null
          nome: string
          objetivo: string
          observacoes?: string | null
          referencia_url?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          canal?: string
          created_at?: string
          data_fim?: string
          data_inicio?: string
          diagnostico?: string | null
          id?: string
          imobiliaria?: string
          investimento?: number
          leads_esperados?: number | null
          nome?: string
          objetivo?: string
          observacoes?: string | null
          referencia_url?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      marketing_daily_metrics: {
        Row: {
          accesses: number
          campaign_id: string
          clicks: number
          created_at: string
          data: string
          id: string
          investimento: number
          leads: number
          updated_at: string
          user_id: string
          views: number
        }
        Insert: {
          accesses?: number
          campaign_id: string
          clicks?: number
          created_at?: string
          data: string
          id?: string
          investimento?: number
          leads?: number
          updated_at?: string
          user_id: string
          views?: number
        }
        Update: {
          accesses?: number
          campaign_id?: string
          clicks?: number
          created_at?: string
          data?: string
          id?: string
          investimento?: number
          leads?: number
          updated_at?: string
          user_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_daily_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          assignment_id: string | null
          category: string
          created_at: string
          dedup_key: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          imobiliaria: string | null
          lida: boolean
          link: string | null
          mensagem: string | null
          metadata: Json
          read_at: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          assignment_id?: string | null
          category?: string
          created_at?: string
          dedup_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          imobiliaria?: string | null
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          metadata?: Json
          read_at?: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          assignment_id?: string | null
          category?: string
          created_at?: string
          dedup_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          imobiliaria?: string | null
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          metadata?: Json
          read_at?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "attendance_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cargo: string | null
          created_at: string
          email: string
          id: string
          iniciais: string | null
          is_internal: boolean
          nome: string
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          email: string
          id: string
          iniciais?: string | null
          is_internal?: boolean
          nome: string
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          created_at?: string
          email?: string
          id?: string
          iniciais?: string | null
          is_internal?: boolean
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      real_estate_sales: {
        Row: {
          area_m2: number | null
          bathrooms: number | null
          bedrooms: number | null
          buyer_address: string | null
          buyer_document: string | null
          buyer_email: string | null
          buyer_name: string
          buyer_observations: string | null
          buyer_phone: string | null
          commission_percentage: number | null
          commission_value: number | null
          contract_file_name: string | null
          contract_file_path: string | null
          created_at: string
          document_status: string
          id: string
          imobiliaria: string
          notes: string | null
          payment_details: string | null
          payment_method: string | null
          previous_asking_price: number | null
          property_address: string
          property_city_state: string | null
          property_id: string | null
          property_name: string
          property_neighborhood: string | null
          property_type: string
          responsible_agent: string | null
          sale_date: string
          sale_status: string
          sale_value: number
          supporting_document_file_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          area_m2?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          buyer_address?: string | null
          buyer_document?: string | null
          buyer_email?: string | null
          buyer_name: string
          buyer_observations?: string | null
          buyer_phone?: string | null
          commission_percentage?: number | null
          commission_value?: number | null
          contract_file_name?: string | null
          contract_file_path?: string | null
          created_at?: string
          document_status?: string
          id?: string
          imobiliaria?: string
          notes?: string | null
          payment_details?: string | null
          payment_method?: string | null
          previous_asking_price?: number | null
          property_address: string
          property_city_state?: string | null
          property_id?: string | null
          property_name: string
          property_neighborhood?: string | null
          property_type?: string
          responsible_agent?: string | null
          sale_date: string
          sale_status?: string
          sale_value: number
          supporting_document_file_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          area_m2?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          buyer_address?: string | null
          buyer_document?: string | null
          buyer_email?: string | null
          buyer_name?: string
          buyer_observations?: string | null
          buyer_phone?: string | null
          commission_percentage?: number | null
          commission_value?: number | null
          contract_file_name?: string | null
          contract_file_path?: string | null
          created_at?: string
          document_status?: string
          id?: string
          imobiliaria?: string
          notes?: string | null
          payment_details?: string | null
          payment_method?: string | null
          previous_asking_price?: number | null
          property_address?: string
          property_city_state?: string | null
          property_id?: string | null
          property_name?: string
          property_neighborhood?: string | null
          property_type?: string
          responsible_agent?: string | null
          sale_date?: string
          sale_status?: string
          sale_value?: number
          supporting_document_file_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rental_contract_documents: {
        Row: {
          category: string
          contract_id: string
          created_at: string
          drive_file_id: string | null
          drive_last_error: string | null
          drive_last_synced_at: string | null
          drive_mime_type: string | null
          drive_sync_status: string
          drive_web_view_url: string | null
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          updated_by: string | null
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          contract_id: string
          created_at?: string
          drive_file_id?: string | null
          drive_last_error?: string | null
          drive_last_synced_at?: string | null
          drive_mime_type?: string | null
          drive_sync_status?: string
          drive_web_view_url?: string | null
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          contract_id?: string
          created_at?: string
          drive_file_id?: string | null
          drive_last_error?: string | null
          drive_last_synced_at?: string | null
          drive_mime_type?: string | null
          drive_sync_status?: string
          drive_web_view_url?: string | null
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_contract_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rental_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_contract_guarantors: {
        Row: {
          contract_id: string
          created_at: string
          guarantor_id: string | null
          id: string
          is_primary: boolean
          position: number
          seguro_apolice: string | null
          seguro_seguradora: string | null
          seguro_valor_mensal: number | null
          tipo: Database["public"]["Enums"]["rental_guarantee_type"]
          updated_at: string
          valor_caucao: number | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          guarantor_id?: string | null
          id?: string
          is_primary?: boolean
          position?: number
          seguro_apolice?: string | null
          seguro_seguradora?: string | null
          seguro_valor_mensal?: number | null
          tipo: Database["public"]["Enums"]["rental_guarantee_type"]
          updated_at?: string
          valor_caucao?: number | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          guarantor_id?: string | null
          id?: string
          is_primary?: boolean
          position?: number
          seguro_apolice?: string | null
          seguro_seguradora?: string | null
          seguro_valor_mensal?: number | null
          tipo?: Database["public"]["Enums"]["rental_guarantee_type"]
          updated_at?: string
          valor_caucao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_contract_guarantors_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rental_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_contract_guarantors_guarantor_id_fkey"
            columns: ["guarantor_id"]
            isOneToOne: false
            referencedRelation: "rental_guarantors"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_contract_tenants: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          is_primary: boolean
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_contract_tenants_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rental_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_contract_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "rental_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_contracts: {
        Row: {
          brand: Database["public"]["Enums"]["rental_brand"]
          comissao_mensal: number | null
          created_at: string
          created_by: string
          data_encerramento: string | null
          data_fim: string
          data_inicio: string
          dia_vencimento: number
          garantia_tipo: Database["public"]["Enums"]["rental_guarantee_type"]
          guarantor_id: string | null
          id: string
          observacoes: string | null
          payment_status: Database["public"]["Enums"]["rental_payment_status"]
          property_id: string
          proximo_vencimento: string | null
          seguro_apolice: string | null
          seguro_seguradora: string | null
          seguro_valor_mensal: number | null
          status: Database["public"]["Enums"]["rental_contract_status"]
          tenant_id: string
          updated_at: string
          valor_caucao: number | null
          valor_mensal: number
        }
        Insert: {
          brand?: Database["public"]["Enums"]["rental_brand"]
          comissao_mensal?: number | null
          created_at?: string
          created_by?: string
          data_encerramento?: string | null
          data_fim: string
          data_inicio: string
          dia_vencimento?: number
          garantia_tipo?: Database["public"]["Enums"]["rental_guarantee_type"]
          guarantor_id?: string | null
          id?: string
          observacoes?: string | null
          payment_status?: Database["public"]["Enums"]["rental_payment_status"]
          property_id: string
          proximo_vencimento?: string | null
          seguro_apolice?: string | null
          seguro_seguradora?: string | null
          seguro_valor_mensal?: number | null
          status?: Database["public"]["Enums"]["rental_contract_status"]
          tenant_id: string
          updated_at?: string
          valor_caucao?: number | null
          valor_mensal: number
        }
        Update: {
          brand?: Database["public"]["Enums"]["rental_brand"]
          comissao_mensal?: number | null
          created_at?: string
          created_by?: string
          data_encerramento?: string | null
          data_fim?: string
          data_inicio?: string
          dia_vencimento?: number
          garantia_tipo?: Database["public"]["Enums"]["rental_guarantee_type"]
          guarantor_id?: string | null
          id?: string
          observacoes?: string | null
          payment_status?: Database["public"]["Enums"]["rental_payment_status"]
          property_id?: string
          proximo_vencimento?: string | null
          seguro_apolice?: string | null
          seguro_seguradora?: string | null
          seguro_valor_mensal?: number | null
          status?: Database["public"]["Enums"]["rental_contract_status"]
          tenant_id?: string
          updated_at?: string
          valor_caucao?: number | null
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_contracts_guarantor_id_fkey"
            columns: ["guarantor_id"]
            isOneToOne: false
            referencedRelation: "rental_guarantors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_contracts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "rental_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "rental_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_drive_audit_log: {
        Row: {
          action: string
          contract_id: string | null
          created_at: string
          destination: string | null
          document_id: string | null
          error: string | null
          id: string
          result: string
          user_id: string | null
        }
        Insert: {
          action: string
          contract_id?: string | null
          created_at?: string
          destination?: string | null
          document_id?: string | null
          error?: string | null
          id?: string
          result: string
          user_id?: string | null
        }
        Update: {
          action?: string
          contract_id?: string | null
          created_at?: string
          destination?: string | null
          document_id?: string | null
          error?: string | null
          id?: string
          result?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_drive_audit_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rental_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_drive_audit_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rental_contract_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_drive_folders: {
        Row: {
          contract_id: string
          created_at: string
          folder_id: string
          folder_name: string
          folder_url: string
          google_email: string | null
          last_error: string | null
          last_synced_at: string | null
          owner_user_id: string | null
          sync_enabled: boolean
          sync_status: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          folder_id: string
          folder_name: string
          folder_url: string
          google_email?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          owner_user_id?: string | null
          sync_enabled?: boolean
          sync_status?: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          folder_id?: string
          folder_name?: string
          folder_url?: string
          google_email?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          owner_user_id?: string | null
          sync_enabled?: boolean
          sync_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_drive_folders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "rental_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_guarantors: {
        Row: {
          cpf_cnpj: string | null
          created_at: string
          created_by: string
          email: string | null
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          profissao: string | null
          telefone: string | null
          updated_at: string
          vinculo: string | null
        }
        Insert: {
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          profissao?: string | null
          telefone?: string | null
          updated_at?: string
          vinculo?: string | null
        }
        Update: {
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          profissao?: string | null
          telefone?: string | null
          updated_at?: string
          vinculo?: string | null
        }
        Relationships: []
      }
      rental_properties: {
        Row: {
          apelido: string
          area_m2: number | null
          bairro: string | null
          banheiros: number | null
          brand: Database["public"]["Enums"]["rental_brand"]
          cep: string | null
          cidade: string | null
          complemento: string | null
          created_at: string
          created_by: string
          id: string
          logradouro: string
          numero: string | null
          observacoes: string | null
          proprietario_cpf: string | null
          proprietario_email: string | null
          proprietario_nome: string | null
          proprietario_telefone: string | null
          quartos: number | null
          status: Database["public"]["Enums"]["rental_property_status"]
          tipo: Database["public"]["Enums"]["rental_property_type"]
          uf: string | null
          updated_at: string
          vagas: number | null
          valor_sugerido: number | null
        }
        Insert: {
          apelido: string
          area_m2?: number | null
          bairro?: string | null
          banheiros?: number | null
          brand?: Database["public"]["Enums"]["rental_brand"]
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          created_by?: string
          id?: string
          logradouro?: string
          numero?: string | null
          observacoes?: string | null
          proprietario_cpf?: string | null
          proprietario_email?: string | null
          proprietario_nome?: string | null
          proprietario_telefone?: string | null
          quartos?: number | null
          status?: Database["public"]["Enums"]["rental_property_status"]
          tipo?: Database["public"]["Enums"]["rental_property_type"]
          uf?: string | null
          updated_at?: string
          vagas?: number | null
          valor_sugerido?: number | null
        }
        Update: {
          apelido?: string
          area_m2?: number | null
          bairro?: string | null
          banheiros?: number | null
          brand?: Database["public"]["Enums"]["rental_brand"]
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          created_by?: string
          id?: string
          logradouro?: string
          numero?: string | null
          observacoes?: string | null
          proprietario_cpf?: string | null
          proprietario_email?: string | null
          proprietario_nome?: string | null
          proprietario_telefone?: string | null
          quartos?: number | null
          status?: Database["public"]["Enums"]["rental_property_status"]
          tipo?: Database["public"]["Enums"]["rental_property_type"]
          uf?: string | null
          updated_at?: string
          vagas?: number | null
          valor_sugerido?: number | null
        }
        Relationships: []
      }
      rental_tenants: {
        Row: {
          cpf_cnpj: string | null
          created_at: string
          created_by: string
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          profissao: string | null
          renda_aproximada: number | null
          telefone: string
          updated_at: string
        }
        Insert: {
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          profissao?: string | null
          renda_aproximada?: number | null
          telefone?: string
          updated_at?: string
        }
        Update: {
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          profissao?: string | null
          renda_aproximada?: number | null
          telefone?: string
          updated_at?: string
        }
        Relationships: []
      }
      sale_commission_installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          notified_at: string | null
          paid: boolean
          paid_at: string | null
          sale_id: string
          sequence: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          notified_at?: string | null
          paid?: boolean
          paid_at?: string | null
          sale_id: string
          sequence?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          notified_at?: string | null
          paid?: boolean
          paid_at?: string | null
          sale_id?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_commission_installments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "real_estate_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_commission_plan: {
        Row: {
          created_at: string
          data_pagamento: string | null
          metodo: string
          observacoes: string | null
          parcelado: boolean
          sale_id: string
          timing: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_pagamento?: string | null
          metodo?: string
          observacoes?: string | null
          parcelado?: boolean
          sale_id: string
          timing?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_pagamento?: string | null
          metodo?: string
          observacoes?: string | null
          parcelado?: boolean
          sale_id?: string
          timing?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_commission_plan_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: true
            referencedRelation: "real_estate_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_documents: {
        Row: {
          category: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          sale_id: string
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          sale_id: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          sale_id?: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "real_estate_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          kind: string
          notified_at: string | null
          paid: boolean
          paid_at: string | null
          sale_id: string
          sequence: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          kind: string
          notified_at?: string | null
          paid?: boolean
          paid_at?: string | null
          sale_id: string
          sequence?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          kind?: string
          notified_at?: string | null
          paid?: boolean
          paid_at?: string | null
          sale_id?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "real_estate_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      satisfaction_responses: {
        Row: {
          comentario: string | null
          created_at: string
          id: string
          rating: number
          survey_id: string
        }
        Insert: {
          comentario?: string | null
          created_at?: string
          id?: string
          rating: number
          survey_id: string
        }
        Update: {
          comentario?: string | null
          created_at?: string
          id?: string
          rating?: number
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "satisfaction_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: true
            referencedRelation: "satisfaction_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      satisfaction_surveys: {
        Row: {
          client_contato: string | null
          client_id: string | null
          client_nome: string
          contexto: string | null
          corretor_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["satisfaction_survey_status"]
          token: string
          updated_at: string
        }
        Insert: {
          client_contato?: string | null
          client_id?: string | null
          client_nome: string
          contexto?: string | null
          corretor_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["satisfaction_survey_status"]
          token: string
          updated_at?: string
        }
        Update: {
          client_contato?: string | null
          client_id?: string | null
          client_nome?: string
          contexto?: string | null
          corretor_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["satisfaction_survey_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "satisfaction_surveys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satisfaction_surveys_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_agencies: {
        Row: {
          agency: string
          created_at: string
          source: string
          user_id: string
        }
        Insert: {
          agency: string
          created_at?: string
          source?: string
          user_id: string
        }
        Update: {
          agency?: string
          created_at?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _try_uuid: { Args: { _txt: string }; Returns: string }
      agenciamento_bonus_notify: {
        Args: {
          _bonus: Database["public"]["Tables"]["agenciamento_bonuses"]["Row"]
        }
        Returns: undefined
      }
      agenciamento_bonus_recalc: {
        Args: { _corretor_id: string }
        Returns: undefined
      }
      agenda_can_access: { Args: { _event_id: string }; Returns: boolean }
      agenda_can_edit: { Args: { _event_id: string }; Returns: boolean }
      agenda_is_participant: { Args: { _event_id: string }; Returns: boolean }
      attendance_add_note: {
        Args: { _attendance_id: string; _texto: string }
        Returns: string
      }
      attendance_can_access: {
        Args: { _attendance_id: string }
        Returns: boolean
      }
      current_user_has_notification_agency_access: {
        Args: { _agency: string }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_corretores_response_metrics: {
        Args: { _end?: string; _imobiliaria?: string; _start?: string }
        Returns: {
          avg_seconds: number
          broker_id: string
          broker_nome: string
          completed_count: number
          fastest_seconds: number
          median_seconds: number
          pending_count: number
          slowest_seconds: number
        }[]
      }
      get_my_notification_summary: { Args: never; Returns: Json }
      get_notification_attendance_statuses: {
        Args: { _notification_ids: string[] }
        Returns: {
          assigned_at: string
          broker_nome: string
          first_opened_at: string
          notification_id: string
          response_time_seconds: number
          status: string
        }[]
      }
      get_notification_management_summary: {
        Args: { _end: string; _imobiliaria?: string; _start: string }
        Returns: {
          assigned_count: number
          avg_first_open_seconds: number
          median_first_open_seconds: number
          opened_count: number
          pending_open_count: number
        }[]
      }
      get_satisfaction_survey_by_token: {
        Args: { _token: string }
        Returns: {
          contexto: string
          corretor_iniciais: string
          corretor_nome: string
          expired: boolean
          status: Database["public"]["Enums"]["satisfaction_survey_status"]
          survey_id: string
        }[]
      }
      has_notification_agency_access: {
        Args: { _agency: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_assignable_brokers: {
        Args: { _agency?: string }
        Returns: {
          agencies: string[]
          id: string
          nome: string
        }[]
      }
      list_corretores: {
        Args: never
        Returns: {
          cargo: string
          email: string
          id: string
          iniciais: string
          nome: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      list_my_notifications: {
        Args: {
          _before_created_at?: string
          _before_id?: string
          _category?: string
          _limit?: number
        }
        Returns: {
          actor_id: string
          category: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          imobiliaria: string
          lida: boolean
          link: string
          mensagem: string
          read_at: string
          tipo: string
          titulo: string
        }[]
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_attendance_first_opened: {
        Args: { _attendance_id: string }
        Returns: Json
      }
      mark_notification_read: { Args: { _id: string }; Returns: Json }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      submit_satisfaction_response: {
        Args: { _comentario: string; _rating: number; _token: string }
        Returns: Json
      }
    }
    Enums: {
      agenda_imobiliaria: "cordial" | "morar" | "ambas"
      agenda_participant_papel: "responsavel" | "participante" | "acompanhante"
      agenda_prioridade: "baixa" | "media" | "alta" | "urgente"
      agenda_reminder_tipo: "interno" | "email" | "whatsapp" | "google_calendar"
      agenda_status:
        | "agendado"
        | "confirmado"
        | "em_andamento"
        | "concluido"
        | "cancelado"
        | "reagendado"
      agenda_tipo:
        | "visita"
        | "fotos"
        | "video"
        | "assinatura"
        | "reuniao"
        | "retorno"
        | "vistoria"
        | "captacao"
        | "interno"
        | "outro"
      app_role: "admin" | "secretaria" | "corretor" | "financeiro"
      attendance_assignment_status:
        | "pending_open"
        | "opened"
        | "superseded"
        | "cancelled"
      pipeline_stage:
        | "primeiro_contato"
        | "apresentando_solucao"
        | "visita"
        | "proposta"
        | "fechamento"
        | "perdido"
        | "arquivado"
        | "em_espera"
      rental_brand: "cordial" | "morar" | "ambas"
      rental_contract_status:
        | "ativo"
        | "pendente_assinatura"
        | "vencido"
        | "encerrado"
        | "cancelado"
      rental_guarantee_type:
        | "sem_garantia"
        | "fiador"
        | "caucao"
        | "seguro_fianca"
      rental_payment_status:
        | "em_dia"
        | "vence_hoje"
        | "atrasado"
        | "pago"
        | "pendente"
      rental_property_status:
        | "disponivel"
        | "alugado"
        | "manutencao"
        | "reservado"
        | "inativo"
      rental_property_type:
        | "casa"
        | "apartamento"
        | "sala_comercial"
        | "terreno"
        | "kitnet"
        | "outro"
      satisfaction_survey_status: "pendente" | "respondida" | "expirada"
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
      agenda_imobiliaria: ["cordial", "morar", "ambas"],
      agenda_participant_papel: ["responsavel", "participante", "acompanhante"],
      agenda_prioridade: ["baixa", "media", "alta", "urgente"],
      agenda_reminder_tipo: ["interno", "email", "whatsapp", "google_calendar"],
      agenda_status: [
        "agendado",
        "confirmado",
        "em_andamento",
        "concluido",
        "cancelado",
        "reagendado",
      ],
      agenda_tipo: [
        "visita",
        "fotos",
        "video",
        "assinatura",
        "reuniao",
        "retorno",
        "vistoria",
        "captacao",
        "interno",
        "outro",
      ],
      app_role: ["admin", "secretaria", "corretor", "financeiro"],
      attendance_assignment_status: [
        "pending_open",
        "opened",
        "superseded",
        "cancelled",
      ],
      pipeline_stage: [
        "primeiro_contato",
        "apresentando_solucao",
        "visita",
        "proposta",
        "fechamento",
        "perdido",
        "arquivado",
        "em_espera",
      ],
      rental_brand: ["cordial", "morar", "ambas"],
      rental_contract_status: [
        "ativo",
        "pendente_assinatura",
        "vencido",
        "encerrado",
        "cancelado",
      ],
      rental_guarantee_type: [
        "sem_garantia",
        "fiador",
        "caucao",
        "seguro_fianca",
      ],
      rental_payment_status: [
        "em_dia",
        "vence_hoje",
        "atrasado",
        "pago",
        "pendente",
      ],
      rental_property_status: [
        "disponivel",
        "alugado",
        "manutencao",
        "reservado",
        "inativo",
      ],
      rental_property_type: [
        "casa",
        "apartamento",
        "sala_comercial",
        "terreno",
        "kitnet",
        "outro",
      ],
      satisfaction_survey_status: ["pendente", "respondida", "expirada"],
    },
  },
} as const
