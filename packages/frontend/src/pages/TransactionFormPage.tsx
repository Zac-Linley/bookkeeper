import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api, getToken } from '../lib/api';
import type { Category, CreateTransactionRequest, TransactionType, Currency } from '@bookkeeper/shared';
import {
  IconX, IconChevronDown, IconClock, IconMapPin, IconReceipt,
  IconCamera, IconPhoto, CatIcon,
} from '../lib/icons';

interface AttInfo {
  id: string;
  r2_key: string;
  original_name: string;
}

const CATEGORY_ROWS: Record<TransactionType, number> = { expense: 3, income: 1 };

export default function TransactionFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = !!id;

  const [categories, setCategories] = useState<Category[]>([]);
  const [recentCatIds, setRecentCatIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>(user?.default_currency || 'AED');
  const [categoryId, setCategoryId] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [locationName, setLocationName] = useState('');
  const [lat, setLat] = useState<number | undefined>();
  const [lng, setLng] = useState<number | undefined>();
  const [isReimbursable, setIsReimbursable] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const [gpsLoading, setGpsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ show: false, current: 0, total: 0 });
  const [existingAtts, setExistingAtts] = useState<AttInfo[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<Record<string, string>>({});
  const [existingPreviews, setExistingPreviews] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const dtRef = useRef<HTMLInputElement>(null);

  // Load categories + recent
  useEffect(() => {
    api.getCategories(type).then(setCategories);
  }, [type]);

  useEffect(() => {
    // Load recent category IDs from transactions
    api.getTransactions({ page_size: '30' }).then((txs) => {
      const txsArr = Array.isArray(txs) ? txs : [];
      const seen = new Set<string>();
      const recent: string[] = [];
      for (const t of txsArr) {
        if (t.type === type && !seen.has(t.category_id)) {
          seen.add(t.category_id);
          recent.push(t.category_id);
          if (recent.length >= 4) break;
        }
      }
      setRecentCatIds(recent);
    }).catch(() => {});
  }, [type]);

  // Edit mode — load existing data
  useEffect(() => {
    if (id) {
      api.getTransactions().then((txs) => {
        const t = Array.isArray(txs) ? txs.find(tx => tx.id === id) : null;
        if (t) {
          setType(t.type);
          setAmount(String(t.amount));
          setCurrency(t.currency as Currency);
          setCategoryId(t.category_id);
          setOccurredAt(t.occurred_at.slice(0, 16));
          setLocationName(t.location_name || '');
          setLat(t.lat || undefined);
          setLng(t.lng || undefined);
          setIsReimbursable(!!t.is_reimbursable);
          setNote(t.note || '');
          api.listAttachments(id).then(atts => setExistingAtts(atts || []));
        }
      });
    }
  }, [id]);

  useEffect(() => {
    existingAtts.forEach(async (att) => {
      if (existingPreviews[att.id]) return;
      try {
        const res = await fetch(api.getAttachmentUrl(att.id), {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const blob = await res.blob();
        setExistingPreviews(prev => ({ ...prev, [att.id]: URL.createObjectURL(blob) }));
      } catch { /* ignore */ }
    });
  }, [existingAtts]);

  const handleGetLocation = () => {
    if (!navigator.geolocation) { setError('浏览器不支持定位'); return; }
    setGpsLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLat(pos.coords.latitude); setLng(pos.coords.longitude);
        try {
          const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&zoom=18`);
          const data = await resp.json();
          setLocationName(data.display_name?.split(',').slice(0, 3).join(', ') || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        } catch { setLocationName(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`); }
        setGpsLoading(false);
      },
      (err) => { setError('定位失败: ' + err.message); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleCamera = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment'; input.multiple = true;
    input.onchange = (e: any) => addPendingFiles(e.target.files);
    input.click();
  };

  const handleGallery = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.onchange = (e: any) => addPendingFiles(e.target.files);
    input.click();
  };

  const addPendingFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    setPendingFiles(prev => [...prev, ...newFiles]);
    const previews: Record<string, string> = {};
    newFiles.forEach((f, i) => { previews[`pending-${Date.now()}-${i}`] = URL.createObjectURL(f); });
    setPendingPreviews(prev => ({ ...prev, ...previews }));
  };

  const removePendingFile = (idx: number) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  const removeExistingAtt = async (attId: string) => {
    await api.deleteAttachment(attId);
    setExistingAtts(prev => prev.filter(a => a.id !== attId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !categoryId) { setError('金额和类别必填'); return; }
    setLoading(true); setError('');
    try {
      const data: CreateTransactionRequest = {
        type, amount: parseFloat(amount), currency, category_id: categoryId,
        occurred_at: new Date(occurredAt).toISOString(),
        location_name: locationName || undefined, lat, lng,
        is_reimbursable: isReimbursable, visibility: 'personal', note: note || undefined,
      };
      let txId = id;
      if (isEdit) { await api.updateTransaction(id!, data); }
      else { const created = await api.createTransaction(data); txId = (created as any).id; }
      for (let i = 0; i < pendingFiles.length; i++) {
        setUploadProgress({ show: true, current: i + 1, total: pendingFiles.length });
        await api.uploadAttachment(pendingFiles[i], txId!);
      }
      setUploadProgress({ show: false, current: 0, total: 0 });
      navigate('/transactions');
    } catch (err: any) { setError(err.message || '保存失败'); }
    finally { setLoading(false); }
  };

  const allAtts = existingAtts.length + pendingFiles.length;
  const recentCategories = categories.filter(c => recentCatIds.includes(c.id));
  const otherCategories = categories.filter(c => !recentCatIds.includes(c.id));
  const catBtn = (c: Category) => (
    <button key={c.id} type="button" onClick={() => setCategoryId(c.id)}
      className={`text-center py-2 px-1 rounded-lg text-xs font-medium transition-colors border ${
        categoryId === c.id
          ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
          : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
      }`}
    ><span className="flex justify-center mb-0.5"><CatIcon name={c.icon} size={18} /></span>{c.name}</button>
  );

  const now = new Date(occurredAt);
  const timeLabel = `${now.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} ${now.toLocaleString('zh-CN', { weekday: 'short' })}`;

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => navigate(-1)} className="text-gray-400"><IconX size={22} stroke={1.5} /></button>
        <span className="font-medium">{isEdit ? '编辑记录' : '记一笔'}</span>
        <span className="w-6" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Type toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button type="button" onClick={() => setType('expense')}
            className={`flex-1 text-center py-2 text-sm font-medium transition-colors ${type === 'expense' ? 'bg-red-50 text-red-600' : 'bg-white text-gray-500'}`}>支出</button>
          <button type="button" onClick={() => setType('income')}
            className={`flex-1 text-center py-2 text-sm font-medium transition-colors ${type === 'income' ? 'bg-green-50 text-green-600' : 'bg-white text-gray-500'}`}>收入</button>
        </div>

        {/* Amount */}
        <div className="flex items-center border border-gray-200 rounded-lg px-3 py-2">
          <input type="number" step="0.01" inputMode="decimal"
            className="flex-1 text-2xl font-medium outline-none bg-transparent placeholder-gray-300"
            placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
          <select value={currency} onChange={e => setCurrency(e.target.value as Currency)}
            className="text-sm text-gray-500 outline-none bg-transparent border-l border-gray-200 pl-3 py-1">
            <option value="AED">AED</option>
            <option value="CNY">CNY</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="JPY">JPY</option>
          </select>
          <span className="text-gray-300 ml-1"><IconChevronDown size={14} /></span>
        </div>

        {/* Recent categories */}
        {recentCategories.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-1.5 ml-0.5">最近使用</p>
            <div className="grid grid-cols-4 gap-2">
              {recentCategories.map(catBtn)}
            </div>
          </div>
        )}

        {/* All categories */}
        <div>
          <p className="text-xs text-gray-400 mb-1.5 ml-0.5">全部分类</p>
          <div className="grid grid-cols-4 gap-2">
            {otherCategories.map(catBtn)}
          </div>
        </div>

        {/* Time + Location + Reimbursable pills */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative overflow-hidden">
            <button type="button" onClick={() => dtRef.current?.showPicker()}
              className="inline-flex items-center gap-1 border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-600 active:bg-gray-50">
              <IconClock size={14} stroke={1.5} /> {timeLabel}
            </button>
            <input ref={dtRef} type="datetime-local" value={occurredAt}
              onChange={e => setOccurredAt(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer" />
          </div>

          <button type="button" onClick={handleGetLocation} disabled={gpsLoading}
            className={`relative z-10 inline-flex items-center gap-1 border border-gray-200 rounded-full px-3 py-1.5 text-xs active:bg-gray-50 ${lat ? 'text-primary-600 border-primary-200 bg-primary-50' : 'text-gray-600'}`}>
            {gpsLoading ? '⏳' : <IconMapPin size={14} stroke={1.5} />} {lat ? '已定位' : '定位'}
          </button>

          {type === 'expense' && (
            <button type="button" onClick={() => setIsReimbursable(!isReimbursable)}
              className={`inline-flex items-center gap-1 border rounded-full px-3 py-1.5 text-xs active:bg-gray-50 transition-colors ${
                isReimbursable ? 'text-yellow-600 border-yellow-300 bg-yellow-50' : 'text-gray-400 border-gray-200'
              }`}>
              <IconReceipt size={14} stroke={1.5} /> {isReimbursable ? '可报销' : '报销'}
            </button>
          )}
        </div>

        {/* Attachments — compact */}
        <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-xs text-gray-500">附件({allAtts})</span>
          <div className="flex gap-3">
            <button type="button" onClick={handleCamera} className="text-gray-400 active:text-gray-600"><IconCamera size={20} stroke={1.5} /></button>
            <button type="button" onClick={handleGallery} className="text-gray-400 active:text-gray-600"><IconPhoto size={20} stroke={1.5} /></button>
          </div>
        </div>

        {/* Attachment previews */}
        {(existingAtts.length > 0 || pendingFiles.length > 0) && (
          <div className="flex gap-2 flex-wrap">
            {existingAtts.map(att => (
              <div key={att.id} className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-100 cursor-pointer"
                onClick={() => existingPreviews[att.id] && setLightbox(existingPreviews[att.id])}>
                {existingPreviews[att.id] ? (
                  <img src={existingPreviews[att.id]} alt="" className="w-full h-full object-cover" />
                ) : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">...</div>}
                <button type="button" onClick={(e) => { e.stopPropagation(); removeExistingAtt(att.id); }}
                  className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white rounded-bl text-[10px] flex items-center justify-center">×</button>
              </div>
            ))}
            {pendingFiles.map((_, i) => {
              const src = Object.values(pendingPreviews)[i] || '';
              return (
                <div key={`p-${i}`} className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-100 cursor-pointer"
                  onClick={() => src && setLightbox(src)}>
                  {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">...</div>}
                  <button type="button" onClick={(e) => { e.stopPropagation(); removePendingFile(i); }}
                    className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white rounded-bl text-[10px] flex items-center justify-center">×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Note */}
        <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-300 placeholder-gray-300"
          placeholder="备注..." value={note} onChange={e => setNote(e.target.value)} />

        {error && <p className="text-red-500 text-xs">{error}</p>}

        <button type="submit" disabled={loading}
          className="btn-primary w-full">
          {loading ? (pendingFiles.length > 0 ? '上传并保存中...' : '保存中...') : '保存'}
        </button>
      </form>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full text-white text-2xl flex items-center justify-center">×</button>
        </div>
      )}

      {/* GPS loading overlay */}
      {gpsLoading && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl px-8 py-6 flex flex-col items-center gap-3 max-w-xs mx-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center"><span className="text-2xl animate-pulse">📍</span></div>
            <p className="text-base font-medium text-gray-800">正在获取位置</p>
            <p className="text-xs text-gray-400 text-center">请允许浏览器获取您的位置信息</p>
            <div className="flex gap-1 mt-1">
              <div className="w-2 h-2 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      {/* Upload progress overlay */}
      {uploadProgress.show && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl px-8 py-6 flex flex-col items-center gap-3 max-w-xs mx-4">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-xl">📤</span>
            </div>
            <p className="text-base font-medium text-gray-800">正在保存</p>
            <p className="text-xs text-gray-400">
              上传附件 {uploadProgress.current}/{uploadProgress.total}
            </p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
              <div
                className="bg-primary-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
