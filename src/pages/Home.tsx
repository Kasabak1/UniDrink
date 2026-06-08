import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, CupSoda, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { useApp } from '../context/AppContext';
import { supabase, defaultData, withTimeout } from '../lib/supabase';
import ProductCard from '../components/ProductCard';
import type { Product } from '../types';


const Home = () => {
  const { lang, t, products, setProducts, productsLoaded, setProductsLoaded, categories } = useApp();
  const [loading, setLoading] = useState(!productsLoaded);
  const [syncing, setSyncing] = useState(false); // đang chờ Supabase wake up trong nền
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'price_asc' | 'price_desc'>('price_asc');
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      type FetchResult = { data: Product[] | null; error: { message: string } | null };

      // Bọc supabase query với timeout tối đa 25 giây
      const supabasePromise = withTimeout(
        Promise.resolve(
          supabase
            .from('products')
            .select('*')
            .eq('is_deleted', false)
        ),
        25000
      ) as unknown as Promise<FetchResult>;

      // Nếu chưa có data → sau 3 giây hiện demo data ngay để user không phải chờ spinner vô tận.
      // Nếu đã có data cũ rồi → không cần fallback nhanh vì user đã nhìn thấy sản phẩm từ cache rồi.
      const quickFallbackPromise = new Promise<FetchResult>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: '__quick_fallback__' } }), productsLoaded ? 999999 : 3000)
      );

      try {
        const { data, error } = await Promise.race([supabasePromise, quickFallbackPromise]);

        if (cancelled) return;

        if (error?.message === '__quick_fallback__') {
          // Supabase đang cold-start trong lần đầu truy cập — hiện demo data tạm thời
          console.warn('[UniDrink] Supabase chậm phản hồi — hiện demo data, đang chờ Supabase trong nền...');
          setProducts(defaultData as unknown as Product[]);
          setLoading(false);
          setSyncing(true); // hiện indicator nhỏ "đang đồng bộ"

          // Tiếp tục chờ Supabase thức dậy (tối đa 10s nhờ timeout)
          try {
            const { data: realData, error: realError } = await supabasePromise;
            if (cancelled) return;
            if (!realError && realData && realData.length > 0) {
              console.info('[UniDrink] Supabase đã thức dậy — cập nhật dữ liệu thật.');
              setProducts(realData);
              setProductsLoaded(true);
              localStorage.setItem('unidrink_products', JSON.stringify(realData));
              setErrorStatus(null);
            }
          } catch (e: any) {
            console.warn('[UniDrink] Background sync failed or timed out:', e?.message || e);
            // Giữ nguyên demo data nếu Supabase vẫn không được
          } finally {
            if (!cancelled) setSyncing(false);
          }
        } else if (error) {
          if (!productsLoaded) {
            setProducts(defaultData as unknown as Product[]);
          }
          setErrorStatus(error.message);
          setLoading(false);
        } else if (data) {
          // Supabase phản hồi nhanh → dùng data thật ngay
          setProducts(data);
          setProductsLoaded(true);
          localStorage.setItem('unidrink_products', JSON.stringify(data));
          setErrorStatus(null);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('[UniDrink] fetchProducts error:', err);
        if (!cancelled) {
          if (!productsLoaded) {
            setProducts(defaultData as unknown as Product[]);
          }
          setErrorStatus(err?.message || 'Request failed');
          setLoading(false);
        }
      }
    }

    fetchProducts();
    return () => { cancelled = true; };
  }, [productsLoaded, setProducts, setProductsLoaded]);

  // Filter and sort client-side instantly
  const filteredProducts = useMemo(() => {
    const filtered = products.filter(p => {
      const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
      const name = lang === 'EN' ? (p.name_en || p.name) : p.name;
      const matchesSearch = name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      return sortBy === 'price_asc' ? a.price - b.price : b.price - a.price;
    });
  }, [products, activeCategory, search, sortBy, lang]);

  if (loading) {
    return (
      <div id="loading-state" className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-brand-beige border-t-brand-brown rounded-full animate-spin" />
        <p className="font-serif italic text-brand-muted uppercase text-xs tracking-widest">UniDrink is preparing...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-16"
    >
      {errorStatus && (
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-bold border border-red-100 text-center">
          {t.error} {errorStatus}
          </div>
        </div>
      )}

      {/* Syncing indicator — hiện khi Supabase đang cold-start trong nền */}
      {syncing && (
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-center gap-2 bg-brand-cream border border-brand-beige text-brand-muted rounded-2xl px-6 py-3 text-[10px] font-black uppercase tracking-widest">
            <div className="w-3 h-3 border-2 border-brand-beige border-t-brand-brown rounded-full animate-spin shrink-0" />
            {lang === 'EN' ? 'Syncing with server…' : 'Đang đồng bộ dữ liệu thật…'}
          </div>
        </div>
      )}

      {/* Search & Sort Bar */}
      <section className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-4 px-4">
        <div className="relative grow w-full">
          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-muted">
            <Search className="w-6 h-6 stroke-[1.5]" />
          </div>
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-brand-beige rounded-full pl-16 pr-8 py-4 outline-none focus:border-brand-brown/30 text-lg font-medium shadow-sm transition-all placeholder:text-brand-muted/50"
          />
        </div>

        <button
          onClick={() => setSortBy(prev => prev === 'price_asc' ? 'price_desc' : 'price_asc')}
          className="flex items-center justify-between md:justify-start gap-4 md:gap-10 bg-white border border-brand-beige rounded-2xl px-6 md:px-8 py-3 md:py-4 shadow-sm group hover:border-brand-brown transition-all w-full md:w-auto"
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-[#2D1B14] group-hover:text-brand-brown">
            {t.priceLabel}
          </span>
          <div className="flex items-center gap-3 text-brand-brown">
            {sortBy === 'price_asc' ? (
              <>
                <ArrowUp className="w-5 h-5 stroke-[2.5]" />
                <span className="text-xs font-black uppercase tracking-widest leading-none">{t.sortAsc}</span>
              </>
            ) : (
              <>
                <ArrowDown className="w-5 h-5 stroke-[2.5]" />
                <span className="text-xs font-black uppercase tracking-widest leading-none">{t.sortDesc}</span>
              </>
            )}
          </div>
        </button>
      </section>

      {/* Categories */}
      <section className="flex flex-wrap gap-2 md:gap-4 justify-center px-2 md:px-4">
        {/* "All" button is always first */}
        <button
          key="all"
          onClick={() => setActiveCategory('all')}
          className={cn(
            "px-6 py-2 md:px-10 md:py-3 rounded-full text-xs md:text-sm font-bold transition-all border",
            activeCategory === 'all'
              ? "bg-brand-brown text-white border-brand-brown shadow-xl shadow-brand-brown/10"
              : "bg-white border-brand-beige text-[#2D1B14] hover:bg-brand-cream"
          )}
        >
          {t.categoryAll}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              "px-6 py-2 md:px-10 md:py-3 rounded-full text-xs md:text-sm font-bold transition-all border",
              activeCategory === cat.id
                ? "bg-brand-brown text-white border-brand-brown shadow-xl shadow-brand-brown/10"
                : "bg-white border-brand-beige text-[#2D1B14] hover:bg-brand-cream"
            )}
          >
            {lang === 'EN' ? cat.name_en : cat.name_vi}
          </button>
        ))}
      </section>

      {/* Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto">
        <AnimatePresence mode="popLayout">
          {filteredProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </AnimatePresence>
      </section>

      {filteredProducts.length === 0 && (
        <div className="py-20 text-center space-y-4">
          <div className="bg-brand-beige/50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            <CupSoda className="w-10 h-10 text-brand-muted opacity-20" />
          </div>
          <p className="text-brand-muted font-bold uppercase tracking-[0.2em] text-[10px]">No signature drinks found</p>
        </div>
      )}
    </motion.div>
  );
};

export default Home;
