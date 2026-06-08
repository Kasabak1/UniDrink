export interface Product {
  id: string;
  name: string;
  name_en?: string;
  description?: string;
  description_en?: string;
  image_url?: string;
  price: number;
  category: string;
  emoji?: string;
  is_available: boolean;
  is_deleted: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  note?: string;
  total_price: number;
  payment_method: 'cash' | 'transfer';
  is_paid: boolean;
  status: 'pending' | 'processing' | 'done' | 'cancelled';
  customer_email?: string;
  created_at: string;
}

export interface OrderLog {
  id: string;
  order_id: string;
  action_type: 'create' | 'update_status' | 'update_payment' | 'edit_details';
  changed_by?: string;
  description: string;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id?: string;
  product_name: string;
  product_name_en?: string;
  quantity: number;
  price: number;
}

export interface Setting {
  key: string;
  value: string;
  is_public: boolean;
  updated_at: string;
}

export interface Category {
  id: string;       // 'coffee', 'tea', 'teaMilk', 'juice', 'smoothie'
  name_vi: string;
  name_en: string;
}

export type Language = 'VI' | 'EN';
