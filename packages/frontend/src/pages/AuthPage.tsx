import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { IconMail, IconLock, IconEye, IconEyeOff, IconWallet } from '../lib/icons';

export default function AuthPage() {
  const { login, register, verify2FA } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [twoFactorEmail, setTwoFactorEmail] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  const reset = () => {
    setEmail(''); setPassword(''); setDisplayName(''); setConfirmPassword('');
    setError(''); setShowPassword(false);
  };

  const switchTab = (t: 'login' | 'register') => {
    setTab(t); reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) { setError('请填写邮箱和密码'); return; }
    if (password.length < 6) { setError('密码至少6位'); return; }

    if (tab === 'register') {
      if (!displayName.trim()) { setError('请填写昵称'); return; }
      if (password !== confirmPassword) { setError('两次密码不一致'); return; }
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        const res = await login(email, password);
        if (res?.two_factor) {
          setTwoFactorEmail(res.email || email);
          setTwoFactorCode('');
          setError('');
          setLoading(false);
          return;
        }
        navigate('/');
      } else {
        await register(email, password, displayName.trim());
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message || (tab === 'login' ? '登录失败' : '注册失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-50">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-3">
            <IconWallet size={26} stroke={1.5} className="text-primary-600" />
          </div>
          <p className="text-lg font-semibold text-gray-800">记一笔</p>
          <p className="text-xs text-gray-400 mt-1">简单好用的记账工具</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-5">
          <button onClick={() => switchTab('login')}
            className={`flex-1 text-center pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'login' ? 'text-primary-600 border-primary-600' : 'text-gray-400 border-transparent'
            }`}>登录</button>
          <button onClick={() => switchTab('register')}
            className={`flex-1 text-center pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'register' ? 'text-primary-600 border-primary-600' : 'text-gray-400 border-transparent'
            }`}>注册</button>
        </div>

        {(twoFactorEmail && tab === 'login') ? (
          /* 2FA step */
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!twoFactorCode) return;
            setLoading(true); setError('');
            try {
              await verify2FA(twoFactorEmail, twoFactorCode);
              window.location.href = '/';
            } catch (err: any) { setError(err.message || '验证失败'); }
            finally { setLoading(false); }
          }} className="space-y-4">
            <p className="text-xs text-gray-500 text-center">验证码已发送至 {twoFactorEmail}</p>
            <div>
              <p className="text-xs text-gray-400 mb-1">验证码</p>
              <input type="text" inputMode="numeric" maxLength={6}
                className="w-full border border-gray-200 rounded-lg px-3 py-3 text-center text-xl tracking-widest outline-none bg-white"
                placeholder="000000" value={twoFactorCode} onChange={e => setTwoFactorCode(e.target.value)} />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button type="submit" disabled={loading || twoFactorCode.length !== 6}
              className="w-full bg-primary-600 text-white rounded-lg py-3 text-sm font-medium active:bg-primary-700 disabled:opacity-50"
              style={{ touchAction: 'manipulation' }}>
              {loading ? '验证中...' : '验证'}
            </button>
            <button type="button" onClick={() => { setTwoFactorEmail(''); setTwoFactorCode(''); }}
              className="w-full text-xs text-gray-400">返回登录</button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <p className="text-xs text-gray-400 mb-1">邮箱</p>
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-3 bg-white">
              <IconMail size={16} stroke={1.5} className="text-gray-400 shrink-0" />
              <input type="email" className="flex-1 outline-none text-sm bg-transparent placeholder-gray-300"
                placeholder="name@company.com" value={email}
                onChange={e => setEmail(e.target.value)} />
            </div>
          </div>

          {/* Password */}
          <div>
            <p className="text-xs text-gray-400 mb-1">密码</p>
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-3 bg-white">
              <IconLock size={16} stroke={1.5} className="text-gray-400 shrink-0" />
              <input type={showPassword ? 'text' : 'password'}
                className="flex-1 outline-none text-sm bg-transparent placeholder-gray-300"
                placeholder="至少6位" value={password}
                onChange={e => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="text-gray-400 shrink-0">
                {showPassword ? <IconEyeOff size={16} stroke={1.5} /> : <IconEye size={16} stroke={1.5} />}
              </button>
            </div>
          </div>

          {/* Register extra fields */}
          {tab === 'register' && (
            <>
              <div>
                <p className="text-xs text-gray-400 mb-1">昵称</p>
                <div className="border border-gray-200 rounded-lg px-3 py-3 bg-white">
                  <input type="text" className="w-full outline-none text-sm bg-transparent placeholder-gray-300"
                    placeholder="你的昵称" value={displayName}
                    onChange={e => setDisplayName(e.target.value)} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">确认密码</p>
                <div className="border border-gray-200 rounded-lg px-3 py-3 bg-white">
                  <input type={showPassword ? 'text' : 'password'}
                    className="w-full outline-none text-sm bg-transparent placeholder-gray-300"
                    placeholder="再次输入密码" value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* Forgot password */}
          {tab === 'login' && (
            <p className="text-xs text-primary-600 text-right">忘记密码</p>
          )}

          {error && <p className="text-red-500 text-xs">{error}</p>}

          {/* Submit */}
          <button type="submit" disabled={loading}
            className="w-full bg-primary-600 text-white rounded-lg py-3 text-sm font-medium active:bg-primary-700 disabled:opacity-50"
            style={{ touchAction: 'manipulation' }}>
            {loading ? '处理中...' : (tab === 'login' ? '登录' : '注册')}
          </button>
        </form>
        )}

        {/* Bottom link */}
        <p className="text-xs text-gray-500 text-center mt-4">
          {tab === 'login' ? (
            <>还没有账号？<button onClick={() => switchTab('register')} className="text-primary-600 font-medium">立即注册</button></>
          ) : (
            <>已有账号？<button onClick={() => switchTab('login')} className="text-primary-600 font-medium">去登录</button></>
          )}
        </p>
      </div>
    </div>
  );
}
