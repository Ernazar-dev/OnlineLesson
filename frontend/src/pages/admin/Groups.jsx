import { useEffect, useState } from 'react';
import { Table, Button, Typography, Space, Modal, Drawer, Form, Input, Select, message, Popconfirm, List, Tag, Row, Col, Statistic, Empty } from 'antd';
import { PlusOutlined, DeleteOutlined, TeamOutlined, EyeOutlined, EditOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api';
import { apiError } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';
import UserAvatar from '../../components/UserAvatar';
import useIsMobile from '../../hooks/useIsMobile';

export default function AdminGroups() {
  const { t } = useTranslation();
  const [data, setData] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  // Group membership itself is set from a student's own record on the Users
  // page (that's the only place a student's group_id is edited) — this modal
  // is read-only: pick a group to see who's in it, pick a student to see
  // their profile and stats.
  const [manageGroup, setManageGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const isMobile = useIsMobile();

  const load = () => { setLoading(true); adminApi.groups().then(setData).finally(() => setLoading(false)); };
  useEffect(() => { load(); adminApi.teachers().then(setTeachers).catch(() => {}); }, []);

  const openCreate = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit = (g) => { setEditing(g); form.setFieldsValue({ name: g.name, teacher_id: g.teacher_id ?? undefined }); setOpen(true); };

  const submit = async (values) => {
    try {
      if (editing) { await adminApi.updateGroup(editing.id, values); message.success(t('common.updated')); }
      else { await adminApi.createGroup(values); message.success(t('common.created')); }
      setOpen(false); setEditing(null); form.resetFields(); load();
    } catch (e) { message.error(apiError(e, t('common.error'))); }
  };
  const remove = async (id) => {
    try { await adminApi.deleteGroup(id); message.success(t('common.deleted')); }
    catch (e) { message.error(apiError(e, t('common.error'))); }
    load();
  };

  const openManage = async (g) => {
    setManageGroup(g);
    setMembers(await adminApi.groupStudents(g.id));
  };
  const openStudent = (id) => {
    setDetailLoading(true);
    setDetail({});
    adminApi.studentDetail(id).then(setDetail).finally(() => setDetailLoading(false));
  };

  const columns = [
    { title: t('common.group'), dataIndex: 'name' },
    { title: t('common.teacher'), dataIndex: 'teacher_name', render: (v) => v || '-' },
    { title: t('admin.studentsCount'), dataIndex: 'student_count', render: (v) => <Tag>{v}</Tag> },
    {
      title: '', width: 240, render: (_, r) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openManage(r)}>{t('admin.manageStudents')}</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title={t('common.deleteConfirm')} onConfirm={() => remove(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <DashboardHero
        title={<><TeamOutlined /> {t('admin.groupsTitle')}</>}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('common.create')}</Button>}
      />
      {isMobile ? (
        data.length ? (
          <div>
            {data.map((g) => (
              <div key={g.id} className="list-card premium-enter">
                <div className="list-card-head">
                  <div className="dash-row-icon" style={{ color: '#2f54eb', background: 'rgba(47,84,235,0.12)' }}>
                    <TeamOutlined />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-card-title">{g.name}</div>
                    <div className="list-card-meta">{g.teacher_name || '-'}</div>
                  </div>
                  <Tag>{g.student_count}</Tag>
                </div>
                <div className="list-card-actions" style={{ marginTop: 10 }}>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openManage(g)} style={{ flex: 1 }}>{t('admin.manageStudents')}</Button>
                  <button className="icon-btn" onClick={() => openEdit(g)}><EditOutlined /></button>
                  <Popconfirm title={t('common.deleteConfirm')} onConfirm={() => remove(g.id)}>
                    <button className="icon-btn icon-btn--danger"><DeleteOutlined /></button>
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty description={t('common.empty')} style={{ padding: '40px 0' }} />
      ) : (
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 600 }} />
      )}

      <Modal
        title={editing ? t('common.edit') : t('admin.newGroup')}
        open={open}
        centered
        width={480}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        onCancel={() => { setOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}><Input placeholder="CS-101" /></Form.Item>
          <Form.Item name="teacher_id" label={t('common.teacher')}><Select allowClear options={teachers.map((tr) => ({ value: tr.id, label: tr.username }))} /></Form.Item>
        </Form>
      </Modal>

      {/* This group's roster, read-only — a student's group is set from
          their own record on the Users page. Tapping a student opens their
          profile and stats below instead. */}
      <Modal
        title={t('admin.studentsOf', { group: manageGroup?.name || '' })}
        open={!!manageGroup}
        centered
        onCancel={() => setManageGroup(null)}
        footer={null}
        width={480}
      >
        <List
          size="small"
          dataSource={members}
          locale={{ emptyText: t('common.empty') }}
          renderItem={(m) => (
            <List.Item
              data-clickable
              style={{ cursor: 'pointer' }}
              onClick={() => openStudent(m.id)}
              actions={[<Button key="v" size="small" icon={<EyeOutlined />} onClick={() => openStudent(m.id)}>{t('common.open')}</Button>]}
            >
              <Space><UserAvatar name={m.full_name || m.username} src={m.avatar_url} size={30} />{m.full_name || m.username}</Space>
            </List.Item>
          )}
        />
      </Modal>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        width={560}
        title={
          detail?.full_name || detail?.username ? (
            <Space>
              <UserAvatar name={detail.full_name || detail.username} src={detail.avatar_url} size={28} />
              {detail.full_name || detail.username}
            </Space>
          ) : t('admin.studentProfile')
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
          ]}
        />
      </Drawer>
    </div>
  );
}
