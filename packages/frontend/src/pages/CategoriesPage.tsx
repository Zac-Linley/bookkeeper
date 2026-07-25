import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { CatIcon, IconPlus, IconX, IconPencilPlus } from '../lib/icons';
import type { Category, TransactionType } from '@bookkeeper/shared';

const ICON_OPTIONS = [
  'car','utensils','wifi','truck','package','shield','tool','printer','bulb','plane','dots',
  'cash','gift','receipt','hand-loan',
  'home','shopping','mobile','bolt','bike','bus','train','ship','store','hospital',
  'school','books','laptop','headphones','shirt','heart','baby','paw',
  'plant','coffee','bottle','pig-money','credit-card','wallet','coin',
  'ticket','movie','music','sport','swim','gym','dog','cat','tree',
  'water','fire','wind','cloud','sun','moon','umbrella','backpack','shoe','drink',
  'first-aid','medical','vaccine','pill',
  '📌',
];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Record<TransactionType, Category[]>>({ expense: [], income: [] });
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState('');

  // Add form state
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<TransactionType>('expense');
  const [newIcon, setNewIcon] = useState('dots');

  const fetch = useCallback(() => {
    Promise.all([api.getCategories('expense'), api.getCategories('income')]).then(([e, i]) => {
      setCategories({ expense: e, income: i });
      setLoading(false);
    });
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleDelete = async (cat: Category) => {
    if (cat.is_system) return;
    setError('');
    if (!confirm(`删除「${cat.name}」？`)) return;
    try {
      await api.deleteCategory(cat.id);
      fetch();
    } catch (err: any) {
      setError(err.message || '删除失败');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    try {
      await api.createCategory({ name: newName.trim(), type: newType, icon: newIcon });
      setNewName('');
      setNewIcon('dots');
      setShowAdd(false);
      fetch();
    } catch (err: any) {
      setError(err.message || '添加失败');
    }
  };

  const openAdd = (t: TransactionType) => {
    setNewType(t);
    setShowAdd(true);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;

  const CatGrid = ({ type, cats }: { type: TransactionType; cats: Category[] }) => (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-gray-500">{type === 'expense' ? '支出类别' : '收入类别'}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cats.map(c => (
          <div key={c.id}
            className={`relative text-center rounded-lg p-2 ${
              c.is_system
                ? 'bg-white border border-gray-100'
                : 'bg-blue-50/50 border border-blue-100'
            }`}
          >
            {!c.is_system && (
              <>
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" />
                {editMode && (
                  <button type="button" onClick={() => handleDelete(c)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center shadow-sm">
                    <IconX size={10} stroke={2} />
                  </button>
                )}
              </>
            )}
            <span className="flex justify-center mb-1"><CatIcon name={c.icon} size={20} /></span>
            <p className="text-[10px] text-gray-600 leading-tight">{c.name}</p>
          </div>
        ))}
        {/* Add button */}
        <button type="button" onClick={() => openAdd(type)}
          className="text-center rounded-lg p-2 border border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 hover:bg-gray-50 active:bg-gray-100 transition-colors">
          <IconPlus size={18} className="text-gray-400" stroke={1.5} />
          <p className="text-[10px] text-gray-400">添加</p>
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">类别管理</h2>
        <button type="button" onClick={() => setEditMode(!editMode)}
          className={`text-sm font-medium px-3 py-1 rounded-lg border transition-colors ${
            editMode
              ? 'bg-primary-600 text-white border-primary-600'
              : 'text-primary-600 border-primary-300 active:bg-primary-50'
          }`}>
          {editMode ? '完成' : '编辑'}
        </button>
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}

      {editMode && (
        <p className="text-xs text-gray-400 -mt-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1" />蓝点=自定义类别，点击红色×删除
        </p>
      )}

      <CatGrid type="expense" cats={categories.expense} />
      <CatGrid type="income" cats={categories.income} />

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-medium text-sm">添加{newType === 'expense' ? '支出' : '收入'}类别</h3>

            <form onSubmit={handleAdd} className="space-y-3">
              <input type="text" className="input-sm" placeholder="类别名称"
                value={newName} onChange={e => setNewName(e.target.value)} required autoFocus />

              <div>
                <p className="text-xs text-gray-400 mb-2">选择图标</p>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map(icon => (
                    <button key={icon} type="button"
                      onClick={() => setNewIcon(icon)}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-colors ${
                        newIcon === icon ? 'bg-primary-100 border-primary-400' : 'bg-white border-gray-200 active:bg-gray-50'
                      }`}>
                      <CatIcon name={icon} size={18} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAdd(false)} className="btn-outline flex-1">取消</button>
                <button type="submit" className="btn-primary flex-1">添加</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
