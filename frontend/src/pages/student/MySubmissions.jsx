import { useEffect, useState } from 'react';
import { Table, Tag, Button, Typography, Space } from 'antd';
import { EyeOutlined, ReloadOutlined } from '../../icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { assignmentsApi } from '../../api';
import { formatDateTime } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';

export default function MySubmissions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    assignmentsApi.mySubmissions().then(setData).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const columns = [
    { title: t('student.assignment'), dataIndex: 'assignment_title' },
    {
      // Every try is listed, so each row has to say which try it was and which
      // one is the attempt that actually counts.
      title: t('student.attempt'), dataIndex: 'attempt', width: 150,
      render: (v, r) => (
        <Space size={4} wrap>
          <Tag>{t('student.attemptN', { n: v || 1, max: r.max_attempts || 1 })}</Tag>
          {r.is_best && <Tag color="green">{t('student.counts')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('common.score'), dataIndex: 'overall_score', width: 140,
      render: (v, r) => (r.is_graded ? <Tag color={v >= 70 ? 'green' : v >= 50 ? 'orange' : 'red'}>{Math.round(v)}/100</Tag> : <Tag color="processing">{t('common.analyzing')}</Tag>),
    },
    { title: t('common.date'), dataIndex: 'submitted_at', width: 180, render: (v) => formatDateTime(v, '-') },
    { title: '', width: 120, render: (_, r) => <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/student/submissions/${r.id}`)}>{t('common.open')}</Button> },
  ];

  return (
    <div>
      <DashboardHero
        title={t('student.mySubmissionsTitle')}
        extra={<Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh')}</Button>}
      />
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 760 }} />
    </div>
  );
}
