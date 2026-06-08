import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Plus, CheckCircle } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useApp } from '../context/AppContext';
import type { Product } from '../types';

interface ProductCardProps {
  product: Product;
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { lang, t, cart } = useApp();
  const [isAdded, setIsAdded] = useState(false);

  // FIX #7: lắng nghe maxReachedId từ cart để hiện feedback
  const isAtMax = cart.maxReachedId === product.id;

  useEffect(() => {
    if (!isAdded) return;
    const timeout = setTimeout(() => setIsAdded(false), 1500);
    return () => clearTimeout(timeout);
  }, [isAdded]);

  const handleAdd = () => {
    // Đọc số lượng hiện tại trước khi gọi cập nhật bất đồng bộ
    const currentQty = cart.items.find(i => i.id === product.id)?.quantity ?? 0;
    
    // Gọi hàm thêm vào giỏ hàng
    cart.addToCart(product);
    
    // Chỉ kích hoạt trạng thái "Đã thêm" nếu chưa đạt tối đa số lượng
    if (currentQty < cart.MAX_QUANTITY) {
      setIsAdded(true);
    }
  };

  const name = useMemo(() => {
    return lang === 'EN' ? product.name_en || product.name : product.name;
  }, [lang, product.name, product.name_en]);

  const desc = useMemo(() => {
    return lang === 'EN' ? product.description_en || product.description : product.description;
  }, [lang, product.description, product.description_en]);

  const limitText = useMemo(() => {
    return t.maxLimitReached.replace('{qty}', String(cart.MAX_QUANTITY));
  }, [t.maxLimitReached, cart.MAX_QUANTITY]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group bg-white p-3 md:p-4 rounded-[1.5rem] shadow-sm border border-brand-beige/50 hover:shadow-md transition-all flex items-center gap-3 md:gap-4 relative"
    >
      <div className={cn(
        "w-20 h-20 md:w-24 md:h-24 bg-[#F8F7F4] rounded-2xl flex items-center justify-center text-2xl md:text-3xl shrink-0 relative overflow-hidden transition-all duration-300",
        !product.is_available && "opacity-40 grayscale"
      )}>
        {/* Fallback Emoji */}
        <span className="absolute inset-0 flex items-center justify-center z-0">
          {product.emoji || '☕'}
        </span>
        {product.image_url && (
          <img 
            src={product.image_url} 
            alt={name} 
            className="w-full h-full object-cover rounded-2xl absolute inset-0 z-10 bg-[#F8F7F4]" 
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
      </div>

      <div className={cn(
        "flex flex-col justify-between py-1 grow transition-all duration-300",
        !product.is_available && "opacity-40"
      )}>
        <div className="flex justify-between items-start">
          <h3 className="font-serif italic font-extrabold text-[#2D1B14] text-lg md:text-xl leading-tight">{name}</h3>
          <span className="text-[#2D1B14] font-bold text-sm">
            {formatCurrency(product.price)}
          </span>
        </div>

        <p className="text-xs text-brand-muted font-serif italic line-clamp-2 pr-8 leading-relaxed mt-1">
          {desc}
        </p>

        {/* FIX #7: thông báo đạt giới hạn tối đa */}
        {isAtMax && (
          <p className="text-[10px] text-amber-600 font-black uppercase tracking-wider mt-1">
            {limitText}
          </p>
        )}
      </div>

      <button
        onClick={handleAdd}
        disabled={!product.is_available}
        aria-label={isAdded ? (lang === 'EN' ? "Added to cart" : "Đã thêm vào giỏ") : t.addToCart}
        className={cn(
          "absolute bottom-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300",
          !product.is_available
            ? "opacity-30 cursor-not-allowed"
            : isAtMax
              ? "bg-amber-100 text-amber-600"
              : isAdded
                ? "bg-green-500 text-white"
                : "bg-brand-beige/50 text-brand-brown hover:bg-brand-brown hover:text-white"
        )}
      >
        {isAdded ? <CheckCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      </button>

      {!product.is_available && (
        <div className="absolute inset-0 bg-white/10 rounded-[1.5rem] flex items-center justify-center z-20 pointer-events-none">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-cream bg-brand-brown/95 px-3 py-1.5 rounded-full shadow-md border border-brand-beige/20">
            {t.unavailable}
          </span>
        </div>
      )}
    </motion.div>
  );
};

export default React.memo(ProductCard);
