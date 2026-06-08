-- ============================================================
-- STEP 4: ORDER LOGGING TRIGGERS
-- Run this fourth to establish automatic order logging in the database.
-- ============================================================

-- 1. Trigger function for automatic logging on order changes
CREATE OR REPLACE FUNCTION public.log_order_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_changed_by TEXT := 'Customer';
BEGIN
    -- Detect who performed the action
    IF private.is_admin() THEN
        v_changed_by := 'Admin';
    END IF;

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.order_logs (order_id, action_type, changed_by, description)
        VALUES (NEW.id, 'create', v_changed_by, 'Đơn hàng được khởi tạo thành công.');

    ELSIF (TG_OP = 'UPDATE') THEN
        -- Secure update validation for customer roles (only apply for direct client updates by non-admins)
        IF current_user = 'authenticated' AND NOT private.is_admin() THEN
            -- 1. Customers cannot change status
            IF OLD.status IS DISTINCT FROM NEW.status THEN
                RAISE EXCEPTION 'Khách hàng không có quyền thay đổi trạng thái đơn hàng.';
            END IF;

            -- 2. Customers cannot change is_paid
            IF OLD.is_paid IS DISTINCT FROM NEW.is_paid THEN
                RAISE EXCEPTION 'Khách hàng không có quyền thay đổi trạng thái thanh toán.';
            END IF;

            -- 3. Customers can only update total_price if it matches the sum of their order items
            IF OLD.total_price IS DISTINCT FROM NEW.total_price AND NEW.total_price IS DISTINCT FROM (
                SELECT COALESCE(SUM(price * quantity), 0)
                FROM public.order_items
                WHERE order_id = NEW.id
            ) THEN
                RAISE EXCEPTION 'Tổng tiền đơn hàng không chính xác.';
            END IF;
        END IF;

        -- Order status changed
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            DECLARE
                old_status_text TEXT;
                new_status_text TEXT;
            BEGIN
                old_status_text := CASE
                    WHEN OLD.status = 'pending'    THEN 'Chờ duyệt'
                    WHEN OLD.status = 'processing' THEN 'Đang làm'
                    WHEN OLD.status = 'done'       THEN 'Hoàn thành'
                    WHEN OLD.status = 'cancelled'  THEN 'Đã hủy'
                    ELSE OLD.status
                END;
                new_status_text := CASE
                    WHEN NEW.status = 'pending'    THEN 'Chờ duyệt'
                    WHEN NEW.status = 'processing' THEN 'Đang làm'
                    WHEN NEW.status = 'done'       THEN 'Hoàn thành'
                    WHEN NEW.status = 'cancelled'  THEN 'Đã hủy'
                    ELSE NEW.status
                END;
                INSERT INTO public.order_logs (order_id, action_type, changed_by, description)
                VALUES (NEW.id, 'update_status', v_changed_by,
                    'Trạng thái đơn hàng thay đổi từ "' || old_status_text || '" sang "' || new_status_text || '".');
            END;
        END IF;

        -- Payment status changed
        IF OLD.is_paid IS DISTINCT FROM NEW.is_paid THEN
            DECLARE
                old_paid_text TEXT := CASE WHEN OLD.is_paid THEN 'Đã thanh toán' ELSE 'Chưa thanh toán' END;
                new_paid_text TEXT := CASE WHEN NEW.is_paid THEN 'Đã thanh toán' ELSE 'Chưa thanh toán' END;
            BEGIN
                INSERT INTO public.order_logs (order_id, action_type, changed_by, description)
                VALUES (NEW.id, 'update_payment', v_changed_by,
                    'Trạng thái thanh toán thay đổi từ "' || old_paid_text || '" sang "' || new_paid_text || '".');
            END;
        END IF;

        -- Order details edited (name, phone, address, note, total, payment_method)
        -- Only log total_price changes if the old total_price was greater than 0 (meaning it was not the initial order creation)
        IF OLD.customer_name     IS DISTINCT FROM NEW.customer_name  OR
           OLD.customer_phone    IS DISTINCT FROM NEW.customer_phone OR
           OLD.address           IS DISTINCT FROM NEW.address        OR
           OLD.note              IS DISTINCT FROM NEW.note           OR
           (OLD.total_price IS DISTINCT FROM NEW.total_price AND OLD.total_price > 0) OR
           OLD.payment_method    IS DISTINCT FROM NEW.payment_method THEN
            INSERT INTO public.order_logs (order_id, action_type, changed_by, description)
            VALUES (NEW.id, 'edit_details', v_changed_by, 'Thông tin đơn hàng được chỉnh sửa.');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.log_order_changes() FROM PUBLIC, anon, authenticated;

-- 2. Clean up and apply trigger
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders') THEN
        DROP TRIGGER IF EXISTS trigger_log_order_changes ON public.orders;
    END IF;
END $$;

CREATE TRIGGER trigger_log_order_changes
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_changes();
