import { useEffect, useMemo, useState } from 'react';
import { Table, Tag, Card, Segmented, Button, Input } from 'antd';
import { HistoryOutlined, ReloadOutlined, SearchOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api';
import { formatDateTime } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';

// Same role→colour convention as admin/Users.jsx, so a role reads the same
// tag colour everywhere in the admin panel.
const ROLE_COLOR = { admin: 'gold', teacher: 'geekblue', student: 'blue' };

// One colour per action family — logins/logouts are the bulk of the feed, so
// they get a neutral treatment; everything else gets a colour by what kind
// of thing happened (created, live session, review/grading).
const ACTION_COLOR = {
  LOGIN: 'default',
  LOGOUT: 'default',
  CREATE_ASSIGNMENT: 'blue',
  UPDATE_ASSIGNMENT: 'geekblue',
  CREATE_USER: 'purple',
  SUBMISSION: 'cyan',
  REVIEW: 'gold',
  LIVE_SESSION_START: 'green',
  LIVE_SESSION_JOIN: 'lime',
  LIVE_SESSION_END: 'default',
};

export default function AdminLogs() {
  const { t } = useTranslation();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    adminApi.logs().then(setData).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const roleOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('common.admin'), value: 'admin' },
    { label: t('common.teacher'), value: 'teacher' },
    { label: t('common.student'), value: 'student' },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((l) => {
      if (roleFilter !== 'all' && l.role !== roleFilter) return false;
      if (q && !`${l.username} ${l.action} ${l.details || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, roleFilter, search]);

  const columns = [
    { title: t('common.time'), dataIndex: 'created_at', width: 170, render: (v) => formatDateTime(v) },
    { title: t('common.user'), dataIndex: 'username', width: 170 },
    {
      title: t('admin.role'), dataIndex: 'role', width: 110,
      render: (v) => (v ? <Tag color={ROLE_COLOR[v]}>{t(`common.${v}`)}</Tag> : <Tag>—</Tag>),
    },
    {
      title: t('admin.action'), dataIndex: 'action', width: 180,
      render: (v) => <Tag color={ACTION_COLOR[v] || 'blue'}>{v}</Tag>,
    },
    { title: t('admin.details'), dataIndex: 'details' },
    { title: 'IP', dataIndex: 'ip_address', width: 120, render: (v) => v || '-' },
  ];

  return (
    <div>
      <DashboardHero
        title={<><HistoryOutlined /> {t('admin.logsTitle')}</>}
        extra={<Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh')}</Button>}
      />
      <Card bordered={false} className="shadow-sm" style={{ borderRadius: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 16 }}>
          <Segmented options={roleOptions} value={roleFilter} onChange={setRoleFilter} />
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 260 }}
          />
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          loading={loading}
          scroll={{ x: 900 }}
          size="small"
        />
      </Card>
    </div>
  );
}
