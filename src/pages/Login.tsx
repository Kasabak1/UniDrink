import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { supabase, withTimeout } from '../lib/supabase';
import { useApp } from '../context/AppContext';

const Login = () => {
  const { t, lang } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Lấy trang đích (nếu được redirect từ /checkout hoặc trang khác)
  const fromPage = (location.state as any)?.from as string | undefined;
  const notAuthorized = (location.state as any)?.notAuthorized;

  // Helper: điều hướng sau khi đăng nhập thành công
  const redirectAfterLogin = async (active: { value: boolean }) => {
    // Ưu tiên: trang đích từ state hoặc sessionStorage (sau Google OAuth redirect)
    const stored = sessionStorage.getItem('login_redirect_to');
    const destination = stored || fromPage;
    if (stored) sessionStorage.removeItem('login_redirect_to');

    if (destination) {
      navigate(destination, { replace: true });
      return;
    }

    // Kiểm tra quyền admin để điều hướng mặc định (dùng cache nếu đã có)
    let isAdmin = false;
    try {
      const cached = sessionStorage.getItem('is_admin');
      if (cached !== null) {
        isAdmin = cached === 'true';
      } else {
        const { data } = await withTimeout(
          (supabase as any).rpc('check_is_admin'),
          5000
        ) as any;
        isAdmin = !!data;
        sessionStorage.setItem('is_admin', String(isAdmin));
      }
    } catch (err) {
      console.warn('[UniDrink] check_is_admin timed out or failed in Login:', err);
    }
    if (active.value) {
      navigate(isAdmin ? '/admin/dashboard' : '/', { replace: true });
    }
  };

  useEffect(() => {
    const active = { value: true };
    const checkSessionAndRedirect = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && active.value && !notAuthorized) {
        await redirectAfterLogin(active);
      }
    };
    checkSessionAndRedirect();
    return () => { active.value = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, notAuthorized]);

  /* ── Google auth ── */
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setErrorMsg(null);
    // Lưu trang đích vào sessionStorage trước khi browser redirect
    // (React Router state bị mất khi reload)
    if (fromPage) {
      sessionStorage.setItem('login_redirect_to', fromPage);
    } else {
      sessionStorage.removeItem('login_redirect_to');
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/login' },
    });
    if (error) {
      setErrorMsg(error.message);
      setGoogleLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-md mx-auto pt-12 space-y-8"
    >
      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-4xl md:text-5xl font-serif text-brand-brown">{t.adminPortalTitle}</h2>
        <p className="text-brand-muted font-black uppercase text-[10px] tracking-[0.2em]">{t.adminPortalSubtitle}</p>
      </div>

      {/* Banner khi redirect từ checkout */}
      {fromPage === '/checkout' && !notAuthorized && (
        <div className="bg-brand-caramel/10 border border-brand-caramel/30 rounded-2xl px-5 py-3 text-center">
          <p className="text-xs font-bold text-brand-brown">
            {lang === 'EN'
              ? '🛒 Sign in to complete your order'
              : '🛒 Đăng nhập để hoàn tất đặt hàng'}
          </p>
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl border border-brand-beige space-y-8">
        {/* Not authorized error */}
        {notAuthorized && (
          <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-bold border border-red-100 text-center">
            {t.adminNotAuthorized}
          </div>
        )}

        {/* Generic error */}
        {errorMsg && !notAuthorized && (
          <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-bold border border-red-100 text-center">
            {errorMsg}
          </div>
        )}

        {/* Google sign in */}
        <button
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full py-4 bg-brand-brown text-white hover:scale-[1.02] active:scale-95 text-center rounded-2xl font-black uppercase tracking-[0.15em] text-xs shadow-xl shadow-brand-brown/20 transition-all flex items-center justify-center gap-3 disabled:opacity-60 cursor-pointer border-none outline-none"
        >
          {googleLoading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <div className="bg-white p-1 rounded-lg shrink-0 flex items-center justify-center shadow-xs">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                </svg>
              </div>
              <span>{t.signInWithGoogle}</span>
            </>
          )}
        </button>

        {/* Access note */}
        <p className="text-center text-[10px] text-brand-muted/60 font-medium leading-relaxed">
          {lang === 'EN'
            ? 'Sign in to buy items and track your order history. Only authorized accounts can access the Admin Dashboard.'
            : 'Đăng nhập để đặt hàng và theo dõi lịch sử mua hàng. Chỉ tài khoản được phân quyền mới có thể vào Dashboard Admin.'}
        </p>
      </div>
    </motion.div>
  );
};

export default Login;
