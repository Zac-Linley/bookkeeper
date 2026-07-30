import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken, API_BASE } from '../lib/api';
import { IconChevronLeft, IconRefresh } from '../lib/icons';
import { IconDownload } from '@tabler/icons-react';

export default function BackupPage() {
  const navigate = useNavigate();
  const [backups, setBackups] = useState<{ filename: string; size: number; uploaded: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const data = await api.getBackups();
      setBackups(data || []);
    } catch (e: any) {
      setMsg(e.message || '加载失败');
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBackups(); }, []);

  const createBackup = async () => {
    setCreating(true);
    setMsg('');
    try {
      const result = await api.createBackup();
      setMsg('备份创建成功');
      fetchBackups();
    } catch (e: any) {
      setMsg(e.message || '备份失败');
    }
    finally { setCreating(false); }
  };

  const downloadBackup = (filename: string) => {
    const token = getToken();
    window.open(`${API_BASE}/backup/${filename}?token=${token}`, '_blank');
  };

  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-400"><IconChevronLeft size={18} stroke={1.5} /></button>
        <h2 className="text-lg font-bold flex-1">数据备份</h2>
        <button onClick={createBackup} disabled={creating}
          className="btn-primary-sm flex items-center gap-1">
          <IconDownload size={14} />{creating ? '备份中...' : '创建备份'}
        </button>
        <button onClick={fetchBackups} className="btn-outline-sm !px-2"><IconRefresh size={14} /></button>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg px-3 py-2">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          每天凌晨 01:00 UTC 自动备份到 R2，保留最近 30 天。备份包含所有用户数据（交易、类别、定存等）。
        </p>
      </div>

      {msg && <p className={`text-xs ${msg.includes('失败') ? 'text-red-500' : 'text-green-600'}`}>{msg}</p>}

      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
      ) : backups.length === 0 ? (
        <div className="text-center py-10">
          <IconDownload size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-xs text-gray-400">暂无备份</p>
        </div>
      ) : (
        <div className="space-y-2">
          {backups.map(b => (
            <div key={b.filename} className="card flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{b.filename}</p>
                <p className="text-xs text-gray-400">{fmtTime(b.uploaded)} · {fmtSize(b.size)}</p>
              </div>
              <button onClick={() => downloadBackup(b.filename)}
                className="btn-outline-sm !text-xs shrink-0 ml-2">下载</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
