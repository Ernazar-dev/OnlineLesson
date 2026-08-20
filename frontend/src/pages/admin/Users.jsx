import { useEffect, useMemo, useState } from 'react';
import { Table, Button, Typography, Space, Modal, Form, Input, Select, Tag, message, Popconfirm, Switch, Empty } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '../../icons';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api';
import { apiError, formatUzPhone, UZ_PHONE_RE } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';
import UserAvatar from '../../components/UserAvatar';
import useIsMobile from '../../hooks/useIsMobile';

// Hex counterparts of the antd tag colors below, for the mobile card's icon
// badge (StatCard/dash-row already tint their badge off a hex + alpha, a tag
// color name won't do that).
const roleHex = { admin: '#f79009', teacher: '#2f54eb', student: '#1c9de9' };

export default function AdminUsers() {
  const { t } = useTranslation();
  const [data, setData] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState(null);
  const [form] = Form.useForm();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const load = () => { setLoading(true); adminApi.users().then(setData).finally(() => setLoading(false)); };
  useEffect(() => { load(); adminApi.groups().then(setGroups).catch(() => {}); }, []);

  // Keep the table in sync with the header search box (?q=...).
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearch(q);
  }, [searchParams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.username?.toLowerCase().includes(q) ||
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q) ||
        (u.group_name || '').toLowerCase().includes(q)
      );
    });
  }, [data, search, roleFilter]);

  const roleOptions = [
    { value: 'student', label: t('admin.roleStudent') },
    { value: 'teacher', label: t('admin.roleTeacher') },
    { value: 'admin', label: t('admin.roleAdmin') },
  ];

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ role: 'student', is_active: true }); setOpen(true); };
  const openEdit = (u) => { setEditing(u); form.setFieldsValue({ ...u, password: '' }); setOpen(true); };

  const save = async (values) => {
    // Only students carry a group; drop any stale value for other roles so a
    // student promoted to teacher isn't left pinned to a group.
    const payload = values.role === 'student' ? values : { ...values, group_id: null };
    try {
      if (editing) { await adminApi.updateUser(editing.id, payload); message.success(t('common.updated')); }
      else { await adminApi.createUser(payload); message.success(t('common.created')); }
      setOpen(false); load();
    } catch (e) { message.error(apiError(e, t('common.error'))); }
  };

  const toggle = async (u) => {
    // Blocking the bootstrap admin or yourself is refused by the API; without
    // this the switch flicked back with no explanation.
    try { await adminApi.toggleUser(u.id); }
    catch (e) { message.error(apiError(e, t('common.error'))); }
    load();
  };
  const remove = async (u) => {
    try { await adminApi.deleteUser(u.id); load(); }
    catch (e) { message.error(apiError(e, t('common.error'))); }
  };

  const roleColor = { admin: 'gold', teacher: 'geekblue', student: 'blue' };
  const columns = [
    { title: t('admin.loginField'), dataIndex: 'username' },
    {
      title: t('admin.nameField'),
      dataIndex: 'full_name',
      render: (v, r) => (
        <Space>
          <UserAvatar name={v || r.username} src={r.avatar_url} size={28} style={{ background: roleHex[r.role] }} />
          {v || '-'}
        </Space>
      ),
    },
    { title: t('admin.role'), dataIndex: 'role', render: (v) => <Tag color={roleColor[v]}>{v}</Tag> },
    {
      title: t('common.group'),
      dataIndex: 'group_name',
      render: (v, r) => {
        // A teacher isn't a member of one group; show every group they teach.
        if (r.role === 'teacher') {
          const gs = r.managed_groups || [];
          return gs.length ? <Space size={[4, 4]} wrap>{gs.map((g) => <Tag key={g} color="geekblue">{g}</Tag>)}</Space> : '-';
        }
        return v || '-';
      },
    },
    { title: t('common.status'), dataIndex: 'is_active', render: (v, r) => <Switch checked={v} onChange={() => toggle(r)} disabled={r.username === 'admin'} /> },
    { title: t('admin.online'), dataIndex: 'is_online', render: (v) => (v ? <Tag color="green">{t('admin.online')}</Tag> : <Tag>{t('admin.offline')}</Tag>) },
    {
      title: '', width: 120, render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title={t('common.deleteConfirm')} onConfirm={() => remove(r)} disabled={r.username === 'admin'}>
            <Button size="small" danger icon={<DeleteOutlined />} disabled={r.username === 'admin'} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <DashboardHero
        title={<>{t('admin.usersTitle')} <Typography.Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}>({filtered.length})</Typography.Text></>}
        extra={
          <Space wrap className="page-toolbar" style={{ marginBottom: 0 }}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder={t('admin.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 260 }}
            />
            <Select
              allowClear
              placeholder={t('admin.role')}
              value={roleFilter}
              onChange={setRoleFilter}
              style={{ width: 150 }}
              options={roleOptions}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('common.add')}</Button>
          </Space>
        }
      />
      {isMobile ? (
        filtered.length ? (
          <div>
            {filtered.map((u) => (
              <div key={u.id} className="list-card premium-enter">
                <div className="list-card-head">
                  <UserAvatar name={u.full_name || u.username} src={u.avatar_url} size={40} style={{ background: roleHex[u.role] }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-card-title">{u.full_name || u.username}</div>
                    <div className="list-card-meta">{u.full_name ? u.username : (u.phone || '-')}</div>
                  </div>
                  <div className="list-card-actions">
                    <button className="icon-btn" onClick={() => openEdit(u)}><EditOutlined /></button>
                    <Popconfirm title={t('common.deleteConfirm')} onConfirm={() => remove(u)} disabled={u.username === 'admin'}>
                      <button className="icon-btn icon-btn--danger" disabled={u.username === 'admin'}><DeleteOutlined /></button>
                    </Popconfirm>
                  </div>
                </div>
                <div className="list-card-tags">
                  <Tag color={roleColor[u.role]}>{u.role}</Tag>
                  {u.role === 'teacher'
                    ? (u.managed_groups || []).map((g) => <Tag key={g} color="geekblue">{g}</Tag>)
                    : (u.group_name ? <Tag>{u.group_name}</Tag> : null)}
                  <Tag color={u.is_online ? 'green' : 'default'}>{u.is_online ? t('admin.online') : t('admin.offline')}</Tag>
                  <Switch size="small" checked={u.is_active} onChange={() => toggle(u)} disabled={u.username === 'admin'} />
                </div>
              </div>
            ))}
          </div>
        ) : <Empty description={t('common.empty')} style={{ padding: '40px 0' }} />
      ) : (
        <Table rowKey="id" columns={columns} dataSource={filtered} loading={loading} scroll={{ x: 900 }} pagination={{ pageSize: 15, showSizeChanger: true }} />
      )}

      <Modal
        title={editing ? t('common.edit') : t('admin.newUser')}
        open={open}
        centered
        width={520}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="username" label={t('admin.loginField')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="full_name" label={t('auth.fullName')}><Input /></Form.Item>
          <Form.Item
            name="phone"
            label={t('admin.phoneField')}
            getValueFromEvent={(e) => formatUzPhone(e.target.value)}
            rules={[{ validator: (_, v) => (!v || UZ_PHONE_RE.test(v) ? Promise.resolve() : Promise.reject(new Error(t('admin.phoneInvalid')))) }]}
          >
            <Input inputMode="numeric" placeholder="+998 90 123-45-67" />
          </Form.Item>
          <Form.Item name="password" label={editing ? t('admin.newPasswordOptional') : t('auth.password')} rules={editing ? [] : [{ required: true }]}><Input.Password /></Form.Item>
          <Form.Item name="role" label={t('admin.role')} rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
          {/* Only a student belongs to a single group. A teacher's groups are
              managed on the "Teachers and their groups" page (one teacher can
              teach many groups), so we hide this field for non-students. */}
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.role !== cur.role}>
            {({ getFieldValue }) =>
              getFieldValue('role') === 'student' ? (
                <Form.Item name="group_id" label={t('common.group')}>
                  <Select allowClear options={groups.map((g) => ({ value: g.id, label: g.name }))} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
