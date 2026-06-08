-- ============================================================
-- STEP 2: ACCESS POLICIES & SECURITY RULES
-- Run this second to configure strict read/write policies on all tables.
-- ============================================================

-- 1. Clean up existing policies first to avoid dependency blocks
DROP POLICY IF EXISTS "Allow admin access to admins" ON public.admins;
DROP POLICY IF EXISTS "Allow admin access to blacklisted_emails" ON public.blacklisted_emails;
DROP POLICY IF EXISTS "Allow public read access to products" ON public.products;
DROP POLICY IF EXISTS "Allow admin write access to products" ON public.products;
DROP POLICY IF EXISTS "Allow admin insert products" ON public.products;
DROP POLICY IF EXISTS "Allow admin update products" ON public.products;
DROP POLICY IF EXISTS "Allow admin delete products" ON public.products;
DROP POLICY IF EXISTS "Allow read orders owned or admin" ON public.orders;
DROP POLICY IF EXISTS "Allow insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow update orders" ON public.orders;
DROP POLICY IF EXISTS "Allow admin update orders" ON public.orders;
DROP POLICY IF EXISTS "Allow read order_items if order is viewable" ON public.order_items;
DROP POLICY IF EXISTS "Allow insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Allow read order_logs if order is viewable" ON public.order_logs;
DROP POLICY IF EXISTS "Allow public read access to settings" ON public.settings;
DROP POLICY IF EXISTS "Allow admin write access to settings" ON public.settings;
DROP POLICY IF EXISTS "Allow admin insert settings" ON public.settings;
DROP POLICY IF EXISTS "Allow admin update settings" ON public.settings;
DROP POLICY IF EXISTS "Allow admin delete settings" ON public.settings;
DROP POLICY IF EXISTS "Allow public read access to categories" ON public.categories;
DROP POLICY IF EXISTS "Allow admin write access to categories" ON public.categories;
DROP POLICY IF EXISTS "Allow admin insert categories" ON public.categories;
DROP POLICY IF EXISTS "Allow admin update categories" ON public.categories;
DROP POLICY IF EXISTS "Allow admin delete categories" ON public.categories;

-- 2. Helper Admin Checking Function (Marked as STABLE for performance)
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admins
        WHERE email = LOWER(TRIM(auth.jwt() ->> 'email'))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated, service_role;

-- 3. Create Policies

-- Admins Table: Only admins can view/manage
CREATE POLICY "Allow admin access to admins" ON public.admins
    FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

-- Blacklist: Only admins can view/manage
CREATE POLICY "Allow admin access to blacklisted_emails" ON public.blacklisted_emails
    FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

-- Categories: Everyone can read, only admin can write
CREATE POLICY "Allow public read access to categories" ON public.categories
    FOR SELECT USING (true);

CREATE POLICY "Allow admin insert categories" ON public.categories
    FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Allow admin update categories" ON public.categories
    FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Allow admin delete categories" ON public.categories
    FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

-- Settings: Everyone can read, only admin can write
CREATE POLICY "Allow public read access to settings" ON public.settings
    FOR SELECT USING (true);

CREATE POLICY "Allow admin insert settings" ON public.settings
    FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Allow admin update settings" ON public.settings
    FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Allow admin delete settings" ON public.settings
    FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

-- Products: Everyone can read, only Admin can write
CREATE POLICY "Allow public read access to products" ON public.products
    FOR SELECT USING (true);

CREATE POLICY "Allow admin insert products" ON public.products
    FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Allow admin update products" ON public.products
    FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Allow admin delete products" ON public.products
    FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

-- Orders Policies
-- Read: Owner (matching email) or Admin can view (Uses fast inline check querying admins, safe since admins RLS does not recurse)
CREATE POLICY "Allow read orders owned or admin" ON public.orders
    FOR SELECT USING (
        (customer_email = (SELECT LOWER(TRIM(auth.jwt() ->> 'email')))) 
        OR (SELECT private.is_admin())
    );

-- Update: Only admins can update orders (e.g. status, is_paid)
CREATE POLICY "Allow admin update orders" ON public.orders
    FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

-- Order Items Policies
-- Read: Viewable if parent order is viewable
CREATE POLICY "Allow read order_items if order is viewable" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
        )
    );

-- Order Logs: Viewable if parent order is viewable
CREATE POLICY "Allow read order_logs if order is viewable" ON public.order_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_logs.order_id
        )
    );

-- ============================================================
-- STEP 2b: TABLE-LEVEL GRANTS
-- RLS policies only filter rows — roles also need table-level
-- SELECT/INSERT/UPDATE/DELETE privileges to pass the first gate.
-- ============================================================

-- anon (unauthenticated visitors) can read products
GRANT SELECT ON public.products TO anon;

-- authenticated users get read access to relevant tables
GRANT SELECT ON public.products      TO authenticated;
GRANT SELECT ON public.orders        TO authenticated;
GRANT SELECT ON public.order_items   TO authenticated;
GRANT SELECT ON public.order_logs    TO authenticated;
GRANT SELECT ON public.admins        TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.blacklisted_emails TO authenticated;

-- authenticated admins can insert/update/delete orders and products (RLS enforces is_admin check)
GRANT UPDATE ON public.orders   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;

-- service_role (used by backend/webhook) needs full access bypassing RLS
GRANT SELECT, UPDATE ON public.orders        TO service_role;
GRANT SELECT, INSERT  ON public.order_logs   TO service_role;
GRANT SELECT          ON public.order_items  TO service_role;

-- categories: everyone can read, authenticated admins can insert/update/delete
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;

-- settings: everyone can read, authenticated admins can insert/update/delete
GRANT SELECT ON public.settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.settings TO authenticated;
