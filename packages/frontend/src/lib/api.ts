const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD
  ? 'https://bookkeeper-api.zac-linley.workers.dev/api'
  : '/api');

let token: string | null = localStorage.getItem('token');

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}

export function getToken() {
  return token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  // API wraps responses in { success, data }; unwrap if present
  return json.success !== undefined ? json.data as T : json as T;
}

// Auth
export const api = {
  login: (data: { email: string; password: string }) => {
    const deviceToken = localStorage.getItem('device_token');
    const body = deviceToken ? { ...data, device_token: deviceToken } : data;
    return request<{ token?: string; user?: import('@bookkeeper/shared').UserInfo; two_factor?: boolean; email?: string }>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
  },

  verify2FA: (data: { email: string; code: string }) =>
    request<{ token: string; user: import('@bookkeeper/shared').UserInfo; device_token?: string }>('/auth/verify-2fa', { method: 'POST', body: JSON.stringify(data) }),

  register: (data: { email: string; password: string; display_name: string }) =>
    request<{ token: string; user: import('@bookkeeper/shared').UserInfo }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  getMe: () => request<import('@bookkeeper/shared').UserInfo>('/auth/me'),

  // Categories
  getCategories: (type?: string) =>
    request<import('@bookkeeper/shared').Category[]>(`/categories${type ? `?type=${type}` : ''}`),

  createCategory: (data: { name: string; type: string; icon: string }) =>
    request<import('@bookkeeper/shared').Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),

  deleteCategory: (id: string) =>
    request<void>(`/categories/${id}`, { method: 'DELETE' }),

  // Transactions
  getTransactions: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('@bookkeeper/shared').Transaction[]>(`/transactions${qs}`);
  },

  getTransactionsWithTotal: async (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = getToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
    const res = await fetch(`${API_BASE}/transactions${qs}`, { headers });
    const json = await res.json();
    return { data: json.data as import('@bookkeeper/shared').Transaction[], total: json.total as number };
  },

  createTransaction: (data: import('@bookkeeper/shared').CreateTransactionRequest) =>
    request<import('@bookkeeper/shared').Transaction>('/transactions', { method: 'POST', body: JSON.stringify(data) }),

  updateTransaction: (id: string, data: import('@bookkeeper/shared').UpdateTransactionRequest) =>
    request<import('@bookkeeper/shared').Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteTransaction: (id: string) =>
    request<void>(`/transactions/${id}`, { method: 'DELETE' }),

  getTransactionLogs: (transactionId: string) =>
    request<import('@bookkeeper/shared').TransactionLog[]>(`/transactions/logs/${transactionId}`),

  // Summary
  getSummary: (params?: { year?: number; month?: number }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request<import('@bookkeeper/shared').SummaryResponse>(`/summary${qs}`);
  },

  // Exchange Rates
  getExchangeRates: () =>
    request<{ rates: import('@bookkeeper/shared').ExchangeRate[] }>('/exchange-rates'),

  // Admin
  getConfig: () =>
    request<Record<string, string>>('/admin/config'),

  updateConfig: (key: string, value: string) =>
    request<void>('/admin/config', { method: 'PUT', body: JSON.stringify({ key, value }) }),

  getUsers: () =>
    request<import('@bookkeeper/shared').UserInfo[]>('/admin/users'),

  updateUser: (id: string, data: { role?: string; disabled?: boolean }) =>
    request<void>(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteUser: (id: string) =>
    request<void>(`/admin/users/${id}`, { method: 'DELETE' }),

  sendTestCode: () => request<void>('/admin/send-test-code', { method: 'POST' }),
  verifyTestCode: (code: string) => request<void>('/admin/verify-test-code', { method: 'POST', body: JSON.stringify({ code }) }),

  // User settings
  updateProfile: (data: { display_name?: string; default_currency?: string; password?: string }) =>
    request<import('@bookkeeper/shared').UserInfo>('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),

  deleteAccount: () => request<void>('/auth/account', { method: 'DELETE' }),

  // Sharing
  getSharedUsers: () =>
    request<{ id: string; email: string; display_name: string }[]>('/sharing'),

  addSharedUser: (email: string) =>
    request<{ id: string; email: string; display_name: string }>('/sharing', { method: 'POST', body: JSON.stringify({ email }) }),

  removeSharedUser: (id: string) =>
    request<void>(`/sharing/${id}`, { method: 'DELETE' }),

  // Attachments
  uploadAttachment: async (file: File, transactionId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('transaction_id', transactionId);
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/attachments/upload`, { method: 'POST', body: formData, headers });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Upload failed');
    return json.success !== undefined ? json.data : json;
  },

  getAttachmentUrl: (id: string) => `${API_BASE}/attachments/${id}`,

  listAttachments: (transactionId: string) =>
    request<{ id: string; r2_key: string; original_name: string; content_type: string }[]>(`/attachments/list/${transactionId}`),

  deleteAttachment: (id: string) =>
    request<void>(`/attachments/${id}`, { method: 'DELETE' }),

  // Deposits
  getDeposits: (params?: { status?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('@bookkeeper/shared').FixedDeposit[]>(`/deposits${qs}`);
  },
  createDeposit: (data: import('@bookkeeper/shared').CreateDepositRequest) =>
    request<import('@bookkeeper/shared').FixedDeposit>('/deposits', { method: 'POST', body: JSON.stringify(data) }),
  updateDeposit: (id: string, data: any) =>
    request<import('@bookkeeper/shared').FixedDeposit>(`/deposits/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDeposit: (id: string) =>
    request<void>(`/deposits/${id}`, { method: 'DELETE' }),
  payInterest: (id: string) =>
    request<{ interest: number; transaction_id: string }>(`/deposits/${id}/pay-interest`, { method: 'POST' }),
  matureDeposit: (id: string) =>
    request<{ remaining_interest: number }>(`/deposits/${id}/mature`, { method: 'POST' }),
};
