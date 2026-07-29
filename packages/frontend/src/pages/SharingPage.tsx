import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { IconChevronLeft } from '../lib/icons';

interface SharedUser { id: string; email: string; display_name: string; }

export default function SharingPage() {
  const navigate = useNavigate();
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [shareEmail, setShareEmail] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [shareLoading, setShareLoading] = useState(false);

  const fetchShared = useCallback(() => {
    api.getSharedUsers().then(u => setSharedUsers(u || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchShared(); }, [fetchShared]);

  const handleAddShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail.trim()) return;
    setShareLoading(true); setShareMsg('');
    try {
      await api.addSharedUser(shareEmail.trim());
      setShareEmail('');
      setShareMsg('已添加');
      fetchShared();
    } catch (err: any) {
      setShareMsg(err.message || '添加失败');
    } finally { setShareLoading(false); }
  };

  const handleRemoveShare = async (u: SharedUser) => {
    if (!confirm(`停止向 ${u.display_name || u.email} 共享？`)) return;
    await api.removeSharedUser(u.id);
    fetchShared();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-gray-400 dark:text-gray-500"><IconChevronLeft size={18} stroke={1.5} /></button>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">数据共享</span>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">添加共享用户后，对方可查看你的全部记账记录</p>

      {sharedUsers.length > 0 && (
        <div className="space-y-2">
          {sharedUsers.map(u => (
            <div key={u.id} className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg px-4 py-3">
              <span className="text-sm text-gray-700 dark:text-gray-300">{u.display_name || u.email}</span>
              <button onClick={() => handleRemoveShare(u)} className="text-xs text-red-500 font-medium">移除</button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAddShare} className="flex gap-2">
        <input type="email" className="input-sm flex-1" placeholder="对方邮箱"
          value={shareEmail} onChange={e => setShareEmail(e.target.value)} required />
        <button type="submit" disabled={shareLoading} className="btn-primary-sm">添加</button>
      </form>

      {shareMsg && <p className={`text-xs ${shareMsg.includes('失败') ? 'text-red-500' : 'text-green-600'}`}>{shareMsg}</p>}
    </div>
  );
}
