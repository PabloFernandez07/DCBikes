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
        Relationships: []
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
        }
        Insert: {
          id?: string
          product_id?: string | null
          email: string
          phone?: string | null
          message?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string | null
          email?: string
          phone?: string | null
          message?: string | null
          status?: string
          created_at?: string
        }
        Relationships: []
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Category = Database['public']['Tables']['categories']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type ProductImage = Database['public']['Tables']['product_images']['Row']
export type QuoteRequest = Database['public']['Tables']['quote_requests']['Row']
export type Setting = Database['public']['Tables']['settings']['Row']
