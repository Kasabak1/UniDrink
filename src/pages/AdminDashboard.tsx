import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';
import { supabase, withTimeout } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import type { Order, Product, OrderLog, Category } from '../types';

const convertDriveUrl = (url: string): string => {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed.includes('drive.google.com')) return trimmed;

  try {
    const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileDMatch && fileDMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${fileDMatch[1]}`;
    }

    const urlObj = new URL(trimmed);
    const id = urlObj.searchParams.get('id');
    if (id) {
      return `https://lh3.googleusercontent.com/d/${id}`;
    }
  } catch (e) {
    const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
    }
  }
  return trimmed;
};

type DayReport = {
  date: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  revenue: number;
  unpaidDoneOrders: number; // FIX #5: theo dõi đơn done chưa thu tiền
  unpaidRevenue: number; // NEW: số tiền chưa thu
  pendingOrders: number;
};

const AdminDashboard = () => {
  const { t, lang, categories, setCategories } = useApp();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'reports' | 'settings'>(() => {
    const saved = localStorage.getItem('unidrink_admin_tab');
    if (saved === 'orders' || saved === 'products' || saved === 'reports' || saved === 'settings') {
      return saved;
    }
    return 'orders';
  });
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, OrderLog[]>>({});
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({});
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [blacklistedEmails, setBlacklistedEmails] = useState<string[]>([]);
  const [blacklistDetails, setBlacklistDetails] = useState<Array<{ email: string, reason?: string, created_at?: string }>>([]);
  const [spamOrderLimit, setSpamOrderLimit] = useState<number>(3);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [newBlockEmail, setNewBlockEmail] = useState('');

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  const fetchOrderLogs = async (orderId: string) => {
    if (expandedLogs[orderId]) {
      setExpandedLogs(prev => {
        const copy = { ...prev };
        delete copy[orderId];
        return copy;
      });
      return;
    }

    setLoadingLogs(prev => ({ ...prev, [orderId]: true }));
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('order_logs')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true }) as unknown as Promise<any>,
        20000
      );

      if (!error && data) {
        setExpandedLogs(prev => ({ ...prev, [orderId]: data as OrderLog[] }));
      }
    } catch (e: any) {
      console.error('[UniDrink] fetchOrderLogs timeout/error:', e?.message || e);
    } finally {
      setLoadingLogs(prev => ({ ...prev, [orderId]: false }));
    }
  };

  // Báo cáo theo ngày — memoized và tự động điền các ngày trống
  const reportsByDate = useMemo(() => {
    const grouped = orders.reduce<Record<string, DayReport>>((acc, order) => {

      const date = format(new Date(order.created_at), 'yyyy-MM-dd');
      if (!acc[date]) {
        acc[date] = { date, totalOrders: 0, completedOrders: 0, cancelledOrders: 0, revenue: 0, unpaidDoneOrders: 0, unpaidRevenue: 0, pendingOrders: 0 };
      }
      acc[date].totalOrders += 1;
      if (order.status === 'done') {
        acc[date].completedOrders += 1;
        if (order.is_paid) {
          acc[date].revenue += order.total_price;
        } else {
          acc[date].unpaidDoneOrders += 1; // FIX #5: đếm đơn done chưa thu tiền
          acc[date].unpaidRevenue += order.total_price; // NEW: cộng dồn tiền chưa thu
        }
      }
      if (order.status === 'cancelled') {
        acc[date].cancelledOrders += 1;
      }
      if (order.status === 'pending' || order.status === 'processing') {
        acc[date].pendingOrders += 1;
      }
      return acc;
    }, {});

    const dates = Object.keys(grouped);
    if (dates.length === 0) return [];

    // Tìm ngày có đơn hàng sớm nhất và ngày muộn nhất (hôm nay)
    const sortedDates = [...dates].sort();
    const minDateStr = sortedDates[0];
    const maxDateStr = format(new Date(), 'yyyy-MM-dd');

    const minDateParts = minDateStr.split('-').map(Number);
    const maxDateParts = maxDateStr.split('-').map(Number);

    // Tạo đối tượng Date ở múi giờ địa phương vào lúc giữa trưa để tránh các vấn đề về DST
    const start = new Date(minDateParts[0], minDateParts[1] - 1, minDateParts[2], 12, 0, 0);
    const end = new Date(maxDateParts[0], maxDateParts[1] - 1, maxDateParts[2], 12, 0, 0);

    const filledReports: DayReport[] = [];
    let current = new Date(start);

    while (current <= end) {
      const dateStr = format(current, 'yyyy-MM-dd');
      if (grouped[dateStr]) {
        filledReports.push(grouped[dateStr]);
      } else {
        filledReports.push({
          date: dateStr,
          totalOrders: 0,
          completedOrders: 0,
          cancelledOrders: 0,
          revenue: 0,
          unpaidDoneOrders: 0,
          unpaidRevenue: 0,
          pendingOrders: 0,
        });
      }
      current.setDate(current.getDate() + 1);
    }

    return filledReports.sort((a, b) => b.date.localeCompare(a.date));
  }, [orders]);

  const handleExportCSV = () => {
    if (reportsByDate.length === 0) return;

    const headers = lang === 'EN'
      ? ['Date', 'Total Orders', 'Completed Orders', 'Cancelled Orders', 'Unpaid Done Orders', 'Unpaid Amount (VND)', 'Pending/Processing Orders', 'Revenue (VND)']
      : ['Ngày', 'Tổng số đơn', 'Số đơn hoàn thành', 'Số đơn đã hủy', 'Đơn done chưa thu tiền', 'Tiền chưa thu (VND)', 'Đơn chưa duyệt / Đang làm', 'Doanh thu (VND)'];

    const rows = reportsByDate.map(r => [
      r.date,
      r.totalOrders,
      r.completedOrders,
      r.cancelledOrders,
      r.unpaidDoneOrders,
      r.unpaidRevenue,
      r.pendingOrders,
      r.revenue
    ]);

    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    link.setAttribute("download", `UniDrink_Revenue_Report_${todayStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Doanh thu hôm nay — memoized
  const todayRevenue = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return orders
      .filter(o => o.status === 'done' && o.is_paid && format(new Date(o.created_at), 'yyyy-MM-dd') === today)
      .reduce((acc, o) => acc + o.total_price, 0);
  }, [orders]);



  useEffect(() => {
    // FIX #2: khai báo channel biến ngoài để cleanup đúng
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const fetchOrders = async () => {
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
        console.error('[UniDrink] Admin fetchOrders timeout/error:', e?.message || e);
      }
    };

    const fetchProducts = async () => {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from('products')
            .select('*')
            .eq('is_deleted', false)
            .order('name') as unknown as Promise<any>,
          25000
        );
        if (!error && data) setProducts(data as Product[]);
      } catch (e: any) {
        console.error('[UniDrink] Admin fetchProducts timeout/error:', e?.message || e);
      } finally {
        setLoading(false);
      }
    };

    const fetchBlacklistedEmails = async () => {
      try {
        const { data, error } = await withTimeout(
          (supabase as any)
            .from('blacklisted_emails')
            .select('*') as unknown as Promise<any>,
          25000
        );
        if (!error && data) {
          setBlacklistedEmails(data.map((item: any) => item.email.toLowerCase()));
          setBlacklistDetails(data);
        }
      } catch (e: any) {
        console.error('[UniDrink] Admin fetchBlacklistedEmails timeout/error:', e?.message || e);
      }
    };

    const fetchSettings = async () => {
      try {
        const { data, error } = await withTimeout(
          (supabase as any)
            .from('settings')
            .select('*') as unknown as Promise<any>,
          25000
        );
        if (!error && data) {
          const limitSetting = data.find((s: any) => s.key === 'spam_order_limit');
          if (limitSetting) {
            setSpamOrderLimit(parseInt(limitSetting.value, 10) || 3);
          }
        }
      } catch (e: any) {
        console.error('[UniDrink] Admin fetchSettings timeout/error:', e?.message || e);
      }
    };

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }

      // Kiểm tra quyền admin qua bảng admins trong DB (SECURITY DEFINER RPC)
      const { data: isAdmin } = await withTimeout(
        (supabase as any).rpc('check_is_admin'),
        20000
      ) as any;
      if (!isAdmin) {
        // Không gọi signOut() để giữ phiên đăng nhập của User thường
        navigate('/login', { state: { notAuthorized: true } });
        return;
      }

      setIsAuthenticated(true);
      await Promise.all([fetchOrders(), fetchProducts(), fetchBlacklistedEmails(), fetchSettings()]);

      // FIX #2: chỉ subscribe realtime SAU KHI xác nhận auth
      channel = supabase
        .channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
        .subscribe();
    };

    checkAuth();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [navigate]);

  // FIX #3: Optimistic update với rollback khi lỗi
  const updateStatus = async (id: string, status: Order['status']) => {
    const previous = orders.find(o => o.id === id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    const { error } = await (supabase as any).from('orders').update({ status }).eq('id', id);
    if (error) {
      if (previous) setOrders(prev => prev.map(o => o.id === id ? previous : o));
      alert(t.updateError + error.message);
    }
  };

  // FIX #3: rollback cho togglePaid
  const togglePaid = async (id: string, is_paid: boolean) => {
    const previous = orders.find(o => o.id === id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, is_paid } : o));
    const { error } = await (supabase as any).from('orders').update({ is_paid }).eq('id', id);
    if (error) {
      if (previous) setOrders(prev => prev.map(o => o.id === id ? previous : o));
      alert(t.updateError + error.message);
    }
  };

  // FIX #3: rollback cho toggleProduct
  const toggleProduct = async (id: string, is_available: boolean) => {
    const previous = products.find(p => p.id === id);
    setProducts(prev => prev.map(p => p.id === id ? { ...p, is_available } : p));
    const { error } = await (supabase as any).from('products').update({ is_available }).eq('id', id);
    if (error) {
      if (previous) setProducts(prev => prev.map(p => p.id === id ? previous : p));
      alert(t.productUpdateError + error.message);
    }
  };



  // Thêm/Xóa email khỏi blacklist (chặn spam)
  const toggleEmailBlacklist = async (email: string) => {
    if (!email) return;
    const cleanEmail = email.toLowerCase().trim();
    const isBlacklisted = blacklistedEmails.includes(cleanEmail);
    const previous = [...blacklistedEmails];
    const previousDetails = [...blacklistDetails];

    // Optimistic Update
    if (isBlacklisted) {
      setBlacklistedEmails(prev => prev.filter(e => e !== cleanEmail));
      setBlacklistDetails(prev => prev.filter(d => d.email.toLowerCase() !== cleanEmail));
    } else {
      setBlacklistedEmails(prev => [...prev, cleanEmail]);
      setBlacklistDetails(prev => [...prev, { email: cleanEmail, reason: 'Spam orders', created_at: new Date().toISOString() }]);
    }

    if (isBlacklisted) {
      const { error } = await (supabase as any)
        .from('blacklisted_emails')
        .delete()
        .eq('email', cleanEmail);
      if (error) {
        setBlacklistedEmails(previous);
        setBlacklistDetails(previousDetails);
        alert((lang === 'EN' ? 'Failed to unblock email: ' : 'Lỗi khi bỏ chặn email: ') + error.message);
      }
    } else {
      const { error } = await (supabase as any)
        .from('blacklisted_emails')
        .insert({ email: cleanEmail, reason: 'Spam orders' });
      if (error) {
        setBlacklistedEmails(previous);
        setBlacklistDetails(previousDetails);
        alert((lang === 'EN' ? 'Failed to block email: ' : 'Lỗi khi chặn email: ') + error.message);
      }
    }
  };

  const saveSettings = async (newLimit: number) => {
    if (newLimit < 1) {
      alert(lang === 'EN' ? 'Spam limit must be at least 1!' : 'Giới hạn spam phải tối thiểu là 1!');
      return;
    }
    setSavingSettings(true);
    try {
      const { error } = await (supabase as any)
        .from('settings')
        .upsert({
          key: 'spam_order_limit',
          value: String(newLimit),
          description: 'Số đơn hàng chưa duyệt tối đa trước khi bị tự động khóa email'
        });
      if (error) {
        alert((lang === 'EN' ? 'Failed to save settings: ' : 'Lỗi khi lưu cài đặt: ') + error.message);
      } else {
        alert(lang === 'EN' ? 'Settings saved successfully!' : 'Đã lưu cấu hình hệ thống thành công!');
      }
    } catch (e: any) {
      alert((lang === 'EN' ? 'Error saving settings: ' : 'Lỗi khi lưu cài đặt: ') + e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleManualBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newBlockEmail.toLowerCase().trim();
    if (!cleanEmail) return;
    if (blacklistedEmails.includes(cleanEmail)) {
      alert(lang === 'EN' ? 'This email is already blocked.' : 'Email này đã bị khóa từ trước.');
      return;
    }
    const previous = [...blacklistedEmails];
    const previousDetails = [...blacklistDetails];
    
    // Optimistic Update
    setBlacklistedEmails(prev => [...prev, cleanEmail]);
    setBlacklistDetails(prev => [...prev, { email: cleanEmail, reason: 'Chặn thủ công bởi Admin', created_at: new Date().toISOString() }]);
    
    const { error } = await (supabase as any)
      .from('blacklisted_emails')
      .insert({ email: cleanEmail, reason: 'Chặn thủ công bởi Admin' });
    if (error) {
      setBlacklistedEmails(previous);
      setBlacklistDetails(previousDetails);
      alert((lang === 'EN' ? 'Failed to block email: ' : 'Lỗi khi chặn email: ') + error.message);
    } else {
      setNewBlockEmail('');
      alert(lang === 'EN' ? 'Email blocked successfully!' : 'Đã chặn email thành công!');
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert(lang === 'EN' ? 'Please upload an image file!' : 'Vui lòng chọn tệp hình ảnh!');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert(lang === 'EN' ? 'Image size must be under 5MB!' : 'Dung lượng ảnh phải nhỏ hơn 5MB!');
      return;
    }

    setIsUploadingImage(true);
    setUploadError(null);

    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const cleanFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
      const filePath = `products/${cleanFileName}`;

      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
      const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

      let publicUrl = '';

      if (!supabaseUrl || !supabaseAnonKey) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const mockCategoriesImages: Record<string, string> = {
          coffee: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400&q=80',
          tea: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&q=80',
          teaMilk: 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=400&q=80',
          juice: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&q=80',
          smoothie: 'https://images.unsplash.com/photo-1553530979-7ee52a2670c4?w=400&q=80',
        };
        const cat = editingProduct?.category || 'coffee';
        publicUrl = mockCategoriesImages[cat] || 'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?w=400&q=80';
      } else {
        const { error } = await supabase.storage
          .from('product-images')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (error) {
          throw error;
        }

        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);

        if (!urlData || !urlData.publicUrl) {
          throw new Error('Could not retrieve public URL for the uploaded image.');
        }

        publicUrl = urlData.publicUrl;
      }

      setEditingProduct(prev => prev ? { ...prev, image_url: publicUrl } : null);

      const inputEl = document.querySelector('input[name="image_url"]') as HTMLInputElement;
      if (inputEl) {
        inputEl.value = publicUrl;
      }

    } catch (err: any) {
      console.error('Error uploading image:', err);
      const errMsg = err.message || 'Unknown error';
      setUploadError(errMsg);
      alert((lang === 'EN' ? 'Failed to upload image: ' : 'Lỗi tải ảnh lên: ') + errMsg);
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Cập nhật thông tin sản phẩm (optimistic + rollback)
  const updateProduct = async (fields: Partial<Product>) => {
    if (!editingProduct) return;
    // FIX: capture id trước khi setEditingProduct(null) để tránh stale closure
    const targetProductId = editingProduct.id;
    const previous = products.find(p => p.id === targetProductId);
    setSavingProduct(true);
    setProducts(prev => prev.map(p => p.id === targetProductId ? { ...p, ...fields } : p));
    setEditingProduct(null);

    const { error } = await (supabase as any)
      .from('products')
      .update(fields)
      .eq('id', targetProductId);

    if (error) {
      if (previous) setProducts(prev => prev.map(p => p.id === targetProductId ? previous : p));
      alert(t.productUpdateError + error.message);
    }
    setSavingProduct(false);
  };

  // Thêm sản phẩm mới (optimistic + rollback)
  const addProduct = async (product: Omit<Product, 'id' | 'created_at'>) => {
    setSavingProduct(true);
    
    // Tạo ID thân thiện dựa trên tên sản phẩm dạng slug
    const nameSlug = product.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9]+/g, '-') // Đổi ký tự đặc biệt thành gạch ngang
      .replace(/^-+|-+$/g, ''); // Cắt gạch ngang ở đầu/cuối
    
    const randomId = Math.random().toString(36).substring(2, 6);
    const newId = `${product.category}-${nameSlug || 'drink'}-${randomId}`;
    const newProduct: Product = {
      ...product,
      id: newId,
      created_at: new Date().toISOString(),
    };

    // Optimistic update
    setProducts(prev => [...prev, newProduct]);
    setEditingProduct(null);

    const { error } = await (supabase as any)
      .from('products')
      .insert(newProduct);

    if (error) {
      // Rollback
      setProducts(prev => prev.filter(p => p.id !== newId));
      alert((lang === 'EN' ? 'Failed to add product: ' : 'Lỗi thêm sản phẩm mới: ') + error.message);
    }
    setSavingProduct(false);
  };

  // Xóa sản phẩm (soft-delete: is_deleted = true)
  const deleteProduct = async (id: string) => {
    const productName = products.find(p => p.id === id)?.[lang === 'EN' ? 'name_en' : 'name'] || id;
    const confirmMsg = lang === 'EN'
      ? `Delete product "${productName || id}"? This action cannot be undone.`
      : `Xóa sản phẩm "${productName}"? Hành động này không thể hoàn tác.`;
    if (!window.confirm(confirmMsg)) return;

    const previous = products.find(p => p.id === id);
    setProducts(prev => prev.filter(p => p.id !== id));
    setEditingProduct(null);

    const { error } = await (supabase as any)
      .from('products')
      .update({ is_deleted: true })
      .eq('id', id);

    if (error) {
      if (previous) setProducts(prev => [...prev, previous].sort((a, b) => a.name.localeCompare(b.name)));
      alert((lang === 'EN' ? 'Failed to delete product: ' : 'Lỗi xóa sản phẩm: ') + error.message);
    }
  };

  // Thêm danh mục mới (optimistic + rollback)
  const addCategory = async (newCat: Category) => {
    setSavingCategory(true);
    const cleanId = newCat.id.trim();
    if (categories.some(c => c.id === cleanId)) {
      alert(lang === 'EN' ? 'Category ID already exists!' : 'Mã danh mục đã tồn tại!');
      setSavingCategory(false);
      return;
    }

    // Optimistic update
    setCategories(prev => [...prev, newCat]);

    const { error } = await (supabase as any)
      .from('categories')
      .insert(newCat);

    if (error) {
      // Rollback
      setCategories(prev => prev.filter(c => c.id !== cleanId));
      alert((lang === 'EN' ? 'Failed to add category: ' : 'Lỗi thêm danh mục: ') + error.message);
    } else {
      setCategories(prev => {
        localStorage.setItem('unidrink_categories', JSON.stringify(prev));
        return prev;
      });
    }
    setSavingCategory(false);
  };

  const saveCategory = async (updated: Category) => {
    setSavingCategory(true);
    const prev = categories.find(c => c.id === updated.id);
    // Optimistic update dùng functional updater để tránh stale closure
    const merged = categories.map(c => c.id === updated.id ? updated : c);
    setCategories(merged);
    setEditingCategory(null);

    const { error } = await (supabase as any)
      .from('categories')
      .upsert(updated, { onConflict: 'id' });

    if (error) {
      // Rollback nếu DB lỗi
      if (prev) setCategories(categories.map(c => c.id === updated.id ? prev : c));
      alert((lang === 'EN' ? 'Failed to save category: ' : 'Lỗi lưu danh mục: ') + error.message);
    } else {
      // Lưu vào localStorage với data đã merge đúng
      localStorage.setItem('unidrink_categories', JSON.stringify(merged));
    }
    setSavingCategory(false);
  };

  // Xóa danh mục (optimistic + rollback)
  const deleteCategory = async (catId: string) => {
    const catName = categories.find(c => c.id === catId)?.[lang === 'EN' ? 'name_en' : 'name_vi'] || catId;
    const productsInCat = products.filter(p => p.category === catId);
    const confirmMsg = productsInCat.length > 0
      ? (lang === 'EN'
          ? `Category "${catName}" still has ${productsInCat.length} product(s). Deleting it will hide the filter button but products remain. Continue?`
          : `Danh mục "${catName}" còn ${productsInCat.length} sản phẩm. Xóa sẽ ẩn nút lọc nhưng sản phẩm vẫn còn trong DB. Tiếp tục?`)
      : (lang === 'EN'
          ? `Delete category "${catName}"?`
          : `Xóa danh mục "${catName}"?`);
    if (!window.confirm(confirmMsg)) return;

    const previous = [...categories];
    const updated = categories.filter(c => c.id !== catId);
    setCategories(updated);
    localStorage.setItem('unidrink_categories', JSON.stringify(updated));

    const { error } = await (supabase as any).from('categories').delete().eq('id', catId);
    if (error) {
      setCategories(previous);
      localStorage.setItem('unidrink_categories', JSON.stringify(previous));
      alert((lang === 'EN' ? 'Failed to delete category: ' : 'Lỗi xóa danh mục: ') + error.message);
    }
  };

  // Khôi phục danh mục mặc định của UniDrink (Sinh Tố, Trà, Sữa hạt, Nước Ép, Nước)
  const seedDefaultCategories = async () => {
    const defaults: Category[] = [
      { id: 'tea',      name_vi: 'Trà',      name_en: 'Tea'      },
      { id: 'suahat',   name_vi: 'Sữa hạt',  name_en: 'Nut Milk' },
      { id: 'nuoc',     name_vi: 'Nước',     name_en: 'Water'    },
      { id: 'juice',    name_vi: 'Nước Ép',  name_en: 'Juice'    },
      { id: 'smoothie', name_vi: 'Sinh Tố',  name_en: 'Smoothie' },
    ];
    const confirmed = window.confirm(
      lang === 'EN'
        ? 'This will set default categories to: Tea, Nut Milk, Water, Juice, Smoothie.\nObsolete categories (coffee, teaMilk) will be removed, and products under those categories will be migrated to the new IDs.\nContinue?'
        : 'Thao tác này sẽ thiết lập các danh mục mặc định thành: Trà, Sữa hạt, Nước, Nước Ép, Sinh Tố.\nCác danh mục cũ (coffee, teaMilk) sẽ bị xóa, và sản phẩm thuộc các danh mục cũ sẽ tự động chuyển sang ID mới.\nTiếp tục?'
    );
    if (!confirmed) return;

    setSavingCategory(true);
    try {
      // 1. Cập nhật category trong bảng products trước
      // teaMilk -> tea (Trà Sữa sang Trà)
      // tea -> nuoc (Trà sang Nước)
      // coffee -> suahat (Cà Phê sang Sữa hạt)
      await (supabase as any)
        .from('products')
        .update({ category: 'suahat' })
        .eq('category', 'coffee');

      await (supabase as any)
        .from('products')
        .update({ category: 'nuoc' })
        .eq('category', 'tea');

      await (supabase as any)
        .from('products')
        .update({ category: 'tea' })
        .eq('category', 'teaMilk');

      // 2. Xóa các danh mục cũ ra khỏi DB
      await (supabase as any)
        .from('categories')
        .delete()
        .in('id', ['coffee', 'teaMilk']);

      // 3. Upsert các danh mục mới/chuẩn
      const { error: upsertError } = await (supabase as any)
        .from('categories')
        .upsert(defaults, { onConflict: 'id' });

      if (upsertError) {
        alert((lang === 'EN' ? 'Failed to restore defaults: ' : 'Lỗi khôi phục mặc định: ') + upsertError.message);
      } else {
        // 4. Lấy lại danh sách danh mục mới nhất từ DB
        const { data: catData, error: catError } = await (supabase as any)
          .from('categories')
          .select('*');

        if (!catError && catData) {
          setCategories(catData);
          localStorage.setItem('unidrink_categories', JSON.stringify(catData));
        } else {
          setCategories(defaults);
          localStorage.setItem('unidrink_categories', JSON.stringify(defaults));
        }

        // 5. Tải lại danh sách sản phẩm mới nhất từ DB để đồng bộ state và tránh lệch mapping
        const { data: prodData, error: prodError } = await (supabase as any)
          .from('products')
          .select('*')
          .eq('is_deleted', false)
          .order('name');
        
        if (!prodError && prodData) {
          setProducts(prodData);
          localStorage.setItem('unidrink_products', JSON.stringify(prodData));
        }

        alert(
          lang === 'EN'
            ? '✅ Default categories restored and products migrated successfully!'
            : '✅ Đã khôi phục danh mục mặc định và cập nhật sản phẩm thành công!'
        );
      }
    } catch (e: any) {
      alert((lang === 'EN' ? 'An error occurred: ' : 'Đã xảy ra lỗi: ') + e.message);
    } finally {
      setSavingCategory(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin');
  };

  if (!isAuthenticated || loading) {
    return (
      <div className="text-center py-20 text-[10px] font-black uppercase tracking-[0.3em] text-brand-muted animate-pulse">
        {lang === 'EN' ? 'Loading Portal...' : 'Đang tải...'}
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4">
          <h2 className="text-4xl md:text-5xl font-serif text-brand-ink">{t.adminTitle}</h2>
          <div className="flex gap-2">
            {(['orders', 'products', 'reports', 'settings'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  localStorage.setItem('unidrink_admin_tab', tab);
                }}
                className={cn(
                  "px-6 py-2 rounded-full text-xs font-bold transition-all uppercase tracking-widest border",
                  activeTab === tab
                    ? "bg-brand-brown text-white border-brand-brown"
                    : "bg-white text-brand-muted border-brand-beige"
                )}
              >
                {tab === 'orders' ? t.orders : tab === 'products' ? (lang === 'EN' ? 'Inventory' : 'Kho hàng') : tab === 'reports' ? (lang === 'EN' ? 'Reports' : 'Báo cáo') : t.settings}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="bg-brand-cream border border-brand-beige px-8 py-4 rounded-2xl flex flex-col justify-center min-w-[200px]">
            <span className="text-[10px] uppercase font-black tracking-widest text-brand-muted leading-none mb-1">{t.todayRevenueLabel}</span>
            <span className="text-2xl font-serif font-black text-brand-brown">{formatCurrency(todayRevenue)}</span>
          </div>
          <button
            onClick={handleLogout}
            className="px-6 py-4 bg-brand-brown text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-brand-brown/10"
          >
            {t.logoutButton}
          </button>
        </div>
      </div>

      {activeTab === 'settings' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Cấu hình chung */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-[2.5rem] p-6 md:p-8 border border-brand-beige shadow-sm">
              <h3 className="text-xl font-serif font-black text-brand-ink mb-6">
                ⚙️ {lang === 'EN' ? 'System Settings' : 'Cấu hình hệ thống'}
              </h3>
              <form onSubmit={e => { e.preventDefault(); saveSettings(spamOrderLimit); }} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-brand-muted tracking-[0.2em] ml-2 font-sans">
                    {lang === 'EN' ? 'Max Pending Orders' : 'Số đơn chờ duyệt tối đa'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={spamOrderLimit}
                    onChange={e => setSpamOrderLimit(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-[#FAF9F5] border border-brand-beige rounded-2xl px-6 py-4 outline-none font-sans font-bold text-brand-ink focus:ring-2 focus:ring-brand-caramel transition-all"
                  />
                  <p className="text-xs text-brand-muted leading-relaxed px-2 font-sans">
                    {lang === 'EN' 
                      ? 'Customers placing this many orders without admin approval will be automatically blacklisted from ordering.'
                      : 'Khách hàng đặt số đơn hàng này mà chưa được Admin duyệt sẽ bị tự động đưa vào danh sách đen.'}
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="w-full py-4 bg-brand-brown text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-ink active:scale-95 transition-all shadow-lg shadow-brand-brown/10 flex items-center justify-center disabled:opacity-60"
                >
                  {savingSettings 
                    ? (lang === 'EN' ? 'Saving...' : 'Đang lưu...')
                    : (lang === 'EN' ? 'Save Configuration' : 'Lưu cấu hình')}
                </button>
              </form>
            </div>

            {/* Block Email Thủ công */}
            <div className="bg-white rounded-[2.5rem] p-6 md:p-8 border border-brand-beige shadow-sm">
              <h3 className="text-xl font-serif font-black text-brand-ink mb-6">
                🚫 {lang === 'EN' ? 'Block Email Manually' : 'Chặn email thủ công'}
              </h3>
              <form onSubmit={handleManualBlock} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-brand-muted tracking-[0.2em] ml-2 font-sans">
                    {lang === 'EN' ? 'Email Address' : 'Địa chỉ email'}
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="example@gmail.com"
                    value={newBlockEmail}
                    onChange={e => setNewBlockEmail(e.target.value)}
                    className="w-full bg-[#FAF9F5] border border-brand-beige rounded-2xl px-6 py-4 outline-none font-medium text-brand-ink focus:ring-2 focus:ring-brand-caramel transition-all"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all shadow-lg shadow-red-600/10"
                >
                  {lang === 'EN' ? 'Block Email' : 'Khóa Email'}
                </button>
              </form>
            </div>
          </div>

          {/* Danh sách email bị chặn */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-[2.5rem] p-6 md:p-8 border border-brand-beige shadow-sm h-full flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-2xl font-serif font-black text-brand-ink leading-none mb-2">
                    📋 {lang === 'EN' ? 'Blacklisted Emails' : 'Danh sách email bị khóa'}
                  </h3>
                  <p className="text-xs text-brand-muted">
                    {lang === 'EN' ? 'Manage blocked customer emails' : 'Danh sách tài khoản bị khóa không được đặt hàng'}
                  </p>
                </div>
                <span className="bg-red-50 text-red-700 text-xs font-black px-4 py-2 rounded-full border border-red-200 self-start sm:self-auto">
                  {blacklistDetails.length} {lang === 'EN' ? 'blocked' : 'đang bị khóa'}
                </span>
              </div>

              <div className="grow overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-brand-beige text-[10px] font-black uppercase tracking-wider text-brand-muted">
                      <th className="py-4 px-2">{lang === 'EN' ? 'Email Address' : 'Địa chỉ Email'}</th>
                      <th className="py-4 px-2">{lang === 'EN' ? 'Reason' : 'Lý do khóa'}</th>
                      <th className="py-4 px-2">{lang === 'EN' ? 'Blocked Date' : 'Ngày chặn'}</th>
                      <th className="py-4 px-2 text-right">{lang === 'EN' ? 'Action' : 'Thao tác'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blacklistDetails.map(detail => (
                      <tr key={detail.email} className="border-b border-[#FAF9F5] hover:bg-brand-cream/5 text-sm transition-colors">
                        <td className="py-4 px-2 font-bold text-brand-ink truncate max-w-[200px]" title={detail.email}>
                          {detail.email}
                        </td>
                        <td className="py-4 px-2 text-brand-muted text-xs">
                          {detail.reason || (lang === 'EN' ? 'No reason' : 'Không có lý do')}
                        </td>
                        <td className="py-4 px-2 text-brand-muted text-xs">
                          {detail.created_at ? format(new Date(detail.created_at), 'yyyy-MM-dd HH:mm') : '-'}
                        </td>
                        <td className="py-4 px-2 text-right">
                          <button
                            onClick={() => toggleEmailBlacklist(detail.email)}
                            className="px-4 py-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                          >
                            🔓 {lang === 'EN' ? 'Unblock' : 'Mở khóa'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {blacklistDetails.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-brand-muted italic">
                          {lang === 'EN' ? 'No blacklisted emails' : 'Chưa có email nào bị khóa'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'reports' ? (
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white rounded-[2.5rem] p-6 md:p-10 border border-brand-beige shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <h3 className="text-2xl font-serif font-black text-brand-ink leading-none">{t.dailyReportTitle}</h3>
              {reportsByDate.length > 0 && (
                <button
                  onClick={handleExportCSV}
                  className="px-6 py-3 bg-brand-brown text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-ink transition-colors shadow-lg shadow-brand-brown/10 self-start sm:self-auto"
                >
                  {t.exportReport}
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[650px] border-collapse">
                <thead>
                  <tr className="border-b border-brand-beige">
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-brand-muted whitespace-nowrap">{t.colDate}</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-brand-muted text-center whitespace-nowrap">{t.colTotalOrders}</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-brand-muted text-center whitespace-nowrap">{t.colCompleted}</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-brand-muted text-center whitespace-nowrap">{t.colCancelled}</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-brand-muted text-center whitespace-nowrap">{t.colUnpaid}</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-brand-muted text-right whitespace-nowrap">{t.colUnpaidRevenue}</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-brand-muted text-center whitespace-nowrap">{t.colPendingOrders}</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-brand-muted text-right whitespace-nowrap">{t.colRevenue}</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsByDate.map(report => (
                    <tr key={report.date} className="border-b border-brand-beige last:border-0 hover:bg-brand-cream/30 transition-colors">
                      <td className="py-5 px-4 font-bold text-brand-ink whitespace-nowrap">
                        {new Date(report.date).toLocaleDateString(lang === 'EN' ? 'en-US' : 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </td>
                      <td className="py-5 px-4 font-bold text-center">{report.totalOrders}</td>
                      <td className="py-5 px-4 font-bold text-green-600 text-center">{report.completedOrders}</td>
                      <td className="py-5 px-4 font-bold text-red-500 text-center">{report.cancelledOrders}</td>
                      {/* FIX #5: cột cảnh báo đơn done chưa thu tiền */}
                      <td className="py-5 px-4 text-center">
                        {report.unpaidDoneOrders > 0
                          ? <span className="bg-amber-100 text-amber-700 font-black text-[10px] px-2 py-1 rounded-full">{report.unpaidDoneOrders}</span>
                          : <span className="text-brand-muted font-bold">—</span>
                        }
                      </td>
                      <td className="py-5 px-4 text-right font-bold text-amber-600 whitespace-nowrap">
                        {report.unpaidRevenue > 0 ? (
                          <span>{formatCurrency(report.unpaidRevenue)}</span>
                        ) : (
                          <span className="text-brand-muted/40 font-bold">—</span>
                        )}
                      </td>
                      <td className="py-5 px-4 text-center font-bold text-amber-500">
                        {report.pendingOrders > 0 ? (
                          <span className="bg-amber-50 text-amber-700 text-xs px-2 py-1 rounded-full border border-amber-200">{report.pendingOrders}</span>
                        ) : (
                          <span className="text-brand-muted/40 font-bold">—</span>
                        )}
                      </td>
                      <td className="py-5 px-4 font-black text-brand-brown text-right whitespace-nowrap">{formatCurrency(report.revenue)}</td>
                    </tr>
                  ))}
                  {reportsByDate.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-brand-muted italic">{t.noReportData}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'orders' ? (
        <div className="space-y-6">

          <div className="grid grid-cols-1 gap-6">
            {orders.map(order => (
            <div key={order.id} className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-5 md:p-8 border border-brand-beige flex flex-col md:flex-row gap-5 md:gap-8 hover:shadow-xl transition-all group">
              <div className="space-y-4 grow">
                <div className="flex flex-wrap items-center gap-2 md:gap-4">
                  <span className="text-xl md:text-2xl font-black text-brand-brown font-sans tracking-tighter">#{order.order_code}</span>
                  <span className={cn(
                    "text-[10px] font-black uppercase px-4 py-1 rounded-full border",
                    order.status === 'done' ? "bg-green-50 text-green-700 border-green-200" :
                    order.status === 'cancelled' ? "bg-red-50 text-red-700 border-red-200" :
                    order.status === 'processing' ? "bg-amber-50 text-amber-700 border-amber-200" :
                    "bg-brand-cream text-brand-brown border-brand-beige"
                  )}>
                    {t[`status${order.status.charAt(0).toUpperCase() + order.status.slice(1)}` as keyof typeof t] || order.status}
                  </span>
                  {order.is_paid && (
                    <span className="bg-blue-50 text-blue-700 text-[10px] font-black uppercase px-4 py-1 rounded-full border border-blue-200">
                      {t.paid}
                    </span>
                  )}
                  {/* FIX #5: cảnh báo đơn done nhưng chưa thu tiền */}
                  {order.status === 'done' && !order.is_paid && (
                    <span className="bg-amber-50 text-amber-700 text-[10px] font-black uppercase px-4 py-1 rounded-full border border-amber-200 animate-pulse">
                      {t.unpaidWarning}
                    </span>
                  )}

                  {/* Blocked email badge */}
                  {order.customer_email && blacklistedEmails.includes(order.customer_email.toLowerCase()) && (
                    <span className="bg-red-50 text-red-700 text-[10px] font-black uppercase px-4 py-1 rounded-full border border-red-200">
                      {lang === 'EN' ? 'Blocked Email' : 'Email bị chặn'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3 text-sm">
                  <div className="space-y-1">
                    <p className="text-[10px] text-brand-muted font-black uppercase tracking-widest leading-none">{t.customerLabel}</p>
                    <p className="font-bold text-brand-ink">{order.customer_name} • {order.customer_phone}</p>
                    {order.customer_email && (
                      <p className="text-xs text-brand-muted font-bold truncate">
                        Email: {order.customer_email}
                        {blacklistedEmails.includes(order.customer_email.toLowerCase()) && (
                          <span className="ml-2 text-red-500 font-black">({lang === 'EN' ? 'Blocked' : 'Đang chặn'})</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-brand-muted font-black uppercase tracking-widest leading-none">{t.deliveryAddress}</p>
                    <p className="font-bold text-brand-ink">{order.address}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-brand-muted font-black uppercase tracking-widest leading-none">{t.noteLabel}</p>
                    <p className="italic font-serif text-brand-muted">{order.note || t.noNote}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-brand-muted font-black uppercase tracking-widest leading-none">{t.paymentInfo}</p>
                    <p className="font-black text-brand-brown">{formatCurrency(order.total_price)} ({order.payment_method === 'cash' ? t.cash : t.transfer})</p>
                  </div>
                </div>

                <p className="text-[10px] text-brand-muted font-bold uppercase tracking-[0.2em] opacity-40">
                  {new Date(order.created_at).toLocaleString(lang === 'EN' ? 'en-US' : 'vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'long', year: 'numeric' })}
                </p>

                <div className="pt-2">
                  <button
                    onClick={() => fetchOrderLogs(order.id)}
                    className="text-xs text-brand-muted hover:text-brand-brown font-black uppercase tracking-wider flex items-center gap-1 underline"
                  >
                    {loadingLogs[order.id] ? (lang === 'EN' ? 'Loading...' : 'Đang tải...') : expandedLogs[order.id] ? (lang === 'EN' ? 'Hide History' : 'Ẩn lịch sử') : (lang === 'EN' ? 'View History' : 'Xem lịch sử')}
                  </button>
                  
                  {expandedLogs[order.id] && (
                    <div className="mt-4 pt-4 border-t border-brand-beige space-y-3 pl-4 border-l-2 border-brand-caramel/30">
                      <p className="text-[10px] font-black uppercase tracking-widest text-brand-muted mb-2">{t.orderHistory}</p>
                      {expandedLogs[order.id].length === 0 ? (
                        <p className="text-xs text-brand-muted italic">{t.historyEmpty}</p>
                      ) : (
                        expandedLogs[order.id].map(log => (
                          <div key={log.id} className="relative space-y-0.5">
                            <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-brand-caramel border border-white" />
                            <p className="text-xs font-bold text-brand-ink">{log.description}</p>
                            <p className="text-[9px] text-brand-muted font-mono">
                              {new Date(log.created_at).toLocaleString(lang === 'EN' ? 'en-US' : 'vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' })}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap md:flex-col gap-3 justify-center md:items-stretch md:min-w-[160px]">
                {order.status !== 'done' && order.status !== 'cancelled' && (
                  <>
                    <button
                      onClick={() => updateStatus(order.id, 'processing')}
                      className="bg-brand-caramel text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-brown transition-all grow md:grow-0"
                    >
                      {lang === 'EN' ? 'Processing' : 'Đang làm'}
                    </button>
                    <button
                      onClick={() => updateStatus(order.id, 'done')}
                      className="bg-brand-brown text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-ink transition-all shadow-lg shadow-brand-brown/20 grow md:grow-0"
                    >
                      {lang === 'EN' ? 'Mark Done' : 'Hoàn thành'}
                    </button>
                  </>
                )}
                {!order.is_paid && order.status !== 'cancelled' && (
                  <button
                    onClick={() => togglePaid(order.id, true)}
                    className="bg-white border-2 border-brand-brown text-brand-brown px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-brown hover:text-white transition-all grow md:grow-0"
                  >
                    {lang === 'EN' ? 'Confirm Paid' : 'Đã thu tiền'}
                  </button>
                )}
                {order.status === 'pending' && (
                  <button
                    onClick={() => updateStatus(order.id, 'cancelled')}
                    className="bg-transparent text-red-400 hover:text-red-600 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors grow md:grow-0 underline underline-offset-4"
                  >
                    {lang === 'EN' ? 'Cancel' : 'Hủy'}
                  </button>
                )}
                <button
                  onClick={() => setEditingOrder(order)}
                  className="bg-white border border-brand-beige text-brand-muted px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-brown hover:text-white transition-all grow md:grow-0"
                >
                  {t.editButton}
                </button>

                {order.customer_email && (
                  <button
                    onClick={() => toggleEmailBlacklist(order.customer_email!)}
                    className={cn(
                      "px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all grow md:grow-0",
                      blacklistedEmails.includes(order.customer_email.toLowerCase())
                        ? "bg-red-100 text-red-700 hover:bg-red-200"
                        : "bg-white border border-brand-beige text-brand-muted hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                    )}
                  >
                    {blacklistedEmails.includes(order.customer_email.toLowerCase()) ? t.unblockEmail : t.blockEmail}
                  </button>
                )}
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <div className="py-20 text-center text-brand-muted italic">{t.noOrders}</div>
          )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* Category Name Editor */}
          <div className="md:col-span-2 lg:col-span-3 bg-white rounded-[2rem] border border-brand-beige p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-brand-muted mb-4">
              {lang === 'EN' ? 'Category Names' : 'Tên danh mục đồ uống'}
            </h3>
            <div className="flex flex-wrap gap-3">
              {categories.map(cat => (
                <div key={cat.id} className="group relative">
                  {editingCategory?.id === cat.id ? (
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        saveCategory({
                          id: cat.id,
                          name_vi: (fd.get('name_vi') as string).trim() || cat.name_vi,
                          name_en: (fd.get('name_en') as string).trim() || cat.name_en,
                        });
                      }}
                      className="flex items-center gap-2 bg-brand-cream border border-brand-caramel/50 rounded-2xl px-3 py-2"
                    >
                      <input
                        name="name_vi"
                        defaultValue={cat.name_vi}
                        placeholder="Tên VI"
                        className="w-20 bg-white border border-brand-beige rounded-lg px-2 py-1 text-xs outline-none focus:border-brand-brown"
                      />
                      <input
                        name="name_en"
                        defaultValue={cat.name_en}
                        placeholder="EN name"
                        className="w-20 bg-white border border-brand-beige rounded-lg px-2 py-1 text-xs outline-none focus:border-brand-brown"
                      />
                      <button type="submit" disabled={savingCategory} className="text-[10px] font-black uppercase tracking-widest bg-brand-brown text-white px-3 py-1 rounded-lg hover:bg-brand-ink transition-colors disabled:opacity-50">
                        {savingCategory ? '...' : (lang === 'EN' ? 'Save' : 'Lưu')}
                      </button>
                      <button type="button" onClick={() => setEditingCategory(null)} className="text-[10px] font-black text-brand-muted hover:text-brand-ink">
                        ✕
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center">
                      <button
                        onClick={() => setEditingCategory(cat)}
                        className="px-5 py-2 rounded-2xl text-xs font-bold border border-brand-beige bg-brand-cream text-brand-ink hover:border-brand-brown hover:bg-white transition-all flex items-center gap-2 pr-8"
                      >
                        <span>{lang === 'EN' ? cat.name_en : cat.name_vi}</span>
                        <span className="text-[9px] text-brand-muted opacity-50 font-mono">✎</span>
                      </button>
                      {/* Nút xóa danh mục — hiện khi hover */}
                      <button
                        type="button"
                        onClick={() => deleteCategory(cat.id)}
                        title={lang === 'EN' ? 'Delete category' : 'Xóa danh mục'}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-red-100 text-red-500 hover:bg-red-500 hover:text-white transition-all text-[10px] font-black flex items-center justify-center opacity-0 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {/* Add Category Button or Inline Form */}
              {isAddingCategory ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const id = (fd.get('cat_id') as string).trim();
                    const name_vi = (fd.get('name_vi') as string).trim();
                    const name_en = (fd.get('name_en') as string).trim();
                    if (!id || !name_vi || !name_en) return;
                    await addCategory({ id, name_vi, name_en });
                    setIsAddingCategory(false);
                  }}
                  className="flex items-center gap-2 bg-brand-cream border border-brand-caramel/50 rounded-2xl px-3 py-2"
                >
                  <input
                    required
                    name="cat_id"
                    placeholder="ID (e.g. dessert)"
                    className="w-28 bg-white border border-brand-beige rounded-lg px-2 py-1 text-xs outline-none focus:border-brand-brown"
                  />
                  <input
                    required
                    name="name_vi"
                    placeholder="Tên VI"
                    className="w-20 bg-white border border-brand-beige rounded-lg px-2 py-1 text-xs outline-none focus:border-brand-brown"
                  />
                  <input
                    required
                    name="name_en"
                    placeholder="EN Name"
                    className="w-20 bg-white border border-brand-beige rounded-lg px-2 py-1 text-xs outline-none focus:border-brand-brown"
                  />
                  <button type="submit" disabled={savingCategory} className="text-[10px] font-black uppercase tracking-widest bg-brand-brown text-white px-3 py-1 rounded-lg hover:bg-brand-ink transition-colors disabled:opacity-50">
                    {savingCategory ? '...' : (lang === 'EN' ? 'Add' : 'Thêm')}
                  </button>
                  <button type="button" onClick={() => setIsAddingCategory(false)} className="text-[10px] font-black text-brand-muted hover:text-brand-ink">
                    ✕
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(true)}
                    className="px-5 py-2 rounded-2xl text-xs font-bold border-2 border-dashed border-brand-beige text-brand-muted hover:border-brand-brown hover:text-brand-brown transition-all flex items-center gap-1.5"
                  >
                    <span>➕</span>
                    <span>{lang === 'EN' ? 'Add Category' : 'Thêm danh mục'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Add New Product Card */}
          <button
            onClick={() => setEditingProduct({
              id: 'NEW_PRODUCT',
              name: '',
              name_en: '',
              price: 0,
              category: categories[0]?.id || 'coffee',
              emoji: '☕',
              description: '',
              description_en: '',
              image_url: '',
              is_available: true,
              is_deleted: false,
              created_at: new Date().toISOString()
            })}
            className="bg-white p-5 rounded-[2rem] border-2 border-dashed border-brand-beige flex items-center justify-center gap-4 hover:border-brand-brown hover:bg-brand-cream/10 transition-all group min-h-[106px] text-left w-full"
          >
            <div className="w-16 h-16 bg-[#F8F7F4] rounded-2xl flex items-center justify-center text-3xl shrink-0 group-hover:scale-105 transition-transform">
              <span>➕</span>
            </div>
            <div className="grow">
              <h3 className="font-serif font-black text-brand-ink text-lg leading-tight">
                {lang === 'EN' ? 'Add New Product' : 'Thêm đồ uống mới'}
              </h3>
              <p className="text-[10px] text-brand-muted uppercase tracking-widest font-bold">
                {lang === 'EN' ? 'Create a new signature drink' : 'Tạo mới sản phẩm đồ uống'}
              </p>
            </div>
          </button>

          {/* Product List */}
          {products.map(product => (
              <div key={product.id} className="bg-white p-5 rounded-[2rem] border border-brand-beige flex items-center gap-4 hover:shadow-md transition-all group">
                <div className="w-16 h-16 bg-[#F8F7F4] rounded-2xl flex items-center justify-center text-3xl shrink-0 overflow-hidden relative">
                  {/* Fallback Emoji */}
                  <span className="absolute inset-0 flex items-center justify-center z-0">
                    {product.emoji || '☕'}
                  </span>
                  {product.image_url && (
                    <img 
                      src={product.image_url} 
                      alt={product.name} 
                      className="w-full h-full object-cover rounded-2xl absolute inset-0 z-10 bg-[#F8F7F4]" 
                      loading="lazy" 
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                </div>
                <div className="grow min-w-0">
                  <h3 className="font-bold text-brand-ink truncate">{lang === 'EN' ? product.name_en || product.name : product.name}</h3>
                  <p className="text-brand-brown text-sm font-black">{formatCurrency(product.price)}</p>
                  <p className="text-[10px] text-brand-muted uppercase tracking-widest font-bold">{product.category}</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => toggleProduct(product.id, !product.is_available)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      product.is_available ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-700 hover:bg-red-200"
                    )}
                  >
                    {product.is_available ? t.availableLabel : t.unavailableLabel}
                  </button>
                  <button
                    onClick={() => setEditingProduct(product)}
                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white border border-brand-beige text-brand-muted hover:bg-brand-brown hover:text-white hover:border-brand-brown transition-all"
                  >
                    {t.editButton}
                  </button>
                  <button
                    onClick={() => deleteProduct(product.id)}
                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white border border-red-200 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all"
                  >
                    {lang === 'EN' ? 'Delete' : 'Xóa'}
                  </button>
                </div>
              </div>
          ))}
        </div>
      )}

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="fixed inset-0 bg-brand-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-cream border border-brand-beige rounded-[2.5rem] max-w-lg w-full p-6 md:p-10 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
            <h3 className="text-2xl font-serif font-black text-brand-ink">{t.editOrder} #{editingOrder.order_code}</h3>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const formData = new FormData(form);
              
              const updatedFields = {
                customer_name: formData.get('customer_name') as string,
                customer_phone: formData.get('customer_phone') as string,
                address: formData.get('address') as string,
                note: formData.get('note') as string,
                total_price: parseFloat(formData.get('total_price') as string),
                status: formData.get('status') as Order['status'],
                is_paid: formData.get('is_paid') === 'true',
              };

              // FIX: capture id trước khi setEditingOrder(null) để tránh stale closure
              const targetOrderId = editingOrder.id;
              const previous = orders.find(o => o.id === targetOrderId);
              const hadExpandedLogs = !!expandedLogs[targetOrderId];

              // Optimistic update
              setOrders(prev => prev.map(o => o.id === targetOrderId ? { ...o, ...updatedFields } : o));
              setEditingOrder(null);

              const { error } = await (supabase as any)
                .from('orders')
                .update(updatedFields)
                .eq('id', targetOrderId);

              if (error) {
                if (previous) setOrders(prev => prev.map(o => o.id === targetOrderId ? previous : o));
                alert(t.updateError + error.message);
              } else {
                // Nếu log đang mở, refresh sau 500ms để trigger mới nhất
                if (hadExpandedLogs) {
                  setTimeout(() => {
                    supabase
                      .from('order_logs')
                      .select('*')
                      .eq('order_id', targetOrderId)
                      .order('created_at', { ascending: true })
                      .then(({ data }) => {
                        if (data) {
                          setExpandedLogs(prev => ({ ...prev, [targetOrderId]: data as OrderLog[] }));
                        }
                      });
                  }, 500);
                }
              }
            }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{t.name}</label>
                  <input
                    required
                    type="text"
                    name="customer_name"
                    defaultValue={editingOrder.customer_name}
                    className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{t.phone}</label>
                  <input
                    required
                    type="text"
                    name="customer_phone"
                    defaultValue={editingOrder.customer_phone}
                    className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{t.address}</label>
                <input
                  required
                  type="text"
                  name="address"
                  defaultValue={editingOrder.address}
                  className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{t.noteLabel}</label>
                <textarea
                  name="note"
                  defaultValue={editingOrder.note || ''}
                  className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{t.total} (VND)</label>
                  <input
                    required
                    type="number"
                    name="total_price"
                    defaultValue={editingOrder.total_price}
                    className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{lang === 'EN' ? 'Status' : 'Trạng thái'}</label>
                  <select
                    name="status"
                    defaultValue={editingOrder.status}
                    className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown"
                  >
                    <option value="pending">{t.statusPending}</option>
                    <option value="processing">{t.statusProcessing}</option>
                    <option value="done">{t.statusDone}</option>
                    <option value="cancelled">{t.statusCancelled}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{lang === 'EN' ? 'Payment' : 'Thanh toán'}</label>
                  <select
                    name="is_paid"
                    defaultValue={String(editingOrder.is_paid)}
                    className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown"
                  >
                    <option value="false">{t.unpaid}</option>
                    <option value="true">{t.paid}</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-6 py-3 bg-white border border-brand-beige text-brand-muted rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-cream transition-colors"
                >
                  {t.cancelButton}
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-brand-brown text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-ink transition-colors shadow-lg shadow-brand-brown/10"
                >
                  {t.saveButton}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-brand-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-cream border border-brand-beige rounded-[2.5rem] max-w-xl w-full p-6 md:p-10 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">

            {/* Header với live preview */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white border-2 border-brand-beige rounded-2xl flex items-center justify-center text-3xl shrink-0 overflow-hidden relative">
                {/* Fallback Emoji */}
                <span className="absolute inset-0 flex items-center justify-center z-0">
                  {editingProduct.emoji || '☕'}
                </span>
                {editingProduct.image_url && (
                  <img 
                    src={editingProduct.image_url} 
                    alt="" 
                    className="w-full h-full object-cover rounded-2xl absolute inset-0 z-10 bg-white" 
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                  />
                )}
              </div>
              <div>
                <h3 className="text-xl font-serif font-black text-brand-ink">
                  {editingProduct.id === 'NEW_PRODUCT'
                    ? (lang === 'EN' ? 'Add New Product' : 'Thêm sản phẩm mới')
                    : t.editProduct}
                </h3>
                <p className="text-[10px] text-brand-muted uppercase tracking-widest font-bold">
                  {editingProduct.id === 'NEW_PRODUCT'
                    ? (lang === 'EN' ? 'New Product' : 'Sản phẩm mới')
                    : (lang === 'EN' ? editingProduct.name_en || editingProduct.name : editingProduct.name)}
                </p>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const name = (fd.get('name') as string).trim();
                const price = parseFloat(fd.get('price') as string);
                const category = (fd.get('category') as string).trim();
                const is_available = fd.get('is_available') === 'true';

                if (!name || isNaN(price) || !category) {
                  alert(lang === 'EN' ? 'Please fill in all required fields!' : 'Vui lòng điền đầy đủ các thông tin bắt buộc!');
                  return;
                }

                const productFields = {
                  name,
                  name_en: (fd.get('name_en') as string).trim() || undefined,
                  price,
                  category,
                  emoji: (fd.get('emoji') as string).trim() || undefined,
                  description: (fd.get('description') as string).trim() || undefined,
                  description_en: (fd.get('description_en') as string).trim() || undefined,
                  image_url: (fd.get('image_url') as string).trim() || undefined,
                  is_available,
                  is_deleted: false,
                };

                if (editingProduct.id === 'NEW_PRODUCT') {
                  await addProduct(productFields);
                } else {
                  await updateProduct(productFields);
                }
              }}
              className="space-y-5"
            >
              {/* Tên VI / EN */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{t.productName}</label>
                  <input
                    required
                    name="name"
                    defaultValue={editingProduct.name}
                    className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown"
                    placeholder="Ví dụ: Cà Phê Sữa Đá"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{t.productNameEn}</label>
                  <input
                    name="name_en"
                    defaultValue={editingProduct.name_en || ''}
                    className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown"
                    placeholder="Ex: Iced Coffee"
                  />
                </div>
              </div>

              {/* Giá & Trạng thái */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{t.productPrice}</label>
                  <input
                    required
                    name="price"
                    type="number"
                    min={0}
                    step={500}
                    defaultValue={editingProduct.price}
                    className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{lang === 'EN' ? 'Status' : 'Trạng thái'}</label>
                  <select
                    name="is_available"
                    defaultValue={String(editingProduct.is_available)}
                    className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown"
                  >
                    <option value="true">{t.availableLabel}</option>
                    <option value="false">{t.unavailableLabel}</option>
                  </select>
                </div>
              </div>

              {/* Nhóm hàng (category) — chỉ chọn từ danh mục đã tạo */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">
                  {t.productCategory}
                </label>
                <select
                  required
                  name="category"
                  defaultValue={editingProduct.category}
                  className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown"
                >
                  {categories.length === 0 && (
                    <option value="" disabled>
                      {lang === 'EN' ? '— No categories yet —' : '— Chưa có danh mục nào —'}
                    </option>
                  )}
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {lang === 'EN' ? cat.name_en : cat.name_vi}
                    </option>
                  ))}
                </select>
                {categories.length === 0 && (
                  <p className="text-[10px] text-red-500 font-bold">
                    {lang === 'EN'
                      ? '⚠ Please create a category first before adding a product.'
                      : '⚠ Vui lòng tạo danh mục trước khi thêm sản phẩm.'}
                  </p>
                )}
              </div>

              {/* Emoji */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{t.productEmoji}</label>
                <input
                  name="emoji"
                  defaultValue={editingProduct.emoji || ''}
                  onChange={(e) => setEditingProduct(prev => prev ? { ...prev, emoji: e.target.value, image_url: prev.image_url } : null)}
                  className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown"
                  placeholder="☕, 🧋, 🍑..."
                />
              </div>

              {/* Ảnh sản phẩm (Chỉ Upload trực tiếp) */}
              <div className="space-y-3">
                <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted block">
                  {lang === 'EN' ? 'Product Image' : 'Hình ảnh sản phẩm'}
                </label>

                {/* Hidden input to pass value in FormData */}
                <input
                  type="hidden"
                  name="image_url"
                  value={editingProduct.image_url || ''}
                />

                {/* Drag and drop upload zone */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    if (isUploadingImage) return;
                    const file = e.dataTransfer.files?.[0];
                    if (file) await handleImageUpload(file);
                  }}
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2",
                    isUploadingImage 
                      ? "border-brand-caramel/50 bg-brand-cream/30 cursor-not-allowed animate-pulse" 
                      : "border-brand-beige hover:border-brand-brown hover:bg-brand-cream/10 bg-white"
                  )}
                  onClick={() => {
                    if (isUploadingImage) return;
                    document.getElementById('product-image-file-input')?.click();
                  }}
                >
                  <input
                    id="product-image-file-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) await handleImageUpload(file);
                    }}
                  />
                  {isUploadingImage ? (
                    <div className="flex flex-col items-center gap-2 text-brand-brown">
                      <div className="w-8 h-8 border-4 border-brand-beige border-t-brand-brown rounded-full animate-spin" />
                      <p className="text-xs font-bold">{t.productImageUploading}</p>
                    </div>
                  ) : (
                    <div className="text-brand-muted flex flex-col items-center gap-2">
                      <span className="text-3xl">📸</span>
                      <p className="text-xs font-bold text-brand-ink">
                        {t.productImageDragDrop}
                      </p>
                    </div>
                  )}
                </div>

                {/* Remove Image button if image exists */}
                {editingProduct.image_url && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setEditingProduct(prev => prev ? { ...prev, image_url: undefined } : null)}
                      className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-700 transition-colors flex items-center gap-1.5"
                    >
                      <span>🗑</span>
                      {lang === 'EN' ? 'Remove Image (use Emoji)' : 'Xóa ảnh để dùng Emoji'}
                    </button>
                  </div>
                )}
              </div>

              {/* Mô tả VI / EN */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{t.productDesc}</label>
                  <textarea
                    name="description"
                    defaultValue={editingProduct.description || ''}
                    rows={3}
                    className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown resize-none"
                    placeholder="Mô tả ngắn gọn..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-brand-muted">{t.productDescEn}</label>
                  <textarea
                    name="description_en"
                    defaultValue={editingProduct.description_en || ''}
                    rows={3}
                    className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-brown resize-none"
                    placeholder="Short description..."
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex justify-between items-center gap-3">
                {/* Nút xóa — chỉ hiện với sản phẩm đã tồn tại (không phải NEW_PRODUCT) */}
                {editingProduct.id !== 'NEW_PRODUCT' ? (
                  <button
                    type="button"
                    onClick={() => deleteProduct(editingProduct.id)}
                    className="px-5 py-3 bg-white border border-red-200 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white hover:border-red-500 transition-all flex items-center gap-1.5"
                  >
                    <span>🗑</span>
                    {lang === 'EN' ? 'Delete Product' : 'Xóa sản phẩm'}
                  </button>
                ) : <div />}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="px-6 py-3 bg-white border border-brand-beige text-brand-muted rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-cream transition-colors"
                  >
                    {t.cancelButton}
                  </button>
                  <button
                    type="submit"
                    disabled={savingProduct}
                    className="px-6 py-3 bg-brand-brown text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-ink transition-colors shadow-lg shadow-brand-brown/10 disabled:opacity-60 flex items-center gap-2"
                  >
                    {savingProduct
                      ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />{lang === 'EN' ? 'Saving...' : 'Đang lưu...'}</>
                      : t.saveButton}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
