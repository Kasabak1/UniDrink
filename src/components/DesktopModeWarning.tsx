import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Smartphone } from 'lucide-react';

const DesktopModeWarning: React.FC = () => {
  const { lang } = useApp();
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    const checkMode = () => {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isPortrait = window.innerHeight > window.innerWidth;
      const isDesktopViewport = window.innerWidth >= 980;

      if (isTouch && isPortrait && isDesktopViewport) {
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    };

    // Run checks on mount
    checkMode();

    // Listen for resize/orientation changes
    window.addEventListener('resize', checkMode);
    return () => window.removeEventListener('resize', checkMode);
  }, []);

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-[3px] z-[99999] flex items-center justify-center p-4 select-none animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] p-8 md:p-10 max-w-sm w-full border border-brand-beige shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-300">
        <div className="w-16 h-16 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
          <Smartphone className="w-8 h-8 stroke-[1.5]" />
        </div>
        
        <div className="space-y-2">
          <h3 className="text-xl font-serif font-black text-brand-ink">
            {lang === 'EN' ? 'Optimize Mobile View' : 'Giao Diện Di Động'}
          </h3>
          <p className="text-xs text-brand-muted font-bold uppercase tracking-widest">
            {lang === 'EN' ? 'Recommended' : 'Gợi ý từ UniDrink'}
          </p>
        </div>

        <p className="text-sm text-brand-ink font-medium leading-relaxed font-sans px-2">
          {lang === 'EN'
            ? 'Mobile Desktop Site is currently enabled. Please disable it in browser settings (3-dot menu) to switch back to the beautiful mobile layout!'
            : 'Điện thoại của bạn đang bật "Trang web cho máy tính". Hãy tắt chế độ này trong menu trình duyệt (biểu tượng 3 chấm) để quay lại giao diện di động chuẩn đẹp và dễ dùng nhất nhé!'}
        </p>

        <button
          onClick={() => setShowWarning(false)}
          className="w-full bg-brand-brown text-white py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-brand-brown/20 cursor-pointer border-none outline-none"
        >
          {lang === 'EN' ? 'I Understand' : 'Tôi đã hiểu'}
        </button>
      </div>
    </div>
  );
};

export default DesktopModeWarning;
