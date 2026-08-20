import { useEffect, useState } from 'react';
import { List, Card, Button, Typography, Space, Modal, Form, Input, Select, Switch, message, Popconfirm, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, NotificationOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api';
import { apiError } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';

export default function AdminNews() {
  const { t } = useTranslation();
  const [data, setData] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = () => adminApi.news().then(setData);
  useEffect(() => { load(); }, []);

  const TARGET_OPTIONS = [
    { value: 'all', label: t('admin.newsTargetAll') },
    { value: 'teacher', label: t('admin.newsTargetTeacher') },
    { value: 'student', label: t('admin.newsTargetStudent') },
  ];
  const TARGET_COLOR = { all: 'blue', teacher: 'gold', student: 'purple' };

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ is_published: true, target_role: 'all' }); setOpen(true); };
  const openEdit = (n) => { setEditing(n); form.setFieldsValue({ ...n, target_role: n.target_role || 'all' }); setOpen(true); };

  const save = async (values) => {
    try {
      if (editing) await adminApi.updateNews(editing.id, values);
      else await adminApi.createNews(values);
      message.success(t('common.saved')); setOpen(false); load();
    } catch { message.error(t('common.error')); }
  };
  const remove = async (id) => {
    try { await adminApi.deleteNews(id); message.success(t('common.deleted')); }
    catch (e) { message.error(apiError(e, t('common.error'))); }
    load();
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <DashboardHero
        title={<><NotificationOutlined /> {t('admin.newsTitle')}</>}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('common.add')}</Button>}
      />
      <List
        dataSource={data}
        renderItem={(n) => (
          <Card style={{ marginBottom: 12 }}
            actions={[<EditOutlined key="e" onClick={() => openEdit(n)} />, <Popconfirm key="d" title={t('common.deleteConfirm')} onConfirm={() => remove(n.id)}><DeleteOutlined /></Popconfirm>]}>
            <Card.Meta
              title={(
                <Space wrap>
                  {n.title}
                  {n.is_published ? <Tag color="green">{t('admin.published')}</Tag> : <Tag>{t('admin.draft')}</Tag>}
                  <Tag color={TARGET_COLOR[n.target_role] || 'blue'}>
                    {TARGET_OPTIONS.find((o) => o.value === n.target_role)?.label || t('admin.newsTargetAll')}
                  </Tag>
                </Space>
              )}
              description={<><div>{n.content}</div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{n.author_name} · {new Date(n.created_at).toLocaleDateString()}</Typography.Text></>}
            />
          </Card>
        )}
      />
      <Modal
        title={editing ? t('common.edit') : t('admin.newsItem')}
        open={open}
        centered
        width={560}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="title" label={t('common.title')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="content" label={t('admin.text')} rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
          <Form.Item name="target_role" label={t('admin.newsTarget')} rules={[{ required: true }]}>
            <Select options={TARGET_OPTIONS} />
          </Form.Item>
          <Form.Item name="is_published" label={t('admin.publish')} valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
