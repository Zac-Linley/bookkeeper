import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { IconChevronLeft } from '../lib/icons';
import QRCode from 'qrcode';

export default function AccountInfoPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [totpEnabled, setTotpEnabled] = useState(!!user?.totp_enabled);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [enableCode, setEnableCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [totpMsg, setTotpMsg] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);

  const handleSave = async () => {
    setSaving(true); setMsg('');
    try {
      const data: any = {};
      if (displayName !== user?.display_name) data.display_name = displayName;
      if (password && password.length >= 6) data.password = password;
      if (Object.keys(data).length > 0) {
        await api.updateProfile(data);
        await refreshUser();
        setPassword('');
      }
      setMsg('已保存');
    } catch (err: any) {
      setMsg(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTotpSetup = async () => {
    setTotpBusy(true); setTotpMsg('');
    try {
      const s = await api.getTotpSetup();
      setTotpSetup(s);
      setQrUrl(await QRCode.toDataURL(s.otpauth_url, { width: 200, margin: 1 }));
    } catch (err: any) {
      setTotpMsg(err.message || '获取密钥失败');
    } finally {
      setTotpBusy(false);
    }
  };

  const handleTotpEnable = async () => {
    if (enableCode.length !== 6) return;
    setTotpBusy(true); setTotpMsg('');
    try {
      await api.enableTotp(enableCode);
      setTotpEnabled(true); setTotpSetup(null); setQrUrl(''); setEnableCode('');
      await refreshUser();
      setTotpMsg('TOTP 已开启');
    } catch (err: any) {
      setTotpMsg(err.message || '开启失败');
    } finally {
      setTotpBusy(false);
    }
  };

  const handleTotpDisable = async () => {
    if (disableCode.length !== 6) return;
    setTotpBusy(true); setTotpMsg('');
    try {
      await api.disableTotp(disableCode);
      setTotpEnabled(false); setDisableCode('');
      await refreshUser();
      setTotpMsg('TOTP 已关闭');
    } catch (err: any) {
      setTotpMsg(err.message || '关闭失败');
    } finally {
      setTotpBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-gray-400 dark:text-gray-500"><IconChevronLeft size={18} stroke={1.5} /></button>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">账户信息</span>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">昵称</p>
          <input type="text" className="input-field" value={displayName}
            onChange={e => setDisplayName(e.target.value)} />
        </div>

        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">新密码（不修改则留空）</p>
          <input type="password" className="input-field" placeholder="至少6位"
            value={password} onChange={e => setPassword(e.target.value)} minLength={6} />
        </div>

        {msg && <p className={`text-xs ${msg === '已保存' ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}

        <button onClick={handleSave} disabled={saving}
          className="btn-primary w-full">
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>

      {/* TOTP two-factor */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">二次验证（TOTP）</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">使用身份验证器 App（如 Google Authenticator）扫码开启，登录时无需等待邮件验证码。</p>

        {!totpEnabled ? (
          !totpSetup ? (
            <button onClick={handleTotpSetup} disabled={totpBusy}
              className="btn-outline w-full">
              {totpBusy ? '获取中...' : '开启 TOTP'}
            </button>
          ) : (
            <div className="space-y-3">
              {qrUrl && (
                <div className="flex justify-center bg-white p-3 rounded-lg">
                  <img src={qrUrl} alt="TOTP 二维码" className="w-44 h-44" />
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">密钥（也可手动输入）</p>
                <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">{totpSetup.secret}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">输入 App 中显示的 6 位验证码确认</p>
                <input type="text" inputMode="numeric" maxLength={6}
                  className="input-field text-center tracking-widest"
                  placeholder="000000" value={enableCode}
                  onChange={e => setEnableCode(e.target.value.replace(/\D/g, ''))} />
              </div>
              <button onClick={handleTotpEnable} disabled={totpBusy || enableCode.length !== 6}
                className="btn-primary w-full disabled:opacity-50">
                {totpBusy ? '验证中...' : '确认开启'}
              </button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-green-600 dark:text-green-400">✓ 已开启</p>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">输入当前验证码以关闭</p>
              <input type="text" inputMode="numeric" maxLength={6}
                className="input-field text-center tracking-widest"
                placeholder="000000" value={disableCode}
                onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))} />
            </div>
            <button onClick={handleTotpDisable} disabled={totpBusy || disableCode.length !== 6}
              className="btn-danger w-full disabled:opacity-50">
              {totpBusy ? '验证中...' : '关闭 TOTP'}
            </button>
          </div>
        )}

        {totpMsg && <p className={`text-xs ${totpMsg.includes('失败') || totpMsg.includes('无效') ? 'text-red-500' : 'text-green-600'}`}>{totpMsg}</p>}
      </div>
    </div>
  );
}
