import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-2 text-primary-700">记账本</h1>
        <p className="text-center text-gray-500 mb-8">便捷记账，轻松管理</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email" className="input-field" placeholder="邮箱"
            value={email} onChange={e => setEmail(e.target.value)} required
          />
          <input
            type="password" className="input-field" placeholder="密码"
            value={password} onChange={e => setPassword(e.target.value)} required
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="text-center text-gray-500 mt-6">
          还没有账号？ <Link to="/register" className="text-primary-600 font-medium">注册</Link>
        </p>
      </div>
    </div>
  );
}
