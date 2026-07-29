import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function RegisterPage() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('密码至少6位');
      return;
    }
    setLoading(true);
    try {
      await register(email, password, displayName);
    } catch (err: any) {
      setError(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-2 text-primary-700">注册账号</h1>
        <p className="text-center text-gray-500 dark:text-gray-500 mb-8">创建你的记账账户</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text" className="input-field" placeholder="昵称"
            value={displayName} onChange={e => setDisplayName(e.target.value)} required
          />
          <input
            type="email" className="input-field" placeholder="邮箱"
            value={email} onChange={e => setEmail(e.target.value)} required
          />
          <input
            type="password" className="input-field" placeholder="密码（至少6位）"
            value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? '注册中...' : '注册'}
          </button>
        </form>

        <p className="text-center text-gray-500 dark:text-gray-500 mt-6">
          已有账号？ <Link to="/login" className="text-primary-600 font-medium">登录</Link>
        </p>
      </div>
    </div>
  );
}
