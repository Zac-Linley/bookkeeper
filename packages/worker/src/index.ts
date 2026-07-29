import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { SignJWT, jwtVerify } from 'jose';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
  JWT_SECRET: string;
};

type Variables = {
  userId: string;
  userRole: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// CORS
app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));

// Custom JWT auth middleware (dynamic secret from env)
const authMiddleware = async (c: { env: Bindings; req: { header: (name: string) => string | undefined }; set: (key: string, value: unknown) => void; json: (data: unknown, status?: number) => Response }, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: '未登录' }, 401);
  }
  const token = authHeader.slice(7);
  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET || 'bookkeeper-dev-secret-change-in-production');
    const { payload } = await jwtVerify(token, secret);
    c.set('userId', payload.sub as string);
    c.set('userRole', payload.role as string);
    await next();
  } catch {
    return c.json({ success: false, error: '登录已过期' }, 401);
  }
};

// Helper: generate JWT
async function generateToken(userId: string, role: string, secret: string): Promise<string> {
  return new SignJWT({ sub: userId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(secret));
}

function getUserId(c: { get: (key: string) => unknown }): string {
  return (c.get('userId') as string) || '';
}

function getUserRole(c: { get: (key: string) => unknown }): string {
  return (c.get('userRole') as string) || '';
}

async function sendEmail(env: Bindings, to: string, subject: string, body: string) {
  const sender = (await env.DB.prepare('SELECT value FROM system_config WHERE key = ?').bind('smtp_sender').first<{ value: string }>())?.value || 'noreply@bookkeeper.local';
  const resendKey = (await env.DB.prepare('SELECT value FROM system_config WHERE key = ?').bind('resend_api_key').first<{ value: string }>())?.value;

  if (resendKey) {
    // Use Resend API
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: sender, to: [to], subject, text: body }),
    });
  } else {
    // Fallback to MailChannels
    await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: sender, name: '记账本' },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    });
  }
}

// Auth routes (public)
const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

auth.post('/register', async (c) => {
  const { email, password, display_name } = await c.req.json();
  if (!email || !password || !display_name) {
    return c.json({ success: false, error: '缺少必填字段' }, 400);
  }
  if (password.length < 6) {
    return c.json({ success: false, error: '密码至少6位' }, 400);
  }

  const config = await c.env.DB.prepare('SELECT value FROM system_config WHERE key = ?').bind('registration_open').first<{ value: string }>();
  const isOpen = config?.value !== 'false';
  const userCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();

  if (!isOpen && (userCount?.count || 0) > 0) {
    return c.json({ success: false, error: '注册已关闭' }, 403);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return c.json({ success: false, error: '邮箱已注册' }, 409);
  }

  const id = crypto.randomUUID();
  const isFirst = (userCount?.count || 0) === 0;
  const role = isFirst ? 'admin' : 'user';

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password + 'bookkeeper-salt'));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, display_name, role, default_currency) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, email, passwordHash, display_name, role, 'AED').run();

  const secret = c.env.JWT_SECRET || 'bookkeeper-dev-secret-change-in-production';
  const token = await generateToken(id, role, secret);
  return c.json({ success: true, data: { token, user: { id, email, display_name: display_name, role, default_currency: 'AED' } } });
});

auth.post('/login', async (c) => {
  const body = await c.req.json();
  const { email, password } = body;
  if (!email || !password) {
    return c.json({ success: false, error: '缺少邮箱或密码' }, 400);
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND disabled = 0').bind(email).first<{
    id: string; email: string; password_hash: string; display_name: string; role: string; default_currency: string;
  }>();
  if (!user) return c.json({ success: false, error: '邮箱或密码错误' }, 401);

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password + 'bookkeeper-salt'));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  if (passwordHash !== user.password_hash) {
    return c.json({ success: false, error: '邮箱或密码错误' }, 401);
  }

  // Check 2FA
  const twoFactorConfig = await c.env.DB.prepare('SELECT value FROM system_config WHERE key = ?').bind('two_factor_enabled').first<{ value: string }>();
  if (twoFactorConfig?.value === 'true') {
    // Check device trust token
    const deviceToken = body.device_token;
    if (deviceToken) {
      const dt = await c.env.DB.prepare('SELECT id FROM device_tokens WHERE token = ? AND user_id = ? AND expires_at > ?')
        .bind(deviceToken, user.id, new Date().toISOString()).first();
      if (dt) {
        // Trusted device, skip 2FA
        const secret = c.env.JWT_SECRET || 'bookkeeper-dev-secret-change-in-production';
        const token = await generateToken(user.id, user.role, secret);
        return c.json({ success: true, data: { token, user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role, default_currency: user.default_currency } } });
      }
    }
    // Generate code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60000).toISOString();
    await c.env.DB.prepare('INSERT INTO verification_codes (id, email, code, expires_at) VALUES (?, ?, ?, ?)')
      .bind(codeId, email, code, expiresAt).run();

    // Send email via MailChannels
    try {
      await sendEmail(c.env, email, '登录验证码', `您的登录验证码是: ${code}，5分钟内有效。`);
    } catch { /* ignore send failure, code is still in DB */ }

    return c.json({ success: true, data: { two_factor: true, email } });
  }

  const secret = c.env.JWT_SECRET || 'bookkeeper-dev-secret-change-in-production';
  const token = await generateToken(user.id, user.role, secret);
  return c.json({ success: true, data: { token, user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role, default_currency: user.default_currency } } });
});

// Verify 2FA code
auth.post('/verify-2fa', async (c) => {
  const { email, code } = await c.req.json();
  if (!email || !code) return c.json({ success: false, error: '缺少邮箱或验证码' }, 400);

  const vc = await c.env.DB.prepare(
    'SELECT id FROM verification_codes WHERE email = ? AND code = ? AND expires_at > ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
  ).bind(email, code, new Date().toISOString()).first();

  if (!vc) return c.json({ success: false, error: '验证码无效或已过期' }, 401);

  await c.env.DB.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').bind((vc as any).id).run();

  const user = await c.env.DB.prepare('SELECT id, email, display_name, role, default_currency FROM users WHERE email = ? AND disabled = 0').bind(email).first<{
    id: string; email: string; display_name: string; role: string; default_currency: string;
  }>();
  if (!user) return c.json({ success: false, error: '用户不存在' }, 404);

  // Generate device trust token (30 days)
  const deviceToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  await c.env.DB.prepare('INSERT INTO device_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.id, deviceToken, expiresAt).run();

  const secret = c.env.JWT_SECRET || 'bookkeeper-dev-secret-change-in-production';
  const token = await generateToken(user.id, user.role, secret);
  return c.json({ success: true, data: { token, user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role, default_currency: user.default_currency }, device_token: deviceToken } });
});

// Protected auth routes
const authProtected = new Hono<{ Bindings: Bindings; Variables: Variables }>();
authProtected.use('*', authMiddleware);

authProtected.get('/me', async (c) => {
  const userId = getUserId(c);
  const user = await c.env.DB.prepare('SELECT id, email, display_name, role, default_currency FROM users WHERE id = ?')
    .bind(userId).first();
  if (!user) return c.json({ success: false, error: '用户不存在' }, 404);
  return c.json(user);
});

authProtected.put('/profile', async (c) => {
  const userId = getUserId(c);
  const { display_name, default_currency, password } = await c.req.json();

  if (display_name) {
    await c.env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?').bind(display_name, userId).run();
  }
  if (default_currency) {
    await c.env.DB.prepare('UPDATE users SET default_currency = ? WHERE id = ?').bind(default_currency, userId).run();
  }
  if (password && password.length >= 6) {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password + 'bookkeeper-salt'));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(passwordHash, userId).run();
  }

  const user = await c.env.DB.prepare('SELECT id, email, display_name, role, default_currency FROM users WHERE id = ?').bind(userId).first();
  return c.json(user);
});

// Delete own account
authProtected.delete('/account', async (c) => {
  const userId = getUserId(c);
  // Delete all user data
  await c.env.DB.prepare('DELETE FROM attachments WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = ?)').bind(userId).run();
  await c.env.DB.prepare('DELETE FROM transactions WHERE user_id = ?').bind(userId).run();
  await c.env.DB.prepare('DELETE FROM categories WHERE created_by = ?').bind(userId).run();
  await c.env.DB.prepare('DELETE FROM account_members WHERE account_owner_id = ? OR member_user_id = ?').bind(userId, userId).run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  return c.json({ success: true });
});

// Categories routes
const categories = new Hono<{ Bindings: Bindings; Variables: Variables }>();
categories.use('*', authMiddleware);

categories.get('/', async (c) => {
  const type = c.req.query('type');
  const userId = getUserId(c);
  let cats;
  if (type) {
    cats = await c.env.DB.prepare(
      `SELECT * FROM categories WHERE type = ? AND (is_system = 1 OR created_by = ?
       OR created_by IN (SELECT account_owner_id FROM account_members WHERE member_user_id = ?)) ORDER BY sort_order`
    ).bind(type, userId, userId).all();
  } else {
    cats = await c.env.DB.prepare(
      `SELECT * FROM categories WHERE is_system = 1 OR created_by = ?
       OR created_by IN (SELECT account_owner_id FROM account_members WHERE member_user_id = ?) ORDER BY sort_order`
    ).bind(userId, userId).all();
  }
  return c.json({ success: true, data: cats.results });
});

categories.post('/', async (c) => {
  const { name, type, icon } = await c.req.json();
  if (!name || !type) return c.json({ success: false, error: '缺少必填字段' }, 400);

  const id = crypto.randomUUID();
  const maxOrder = await c.env.DB.prepare('SELECT MAX(sort_order) as max_order FROM categories WHERE type = ?').bind(type).first<{ max_order: number }>();
  const sortOrder = (maxOrder?.max_order || 0) + 1;

  await c.env.DB.prepare(
    'INSERT INTO categories (id, name, type, icon, sort_order, is_system, created_by) VALUES (?, ?, ?, ?, ?, 0, ?)'
  ).bind(id, name, type, icon || '📌', sortOrder, getUserId(c)).run();

  const cat = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: cat });
});

categories.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const cat = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first<{ is_system: number; created_by: string }>();
  if (!cat) return c.json({ success: false, error: '类别不存在' }, 404);
  if (cat.is_system) return c.json({ success: false, error: '系统类别不可删除' }, 403);
  if (cat.created_by !== getUserId(c)) return c.json({ success: false, error: '无权删除' }, 403);

  try {
    await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (e: any) {
    if (e.message?.includes('FOREIGN KEY')) {
      return c.json({ success: false, error: '该类别已被记账记录使用，无法删除' }, 409);
    }
    throw e;
  }
});

// Transactions routes
const transactions = new Hono<{ Bindings: Bindings; Variables: Variables }>();
transactions.use('*', authMiddleware);

transactions.get('/', async (c) => {
  const userId = getUserId(c);
  const { type, year, month, page, page_size, search, date_from, date_to, sort_by, sort_order } = c.req.query();
  const p = parseInt(page || '1');
  const ps = parseInt(page_size || '50');
  const offset = (p - 1) * ps;

  let where = `WHERE (t.user_id = ? OR t.user_id IN (SELECT account_owner_id FROM account_members WHERE member_user_id = ?))`;
  const params: any[] = [userId, userId];

  if (type) { where += ' AND t.type = ?'; params.push(type); }

  // Date range (takes priority over year/month)
  if (date_from) {
    where += ' AND t.occurred_at >= ?';
    params.push(date_from);
  }
  if (date_to) {
    where += ' AND t.occurred_at <= ?';
    params.push(date_to + 'T23:59:59Z');
  }

  // Fallback: year/month filter (if no date range)
  if (!date_from && !date_to && year && month) {
    where += ' AND strftime(\'%Y\', t.occurred_at) = ? AND strftime(\'%m\', t.occurred_at) = ?';
    params.push(String(year), String(month).padStart(2, '0'));
  }

  // Search: match note, location_name, or category name
  if (search) {
    where += ` AND (t.note LIKE ? OR t.location_name LIKE ? OR t.category_id IN (SELECT id FROM categories WHERE name LIKE ?))`;
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  // Sort
  let orderBy = 'ORDER BY t.occurred_at DESC';
  const dir = sort_order === 'asc' ? 'ASC' : 'DESC';
  if (sort_by === 'amount') orderBy = `ORDER BY t.amount ${dir}`;
  else if (sort_by === 'category') orderBy = `ORDER BY (SELECT c.name FROM categories c WHERE c.id = t.category_id) ${dir}, t.occurred_at DESC`;
  else if (sort_by === 'occurred_at') orderBy = `ORDER BY t.occurred_at ${dir}`;

  const total = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM transactions t ${where}`).bind(...params).first<{ count: number }>();
  const rows = await c.env.DB.prepare(
    `SELECT t.* FROM transactions t ${where} ${orderBy} LIMIT ? OFFSET ?`
  ).bind(...params, ps, offset).all();

  return c.json({ success: true, data: rows.results, total: total?.count || 0, page: p, page_size: ps });
});

transactions.post('/', async (c) => {
  const body = await c.req.json();
  const userId = getUserId(c);
  const { type, amount, currency, category_id, occurred_at, location_name, lat, lng, is_reimbursable, needs_invoice, visibility, note, idempotency_key } = body;

  if (!type || !amount || !currency || !category_id || !occurred_at) {
    return c.json({ success: false, error: '缺少必填字段' }, 400);
  }

  // Idempotency: check if this key was already processed
  if (idempotency_key) {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM transactions WHERE idempotency_key = ? AND user_id = ?'
    ).bind(idempotency_key, userId).first<{ id: string }>();
    if (existing) {
      const dup = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(existing.id).first();
      return c.json({ success: true, data: dup });
    }
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO transactions (id, user_id, type, amount, currency, category_id, occurred_at, location_name, lat, lng, is_reimbursable, needs_invoice, visibility, note, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, type, amount, currency, category_id, occurred_at, location_name || null, lat || null, lng || null,
    is_reimbursable ? 1 : 0, needs_invoice ? 1 : 0, visibility || 'personal', note || null, idempotency_key || null).run();

  const tx = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: tx });
});

transactions.put('/:id', async (c) => {
  const { id } = c.req.param();
  const userId = getUserId(c);
  const tx = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<{ user_id: string }>();
  if (!tx) return c.json({ success: false, error: '记录不存在' }, 404);

  // Allow owner and shared members to edit
  if (tx.user_id !== userId) {
    const member = await c.env.DB.prepare(
      'SELECT id FROM account_members WHERE account_owner_id = ? AND member_user_id = ?'
    ).bind(tx.user_id, userId).first();
    if (!member) return c.json({ success: false, error: '无权修改' }, 403);
  }

  const body = await c.req.json();

  // Fetch old values for audit log
  const oldTx = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<any>();

  const fields: string[] = [];
  const params: any[] = [];

  const updatable = ['type', 'amount', 'currency', 'category_id', 'occurred_at', 'location_name', 'lat', 'lng', 'is_reimbursable', 'needs_invoice', 'visibility', 'note'];
  for (const key of updatable) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(typeof body[key] === 'boolean' ? (body[key] ? 1 : 0) : body[key]);
    }
  }

  if (fields.length > 0) {
    fields.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    await c.env.DB.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();

    // Audit log: record each changed field
    const now = new Date().toISOString();
    const boolFields = ['is_reimbursable', 'needs_invoice'];
    for (const key of updatable) {
      if (body[key] !== undefined) {
        const oldVal = oldTx?.[key];
        const newVal = body[key];
        const oldStr = boolFields.includes(key) ? (oldVal ? '1' : '0') : String(oldVal ?? '');
        const newStr = boolFields.includes(key) ? (newVal ? '1' : '0') : String(newVal ?? '');
        if (oldStr !== newStr) {
          const logId = crypto.randomUUID();
          await c.env.DB.prepare(
            `INSERT INTO transaction_logs (id, transaction_id, user_id, field, old_value, new_value, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(logId, id, userId, key, oldStr, newStr, now).run();
        }
      }
    }
  }

  const updated = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: updated });
});

transactions.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const userId = getUserId(c);
  const tx = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<{ user_id: string }>();
  if (!tx) return c.json({ success: false, error: '记录不存在' }, 404);

  // Allow owner and shared members to delete
  if (tx.user_id !== userId) {
    const member = await c.env.DB.prepare(
      'SELECT id FROM account_members WHERE account_owner_id = ? AND member_user_id = ?'
    ).bind(tx.user_id, userId).first();
    if (!member) return c.json({ success: false, error: '无权删除' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// Summary routes
const summary = new Hono<{ Bindings: Bindings; Variables: Variables }>();
summary.use('*', authMiddleware);

summary.get('/', async (c) => {
  const userId = getUserId(c);
  const year = c.req.query('year') || String(new Date().getFullYear());
  const month = c.req.query('month') || String(new Date().getMonth() + 1);

  const user = await c.env.DB.prepare('SELECT default_currency FROM users WHERE id = ?').bind(userId).first<{ default_currency: string }>();
  const baseCurrency = user?.default_currency || 'AED';

  const today = new Date().toISOString().slice(0, 10);
  let rates = await c.env.DB.prepare('SELECT * FROM exchange_rates WHERE date = ?').bind(today).all<{ date: string; base: string; target: string; rate: number }>();

  if (!rates.results || rates.results.length === 0) {
    try {
      const resp = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await resp.json() as { rates?: Record<string, number> };
      if (data.rates) {
        const currencies = ['AED', 'CNY', 'USD', 'EUR', 'GBP', 'JPY'];
        for (const cur of currencies) {
          if (data.rates[cur]) {
            await c.env.DB.prepare(
              'INSERT OR REPLACE INTO exchange_rates (date, base, target, rate, updated_at) VALUES (?, ?, ?, ?, ?)'
            ).bind(today, 'USD', cur, data.rates[cur], new Date().toISOString()).run();
          }
        }
        rates = await c.env.DB.prepare('SELECT * FROM exchange_rates WHERE date = ?').bind(today).all();
      }
    } catch { /* fallback to empty rates */ }
  }

  const rateMap: Record<string, number> = {};
  if (rates.results) {
    for (const r of rates.results) {
      rateMap[r.target] = r.rate;
    }
  }

  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const txs = await c.env.DB.prepare(
    `SELECT * FROM transactions WHERE (user_id = ? OR user_id IN (SELECT account_owner_id FROM account_members WHERE member_user_id = ?))
     AND strftime('%Y-%m', occurred_at) = ?`
  ).bind(userId, userId, ym).all<{ type: string; amount: number; currency: string; category_id: string }>();

  const convertToBase = (amount: number, fromCurrency: string): number => {
    if (fromCurrency === baseCurrency) return amount;
    const fromUsd = fromCurrency === 'USD' ? 1 : rateMap[fromCurrency];
    const toUsd = baseCurrency === 'USD' ? 1 : rateMap[baseCurrency];
    if (!fromUsd || !toUsd) return amount;
    return (amount / fromUsd) * toUsd;
  };

  let totalExpense = 0;
  let totalIncome = 0;
  const expenseCatMap: Record<string, { name: string; total: number }> = {};
  const incomeCatMap: Record<string, { name: string; total: number }> = {};

  const txResults = txs.results || [];
  for (const tx of txResults) {
    const converted = convertToBase(tx.amount, tx.currency);
    if (tx.type === 'expense') {
      totalExpense += converted;
      if (!expenseCatMap[tx.category_id]) {
        const cat = await c.env.DB.prepare('SELECT name FROM categories WHERE id = ?').bind(tx.category_id).first<{ name: string }>();
        expenseCatMap[tx.category_id] = { name: cat?.name || '未知', total: 0 };
      }
      expenseCatMap[tx.category_id].total += converted;
    } else {
      totalIncome += converted;
      if (!incomeCatMap[tx.category_id]) {
        const cat = await c.env.DB.prepare('SELECT name FROM categories WHERE id = ?').bind(tx.category_id).first<{ name: string }>();
        incomeCatMap[tx.category_id] = { name: cat?.name || '未知', total: 0 };
      }
      incomeCatMap[tx.category_id].total += converted;
    }
  }

  const targetCurrencies = ['AED', 'CNY', 'USD'].filter(c => c !== baseCurrency);
  const displayRates = targetCurrencies.map(target => {
    const baseToUsd = baseCurrency === 'USD' ? 1 : rateMap[baseCurrency];
    const usdToTarget = target === 'USD' ? 1 : rateMap[target];
    return {
      from: baseCurrency,
      to: target,
      rate: baseToUsd && usdToTarget ? usdToTarget / baseToUsd : 0,
    };
  }).filter(r => r.rate > 0);

  return c.json({
    success: true,
    data: {
      total_expense: Math.round(totalExpense * 100) / 100,
      total_income: Math.round(totalIncome * 100) / 100,
      balance: Math.round((totalIncome - totalExpense) * 100) / 100,
      base_currency: baseCurrency,
      expense_categories: Object.entries(expenseCatMap).map(([category_id, v]) => ({
        category_id, category_name: v.name, total: Math.round(v.total * 100) / 100,
      })),
      income_categories: Object.entries(incomeCatMap).map(([category_id, v]) => ({
        category_id, category_name: v.name, total: Math.round(v.total * 100) / 100,
      })),
      exchange_rates: displayRates,
    },
  });
});

// Exchange rates routes
const exchangeRates = new Hono<{ Bindings: Bindings; Variables: Variables }>();
exchangeRates.use('*', authMiddleware);

exchangeRates.get('/', async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const rates = await c.env.DB.prepare('SELECT * FROM exchange_rates WHERE date = ?').bind(today).all();
  return c.json({ success: true, data: { rates: rates.results } });
});

// Admin routes
const admin = new Hono<{ Bindings: Bindings; Variables: Variables }>();
admin.use('*', authMiddleware);

admin.get('/config', async (c) => {
  if (getUserRole(c) !== 'admin') return c.json({ success: false, error: '需要管理员权限' }, 403);
  const rows = await c.env.DB.prepare('SELECT * FROM system_config').all<{ key: string; value: string }>();
  const config: Record<string, string> = {};
  for (const r of rows.results || []) config[r.key] = r.value;
  return c.json(config);
});

admin.put('/config', async (c) => {
  if (getUserRole(c) !== 'admin') return c.json({ success: false, error: '需要管理员权限' }, 403);
  const { key, value } = await c.req.json();
  if (!key) return c.json({ success: false, error: '缺少 key' }, 400);

  await c.env.DB.prepare(
    'INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?'
  ).bind(key, value, new Date().toISOString(), value, new Date().toISOString()).run();

  return c.json({ success: true });
});

admin.get('/users', async (c) => {
  if (getUserRole(c) !== 'admin') return c.json({ success: false, error: '需要管理员权限' }, 403);
  const users = await c.env.DB.prepare('SELECT id, email, display_name, role, default_currency, disabled FROM users ORDER BY created_at').all();
  return c.json({ success: true, data: users.results });
});

admin.put('/users/:id', async (c) => {
  if (getUserRole(c) !== 'admin') return c.json({ success: false, error: '需要管理员权限' }, 403);
  const { id } = c.req.param();
  const { role, disabled } = await c.req.json();
  if (role) {
    await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id).run();
  }
  if (disabled !== undefined) {
    await c.env.DB.prepare('UPDATE users SET disabled = ? WHERE id = ?').bind(disabled ? 1 : 0, id).run();
  }
  return c.json({ success: true });
});

admin.delete('/users/:id', async (c) => {
  if (getUserRole(c) !== 'admin') return c.json({ success: false, error: '需要管理员权限' }, 403);
  const { id } = c.req.param();
  // Don't allow deleting self
  if (id === getUserId(c)) return c.json({ success: false, error: '不能删除自己' }, 400);
  await c.env.DB.prepare('DELETE FROM attachments WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = ?)').bind(id).run();
  await c.env.DB.prepare('DELETE FROM transactions WHERE user_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM categories WHERE created_by = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM account_members WHERE account_owner_id = ? OR member_user_id = ?').bind(id, id).run();
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// Send test 2FA code (for admin verification before enabling)
admin.post('/send-test-code', async (c) => {
  if (getUserRole(c) !== 'admin') return c.json({ success: false, error: '需要管理员权限' }, 403);
  const user = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(getUserId(c)).first<{ email: string }>();
  if (!user?.email) return c.json({ success: false, error: '找不到邮箱' }, 400);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await c.env.DB.prepare('INSERT INTO verification_codes (id, email, code, expires_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.email, code, new Date(Date.now() + 5 * 60000).toISOString()).run();
  try {
    await sendEmail(c.env, user.email, '2FA 测试验证码', `测试验证码: ${code}`);
  } catch { /* ignore */ }
  return c.json({ success: true });
});

admin.post('/verify-test-code', async (c) => {
  if (getUserRole(c) !== 'admin') return c.json({ success: false, error: '需要管理员权限' }, 403);
  const { code } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(getUserId(c)).first<{ email: string }>();
  if (!user?.email) return c.json({ success: false, error: '找不到邮箱' }, 400);
  const vc = await c.env.DB.prepare('SELECT id FROM verification_codes WHERE email = ? AND code = ? AND expires_at > ? AND used = 0 ORDER BY created_at DESC LIMIT 1')
    .bind(user.email, code, new Date().toISOString()).first();
  if (!vc) return c.json({ success: false, error: '验证码无效或已过期' }, 401);
  await c.env.DB.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').bind((vc as any).id).run();
  return c.json({ success: true });
});

// Sharing routes
const sharing = new Hono<{ Bindings: Bindings; Variables: Variables }>();
sharing.use('*', authMiddleware);

sharing.get('/', async (c) => {
  const userId = getUserId(c);
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.display_name FROM account_members am
     JOIN users u ON u.id = am.member_user_id
     WHERE am.account_owner_id = ?`
  ).bind(userId).all<{ id: string; email: string; display_name: string }>();
  return c.json({ success: true, data: rows.results });
});

sharing.post('/', async (c) => {
  const userId = getUserId(c);
  const { email } = await c.req.json();
  if (!email) return c.json({ success: false, error: '请输入邮箱' }, 400);

  const target = await c.env.DB.prepare('SELECT id, email, display_name FROM users WHERE email = ?').bind(email).first<{ id: string; email: string; display_name: string }>();
  if (!target) return c.json({ success: false, error: '用户不存在' }, 404);
  if (target.id === userId) return c.json({ success: false, error: '不能共享给自己' }, 400);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM account_members WHERE account_owner_id = ? AND member_user_id = ?'
  ).bind(userId, target.id).first();
  if (existing) return c.json({ success: false, error: '已共享给该用户' }, 409);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO account_members (id, account_owner_id, member_user_id) VALUES (?, ?, ?)'
  ).bind(id, userId, target.id).run();

  return c.json({ success: true, data: { id, email: target.email, display_name: target.display_name } });
});

sharing.delete('/:id', async (c) => {
  const userId = getUserId(c);
  const { id } = c.req.param();
  await c.env.DB.prepare(
    'DELETE FROM account_members WHERE id = ? AND account_owner_id = ?'
  ).bind(id, userId).run();
  return c.json({ success: true });
});

// Mount routes
app.route('/api/auth', auth);
app.route('/api/auth', authProtected);
app.route('/api/categories', categories);
app.route('/api/transactions', transactions);
app.route('/api/summary', summary);
app.route('/api/exchange-rates', exchangeRates);
app.route('/api/admin', admin);
app.route('/api/sharing', sharing);

// Cron trigger: update exchange rates daily
app.get('/__cron/exchange-rates', async (c) => {
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await resp.json() as { rates?: Record<string, number> };
    if (data.rates) {
      const today = new Date().toISOString().slice(0, 10);
      const currencies = ['AED', 'CNY', 'USD', 'EUR', 'GBP', 'JPY'];
      for (const cur of currencies) {
        if (data.rates[cur]) {
          await c.env.DB.prepare(
            'INSERT OR REPLACE INTO exchange_rates (date, base, target, rate, updated_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(today, 'USD', cur, data.rates[cur], new Date().toISOString()).run();
        }
      }
    }
    return c.json({ success: true, message: 'Rates updated' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ success: false, error: msg }, 500);
  }
});

// Attachment routes
const attachments = new Hono<{ Bindings: Bindings; Variables: Variables }>();
attachments.use('*', authMiddleware);

attachments.get('/list/:transactionId', async (c) => {
  const { transactionId } = c.req.param();
  const rows = await c.env.DB.prepare(
    'SELECT id, r2_key, original_name, content_type FROM attachments WHERE transaction_id = ?'
  ).bind(transactionId).all();
  return c.json({ success: true, data: rows.results });
});

attachments.post('/upload', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.parseBody<{ file?: File; transaction_id?: string }>();
  const file = body.file;
  const transactionId = body.transaction_id;

  if (!file || !transactionId) {
    return c.json({ success: false, error: '缺少文件或交易ID' }, 400);
  }

  // Verify transaction belongs to user
  const tx = await c.env.DB.prepare('SELECT id FROM transactions WHERE id = ? AND user_id = ?')
    .bind(transactionId, userId).first();
  if (!tx) return c.json({ success: false, error: '交易记录不存在' }, 404);

  const id = crypto.randomUUID();
  const ext = file.name?.split('.').pop() || 'jpg';
  const r2Key = `attachments/${userId}/${id}.${ext}`;

  const buffer = await file.arrayBuffer();
  await c.env.R2.put(r2Key, buffer, {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  });

  await c.env.DB.prepare(
    'INSERT INTO attachments (id, transaction_id, r2_key, original_name, content_type) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, transactionId, r2Key, file.name, file.type).run();

  return c.json({ success: true, data: { id, r2_key: r2Key, original_name: file.name } });
});

attachments.get('/:id', async (c) => {
  const { id } = c.req.param();
  const att = await c.env.DB.prepare(
    `SELECT a.* FROM attachments a JOIN transactions t ON t.id = a.transaction_id
     WHERE a.id = ? AND (t.user_id = ? OR t.user_id IN (SELECT account_owner_id FROM account_members WHERE member_user_id = ?))`
  ).bind(id, getUserId(c), getUserId(c)).first<{ r2_key: string; content_type: string }>();

  if (!att) return c.json({ success: false, error: '附件不存在' }, 404);

  const obj = await c.env.R2.get(att.r2_key);
  if (!obj) return c.json({ success: false, error: '文件不存在' }, 404);

  const data = await obj.arrayBuffer();
  return new Response(data, {
    headers: {
      'Content-Type': att.content_type || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
});

attachments.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const userId = getUserId(c);
  const att = await c.env.DB.prepare(
    `SELECT a.id, a.r2_key FROM attachments a JOIN transactions t ON t.id = a.transaction_id
     WHERE a.id = ? AND t.user_id = ?`
  ).bind(id, userId).first<{ id: string; r2_key: string }>();

  if (!att) return c.json({ success: false, error: '附件不存在或无权限' }, 404);

  await c.env.R2.delete(att.r2_key);
  await c.env.DB.prepare('DELETE FROM attachments WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

app.route('/api/attachments', attachments);

// Deposit routes
const deposits = new Hono<{ Bindings: Bindings; Variables: Variables }>();
deposits.use('*', authMiddleware);

deposits.get('/', async (c) => {
  const userId = getUserId(c);
  const { status } = c.req.query();
  let where = '(fd.user_id = ? OR fd.user_id IN (SELECT account_owner_id FROM account_members WHERE member_user_id = ?))';
  const params: any[] = [userId, userId];
  if (status) { where += ' AND fd.status = ?'; params.push(status); }
  const rows = await c.env.DB.prepare(
    `SELECT fd.*, (SELECT SUM(amount) FROM deposit_interests WHERE deposit_id = fd.id) as total_interest_paid
     FROM fixed_deposits fd WHERE ${where} ORDER BY fd.maturity_date ASC`
  ).bind(...params).all();
  return c.json({ success: true, data: rows.results });
});

deposits.post('/', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const { name, amount, currency, interest_rate, interest_frequency, start_date, term_months, note, create_expense } = body;
  if (!name || !amount || !interest_rate || !start_date || !term_months) {
    return c.json({ success: false, error: '缺少必填字段' }, 400);
  }
  const id = crypto.randomUUID();
  const start = new Date(start_date);
  const maturity = new Date(start);
  maturity.setMonth(maturity.getMonth() + term_months);
  const maturityDate = maturity.toISOString().slice(0, 10);
  const expectedInterest = Math.round(amount * (interest_rate / 100) * ((maturity.getTime() - start.getTime()) / 86400000 / 360) * 100) / 100;

  // Next interest date
  let nextInterestDate: string | null = null;
  let lastInterestDate: string | null = null;
  if (interest_frequency === 'monthly') {
    nextInterestDate = new Date(start.getTime() + 30*86400000).toISOString().slice(0, 10);
  } else if (interest_frequency === 'quarterly') {
    nextInterestDate = new Date(start.getTime() + 90*86400000).toISOString().slice(0, 10);
  } else if (interest_frequency === 'upfront') {
    lastInterestDate = start_date;
  }

  await c.env.DB.prepare(
    `INSERT INTO fixed_deposits (id, user_id, name, amount, currency, interest_rate, interest_frequency, start_date, maturity_date, term_months, expected_interest, next_interest_date, last_interest_date, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, name, amount, currency || 'AED', interest_rate, interest_frequency || 'maturity', start_date, maturityDate, term_months, expectedInterest, nextInterestDate, lastInterestDate, note || null).run();

  // Upfront: pay all interest now (after deposit row exists for FK)
  if (interest_frequency === 'upfront') {
    try {
      const txId = crypto.randomUUID();
      const now = new Date().toISOString();
      await c.env.DB.prepare(
        `INSERT INTO transactions (id, user_id, type, amount, currency, category_id, occurred_at, note, visibility)
         VALUES (?, ?, 'income', ?, ?, 'cat-sys-i5', ?, ?, 'personal')`
      ).bind(txId, userId, expectedInterest, currency || 'AED', now, `本金${amount}-定存${name}-${interest_rate}%`).run();
      const intId = crypto.randomUUID();
      await c.env.DB.prepare('INSERT INTO deposit_interests (id, deposit_id, amount, date) VALUES (?, ?, ?, ?)')
        .bind(intId, id, expectedInterest, now.slice(0, 10)).run();
    } catch (e: any) {
      return c.json({ success: false, error: '创建预付利息失败: ' + e.message }, 500);
    }
  }

  // Create expense transaction if requested
  if (create_expense) {
    const txId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO transactions (id, user_id, type, amount, currency, category_id, occurred_at, note, visibility)
       VALUES (?, ?, 'expense', ?, ?, 'cat-sys-e12', ?, ?, 'personal')`
    ).bind(txId, userId, amount, currency || 'AED', start_date, `定存-${term_months}个月-${interest_rate}%`).run();
  }

  const deposit = await c.env.DB.prepare('SELECT * FROM fixed_deposits WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: deposit });
});

deposits.put('/:id', async (c) => {
  const userId = getUserId(c);
  const { id } = c.req.param();
  const d = await c.env.DB.prepare('SELECT * FROM fixed_deposits WHERE id = ? AND user_id = ?').bind(id, userId).first<{ user_id: string; start_date: string; amount: number; interest_rate: number }>();
  if (!d) return c.json({ success: false, error: '记录不存在' }, 404);
  const body = await c.req.json();
  const fields: string[] = [];
  const params: any[] = [];
  ['name','amount','currency','interest_rate','interest_frequency','note'].forEach(k => {
    if (body[k] !== undefined) { fields.push(`${k} = ?`); params.push(body[k]); }
  });
  if (body.start_date) { fields.push('start_date = ?'); params.push(body.start_date); }
  if (body.term_months) {
    fields.push('term_months = ?'); params.push(body.term_months);
    const start = new Date(body.start_date || d.start_date);
    const maturity = new Date(start);
    maturity.setMonth(maturity.getMonth() + body.term_months);
    fields.push('maturity_date = ?'); params.push(maturity.toISOString().slice(0, 10));
    const amt = body.amount !== undefined ? body.amount : d.amount;
    const rate = body.interest_rate !== undefined ? body.interest_rate : d.interest_rate;
    const expected = Math.round(amt * (rate / 100) * ((maturity.getTime() - start.getTime()) / 86400000 / 360) * 100) / 100;
    fields.push('expected_interest = ?'); params.push(expected);
  }
  if (fields.length > 0) {
    fields.push('updated_at = ?'); params.push(new Date().toISOString()); params.push(id);
    await c.env.DB.prepare(`UPDATE fixed_deposits SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  }
  const result = await c.env.DB.prepare('SELECT * FROM fixed_deposits WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: result });
});

deposits.delete('/:id', async (c) => {
  const userId = getUserId(c);
  const { id } = c.req.param();
  const d = await c.env.DB.prepare('SELECT id FROM fixed_deposits WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!d) return c.json({ success: false, error: '记录不存在' }, 404);
  await c.env.DB.prepare('DELETE FROM fixed_deposits WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// Pay interest (提前结息)
deposits.post('/:id/pay-interest', async (c) => {
  const userId = getUserId(c);
  const { id } = c.req.param();
  const d = await c.env.DB.prepare('SELECT * FROM fixed_deposits WHERE id = ? AND user_id = ?').bind(id, userId).first<{
    amount: number; interest_rate: number; interest_frequency: string; currency: string;
    start_date: string; next_interest_date: string; status: string;
  }>();
  if (!d) return c.json({ success: false, error: '记录不存在' }, 404);
  if (d.status !== 'active') return c.json({ success: false, error: '只有进行中的定存可以结息' }, 400);

  // Calculate interest
  const freq = d.interest_frequency === 'quarterly' ? 3 : 1;
  const interestAmount = Math.round(d.amount * (d.interest_rate / 100) * (freq / 12) * 100) / 100;

  // Create interest income transaction
  const txId = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO transactions (id, user_id, type, amount, currency, category_id, occurred_at, note, visibility)
     VALUES (?, ?, 'income', ?, ?, 'cat-sys-i5', ?, ?, 'personal')`
  ).bind(txId, userId, interestAmount, d.currency || 'AED', now, `本金${d.amount}-定期结息-${d.interest_rate}%`).run();

  // Record interest payment
  const intId = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO deposit_interests (id, deposit_id, amount, date) VALUES (?, ?, ?, ?)')
    .bind(intId, id, interestAmount, now.slice(0, 10)).run();

  // Update next interest date
  let nextDate: string | null = null;
  if (d.interest_frequency !== 'maturity' && d.next_interest_date) {
    const next = new Date(d.next_interest_date);
    next.setMonth(next.getMonth() + freq);
    nextDate = next.toISOString().slice(0, 10);
  }
  await c.env.DB.prepare('UPDATE fixed_deposits SET last_interest_date = ?, next_interest_date = ? WHERE id = ?')
    .bind(now.slice(0, 10), nextDate, id).run();

  return c.json({ success: true, data: { interest: interestAmount, transaction_id: txId } });
});

// Mature (到期提现)
deposits.post('/:id/mature', async (c) => {
  const userId = getUserId(c);
  const { id } = c.req.param();
  const d = await c.env.DB.prepare('SELECT * FROM fixed_deposits WHERE id = ? AND user_id = ?').bind(id, userId).first<{
    amount: number; currency: string; interest_rate: number; status: string;
    expected_interest: number; interest_frequency: string;
  }>();
  if (!d) return c.json({ success: false, error: '记录不存在' }, 404);
  if (d.status !== 'active') return c.json({ success: false, error: '该定存已处理' }, 400);

  // Calculate remaining interest
  const paidResult = await c.env.DB.prepare('SELECT SUM(amount) as paid FROM deposit_interests WHERE deposit_id = ?').bind(id).first<{ paid: number }>();
  const remainingInterest = Math.max(0, Math.round(((d.expected_interest || 0) - (paidResult?.paid || 0)) * 100) / 100);

  const now = new Date().toISOString();

  // Create interest income if any remaining
  if (remainingInterest > 0) {
    const txId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO transactions (id, user_id, type, amount, currency, category_id, occurred_at, note, visibility)
       VALUES (?, ?, 'income', ?, ?, 'cat-sys-i5', ?, ?, 'personal')`
    ).bind(txId, userId, remainingInterest, d.currency, now, `本金${d.amount}-到期利息-${d.interest_rate}%`).run();
  }

  // Create principal return transaction
  const principalTxId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO transactions (id, user_id, type, amount, currency, category_id, occurred_at, note, visibility)
     VALUES (?, ?, 'income', ?, ?, 'cat-sys-i4', ?, ?, 'personal')`
  ).bind(principalTxId, userId, d.amount, d.currency, now, `本金提现-利息${remainingInterest}`).run();

  await c.env.DB.prepare('UPDATE fixed_deposits SET status = ? WHERE id = ?').bind('matured', id).run();
  return c.json({ success: true, data: { remaining_interest: remainingInterest } });
});

app.route('/api/deposits', deposits);

// Transaction logs
const txLogs = new Hono<{ Bindings: Bindings; Variables: Variables }>();
txLogs.use('*', authMiddleware);

txLogs.get('/:transactionId', async (c) => {
  const { transactionId } = c.req.param();
  const userId = getUserId(c);
  // Verify access: owner or shared member
  const tx = await c.env.DB.prepare(
    `SELECT id FROM transactions WHERE id = ? AND (user_id = ?
     OR user_id IN (SELECT account_owner_id FROM account_members WHERE member_user_id = ?))`
  ).bind(transactionId, userId, userId).first();
  if (!tx) return c.json({ success: false, error: '记录不存在' }, 404);

  const logs = await c.env.DB.prepare(
    `SELECT tl.*, u.display_name
     FROM transaction_logs tl
     LEFT JOIN users u ON u.id = tl.user_id
     WHERE tl.transaction_id = ?
     ORDER BY tl.created_at DESC`
  ).bind(transactionId).all();
  return c.json({ success: true, data: logs.results });
});

app.route('/api/transactions/logs', txLogs);

export default app;
