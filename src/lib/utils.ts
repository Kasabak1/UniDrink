import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function formatCurrency(amount: number, currency: 'VND' | 'USD' = 'VND', rate: number = 25000) {
  if (currency === 'USD') {
    return usdFormatter.format(amount / rate);
  }
  return vndFormatter.format(amount);
}

export function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, '');

  // Chuẩn hoá +84 / 084 → 0 (phải check 084 TRƯỚC 84)
  if (digits.startsWith('084')) {
    digits = '0' + digits.slice(3);
  } else if (digits.startsWith('84')) {
    digits = '0' + digits.slice(2);
  }

  // Xóa các số 0 thừa ở đầu (ngoại trừ số 0 đầu tiên bắt buộc)
  digits = digits.replace(/^0+/, '0');

  return digits;
}
