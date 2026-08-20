import { useEffect, useMemo, useState } from 'react';
import { Table, Typography, Button, Space, Tag, Select, Modal, message, Empty, Tooltip } from 'antd';
import { ReloadOutlined, TeamOutlined, PlusOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api';
import { apiError } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';
import UserAvatar from '../../components/UserAvatar';
import useIsMobile from '../../hooks/useIsMobile';

const { Text } = Typography;

/**
 * A teacher's groups used to be a drill-down (click "Guruhlar" → separate
 * view). That was a page-within-a-page for information that's really just
 * one more fact about the teacher, so it's shown inline instead: tags in
 * the same row, with a small select right there to attach another free
 * group. Browsing a group's own students lives on the Groups page now.
 */
export default function AdminTeachers() {
  const { t } = useTranslation();
  const [teachers, setTeachers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  const load = () => {
    setLoading(true);
    Promise.all([adminApi.teachers(), adminApi.groups()])
      .then(([tch, grp]) => { setTeachers(tch); setGroups(grp); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Groups not yet attached to any teacher — the only ones offered, since a
  // group belongs to a single teacher (one subject, one teacher).
  const freeGroups = groups.filter((g) => !g.teacher_id);
  const groupsByTeacher = useMemo(() => {
    const map = {};
    for (const g of groups) {
      if (g.teacher_id) (map[g.teacher_id] ||= []).push(g);
    }
    return map;
  }, [groups]);

  const assignGroup = async (teacherId, groupId) => {
    if (!groupId) return;
    try {
      await adminApi.updateGroup(groupId, { teacher_id: teacherId });
      message.success(t('admin.groupAssigned'));
      load();
    } catch (e) {
      message.error(apiError(e, t('common.error')));
    }
  };

  const unassignGroup = (group) => {
    Modal.confirm({
      title: t('admin.unassignGroupConfirm'),
      onOk: async () => {
        try {
          await adminApi.updateGroup(group.id, { teacher_id: null });
          message.success(t('admin.groupUnassigned'));
          load();
        } catch (e) {
          message.error(apiError(e, t('common.error')));
        }
      },
    });
  };

  const GroupsCell = ({ teacherId }) => (
    <Space wrap size={[6, 6]}>
      {(groupsByTeacher[teacherId] || []).map((g) => (
        <Tag key={g.id} color="blue" icon={<TeamOutlined />} closable onClose={(e) => { e.preventDefault(); unassignGroup(g); }}>
          {g.name} <Text type="secondary" style={{ fontSize: 11 }}>· {g.student_count}</Text>
        </Tag>
      ))}
      <Tooltip title={freeGroups.length ? null : t('admin.noFreeGroups')}>
        <Select
          size="small"
          variant="borderless"
          className="teacher-assign-group"
          style={{ width: 130 }}
          placeholder={<Space size={4}><PlusOutlined />{t('admin.assignGroup')}</Space>}
          value={null}
          disabled={!freeGroups.length}
          onChange={(gid) => assignGroup(teacherId, gid)}
          options={freeGroups.map((g) => ({ value: g.id, label: g.name }))}
        />
      </Tooltip>
    </Space>
  );

  return (
    <div>
      <DashboardHero
        title={t('admin.teachersAndGroups')}
        extra={<Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh')}</Button>}
      />

      {isMobile ? (
        teachers.length ? (
          <div>
            {teachers.map((r) => (
              <div key={r.id} className="list-card premium-enter">
                <div className="list-card-head">
                  <UserAvatar name={r.full_name || r.username} src={r.avatar_url} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-card-title">{r.full_name || r.username}</div>
                    <div className="list-card-meta">{r.username}</div>
                  </div>
                  <Tag color={r.is_active ? 'green' : 'red'}>{r.is_active ? t('admin.online') : t('admin.offline')}</Tag>
                </div>
                <div style={{ marginTop: 10 }}>
                  <GroupsCell teacherId={r.id} />
                </div>
              </div>
            ))}
          </div>
        ) : <Empty description={t('common.empty')} style={{ padding: '40px 0' }} />
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={teachers}
          scroll={{ x: 700 }}
          columns={[
            { title: t('common.teacher'), width: 240, render: (_, r) => (
              <Space>
                <UserAvatar name={r.full_name || r.username} src={r.avatar_url} size={32} />
                <div>
                  <div style={{ fontWeight: 600 }}>{r.full_name || r.username}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{r.username}</Text>
                </div>
              </Space>
            ) },
            { title: t('common.status'), dataIndex: 'is_active', width: 110,
              render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? t('admin.online') : t('admin.offline')}</Tag> },
            { title: t('nav.groups'), render: (_, r) => <GroupsCell teacherId={r.id} /> },
          ]}
        />
      )}
    </div>
  );
}
