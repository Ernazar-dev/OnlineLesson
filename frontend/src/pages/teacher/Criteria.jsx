import { useEffect, useState } from 'react';
import {
  Table, Button, Typography, Space, Modal, Form, Input, InputNumber, message, Popconfirm, Tag, Empty,
  Tabs, Alert,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, CheckSquareOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { teacherApi } from '../../api';
import { apiError } from '../../utils/format';
import { SUPPORTED } from '../../i18n';
import DashboardHero from '../../components/DashboardHero';

const LANG_LABELS = { uz: "O'zbekcha", ru: 'Русский', en: 'English' };

// A teacher's reusable rubric library. Rows here are picked from when creating
// an assignment; editing one never touches assignments already created.
//
// Criteria are stored in all three languages, so a row typed in Uzbek still
// reads in Russian for a student who switched the site to Russian. The teacher
// writes in whichever language they are using and the server translates the
// rest; the per-language tabs are there to correct a translation by hand.
export default function TeacherCriteria() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(lang);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    teacherApi.criteria()
      .then(setRows)
      .catch(() => message.error(t('teacher.criteriaLibraryLoadError')))
      .finally(() => setLoading(false));
  };
  // Names and descriptions come back in the caller's language, so switching the
  // language has to re-fetch — otherwise the table keeps the previous wording.
  useEffect(load, [lang]);

  // Form fields are named `name_uz`, `desc_ru`, … one set per language tab.
  const fieldsFrom = (r) => {
    const out = {};
    for (const lng of SUPPORTED) {
      out[`name_${lng}`] = r?.name_i18n?.[lng] || '';
      out[`desc_${lng}`] = r?.description_i18n?.[lng] || '';
    }
    return out;
  };

  const openCreate = () => {
    setEditing(null);
    setTab(lang);
    form.resetFields();
    form.setFieldsValue({ weight: 10, max_score: 100, ...fieldsFrom(null) });
    setOpen(true);
  };
  const openEdit = (r) => {
    setEditing(r);
    setTab(lang);
    form.setFieldsValue({ weight: r.weight, max_score: r.max_score, ...fieldsFrom(r) });
    setOpen(true);
  };

  const save = async () => {
    let values;
    try { values = await form.validateFields(); }
    catch {
      // The only required field is the name in the current language, which may
      // well be on a tab that is not showing — bring it into view.
      setTab(lang);
      return;
    }
    // Only languages the teacher actually filled in are sent; the server
    // translates the gaps, so writing in one language is enough.
    const nameI18n = {};
    const descI18n = {};
    for (const lng of SUPPORTED) {
      const n = String(values[`name_${lng}`] || '').trim();
      const d = String(values[`desc_${lng}`] || '').trim();
      if (n) nameI18n[lng] = n;
      if (d) descI18n[lng] = d;
    }
    const payload = {
      // The language being edited in is the canonical text; it stays the rubric
      // key the grader and existing scores are matched on.
      name: nameI18n[lang] || nameI18n[SUPPORTED.find((l) => nameI18n[l])],
      description: descI18n[lang] || descI18n[SUPPORTED.find((l) => descI18n[l])] || '',
      name_i18n: nameI18n,
      description_i18n: descI18n,
      weight: values.weight,
    };

    setSaving(true);
    try {
      if (editing) await teacherApi.updateCriterion(editing.id, payload);
      else await teacherApi.createCriterion(payload);
      message.success(t('teacher.criteriaSaved'));
      setOpen(false);
      load();
    } catch (e) {
      message.error(apiError(e, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await teacherApi.deleteCriterion(id);
      message.success(t('teacher.criteriaDeleted'));
      load();
    } catch (e) { message.error(apiError(e, t('common.error'))); }
  };

  const loadStandard = async () => {
    try {
      const all = await teacherApi.loadStandardCriteria();
      setRows(all);
      message.success(t('teacher.criteriaLoadedStandard'));
    } catch (e) { message.error(apiError(e, t('common.error'))); }
  };

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v}</div>
          {r.description && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.description}</Typography.Text>
          )}
        </div>
      ),
    },
    { title: t('common.weight'), dataIndex: 'weight', width: 110, align: 'right', render: (v) => <Tag color="blue">{v}%</Tag> },
    {
      title: '', width: 110, render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title={t('common.deleteConfirm')} onConfirm={() => remove(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // One name + description pair per language, only the active tab rendered but
  // all of them mounted so validation and submission see every value.
  const tabItems = SUPPORTED.map((lng) => ({
    key: lng,
    label: LANG_LABELS[lng],
    forceRender: true,
    children: (
      <>
        <Form.Item
          name={`name_${lng}`}
          label={t('teacher.criteriaName')}
          rules={lng === lang ? [{ required: true }] : []}
        >
          <Input />
        </Form.Item>
        <Form.Item name={`desc_${lng}`} label={t('common.description')}>
          <Input.TextArea rows={3} placeholder={t('teacher.criteriaDescPlaceholder')} />
        </Form.Item>
      </>
    ),
  }));

  return (
    <div>
      <DashboardHero
        title={<><CheckSquareOutlined /> {t('teacher.criteriaLibraryTitle')}</>}
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={loadStandard}>{t('teacher.criteriaUseStandard')}</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('teacher.criteriaAdd')}</Button>
          </Space>
        }
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: -10, marginBottom: 16 }}>
        {t('teacher.criteriaLibraryIntro')}
      </Typography.Paragraph>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        locale={{ emptyText: <Empty description={t('teacher.criteriaLibraryEmpty')} /> }}
      />

      <Modal
        title={editing ? t('teacher.criteriaEdit') : t('teacher.criteriaNew')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={save}
        confirmLoading={saving}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        centered
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={t('teacher.criteriaTranslateHint')}
          />
          <Tabs activeKey={tab} onChange={setTab} items={tabItems} size="small" />
          <Form.Item name="weight" label={t('common.weight')} extra={t('teacher.criteriaWeightNote')}>
            <InputNumber min={1} max={100} addonAfter="%" style={{ width: 160 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
