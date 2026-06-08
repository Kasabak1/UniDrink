import { createClient } from '@supabase/supabase-js';

// Demo data fallback khi thiếu hoặc lỗi Supabase config
export const defaultData = [
  { id: '1', name: 'Sữa Hạt Sen', name_en: 'Lotus Seed Milk', price: 35000, category: 'suahat', emoji: '🥛', description: 'Sữa hạt sen thơm ngon bổ dưỡng.', description_en: 'Lotus seed nut milk, rich and nutritious.', is_available: true, is_deleted: false, created_at: new Date().toISOString() },
  { id: '2', name: 'Sữa Hạt Điều', name_en: 'Cashew Nut Milk', price: 38000, category: 'suahat', emoji: '🥤', description: 'Sữa hạt điều béo ngậy tự nhiên.', description_en: 'Creamy cashew nut milk, naturally sweet.', is_available: true, is_deleted: false, created_at: new Date().toISOString() },
  { id: '3', name: 'Trà Đào Cam Sả', name_en: 'Peach Orange Tea', price: 32000, category: 'tea', emoji: '🍑', description: 'Thanh mát giải nhiệt mùa hè.', description_en: 'Refreshing peach orange lemongrass tea.', is_available: true, is_deleted: false, created_at: new Date().toISOString() },
  { id: '4', name: 'Nước Ép Cam', name_en: 'Orange Juice', price: 30000, category: 'juice', emoji: '🍊', description: 'Cam tươi nguyên chất 100%.', description_en: '100% fresh orange juice.', is_available: true, is_deleted: false, created_at: new Date().toISOString() },
  { id: '5', name: 'Sinh Tố Bơ', name_en: 'Avocado Smoothie', price: 40000, category: 'smoothie', emoji: '🥑', description: 'Bơ sáp béo ngậy xay mịn.', description_en: 'Creamy avocado smoothie.', is_available: true, is_deleted: false, created_at: new Date().toISOString() },
  { id: '6', name: 'Nước Tinh Khiết', name_en: 'Mineral Water', price: 15000, category: 'nuoc', emoji: '💧', description: 'Nước khoáng đóng chai mát lạnh.', description_en: 'Chilled pure bottled mineral water.', is_available: true, is_deleted: false, created_at: new Date().toISOString() },
];

// Singleton client — chỉ khởi tạo một lần duy nhất
let _client: ReturnType<typeof createClient> | null = null;
let _useMock = false;

const getClient = () => {
  if (_client) return _client;

  const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
  const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    _useMock = true;
    return null;
  }

  _client = createClient(supabaseUrl, supabaseAnonKey);
  return _client;
};

// ─── Mock auth object ────────────────────────────────────────────────────────
// Trả về shape đúng chuẩn Supabase Auth để tránh destructure crash khi mock
const mockAuth = {
  getSession: () => Promise.resolve({ data: { session: null }, error: null }),
  onAuthStateChange: (_event: any, _session: any) => ({
    data: { subscription: { unsubscribe: () => {} } },
  }),
  signInWithOAuth: () => Promise.resolve({ data: {}, error: null }),
  signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
  signUp: () => Promise.resolve({ data: { session: null }, error: null }),
  signOut: () => Promise.resolve({ error: null }),
};

// ─── Mock chain cho các query builder (from, select, eq, ...) ────────────────
const createMockChain = () => {
  const target = () => mock;
  const mock: any = new Proxy(target, {
    get(_t, prop) {
      // Bỏ qua Symbol properties để tránh vòng lặp vô tận với một số JS engine
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'then') {
        return (onfulfilled: any, onrejected?: any) => {
          console.warn('[UniDrink] Supabase config missing — using demo data.');
          return Promise.resolve({ data: defaultData, error: null }).then(onfulfilled, onrejected);
        };
      }
      if (prop === 'catch') return (handler: any) => Promise.resolve({ data: defaultData, error: null }).catch(handler);
      if (prop === 'finally') return (handler: any) => Promise.resolve({ data: defaultData, error: null }).finally(handler);
      // rpc() luôn resolve với null (không có dữ liệu admin)
      if (prop === 'rpc') return () => Promise.resolve({ data: null, error: null });
      return mock;
    },
  });
  return mock;
};

const mockChain = createMockChain();

export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    // Bỏ qua Symbol để tránh lỗi Proxy với Symbol.toPrimitive, Symbol.iterator, etc.
    if (typeof prop === 'symbol') return undefined;

    const client = getClient();

    if (_useMock || !client) {
      // auth cần trả về mock object đúng shape, không phải mock chain
      if (prop === 'auth') return mockAuth;
      return (mockChain as any)[prop] ?? mockChain;
    }

    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

// ─── Timeout wrapper cho mọi Supabase query ──────────────────────────────────
// Dùng: await withTimeout(supabase.from('products').select('*'), 15000)
export async function withTimeout<T>(
  promise: Promise<T>,
  ms = 15000
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Supabase request timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}
