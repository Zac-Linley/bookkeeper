import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  default_currency: string;
  disabled: number;
}

export default function AdminPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [show2FAVerify, setShow2FAVerify] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFALoading, setTwoFALoading] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const c = await api.getConfig();
      const u = await api.getUsers() as any;
      setConfig(c);
      setUsers(Array.isArray(u) ? u : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleRegistration = async () => {
    const newVal = config.registration_open === 'true' ? 'false' : 'true';
    await api.updateConfig('registration_open', newVal);
    setConfig(prev => ({ ...prev, registration_open: newVal }));
    setMsg('已更新');
  };

  const toggleUserRole = async (u: AdminUser) => {
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    await api.updateUser(u.id, { role: newRole });
    fetch();
    setMsg('已更新');
  };

  const toggleDisabled = async (u: AdminUser) => {
    await api.updateUser(u.id, { disabled: !u.disabled });
    fetch();
    setMsg('已更新');
  };

  const handleDeleteUser = async (u: AdminUser) => {
    if (!confirm(`确定删除用户「${u.display_name}」？其所有数据将被永久删除。`)) return;
    if (!confirm('再次确认删除？')) return;
    await api.deleteUser(u.id);
    fetch();
    setMsg('已删除');
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">管理后台</h2>

      {msg && <p className="text-green-600 text-sm">{msg}</p>}

      {/* Registration toggle */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">开放注册</p>
            <p className="text-xs text-gray-400">
              {config.registration_open === 'true' ? '✅ 开放中' : '⛔ 已关闭'}
            </p>
          </div>
          <button onClick={toggleRegistration}
            className={`btn-primary-sm ${config.registration_open === 'true' ? '!bg-red-500 active:!bg-red-600' : '!bg-green-500 active:!bg-green-600'}`}>
            {config.registration_open === 'true' ? '关闭注册' : '开放注册'}
          </button>
        </div>
      </div>

      {/* 2FA toggle */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">二次验证</p>
            <p className="text-xs text-gray-400">登录时发送邮箱验证码</p>
          </div>
          <button onClick={async () => {
            if (config.two_factor_enabled !== 'true') {
              // Enabling: send test code first
              setTwoFALoading(true);
              try {
                await api.sendTestCode();
                setShow2FAVerify(true);
                setTwoFACode('');
              } catch (err: any) { setMsg(err.message || '发送失败'); }
              finally { setTwoFALoading(false); }
              return;
            }
            // Disabling: just turn off
            await api.updateConfig('two_factor_enabled', 'false');
            setConfig(prev => ({ ...prev, two_factor_enabled: 'false' }));
            setMsg('已关闭');
          }}
            className={`btn-primary-sm ${config.two_factor_enabled === 'true' ? '!bg-red-500 active:!bg-red-600' : '!bg-green-500 active:!bg-green-600'}`}>
            {config.two_factor_enabled === 'true' ? '关闭 2FA' : (twoFALoading ? '发送中...' : '开启 2FA')}
          </button>

          {show2FAVerify && (
            <div className="mt-3 flex gap-2">
              <input type="text" inputMode="numeric" maxLength={6}
                className="input-sm flex-1 text-center tracking-widest"
                placeholder="验证码" value={twoFACode} onChange={e => setTwoFACode(e.target.value)} />
              <button onClick={async () => {
                if (!twoFACode) return;
                try {
                  await api.verifyTestCode(twoFACode);
                  await api.updateConfig('two_factor_enabled', 'true');
                  setConfig(prev => ({ ...prev, two_factor_enabled: 'true' }));
                  setShow2FAVerify(false);
                  setMsg('2FA 已开启');
                } catch (err: any) { setMsg(err.message || '验证失败'); }
              }} className="btn-primary-sm">确认</button>
            </div>
          )}
        </div>
      </div>

      {/* SMTP config */}
      <div className="card">
        <h3 className="font-medium text-sm mb-2">邮件配置</h3>
        <p className="text-xs text-gray-400 mb-3">使用 Resend（免费100封/天）或 MailChannels 发送验证码</p>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-1">Resend API Key</p>
            <div className="flex gap-2">
              <input type="text" className="input-sm flex-1" placeholder="re_xxxxxxxx"
                value={config.resend_api_key || ''}
                onChange={e => setConfig(prev => ({ ...prev, resend_api_key: e.target.value }))} />
              <button onClick={async () => {
                await api.updateConfig('resend_api_key', config.resend_api_key || '');
                setMsg('已保存');
              }} className="btn-primary-sm">保存</button>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">发件邮箱</p>
            <div className="flex gap-2">
              <input type="email" className="input-sm flex-1" placeholder="noreply@yourdomain.com"
                value={config.smtp_sender || ''}
                onChange={e => setConfig(prev => ({ ...prev, smtp_sender: e.target.value }))} />
              <button onClick={async () => {
                await api.updateConfig('smtp_sender', config.smtp_sender || '');
                setMsg('已保存');
              }} className="btn-primary-sm">保存</button>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          优先使用 Resend；未配置则回退到 MailChannels（需域名 SPF）
        </p>
      </div>

      {/* User list */}
      <div className="card">
        <h3 className="font-medium text-sm mb-3">用户管理 ({users.length})</h3>
        <div className="space-y-1">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{u.display_name}</p>
                  {!!u.disabled && <span className="text-[10px] bg-red-100 text-red-600 rounded px-1.5 py-0.5">已禁用</span>}
                </div>
                <p className="text-xs text-gray-400 truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button onClick={() => toggleUserRole(u)}
                  className={`text-[10px] px-2 py-1 rounded-full font-medium ${u.role === 'admin' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                  {u.role === 'admin' ? '管理员' : '用户'}
                </button>
                <button onClick={() => toggleDisabled(u)}
                  className={`text-[10px] px-2 py-1 rounded-full font-medium ${u.disabled ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-500'}`}>
                  {u.disabled ? '启用' : '禁用'}
                </button>
                <button onClick={() => handleDeleteUser(u)}
                  className="text-[10px] px-2 py-1 rounded-full font-medium bg-red-50 text-red-500">
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
