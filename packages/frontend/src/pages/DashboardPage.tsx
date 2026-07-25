import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { IconPencilPlus, IconChevronLeft, IconChevronRight, IconChevronDown } from '../lib/icons';
import { IconPigMoney } from '@tabler/icons-react';
import type { SummaryResponse } from '@bookkeeper/shared';

const COLORS = ['#ef4444','#3b82f6','#f59e0b','#22c55e','#8b5cf6','#ec4899','#06b6d4','#f97316','#14b8a6','#6366f1','#84cc16','#e11d48'];

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartTab, setChartTab] = useState<'expense' | 'income'>('expense');
  const [rateOpen, setRateOpen] = useState(false);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    setLoading(true);
    api.getSummary({ year, month }).then(setSummary).finally(() => setLoading(false));
  }, [year, month]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;

  const fmt = (n: number) => n.toFixed(2);
  const base = summary?.base_currency || 'AED';

  // Build chart data based on tab
  const chartData = chartTab === 'expense'
    ? (summary?.expense_categories || [])
    : (summary?.income_categories || []);

  return (
    <div className="space-y-3">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="text-gray-400"><IconChevronLeft size={20} stroke={1.5} /></button>
        <span className="text-sm font-medium text-gray-700">{year}年{month}月 · {base}</span>
        <button onClick={nextMonth} className="text-gray-400"><IconChevronRight size={20} stroke={1.5} /></button>
      </div>

      {/* Rate bar — collapsible */}
      {summary?.exchange_rates && summary.exchange_rates.length > 0 && (
        <div>
          <button onClick={() => setRateOpen(!rateOpen)}
            className="w-full flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500">
            <span className="font-medium">💱</span>
            {summary.exchange_rates.slice(0, rateOpen ? 10 : 1).map(r => (
              <span key={r.from + r.to}>1 {r.from} ≈ {r.rate.toFixed(4)} {r.to}</span>
            ))}
            {summary.exchange_rates.length > 1 && (
              <IconChevronDown size={12} className={`ml-auto transition-transform ${rateOpen ? 'rotate-180' : ''}`} />
            )}
          </button>
        </div>
      )}

      {/* 3-card summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
          <p className="text-[11px] text-gray-400 mb-1">支出</p>
          <p className="text-base font-semibold text-expense">{fmt(summary?.total_expense || 0)}</p>
          <p className="text-[9px] text-gray-400">等值 {base}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
          <p className="text-[11px] text-gray-400 mb-1">收入</p>
          <p className="text-base font-semibold text-income">{fmt(summary?.total_income || 0)}</p>
          <p className="text-[9px] text-gray-400">等值 {base}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
          <p className="text-[11px] text-gray-400 mb-1">结余</p>
          <p className={`text-base font-semibold ${(summary?.balance || 0) >= 0 ? 'text-primary-600' : 'text-expense'}`}>
            {fmt(summary?.balance || 0)}
          </p>
          <p className="text-[9px] text-gray-400">等值 {base}</p>
        </div>
      </div>

      {/* Chart section */}
      <div className="bg-gray-50 rounded-xl p-3">
        {/* Tab toggle */}
        <div className="flex gap-1 mb-3">
          <button onClick={() => setChartTab('expense')}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              chartTab === 'expense' ? 'bg-primary-600 text-white' : 'text-gray-500'
            }`}>支出分类</button>
          <button onClick={() => setChartTab('income')}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              chartTab === 'income' ? 'bg-primary-600 text-white' : 'text-gray-500'
            }`}>收入分类</button>
        </div>

        {/* Donut + Legend */}
        {chartData.length > 0 ? (
          <div className="flex items-center gap-3">
            <div className="w-[120px] h-[120px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="total" nameKey="category_name"
                    cx="50%" cy="50%" outerRadius={48} innerRadius={28}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              {chartData.slice(0, 6).map((c, i) => {
                const total = chartData.reduce((s, x) => s + x.total, 0) || 1;
                const pct = Math.round((c.total / total) * 100);
                return (
                  <div key={c.category_id} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-gray-700 truncate flex-1">{c.category_name}</span>
                    <span className="text-gray-400">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-6">暂无数据</p>
        )}
      </div>

      {/* Deposit overview */}
      <DepositOverview />

      {/* Add button */}
      <button type="button"
        onPointerDown={(e) => { e.preventDefault(); navigate('/transactions/new'); }}
        className="w-full bg-primary-600 text-white rounded-xl py-3 font-medium text-sm flex items-center justify-center gap-2 active:bg-primary-700 select-none"
        style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>
        <IconPencilPlus size={18} stroke={1.5} className="pointer-events-none" />记一笔
      </button>
    </div>
  );
}

function DepositOverview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<{ total: number; expected: number; soon: number; showConverted: boolean }>({ total: 0, expected: 0, soon: 0, showConverted: true });
  const [rateMap, setRateMap] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([api.getDeposits(), api.getExchangeRates()]).then(([ds, er]) => {
      const deposits = ds || [];
      const map: Record<string, number> = {};
      const rates = (er as any)?.rates || (er as any)?.data?.rates || [];
      for (const r of rates) map[r.target] = r.rate;
      setRateMap(map);

      const active = deposits.filter((d: any) => d.status === 'active');
      const base = user?.default_currency || 'AED';
      const conv = (amt: number, from: string) => {
        if (from === base || !map[from] || !map[base]) return amt;
        return (amt / map[from]) * map[base];
      };
      const total = active.reduce((s: number, d: any) => s + conv(d.amount, d.currency), 0);
      const expected = active.reduce((s: number, d: any) => s + conv(d.expected_interest || 0, d.currency), 0);
      const soon = active.filter((d: any) => (new Date(d.maturity_date).getTime() - Date.now()) / 86400000 <= 30).length;
      setData({ total, expected, soon, showConverted: true });
    }).catch(() => {});
  }, [user]);

  if (data.total === 0) return null;
  const base = user?.default_currency || 'AED';

  return (
    <button onClick={() => navigate('/deposits')}
      className="w-full bg-white border border-gray-200 rounded-xl p-3 text-left active:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600 flex items-center gap-1"><IconPigMoney size={14} />定存概览</span>
        <span className="text-xs text-gray-400">{data.showConverted ? `等值 ${base}` : '原币种'} · 查看 →</span>
      </div>
      <div className="flex gap-4 text-xs">
        <span className="text-gray-700">总额 <strong>{data.total.toFixed(0)}</strong></span>
        <span className="text-primary-600">预期利息 <strong>{data.expected.toFixed(0)}</strong></span>
        {data.soon > 0 && <span className="text-orange-500 font-medium">{data.soon}笔即将到期</span>}
      </div>
    </button>
  );
}
