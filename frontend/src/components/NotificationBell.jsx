import { useEffect, useState } from 'react';
import { Badge, Dropdown, List, Button, Typography, Empty, Spin } from 'antd';
import { BellOutlined, CheckOutlined } from '../icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { notificationsApi, newsApi } from '../api';
import { useAuth } from '../store/auth';

const { Text } = Typography;

// A teacher has read no news yet if localStorage has never recorded a time
// for them; everything published before that "since" mark reads as seen.
const newsSeenKey = (userId) => `news_seen_at:${userId}`;

/**
 * Header bell. Students get their existing per-student feed (new assignment,
 * live session, …) merged with published news; teachers — who have no other
 * feed — get news only. Both are scoped server-side to the caller's role, so
 * nothing here decides who a news item is "for", only how to show it.
 */
export default function NotificationBell() {
  const { t } = useTranslation();
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const showsNews = role === 'teacher' || role === 'student';
  const seenAt = Number(localStorage.getItem(newsSeenKey(user?.id)) || 0);

  const load = () => {
    setLoading(true);
    const tasks = [
      role === 'student'
        ? notificationsApi.list().then((d) => (d.notifications || d || []).map((n) => ({ ...n, kind: 'notification' })))
        : Promise.resolve([]),
      showsNews
        ? newsApi.list().then((rows) => rows.map((n) => ({
            id: `news-${n.id}`, newsId: n.id, title: n.title, message: n.content,
            created_at: n.created_at, kind: 'news',
          })))
        : Promise.resolve([]),
    ];
    Promise.all(tasks)
      .then(([notifs, news]) =>
        setItems([...notifs, ...news].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
      )
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (showsNews) load(); }, [role]);

  if (!showsNews) return null;

  const unread = items.filter((n) => (n.kind === 'news' ? new Date(n.created_at).getTime() > seenAt : !n.is_read)).length;

  const markAll = async () => {
    if (role === 'student') await notificationsApi.readAll();
    localStorage.setItem(newsSeenKey(user?.id), String(Date.now()));
    load();
  };

  const openItem = async (n) => {
    if (n.kind === 'news') {
      localStorage.setItem(newsSeenKey(user?.id), String(Date.now()));
      setOpen(false);
      navigate(`/${role}/news`);
      return;
    }
    if (!n.is_read) await notificationsApi.read(n.id).catch(() => {});
    setOpen(false);
    navigate('/student/notifications');
  };

  const panel = (
    <div style={{ width: 340, background: '#fff', borderRadius: 10, boxShadow: '0 6px 24px rgba(var(--brand-rgb),0.16)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #eef5fa' }}>
        <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('nav.notifications')}</strong>
        {unread > 0 && (
          // Short label ("Barchasini o'qildi"), not the long admin one — the
          // panel is only 340px wide and the long text used to spill out of it.
          <Button type="link" size="small" icon={<CheckOutlined />} onClick={markAll} style={{ flexShrink: 0, paddingInline: 0 }}>
            {t('student.readAll')}
          </Button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
      ) : items.length === 0 ? (
        <Empty style={{ padding: 20 }} image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('admin.noNotifications')} />
      ) : (
        <List
          size="small"
          style={{ maxHeight: 340, overflowY: 'auto' }}
          dataSource={items.slice(0, 8)}
          renderItem={(n) => {
            const unreadItem = n.kind === 'news' ? new Date(n.created_at).getTime() > seenAt : !n.is_read;
            return (
              <List.Item
                style={{ padding: '10px 14px', cursor: 'pointer', background: unreadItem ? '#f5fbff' : '#fff' }}
                onClick={() => openItem(n)}
              >
                <List.Item.Meta
                  title={<span style={{ fontSize: 13, fontWeight: unreadItem ? 600 : 400 }}>{n.title}</span>}
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                      {n.message}
                    </Text>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={(o) => { setOpen(o); if (o) load(); }}
      trigger={['click']}
      placement="bottomRight"
      dropdownRender={() => panel}
    >
      <Badge count={unread} size="small" offset={[-6, 6]}>
        <span className="header-icon-chip header-icon-chip--accent" style={{ cursor: 'pointer' }}>
          <BellOutlined style={{ fontSize: 17 }} />
        </span>
      </Badge>
    </Dropdown>
  );
}
