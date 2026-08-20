import { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Upload, message, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, DatabaseOutlined, UploadOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api';
import { apiError } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';
import { getSubjectVisual } from '../../utils/subjectVisual';

export default function AdminSubjects() {
  const { t } = useTranslation();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // subject being edited, or null for "add"
  const [image, setImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    adminApi.subjects().then(setData).catch((e) => message.error(apiError(e, t('common.error')))).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openAdd = () => {
    setEditing(null); setImage(null);
    form.resetFields(); setOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s); setImage(null);
    form.setFieldsValue({ name: s.name, code: s.code, description: s.description });
    setOpen(true);
  };

  const submit = async (values) => {
    setSaving(true);
    const fd = new FormData();
    fd.append('name', values.name);
    fd.append('code', values.code || '');
    fd.append('description', values.description || '');
    if (image) fd.append('image', image);
    try {
      if (editing) {
        await adminApi.updateSubject(editing.id, fd);
        message.success(t('common.updated'));
      } else {
        await adminApi.createSubject(fd);
        message.success(t('common.created'));
      }
      setOpen(false); form.resetFields(); setImage(null); setEditing(null); load();
    } catch (e) { message.error(apiError(e, t('common.error'))); } finally { setSaving(false); }
  };

  // A subject still attached to assignments or ratings cannot be removed; the
  // API says so, and the admin needs to see that rather than a row that quietly
  // reappears on the next load.
  const remove = async (id) => {
    try { await adminApi.deleteSubject(id); message.success(t('common.deleted')); }
    catch (e) { message.error(apiError(e, t('common.error'))); }
    load();
  };

  const columns = [
    {
      title: '', dataIndex: 'image_url', width: 56,
      render: (url, r) => {
        if (url) return <img src={url} alt={r.name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />;
        // No picture uploaded yet — the same name-matched icon/gradient the
        // student cards fall back to, so this preview never looks broken.
        const { Icon, gradient } = getSubjectVisual(r.name);
        return (
          <div style={{ width: 40, height: 40, borderRadius: 8, background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon weight="duotone" style={{ fontSize: 20, color: '#fff' }} />
          </div>
        );
      },
    },
    { title: t('common.name'), dataIndex: 'name' },
    { title: t('common.code'), dataIndex: 'code' },
    { title: t('common.description'), dataIndex: 'description', render: (v) => v || '-' },
    {
      title: '', width: 90,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title={t('common.deleteConfirm')} onConfirm={() => remove(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <DashboardHero
        title={<><DatabaseOutlined /> {t('admin.subjectsTitle')}</>}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>{t('common.add')}</Button>}
      />
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 500 }} />
      <Modal
        title={editing ? t('admin.editSubject') : t('admin.newSubject')}
        open={open}
        centered
        width={480}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        onCancel={() => { setOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="code" label={t('common.code')}><Input placeholder={t('admin.codeAuto')} /></Form.Item>
          <Form.Item name="description" label={t('common.description')}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item label={t('admin.subjectImage')} extra={editing ? t('admin.keepImageHint') : null}>
            <Upload
              beforeUpload={(f) => { setImage(f); return false; }}
              maxCount={1}
              accept="image/*"
              onRemove={() => setImage(null)}
            >
              <Button icon={<UploadOutlined />}>{t('literature.chooseImage')}</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
