import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Minus, Plus, Trash2, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { useApp } from '../context/AppContext';

const CartPage = () => {
  const { t, cart, lang } = useApp();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-4xl mx-auto flex flex-col lg:flex-row gap-10"
    >
      <div className="flex-1 space-y-8">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl md:text-4xl font-serif text-brand-ink">{t.cartTitle}</h2>
          <span className="text-xs text-brand-muted uppercase tracking-[0.2em] font-bold">
            {t.cartItemsCount.replace('{count}', String(cart.items.length))}
          </span>
        </div>

        {cart.items.length === 0 ? (
          <div className="bg-white rounded-[2.5rem] p-12 text-center border border-brand-beige space-y-6">
            <div className="bg-brand-cream w-20 h-20 rounded-full flex items-center justify-center mx-auto text-3xl">
              🛒
            </div>
            <p className="text-xl font-serif italic text-brand-muted">{t.emptyCart}</p>
            <Link to="/" className="inline-flex items-center gap-2 bg-brand-brown text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] transition-all">
              {t.menu} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] overflow-hidden border border-brand-beige shadow-sm">
            {cart.items.map((item) => (
              <div key={item.id} className="p-4 md:p-6 flex flex-wrap sm:flex-nowrap items-center gap-4 md:gap-5 border-b border-brand-beige last:border-0 hover:bg-brand-cream/30 transition-colors">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-brand-cream rounded-2xl flex items-center justify-center text-2xl md:text-3xl shrink-0 relative overflow-hidden group">
                  <span className="group-hover:scale-110 transition-transform absolute inset-0 flex items-center justify-center z-0">{item.emoji || '☕'}</span>
                  {item.image_url && (
                    <img 
                      src={item.image_url} 
                      alt={lang === 'EN' ? item.name_en || item.name : item.name} 
                      className="w-full h-full object-cover rounded-2xl absolute inset-0 z-10 bg-brand-cream" 
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                </div>
                <div className="grow">
                  <h3 className="font-bold text-brand-ink uppercase tracking-tight text-lg leading-tight">
                    {lang === 'EN' ? item.name_en || item.name : item.name}
                  </h3>
                  <p className="text-brand-brown font-black font-sans">{formatCurrency(item.price)}</p>
                </div>
                <div className="flex items-center gap-3 md:gap-4 bg-brand-beige/30 p-1.5 rounded-xl border border-brand-beige ml-auto sm:ml-0">
                  <button
                    onClick={() => cart.updateQuantity(item.id, item.quantity - 1)}
                    className="p-1 hover:text-brand-brown transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-black w-6 text-center text-sm">{item.quantity}</span>
                  <button
                    onClick={() => cart.updateQuantity(item.id, item.quantity + 1)}
                    className="p-1 hover:text-brand-brown transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => cart.removeFromCart(item.id)}
                  className="p-2 text-brand-muted hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5 stroke-[1.5]" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {cart.items.length > 0 && (
        <aside className="w-full lg:w-96 space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-brand-beige p-8 shadow-xl flex flex-col h-fit sticky top-32">
            <h3 className="font-serif text-2xl font-bold mb-8 text-brand-ink">{t.cartSummary}</h3>

            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center text-sm">
                <span className="text-brand-muted font-medium">{t.cartSubtotal}</span>
                <span className="font-black text-brand-ink">{formatCurrency(cart.total)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-brand-muted font-medium">{t.cartShipping}</span>
                <span className="font-black text-green-600 uppercase tracking-widest text-[10px]">{t.shippingFree}</span>
              </div>
              <div className="h-px bg-brand-beige my-4"></div>
              <div className="flex justify-between items-baseline">
                <span className="text-brand-muted uppercase font-black text-xs tracking-widest">{t.total}</span>
                <span className="text-3xl font-serif font-black text-brand-brown">{formatCurrency(cart.total)}</span>
              </div>
            </div>

            <div className="bg-brand-cream p-4 rounded-2xl mb-8 border border-brand-beige">
              <p className="text-[10px] text-brand-muted uppercase font-black tracking-widest mb-2">{t.cartFreeShipping}</p>
              <p className="text-xs text-brand-ink leading-relaxed">{t.cartFreeShippingDesc}</p>
            </div>

            <button
              onClick={() => navigate('/checkout')}
              disabled={cart.total <= 0}
              className="w-full py-5 bg-brand-brown text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-lg shadow-brand-brown/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {t.cartCheckoutButton} • {formatCurrency(cart.total)}
            </button>
          </div>
        </aside>
      )}
    </motion.div>
  );
};

export default CartPage;
