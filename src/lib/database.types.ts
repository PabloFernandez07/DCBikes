export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string
          slug: string
          name: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      products: {
        // TODO: sync con SQL — el SQL 0001_initial.sql declara `cost_price numeric(10,2)`
        // pero este archivo tenía `discount_percent`. Se mantiene `discount_percent` para
        // no romper código existente; cuando se regenere con `supabase gen types` desaparecerá
        // y aparecerá `cost_price`. También `category_id` es nullable en SQL (sin NOT NULL),
        // pero aquí está como `string`. NO se arregla en esta tanda; solo se añaden los 5
        // campos nuevos de la migración 0002.
        Row: {
          id: string
          category_id: string
          slug: string
          name: string
          description: string | null
          short_description: string | null
          retail_price: number
          discount_percent: number | null
          stock: number
          sku: string | null
          brand: string | null
          featured: boolean
          active: boolean
          created_at: string
          updated_at: string
          // ── 0002_purchasable_columns ──
          is_purchasable: boolean
          size_label: string | null
          model_group: string | null
          weight_grams: number | null
          ean: string | null
          // ── 0059_products_color ──
          color: string | null
          // ── 0060_products_flavor ──
          flavor: string | null
          // ── 0039_products_safety_compliance ──
          ce_marking: boolean
          safety_standards: string[]
          manufacturer_eu: string | null
        }
        Insert: {
          id?: string
          category_id: string
          slug: string
          name: string
          description?: string | null
          short_description?: string | null
          retail_price: number
          discount_percent?: number | null
          stock?: number
          sku?: string | null
          brand?: string | null
          featured?: boolean
          active?: boolean
          created_at?: string
          updated_at?: string
          // ── 0002_purchasable_columns ──
          is_purchasable?: boolean
          size_label?: string | null
          model_group?: string | null
          weight_grams?: number | null
          ean?: string | null
          // ── 0059_products_color ──
          color?: string | null
          // ── 0060_products_flavor ──
          flavor?: string | null
          // ── 0039_products_safety_compliance ──
          ce_marking?: boolean
          safety_standards?: string[]
          manufacturer_eu?: string | null
        }
        Update: {
          id?: string
          category_id?: string
          slug?: string
          name?: string
          description?: string | null
          short_description?: string | null
          retail_price?: number
          discount_percent?: number | null
          stock?: number
          sku?: string | null
          brand?: string | null
          featured?: boolean
          active?: boolean
          created_at?: string
          updated_at?: string
          // ── 0002_purchasable_columns ──
          is_purchasable?: boolean
          size_label?: string | null
          model_group?: string | null
          weight_grams?: number | null
          ean?: string | null
          // ── 0059_products_color ──
          color?: string | null
          // ── 0060_products_flavor ──
          flavor?: string | null
          // ── 0039_products_safety_compliance ──
          ce_marking?: boolean
          safety_standards?: string[]
          manufacturer_eu?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          }
        ]
      }
      product_images: {
        Row: {
          id: string
          product_id: string
          storage_path: string
          alt: string | null
          sort_order: number
        }
        Insert: {
          id?: string
          product_id: string
          storage_path: string
          alt?: string | null
          sort_order?: number
        }
        Update: {
          id?: string
          product_id?: string
          storage_path?: string
          alt?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      product_views: {
        Row: {
          id: number
          product_id: string
          session_id: string | null
          viewed_at: string
        }
        Insert: {
          product_id: string
          session_id?: string | null
          viewed_at?: string
        }
        Update: {
          product_id?: string
          session_id?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'product_views_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          }
        ]
      }
      search_queries: {
        Row: {
          id: number
          term: string
          results_count: number | null
          searched_at: string
        }
        Insert: {
          term: string
          results_count?: number | null
          searched_at?: string
        }
        Update: {
          term?: string
          results_count?: number | null
          searched_at?: string
        }
        Relationships: []
      }
      quote_requests: {
        Row: {
          id: string
          product_id: string | null
          email: string
          phone: string | null
          message: string | null
          status: string
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          product_id?: string | null
          email: string
          phone?: string | null
          message?: string | null
          status?: string
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          product_id?: string | null
          email?: string
          phone?: string | null
          message?: string | null
          status?: string
          created_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'quote_requests_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          }
        ]
      }
      settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      // ── 0007_customer_sessions ────────────────────────────────
      customer_sessions: {
        Row: {
          id: string
          email: string
          token_hash: string
          expires_at: string
          created_at: string
          used_at: string | null
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          id?: string
          email: string
          token_hash: string
          expires_at: string
          created_at?: string
          used_at?: string | null
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          id?: string
          email?: string
          token_hash?: string
          expires_at?: string
          created_at?: string
          used_at?: string | null
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      // ── 0003_orders_schema ────────────────────────────────────
      orders: {
        Row: {
          id: string
          order_number: string
          status:
            | 'pending'
            | 'authorized'
            | 'accepted'
            | 'rejected'
            | 'cancelled'
            | 'ready_pickup'
            | 'shipped'
            | 'delivered'
            | 'returned'
            | 'payment_failed'
          delivery_method: 'shipping' | 'pickup'
          customer_email: string
          customer_phone: string
          customer_first_name: string
          customer_last_name: string
          shipping_address: string | null
          shipping_city: string | null
          shipping_postal_code: string | null
          shipping_province: string | null
          shipping_notes: string | null
          needs_invoice: boolean
          invoice_business_name: string | null
          invoice_cif: string | null
          invoice_address: string | null
          subtotal_cents: number
          shipping_cents: number
          total_cents: number
          tax_rate: number
          payment_provider: string | null
          payment_method: 'card' | 'bizum' | null
          payment_pre_auth_id: string | null
          payment_pre_auth_at: string | null
          payment_captured_at: string | null
          payment_cancelled_at: string | null
          notes_internal: string | null
          rejection_reason: string | null
          accepted_by: string | null
          accepted_at: string | null
          ready_pickup_at: string | null
          shipped_at: string | null
          tracking_number: string | null
          tracking_carrier: string | null
          accepted_terms_at: string
          accepted_privacy_at: string
          deleted_at: string | null
          client_modified_at: string | null
          cancelled_by_customer: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_number: string
          status: Database['public']['Tables']['orders']['Row']['status']
          delivery_method: 'shipping' | 'pickup'
          customer_email: string
          customer_phone: string
          customer_first_name: string
          customer_last_name: string
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_postal_code?: string | null
          shipping_province?: string | null
          shipping_notes?: string | null
          needs_invoice?: boolean
          invoice_business_name?: string | null
          invoice_cif?: string | null
          invoice_address?: string | null
          subtotal_cents: number
          shipping_cents: number
          total_cents: number
          tax_rate: number
          payment_provider?: string | null
          payment_method?: 'card' | 'bizum' | null
          payment_pre_auth_id?: string | null
          payment_pre_auth_at?: string | null
          payment_captured_at?: string | null
          payment_cancelled_at?: string | null
          notes_internal?: string | null
          rejection_reason?: string | null
          accepted_by?: string | null
          accepted_at?: string | null
          ready_pickup_at?: string | null
          shipped_at?: string | null
          tracking_number?: string | null
          tracking_carrier?: string | null
          accepted_terms_at: string
          accepted_privacy_at: string
          deleted_at?: string | null
          client_modified_at?: string | null
          cancelled_by_customer?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_number?: string
          status?: Database['public']['Tables']['orders']['Row']['status']
          delivery_method?: 'shipping' | 'pickup'
          customer_email?: string
          customer_phone?: string
          customer_first_name?: string
          customer_last_name?: string
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_postal_code?: string | null
          shipping_province?: string | null
          shipping_notes?: string | null
          needs_invoice?: boolean
          invoice_business_name?: string | null
          invoice_cif?: string | null
          invoice_address?: string | null
          subtotal_cents?: number
          shipping_cents?: number
          total_cents?: number
          tax_rate?: number
          payment_provider?: string | null
          payment_method?: 'card' | 'bizum' | null
          payment_pre_auth_id?: string | null
          payment_pre_auth_at?: string | null
          payment_captured_at?: string | null
          payment_cancelled_at?: string | null
          notes_internal?: string | null
          rejection_reason?: string | null
          accepted_by?: string | null
          accepted_at?: string | null
          ready_pickup_at?: string | null
          shipped_at?: string | null
          tracking_number?: string | null
          tracking_carrier?: string | null
          accepted_terms_at?: string
          accepted_privacy_at?: string
          deleted_at?: string | null
          client_modified_at?: string | null
          cancelled_by_customer?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          product_sku: string | null
          product_size_label: string | null
          unit_price_cents: number
          quantity: number
          line_total_cents: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          product_sku?: string | null
          product_size_label?: string | null
          unit_price_cents: number
          quantity: number
          line_total_cents: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          product_sku?: string | null
          product_size_label?: string | null
          unit_price_cents?: number
          quantity?: number
          line_total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      order_status_history: {
        Row: {
          id: string
          order_id: string
          from_status: string | null
          to_status: string
          changed_by: string | null
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          from_status?: string | null
          to_status: string
          changed_by?: string | null
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          from_status?: string | null
          to_status?: string
          changed_by?: string | null
          reason?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
      payments_log: {
        Row: {
          id: string
          order_id: string | null
          payment_provider: string
          operation_type: 'preauth' | 'capture' | 'cancel' | 'refund' | 'notification'
          redsys_response_code: string | null
          redsys_authorization_code: string | null
          redsys_transaction_type: string | null
          raw_payload: Json
          signature_valid: boolean | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id?: string | null
          payment_provider?: string
          operation_type: 'preauth' | 'capture' | 'cancel' | 'refund' | 'notification'
          redsys_response_code?: string | null
          redsys_authorization_code?: string | null
          redsys_transaction_type?: string | null
          raw_payload: Json
          signature_valid?: boolean | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string | null
          payment_provider?: string
          operation_type?: 'preauth' | 'capture' | 'cancel' | 'refund' | 'notification'
          redsys_response_code?: string | null
          redsys_authorization_code?: string | null
          redsys_transaction_type?: string | null
          raw_payload?: Json
          signature_valid?: boolean | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
      invoices: {
        Row: {
          id: string
          order_id: string
          invoice_number: string
          invoice_type: 'b2c' | 'b2b'
          pdf_storage_path: string
          issued_at: string
          issuer_company_name: string
          issuer_cif: string
          issuer_address: string
          base_cents: number
          tax_cents: number
          total_cents: number
        }
        Insert: {
          id?: string
          order_id: string
          invoice_number: string
          invoice_type: 'b2c' | 'b2b'
          pdf_storage_path: string
          issued_at?: string
          issuer_company_name: string
          issuer_cif: string
          issuer_address: string
          base_cents: number
          tax_cents: number
          total_cents: number
        }
        Update: {
          id?: string
          order_id?: string
          invoice_number?: string
          invoice_type?: 'b2c' | 'b2b'
          pdf_storage_path?: string
          issued_at?: string
          issuer_company_name?: string
          issuer_cif?: string
          issuer_address?: string
          base_cents?: number
          tax_cents?: number
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
      order_counter: {
        Row: {
          year: number
          last_number: number
        }
        Insert: {
          year: number
          last_number?: number
        }
        Update: {
          year?: number
          last_number?: number
        }
        Relationships: []
      }
      invoice_counter: {
        Row: {
          year: number
          last_number: number
        }
        Insert: {
          year: number
          last_number?: number
        }
        Update: {
          year?: number
          last_number?: number
        }
        Relationships: []
      }
      // ── 0010_data_breaches + 0024_data_breaches_rls_audit ────────
      data_breaches: {
        Row: {
          id: string
          detected_at: string
          description: string
          source: string | null
          affected_data_categories: string[] | null
          affected_users_estimated: number | null
          contains_special_categories: boolean
          risk_level: 'low' | 'medium' | 'high' | 'critical'
          risk_justification: string | null
          notified_aepd: boolean
          notified_aepd_at: string | null
          aepd_case_number: string | null
          notified_users: boolean
          notified_users_at: string | null
          notification_method: string | null
          containment_measures: string | null
          resolution_status: 'open' | 'contained' | 'resolved'
          resolved_at: string | null
          reported_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          detected_at: string
          description: string
          source?: string | null
          affected_data_categories?: string[] | null
          affected_users_estimated?: number | null
          contains_special_categories?: boolean
          risk_level?: 'low' | 'medium' | 'high' | 'critical'
          risk_justification?: string | null
          notified_aepd?: boolean
          notified_aepd_at?: string | null
          aepd_case_number?: string | null
          notified_users?: boolean
          notified_users_at?: string | null
          notification_method?: string | null
          containment_measures?: string | null
          resolution_status?: 'open' | 'contained' | 'resolved'
          resolved_at?: string | null
          reported_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          detected_at?: string
          description?: string
          source?: string | null
          affected_data_categories?: string[] | null
          affected_users_estimated?: number | null
          contains_special_categories?: boolean
          risk_level?: 'low' | 'medium' | 'high' | 'critical'
          risk_justification?: string | null
          notified_aepd?: boolean
          notified_aepd_at?: string | null
          aepd_case_number?: string | null
          notified_users?: boolean
          notified_users_at?: string | null
          notification_method?: string | null
          containment_measures?: string | null
          resolution_status?: 'open' | 'contained' | 'resolved'
          resolved_at?: string | null
          reported_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // ── 0022_product_price_history (C-04 Omnibus) ────────────────
      product_price_history: {
        Row: {
          id: number
          product_id: string
          price: number
          effective_from: string
          effective_to: string | null
        }
        Insert: {
          id?: number
          product_id: string
          price: number
          effective_from?: string
          effective_to?: string | null
        }
        Update: {
          id?: number
          product_id?: string
          price?: number
          effective_from?: string
          effective_to?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      next_order_number: {
        Args: { p_year: number }
        Returns: number
      }
      // next_invoice_number: dropeada por C-03 (migración 0020).
      // Sustituida por next_b2c_invoice_number / next_b2b_invoice_number (migración 0011).
      next_b2c_invoice_number: {
        Args: { p_year: number }
        Returns: number
      }
      next_b2b_invoice_number: {
        Args: { p_year: number }
        Returns: number
      }
      // C-04 Omnibus: mínimo precio últimos 30 días (migración 0022).
      get_min_price_last_30d: {
        Args: { p_product_id: string }
        Returns: number | null
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Category = Database['public']['Tables']['categories']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type ProductImage = Database['public']['Tables']['product_images']['Row']
export type QuoteRequest = Database['public']['Tables']['quote_requests']['Row']
export type Setting = Database['public']['Tables']['settings']['Row']
// ── 0003_orders_schema ──────────────────────────────────────────
export type Order = Database['public']['Tables']['orders']['Row']
export type OrderInsert = Database['public']['Tables']['orders']['Insert']
export type OrderUpdate = Database['public']['Tables']['orders']['Update']
export type OrderStatus = Order['status']
export type OrderItem = Database['public']['Tables']['order_items']['Row']
export type OrderStatusHistory = Database['public']['Tables']['order_status_history']['Row']
export type PaymentLog = Database['public']['Tables']['payments_log']['Row']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type OrderCounter = Database['public']['Tables']['order_counter']['Row']
export type InvoiceCounter = Database['public']['Tables']['invoice_counter']['Row']
