import { useEffect, useState } from 'react';
import { List, Card, Button, Tag, Typography, Empty, Space } from 'antd';
import { CheckOutlined, BellOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { notificationsApi } from '../../api';
import Loading from '../../components/Loading';
import { formatDateTime } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';

export default function Notifications() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  const load = () => notificationsApi.list().then(setData).catch(() => setData({ notifications: [], unread_count: 0 }));
  useEffect(() => { load(); }, []);

  const readAll = async () => {
    try { await notificationsApi.readAll(); } catch { /* the reload below shows the real state */ }
    load();
  };
  const readOne = async (id) => {
    try { await notificationsApi.read(id); } catch { /* as above */ }
    load();
  };

  if (!data) return <Loading />;

  return (
    <div style={{ maxWidth: 800 }}>
      <DashboardHero
        title={<>{t('student.notificationsTitle')} {data.unread_count > 0 && <Tag color="red">{data.unread_count}</Tag>}</>}
        extra={data.unread_count > 0 && (
          <Button icon={<CheckOutlined />} onClick={readAll} style={{ flexShrink: 0, whiteSpace: 'normal', height: 'auto' }}>
            {t('student.readAll')}
          </Button>
        )}
      />
      <Card bordered={false} className="shadow-sm" style={{ borderRadius: 16 }}>
        {data.notifications.length === 0 ? <Empty description={t('student.noNotifications')} /> : (
          <List
            dataSource={data.notifications}
            renderItem={(n) => (
              <List.Item
                style={{ background: n.is_read ? undefined : '#e6f4ff', padding: 12, borderRadius: 8 }}
                actions={!n.is_read ? [<Button key="r" size="small" icon={<CheckOutlined />} onClick={() => readOne(n.id)} />] : []}>
                <List.Item.Meta
                  title={<Space>{n.title}{!n.is_read && <Tag color="blue">{t('student.new')}</Tag>}</Space>}
                  description={<><div>{n.message}</div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(n.created_at)}</Typography.Text></>}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
}
