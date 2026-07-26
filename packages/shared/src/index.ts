// ---- Enums / Constants ----
export type TransactionType = 'expense' | 'income';
export type Visibility = 'personal' | 'shared';
export type UserRole = 'admin' | 'user';

export const EXPENSE_CATEGORIES = ['车辆','餐费','通讯网络','快递','物料','劳保','维修','办公','水电','差旅','其他'] as const;
export const INCOME_CATEGORIES = ['工资','红包','其他'] as const;

export const CURRENCIES = ['AED','CNY','USD','EUR','GBP','JPY'] as const;
export type Currency = typeof CURRENCIES[number];

// ---- API types ----
export interface UserInfo {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  default_currency: Currency;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  icon: string;
  sort_order: number;
  is_system: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  category_id: string;
  occurred_at: string;
  location_name?: string;
  lat?: number;
  lng?: number;
  is_reimbursable: boolean;
  reimbursed_at?: string;
  needs_invoice: boolean;
  visibility: Visibility;
  note?: string;
  created_at: string;
  updated_at: string;
}

export interface ExchangeRate {
  date: string;
  base: string;
  target: string;
  rate: number;
}

export interface SystemConfig {
  key: string;
  value: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
}

export interface CreateTransactionRequest {
  type: TransactionType;
  amount: number;
  currency: Currency;
  category_id: string;
  occurred_at: string;
  location_name?: string;
  lat?: number;
  lng?: number;
  is_reimbursable: boolean;
  needs_invoice: boolean;
  visibility: Visibility;
  note?: string;
}

export interface UpdateTransactionRequest extends Partial<CreateTransactionRequest> {}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  page_size: number;
}

export interface SummaryResponse {
  total_expense: number;
  total_income: number;
  balance: number;
  base_currency: Currency;
  expense_categories: { category_id: string; category_name: string; total: number }[];
  income_categories: { category_id: string; category_name: string; total: number }[];
  exchange_rates: { from: string; to: string; rate: number }[];
}

// ---- Fixed Deposit types ----
export type InterestFrequency = 'maturity' | 'monthly' | 'quarterly' | 'upfront';
export type DepositStatus = 'active' | 'matured' | 'withdrawn';

export interface FixedDeposit {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: Currency;
  interest_rate: number;
  interest_frequency: InterestFrequency;
  start_date: string;
  maturity_date: string;
  term_months?: number;
  expected_interest?: number;
  last_interest_date?: string;
  next_interest_date?: string;
  status: DepositStatus;
  note?: string;
  created_at: string;
  updated_at: string;
}

export interface DepositInterest {
  id: string;
  deposit_id: string;
  amount: number;
  date: string;
  created_at: string;
}

export interface CreateDepositRequest {
  name: string;
  amount: number;
  currency: Currency;
  interest_rate: number;
  interest_frequency: InterestFrequency;
  start_date: string;
  term_months: number;
  note?: string;
}
