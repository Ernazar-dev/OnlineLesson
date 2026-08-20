import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Table, Button, Typography, Space, Modal, Form, Input, Select, DatePicker,
  Tag, message, Popconfirm, Empty,
} from 'antd';
import {
  PlusOutlined, VideoCameraOutlined, PlayCircleOutlined, StopOutlined,
  DeleteOutlined, CloseOutlined,
} from '../../icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { liveSessionsApi, teacherApi, subjectsApi } from '../../api';
import { apiError, formatDateTime } from '../../utils/format';
import { useAuth } from '../../store/auth';
import Loading from '../../components/Loading';
import AgoraVideoRoom from '../../components/AgoraVideoRoom';
import DashboardHero from '../../components/DashboardHero';

const STATUS_COLOR = { scheduled: 'blue', live: 'green', ended: 'default', cancelled: 'red' };

export default function TeacherLiveSessions() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [groups, setGroups] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  // The session currently on screen while a call is open, so AgoraVideoRoom
  // only mounts (and only requests a join token) for the session actually
  // being started/joined.
  const [room, setRoom] = useState(null);

  const load = () => liveSessionsApi.list().then(setSessions).catch(() => setSessions([]));
  useEffect(() => {
    load();
    teacherApi.groups().then(setGroups).catch(() => {});
    subjectsApi.list().then(setSubjects).catch(() => {});
  }, []);

  const openCreate = () => { form.resetFields(); setCreateOpen(true); };

  const submitCreate = async (values) => {
    // Modal's OK button fires onOk (form.submit()) on every click; without
    // this guard a slow request + a couple of impatient re-clicks while it
    // looks frozen create 3-4 duplicate sessions from one submission.
    if (creating) return;
    setCreating(true);
    try {
      await liveSessionsApi.create({
        title: values.title,
        group_id: values.group_id || null,
        subject_id: values.subject_id || null,
        scheduled_at: values.scheduled_at.toISOString(),
      });
      message.success(t('common.created'));
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (e) {
      message.error(apiError(e, t('liveSession.createError')));
    } finally {
      setCreating(false);
    }
  };

  const start = async (session) => {
    try {
      const updated = await liveSessionsApi.start(session.id);
      setRoom(updated);
      load();
    } catch (e) {
      message.error(apiError(e, t('common.error')));
    }
  };

  // Rejoining a session that is already live must not re-run /start (which
  // would otherwise notify the audience a second time) — fetch the join info
  // through GET instead.
  const rejoin = async (session) => {
    try {
      const detail = await liveSessionsApi.get(session.id);
      setRoom(detail);
    } catch (e) {
      message.error(apiError(e, t('common.error')));
    }
  };

  const end = async (session) => {
    try {
      await liveSessionsApi.end(session.id);
      if (room?.id === session.id) setRoom(null);
      message.success(t('liveSession.end'));
      load();
    } catch (e) {
      message.error(apiError(e, t('common.error')));
    }
  };

  const cancel = async (session) => {
    try {
      await liveSessionsApi.cancel(session.id);
      message.success(t('common.deleted'));
      load();
    } catch (e) {
      message.error(apiError(e, t('common.error')));
    }
  };

  const columns = [
    { title: t('liveSession.titleField'), dataIndex: 'title' },
    {
      title: t('common.subject'),
      render: (_, r) => r.group_name || r.subject_name || t('liveSession.allStudents'),
    },
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
      title: '', width: 260, render: (_, r) => (
        <Space wrap>
          {r.status === 'scheduled' && (
            <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => start(r)}>
              {t('liveSession.start')}
            </Button>
          )}
          {r.status === 'live' && (
            <>
              <Button size="small" type="primary" icon={<VideoCameraOutlined />} onClick={() => rejoin(r)}>
                {t('liveSession.join')}
              </Button>
              <Popconfirm title={t('liveSession.confirmEnd')} onConfirm={() => end(r)}>
                <Button size="small" icon={<StopOutlined />}>{t('liveSession.end')}</Button>
              </Popconfirm>
            </>
          )}
          {(r.status === 'scheduled' || r.status === 'live') && (
            <Popconfirm title={t('liveSession.confirmCancel')} onConfirm={() => cancel(r)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  if (!sessions) return <Loading />;

  return (
    <div>
      <DashboardHero
        title={<><VideoCameraOutlined /> {t('teacher.liveSessionsTitle')}</>}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('teacher.newLiveSession')}</Button>}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={sessions}
        scroll={{ x: 760 }}
        locale={{ emptyText: <Empty description={t('teacher.noLiveSessions')} /> }}
      />

      <Modal
        title={t('teacher.newLiveSession')}
        open={createOpen}
        centered
        width={480}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
        confirmLoading={creating}
        cancelButtonProps={{ disabled: creating }}
        closable={!creating}
        maskClosable={!creating}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={submitCreate}>
          <Form.Item name="title" label={t('liveSession.titleField')} rules={[{ required: true }]}>
            <Input placeholder={t('liveSession.titlePlaceholder')} />
          </Form.Item>
          <Form.Item name="group_id" label={t('liveSession.groupOptional')}>
            <Select allowClear options={groups.map((g) => ({ value: g.id, label: g.name }))} />
          </Form.Item>
          <Form.Item name="subject_id" label={t('liveSession.subjectOptional')}>
            <Select allowClear options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="scheduled_at" label={t('liveSession.scheduledAt')} rules={[{ required: true }]}>
            <DatePicker
              showTime
              style={{ width: '100%' }}
              format="DD.MM.YYYY HH:mm"
              placeholder={t('liveSession.pickDateTime')}
              disabledDate={(d) => d && d < dayjs().startOf('day')}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Full-screen takeover for the call itself — a video lesson needs the
          whole viewport, not a dialog-sized box. Rendered through a portal
          straight into <body>: the page wrapper this would otherwise sit
          inside applies a route-transition `transform` (see .page-enter in
          index.css), and any transformed ancestor becomes the containing
          block for `position: fixed` descendants — which shrank this overlay
          down to the content area instead of covering the viewport. */}
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
            <Space>
              <Popconfirm title={t('liveSession.confirmEnd')} onConfirm={() => end(room)}>
                <Button size="small" danger icon={<StopOutlined />}>{t('liveSession.end')}</Button>
              </Popconfirm>
              <Button
                size="small" icon={<CloseOutlined />} onClick={() => setRoom(null)}
                style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.16)', color: '#fff' }}
              >
                {t('liveSession.leave')}
              </Button>
            </Space>
          </div>
          {/* minHeight: 0 — see the matching comment in AgoraVideoRoom.jsx:
              without it a flex item defaults to min-height: auto and won't
              shrink below the video grid's natural content height. */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <AgoraVideoRoom
              sessionId={room.id}
              displayName={user?.fullName || user?.username}
              isTeacher
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
