-- ============================================================
-- STEP 1: CREATE TABLES & CONSTRAINTS
-- Run this first to initialize the database tables with proper data types.
-- ============================================================

-- 1. Admins Table
CREATE TABLE IF NOT EXISTS public.admins (
    email TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Blacklisted Emails Table (Spam Prevention)
CREATE TABLE IF NOT EXISTS public.blacklisted_emails (
    email TEXT PRIMARY KEY,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Products Table
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT,
    price NUMERIC NOT NULL CONSTRAINT chk_product_price CHECK (price >= 0),
    category TEXT,
    emoji TEXT,
    image_url TEXT, -- Added to support the React dashboard
    description TEXT,
    description_en TEXT,
    is_available BOOLEAN DEFAULT true,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    address TEXT NOT NULL,
    note TEXT,
    payment_method TEXT NOT NULL CONSTRAINT chk_order_payment_method CHECK (payment_method IN ('cash', 'transfer')),
    status TEXT DEFAULT 'pending'::text NOT NULL CONSTRAINT chk_order_status CHECK (status IN ('pending', 'processing', 'done', 'cancelled')),
    is_paid BOOLEAN DEFAULT false NOT NULL,
    total_price NUMERIC NOT NULL CONSTRAINT chk_order_total_price CHECK (total_price >= 0),
    customer_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Order Items Table (with product snapshots for price/name history)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT,
    product_name_en TEXT,
    quantity INTEGER NOT NULL CONSTRAINT chk_item_quantity CHECK (quantity > 0),
    price NUMERIC NOT NULL CONSTRAINT chk_item_price CHECK (price >= 0)
);

-- 6. Order Logs Table (History tracking)
CREATE TABLE IF NOT EXISTS public.order_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- 'create', 'update_status', 'update_payment', 'edit_details'
    changed_by TEXT DEFAULT 'Admin',
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Categories Table (admin-editable display names for product categories)
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,       -- 'coffee', 'tea', 'teaMilk', 'juice', 'smoothie'
    name_vi TEXT NOT NULL,
    name_en TEXT NOT NULL
);

-- Seed default category names (only insert if not exists)
INSERT INTO public.categories (id, name_vi, name_en) VALUES
    ('tea',      'Trà',      'Tea'),
    ('suahat',   'Sữa hạt',  'Nut Milk'),
    ('nuoc',     'Nước',     'Water'),
    ('juice',    'Nước Ép',  'Juice'),
    ('smoothie', 'Sinh Tố',  'Smoothie')
ON CONFLICT (id) DO NOTHING;

-- 8. Settings Table (Global configurations)
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY (RLS) IMMEDIATELY
-- ============================================================
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklisted_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CREATE PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_logs_order_id ON public.order_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_pending_unpaid ON public.orders(customer_email, status) WHERE status = 'pending';



