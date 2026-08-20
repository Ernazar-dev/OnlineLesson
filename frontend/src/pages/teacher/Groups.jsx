import { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Typography, Tag, Empty, Drawer, Table, Space, Progress } from 'antd';
import { TeamOutlined, TrophyOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { teacherApi } from '../../api';
import Loading from '../../components/Loading';
import DashboardHero from '../../components/DashboardHero';
import UserAvatar from '../../components/UserAvatar';

export default function TeacherGroups() {
  const { t } = useTranslation();
  const [groups, setGroups] = useState(null);
  // The group whose card was clicked, and its roster. They are kept apart so the
  // drawer can open at once and show its spinner while the request is in flight.
  const [selected, setSelected] = useState(null);
  const [roster, setRoster] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  // Every student across all of this teacher's groups, ranked by score — a
  // separate section from the per-group roster above, not nested in the drawer.
  const [ranking, setRanking] = useState(null);

  useEffect(() => {
    teacherApi.groups().then((g) => setGroups(g)).catch(() => setGroups([]));
    teacherApi.students().then(setRanking).catch(() => setRanking([]));
  }, []);

  const openGroup = (g) => {
    setSelected(g);
    setRoster(null);
    setRosterLoading(true);
    teacherApi
      .groupStudents(g.id)
      .then(setRoster)
      // A failed load leaves an empty roster rather than a stuck spinner.
      .catch(() => setRoster({ students: [] }))
      .finally(() => setRosterLoading(false));
  };

  const columns = [
    {
      title: t('common.student'),
      dataIndex: 'username',
      render: (v, r) => (
        <Space>
          <UserAvatar name={r.full_name || v} src={r.avatar_url} size={32} />
          <div>
            <div style={{ fontWeight: 600 }}>{r.full_name || v}</div>
            {r.full_name && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v}</Typography.Text>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: t('teacher.submittedTasks'),
      dataIndex: 'submission_count',
      width: 150,
      render: (v) => <Tag>{v ?? 0}</Tag>,
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      width: 130,
      render: (v) => (
        <Tag color={v ? 'green' : 'default'}>{v ? t('teacher.active') : t('teacher.inactive')}</Tag>
      ),
    },
  ];

  // One ranking table per group instead of every group's students blended
  // into a single list — a teacher managing several groups wants to see how
  // each one stacks up on its own, not one merged leaderboard. `ranking`
  // already carries each student's group_name, so this is just a client-side
  // bucket + re-sort, no extra request.
  const ratingByGroup = useMemo(() => {
    // `groups` and `ranking` load independently (see the effect above) and
    // can resolve in either order — this must not run the sort below against
    // a `groups` that hasn't arrived yet.
    if (!ranking || !groups) return [];
    const byName = new Map();
    for (const r of ranking) {
      const name = r.group_name || '';
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(r);
    }
    return [...byName.entries()]
      .map(([name, students]) => ({
        name,
        students: [...students].sort((a, b) => b.total_points - a.total_points),
      }))
      // Groups the teacher actually curates (from `groups`) come first, in
      // that same order; an ungrouped bucket (if any) sits last.
      .sort((a, b) => {
        const ia = groups.findIndex((g) => g.name === a.name);
        const ib = groups.findIndex((g) => g.name === b.name);
        if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
  }, [ranking, groups]);

  const rankingColumns = [
    { title: '#', width: 50, render: (_, __, idx) => idx + 1 },
    {
      title: t('common.student'),
      key: 'name',
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <UserAvatar name={r.full_name || r.username} src={r.avatar_url} size={28} />
          <span style={{ fontWeight: 500 }}>{r.full_name || r.username}</span>
        </div>
      ),
    },
    {
      title: t('teacher.avgScore'),
      dataIndex: 'average_score',
      width: 200,
      render: (v) => <Progress percent={Math.round(v)} size="small" />,
    },
    { title: t('teacher.totalPoints'), dataIndex: 'total_points', width: 110, align: 'right', render: (v) => <b>{v}</b> },
  ];

  if (!groups) return <Loading />;

  return (
    <div>
      <DashboardHero title={t('teacher.myGroups')} />
      {groups.length === 0 ? <Empty description={t('teacher.noGroupsAssigned')} /> : (
        <Row gutter={[16, 16]}>
          {groups.map((g) => (
            <Col xs={24} sm={12} lg={8} key={g.id}>
              {/* The whole card is the target: tapping a group opens its roster. */}
              <Card hoverable className="card-hover" onClick={() => openGroup(g)} style={{ cursor: 'pointer', borderRadius: 16 }} bordered={false}>
                <Card.Meta
                  avatar={<TeamOutlined style={{ fontSize: 28, color: 'var(--brand)' }} />}
                  title={g.name}
                  description={(
                    <Space direction="vertical" size={4}>
                      <Tag>{t('teacher.studentCount', { count: g.student_count })}</Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {t('teacher.viewStudents')}
                      </Typography.Text>
                    </Space>
                  )}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {ranking === null ? (
        <Card loading size="small" bordered={false} className="shadow-sm" style={{ marginTop: 16, borderRadius: 16 }} />
      ) : ratingByGroup.length === 0 ? (
        <Card
          title={<span><TrophyOutlined style={{ color: '#f0a10e', marginRight: 8 }} />{t('teacher.groupRanking')}</span>}
          size="small"
          bordered={false}
          className="shadow-sm"
          style={{ marginTop: 16, borderRadius: 16 }}
        >
          <Empty description={t('teacher.groupRankingEmpty')} />
        </Card>
      ) : (
        ratingByGroup.map((g) => (
          <Card
            key={g.name || '__none__'}
            title={(
              <span>
                <TrophyOutlined style={{ color: '#f0a10e', marginRight: 8 }} />
                {g.name ? t('teacher.groupRatingFor', { group: g.name }) : t('teacher.noGroupSection')}
              </span>
            )}
            size="small"
            bordered={false}
            className="shadow-sm"
            style={{ marginTop: 16, borderRadius: 16 }}
          >
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={g.students}
              locale={{ emptyText: t('teacher.groupRatingEmpty') }}
              columns={rankingColumns}
            />
          </Card>
        ))
      )}

      <Drawer
        open={!!selected}
        onClose={() => { setSelected(null); setRoster(null); }}
        width={640}
        title={t('admin.studentsOf', { group: selected?.name || '' })}
      >
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={roster?.students || []}
          loading={rosterLoading}
          pagination={false}
          scroll={{ x: 520 }}
          locale={{ emptyText: <Empty description={t('teacher.noStudentsInGroup')} /> }}
        />
      </Drawer>
    </div>
  );
}
