import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { IconChevronLeft } from '../lib/icons';

export default function AccountInfoPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const handleSave = async () => {
    setSaving(true); setMsg('');
    try {
      const data: any = {};
      if (displayName !== user?.display_name) data.display_name = displayName;
      if (password && password.length >= 6) data.password = password;
      if (Object.keys(data).length > 0) {
        await api.updateProfile(data);
        await refreshUser();
        setPassword('');
      }
      setMsg('已保存');
    } catch (err: any) {
      setMsg(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-gray-400 dark:text-gray-500"><IconChevronLeft size={18} stroke={1.5} /></button>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">账户信息</span>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">昵称</p>
          <input type="text" className="input-field" value={displayName}
            onChange={e => setDisplayName(e.target.value)} />
        </div>

        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">新密码（不修改则留空）</p>
          <input type="password" className="input-field" placeholder="至少6位"
            value={password} onChange={e => setPassword(e.target.value)} minLength={6} />
        </div>

        {msg && <p className={`text-xs ${msg === '已保存' ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}

        <button onClick={handleSave} disabled={saving}
          className="btn-primary w-full">
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  );
}
