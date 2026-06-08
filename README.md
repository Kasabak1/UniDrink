# UniDrink - Hệ Thống Đặt Đồ Uống Trực Tuyến

UniDrink là một ứng dụng web hiện đại được thiết kế riêng cho việc đặt đồ uống trực tuyến tại giảng đường/khuôn viên trường đại học. Dự án sử dụng mô hình Serverless hoàn chỉnh kết hợp giữa frontend React (Vite) tốc độ cao và database Supabase thời gian thực, đi kèm tích hợp thanh toán tự động qua mã VietQR động.

---

## 🚀 Tính Năng Nổi Bật

- **Menu Trực Quan & Đa Ngôn Ngữ**: Giao diện đặt hàng đẹp mắt, mượt mà (hỗ trợ Tiếng Việt & Tiếng Anh). Cho phép lọc đồ uống theo danh mục (Cà phê, Trà sữa, Trà trái cây, Sinh tố...).
- **Giỏ Hàng Linh Hoạt**: Người dùng có thể thêm/bớt sản phẩm, nhập ghi chú riêng cho từng ly nước (ví dụ: "ít đá, nhiều đường").
- **Thanh Toán VietQR Động**: Tích hợp API của VietQR.io để tự động tạo mã QR chuyển khoản ngân hàng ngay khi đặt hàng. Mã QR chứa sẵn:
  - Số tiền chính xác của đơn hàng.
  - Số tài khoản và tên chủ tài khoản cấu hình trước.
  - Nội dung chuyển khoản chứa mã đơn hàng duy nhất để đối soát.
- **Tra Cứu Đơn Hàng**: Khách hàng có thể nhập mã đơn hàng (ví dụ: `DH000001`) để theo dõi tiến độ chuẩn bị đơn hàng theo thời gian thực.
- **Quản Trị Viên (Admin Dashboard)**: Trang quản lý toàn diện dành cho cửa hàng:
  - Đăng nhập bảo mật.
  - Xem danh sách tất cả đơn hàng, doanh thu.
  - Cập nhật trạng thái thanh toán (`Chưa thanh toán` ➜ `Đã thanh toán`).
  - Cập nhật tiến độ đơn hàng (`Chờ xử lý` ➜ `Đang chuẩn bị` ➜ `Đã hoàn thành` ➜ `Đã hủy`).

---

## 🛠️ Công Nghệ Sử Dụng

- **Frontend**:
  - **React 19** & **TypeScript**
  - **Vite** (Bộ build công cụ siêu tốc)
  - **Tailwind CSS v4** (Thiết kế UI tinh tế, responsive hoàn hảo trên mọi thiết bị di động)
  - **Motion (Framer Motion)** & **Lucide React** (Hiệu ứng chuyển động mượt mà và bộ icons hiện đại)
- **Backend & Database**:
  - **Supabase (PostgreSQL)**: Lưu trữ thông tin sản phẩm, đơn hàng và chi tiết đơn hàng.
  - **PL/pgSQL Functions (RPC)**:
    - Hàm tự động sinh mã đơn hàng tăng dần (`generate_order_code`).
    - Giao dịch tạo đơn hàng đồng thời kèm danh sách chi tiết món (`create_order_with_items`).
  - **Row Level Security (RLS)**: Chính sách bảo mật dữ liệu ở tầng cơ sở dữ liệu.

---

## ⚙️ Hướng Dẫn Cài Đặt Chi Tiết

### 1. Chuẩn Bị
Yêu cầu hệ thống đã cài đặt sẵn **Node.js** (Khuyến nghị phiên bản LTS mới nhất).

### 2. Cài Đặt Thư Viện
Mở terminal tại thư mục gốc của dự án và chạy lệnh sau để cài đặt toàn bộ dependencies:
```bash
npm install
```

### 3. Thiết Lập Cơ Sở Dữ Liệu (Supabase)
1. Tạo một dự án mới trên [Supabase](https://supabase.com).
2. Vào phần **SQL Editor** trong giao diện quản trị Supabase của bạn.
3. Copy toàn bộ nội dung từ file `supabase_setup.sql` ở thư mục gốc của dự án này, dán vào SQL Editor và nhấn **Run** (Chạy).
   * Lệnh này sẽ tự động khởi tạo các bảng: `products`, `orders`, `order_items`.
   * Tạo các chính sách bảo mật RLS phù hợp.
   * Cài đặt các hàm xử lý transaction (`create_order_with_items`).
   * Thêm sẵn dữ liệu sản phẩm demo ban đầu.

### 4. Cấu Hình Biến Môi Trường (`.env.local`)
Tạo file `.env.local` ở thư mục gốc (hoặc sao chép từ `.env.example`) và điền các thông tin tương ứng:

```env
# 1. Supabase Credentials (Lấy từ Project Settings -> API trên Supabase Dashboard)
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key-here"

# 2. Bank Details (Dùng để sinh mã VietQR nhận tiền chuyển khoản của khách)
VITE_BANK_ID="YOUR_BANK_ID"              # Ví dụ: MB, VietinBank, Techcombank, VCB, BIDV...
VITE_BANK_ACCOUNT="YOUR_BANK_ACCOUNT"    # Số tài khoản ngân hàng của bạn
VITE_BANK_ACCOUNT_NAME="YOUR_NAME"       # Tên chủ tài khoản ngân hàng (Không dấu)

# 3. Gemini AI Configuration (Tùy chọn)
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"     # Điền API Key nếu bạn phát triển thêm tính năng AI
```

### 5. Khởi Chạy Ứng Dụng
Để chạy dự án ở môi trường phát triển (Local Development):
```bash
npm run dev
```
Ứng dụng sẽ chạy tại địa chỉ mặc định: [http://localhost:3000](http://localhost:3000).

Để build bản chạy chính thức (Production Bundle):
```bash
npm run build
```

---

## 📁 Cấu Trúc Thư Mục Dự Án
```text
UniDrink/
├── .env.example
├── README.md               # Tài liệu hướng dẫn sử dụng dự án
├── supabase_setup.sql      # Script khởi tạo cơ sở dữ liệu trên Supabase
├── index.html
├── package.json
├── vite.config.ts
└── src/
    ├── App.tsx             # Cấu hình routing chính của ứng dụng
    ├── main.tsx
    ├── translations.ts     # Bộ từ điển song ngữ (VI/EN)
    ├── components/         # Các component dùng chung (Header, Footer, ProductCard...)
    ├── context/            # Quản lý state toàn cục (Giỏ hàng, Đơn hàng, Ngôn ngữ)
    ├── hooks/              # Custom hooks hỗ trợ
    ├── lib/                # Cấu hình kết nối Supabase và Utils
    └── pages/              # Các trang giao diện chính (Home, Cart, Checkout, Track, Admin)
```
