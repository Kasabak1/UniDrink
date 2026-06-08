-- ============================================================
-- STEP 5: SEED DATA
-- Run this last to populate the database with default drinks and admins.
-- ============================================================

-- 1. Seed Default Administrator (Change this to your Google email if needed)
INSERT INTO public.admins (email)
VALUES ('admin@phenikaa-uni.edu.vn')
ON CONFLICT (email) DO NOTHING;

-- 2. Seed Default Drink Products
INSERT INTO public.products (id, name, name_en, price, category, emoji, description, description_en, is_available)
VALUES
    ('1', 'Sữa Hạt Sen', 'Lotus Seed Milk', 35000, 'suahat', '🥛', 'Sữa hạt sen thơm ngon bổ dưỡng.', 'Lotus seed nut milk, rich and nutritious.', true),
    ('2', 'Sữa Hạt Điều', 'Cashew Nut Milk', 38000, 'suahat', '🥤', 'Sữa hạt điều béo ngậy tự nhiên.', 'Creamy cashew nut milk, naturally sweet.', true),
    ('3', 'Trà Đào Cam Sả', 'Peach Orange Tea', 32000, 'tea', '🍑', 'Thanh mát giải nhiệt mùa hè.', 'Refreshing peach orange lemongrass tea.', true),
    ('4', 'Nước Ép Cam', 'Orange Juice', 30000, 'juice', '🍊', 'Cam tươi nguyên chất 100%.', '100% fresh orange juice.', true),
    ('5', 'Sinh Tố Bơ', 'Avocado Smoothie', 40000, 'smoothie', '🥑', 'Bơ sáp béo ngậy xay mịn.', 'Creamy avocado smoothie.', true),
    ('6', 'Nước Tinh Khiết', 'Mineral Water', 15000, 'nuoc', '💧', 'Nước khoáng đóng chai mát lạnh.', 'Chilled pure bottled mineral water.', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Seed Default System Settings
INSERT INTO public.settings (key, value, description)
VALUES ('spam_order_limit', '3', 'Số đơn hàng chưa duyệt tối đa trước khi bị tự động khóa email')
ON CONFLICT (key) DO NOTHING;
