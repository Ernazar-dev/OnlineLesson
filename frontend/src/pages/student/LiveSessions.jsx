import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Table, Button, Typography, Space, Tag, Empty, message } from 'antd';
import { VideoCameraOutlined, LoginOutlined, CloseOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { liveSessionsApi } from '../../api';
import { apiError, formatDateTime } from '../../utils/format';
import { useAuth } from '../../store/auth';
import Loading from '../../components/Loading';
import AgoraVideoRoom from '../../components/AgoraVideoRoom';
import DashboardHero from '../../components/DashboardHero';

const STATUS_COLOR = { scheduled: 'blue', live: 'green', ended: 'default', cancelled: 'red' };

export default function StudentLiveSessions() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [room, setRoom] = useState(null);

  // A session going live is what a student is waiting for here, and nothing
  // pushes that change to an already-open tab — without a poll, "join"
  // appearing depends on the student refreshing the page at the right
  // moment. 20s keeps that wait short without hammering the API; it pauses
  // while the tab is in the background and while a call is open, since
  // neither needs a fresher list.
  useEffect(() => {
    const load = () => liveSessionsApi.list().then(setSessions).catch(() => setSessions((s) => s ?? []));
    const loadIfVisible = () => { if (!room && document.visibilityState === 'visible') load(); };
    load();
    const id = setInterval(loadIfVisible, 20000);
    // Catches up immediately on returning to the tab, rather than waiting
    // out the rest of the 20s tick — the moment a student is most likely to
    // check is right after switching back.
    document.addEventListener('visibilitychange', loadIfVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', loadIfVisible);
    };
  }, [room]);

  const join = async (session) => {
    try {
      const detail = await liveSessionsApi.get(session.id);
      setRoom(detail);
    } catch (e) {
      message.error(apiError(e, t('liveSession.loadError')));
    }
  };

  const columns = [
    { title: t('liveSession.titleField'), dataIndex: 'title' },
    { title: t('common.teacher'), dataIndex: 'teacher_name' },
    {
      title: t('liveSession.scheduledAt'),
      dataIndex: 'scheduled_at',
      width: 170,
      render: (v) => formatDateTime(v),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 140,
      render: (v) => <Tag color={STATUS_COLOR[v]}>{t(`liveSession.status${v.charAt(0).toUpperCase()}${v.slice(1)}`)}</Tag>,
    },
    {
      title: '', width: 160, render: (_, r) => (
        r.status === 'live'
          ? (
            <Button size="small" type="primary" icon={<LoginOutlined />} onClick={() => join(r)}>
              {t('liveSession.join')}
            </Button>
          )
          : <Tag>{t('liveSession.notStarted')}</Tag>
      ),
    },
  ];

  if (!sessions) return <Loading />;

  return (
    <div>
      <DashboardHero title={<><VideoCameraOutlined /> {t('student.liveSessionsTitle')}</>} />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={sessions}
        scroll={{ x: 700 }}
        locale={{ emptyText: <Empty description={t('student.noLiveSessions')} /> }}
      />

      {/* Rendered through a portal straight into <body>: the page wrapper this
          would otherwise sit inside applies a route-transition `transform`
          (see .page-enter in index.css), and any transformed ancestor becomes
          the containing block for `position: fixed` descendants — which
          shrank this "full-screen" overlay down to the content area instead
          of covering the viewport. */}
      {room && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: '#0a0e14',
          display: 'flex', flexDirection: 'column',
        }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px', background: 'rgba(10,14,20,0.9)', backdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#fff',
          }}
          >
            <Space size={10}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: '#f04438', flexShrink: 0,
                boxShadow: '0 0 0 3px rgba(240,68,56,0.25)',
              }}
              />
              <Typography.Text
                style={{ color: '#fff', fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}
                strong
              >
                {room.title}
              </Typography.Text>
            </Space>
            <Button
              size="small" icon={<CloseOutlined />} onClick={() => setRoom(null)}
              style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.16)', color: '#fff' }}
            >
              {t('liveSession.leave')}
            </Button>
          </div>
          {/* minHeight: 0 — see the matching comment in AgoraVideoRoom.jsx:
              without it a flex item defaults to min-height: auto and won't
              shrink below the video grid's natural content height. */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <AgoraVideoRoom
              sessionId={room.id}
              displayName={user?.fullName || user?.username}
              teacherUid={room.teacher_id}
              onLeave={() => setRoom(null)}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
