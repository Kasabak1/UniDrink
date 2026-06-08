import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';

import { AppContext } from './context/AppContext';
import { translations } from './translations';
import { useCart } from './hooks/useCart';
import type { Language, Product, Category } from './types';
import { supabase } from './lib/supabase';

import Header from './components/Header';
import DesktopModeWarning from './components/DesktopModeWarning';
import Footer from './components/Footer';
import Home from './pages/Home';
import CartPage from './pages/CartPage';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import TrackOrder from './pages/TrackOrder';

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'tea',      name_vi: 'Trà',      name_en: 'Tea' },
  { id: 'suahat',   name_vi: 'Sữa hạt',  name_en: 'Nut Milk' },
  { id: 'nuoc',     name_vi: 'Nước',     name_en: 'Water' },
  { id: 'juice',    name_vi: 'Nước Ép',  name_en: 'Juice' },
  { id: 'smoothie', name_vi: 'Sinh Tố',  name_en: 'Smoothie' },
];

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/track" element={<TrackOrder />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Login />} />
        <Route path="/admin/dashboard/*" element={<AdminDashboard />} />
      </Routes>
    </AnimatePresence>
  );
};

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('unicafe_lang');
    return (saved as Language) || 'VI';
  });

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('unidrink_products');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [productsLoaded, setProductsLoaded] = useState(() => {
    return localStorage.getItem('unidrink_products') !== null;
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem('unidrink_categories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });

  const cart = useCart();

  useEffect(() => {
    localStorage.setItem('unicafe_lang', lang);
  }, [lang]);

  // Fetch dynamic category names from Supabase on startup
  useEffect(() => {
    supabase
      .from('categories')
      .select('*')
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          setCategories(data as Category[]);
          localStorage.setItem('unidrink_categories', JSON.stringify(data));
        }
      });
  }, []);

  // Clear cart if returning from a successful PayOS payment redirect
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      // code = '00' or status = 'PAID' is the standard success response from PayOS
      if (params.get('code') === '00' || params.get('status') === 'PAID') {
        cart.clearCart();
        // Remove PayOS params from URL to keep it clean
        const url = new URL(window.location.href);
        url.searchParams.delete('code');
        url.searchParams.delete('id');
        url.searchParams.delete('status');
        url.searchParams.delete('cancel');
        url.searchParams.delete('orderCode');
        window.history.replaceState({}, document.title, url.pathname + url.search);
      }
    } catch (e) {
      console.error('Error clearing cart from URL search params:', e);
    }
  }, [cart]);

  const t = translations[lang];

  return (
    <BrowserRouter>
      <AppContext.Provider value={{
        lang,
        setLang,
        t,
        cart,
        products,
        setProducts,
        productsLoaded,
        setProductsLoaded,
        categories,
        setCategories,
      }}>
        <div className="min-h-screen flex flex-col">
          <DesktopModeWarning />
          <Header />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-10 pt-28">
            <AnimatedRoutes />
          </main>
          <Footer />
        </div>
      </AppContext.Provider>
    </BrowserRouter>
  );
}
