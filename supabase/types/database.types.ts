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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_bindings: {
        Row: {
          agent_id: string
          binding_kind: string
          created_at: string
          execution_mode: string
          host_id: string | null
          id: string
          owner_id: string
          preferred_host_id: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          binding_kind: string
          created_at?: string
          execution_mode?: string
          host_id?: string | null
          id?: string
          owner_id: string
          preferred_host_id?: string | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          binding_kind?: string
          created_at?: string
          execution_mode?: string
          host_id?: string | null
          id?: string
          owner_id?: string
          preferred_host_id?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_bindings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_bindings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_bindings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "agent_hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_bindings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_bindings_preferred_host_id_fkey"
            columns: ["preferred_host_id"]
            isOneToOne: false
            referencedRelation: "agent_hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_host_providers: {
        Row: {
          binary_path: string | null
          capabilities: Json
          created_at: string
          health_check_passed_at: string | null
          host_id: string
          id: string
          last_checked_at: string | null
          provider: string
          status: string
          updated_at: string
          version: string | null
        }
        Insert: {
          binary_path?: string | null
          capabilities?: Json
          created_at?: string
          health_check_passed_at?: string | null
          host_id: string
          id?: string
          last_checked_at?: string | null
          provider: string
          status?: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          binary_path?: string | null
          capabilities?: Json
          created_at?: string
          health_check_passed_at?: string | null
          host_id?: string
          id?: string
          last_checked_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_host_providers_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "agent_hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_host_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          host_id: string | null
          id: string
          label: string | null
          last_used_at: string | null
          owner_id: string
          revoked_at: string | null
          scope: Json
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          host_id?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          owner_id: string
          revoked_at?: string | null
          scope?: Json
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          host_id?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          owner_id?: string
          revoked_at?: string | null
          scope?: Json
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_host_tokens_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "agent_hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_host_tokens_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_hosts: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          display_name: string | null
          host_type: string
          id: string
          last_seen_at: string | null
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          display_name?: string | null
          host_type: string
          id?: string
          last_seen_at?: string | null
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          display_name?: string | null
          host_type?: string
          id?: string
          last_seen_at?: string | null
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_hosts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runtimes: {
        Row: {
          binary_path: string | null
          capabilities: Json
          created_at: string
          display_name: string
          host_id: string | null
          id: string
          last_seen_at: string | null
          metadata: Json
          owner_id: string
          runtime_status: string
          runtime_type: string
          status_reason: string | null
          updated_at: string
          version: string | null
        }
        Insert: {
          binary_path?: string | null
          capabilities?: Json
          created_at?: string
          display_name: string
          host_id?: string | null
          id?: string
          last_seen_at?: string | null
          metadata?: Json
          owner_id: string
          runtime_status?: string
          runtime_type: string
          status_reason?: string | null
          updated_at?: string
          version?: string | null
        }
        Update: {
          binary_path?: string | null
          capabilities?: Json
          created_at?: string
          display_name?: string
          host_id?: string | null
          id?: string
          last_seen_at?: string | null
          metadata?: Json
          owner_id?: string
          runtime_status?: string
          runtime_type?: string
          status_reason?: string | null
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runtimes_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "agent_hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runtimes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          account_label: string | null
          api_key_hash: string
          avatar_url: string | null
          claimed_at: string | null
          created_at: string
          description: string | null
          execution_mode: string
          id: string
          instructions: string | null
          is_default: boolean
          last_seen_at: string | null
          name: string
          owner_id: string | null
          registration_ip: string | null
          runtime_id: string | null
          source: string
          status: string
          suggested_prompts: Json
          updated_at: string
          visibility_scope: string
          ws_connected: boolean
        }
        Insert: {
          account_label?: string | null
          api_key_hash: string
          avatar_url?: string | null
          claimed_at?: string | null
          created_at?: string
          description?: string | null
          execution_mode?: string
          id?: string
          instructions?: string | null
          is_default?: boolean
          last_seen_at?: string | null
          name: string
          owner_id?: string | null
          registration_ip?: string | null
          runtime_id?: string | null
          source?: string
          status?: string
          suggested_prompts?: Json
          updated_at?: string
          visibility_scope?: string
          ws_connected?: boolean
        }
        Update: {
          account_label?: string | null
          api_key_hash?: string
          avatar_url?: string | null
          claimed_at?: string | null
          created_at?: string
          description?: string | null
          execution_mode?: string
          id?: string
          instructions?: string | null
          is_default?: boolean
          last_seen_at?: string | null
          name?: string
          owner_id?: string | null
          registration_ip?: string | null
          runtime_id?: string | null
          source?: string
          status?: string
          suggested_prompts?: Json
          updated_at?: string
          visibility_scope?: string
          ws_connected?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_runtime_id_fkey"
            columns: ["runtime_id"]
            isOneToOne: false
            referencedRelation: "agent_runtimes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          participant_id: string
          participant_kind: string
          role: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          participant_id: string
          participant_kind: string
          role?: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          participant_id?: string
          participant_kind?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          kind: string
          last_active_at: string
          message_count: number
          parent_conversation_id: string | null
          qrcode_id: string
          session_token: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          last_active_at?: string
          message_count?: number
          parent_conversation_id?: string | null
          qrcode_id: string
          session_token: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          last_active_at?: string
          message_count?: number
          parent_conversation_id?: string | null
          qrcode_id?: string
          session_token?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_parent_conversation_id_fkey"
            columns: ["parent_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_qrcode_id_fkey"
            columns: ["qrcode_id"]
            isOneToOne: false
            referencedRelation: "qrcodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_qrcode_id_fkey"
            columns: ["qrcode_id"]
            isOneToOne: false
            referencedRelation: "qrcodes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      encryption_keys: {
        Row: {
          algorithm: string
          conversation_id: string
          created_at: string
          kek_version: number
          key_data_encrypted: string
          key_id: string
          rotated_at: string | null
          status: string
        }
        Insert: {
          algorithm?: string
          conversation_id: string
          created_at?: string
          kek_version?: number
          key_data_encrypted: string
          key_id?: string
          rotated_at?: string | null
          status?: string
        }
        Update: {
          algorithm?: string
          conversation_id?: string
          created_at?: string
          kek_version?: number
          key_data_encrypted?: string
          key_id?: string
          rotated_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "encryption_keys_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_deliveries: {
        Row: {
          acked_at: string | null
          attempt_no: number
          created_at: string
          dispatched_at: string | null
          fail_reason: string | null
          id: string
          message_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          acked_at?: string | null
          attempt_no?: number
          created_at?: string
          dispatched_at?: string | null
          fail_reason?: string | null
          id?: string
          message_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          acked_at?: string | null
          attempt_no?: number
          created_at?: string
          dispatched_at?: string | null
          fail_reason?: string | null
          id?: string
          message_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_deliveries_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content_encrypted: string
          conversation_id: string
          encryption_key_id: string
          encryption_meta: Json
          id: string
          idempotency_key: string
          message_id: string
          reply_to_message_id: string | null
          role: string
          sent_at: string
          thread_id: string | null
        }
        Insert: {
          content_encrypted: string
          conversation_id: string
          encryption_key_id: string
          encryption_meta?: Json
          id?: string
          idempotency_key: string
          message_id: string
          reply_to_message_id?: string | null
          role: string
          sent_at?: string
          thread_id?: string | null
        }
        Update: {
          content_encrypted?: string
          conversation_id?: string
          encryption_key_id?: string
          encryption_meta?: Json
          id?: string
          idempotency_key?: string
          message_id?: string
          reply_to_message_id?: string | null
          role?: string
          sent_at?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_encryption_key_id_fkey"
            columns: ["encryption_key_id"]
            isOneToOne: false
            referencedRelation: "encryption_keys"
            referencedColumns: ["key_id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_agent_conversation_keys: {
        Row: {
          algorithm: string
          conversation_id: string
          created_at: string
          kek_version: number
          key_data_encrypted: string
          key_id: string
          rotated_at: string | null
          status: string
        }
        Insert: {
          algorithm?: string
          conversation_id: string
          created_at?: string
          kek_version?: number
          key_data_encrypted: string
          key_id?: string
          rotated_at?: string | null
          status?: string
        }
        Update: {
          algorithm?: string
          conversation_id?: string
          created_at?: string
          kek_version?: number
          key_data_encrypted?: string
          key_id?: string
          rotated_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_agent_conversation_keys_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "owner_agent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_conversation_keys_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "owner_agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_agent_messages: {
        Row: {
          agent_id: string
          content_encrypted: string
          content_type: string
          conversation_id: string
          created_at: string
          encryption_meta: Json
          id: string
          owner_id: string
          run_id: string | null
          sender_type: string
          status: string
        }
        Insert: {
          agent_id: string
          content_encrypted: string
          content_type?: string
          conversation_id: string
          created_at?: string
          encryption_meta: Json
          id?: string
          owner_id: string
          run_id?: string | null
          sender_type: string
          status?: string
        }
        Update: {
          agent_id?: string
          content_encrypted?: string
          content_type?: string
          conversation_id?: string
          created_at?: string
          encryption_meta?: Json
          id?: string
          owner_id?: string
          run_id?: string | null
          sender_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_agent_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "owner_agent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "owner_agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_messages_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_messages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "owner_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_agent_run_events: {
        Row: {
          content_encrypted: string | null
          created_at: string
          encryption_meta: Json | null
          id: string
          metadata: Json
          owner_id: string
          run_id: string
          seq: number
          type: string
        }
        Insert: {
          content_encrypted?: string | null
          created_at?: string
          encryption_meta?: Json | null
          id?: string
          metadata?: Json
          owner_id: string
          run_id: string
          seq: number
          type: string
        }
        Update: {
          content_encrypted?: string | null
          created_at?: string
          encryption_meta?: Json | null
          id?: string
          metadata?: Json
          owner_id?: string
          run_id?: string
          seq?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_agent_run_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "owner_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_agent_runs: {
        Row: {
          actual_model: string | null
          agent_id: string
          completed_at: string | null
          conversation_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          host_id: string | null
          id: string
          owner_id: string
          provider: string
          provider_session_id: string | null
          provider_work_dir: string | null
          requested_model: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          actual_model?: string | null
          agent_id: string
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          host_id?: string | null
          id?: string
          owner_id: string
          provider: string
          provider_session_id?: string | null
          provider_work_dir?: string | null
          requested_model?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          actual_model?: string | null
          agent_id?: string
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          host_id?: string | null
          id?: string
          owner_id?: string
          provider?: string
          provider_session_id?: string | null
          provider_work_dir?: string | null
          requested_model?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "owner_agent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "owner_agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_runs_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "agent_hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_runs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_agent_sessions: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          last_active_at: string | null
          owner_id: string
          provider_session_id: string | null
          provider_work_dir: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          last_active_at?: string | null
          owner_id: string
          provider_session_id?: string | null
          provider_work_dir?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          last_active_at?: string | null
          owner_id?: string
          provider_session_id?: string | null
          provider_work_dir?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_agent_conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_conversations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      owners: {
        Row: {
          created_at: string
          display_name: string
          email: string
          id: string
          locale: string
          plan: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email: string
          id?: string
          locale?: string
          plan?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          locale?: string
          plan?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qrcodes: {
        Row: {
          agent_id: string
          config_version: number
          created_at: string
          id: string
          locale: string
          name: string | null
          profile: Json
          security_policy_id: string
          slug: string
          status: string
          style_config: Json
          suggested_questions: Json | null
          system_prompt: string | null
          updated_at: string
          visitor_identity: Json | null
        }
        Insert: {
          agent_id: string
          config_version?: number
          created_at?: string
          id?: string
          locale?: string
          name?: string | null
          profile?: Json
          security_policy_id?: string
          slug: string
          status?: string
          style_config?: Json
          suggested_questions?: Json | null
          system_prompt?: string | null
          updated_at?: string
          visitor_identity?: Json | null
        }
        Update: {
          agent_id?: string
          config_version?: number
          created_at?: string
          id?: string
          locale?: string
          name?: string | null
          profile?: Json
          security_policy_id?: string
          slug?: string
          status?: string
          style_config?: Json
          suggested_questions?: Json | null
          system_prompt?: string | null
          updated_at?: string
          visitor_identity?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "qrcodes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qrcodes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          bound_at: string | null
          created_at: string
          expires_at: string
          id: string
          last_active_at: string
          session_token: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bound_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          last_active_at?: string
          session_token: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bound_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          last_active_at?: string
          session_token?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_2026_01: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_2026_02: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_2026_03: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_2026_04: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_2026_05: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_2026_06: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_2026_07: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_2026_08: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_2026_09: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_2026_10: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_2026_11: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_2026_12: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      usage_logs_default: {
        Row: {
          agent_id: string
          counted_at: string
          created_at: string
          event_meta: Json | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          agent_id: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          agent_id?: string
          counted_at?: string
          created_at?: string
          event_meta?: Json | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      visitor_sessions: {
        Row: {
          created_at: string
          id: string
          ip_hash: string | null
          last_active_at: string
          qrcode_id: string
          session_token: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          last_active_at?: string
          qrcode_id: string
          session_token: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          last_active_at?: string
          qrcode_id?: string
          session_token?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitor_sessions_qrcode_id_fkey"
            columns: ["qrcode_id"]
            isOneToOne: false
            referencedRelation: "qrcodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_sessions_qrcode_id_fkey"
            columns: ["qrcode_id"]
            isOneToOne: false
            referencedRelation: "qrcodes_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      agents_public: {
        Row: {
          created_at: string | null
          id: string | null
          name: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          status?: string | null
        }
        Relationships: []
      }
      owner_agent_conversations: {
        Row: {
          agent_id: string | null
          created_at: string | null
          id: string | null
          last_active_at: string | null
          owner_id: string | null
          provider_session_id: string | null
          provider_work_dir: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          id?: string | null
          last_active_at?: string | null
          owner_id?: string | null
          provider_session_id?: string | null
          provider_work_dir?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          id?: string | null
          last_active_at?: string | null
          owner_id?: string | null
          provider_session_id?: string | null
          provider_work_dir?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_agent_conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_agent_conversations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      qrcodes_public: {
        Row: {
          agent_id: string | null
          id: string | null
          slug: string | null
          status: string | null
        }
        Insert: {
          agent_id?: string | null
          id?: string | null
          slug?: string | null
          status?: string | null
        }
        Update: {
          agent_id?: string | null
          id?: string | null
          slug?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qrcodes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qrcodes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      cleanup_expired_sessions: { Args: never; Returns: number }
      cleanup_unclaimed_agents: { Args: never; Returns: number }
      create_conversation_if_expired: {
        Args: {
          p_qrcode_id: string
          p_session_token: string
          p_timeout_hours?: number
        }
        Returns: string
      }
      create_usage_log_partition: {
        Args: { p_month: number; p_year: number }
        Returns: undefined
      }
      delete_conversation_with_keys: {
        Args: { p_conversation_id: string; p_owner_user_id: string }
        Returns: undefined
      }
      jsonb_string_array_max_length: {
        Args: { max_length: number; value: Json }
        Returns: boolean
      }
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
