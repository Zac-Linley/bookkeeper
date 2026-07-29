import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { IconSearch, IconX } from '../lib/icons';
import { IconDownload } from '@tabler/icons-react';
import { CatIcon } from '../lib/icons';
import type { Transaction, Category } from '@bookkeeper/shared';

import { toLocalDateStr } from '../lib/dates';

export default function TransactionListPage() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [catMap, setCatMap] = useState<Record<string, string>>({});
  const [catIconMap, setCatIconMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<string>('');

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(() => toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [dateTo, setDateTo] = useState(() => toLocalDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)));

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([api.getCategories('expense'), api.getCategories('income')]).then(([e, i]) => {
      const map: Record<string, string> = {};
      const iconMap: Record<string, string> = {};
      [...e, ...i].forEach((c: Category) => { map[c.id] = c.name; iconMap[c.id] = c.icon; });
      setCatMap(map);
      setCatIconMap(iconMap);
    });
  }, []);

  const fetchData = useCallback((pageNum: number = 1, append: boolean = false) => {
    const isFresh = pageNum === 1;
    if (isFresh) setLoading(true);
    else setLoadingMore(true);
    const params: Record<string, string> = {};
    if (type) params.type = type;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (search) params.search = search;
    params.sort_by = sortBy;
    params.sort_order = sortOrder;
    params.page = String(pageNum);
    params.page_size = '50';
    api.getTransactionsWithTotal(params)
      .then(({ data, total }) => {
        const items = data || [];
        if (append) {
          setTransactions(prev => [...prev, ...items]);
        } else {
          setTransactions(items);
        }
        setHasMore(pageNum * 50 < total);
        setPage(pageNum);
      })
      .finally(() => { setLoading(false); setLoadingMore(false); });
  }, [type, dateFrom, dateTo, search, sortBy, sortOrder]);

  useEffect(() => { fetchData(1, false); }, [fetchData]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条记录？')) return;
    try {
      await api.deleteTransaction(id);
      fetchData(page, false);
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const setThisMonth = () => {
    const d = new Date();
    setDateFrom(toLocalDateStr(new Date(d.getFullYear(), d.getMonth(), 1)));
    setDateTo(toLocalDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
  };
  const setLastMonth = () => {
    const d = new Date();
    setDateFrom(toLocalDateStr(new Date(d.getFullYear(), d.getMonth() - 1, 1)));
    setDateTo(toLocalDateStr(new Date(d.getFullYear(), d.getMonth(), 0)));
  };
  const setThisYear = () => {
    const d = new Date();
    setDateFrom(toLocalDateStr(new Date(d.getFullYear(), 0, 1)));
    setDateTo(toLocalDateStr(new Date(d.getFullYear(), 11, 31)));
  };

  const fmt = (n: number) => n.toFixed(2);

  const handleExport = () => {
    const header = '日期,类型,类别,金额,币种,报销,发票,备注,地点\n';
    const rows = transactions.map(t => {
      const date = fmtDate(t.occurred_at);
      const cname = catMap[t.category_id] || '未知';
      const reimbursable = t.is_reimbursable ? '是' : '否';
      const invoice = t.needs_invoice ? '是' : '否';
      const note = (t.note || '').replace(/,/g, '，');
      const loc = (t.location_name || '').replace(/,/g, '，');
      return `${date},${t.type === 'expense' ? '支出' : '收入'},${cname},${t.amount},${t.currency},${reimbursable},${invoice},${note},${loc}`;
    }).join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookkeeper-export-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmtDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const time = d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const wd = d.toLocaleString('zh-CN', { weekday: 'short' });
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return `${time} ${wd} ${iso}`;
  };

  const fmtShort = (dateStr: string) => {
    const d = new Date(dateStr);
    const wd = d.toLocaleString('zh-CN', { weekday: 'short' });
    const month = d.toLocaleString('zh-CN', { month: 'long' });
    return `${wd} ${d.getDate()} ${month}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">账单</h2>
        <button onClick={() => {
          if (transactions.length === 0) { alert('暂无数据可导出'); return; }
          handleExport();
        }}
          className="text-xs text-primary-600 flex items-center gap-1 active:text-primary-800">
          <IconDownload size={14} stroke={1.5} />导出
        </button>
      </div>

      <div className="relative">
        <input type="text" className="input-field pl-9" placeholder="搜索备注、地点、类别..."
          value={searchInput} onChange={e => setSearchInput(e.target.value)} />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"><IconSearch size={16} stroke={1.5} /></span>
        {searchInput && (
          <button type="button" onClick={() => setSearchInput('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"><IconX size={16} stroke={1.5} /></button>
        )}
      </div>

      {/* Date + Type + Sort — same row */}
      <div className="flex gap-1.5 items-center">
        <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden h-10 bg-white dark:bg-gray-900 flex-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <button type="button" onClick={() => fromRef.current?.showPicker()}
              className="px-2 py-2 text-xs text-gray-600 dark:text-gray-500 text-left whitespace-nowrap w-full truncate">
              {fmtShort(dateFrom)}
            </button>
            <input ref={fromRef} type="date" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="absolute inset-0 opacity-0 w-full cursor-pointer" />
          </div>
          <span className="text-gray-300 dark:text-gray-600 text-xs px-0.5">—</span>
          <div className="relative flex-1 min-w-0">
            <button type="button" onClick={() => toRef.current?.showPicker()}
              className="px-2 py-2 text-xs text-gray-600 dark:text-gray-500 text-left whitespace-nowrap">
              {fmtShort(dateTo)}
            </button>
            <input ref={toRef} type="date" value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="absolute inset-0 opacity-0 w-full cursor-pointer" />
          </div>
        </div>

        <select value={type} onChange={e => setType(e.target.value)} className="select-sm !w-auto shrink-0">
          <option value="">全部</option>
          <option value="expense">支出</option>
          <option value="income">收入</option>
        </select>

        <select value={`${sortBy}-${sortOrder}`} onChange={e => {
          const [by, order] = e.target.value.split('-');
          setSortBy(by); setSortOrder(order);
        }} className="select-sm !w-auto shrink-0">
          <option value="created_at-desc">创建↓</option>
          <option value="created_at-asc">创建↑</option>
          <option value="occurred_at-desc">时间↓</option>
          <option value="occurred_at-asc">时间↑</option>
          <option value="amount-desc">金额↓</option>
          <option value="amount-asc">金额↑</option>
          <option value="category-asc">类别</option>
        </select>
      </div>

      <div className="flex gap-2">
        {(['本月', '上月', '今年'] as const).map(label => (
          <button key={label} type="button"
            onClick={() => { if (label === '本月') setThisMonth(); else if (label === '上月') setLastMonth(); else setThisYear(); }}
            className="text-xs px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-500 active:bg-gray-200"
          >{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
      ) : transactions.length === 0 ? (
        <p className="text-center text-gray-400 dark:text-gray-500 py-10">{search ? '没有匹配的记录' : '暂无记录'}</p>
      ) : (
        <div className="space-y-2">
          {transactions.map(t => (
            <div key={t.id}
              className="card flex items-center justify-between cursor-pointer active:bg-gray-50 dark:active:bg-gray-800 dark:bg-gray-900"
              onClick={() => navigate(`/transactions/${t.id}/edit`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 dark:text-gray-500"><CatIcon name={catIconMap[t.category_id] || ''} size={16} /></span>
                  <span className="text-sm truncate">
                    <span className="text-gray-400 dark:text-gray-500">{catMap[t.category_id] || '未知'}</span>
                    {t.note && <span className="text-gray-700 dark:text-gray-300"> - {t.note}</span>}
                  </span>
                  {t.is_reimbursable ? <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 rounded px-1 shrink-0">报销</span> : null}
                  {t.needs_invoice ? <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 rounded px-1 shrink-0">发票</span> : null}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {fmtDate(t.occurred_at)} · {t.currency}
                  {t.location_name && <span> · {t.location_name}</span>}
                </p>
              </div>
              <div className="text-right ml-3 shrink-0">
                <p className={`font-bold text-sm ${t.type === 'expense' ? 'text-expense' : 'text-income'}`}>
                  {t.type === 'expense' ? '-' : '+'}{fmt(t.amount)}
                </p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                className="ml-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30 text-red-400 hover:bg-red-100 active:bg-red-200 text-xs"
              >×</button>
            </div>
          ))}
        </div>
      )}
      {!loading && hasMore && (
        <button type="button" onClick={() => fetchData(page + 1, true)} disabled={loadingMore}
          className="w-full py-3 text-sm text-primary-600 font-medium active:text-primary-800 disabled:opacity-50">
          {loadingMore ? '加载中...' : '加载更多'}
        </button>
      )}
    </div>
  );
}
