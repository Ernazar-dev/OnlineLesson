import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Result
        status="404"
        title="404"
        subTitle={t('notFound.subtitle')}
        extra={<Button type="primary" onClick={() => navigate('/')}>{t('notFound.home')}</Button>}
      />
    </div>
  );
}
