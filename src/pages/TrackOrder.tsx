import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, ChevronDown, ChevronUp } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { supabase, withTimeout } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import type { Order, OrderItem, OrderLog } from '../types';

// Kiểm tra đồng bộ xem có Supabase token không
const hasStoredSession = () =>
  Object.keys(localStorage).some(
    (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
  );

interface ExpandedData {
  items: OrderItem[];
  logs: OrderLog[];
}

const TrackOrder = () => {
  const { t, lang } = useApp();

  const [session, setSession] = useState<any>(null);
  // Chỉ hiện loading spinner nếu có token trong localStorage
  const [authLoading, setAuthLoading] = useState(() => hasStoredSession());
  const [signingIn, setSigningIn] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [expanded, setExpanded] = useState<Record<string, ExpandedData | undefined>>({});
  const [expanding, setExpanding] = useState<Record<string, boolean>>({});

  /* ── Auth ── */
  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately — no need for separate getSession call
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  /* ── Fetch orders khi có session ── */
  useEffect(() => {
    if (!session) { setOrders([]); return; }
    fetchOrders();
  }, [session]);

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false }) as unknown as Promise<any>,
        25000
      );
      if (!error && data) setOrders(data as Order[]);
    } catch (e: any) {
      console.error('[UniDrink] fetchOrders error or timeout:', e?.message || e);
    } finally {
      setOrdersLoading(false);
    }
  };

  /* ── Toggle expand — lazy load items + logs ── */
  const toggleExpand = async (order: Order) => {
    if (expanded[order.id] !== undefined) {
      setExpanded(prev => { const c = { ...prev }; delete c[order.id]; return c; });
      return;
    }
    setExpanding(prev => ({ ...prev, [order.id]: true }));
    try {
      const [itemsRes, logsRes] = await withTimeout(
        Promise.all([
          (supabase as any).from('order_items').select('*').eq('order_id', order.id),
          (supabase as any).rpc('get_order_logs_by_order_id', { p_order_id: order.id }),
        ]),
        20000
      );
      setExpanded(prev => ({
        ...prev,
        [order.id]: {
          items: (itemsRes.data || []) as OrderItem[],
          logs: (logsRes.data || []) as OrderLog[],
        },
      }));
    } catch (e: any) {
      console.error('[UniDrink] toggleExpand error or timeout:', e?.message || e);
    } finally {
      setExpanding(prev => ({ ...prev, [order.id]: false }));
    }
  };

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/track' },
    });
    setSigningIn(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // Clear admin cache so next login re-checks correctly
    sessionStorage.removeItem('is_admin');
    setOrders([]);
    setExpanded({});
  };

  const statusStyle = (status: Order['status']) => {
    if (status === 'done') return 'bg-green-50 text-green-700 border-green-200';
    if (status === 'processing') return 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse';
    if (status === 'cancelled') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-brand-cream text-brand-brown border-brand-beige';
  };

  /* ── Loading ── */
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-10 h-10 border-4 border-brand-beige border-t-brand-brown rounded-full animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-muted">
          {lang === 'EN' ? 'Verifying session...' : 'Đang xác thực...'}
        </p>
      </div>
    );
  }

  /* ── Chưa đăng nhập ── */
  if (!session) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="max-w-md mx-auto text-center space-y-8 pt-12"
      >
        <div className="space-y-2">
          <h2 className="text-3xl md:text-4xl font-serif text-brand-ink">{t.myOrdersTitle}</h2>
          <p className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{t.myOrdersSubtitle}</p>
        </div>

        <div className="bg-brand-cream border border-brand-beige rounded-[2.5rem] p-10 shadow-xl space-y-6">
          <div className="w-16 h-16 bg-white border border-brand-beige rounded-2xl flex items-center justify-center mx-auto text-3xl shadow-sm">
            🧾
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-serif font-black text-brand-ink">{t.myOrdersLoginTitle}</h3>
            <p className="text-xs text-brand-muted font-medium leading-relaxed font-sans px-2">{t.myOrdersLoginDesc}</p>
          </div>
          <Link
            to="/login"
            className="block w-full py-4 bg-brand-brown text-white hover:scale-[1.02] active:scale-95 text-center rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-brand-brown/20 transition-all font-bold"
          >
            {lang === 'EN' ? 'Sign In / Register' : 'Đăng nhập / Đăng ký'}
          </Link>
        </div>
      </motion.div>
    );
  }

  /* ── Đã đăng nhập ── */
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-3xl mx-auto space-y-8 pt-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl md:text-4xl font-serif text-brand-ink">{t.myOrdersTitle}</h2>
          <p className="text-xs text-brand-muted font-mono">{session.user?.email}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-brand-muted hover:text-brand-brown transition-colors text-[10px] font-black uppercase tracking-widest self-start sm:self-auto"
        >
          <LogOut className="w-4 h-4" />
          {lang === 'EN' ? 'Sign Out' : 'Đăng xuất'}
        </button>
      </div>

      {/* Orders list */}
      {ordersLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-brand-beige border-t-brand-brown rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="py-20 text-center space-y-4">
          <div className="bg-brand-beige/50 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-3xl">🛒</div>
          <p className="text-brand-muted font-bold uppercase tracking-[0.2em] text-[10px]">{t.myOrdersEmpty}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <div
              key={order.id}
              className="bg-white rounded-[2rem] border border-brand-beige overflow-hidden shadow-sm hover:shadow-md transition-all"
            >
              {/* Clickable row header */}
              <button
                onClick={() => toggleExpand(order)}
                className="w-full p-5 md:p-6 flex items-center justify-between gap-4 text-left hover:bg-brand-cream/30 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg md:text-xl font-black text-brand-brown font-sans tracking-tighter">
                    #{order.order_code}
                  </span>
                  <span className={cn(
                    'text-[10px] font-black uppercase px-3 py-1 rounded-full border',
                    statusStyle(order.status)
                  )}>
                    {t[`status${order.status.charAt(0).toUpperCase() + order.status.slice(1)}` as keyof typeof t] || order.status}
                  </span>
                  {order.is_paid && (
                    <span className="bg-blue-50 text-blue-700 text-[10px] font-black uppercase px-3 py-1 rounded-full border border-blue-200">
                      {t.paid}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="font-black text-brand-brown">{formatCurrency(order.total_price)}</p>
                    <p className="text-[10px] text-brand-muted font-mono mt-0.5">
                      {new Date(order.created_at).toLocaleString(
                        lang === 'EN' ? 'en-US' : 'vi-VN',
                        { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' }
                      )}
                    </p>
                  </div>
                  {expanding[order.id] ? (
                    <div className="w-5 h-5 border-2 border-brand-muted/30 border-t-brand-brown rounded-full animate-spin shrink-0" />
                  ) : expanded[order.id] !== undefined ? (
                    <ChevronUp className="w-5 h-5 text-brand-muted shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-brand-muted shrink-0" />
                  )}
                </div>
              </button>

              {/* Expanded details */}
              <AnimatePresence>
                {expanded[order.id] !== undefined && (
                  <motion.div
                    key="details"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-brand-beige p-5 md:p-6 space-y-6">

                      {/* Order info grid */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-brand-muted mb-1">{t.address}</p>
                          <p className="font-bold text-brand-ink">{order.address}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black uppercase tracking-widest text-brand-muted mb-1">{t.paymentMethod}</p>
                          <p className="font-bold text-brand-ink">
                            {order.payment_method === 'cash' ? t.cash : t.transfer}
                            {' · '}
                            <span className={cn(order.is_paid ? 'text-green-600' : 'text-amber-600')}>
                              {order.is_paid ? t.paid : t.unpaid}
                            </span>
                          </p>
                        </div>
                        {order.note && (
                          <div className="col-span-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-brand-muted mb-1">{t.noteLabel}</p>
                            <p className="italic font-serif text-brand-muted text-sm">{order.note}</p>
                          </div>
                        )}
                      </div>

                      {/* Items */}
                      {expanded[order.id]!.items.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-brand-muted">{t.orderItemsTitle}</p>
                          <div className="bg-brand-cream rounded-2xl p-4 space-y-2">
                            {expanded[order.id]!.items.map(item => (
                              <div key={item.id} className="flex justify-between items-center">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="font-bold text-brand-ink">
                                    {lang === 'EN' ? item.product_name_en || item.product_name : item.product_name}
                                  </span>
                                  <span className="text-brand-muted font-medium">×{item.quantity}</span>
                                </div>
                                <span className="font-black text-brand-brown text-sm">{formatCurrency(item.price * item.quantity)}</span>
                              </div>
                            ))}
                            <div className="border-t border-brand-beige pt-2 flex justify-between items-baseline">
                              <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">{t.total}</span>
                              <span className="font-black text-brand-brown">{formatCurrency(order.total_price)}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Timeline logs */}
                      {expanded[order.id]!.logs.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-brand-muted">{t.orderHistory}</p>
                          <div className="relative pl-6 border-l-2 border-brand-caramel/30 space-y-4">
                            {expanded[order.id]!.logs.map(log => (
                              <div key={log.id} className="relative space-y-0.5">
                                <div className={cn(
                                  'absolute -left-[29px] top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm',
                                  log.action_type === 'create' ? 'bg-green-500' :
                                  log.action_type === 'update_status' ? 'bg-brand-caramel' : 'bg-brand-muted'
                                )} />
                                <p className="text-xs font-bold text-brand-ink leading-tight">{log.description}</p>
                                <p className="text-[10px] text-brand-muted font-mono">
                                  {new Date(log.created_at).toLocaleString(
                                    lang === 'EN' ? 'en-US' : 'vi-VN',
                                    { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }
                                  )}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {expanded[order.id]!.logs.length === 0 && expanded[order.id]!.items.length === 0 && (
                        <p className="text-xs text-brand-muted italic">{t.historyEmpty}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default TrackOrder;
