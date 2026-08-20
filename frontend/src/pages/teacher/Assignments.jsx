import { useEffect, useMemo, useState } from 'react';
import {
  Table, Button, Typography, Space, Modal, Form, Input, Select, DatePicker, Tag,
  message, Popconfirm, Steps, Descriptions, Card, Empty,
} from 'antd';
import { PlusOutlined, EyeOutlined, DeleteOutlined, EditOutlined, CheckSquareOutlined, TeamOutlined } from '../../icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { assignmentsApi, teacherApi, subjectsApi } from '../../api';
import { apiError, formatWindow } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';
import useIsMobile from '../../hooks/useIsMobile';

const WIZARD_STEPS = 4;
const { RangePicker } = DatePicker;

export default function TeacherAssignments() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [groups, setGroups] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [library, setLibrary] = useState([]);         // teacher's reusable criteria
  const [selectedIds, setSelectedIds] = useState([]); // library rows applied to this assignment
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState('all'); // narrow the page to one group
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({});
  const [form] = Form.useForm();

  // Editing an existing assignment's core fields (title, deadline, …) is a much
  // lighter flow than the create wizard, so it gets its own small modal + form.
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm] = Form.useForm();
  const isMobile = useIsMobile();

  const load = () => { setLoading(true); assignmentsApi.list().then(setData).finally(() => setLoading(false)); };
  const loadLibrary = () => teacherApi.criteria().then(setLibrary).catch(() => {});
  useEffect(() => {
    load();
    // /api/admin/groups is admin-only — a teacher must read their own groups
    // from the teacher endpoint, otherwise the (required) group select stays
    // empty and the wizard can never be completed.
    teacherApi.groups()
      .then(setGroups)
      .catch(() => message.error(t('teacher.groupsLoadError')));
    subjectsApi.list().then(setSubjects).catch(() => {});
    loadLibrary();
  }, []);

  const openWizard = () => {
    setStep(0); setDraft({}); form.resetFields();
    setSelectedIds([]); // the teacher ticks which library criteria apply
    loadLibrary();      // refresh, in case they just edited the library
    setOpen(true);
  };
  const closeWizard = () => {
    setOpen(false); setStep(0); setDraft({}); setSelectedIds([]); form.resetFields();
  };

  // Each phase validates only its own fields before advancing. The rubric phase
  // has no form fields of its own, so it just advances.
  const PHASE_FIELDS = { 0: ['course', 'group_ids', 'title'], 1: ['type', 'window'], 2: [] };
  const nextStep = async () => {
    try {
      const values = await form.validateFields(PHASE_FIELDS[step] || []);
      setDraft((d) => ({ ...d, ...values, description: form.getFieldValue('description') }));
      setStep((s) => s + 1);
    } catch { /* AntD highlights the offending fields */ }
  };

  const create = async () => {
    const values = { ...draft, ...form.getFieldsValue(true) };
    const [start, end] = values.window || [];
    try {
      const created = await assignmentsApi.create({
        title: values.title,
        description: values.description,
        course: values.course,
        type: values.type,
        // One create call fans the assignment out to every chosen group.
        group_ids: values.group_ids,
        // The picker gives midnight on both ends; the window has to cover both
        // named days in full — open from the first minute of the opening day,
        // closed at the last minute of the closing one.
        start_at: start ? start.startOf('day').toISOString() : null,
        deadline: end ? end.endOf('day').toISOString() : null,
      });
      // Copy the criteria the teacher ticked from their library onto the new
      // assignment(s). Nothing selected → save none, so the server grades against
      // its built-in standard 9 (which stay multilingual).
      // The library rows already carry their {uz,ru,en} text, so copying it
      // across means the assignment's rubric reads in the student's language
      // without the server having to translate it a second time.
      const named = library
        .filter((c) => selectedIds.includes(c.id))
        .map((c) => ({
          name: c.name,
          description: c.description,
          name_i18n: c.name_i18n,
          description_i18n: c.description_i18n,
          weight: c.weight,
          max_score: c.max_score,
        }));
      // The same rubric is copied onto each group's assignment.
      const ids = created.assignment_ids?.length ? created.assignment_ids : [created.assignment_id];
      if (named.length) await Promise.all(ids.map((id) => assignmentsApi.saveCriteria(id, named)));
      message.success(t('teacher.assignmentCreated'));
      closeWizard();
      load();
    } catch (e) { message.error(apiError(e, t('common.error'))); }
  };

  const remove = async (id) => {
    try { await assignmentsApi.remove(id); message.success(t('common.deleted')); }
    catch (e) { message.error(apiError(e, t('common.error'))); }
    load();
  };

  const openEdit = (r) => {
    setEditingId(r.id);
    editForm.setFieldsValue({
      title: r.title,
      course: r.course,
      group_id: r.group_id ?? undefined,
      type: r.assignment_type || 'theoretical',
      description: r.description || '',
      // Assignments created before the window existed have no start date; the
      // picker then opens on its closing end only, and saving sets both.
      window: r.deadline || r.start_at
        ? [r.start_at ? dayjs(r.start_at) : null, r.deadline ? dayjs(r.deadline) : null]
        : null,
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    let values;
    try { values = await editForm.validateFields(); }
    catch { return; /* AntD highlights the offending fields */ }
    setEditSaving(true);
    const [start, end] = values.window || [];
    try {
      await assignmentsApi.update(editingId, {
        title: values.title,
        description: values.description,
        course: values.course,
        type: values.type,
        group_id: values.group_id,
        // Same rule as on create: the window covers both named days in full.
        start_at: start ? start.startOf('day').toISOString() : null,
        deadline: end ? end.endOf('day').toISOString() : null,
      });
      message.success(t('teacher.assignmentUpdated'));
      setEditOpen(false);
      load();
    } catch (e) {
      message.error(apiError(e, t('common.error')));
    } finally {
      setEditSaving(false);
    }
  };

  // The group each row belongs to is now the section it sits in, so it is no
  // longer repeated in every line of that section.
  const columns = [
    { title: t('common.name'), dataIndex: 'title' },
    { title: t('common.subject'), dataIndex: 'course' },
    {
      title: t('teacher.deadline'),
      dataIndex: 'deadline',
      width: 210,
      render: (_, r) => formatWindow(r.start_at, r.deadline),
    },
    {
      title: t('common.status'),
      width: 140,
      render: (_, r) => {
        if (r.is_expired) return <Tag color="red">{t('student.expired')}</Tag>;
        // Set, but its opening day hasn't arrived — nobody can submit yet.
        if (r.is_upcoming) return <Tag color="blue">{t('teacher.upcoming')}</Tag>;
        return <Tag color="green">{t('teacher.active')}</Tag>;
      },
    },
    {
      title: '', width: 160, render: (_, r) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/teacher/assignments/${r.id}/submissions`)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title={t('common.deleteConfirm')} onConfirm={() => remove(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ),
    },
  ];

  // One section per group instead of one flat list with the groups interleaved.
  // The server already returns the rows grouped and, inside a group, ordered by
  // the nearest deadline — so insertion order is the order to render in.
  const sections = useMemo(() => {
    const map = new Map();
    for (const r of data) {
      const key = r.group_name || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    const all = [...map.entries()].map(([name, rows]) => ({ name, rows }));
    return groupFilter === 'all' ? all : all.filter((s) => s.name === groupFilter);
  }, [data, groupFilter]);

  // Only the groups that actually have assignments are worth filtering by.
  const filterOptions = useMemo(() => {
    const names = [...new Set(data.map((r) => r.group_name || ''))];
    return [
      { value: 'all', label: t('teacher.allGroups') },
      ...names.map((n) => ({ value: n, label: n || t('teacher.noGroupSection') })),
    ];
  }, [data, t]);

  return (
    <div>
      <DashboardHero
        title={t('teacher.assignmentsTitle')}
        extra={
          <Space wrap>
            <Select
              value={groupFilter}
              onChange={setGroupFilter}
              options={filterOptions}
              style={{ minWidth: 200 }}
              suffixIcon={<TeamOutlined />}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={openWizard}>{t('common.create')}</Button>
          </Space>
        }
      />

      {loading || !data.length ? (
        <Card bordered={false} className="shadow-sm" style={{ borderRadius: 16 }}>
          {loading
            ? <Table rowKey="id" columns={columns} dataSource={[]} loading pagination={false} />
            : <Empty description={t('teacher.noAssignments')} />}
        </Card>
      ) : (
        sections.map((s) => (
          <Card
            key={s.name || '__none__'}
            size="small"
            bordered={false}
            className="shadow-sm"
            style={{ marginBottom: 16, borderRadius: 16 }}
            title={
              <Space>
                <TeamOutlined />
                <span>{s.name || t('teacher.noGroupSection')}</span>
                <Tag color="blue">{t('teacher.assignmentCount', { count: s.rows.length })}</Tag>
              </Space>
            }
          >
            {isMobile ? (
              <div>
                {s.rows.map((r) => {
                  const status = r.is_expired
                    ? { color: 'var(--error)', bg: 'rgba(240,68,56,0.12)', tag: <Tag color="red">{t('student.expired')}</Tag> }
                    : r.is_upcoming
                    ? { color: '#2f54eb', bg: 'rgba(47,84,235,0.12)', tag: <Tag color="blue">{t('teacher.upcoming')}</Tag> }
                    : { color: 'var(--success)', bg: 'rgba(18,183,106,0.12)', tag: <Tag color="green">{t('teacher.active')}</Tag> };
                  return (
                    <div key={r.id} className="list-card premium-enter">
                      <div className="list-card-head">
                        <div className="dash-row-icon" style={{ color: status.color, background: status.bg }}>
                          <FileTextOutlined />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="list-card-title">{r.title}</div>
                          <div className="list-card-meta">{`${r.course} · ${formatWindow(r.start_at, r.deadline)}`}</div>
                        </div>
                      </div>
                      <div className="list-card-tags">{status.tag}</div>
                      <div className="list-card-actions" style={{ marginTop: 10 }}>
                        <button className="icon-btn" onClick={() => navigate(`/teacher/assignments/${r.id}/submissions`)}><EyeOutlined /></button>
                        <button className="icon-btn" onClick={() => openEdit(r)}><EditOutlined /></button>
                        <Popconfirm title={t('common.deleteConfirm')} onConfirm={() => remove(r.id)}>
                          <button className="icon-btn icon-btn--danger"><DeleteOutlined /></button>
                        </Popconfirm>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Table
                rowKey="id"
                size="small"
                columns={columns}
                dataSource={s.rows}
                pagination={false}
                scroll={{ x: 800 }}
              />
            )}
          </Card>
        ))
      )}

      <Modal
        title={t('teacher.newAssignment')}
        open={open}
        onCancel={closeWizard}
        width={640}
        centered
        destroyOnClose={false}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button onClick={closeWizard}>{t('common.cancel')}</Button>
            <Space>
              {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>{t('common.back')}</Button>}
              {step < WIZARD_STEPS - 1 ? (
                <Button type="primary" onClick={nextStep}>{t('submit.continue')}</Button>
              ) : (
                <Button type="primary" onClick={create}>{t('common.create')}</Button>
              )}
            </Space>
          </div>
        }
      >
        <Steps
          size="small"
          current={step}
          style={{ marginBottom: 24 }}
          items={[
            { title: t('teacher.wizardPhase1') },
            { title: t('teacher.wizardPhase2') },
            { title: t('teacher.wizardPhaseCriteria') },
            { title: t('teacher.wizardPhase3') },
          ]}
        />

        <Form form={form} layout="vertical" initialValues={{ type: 'theoretical' }} preserve>
          <div style={{ display: step === 0 ? 'block' : 'none' }}>
            <Form.Item name="course" label={t('common.subject')} rules={[{ required: true }]}>
              <Select
                placeholder={t('teacher.pickCourse')}
                options={subjects.map((s) => ({ value: s.name, label: s.name }))}
              />
            </Form.Item>
            {/* A teacher can post one assignment to several of their groups at
                once; each chosen group gets its own copy on the server. */}
            <Form.Item name="group_ids" label={t('common.group')} rules={[{ required: true, type: 'array', min: 1 }]}>
              <Select
                mode="multiple"
                allowClear
                placeholder={t('teacher.pickGroups')}
                options={groups.map((g) => ({ value: g.id, label: g.name }))}
              />
            </Form.Item>
            <Form.Item name="title" label={t('common.name')} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label={t('common.description')}>
              <Input.TextArea rows={4} showCount maxLength={500} />
            </Form.Item>
          </div>

          <div style={{ display: step === 1 ? 'block' : 'none' }}>
            <Form.Item name="type" label={t('teacher.type')}>
              <Select
                options={[
                  { value: 'theoretical', label: `📝 ${t('teacher.theoretical')} — ${t('teacher.theoreticalDesc')}` },
                  { value: 'practical', label: `💻 ${t('teacher.practical')} — ${t('teacher.practicalDesc')}` },
                ]}
              />
            </Form.Item>
            {/* A day is the unit teachers actually think in. Asking for an hour,
                a minute and a second made a simple choice look like a settings
                screen; the window runs from the start of the opening day to the
                end of the closing one. */}
            <Form.Item
              name="window"
              label={t('teacher.window')}
              rules={[
                { required: true, message: t('teacher.windowRequired') },
                // A cleared end of the range comes back as a null inside the
                // array, which `required` alone accepts.
                {
                  validator: (_, v) =>
                    v?.[0] && v?.[1] ? Promise.resolve() : Promise.reject(new Error(t('teacher.windowRequired'))),
                },
              ]}
              extra={t('teacher.windowHint')}
            >
              <RangePicker
                style={{ width: '100%' }}
                format="DD.MM.YYYY"
                placeholder={[t('teacher.startPlaceholder'), t('teacher.endPlaceholder')]}
                disabledDate={(d) => d && d < dayjs().startOf('day')}
              />
            </Form.Item>
          </div>

          {step === 2 && (
            <div>
              <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                {t('teacher.criteriaSelectHint')}
              </Typography.Paragraph>

              {library.length === 0 ? (
                <Card size="small" style={{ textAlign: 'center', background: '#fafcff' }}>
                  <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 8 }}>
                    {t('teacher.criteriaLibraryEmpty')}
                  </Typography.Paragraph>
                  <Button icon={<CheckSquareOutlined />} onClick={() => navigate('/teacher/criteria')}>
                    {t('teacher.criteriaLibraryTitle')}
                  </Button>
                </Card>
              ) : (
                <>
                  {/* The teacher just ticks which of their saved criteria apply. */}
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={library}
                    scroll={{ y: 320 }}
                    rowSelection={{
                      selectedRowKeys: selectedIds,
                      onChange: setSelectedIds,
                    }}
                    onRow={(r) => ({
                      onClick: () =>
                        setSelectedIds((ids) =>
                          ids.includes(r.id) ? ids.filter((x) => x !== r.id) : [...ids, r.id]
                        ),
                    })}
                    columns={[
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
                      { title: t('common.weight'), dataIndex: 'weight', width: 90, align: 'right', render: (v) => <Tag color="blue">{v}%</Tag> },
                    ]}
                  />
                  <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                    {t('teacher.criteriaManageInLibrary')}
                  </Typography.Paragraph>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <Card size="small" title={t('teacher.preview')}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label={t('common.name')}>{form.getFieldValue('title')}</Descriptions.Item>
                <Descriptions.Item label={t('common.subject')}>{form.getFieldValue('course')}</Descriptions.Item>
                <Descriptions.Item label={t('common.group')}>
                  {groups
                    .filter((g) => (form.getFieldValue('group_ids') || []).includes(g.id))
                    .map((g) => g.name)
                    .join(', ') || '—'}
                </Descriptions.Item>
                <Descriptions.Item label={t('teacher.type')}>
                  {form.getFieldValue('type') === 'practical' ? t('teacher.practical') : t('teacher.theoretical')}
                </Descriptions.Item>
                <Descriptions.Item label={t('teacher.window')}>
                  {(() => {
                    const [s, e] = form.getFieldValue('window') || [];
                    return s && e ? `${s.format('DD.MM.YYYY')} — ${e.format('DD.MM.YYYY')}` : '—';
                  })()}
                </Descriptions.Item>
                <Descriptions.Item label={t('common.description')}>
                  {form.getFieldValue('description') || '—'}
                </Descriptions.Item>
                <Descriptions.Item label={t('teacher.gradedSections')}>
                  {selectedIds.length
                    ? library
                        .filter((c) => selectedIds.includes(c.id))
                        .map((c) => `${c.name} (${c.weight}%)`).join(' · ')
                    : t('teacher.standard9')}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}
        </Form>
      </Modal>

      {/* Lightweight edit — fix a mistyped title, wrong deadline, group, etc. */}
      <Modal
        title={t('teacher.editAssignment')}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={submitEdit}
        confirmLoading={editSaving}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        centered
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="title" label={t('common.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="course" label={t('common.subject')} rules={[{ required: true }]}>
            <Select
              placeholder={t('teacher.pickCourse')}
              options={subjects.map((s) => ({ value: s.name, label: s.name }))}
            />
          </Form.Item>
          <Form.Item name="group_id" label={t('common.group')} rules={[{ required: true }]}>
            <Select
              placeholder={t('teacher.pickGroup')}
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
            />
          </Form.Item>
          <Form.Item name="type" label={t('teacher.type')}>
            <Select
              options={[
                { value: 'theoretical', label: `📝 ${t('teacher.theoretical')}` },
                { value: 'practical', label: `💻 ${t('teacher.practical')}` },
              ]}
            />
          </Form.Item>
          {/* Past days stay selectable here: an assignment that is already open
              keeps a start date in the past, and re-picking the range must not
              force the teacher to move it. */}
          <Form.Item
            name="window"
            label={t('teacher.window')}
            rules={[
              { required: true, message: t('teacher.windowRequired') },
              {
                validator: (_, v) =>
                  v?.[0] && v?.[1] ? Promise.resolve() : Promise.reject(new Error(t('teacher.windowRequired'))),
              },
            ]}
            extra={t('teacher.windowHint')}
          >
            <RangePicker
              style={{ width: '100%' }}
              format="DD.MM.YYYY"
              placeholder={[t('teacher.startPlaceholder'), t('teacher.endPlaceholder')]}
            />
          </Form.Item>
          <Form.Item name="description" label={t('common.description')}>
            <Input.TextArea rows={4} showCount maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
