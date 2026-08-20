import { useEffect, useState } from 'react';
import { Card, Typography, List, Table, Tag, Empty, Row, Col, Statistic, Progress } from 'antd';
import { TrophyOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { usersApi } from '../../api';
import { useAuth } from '../../store/auth';
import { formatWindow } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';
import UserAvatar from '../../components/UserAvatar';

const { Title, Text } = Typography;

export default function MyGroups() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersApi.myGroup().then(setGroup).finally(() => setLoading(false));
  }, []);

  if (!loading && !group) {
    return <Card><Empty description={t('common.noGroup')} /></Card>;
  }

  return (
    <div>
      <DashboardHero title={t('student.myGroupsTitle')} />

      <Card loading={loading} bordered={false} className="shadow-sm" style={{ marginBottom: 16, borderRadius: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <UserAvatar name={group?.curator || '?'} src={group?.curator_avatar} size={54} style={{ fontSize: 20 }} />
              <div>
                <Title level={4} style={{ margin: 0 }}>{group?.name}</Title>
                <Text type="secondary">{t('student.curator')}: {group?.curator || '—'}</Text>
              </div>
            </div>
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title={t('common.student')} value={group?.student_count || 0} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title={t('nav.assignments')} value={group?.assignments?.length || 0} />
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title={t('common.student')} loading={loading} size="small">
            <List
              dataSource={group?.students || []}
              renderItem={(s) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<UserAvatar name={s.full_name || s.username} src={s.avatar_url} />}
                    title={s.full_name || s.username}
                    description={<Text type="secondary" style={{ fontSize: 12 }}>{s.username}</Text>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card title={t('nav.assignments')} loading={loading} size="small">
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={group?.assignments || []}
              locale={{ emptyText: t('student.noGroupAssignments') }}
              columns={[
                { title: t('common.title'), dataIndex: 'title' },
                {
                  title: t('student.deadline'),
                  dataIndex: 'deadline',
                  width: 210,
                  render: (_, r) => (
                    <span>
                      {formatWindow(r.start_at, r.deadline)}{' '}
                      {r.is_expired && <Tag color="red">{t('student.expired')}</Tag>}
                      {r.is_upcoming && <Tag>{t('student.notStarted')}</Tag>}
                    </span>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={<span><TrophyOutlined style={{ color: '#f0a10e', marginRight: 8 }} />{t('student.groupRanking')}</span>}
        loading={loading}
        size="small"
        style={{ marginTop: 16 }}
      >
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={group?.ranking || []}
          locale={{ emptyText: t('student.groupRankingEmpty') }}
          onRow={(r) => (r.id === user?.id ? { style: { background: 'rgba(var(--brand-rgb), 0.06)' } } : {})}
          columns={[
            {
              title: '#',
              width: 50,
              render: (_, __, idx) => idx + 1,
            },
            {
              title: t('common.student'),
              key: 'name',
              render: (r) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <UserAvatar name={r.full_name || r.username} src={r.avatar_url} size={28} />
                  <span style={{ fontWeight: r.id === user?.id ? 700 : 500 }}>
                    {r.full_name || r.username}
                    {r.id === user?.id && <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>({t('admin.you')})</Text>}
                  </span>
                </div>
              ),
            },
            {
              title: t('student.avgScore'),
              dataIndex: 'average_score',
              width: 200,
              render: (v) => <Progress percent={Math.round(v)} size="small" />,
            },
            {
              title: t('admin.workCount'),
              dataIndex: 'submission_count',
              width: 90,
              align: 'right',
            },
          ]}
        />
      </Card>
    </div>
  );
}
