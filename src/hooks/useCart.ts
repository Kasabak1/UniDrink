import { useState, useEffect, useMemo } from 'react';
import type { Product } from '../types';

export interface CartItem extends Product {
  quantity: number;
}

const MAX_QUANTITY = 10;

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('unicafe_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // FIX #7: track xem item nào đang ở max để báo user
  const [maxReachedId, setMaxReachedId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('unicafe_cart', JSON.stringify(items));
  }, [items]);

  // FIX #7: tự clear cảnh báo sau 2s
  useEffect(() => {
    if (!maxReachedId) return;
    const t = setTimeout(() => setMaxReachedId(null), 2000);
    return () => clearTimeout(t);
  }, [maxReachedId]);

  const addToCart = (product: Product) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity >= MAX_QUANTITY) {
          // FIX #7: báo user thay vì im lặng
          setMaxReachedId(product.id);
          return prev;
        }
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity < 0) {
      return;
    }
    if (quantity > MAX_QUANTITY) {
      setMaxReachedId(id);
    }
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity: Math.min(quantity, MAX_QUANTITY) } : item))
    );
  };

  const clearCart = () => setItems([]);

  const total = useMemo(
    () => items.reduce((acc, item) => acc + item.price * item.quantity, 0),
    [items]
  );

  return { items, addToCart, removeFromCart, updateQuantity, clearCart, total, maxReachedId, MAX_QUANTITY };
}
