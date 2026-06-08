-- ====================================================================
-- UNIDRINK DATABASE OPTIMIZATION & RLS LINTER FIXES
-- Run this in your Supabase SQL Editor to apply performance optimizations
-- ====================================================================

-- 1. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_pending_unpaid ON public.orders(customer_email, status) WHERE status = 'pending';

-- 2. Optimize private.is_admin() helper
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admins
        WHERE email = LOWER(TRIM(auth.jwt() ->> 'email'))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- 3. Fix "orders" SELECT RLS policy to resolve InitPlan re-evaluation
DROP POLICY IF EXISTS "Allow read orders owned or admin" ON public.orders;
CREATE POLICY "Allow read orders owned or admin" ON public.orders
    FOR SELECT USING (
        (customer_email = (SELECT LOWER(TRIM(auth.jwt() ->> 'email')))) 
        OR (SELECT private.is_admin())
    );

-- 4. Fix Multiple Permissive Policies for SELECT by narrowing admin write policies
DROP POLICY IF EXISTS "Allow admin write access to categories" ON public.categories;
DROP POLICY IF EXISTS "Allow admin insert categories" ON public.categories;
DROP POLICY IF EXISTS "Allow admin update categories" ON public.categories;
DROP POLICY IF EXISTS "Allow admin delete categories" ON public.categories;
CREATE POLICY "Allow admin insert categories" ON public.categories
    FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Allow admin update categories" ON public.categories
    FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Allow admin delete categories" ON public.categories
    FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "Allow admin write access to settings" ON public.settings;
DROP POLICY IF EXISTS "Allow admin insert settings" ON public.settings;
DROP POLICY IF EXISTS "Allow admin update settings" ON public.settings;
DROP POLICY IF EXISTS "Allow admin delete settings" ON public.settings;
CREATE POLICY "Allow admin insert settings" ON public.settings
    FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Allow admin update settings" ON public.settings
    FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Allow admin delete settings" ON public.settings
    FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "Allow admin write access to products" ON public.products;
DROP POLICY IF EXISTS "Allow admin insert products" ON public.products;
DROP POLICY IF EXISTS "Allow admin update products" ON public.products;
DROP POLICY IF EXISTS "Allow admin delete products" ON public.products;
CREATE POLICY "Allow admin insert products" ON public.products
    FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Allow admin update products" ON public.products
    FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "Allow admin delete products" ON public.products
    FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

-- 5. Optimize get_order_by_code to hit Unique index directly
CREATE OR REPLACE FUNCTION public.get_order_by_code(p_code TEXT)
RETURNS SETOF public.orders AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.orders
    WHERE order_code = UPPER(TRIM(p_code));
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- 6. Optimize create_order_with_items to hit index on blacklist and customer_email
CREATE OR REPLACE FUNCTION public.create_order_with_items(
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_address TEXT,
    p_note TEXT,
    p_payment_method TEXT,
    p_customer_email TEXT,
    p_items JSONB
)
RETURNS TEXT AS $$
DECLARE
    v_order_id UUID;
    v_order_code TEXT;
    v_total_price NUMERIC := 0;
    v_item RECORD;
    v_price NUMERIC;
    v_product_name TEXT;
    v_product_name_en TEXT;
    v_spam_limit INTEGER := 3;
    v_pending_count INTEGER;
BEGIN
    -- Auto-cancel pending unpaid orders older than 10 minutes
    UPDATE public.orders
    SET status = 'cancelled'
    WHERE status = 'pending'
      AND is_paid = false
      AND created_at < NOW() - INTERVAL '10 minutes';

    -- Blacklist check
    IF EXISTS (
        SELECT 1 FROM public.blacklisted_emails
        WHERE email = LOWER(TRIM(p_customer_email))
    ) THEN
        RAISE EXCEPTION 'Email của bạn đã bị khóa mua hàng do vi phạm chính sách (Spam).';
    END IF;

    -- Empty Order Check
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Đơn hàng phải có ít nhất một sản phẩm.';
    END IF;

    -- Authenticated User Email Enforce Check (skip for service_role)
    IF auth.role() = 'authenticated' AND LOWER(TRIM(p_customer_email)) != LOWER(TRIM(auth.jwt() ->> 'email')) THEN
        RAISE EXCEPTION 'Email đặt hàng không khớp với tài khoản đăng nhập.';
    END IF;

    -- Block Admin Orders
    IF private.is_admin() THEN
        RAISE EXCEPTION 'Tài khoản Admin không được phép đặt hàng.';
    END IF;

    -- Generate sequential code
    v_order_code := public.generate_order_code();

    -- Create parent order
    INSERT INTO public.orders (
        customer_name, customer_phone, address, note, payment_method, customer_email, total_price, order_code
    ) VALUES (
        p_customer_name, p_customer_phone, p_address, p_note, p_payment_method, LOWER(TRIM(p_customer_email)), 0, v_order_code
    ) RETURNING id INTO v_order_id;

    -- Process order items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id TEXT, quantity INTEGER)
    LOOP
        -- Retrieve original product details
        SELECT price, name, name_en
        INTO v_price, v_product_name, v_product_name_en
        FROM public.products WHERE id::text = v_item.id AND is_deleted = false;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Sản phẩm với ID % không tồn tại hoặc đã bị xóa.', v_item.id;
        END IF;

        -- Store item
        INSERT INTO public.order_items (
            order_id, product_id, product_name, product_name_en, quantity, price
        ) VALUES (
            v_order_id, v_item.id, v_product_name, v_product_name_en, v_item.quantity, v_price
        );

        -- Add to total
        v_total_price := v_total_price + (v_price * v_item.quantity);
    END LOOP;

    -- Commit final order total
    UPDATE public.orders SET total_price = v_total_price WHERE id = v_order_id;

    -- Check pending orders limit
    SELECT COALESCE(value::INTEGER, 3) INTO v_spam_limit
    FROM public.settings
    WHERE key = 'spam_order_limit';

    SELECT COUNT(*) INTO v_pending_count
    FROM public.orders
    WHERE customer_email = LOWER(TRIM(p_customer_email))
      AND status = 'pending';

    IF v_pending_count >= v_spam_limit THEN
        INSERT INTO public.blacklisted_emails (email, reason)
        VALUES (
            LOWER(TRIM(p_customer_email)), 
            'Hệ thống tự động khóa: Vượt quá giới hạn đơn hàng chưa duyệt (' || v_spam_limit || ' đơn)'
        )
        ON CONFLICT (email) DO NOTHING;
    END IF;

    RETURN v_order_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
