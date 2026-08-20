import { useEffect, useState } from 'react';
import { Table, Typography, Tag, Button, Space } from 'antd';
import { ReloadOutlined, SolutionOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api';
import { formatDateTime } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';

// One tag colour per teacher action, so the feed reads at a glance without
// having to parse every "details" cell.
const ACTION_COLORS = {
  CREATE_ASSIGNMENT: 'blue',
  UPDATE_ASSIGNMENT: 'geekblue',
  LIVE_SESSION_START: 'green',
  LIVE_SESSION_END: 'default',
};

export default function AdminNotifications() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    adminApi.notifications().then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const columns = [
    { title: t('common.time'), dataIndex: 'created_at', width: 170, render: (v) => formatDateTime(v) },
    { title: t('common.teacher'), dataIndex: 'teacher_name', width: 200 },
    {
      title: t('admin.action'), dataIndex: 'action', width: 190,
      render: (v) => <Tag color={ACTION_COLORS[v] || 'blue'}>{v}</Tag>,
    },
    { title: t('admin.details'), dataIndex: 'details' },
  ];

  return (
    <div>
      <DashboardHero
        title={<><SolutionOutlined /> {t('admin.notificationsTitle')}</>}
        extra={<Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh')}</Button>}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: -12, marginBottom: 16 }}>
        {t('admin.notificationsHint')}
      </Typography.Paragraph>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 800 }}
        locale={{ emptyText: t('admin.noNotifications') }}
      />
    </div>
  );
}
