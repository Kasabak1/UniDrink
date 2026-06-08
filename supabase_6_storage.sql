-- ============================================================
-- STEP 6: STORAGE BUCKET & RLS POLICIES FOR PRODUCT IMAGES
-- Run this to create the public product-images bucket and configure security.
-- ============================================================

-- 1. Create a public bucket for product images if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Clean up existing policies for the bucket (if any)
DROP POLICY IF EXISTS "Allow public read access to product-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin upload access to product-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin update access to product-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin delete access to product-images" ON storage.objects;

-- 3. Restrict select access to admins only (prevents listing all files to the public, while public URL access still works because the bucket is public)
CREATE POLICY "Allow public read access to product-images"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'product-images' 
    AND private.is_admin()
);

-- 4. Create admin write access (only logged-in admins can upload/update/delete)
CREATE POLICY "Allow admin upload access to product-images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'product-images' 
    AND private.is_admin()
);

CREATE POLICY "Allow admin update access to product-images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'product-images' 
    AND private.is_admin()
)
WITH CHECK (
    bucket_id = 'product-images' 
    AND private.is_admin()
);

CREATE POLICY "Allow admin delete access to product-images"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'product-images' 
    AND private.is_admin()
);
