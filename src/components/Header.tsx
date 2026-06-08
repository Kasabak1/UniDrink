import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Coffee, ShoppingCart, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { useApp } from '../context/AppContext';
import { supabase, withTimeout } from '../lib/supabase';

const Header = () => {
  const { lang, setLang, cart } = useApp();
  const [isScrolled, setIsScrolled] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const checkAdmin = async (session: any): Promise<boolean> => {
      if (!session) return false;

      // Use cached result to avoid repeated slow RPC calls
      const cached = sessionStorage.getItem('is_admin');
      if (cached !== null) return cached === 'true';

      try {
        const { data } = await withTimeout(
          (supabase as any).rpc('check_is_admin'),
          5000  // 5s is enough for a simple DB lookup
        ) as any;
        const result = !!data;
        sessionStorage.setItem('is_admin', String(result));
        return result;
      } catch (err) {
        console.warn('[UniDrink] check_is_admin timeout/error in Header:', err);
        return false;
      }
    };

    // onAuthStateChange fires INITIAL_SESSION immediately on mount —
    // no need to call getSession separately and double-invoke check_is_admin
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (session) {
        setIsAdmin(await checkAdmin(session));
      } else {
        // Clear cache on sign out
        sessionStorage.removeItem('is_admin');
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 py-4 md:px-10",
        isScrolled
          ? "bg-brand-beige/90 backdrop-blur-md border-b border-brand-muted/10 shadow-sm"
          : "bg-brand-beige/50 backdrop-blur-sm"
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1.5 md:gap-3 group shrink-0">
          <div className="w-7 h-7 md:w-10 md:h-10 bg-brand-brown rounded-xl flex items-center justify-center text-white shrink-0">
            <Coffee className="w-4 h-4 md:w-6 md:h-6 stroke-[2]" />
          </div>
          <h1 className="text-lg sm:text-2xl md:text-4xl font-serif font-black text-brand-brown italic tracking-tight truncate">
            UniDrink
          </h1>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4 md:gap-6 shrink-0">
          <div className="flex border border-brand-beige rounded-lg overflow-hidden shrink-0">
            <button
              onClick={() => setLang('VI')}
              className={cn(
                "px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold transition-all",
                lang === 'VI' ? "bg-brand-brown text-white" : "bg-white text-brand-muted hover:bg-brand-cream"
              )}
            >VI</button>
            <button
              onClick={() => setLang('EN')}
              className={cn(
                "px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold transition-all",
                lang === 'EN' ? "bg-brand-brown text-white" : "bg-white text-brand-muted hover:bg-brand-cream"
              )}
            >EN</button>
          </div>

          <Link to="/cart" className="relative p-1.5 sm:p-2 text-brand-ink hover:text-brand-brown transition-colors">
            <ShoppingCart className="w-5 h-5 md:w-6 md:h-6 stroke-[1.5]" />
            {cart.items.filter(i => i.quantity > 0).length > 0 && (
              <span className="absolute top-0 right-0 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-brand-caramel text-white text-[9px] sm:text-[10px] flex items-center justify-center rounded-full font-bold">
                {cart.items.filter(i => i.quantity > 0).length}
              </span>
            )}
          </Link>



          <Link
            to={!session ? "/login" : (isAdmin ? "/admin/dashboard" : "/track")}
            className="p-1.5 sm:p-2 text-brand-ink hover:text-brand-brown transition-colors shrink-0"
          >
            <User className="w-5 h-5 md:w-6 md:h-6 stroke-[1.5]" />
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;
