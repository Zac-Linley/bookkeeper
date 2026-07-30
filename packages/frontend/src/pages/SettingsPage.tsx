import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { IconUser, IconShare, IconFolders, IconUserCog, IconLogout, IconChevronRight } from '../lib/icons';

const menuItems = [
  { icon: IconUser, label: '账户信息', desc: '昵称 · 货币 · 密码', to: '/settings/account' },
  { icon: IconShare, label: '数据共享', desc: '', to: '/settings/sharing' },
  { icon: IconFolders, label: '管理类别', desc: '', to: '/categories' },
];

export default function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">设置</h2>

      {/* User avatar + info */}
      <div className="flex items-center gap-3 py-2">
        <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-sm font-medium text-primary-600">
          {(user?.display_name || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{user?.display_name}</p>
        </div>
        <select
          value={user?.default_currency || 'AED'}
          onChange={async (e) => {
            try {
              await api.updateProfile({ default_currency: e.target.value as any });
              await refreshUser();
            } catch {}
          }}
          className="text-xs text-gray-500 dark:text-gray-500 bg-transparent outline-none border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1">
          <option value="AED">AED</option>
          <option value="CNY">CNY</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="JPY">JPY</option>
        </select>
      </div>

      {/* Menu list */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {menuItems.map((item, i) => (
          <button key={item.to}
            onClick={() => navigate(item.to)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:bg-gray-900 active:bg-gray-100 dark:active:bg-gray-700 dark:bg-gray-800 transition-colors ${
              i < menuItems.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''
            }`}>
            <item.icon size={18} stroke={1.5} className="text-gray-500 dark:text-gray-500" />
            <span className="text-sm text-gray-800 dark:text-gray-200 flex-1">{item.label}</span>
            {item.desc && <span className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</span>}
            <IconChevronRight size={14} className="text-gray-300" />
          </button>
        ))}

        {user?.role === 'admin' && (
          <>
          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:bg-gray-900 active:bg-gray-100 dark:active:bg-gray-700 dark:bg-gray-800 transition-colors border-t border-gray-100 dark:border-gray-800">
            <IconUserCog size={18} stroke={1.5} className="text-gray-500 dark:text-gray-500" />
            <span className="text-sm text-gray-800 dark:text-gray-200 flex-1">管理后台</span>
            <IconChevronRight size={14} className="text-gray-300" />
          </button>
          <button
            onClick={() => navigate('/settings/backup')}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:bg-gray-900 active:bg-gray-100 dark:active:bg-gray-700 dark:bg-gray-800 transition-colors border-t border-gray-100 dark:border-gray-800">
            <IconFolders size={18} stroke={1.5} className="text-gray-500 dark:text-gray-500" />
            <span className="text-sm text-gray-800 dark:text-gray-200 flex-1">数据备份</span>
            <span className="text-xs text-gray-400">R2 自动备份</span>
            <IconChevronRight size={14} className="text-gray-300" />
          </button>
          </>
        )}
      </div>

      {/* Logout */}
      <button onClick={logout}
        className="w-full border border-red-200 rounded-xl py-3 text-sm text-red-500 flex items-center justify-center gap-2 active:bg-red-50 dark:bg-red-900/30 transition-colors">
        <IconLogout size={16} stroke={1.5} />退出登录
      </button>

      {/* Delete account */}
      <button onClick={async () => {
        if (!confirm('确定注销账户？所有数据将被永久删除且无法恢复！')) return;
        if (!confirm('再次确认：注销后所有记账记录、附件、类别将被永久删除。')) return;
        try {
          await api.deleteAccount();
          logout();
        } catch (err: any) { alert(err.message || '注销失败'); }
      }}
        className="w-full text-xs text-gray-300 text-center py-1 active:text-red-400">
        注销账户
      </button>
    </div>
  );
}
