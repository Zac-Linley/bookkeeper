import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api, getToken } from '../lib/api';
import type { Category, CreateTransactionRequest, TransactionType, Currency, TransactionLog } from '@bookkeeper/shared';
import { CURRENCY_SYMBOLS } from '@bookkeeper/shared';
import {
  IconX, IconChevronDown, IconClock, IconMapPin, IconReceipt,
  IconCamera, IconPhoto, IconFileInvoice, CatIcon,
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
  const [needsInvoice, setNeedsInvoice] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const [gpsLoading, setGpsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ show: false, current: 0, total: 0 });
  const [existingAtts, setExistingAtts] = useState<AttInfo[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<Record<string, string>>({});
  const [existingPreviews, setExistingPreviews] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [txLogs, setTxLogs] = useState<TransactionLog[]>([]);
  const [txLogsOpen, setTxLogsOpen] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const lbScale = useRef(1);
  const lbPos = useRef({ x: 0, y: 0 });
  const lbTouchStart = useRef<{ x: number; y: number; dist: number; scale: number } | null>(null);
  const [lbZoomPct, setLbZoomPct] = useState(100);

  const updateImgTransform = () => {
    if (imgRef.current) {
      imgRef.current.style.transform = `scale(${lbScale.current}) translate(${lbPos.current.x}px, ${lbPos.current.y}px)`;
    }
  };

  const lbZoom = (delta: number) => {
    lbScale.current = Math.max(0.5, Math.min(5, lbScale.current + delta));
    setLbZoomPct(Math.round(lbScale.current * 100));
    updateImgTransform();
  };

  const lbReset = () => {
    lbScale.current = 1;
    lbPos.current = { x: 0, y: 0 };
    setLbZoomPct(100);
    updateImgTransform();
  };
  const dtRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const timeEdited = useRef(false);

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
          setOccurredAt((() => { const d = new Date(t.occurred_at); const p = (n: number) => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; })());
          setLocationName(t.location_name || '');
          setLat(t.lat || undefined);
          setLng(t.lng || undefined);
          setIsReimbursable(!!t.is_reimbursable);
          setNeedsInvoice(!!t.needs_invoice);
          setNote(t.note || '');
          api.listAttachments(id).then(atts => setExistingAtts(atts || []));
          api.getTransactionLogs(id).then(logs => setTxLogs(logs || []));
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
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (!amount || !categoryId) { setError('金额和类别必填'); submittingRef.current = false; return; }
    setLoading(true); setError('');
    try {
      const data: CreateTransactionRequest = {
        type, amount: parseFloat(amount), currency, category_id: categoryId,
        occurred_at: new Date(occurredAt).toISOString(),
        location_name: locationName || undefined, lat, lng,
        is_reimbursable: isReimbursable, needs_invoice: needsInvoice, visibility: 'personal', note: note || undefined,
        idempotency_key: isEdit ? undefined : `${Date.now()}-${crypto.randomUUID()}`,
      };
      let txId = id;
      if (isEdit) {
        const upd: Record<string, any> = { ...data };
        if (!timeEdited.current) delete upd.occurred_at;
        await api.updateTransaction(id!, upd);
      }
      else { const created = await api.createTransaction(data); txId = (created as any).id; }
      for (let i = 0; i < pendingFiles.length; i++) {
        setUploadProgress({ show: true, current: i + 1, total: pendingFiles.length });
        await api.uploadAttachment(pendingFiles[i], txId!);
      }
      setUploadProgress({ show: false, current: 0, total: 0 });
      navigate('/transactions');
    } catch (err: any) { setError(err.message || '保存失败'); }
    finally { setLoading(false); submittingRef.current = false; }
  };

  const allAtts = existingAtts.length + pendingFiles.length;
  const recentCategories = categories.filter(c => recentCatIds.includes(c.id));
  const otherCategories = categories.filter(c => !recentCatIds.includes(c.id));
  const catBtn = (c: Category) => (
    <button key={c.id} type="button" onClick={() => setCategoryId(c.id)}
      className={`text-center py-2 px-1 rounded-lg text-xs font-medium transition-colors border ${
        categoryId === c.id
          ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
          : 'bg-white text-gray-600 dark:text-gray-500 border-gray-200 dark:border-gray-700 active:bg-gray-50 dark:active:bg-gray-800 dark:bg-gray-900'
      }`}
    ><span className="flex justify-center mb-0.5"><CatIcon name={c.icon} size={18} /></span>{c.name}</button>
  );

  const now = new Date(occurredAt);
  const timeLabel = `${now.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} ${now.toLocaleString('zh-CN', { weekday: 'short' })}`;

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => navigate(-1)} className="text-gray-400 dark:text-gray-500"><IconX size={22} stroke={1.5} /></button>
        <span className="font-medium">{isEdit ? '编辑记录' : '记一笔'}</span>
        <span className="w-6" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Type toggle */}
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button type="button" onClick={() => setType('expense')}
            className={`flex-1 text-center py-2 text-sm font-medium transition-colors ${type === 'expense' ? 'bg-red-50 dark:bg-red-900/30 text-red-600' : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400'}`}>支出</button>
          <button type="button" onClick={() => setType('income')}
            className={`flex-1 text-center py-2 text-sm font-medium transition-colors ${type === 'income' ? 'bg-green-50 dark:bg-green-900/30 text-green-600' : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400'}`}>收入</button>
        </div>

        {/* Amount */}
        <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 min-w-0">
          <span className="text-2xl font-medium text-gray-500 mr-2 shrink-0">
            {currency === 'AED' ? <span className="dirham-symbol">ê</span> : CURRENCY_SYMBOLS[currency] || currency}
          </span>
          <input type="number" step="0.01" inputMode="decimal"
            className="flex-1 text-2xl font-medium outline-none bg-transparent placeholder-gray-300 dark:placeholder-gray-500 min-w-0"
            placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
          <select value={currency} onChange={e => setCurrency(e.target.value as Currency)}
            className="text-sm text-gray-500 outline-none bg-transparent border-l border-gray-200 dark:border-gray-700 pl-2 py-1 shrink-0 w-auto max-w-[4.5rem]">
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
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5 ml-0.5">最近使用</p>
            <div className="grid grid-cols-4 gap-2">
              {recentCategories.map(catBtn)}
            </div>
          </div>
        )}

        {/* All categories */}
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5 ml-0.5">全部分类</p>
          <div className="grid grid-cols-4 gap-2">
            {otherCategories.map(catBtn)}
          </div>
        </div>

        {/* Time + Location + Reimbursable pills */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative overflow-hidden">
            <button type="button" onClick={() => dtRef.current?.showPicker()}
              className="inline-flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1.5 text-xs text-gray-600 dark:text-gray-500 active:bg-gray-50 dark:active:bg-gray-800 dark:bg-gray-900">
              <IconClock size={14} stroke={1.5} /> {timeLabel}
            </button>
            <input ref={dtRef} type="datetime-local" value={occurredAt}
              onChange={e => { setOccurredAt(e.target.value); timeEdited.current = true; }}
              className="absolute inset-0 opacity-0 cursor-pointer" />
          </div>

          <button type="button" onClick={handleGetLocation} disabled={gpsLoading}
            className={`relative z-10 inline-flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1.5 text-xs active:bg-gray-50 dark:active:bg-gray-800 dark:bg-gray-900 ${lat ? 'text-primary-600 border-primary-200 bg-primary-50' : 'text-gray-600 dark:text-gray-500'}`}>
            {gpsLoading ? '⏳' : <IconMapPin size={14} stroke={1.5} />} {lat ? '已定位' : '定位'}
          </button>

          {type === 'expense' && (
            <>
              <button type="button" onClick={() => setIsReimbursable(!isReimbursable)}
                className={`inline-flex items-center gap-1 border rounded-full px-3 py-1.5 text-xs active:bg-gray-50 dark:active:bg-gray-800 dark:bg-gray-900 transition-colors ${
                  isReimbursable ? 'text-yellow-600 border-yellow-300 bg-yellow-50' : 'text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700'
                }`}>
                <IconReceipt size={14} stroke={1.5} /> {isReimbursable ? '可报销' : '报销'}
              </button>
              <button type="button" onClick={() => setNeedsInvoice(!needsInvoice)}
                className={`inline-flex items-center gap-1 border rounded-full px-3 py-1.5 text-xs active:bg-gray-50 dark:active:bg-gray-800 dark:bg-gray-900 transition-colors ${
                  needsInvoice ? 'text-blue-600 border-blue-300 bg-blue-50' : 'text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700'
                }`}>
                <IconFileInvoice size={14} stroke={1.5} /> {needsInvoice ? '开发票' : '开发票'}
              </button>
            </>
          )}
        </div>

        {/* Attachments — compact */}
        <div className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
          <span className="text-xs text-gray-500">附件({allAtts})</span>
          <div className="flex gap-3">
            <button type="button" onClick={handleCamera} className="text-gray-400 dark:text-gray-500 active:text-gray-600 dark:text-gray-500"><IconCamera size={20} stroke={1.5} /></button>
            <button type="button" onClick={handleGallery} className="text-gray-400 dark:text-gray-500 active:text-gray-600 dark:text-gray-500"><IconPhoto size={20} stroke={1.5} /></button>
          </div>
        </div>

        {/* Attachment previews */}
        {(existingAtts.length > 0 || pendingFiles.length > 0) && (
          <div className="flex gap-2 flex-wrap">
            {existingAtts.map(att => (
              <div key={att.id} className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer"
                onClick={() => existingPreviews[att.id] && setLightbox(existingPreviews[att.id])}>
                {existingPreviews[att.id] ? (
                  <img src={existingPreviews[att.id]} alt="" className="w-full h-full object-cover" />
                ) : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">...</div>}
                <button type="button" onClick={(e) => { e.stopPropagation(); removeExistingAtt(att.id); }}
                  className="absolute top-0 right-0 w-4 h-4 bg-red-500 dark:bg-red-600 text-white rounded-bl text-[10px] flex items-center justify-center">×</button>
              </div>
            ))}
            {pendingFiles.map((_, i) => {
              const src = Object.values(pendingPreviews)[i] || '';
              return (
                <div key={`p-${i}`} className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer"
                  onClick={() => src && setLightbox(src)}>
                  {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">...</div>}
                  <button type="button" onClick={(e) => { e.stopPropagation(); removePendingFile(i); }}
                    className="absolute top-0 right-0 w-4 h-4 bg-red-500 dark:bg-red-600 text-white rounded-bl text-[10px] flex items-center justify-center">×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Note */}
        <input type="text" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none bg-white dark:bg-gray-900 focus:border-gray-300 placeholder-gray-300 dark:placeholder-gray-500"
          placeholder="备注..." value={note} onChange={e => setNote(e.target.value)} />

        {error && <p className="text-red-500 text-xs">{error}</p>}

        {/* Modification logs */}
        {isEdit && txLogs.length > 0 && (
          <div className="border border-gray-100 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 overflow-hidden">
            <button type="button" onClick={() => setTxLogsOpen(!txLogsOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-400 dark:text-gray-500 font-medium active:bg-gray-100 dark:active:bg-gray-700 dark:bg-gray-800">
              <span>修改记录 ({txLogs.length})</span>
              <span className={`transition-transform ${txLogsOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {txLogsOpen && (
              <div className="px-3 pb-2 space-y-2 border-t border-gray-100 dark:border-gray-800 pt-2">
                {txLogs.map((log) => {
                  const fieldNames: Record<string, string> = {
                  type: '类型', amount: '金额', currency: '币种', category_id: '类别',
                  occurred_at: '时间', location_name: '地点', lat: '纬度', lng: '经度',
                  is_reimbursable: '报销', needs_invoice: '开发票', visibility: '可见性', note: '备注',
                };
                const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
                const fmtVal = (val: string, field: string) => {
                  if (field === 'category_id') return catMap[val] || val || '未分类';
                  if (field === 'type') return val === 'expense' ? '支出' : '收入';
                  if (field === 'visibility') return val === 'shared' ? '共享' : '个人';
                  if (field === 'occurred_at') {
                    const d = new Date(val);
                    return isNaN(d.getTime()) ? val : d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                  }
                  if (field === 'currency') return val;
                  if (field === 'amount') return Number(val).toFixed(2);
                  if (field === 'is_reimbursable' || field === 'needs_invoice') return val === '1' ? '是' : '否';
                  return val || '空';
                };
                return (
                  <div key={log.id} className="text-xs text-gray-500 leading-relaxed">
                    <span className="text-gray-300">·</span>{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-300">{log.display_name || '未知用户'}</span>
                    {' '}修改了 <span className="font-medium text-gray-600 dark:text-gray-500">{fieldNames[log.field] || log.field}</span>
                    <div className="ml-3 text-gray-400 dark:text-gray-500">
                      <span className="line-through">{fmtVal(log.old_value || '', log.field)}</span>
                      <span className="mx-1">→</span>
                      <span className="text-gray-600 dark:text-gray-500 font-medium">{fmtVal(log.new_value || '', log.field)}</span>
                    </div>
                    <span className="text-gray-300 ml-1">{new Date(log.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        <button type="submit" disabled={loading}
          className="btn-primary w-full">
          {loading ? (pendingFiles.length > 0 ? '上传并保存中...' : '保存中...') : '保存'}
        </button>
      </form>

      {/* Lightbox with zoom & pan */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center select-none"
          onClick={() => { lbReset(); setLightbox(null); }}>
          <img ref={imgRef} src={lightbox} alt=""
            className="max-w-full max-h-full object-contain rounded-lg transition-none"
            style={{ transform: 'scale(1) translate(0px, 0px)' }}
            onClick={e => e.stopPropagation()}
            onWheel={e => { e.preventDefault(); lbZoom(-e.deltaY * 0.005); }}
            onTouchStart={e => {
              if (e.touches.length === 2) {
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                lbTouchStart.current = { x: 0, y: 0, dist, scale: lbScale.current };
              } else if (e.touches.length === 1) {
                lbTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0, scale: lbScale.current };
              }
            }}
            onTouchMove={e => {
              if (!lbTouchStart.current) return;
              if (e.touches.length === 2) {
                e.preventDefault();
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                lbScale.current = Math.max(0.5, Math.min(5, lbTouchStart.current.scale * (dist / lbTouchStart.current.dist)));
                setLbZoomPct(Math.round(lbScale.current * 100));
                updateImgTransform();
              } else if (e.touches.length === 1 && lbScale.current > 1) {
                const dx = e.touches[0].clientX - lbTouchStart.current.x;
                const dy = e.touches[0].clientY - lbTouchStart.current.y;
                lbPos.current = { x: lbPos.current.x + dx * 0.5, y: lbPos.current.y + dy * 0.5 };
                lbTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0, scale: lbScale.current };
                updateImgTransform();
              }
            }}
            onTouchEnd={() => { lbTouchStart.current = null; }}
          />
          {/* Top bar */}
          <div className="absolute top-4 left-4 flex gap-2">
            <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); lbZoom(0.5); }} className="w-9 h-9 bg-white/20 rounded-full text-white text-lg flex items-center justify-center active:bg-white/30">+</button>
            <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); lbZoom(-0.5); }} className="w-9 h-9 bg-white/20 rounded-full text-white text-lg flex items-center justify-center active:bg-white/30">−</button>
            <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); lbReset(); }} className="w-9 h-9 bg-white/20 rounded-full text-white text-xs flex items-center justify-center active:bg-white/30">⟲</button>
          </div>
          <button onPointerDown={e => e.stopPropagation()} onClick={() => { lbReset(); setLightbox(null); }} className="absolute top-4 right-4 w-9 h-9 bg-white/20 rounded-full text-white text-lg flex items-center justify-center active:bg-white/30">×</button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-white/50 bg-black/30 rounded-full px-3 py-1 pointer-events-none">{lbZoomPct}%</div>
        </div>
      )}

      {/* GPS loading overlay */}
      {gpsLoading && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl dark:shadow-black/40 px-8 py-6 flex flex-col items-center gap-3 max-w-xs mx-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><span className="text-2xl animate-pulse">📍</span></div>
            <p className="text-base font-medium text-gray-800 dark:text-gray-200">正在获取位置</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">请允许浏览器获取您的位置信息</p>
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
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl dark:shadow-black/40 px-8 py-6 flex flex-col items-center gap-3 max-w-xs mx-4">
            <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <span className="text-xl">📤</span>
            </div>
            <p className="text-base font-medium text-gray-800 dark:text-gray-200">正在保存</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              上传附件 {uploadProgress.current}/{uploadProgress.total}
            </p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-1">
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
