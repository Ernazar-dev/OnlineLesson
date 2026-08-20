import { useEffect, useState } from 'react';
import { Row, Col, Card, Button, Typography, Empty, Modal, Form, Input, Upload, message, Popconfirm, Select, Tag } from 'antd';
import { DownloadOutlined, PlusOutlined, DeleteOutlined, EditOutlined, ReadOutlined, UploadOutlined } from '../icons';
import { useTranslation } from 'react-i18next';
import { literatureApi, subjectsApi } from '../api';
import Loading from './Loading';
import { apiError } from '../utils/format';

export default function LiteratureList({ canManage = false }) {
  const { t } = useTranslation();
  const [books, setBooks] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // book being edited, or null for "add"
  const [form] = Form.useForm();
  const [file, setFile] = useState(null);
  const [cover, setCover] = useState(null);
  const [saving, setSaving] = useState(false);
  const [subjects, setSubjects] = useState([]);

  const load = () => literatureApi.list().then(setBooks).catch(() => setBooks([]));
  useEffect(() => { load(); }, []);

  // Which subject a book belongs to is not decoration: grading pulls the
  // passages it checks answers against out of the books filed under the
  // assignment's subject, so a book left unassigned is never consulted.
  // Students do not upload books, so the list is only fetched for staff.
  useEffect(() => {
    if (canManage) subjectsApi.list().then(setSubjects).catch(() => setSubjects([]));
  }, [canManage]);

  const openAdd = () => {
    setEditing(null); setFile(null); setCover(null);
    form.resetFields(); setOpen(true);
  };

  const openEdit = (b) => {
    setEditing(b); setFile(null); setCover(null);
    form.setFieldsValue({ title: b.title, author: b.author, subject_id: b.subject_id ?? null });
    setOpen(true);
  };

  const download = async (b) => {
    try {
      const blob = await literatureApi.download(b.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${b.title}.${b.file_ext || 'pdf'}`; a.click();
      URL.revokeObjectURL(url);
    } catch { message.error(t('literature.downloadError')); }
  };

  const submit = async (values) => {
    // On add a file is mandatory; on edit the existing file is kept unless replaced.
    if (!editing && !file) return message.error(t('literature.attachFile'));
    setSaving(true);
    const fd = new FormData();
    if (file) fd.append('file', file);
    if (cover) fd.append('cover', cover);
    fd.append('title', values.title);
    fd.append('author', values.author || 'Unknown');
    // Sent even when cleared, so a book can be unfiled again; the API reads an
    // empty string as "no subject".
    fd.append('subject_id', values.subject_id ?? '');
    try {
      if (editing) {
        await literatureApi.update(editing.id, fd);
        message.success(t('literature.bookUpdated'));
      } else {
        await literatureApi.add(fd);
        message.success(t('literature.bookAdded'));
      }
      setOpen(false); form.resetFields(); setFile(null); setCover(null); setEditing(null); load();
    } catch (e) { message.error(apiError(e, t('common.error'))); } finally { setSaving(false); }
  };

  const remove = async (id) => {
    try { await literatureApi.remove(id); message.success(t('common.deleted')); }
    catch (e) { message.error(apiError(e, t('common.error'))); }
    load();
  };

  if (!books) return <Loading />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}><ReadOutlined /> {t('literature.title')}</Typography.Title>
        {canManage && <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>{t('common.add')}</Button>}
      </div>
      {books.length === 0 ? <Empty description={t('literature.noBooks')} /> : (
        <Row gutter={[12, 12]}>
          {books.map((b) => (
            <Col xs={24} sm={12} md={8} lg={8} xl={6} key={b.id}>
              <Card
                size="small"
                cover={b.cover_url ? (
                  <img
                    alt={b.title}
                    src={b.cover_url}
                    style={{ height: 140, width: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
                    <ReadOutlined style={{ fontSize: 40, color: '#2f54eb' }} />
                  </div>
                )}
                actions={[
                  <DownloadOutlined key="d" onClick={() => download(b)} />,
                  ...(canManage ? [
                    <EditOutlined key="e" onClick={() => openEdit(b)} />,
                    <Popconfirm key="x" title={t('literature.deleteBook')} onConfirm={() => remove(b.id)}><DeleteOutlined /></Popconfirm>,
                  ] : []),
                ]}>
                <Card.Meta
                  title={b.title}
                  description={
                    <>
                      <div>{b.author}</div>
                      {/* Says at a glance whether this book feeds the grader. */}
                      <Tag
                        color={b.subject_id ? 'blue' : 'default'}
                        style={{ marginTop: 6 }}
                      >
                        {b.subject_id ? b.subject_name : t('literature.noSubject')}
                      </Tag>
                    </>
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title={editing ? t('literature.editBook') : t('literature.addBook')}
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
          <Form.Item name="title" label={t('common.name')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="author" label={t('literature.author')}><Input /></Form.Item>
          <Form.Item name="subject_id" label={t('common.subject')} extra={t('literature.subjectHint')}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('literature.subjectPlaceholder')}
              options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
          <Form.Item label={t('literature.file')} required={!editing} extra={editing ? t('literature.keepFileHint') : null}>
            <Upload
              beforeUpload={(f) => { setFile(f); return false; }}
              maxCount={1}
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.odt,.zip"
              onRemove={() => setFile(null)}
            >
              <Button icon={<UploadOutlined />}>{t('literature.chooseFile')}</Button>
            </Upload>
          </Form.Item>
          <Form.Item label={t('literature.cover')}>
            <Upload beforeUpload={(f) => { setCover(f); return false; }} maxCount={1} accept="image/*" onRemove={() => setCover(null)}>
              <Button icon={<UploadOutlined />}>{t('literature.chooseImage')}</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
