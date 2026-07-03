// Auto-generate with: npx supabase gen types typescript --project-id qkuhvlrdidhumyyxokil > types/database.ts
// Manually maintained to match Django models in backend/api/models.py

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: number
          username: string
          email: string
          first_name: string
          last_name: string
          role: 'admin' | 'line' | 'frontdesk'
          phone_number: string
          employee_id: string | null
          is_active_fueler: boolean
          is_active: boolean
          is_staff: boolean
          is_superuser: boolean
          password: string
          date_joined: string
          last_login: string | null
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: number
          username: string
          email?: string
          first_name?: string
          last_name?: string
          role?: 'admin' | 'line' | 'frontdesk'
          phone_number?: string
          employee_id?: string | null
          is_active_fueler?: boolean
          is_active?: boolean
          is_staff?: boolean
          is_superuser?: boolean
          password: string
          date_joined?: string
          last_login?: string | null
        }
        Update: Partial<Database['public']['Tables']['users']['Insert']>
        Relationships: []
      }
      aircraft: {
        Row: {
          tail_number: string
          aircraft_type_icao: string
          aircraft_type_display: string
          airline_icao: string
          fleet_id: string
          created_at: string
          modified_at: string
        }
        Insert: {
          tail_number: string
          aircraft_type_icao?: string
          aircraft_type_display?: string
          airline_icao?: string
          fleet_id?: string
        }
        Update: Partial<Database['public']['Tables']['aircraft']['Insert']>
        Relationships: []
      }
      fuel_tank: {
        Row: {
          tank_id: string
          tank_name: string
          fuel_type: 'jet_a' | 'avgas'
          capacity_gallons: string
          min_level_inches: string
          max_level_inches: string
          usable_min_inches: string
          usable_max_inches: string
          created_at: string
          modified_at: string
        }
        Insert: {
          tank_id: string
          tank_name: string
          fuel_type: 'jet_a' | 'avgas'
          capacity_gallons: number | string
          min_level_inches: number | string
          max_level_inches: number | string
          usable_min_inches: number | string
          usable_max_inches: number | string
        }
        Update: Partial<Database['public']['Tables']['fuel_tank']['Insert']>
        Relationships: []
      }
      tank_level_readings: {
        Row: {
          id: number
          tank_id: string
          level: string
          recorded_at: string
          created_at: string
        }
        Insert: {
          id?: number
          tank_id: string
          level: number | string
          recorded_at: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['tank_level_readings']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'tank_level_readings_tank_id_fkey'
            columns: ['tank_id']
            referencedRelation: 'fuel_tank'
            referencedColumns: ['tank_id']
          }
        ]
      }
      parking_location: {
        Row: {
          id: number
          location_code: string | null
          description: string
          latitude: string | null
          longitude: string | null
          polygon: unknown | null
          airport: string
          terminal: string | null
          gate: string | null
          display_order: number
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: number
          location_code?: string | null
          description?: string
          latitude?: number | string | null
          longitude?: number | string | null
          polygon?: unknown | null
          airport?: string
          terminal?: string | null
          gate?: string | null
          display_order?: number
        }
        Update: Partial<Database['public']['Tables']['parking_location']['Insert']>
        Relationships: []
      }
      terminal_gate: {
        Row: {
          id: number
          terminal_id: string
          terminal_num: string
          gate_number: string
          location_id: string
          display_order: number
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: number
          terminal_id: string
          terminal_num: string
          gate_number: string
          location_id?: string
          display_order?: number
        }
        Update: Partial<Database['public']['Tables']['terminal_gate']['Insert']>
        Relationships: []
      }
      flight: {
        Row: {
          id: number
          aircraft_id: string
          call_sign: string | null
          arrival_time: string | null
          departure_time: string
          flight_status: 'scheduled' | 'arrived' | 'departed' | 'cancelled' | 'delayed' | 'planned'
          origin: string
          destination: string
          contact_name: string
          contact_notes: string
          services: string[]
          fuel_order_notes: string
          passenger_count: number | null
          notes: string
          location_id: number | null
          created_by_id: number
          created_by_source: 'qt' | 'front-desk' | 'line-department' | 'google-calendar'
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: number
          aircraft_id: string
          call_sign?: string | null
          arrival_time?: string | null
          departure_time: string
          flight_status?: 'scheduled' | 'arrived' | 'departed' | 'cancelled' | 'delayed' | 'planned'
          origin?: string
          destination?: string
          contact_name?: string
          contact_notes?: string
          services?: string[]
          fuel_order_notes?: string
          passenger_count?: number | null
          notes?: string
          location_id?: number | null
          created_by_id?: number
          created_by_source?: 'qt' | 'front-desk' | 'line-department' | 'google-calendar'
        }
        Update: Partial<Database['public']['Tables']['flight']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'flight_aircraft_id_fkey'
            columns: ['aircraft_id']
            referencedRelation: 'aircraft'
            referencedColumns: ['tail_number']
          },
          {
            foreignKeyName: 'flight_location_id_fkey'
            columns: ['location_id']
            referencedRelation: 'parking_location'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'flight_created_by_id_fkey'
            columns: ['created_by_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      fueler: {
        Row: {
          id: number
          user_id: number
          fueler_name: string
          handheld_name: string
          status: 'active' | 'inactive'
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: number
          user_id: number
          fueler_name: string
          handheld_name?: string
          status?: 'active' | 'inactive'
        }
        Update: Partial<Database['public']['Tables']['fueler']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'fueler_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      training: {
        Row: {
          id: number
          training_name: string
          description: string
          validity_period_days: number
          aircraft_type: string | null
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: number
          training_name: string
          description?: string
          validity_period_days: number
          aircraft_type?: string | null
        }
        Update: Partial<Database['public']['Tables']['training']['Insert']>
        Relationships: []
      }
      fueler_training: {
        Row: {
          id: number
          fueler_id: number
          training_id: number
          completed_date: string
          expiry_date: string
          certified_by_id: number | null
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: number
          fueler_id: number
          training_id: number
          completed_date: string
          expiry_date: string
          certified_by_id?: number | null
        }
        Update: Partial<Database['public']['Tables']['fueler_training']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'fueler_training_fueler_id_fkey'
            columns: ['fueler_id']
            referencedRelation: 'fueler'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fueler_training_training_id_fkey'
            columns: ['training_id']
            referencedRelation: 'training'
            referencedColumns: ['id']
          }
        ]
      }
      fueler_training_history: {
        Row: {
          id: number
          fueler_id: number
          training_id: number
          completed_date: string
          expiry_date: string
          certified_by_id: number | null
          notes: string
          created_at: string
        }
        Insert: {
          id?: number
          fueler_id: number
          training_id: number
          completed_date: string
          expiry_date: string
          certified_by_id?: number | null
          notes?: string
        }
        Update: Partial<Database['public']['Tables']['fueler_training_history']['Insert']>
        Relationships: []
      }
      assigned_training: {
        Row: {
          id: number
          fueler_id: number
          training_id: number
          status: 'assigned' | 'completed' | 'cancelled'
          assigned_by_id: number | null
          assigned_at: string
          due_date: string | null
          notes: string
          completed_at: string | null
        }
        Insert: {
          id?: number
          fueler_id: number
          training_id: number
          status?: 'assigned' | 'completed' | 'cancelled'
          assigned_by_id?: number | null
          due_date?: string | null
          notes?: string
          completed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['assigned_training']['Insert']>
        Relationships: []
      }
      fuel_transaction: {
        Row: {
          id: number
          flight_id: number | null
          ticket_number: string
          quantity_gallons: string
          quantity_lbs: string
          density: string
          progress: 'started' | 'in_progress' | 'completed'
          charge_flags: Record<string, unknown>
          assigned_at: string | null
          completed_at: string | null
          qt_dispatch_id: string | null
          qt_sync_status: 'pending' | 'synced' | 'failed'
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: number
          flight_id?: number | null
          ticket_number: string
          quantity_gallons: number | string
          quantity_lbs: number | string
          density: number | string
          progress?: 'started' | 'in_progress' | 'completed'
          charge_flags?: Record<string, unknown>
          assigned_at?: string | null
          completed_at?: string | null
          qt_dispatch_id?: string | null
          qt_sync_status?: 'pending' | 'synced' | 'failed'
        }
        Update: Partial<Database['public']['Tables']['fuel_transaction']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'fuel_transaction_flight_id_fkey'
            columns: ['flight_id']
            referencedRelation: 'flight'
            referencedColumns: ['id']
          }
        ]
      }
      fueler_assignment: {
        Row: {
          id: number
          transaction_id: number
          fueler_id: number
          assigned_at: string
        }
        Insert: {
          id?: number
          transaction_id: number
          fueler_id: number
        }
        Update: Partial<Database['public']['Tables']['fueler_assignment']['Insert']>
        Relationships: []
      }
      equipment: {
        Row: {
          id: number
          equipment_id: string
          equipment_name: string
          equipment_type: 'fuel_truck' | 'tug' | 'gpu' | 'air_start' | 'belt_loader' | 'stairs' | 'lavatory_service' | 'water_service' | 'golf_cart' | 'staff_vehicle' | 'other'
          manufacturer: string
          model: string
          serial_number: string
          status: 'available' | 'in_use' | 'maintenance' | 'out_of_service'
          location: string
          notes: string
          last_maintenance_date: string | null
          next_maintenance_date: string | null
          assigned_fueler_id: number | null
          available_at: string | null
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: number
          equipment_id: string
          equipment_name: string
          equipment_type: 'fuel_truck' | 'tug' | 'gpu' | 'air_start' | 'belt_loader' | 'stairs' | 'lavatory_service' | 'water_service' | 'golf_cart' | 'staff_vehicle' | 'other'
          manufacturer?: string
          model?: string
          serial_number?: string
          status?: 'available' | 'in_use' | 'maintenance' | 'out_of_service'
          location?: string
          notes?: string
          last_maintenance_date?: string | null
          next_maintenance_date?: string | null
          assigned_fueler_id?: number | null
          available_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['equipment']['Insert']>
        Relationships: []
      }
      staff_shift: {
        Row: {
          id: number
          fueler_id: number
          shift_date: string
          start_time: string
          end_time: string
          created_by: number | null
          created_at: string
        }
        Insert: {
          id?: number
          fueler_id: number
          shift_date: string
          start_time: string
          end_time: string
          created_by?: number | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['staff_shift']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'staff_shift_fueler_id_fkey'
            columns: ['fueler_id']
            referencedRelation: 'fueler'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'staff_shift_created_by_fkey'
            columns: ['created_by']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      customer: {
        Row: {
          id: number
          name: string
          email: string
          phone: string
          customer_type: 'private' | 'military' | 'usfs' | 'ga'
          address: string
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: number
          name: string
          email?: string
          phone?: string
          customer_type?: 'private' | 'military' | 'usfs' | 'ga'
          address?: string
        }
        Update: Partial<Database['public']['Tables']['customer']['Insert']>
        Relationships: []
      }
      product: {
        Row: {
          id: number
          name: string
          description: string
          sku: string
          price: string
          product_type: 'fuel' | 'service' | 'fee' | 'product'
          is_active: boolean
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: number
          name: string
          description?: string
          sku: string
          price: number | string
          product_type?: 'fuel' | 'service' | 'fee' | 'product'
          is_active?: boolean
        }
        Update: Partial<Database['public']['Tables']['product']['Insert']>
        Relationships: []
      }
      invoice: {
        Row: {
          id: number
          customer_id: number
          flight_id: number | null
          status: 'draft' | 'issued' | 'paid' | 'void'
          total_amount: string
          payment_method: 'credit_card' | 'cash' | 'check' | 'account' | null
          due_date: string | null
          notes: string
          payment_recorded_at: string | null
          emailed_at: string | null
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: number
          customer_id: number
          flight_id?: number | null
          status?: 'draft' | 'issued' | 'paid' | 'void'
          total_amount?: number | string
          payment_method?: 'credit_card' | 'cash' | 'check' | 'account' | null
          due_date?: string | null
          notes?: string
          payment_recorded_at?: string | null
          emailed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['invoice']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'invoice_flight_id_fkey'
            columns: ['flight_id']
            referencedRelation: 'flight'
            referencedColumns: ['id']
          }
        ]
      }
      invoice_item: {
        Row: {
          id: number
          invoice_id: number
          product_id: number | null
          description: string
          quantity: string
          unit_price: string
          total_price: string
          created_at: string
        }
        Insert: {
          id?: number
          invoice_id: number
          product_id?: number | null
          description: string
          quantity?: number | string
          unit_price: number | string
          total_price?: number | string
        }
        Update: Partial<Database['public']['Tables']['invoice_item']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      complete_certification: {
        Args: {
          p_fueler_id: number
          p_training_id: number
          p_completed_date: string
          p_expiry_date: string
          p_certified_by_id: number | null
          p_notes: string
        }
        Returns: number
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
