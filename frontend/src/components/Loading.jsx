import { Spin } from 'antd';
import { useTranslation } from 'react-i18next';

export default function Loading({ tip }) {
  const { t } = useTranslation();
  return (
    <div className="page-fallback">
      <Spin size="large" tip={tip || t('common.loading')}>
        <div style={{ padding: 40 }} />
      </Spin>
    </div>
  );
}
