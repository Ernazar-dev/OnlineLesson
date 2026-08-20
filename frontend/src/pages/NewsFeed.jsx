import { useEffect, useState } from 'react';
import { List, Card, Typography, Empty, Button } from 'antd';
import { NotificationOutlined, ReloadOutlined } from '../icons';
import { useTranslation } from 'react-i18next';
import { newsApi } from '../api';
import Loading from '../components/Loading';
import DashboardHero from '../components/DashboardHero';

// Read-only — what admin/News.jsx publishes, already scoped server-side to
// this user's own role (plus anything aimed at everyone). Same page for
// teacher and student; there is nothing role-specific left to render once
// the API has done the filtering.
export default function NewsFeed() {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    newsApi.list().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (rows === null) return <Loading />;

  return (
    <div style={{ maxWidth: 800 }}>
      <DashboardHero
        title={<><NotificationOutlined /> {t('news.title')}</>}
        extra={<Button icon={<ReloadOutlined />} loading={loading} onClick={load}>{t('common.refresh')}</Button>}
      />
      {rows.length === 0 ? (
        <Card bordered={false} className="shadow-sm" style={{ borderRadius: 16 }}>
          <Empty description={t('news.empty')} />
        </Card>
      ) : (
        <List
          dataSource={rows}
          renderItem={(n) => (
            <Card bordered={false} className="shadow-sm premium-enter" style={{ marginBottom: 12, borderRadius: 16 }}>
              <Card.Meta
                title={n.title}
                description={(
                  <>
                    <Typography.Paragraph style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}>
                      {n.content}
                    </Typography.Paragraph>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {n.author_name} · {new Date(n.created_at).toLocaleDateString()}
                    </Typography.Text>
                  </>
                )}
              />
            </Card>
          )}
        />
      )}
    </div>
  );
}
