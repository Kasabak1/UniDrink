-- ============================================================
-- STEP 3: DATABASE FUNCTIONS & RPCs
-- Run this third to define secure transaction helper functions.
-- ============================================================

-- 1. Sequence for sequential order code
CREATE SEQUENCE IF NOT EXISTS public.order_code_seq START 1;

-- Sync sequence only if there are existing orders to prevent setting value to 0
DO $$
DECLARE
    max_val INTEGER;
BEGIN
    SELECT MAX(SUBSTRING(order_code FROM 3)::INTEGER) INTO max_val
    FROM public.orders
    WHERE order_code ~ '^DH[0-9]+$';
    
    IF max_val IS NOT NULL AND max_val > 0 THEN
        PERFORM setval('public.order_code_seq', max_val, true);
    END IF;
END $$;

-- 2. Generate sequential order code (returns e.g. DH000001)
CREATE OR REPLACE FUNCTION public.generate_order_code()
RETURNS TEXT AS $$
DECLARE
    next_seq BIGINT;
    new_code TEXT;
BEGIN
    next_seq := nextval('public.order_code_seq');
    new_code := 'DH' || LPAD(next_seq::TEXT, 6, '0');
    RETURN new_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.generate_order_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_code() TO service_role;

-- 3. Create order with items (safe transactional order placement RPC)
CREATE OR REPLACE FUNCTION public.create_order_with_items(
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_address TEXT,
    p_note TEXT,
    p_payment_method TEXT,
    p_customer_email TEXT,
    p_items JSONB -- Array of { id: string, quantity: number }
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

    -- Create parent order (initially total=0, updated after items are added)
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

        -- Store item with snapshotted prices and names to protect purchase history
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

REVOKE EXECUTE ON FUNCTION public.create_order_with_items(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- 4. Get single order details safely by tracking code (bypasses direct select RLS)
CREATE OR REPLACE FUNCTION public.get_order_by_code(p_code TEXT)
RETURNS SETOF public.orders AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.orders
    WHERE order_code = UPPER(TRIM(p_code));
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_order_by_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_by_code(TEXT) TO authenticated, service_role;

-- 5. Get order logs securely using the secure order UUID (handles guest tracking)
CREATE OR REPLACE FUNCTION public.get_order_logs_by_order_id(p_order_id UUID)
RETURNS SETOF public.order_logs AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.order_logs
    WHERE order_id = p_order_id
    ORDER BY created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_order_logs_by_order_id(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_logs_by_order_id(UUID) TO authenticated, service_role;

-- 6. Check if the current authenticated user is an admin (used by frontend AdminDashboard)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN private.is_admin();
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.check_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_is_admin() TO authenticated, service_role;
