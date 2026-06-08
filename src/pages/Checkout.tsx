import React, { useState, useRef, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle } from 'lucide-react';
import { cn, formatCurrency, normalizePhone } from '../lib/utils';
import { useApp } from '../context/AppContext';
import { supabase, withTimeout } from '../lib/supabase';

// Kiểm tra đồng bộ xem có Supabase token trong localStorage không (không cần await)
const hasStoredSession = () =>
  Object.keys(localStorage).some(
    (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
  );

const getBankName = (bin: string) => {
  const binMap: Record<string, string> = {
    '970418': 'BIDV',
    '970422': 'MB Bank',
    '970415': 'VietinBank',
    '970436': 'Vietcombank',
    '970405': 'Agribank',
    '970407': 'Techcombank',
    '970416': 'ACB',
    '970423': 'TPBank',
    '970432': 'VPBank',
    '970403': 'Sacombank',
    '970425': 'ABBANK',
    '970437': 'HDBank',
    '970441': 'VIB',
    '970429': 'SCB',
    '970443': 'SHB',
    '970428': 'Nam A Bank',
    '970414': 'OceanBank',
    '970440': 'SeABank',
    '970419': 'NCB',
    '970448': 'OCB',
    '970431': 'Eximbank',
    '970426': 'MSB',
    '970468': 'Cake by VPBank',
    '970466': 'LienVietPostBank',
  };
  return binMap[bin] || `BIN: ${bin}`;
};

const Checkout = () => {
  const { t, cart, lang } = useApp();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState(0);
  const [isPaid, setIsPaid] = useState(false);
  const [showPayOSModal, setShowPayOSModal] = useState(false);
  const [activePayOSData, setActivePayOSData] = useState<any>(null);
  const payosInstanceRef = React.useRef<any>(null);

  const handleClosePayOS = () => {
    if (payosInstanceRef.current) {
      try {
        payosInstanceRef.current.exit();
      } catch (e) {
        console.error('Error exiting payos:', e);
      }
    }
    setShowPayOSModal(false);
    setLoading(false);
  };
  const formRef = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    note: '',
    paymentMethod: 'cash' as 'cash' | 'transfer',
  });
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // authLoading chỉ true nếu có token trong localStorage (tức là có thể có session)
  // Nếu khách chưa đăng nhập thì không cần chờ — false ngay lập tức.
  const [authLoading, setAuthLoading] = useState(() => hasStoredSession());

  React.useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately — no need for separate getSession call
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        const cached = sessionStorage.getItem('is_admin');
        if (cached !== null) {
          setIsAdmin(cached === 'true');
        } else {
          try {
            const { data } = await withTimeout(
              (supabase as any).rpc('check_is_admin'),
              10000
            ) as any;
            setIsAdmin(!!data);
            sessionStorage.setItem('is_admin', String(!!data));
          } catch (e) {
            console.error('Error checking admin status in Checkout:', e);
            setIsAdmin(false);
          }
        }
      } else {
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Không cần handleGoogleSignIn tại đây — việc đăng nhập được xử lý tại /login

  // Đang chờ xác nhận session (chỉ với user đã có token)
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <div className="w-8 h-8 border-4 border-brand-beige border-t-brand-brown rounded-full animate-spin" />
      </div>
    );
  }

  // Chưa đăng nhập → chuyển về trang login, truyền đích /checkout để redirect lại sau khi login
  if (!session) {
    return <Navigate to="/login" state={{ from: '/checkout' }} replace />;
  }

  // Giỏ hàng trống
  if (cart.items.filter(item => item.quantity > 0).length === 0 && !successCode) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validate họ và tên (chỉ cho phép chữ cái và khoảng trắng, tối thiểu 2 ký tự)
    const trimmedName = formData.name.trim();
    const nameRegex = /^[\p{L}\s']{2,50}$/u;
    if (!nameRegex.test(trimmedName)) {
      setErrorMsg(t.invalidName);
      return;
    }

    // FIX #6: validate số điện thoại VN (10 số, bắt đầu bằng 0)
    const normalizedPhone = normalizePhone(formData.phone);
    if (!/^0\d{9}$/.test(normalizedPhone)) {
      setErrorMsg(t.invalidPhone);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await withTimeout(
        (supabase as any).rpc('create_order_with_items', {
          p_customer_name: formData.name.trim(),
          p_customer_phone: normalizedPhone,
          p_address: formData.address.trim(),
          p_note: formData.note.trim(),
          p_payment_method: formData.paymentMethod,
          p_customer_email: session?.user?.email || '',
          p_items: cart.items.filter(item => item.quantity > 0).map(item => ({ id: item.id, quantity: item.quantity })),
        }),
        30000
      ) as any;

      if (error) throw error;


      const orderCodeText = data as string;
      const orderTotalAmount = cart.total;

      if (formData.paymentMethod === 'transfer') {
        try {
          // Call serverless API to create PayOS payment link
          const response = await fetch('/api/payos-create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              orderCodeText,
              totalPrice: orderTotalAmount,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to create PayOS link');
          }

          const payosResult = await response.json();
          if (payosResult && payosResult.checkoutUrl) {
            setActivePayOSData(payosResult);
            setShowPayOSModal(true);
            
            setTimeout(() => {
              try {
                const payos = (window as any).PayOSCheckout.usePayOS({
                  RETURN_URL: `${window.location.origin}/track`,
                  ELEMENT_ID: 'payos-checkout-container',
                  CHECKOUT_URL: payosResult.checkoutUrl,
                  embedded: true,
                  onSuccess: () => {
                    setShowPayOSModal(false);
                    setIsPaid(true);
                    setOrderTotal(orderTotalAmount);
                    cart.clearCart();
                    setSuccessCode(orderCodeText);
                  },
                  onCancel: () => {
                    setShowPayOSModal(false);
                    setErrorMsg(lang === 'EN' ? 'Payment cancelled.' : 'Thanh toán đã bị hủy.');
                    setLoading(false);
                  },
                  onExit: () => {
                    setShowPayOSModal(false);
                    setLoading(false);
                  }
                });
                payosInstanceRef.current = payos;
                payos.open();
              } catch (err: any) {
                console.error('[PayOS Init Error]:', err);
                setShowPayOSModal(false);
                cart.clearCart();
                setOrderTotal(orderTotalAmount);
                setSuccessCode(orderCodeText);
              }
            }, 100);
            return;
          } else {
            throw new Error('Invalid response data from PayOS API');
          }
        } catch (payosErr) {
          console.error('[Checkout PayOS Error]:', payosErr);
          // Fallback to manual QR display if PayOS integration fails
          cart.clearCart();
          setOrderTotal(orderTotalAmount);
          setSuccessCode(orderCodeText);
        }
      } else {
        // Cash order: Show standard checkout success screen
        cart.clearCart();
        setOrderTotal(orderTotalAmount);
        setSuccessCode(orderCodeText);
      }
    } catch (err: any) {
      console.error('Order creation error:', err);
      const msg = err?.message || (err instanceof Error ? err.message : null) || t.orderFailed;
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  if (successCode) {
    return (
      <>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md mx-auto text-center space-y-8 pt-12"
        >
          <div className="bg-green-100 text-green-600 w-24 h-24 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle className="w-12 h-12" />
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl md:text-4xl font-serif text-brand-ink">{t.orderSuccess}</h2>
            <div className="bg-brand-cream px-8 py-6 rounded-[2rem] inline-block border-2 border-dashed border-brand-beige">
              <p className="text-brand-muted uppercase font-black text-[10px] tracking-[0.2em] mb-2">{t.orderCode}</p>
              <p className="text-3xl font-black text-brand-brown font-sans">#{successCode}</p>
            </div>
          </div>

          {formData.paymentMethod === 'transfer' && !isPaid && (
            <div className="space-y-6 py-4 animate-in fade-in zoom-in duration-500 font-sans">
              <p className="text-brand-ink font-bold">
                {t.scanToPay}
              </p>
              <div className="bg-white p-4 rounded-3xl inline-block border-2 border-brand-caramel shadow-lg shadow-brand-caramel/20">
                <img
                  src={`https://img.vietqr.io/image/${import.meta.env.VITE_BANK_ID || 'BIDV'}-${import.meta.env.VITE_BANK_ACCOUNT || '8843962433'}-compact.png?amount=${orderTotal}&addInfo=${successCode}&accountName=${encodeURIComponent(import.meta.env.VITE_BANK_ACCOUNT_NAME || 'VU DUC ANH')}`}
                  alt="VietQR Code"
                  className="w-48 h-48 md:w-56 md:h-56 object-cover rounded-2xl mx-auto"
                />
              </div>
              
              <div className="bg-brand-cream border border-brand-beige rounded-2xl p-4 max-w-sm mx-auto space-y-3 text-left font-sans text-xs">
                <p className="text-center font-bold text-brand-muted uppercase text-[10px] tracking-wider mb-1">
                  {lang === 'EN' ? 'Manual Transfer Details' : 'Thông tin chuyển khoản thủ công'}
                </p>
                
                <div className="flex justify-between items-center">
                  <span className="text-brand-muted font-bold">{lang === 'EN' ? 'Bank Name:' : 'Ngân hàng:'}</span>
                  <span className="font-bold text-brand-ink">{import.meta.env.VITE_BANK_ID || 'BIDV'}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-brand-muted font-bold">{lang === 'EN' ? 'Account No:' : 'Số tài khoản:'}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-brand-brown tracking-wider">{import.meta.env.VITE_BANK_ACCOUNT || '8843962433'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(import.meta.env.VITE_BANK_ACCOUNT || '8843962433');
                        alert(lang === 'EN' ? 'Account number copied!' : 'Đã sao chép số tài khoản!');
                      }}
                      className="px-2 py-1 bg-brand-beige/50 text-brand-brown rounded hover:bg-brand-beige transition-colors text-[10px] font-bold"
                    >
                      {lang === 'EN' ? 'Copy' : 'Sao chép'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-brand-muted font-bold">{lang === 'EN' ? 'Account Holder:' : 'Chủ tài khoản:'}</span>
                  <span className="font-bold text-brand-ink uppercase">{import.meta.env.VITE_BANK_ACCOUNT_NAME || 'VU DUC ANH'}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-brand-muted font-bold">{lang === 'EN' ? 'Amount:' : 'Số tiền:'}</span>
                  <span className="font-black text-green-600">{formatCurrency(orderTotal)}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-brand-muted font-bold">{lang === 'EN' ? 'Message:' : 'Nội dung chuyển khoản:'}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-brand-brown">{successCode}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(successCode);
                        alert(lang === 'EN' ? 'Message copied!' : 'Đã sao chép nội dung chuyển khoản!');
                      }}
                      className="px-2 py-1 bg-brand-beige/50 text-brand-brown rounded hover:bg-brand-beige transition-colors text-[10px] font-bold"
                    >
                      {lang === 'EN' ? 'Copy' : 'Sao chép'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isPaid && (
            <div className="bg-blue-50 text-blue-700 p-4 rounded-2xl text-xs font-bold border border-blue-100 max-w-sm mx-auto">
              🎉 {lang === 'EN' ? 'Payment processed successfully via PayOS!' : 'Đã thanh toán thành công qua cổng PayOS!'}
            </div>
          )}

          <p className="text-brand-muted font-medium italic font-serif text-sm">
            {isPaid
              ? (lang === 'EN' ? 'Your payment was completed. We are preparing your order!' : 'Đơn hàng đã được thanh toán. Chúng tôi đang chuẩn bị đồ uống cho bạn!')
              : (formData.paymentMethod === 'cash' ? t.cashInstructions : t.transferInstructions)}
          </p>
          <Link to="/" className="inline-flex items-center gap-2 bg-brand-brown text-white px-10 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:scale-105 transition-all shadow-xl shadow-brand-brown/20">
            {t.backToHome}
          </Link>
        </motion.div>
        <div id="payos-checkout-container"></div>
      </>
    );
  }



  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-16"
      >
      <div className="flex-1 space-y-10">
        <h2 className="text-3xl md:text-4xl font-serif text-brand-ink">{t.checkoutTitle}</h2>

        {errorMsg && (
          <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-bold border border-red-100">
            {errorMsg}
          </div>
        )}

        {isAdmin ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 p-8 rounded-[2rem] space-y-4">
            <h3 className="text-lg font-bold font-serif">
              {lang === 'EN' ? 'Admin Account Restricted' : 'Tài khoản Admin bị giới hạn'}
            </h3>
            <p className="text-sm leading-relaxed">
              {lang === 'EN'
                ? 'Admin accounts cannot place orders to prevent data conflict. Please sign out and use a customer account to order.'
                : 'Tài khoản Admin không được phép đặt hàng để tránh xung đột dữ liệu hệ thống. Vui lòng đăng xuất hoặc sử dụng tài khoản khách hàng thông thường.'}
            </p>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-black text-brand-muted tracking-[0.2em] ml-2">{t.emailLabel}</label>
              <input
                disabled
                className="w-full bg-[#FAF9F5] border border-brand-beige rounded-2xl px-6 py-4 outline-none font-medium text-brand-muted cursor-not-allowed opacity-80"
                value={session?.user?.email || ''}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-brand-muted tracking-[0.2em] ml-2">{t.name}</label>
                <input
                  required
                  className="w-full bg-white border border-brand-beige rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-caramel outline-none font-medium text-brand-ink transition-all"
                  placeholder={lang === 'EN' ? "Ex: John Doe" : "Ex: Nguyễn Văn A"}
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-brand-muted tracking-[0.2em] ml-2">{t.phone}</label>
                <input
                  required
                  type="tel"
                  minLength={10}
                  maxLength={11}
                  className="w-full bg-white border border-brand-beige rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-caramel outline-none font-medium text-brand-ink transition-all"
                  placeholder="Ex: 0912345678"
                  value={formData.phone}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
                    setFormData({ ...formData, phone: val });
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-black text-brand-muted tracking-[0.2em] ml-2">{t.address}</label>
              <input
                required
                className="w-full bg-white border border-brand-beige rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-caramel outline-none font-medium text-brand-ink transition-all"
                placeholder={lang === 'EN' ? "Ex: Room 502, Building A1, Dept of IT" : "Ex: Phòng 502, Tòa A1, Khoa CNTT"}
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-black text-brand-muted tracking-[0.2em] ml-2">{t.note}</label>
              <textarea
                className="w-full bg-white border border-brand-beige rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-caramel outline-none font-medium text-brand-ink transition-all"
                rows={3}
                placeholder={lang === 'EN' ? "Ex: No ice, deliver before 10 AM..." : "Ex: Không lấy đá, ship trước 10h..."}
                value={formData.note}
                onChange={e => setFormData({ ...formData, note: e.target.value })}
              />
            </div>

            <div className="space-y-4">
              <label className="text-[10px] uppercase font-black text-brand-muted tracking-[0.2em] ml-2">{t.paymentMethod}</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, paymentMethod: 'cash' })}
                  className={cn(
                    "py-4 rounded-2xl border-2 font-black uppercase tracking-widest text-[10px] transition-all",
                    formData.paymentMethod === 'cash' ? "bg-brand-brown border-brand-brown text-white shadow-md" : "bg-white border-brand-beige text-brand-muted hover:border-brand-brown hover:text-brand-brown"
                  )}
                >
                  {t.cash}
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, paymentMethod: 'transfer' })}
                  className={cn(
                    "py-4 rounded-2xl border-2 font-black uppercase tracking-widest text-[10px] transition-all",
                    formData.paymentMethod === 'transfer' ? "bg-brand-brown border-brand-brown text-white shadow-md" : "bg-white border-brand-beige text-brand-muted hover:border-brand-brown hover:text-brand-brown"
                  )}
                >
                  {t.transfer}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      <aside className="w-full lg:w-96">
        <div className="bg-white rounded-[2.5rem] border border-brand-beige p-8 shadow-xl sticky top-32 space-y-8">
          <h3 className="font-serif text-2xl font-bold text-brand-ink">{t.confirmTitle}</h3>

          <div className="space-y-4">
            {cart.items.filter(item => item.quantity > 0).map(item => (
              <div key={item.id} className="flex justify-between items-center text-brand-ink">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-cream rounded-xl flex items-center justify-center text-xl shrink-0 relative overflow-hidden">
                    <span className="absolute inset-0 flex items-center justify-center z-0">{item.emoji || '☕'}</span>
                    {item.image_url && (
                      <img 
                        src={item.image_url} 
                        alt={lang === 'EN' ? item.name_en || item.name : item.name} 
                        className="w-full h-full object-cover rounded-xl absolute inset-0 z-10 bg-brand-cream" 
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                  <div>
                    <p className="font-bold uppercase tracking-tight text-xs leading-none mb-1">
                      {lang === 'EN' ? item.name_en || item.name : item.name}
                    </p>
                    <p className="text-[10px] text-brand-muted font-bold">x{item.quantity}</p>
                  </div>
                </div>
                <span className="font-black text-sm">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="bg-brand-cream p-5 rounded-2xl space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-brand-muted font-bold uppercase tracking-widest">{t.subtotal}</span>
              <span className="font-black text-brand-ink">{formatCurrency(cart.total)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-brand-muted font-bold uppercase tracking-widest">{t.cartShipping}</span>
              <span className="font-black text-green-600">{formatCurrency(0)}</span>
            </div>
            <div className="h-px bg-brand-beige my-2" />
            <div className="flex justify-between items-baseline">
              <span className="text-[10px] text-brand-muted font-black uppercase tracking-widest leading-none">{t.total}</span>
              <span className="text-2xl font-serif font-black text-brand-brown">{formatCurrency(cart.total)}</span>
            </div>
          </div>

          <button
            onClick={() => formRef.current?.requestSubmit()}
            disabled={loading || isAdmin}
            className="w-full py-5 bg-brand-brown text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-lg shadow-brand-brown/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : t.placeOrder}
          </button>
        </div>
      </aside>
      </motion.div>
      {showPayOSModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-6 relative shadow-2xl border border-brand-beige flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200">
            <button
              onClick={handleClosePayOS}
              className="absolute top-6 right-6 text-brand-muted hover:text-brand-ink transition-colors font-bold uppercase text-[10px] tracking-wider font-sans z-10"
            >
              {lang === 'EN' ? 'Close' : 'Đóng'}
            </button>
            <h3 className="font-serif text-2xl font-black text-brand-ink mb-4 text-center">
              {lang === 'EN' ? 'Online Payment' : 'Thanh toán trực tuyến'}
            </h3>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div id="payos-checkout-container" className="w-full h-[340px] rounded-2xl overflow-hidden"></div>
              
              {activePayOSData && (
                <div className="bg-brand-cream border border-brand-beige rounded-2xl p-4 space-y-3 text-left font-sans text-xs animate-in fade-in duration-300">
                  <p className="text-center font-bold text-brand-muted uppercase text-[10px] tracking-wider mb-1">
                    {lang === 'EN' ? 'Manual Transfer Backup' : 'Thông tin chuyển khoản thủ công'}
                  </p>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-brand-muted font-bold">{lang === 'EN' ? 'Bank Name:' : 'Ngân hàng:'}</span>
                    <span className="font-bold text-brand-ink">{getBankName(activePayOSData.bin)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-brand-muted font-bold">{lang === 'EN' ? 'Account No:' : 'Số tài khoản:'}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-brand-brown tracking-wider">{activePayOSData.accountNumber}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(activePayOSData.accountNumber);
                          alert(lang === 'EN' ? 'Account number copied!' : 'Đã sao chép số tài khoản!');
                        }}
                        className="px-2 py-1 bg-brand-beige/50 text-brand-brown rounded hover:bg-brand-beige transition-colors text-[10px] font-bold"
                      >
                        {lang === 'EN' ? 'Copy' : 'Sao chép'}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-brand-muted font-bold">{lang === 'EN' ? 'Account Holder:' : 'Chủ tài khoản:'}</span>
                    <span className="font-bold text-brand-ink uppercase">{activePayOSData.accountName}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-brand-muted font-bold">{lang === 'EN' ? 'Amount:' : 'Số tiền:'}</span>
                    <span className="font-black text-green-600">{formatCurrency(activePayOSData.amount)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-brand-muted font-bold">{lang === 'EN' ? 'Message:' : 'Nội dung chuyển khoản:'}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-brand-brown">{activePayOSData.description}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(activePayOSData.description);
                          alert(lang === 'EN' ? 'Message copied!' : 'Đã sao chép nội dung chuyển khoản!');
                        }}
                        className="px-2 py-1 bg-brand-beige/50 text-brand-brown rounded hover:bg-brand-beige transition-colors text-[10px] font-bold"
                      >
                        {lang === 'EN' ? 'Copy' : 'Sao chép'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Checkout;
