import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { IconPencil, IconTrash, IconPlus } from '@tabler/icons-react';
import type { FixedDeposit, CreateDepositRequest, InterestFrequency } from '@bookkeeper/shared';

interface DepositWithInterest extends FixedDeposit {
  total_interest_paid?: number;
}

export default function DepositsPage() {
  const { user } = useAuth();
  const [deposits, setDeposits] = useState<DepositWithInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [rateMap, setRateMap] = useState<Record<string, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'AED'|'CNY'|'USD'|'EUR'|'GBP'|'JPY'>('AED');
  const [interestRate, setInterestRate] = useState('');
  const [frequency, setFrequency] = useState<InterestFrequency>('maturity');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [termMonths, setTermMonths] = useState(12);
  const [customTerm, setCustomTerm] = useState('');
  const [note, setNote] = useState('');
  const [createExpense, setCreateExpense] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editDeposit, setEditDeposit] = useState<DepositWithInterest | null>(null);

  const fetch = useCallback(() => {
    api.getDeposits().then(d => setDeposits(d || [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  // Load exchange rates for currency conversion
  useEffect(() => {
    api.getExchangeRates().then((res: any) => {
      const map: Record<string, number> = {};
      const rates = res?.rates || res?.data?.rates || [];
      for (const r of rates) {
        map[r.target] = r.rate;
      }
      setRateMap(map);
    }).catch(() => {});
  }, []);

  const actualTerm = customTerm ? parseInt(customTerm) : termMonths;

  const maturityDate = (() => {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + actualTerm);
    return d.toISOString().slice(0, 10);
  })();

  const expectedInterest = amount && interestRate ? (() => {
    const start = new Date(startDate);
    const maturity = new Date(start);
    maturity.setMonth(maturity.getMonth() + actualTerm);
    const days = (maturity.getTime() - start.getTime()) / 86400000;
    return (parseFloat(amount) * (parseFloat(interestRate) / 100) * (days / 360)).toFixed(2);
  })()
    : '0.00';

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount || !interestRate) return;
    setSaving(true);
    try {
      const data: CreateDepositRequest = {
        name: name.trim(), amount: parseFloat(amount), currency,
        interest_rate: parseFloat(interestRate), interest_frequency: frequency,
        start_date: startDate, term_months: actualTerm, note: note || undefined,
      } as any;
      await api.createDeposit({ ...data, create_expense: createExpense } as any);
      resetForm();
      fetch();
    } catch (err: any) { setMsg(err.message || '创建失败'); }
    finally { setSaving(false); }
  };

  const resetForm = () => {
    setName(''); setAmount(''); setInterestRate(''); setNote('');
    setFrequency('maturity'); setTermMonths(12);
    setStartDate(new Date().toISOString().slice(0, 10));
    setShowForm(false); setMsg('');
  };

  const handlePayInterest = async (id: string) => {
    if (!confirm('确认结息？将创建一笔利息收入记录。')) return;
    try {
      const res = await api.payInterest(id);
      setMsg(`已结息 ${res.interest} AED`);
      fetch();
    } catch (err: any) { setMsg(err.message || '结息失败'); }
  };

  const handleMature = async (id: string) => {
    if (!confirm('确认到期提现？将自动创建利息收入和本金返还记录。')) return;
    try {
      await api.matureDeposit(id);
      setMsg('已到期提现');
      fetch();
    } catch (err: any) { setMsg(err.message || '操作失败'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('删除这条定存记录？')) return;
    await api.deleteDeposit(id);
    fetch();
  };

  const openEdit = (d: DepositWithInterest) => {
    setEditDeposit(d);
    setName(d.name);
    setAmount(String(d.amount));
    setInterestRate(String(d.interest_rate));
    setFrequency(d.interest_frequency);
    setStartDate(d.start_date);
    if ([1,3,6,12,24,36,60].includes(d.term_months || 0)) {
      setTermMonths(d.term_months || 12);
      setCustomTerm('');
    } else {
      setCustomTerm(String(d.term_months || 12));
    }
    setNote(d.note || '');
    setCreateExpense(false); // Don't re-create expense on edit
  };

  const activeDeposits = deposits.filter(d => d.status === 'active');
  const maturedDeposits = deposits.filter(d => d.status !== 'active');

  const baseCurrency = user?.default_currency || 'AED';
  const convert = (amount: number, from: string): number => {
    if (from === baseCurrency || !rateMap[from] || !rateMap[baseCurrency]) return amount;
    return (amount / rateMap[from]) * rateMap[baseCurrency];
  };

  const totalAmount = deposits.reduce((s, d) => s + convert(d.amount, d.currency), 0);
  const totalExpected = deposits.reduce((s, d) => s + convert(d.expected_interest || 0, d.currency), 0);
  const soonCount = activeDeposits.filter(d => {
    const days = (new Date(d.maturity_date).getTime() - Date.now()) / 86400000;
    return days <= 30;
  }).length;

  const fmt = (n: number) => n.toFixed(2);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;

  const DepositCard = ({ d }: { d: DepositWithInterest }) => {
    const now = Date.now();
    const start = new Date(d.start_date).getTime();
    const end = new Date(d.maturity_date).getTime();
    const progress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
    const daysLeft = Math.ceil((end - now) / 86400000);
    const isSoon = daysLeft <= 30 && d.status === 'active';
    const isOverdue = daysLeft < 0 && d.status === 'active';

    return (
      <div className={`card ${isOverdue ? 'border-red-200 bg-red-50/30 dark:bg-red-900/20' : isSoon ? 'border-orange-200 bg-orange-50/30 dark:bg-orange-900/20' : ''}`}
        onClick={() => openEdit(d)}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-sm font-medium">{d.name}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {fmt(d.amount)} {d.currency} · {d.interest_rate}% · {
                d.interest_frequency === 'maturity' ? '到期结息' :
                d.interest_frequency === 'monthly' ? '月结' :
                d.interest_frequency === 'quarterly' ? '季结' : '预付结息'
              }
            </p>
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              d.status === 'active' ? (isOverdue ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600') : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
            }`}>
              {d.status === 'active' ? (isOverdue ? '已逾期' : '进行中') : '已到期'}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        {d.status === 'active' && (
          <div className="mb-2">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full ${isOverdue ? 'bg-red-400' : isSoon ? 'bg-orange-400' : 'bg-primary-400'}`}
                style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
            <p className={`text-[10px] mt-0.5 ${isOverdue ? 'text-red-500' : isSoon ? 'text-orange-500' : 'text-gray-400 dark:text-gray-500'}`}>
              {isOverdue ? `已逾期 ${Math.abs(daysLeft)} 天` : `${daysLeft} 天后到期`}
              · {d.start_date} → {d.maturity_date}
            </p>
          </div>
        )}

        <p className="text-xs text-gray-500">
          预期利息: {fmt(d.expected_interest || 0)} {d.currency}
          {d.total_interest_paid ? <span> · 已结: {fmt(d.total_interest_paid)}</span> : ''}
        </p>

        {/* Actions */}
        <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
          {d.status === 'active' && d.interest_frequency !== 'maturity' && d.interest_frequency !== 'upfront' && (
            <button onClick={() => handlePayInterest(d.id)} className="btn-outline-sm !text-xs flex-1">结息</button>
          )}
          {d.status === 'active' && (
            <button onClick={() => handleMature(d.id)} className="btn-primary-sm !text-xs flex-1">到期提现</button>
          )}
          <button onClick={(e) => { e.stopPropagation(); openEdit(d); }} className="btn-outline-sm !text-xs !px-3"><IconPencil size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }} className="btn-outline-sm !text-xs !px-3 !text-red-400"><IconTrash size={14} /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">定存管理</h2>
        <button onClick={() => setShowForm(true)} className="btn-primary-sm flex items-center gap-1"><IconPlus size={14} />新建</button>
      </div>

      {msg && <p className={`text-xs ${msg.includes('失败') ? 'text-red-500' : 'text-green-600'}`}>{msg}</p>}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-3 text-center">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">定存总额</p>
          <p className="text-base font-semibold">{fmt(totalAmount)}</p>
          <p className="text-[9px] text-gray-400 dark:text-gray-500">等值 {baseCurrency}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-3 text-center">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">预期利息</p>
          <p className="text-base font-semibold text-primary-600">{fmt(totalExpected)}</p>
          <p className="text-[9px] text-gray-400 dark:text-gray-500">等值 {baseCurrency}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-3 text-center">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">即将到期</p>
          <p className={`text-base font-semibold ${soonCount > 0 ? 'text-orange-500' : ''}`}>{soonCount}</p>
          <p className="text-[9px] text-gray-400 dark:text-gray-500">笔</p>
        </div>
      </div>

      {/* Active deposits */}
      {activeDeposits.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">进行中 ({activeDeposits.length})</p>
          {activeDeposits.map(d => <DepositCard key={d.id} d={d} />)}
        </div>
      )}

      {/* Matured deposits */}
      {maturedDeposits.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-400 dark:text-gray-500">已到期 ({maturedDeposits.length})</p>
          {maturedDeposits.map(d => <DepositCard key={d.id} d={d} />)}
        </div>
      )}

      {deposits.length === 0 && (
        <p className="text-center text-gray-400 dark:text-gray-500 py-10 text-sm">暂无定存记录</p>
      )}

      {/* Add form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => resetForm()}>
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl w-full max-w-lg p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Drag handle */}
            <div className="flex justify-center -mt-1 mb-2">
              <div className="w-8 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex items-center justify-between">
              <h3 className="font-medium">新建定存</h3>
              <button type="button" onClick={resetForm} className="text-gray-400 dark:text-gray-500 text-lg">×</button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              {/* Name */}
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">名称</p>
                <input type="text" className="input-sm" placeholder="如：3个月定期" value={name} onChange={e => setName(e.target.value)} required />
              </div>

              {/* Amount + Currency */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">金额</p>
                  <input type="number" step="0.01" className="input-sm" placeholder="50000" value={amount} onChange={e => setAmount(e.target.value)} required />
                </div>
                <div className="w-24">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">币种</p>
                  <select value={currency} onChange={e => setCurrency(e.target.value as any)} className="select-sm">
                    <option value="AED">AED</option>
                    <option value="CNY">CNY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="JPY">JPY</option>
                  </select>
                </div>
              </div>

              {/* Rate */}
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">年利率 (%)</p>
                <input type="number" step="0.01" className="input-sm" placeholder="2.68" value={interestRate} onChange={e => setInterestRate(e.target.value)} required />
              </div>

              {/* Frequency + Term */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">结息方式</p>
                  <select value={frequency} onChange={e => setFrequency(e.target.value as InterestFrequency)} className="select-sm">
                    <option value="maturity">到期一次性结息</option>
                    <option value="monthly">每月结息</option>
                    <option value="quarterly">每季度结息</option>
                    <option value="upfront">开始前一次性结息</option>
                  </select>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">存期</p>
                  {customTerm ? (
                    <div className="flex gap-1">
                      <input type="number" className="input-sm flex-1" value={customTerm} onChange={e => setCustomTerm(e.target.value)} min={1} placeholder="月数" />
                      <button type="button" onClick={() => setCustomTerm('')} className="text-gray-400 dark:text-gray-500 text-xs px-2">预设</button>
                    </div>
                  ) : (
                    <select value={termMonths} onChange={e => {
                      const v = Number(e.target.value);
                      if (v === -1) setCustomTerm('1');
                      else setTermMonths(v);
                    }} className="select-sm">
                      <option value={1}>1 个月</option><option value={3}>3 个月</option>
                      <option value={6}>6 个月</option><option value={12}>12 个月</option>
                      <option value={24}>24 个月</option><option value={36}>36 个月</option>
                      <option value={60}>60 个月</option>
                      <option value={-1}>自定义月数</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Start date */}
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">起始日期</p>
                <input type="date" className="input-sm max-w-[240px]" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>

              {/* Summary */}
              <div className="bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">本次定存摘要</p>
                <p className="text-xs text-gray-600 dark:text-gray-500">
                  到期日 {maturityDate} · 预期利息 <span className="text-primary-600 font-medium">{expectedInterest} {currency}</span>
                </p>
              </div>

              {/* Create expense checkbox */}
              <label className="flex items-center gap-2 cursor-pointer">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${createExpense ? 'bg-primary-600 border-primary-600' : 'border-gray-300'}`}
                  onClick={(e) => { e.preventDefault(); setCreateExpense(!createExpense); }}>
                  {createExpense && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className="text-xs text-gray-500">创建一笔投资支出记录</span>
              </label>

              {/* Note */}
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">备注（选填）</p>
                <input type="text" className="input-sm" placeholder="备注..." value={note} onChange={e => setNote(e.target.value)} />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={resetForm} className="btn-outline flex-1">取消</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? '创建中...' : '创建'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editDeposit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => setEditDeposit(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl w-full max-w-lg p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center -mt-1 mb-2">
              <div className="w-8 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="flex items-center justify-between">
              <h3 className="font-medium">编辑定存</h3>
              <button type="button" onClick={() => setEditDeposit(null)} className="text-gray-400 dark:text-gray-500 text-lg">×</button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">名称</p>
                <input type="text" className="input-sm" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">备注</p>
                <input type="text" className="input-sm" value={note} onChange={e => setNote(e.target.value)} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditDeposit(null)} className="btn-outline flex-1">取消</button>
                <button onClick={async () => {
                  setSaving(true);
                  try {
                    await api.updateDeposit(editDeposit.id, {
                      name: name.trim(), note: note || undefined,
                    });
                    setEditDeposit(null);
                    fetch();
                    setMsg('已更新');
                  } catch (err: any) { setMsg(err.message || '更新失败'); }
                  finally { setSaving(false); }
                }} className="btn-primary flex-1">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
