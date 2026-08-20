import { useEffect, useMemo, useState } from 'react';
import {
  Table, Typography, Button, Space, Drawer, Row, Col, Statistic, Tag, Progress,
} from 'antd';
import { ReloadOutlined, EyeOutlined, TeamOutlined } from '../../icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { teacherApi } from '../../api';
import DashboardHero from '../../components/DashboardHero';
import UserAvatar from '../../components/UserAvatar';
import useIsMobile from '../../hooks/useIsMobile';

export default function TeacherStudents() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const isMobile = useIsMobile();

  const load = () => {
    setLoading(true);
    teacherApi.students().then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openDetail = (id) => {
    setDetailLoading(true);
    setDetail({});
    teacherApi.student(id).then(setDetail).finally(() => setDetailLoading(false));
  };

  // Split the roster into one bucket per group so a teacher with several groups
  // sees each group's students on their own, rather than mixed into one list.
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = r.group_id ?? 'none';
      if (!map.has(key)) map.set(key, { id: key, name: r.group_name, students: [] });
      map.get(key).students.push(r);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.id === 'none') return 1; // ungrouped students last
      if (b.id === 'none') return -1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [rows]);
  const grouped = groups.length > 1;

  // The group is shown as a section header when grouped, so the per-row group
  // subtitle would just repeat it — only show it in the single flat list.
  const columns = [
    { title: t('common.student'), dataIndex: 'username', render: (v, r) => (
      <Space>
        <UserAvatar name={r.full_name || v} src={r.avatar_url} size={32} />
        <div>
          <div style={{ fontWeight: 600 }}>{r.full_name || v}</div>
          {!grouped && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.group_name || '—'}</Typography.Text>}
        </div>
      </Space>
    ) },
    { title: t('teacher.submittedTasks'), dataIndex: 'submitted_count', width: 150, render: (v) => <Tag>{v}</Tag> },
    { title: t('teacher.avgScore'), dataIndex: 'average_score', width: 180,
      render: (v) => <Progress percent={Math.round(v)} size="small" /> },
    { title: t('teacher.totalPoints'), dataIndex: 'total_points', width: 140, render: (v) => <b>{v}</b> },
    { title: t('student.action'), width: 120, render: (_, r) => (
      <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>
        {t('common.open')}
      </Button>
    ) },
  ];

  // Mobile card for one student row — icon badge + name, a compact score bar
  // instead of the table's four separate columns, tapping the card opens the
  // same detail drawer the desktop "Open" button does.
  const studentCard = (r) => (
    <div
      key={r.id}
      className="list-card premium-enter"
      data-clickable
      style={{ cursor: 'pointer' }}
      onClick={() => openDetail(r.id)}
    >
      <div className="list-card-head">
        <UserAvatar name={r.full_name || r.username} src={r.avatar_url} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="list-card-title">{r.full_name || r.username}</div>
          {!grouped && <div className="list-card-meta">{r.group_name || '—'}</div>}
        </div>
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openDetail(r.id); }}><EyeOutlined /></button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <Progress percent={Math.round(r.average_score)} size="small" />
        </div>
        <Tag>{r.submitted_count}</Tag>
        <b style={{ fontSize: 13 }}>{r.total_points}</b>
      </div>
    </div>
  );

  return (
    <div>
      <DashboardHero
        title={t('teacher.studentScores')}
        extra={<Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh')}</Button>}
      />

      {grouped ? (
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          {groups.map((g) => (
            <div key={g.id}>
              <Typography.Title level={5} style={{ margin: '0 0 10px' }}>
                <Space>
                  <TeamOutlined />
                  {g.name || t('common.noGroup')}
                  <Tag>{g.students.length}</Tag>
                </Space>
              </Typography.Title>
              {isMobile ? (
                <div>{g.students.map(studentCard)}</div>
              ) : (
                <Table rowKey="id" columns={columns} dataSource={g.students} loading={loading} pagination={false} scroll={{ x: 800 }} />
              )}
            </div>
          ))}
        </Space>
      ) : isMobile ? (
        <div>{rows.map(studentCard)}</div>
      ) : (
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 800 }} />
      )}

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        width={640}
        title={
          detail?.full_name || detail?.username ? (
            <Space>
              <UserAvatar name={detail.full_name || detail.username} src={detail.avatar_url} size={28} />
              {detail.full_name || detail.username}
            </Space>
          ) : t('teacher.resultsActivity')
        }
        loading={detailLoading}
      >
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col span={8}><Statistic title={t('teacher.completed')} value={detail?.completed || 0} /></Col>
          <Col span={8}><Statistic title={t('teacher.avgScore')} value={detail?.average_score || 0} suffix="%" /></Col>
          <Col span={8}><Statistic title={t('teacher.totalPoints')} value={detail?.total_points || 0} /></Col>
        </Row>

        <Typography.Title level={5}>{t('teacher.completedTasks')}</Typography.Title>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={detail?.submissions || []}
          columns={[
            { title: t('nav.assignments'), dataIndex: 'assignment_title' },
            { title: t('common.date'), dataIndex: 'submitted_at', width: 120,
              render: (v) => new Date(v).toLocaleDateString() },
            { title: t('common.score'), dataIndex: 'overall_score', width: 90,
              render: (v) => (v === null ? <Tag>…</Tag> : <Tag color={v >= 50 ? 'green' : 'orange'}>{Math.round(v)}</Tag>) },
            { title: t('student.action'), width: 90, render: (_, r) => (
              <Button type="link" size="small" onClick={() => navigate(`/teacher/submissions/${r.id}`)}>
                {t('common.open')}
              </Button>
            ) },
          ]}
        />
      </Drawer>
    </div>
  );
}
