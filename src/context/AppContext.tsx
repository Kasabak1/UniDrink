import { createContext, useContext } from 'react';
import { translations } from '../translations';
import { useCart } from '../hooks/useCart';
import type { Language, Product, Category } from '../types';

export interface AppContextType {
  lang: Language;
  setLang: (l: Language) => void;
  t: typeof translations.VI;
  cart: ReturnType<typeof useCart>;
  products: Product[];
  setProducts: (products: Product[]) => void;
  productsLoaded: boolean;
  setProductsLoaded: (loaded: boolean) => void;
  categories: Category[];
  setCategories: (categories: Category[]) => void;
}

export const AppContext = createContext<AppContextType | null>(null);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
