import { useState, useEffect, useRef } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '../icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/auth';
import { warmUp, isNetworkError } from '../api/client';
import { apiError } from '../utils/format';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { LogoMark, APP_NAME } from '../components/Logo';

// How long a login may take before we tell the user the server is waking up
// rather than leaving them looking at a silent spinner.
const WAKING_HINT_AFTER = 4000;

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [waking, setWaking] = useState(false);
  const wakingTimer = useRef(null);

  // Start the free host's cold start while the user is still typing, so the
  // login request itself meets a server that is already up.
  useEffect(() => {
    warmUp();
  }, []);

  useEffect(() => () => clearTimeout(wakingTimer.current), []);

  const onFinish = async (values) => {
    setLoading(true);
    wakingTimer.current = setTimeout(() => setWaking(true), WAKING_HINT_AFTER);
    try {
      const data = await login(values.username, values.password);
      message.success(t('auth.loginSuccess'));
      navigate(`/${data.role}`);
    } catch (e) {
      // A dropped connection is not a wrong password, and saying "sign-in
      // failed" for it sends the user off checking credentials that were fine.
      message.error(
        isNetworkError(e) ? t('auth.connectionError') : apiError(e, t('auth.loginError'))
      );
    } finally {
      clearTimeout(wakingTimer.current);
      setWaking(false);
      setLoading(false);
    }
  };

  return (
    <div
      className="mesh-bg"
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'linear-gradient(160deg, #06131f 0%, #0a2d40 45%, #0f5f92 78%, var(--brand) 100%)',
      }}
    >
      <style>{`
        .login-lang-switch .ant-btn {
          color: #fff; background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.22);
          backdrop-filter: blur(8px);
        }
        .login-lang-switch .ant-btn:hover { background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.32); color: #fff; }
      `}
      </style>
      <div className="login-lang-switch" style={{ position: 'absolute', top: 20, right: 20, zIndex: 1 }}>
        <LanguageSwitcher type="default" />
      </div>

      <Card
        className="glass-panel premium-enter"
        style={{ width: 408, maxWidth: '92vw', borderRadius: 20, border: 'none', position: 'relative' }}
        styles={{ body: { padding: '38px 34px 30px' } }}
      >
        {/* A thin brand-to-accent gradient hairline along the card's top edge
            — the one purely decorative touch that signals "designed", not
            "default antd Card". */}
        <div
          style={{
            position: 'absolute', top: 0, left: 20, right: 20, height: 3, borderRadius: 3,
            background: 'linear-gradient(90deg, var(--brand), var(--ai-accent))',
          }}
        />
        {/* The mark alone doesn't spell the platform name out like the full
            lockup did, so the name is set as a title beneath it. */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div
            style={{
              display: 'inline-flex', borderRadius: 20, margin: '0 auto 14px',
              boxShadow: '0 0 0 8px rgba(var(--brand-rgb),0.08), 0 12px 24px -8px rgba(var(--shadow-rgb),0.35)',
            }}
          >
            <LogoMark size={72} radius={16} />
          </div>
          <Typography.Title
            level={3}
            style={{
              margin: '0 0 4px', fontWeight: 800,
              background: 'linear-gradient(90deg, #0a2d40, var(--brand))',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}
          >
            {APP_NAME}
          </Typography.Title>
          <Typography.Text type="secondary">{t('auth.tagline')}</Typography.Text>
        </div>
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="username" rules={[{ required: true, message: t('auth.enterUsername') }]}>
            <Input size="large" variant="filled" prefix={<UserOutlined style={{ color: '#9aaebf' }} />} placeholder={t('auth.username')} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: t('auth.enterPassword') }]} style={{ marginBottom: 22 }}>
            <Input.Password size="large" variant="filled" prefix={<LockOutlined style={{ color: '#9aaebf' }} />} placeholder={t('auth.password')} />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ fontWeight: 600 }}>
            {t('auth.login')}
          </Button>
        </Form>
        {/* Shown only once the wait is long enough to look broken. It says the
            request is still alive and roughly why, which is the difference
            between waiting a few more seconds and reloading the page. */}
        {waking && (
          <Typography.Paragraph
            type="secondary"
            style={{ textAlign: 'center', fontSize: 12, margin: '12px 0 0' }}
          >
            {t('auth.waking')}
          </Typography.Paragraph>
        )}
        {/* No registration and no demo credentials: the admin creates every
            account and hands out the login/password personally. */}
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center', fontSize: 12, margin: '16px 0 0' }}>
          {t('auth.adminOnlyHint')}
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
