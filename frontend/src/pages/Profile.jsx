import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Modal, Tabs, Typography, Avatar, Tag, Space, Descriptions, Row, Col, Skeleton, Upload, Popconfirm } from 'antd';
import { useTranslation } from 'react-i18next';
import { usersApi } from '../api';
import { mediaUrl } from '../api/client';
import { useAuth } from '../store/auth';
import { apiError, formatUzPhone, UZ_PHONE_RE, formatDate, formatDateTime, initials } from '../utils/format';
import DashboardHero from '../components/DashboardHero';
import StatCard from '../components/StatCard';
import {
  EditOutlined, PhoneCallOutlined, MailOutlined, TeamOutlined, BankOutlined, CalendarOutlined,
  ClockCircleOutlined, FileDoneOutlined, TrophyOutlined, CameraOutlined, DeleteOutlined,
} from '../icons';

export default function Profile() {
  const { t } = useTranslation();
  const loadUser = useAuth((s) => s.loadUser);
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  // Bumped on every upload/remove so the <img src> changes even though the
  // URL itself (/api/users/avatar/:id) doesn't — otherwise the browser would
  // keep showing the old picture straight from cache after a replace.
  const [avatarVersion, setAvatarVersion] = useState(0);

  const load = () => {
    setLoading(true);
    usersApi.profile().then(setProfile).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const changeAvatar = async (file) => {
    if (file.size > 5 * 1024 * 1024) { message.error(t('profile.avatarTooLarge')); return false; }
    setAvatarBusy(true);
    try {
      await usersApi.uploadAvatar(file);
      message.success(t('profile.avatarUpdated'));
      setAvatarVersion((v) => v + 1);
      load();
      loadUser(); // so the header's own avatar updates without a reload
    } catch (e) { message.error(apiError(e, t('common.error'))); } finally { setAvatarBusy(false); }
    return false; // stop antd Upload from also firing its own XHR
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      await usersApi.removeAvatar();
      message.success(t('profile.avatarRemoved'));
      setAvatarVersion((v) => v + 1);
      load();
      loadUser();
    } catch (e) { message.error(apiError(e, t('common.error'))); } finally { setAvatarBusy(false); }
  };

  // `destroyOnClose` remounts the modal's forms each time it opens, so the
  // info form always starts from `initialValues={profile}` fresh — nothing
  // to seed here beyond clearing whatever was typed into the password tab.
  const openEdit = () => {
    pwdForm.resetFields();
    setOpen(true);
  };

  const saveProfile = async (values) => {
    setSaving(true);
    try {
      await usersApi.updateProfile(values);
      message.success(t('profile.saved'));
      load();
      loadUser();
    } catch (e) { message.error(apiError(e, t('common.error'))); } finally { setSaving(false); }
  };

  const savePassword = async (values) => {
    setPwdSaving(true);
    try {
      await usersApi.changePassword(values);
      message.success(t('profile.passwordChanged'));
      pwdForm.resetFields();
    } catch (e) { message.error(apiError(e, t('common.error'))); } finally { setPwdSaving(false); }
  };

  if (loading || !profile) {
    return (
      <div>
        <DashboardHero title={t('profile.title')} />
        <Card bordered={false} className="shadow-sm" style={{ borderRadius: 20 }}>
          <Skeleton active avatar paragraph={{ rows: 4 }} />
        </Card>
      </div>
    );
  }

  const displayName = profile.display_name || profile.full_name || profile.username;
  const roleLabel = t(`common.${profile.role}`);
  // Students belong to a group, teachers/admins to a department — never both,
  // so one extra row covers whichever the account actually has.
  const orgLabel = profile.role === 'student' ? t('common.group') : t('profile.department');
  const orgValue = profile.role === 'student' ? profile.group_name : profile.department_name;
  // A sidebar of stat tiles only exists for roles the API actually sends
  // numbers for — without it the identity card takes the full row instead of
  // leaving a bare gap where the sidebar would have been.
  const hasStats = !!profile.stats;
  const avatarSrc = profile.avatar_url ? `${mediaUrl(profile.avatar_url)}?v=${avatarVersion}` : null;

  const infoCard = (
    <Card
      bordered={false}
      className="shadow-sm premium-enter"
      style={{ borderRadius: 20, overflow: 'hidden' }}
      styles={{ body: { padding: 0 } }}
    >
      {/* Identity banner — same brand gradient as the sidebar/header, so the
          page opens on something that feels like this platform rather than a
          bare settings form. */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--brand) 0%, var(--ai-accent) 100%)',
          padding: '32px 28px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
        }}
      >
        {/* Avatar + its two round badges (change / remove) — every user gets
            this from their own profile, and the photo it sets shows up in a
            circle wherever their name is listed elsewhere in the app. */}
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          <Avatar
            size={84}
            src={avatarSrc}
            style={{
              background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 30, fontWeight: 700,
              border: '3px solid rgba(255,255,255,0.45)',
            }}
          >
            {initials(displayName)}
          </Avatar>
          <Upload accept="image/*" showUploadList={false} beforeUpload={changeAvatar}>
            <button
              type="button"
              title={t('profile.changePhoto')}
              disabled={avatarBusy}
              style={{
                position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: '50%',
                background: 'var(--brand)', border: '2px solid #fff', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: avatarBusy ? 'wait' : 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.3)', padding: 0,
              }}
            >
              <CameraOutlined style={{ fontSize: 14 }} />
            </button>
          </Upload>
          {avatarSrc && (
            <Popconfirm title={t('profile.removePhotoConfirm')} onConfirm={removeAvatar} disabled={avatarBusy}>
              <button
                type="button"
                title={t('profile.removePhoto')}
                disabled={avatarBusy}
                style={{
                  position: 'absolute', left: -2, bottom: -2, width: 24, height: 24, borderRadius: '50%',
                  background: '#e5484d', border: '2px solid #fff', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: avatarBusy ? 'wait' : 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.3)', padding: 0,
                }}
              >
                <DeleteOutlined style={{ fontSize: 11 }} />
              </button>
            </Popconfirm>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <Typography.Title level={3} style={{ color: '#fff', margin: 0, wordBreak: 'break-word' }}>
            {displayName}
          </Typography.Title>
          <Space size={8} wrap style={{ marginTop: 6 }}>
            <Tag style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)' }}>
              {roleLabel}
            </Tag>
            <Typography.Text style={{ color: 'rgba(255,255,255,0.85)' }}>@{profile.username}</Typography.Text>
          </Space>
        </div>
      </div>

      <div style={{ padding: '24px 28px' }}>
        <Descriptions column={{ xs: 1, sm: 2, xl: hasStats ? 2 : 3 }} size="middle">
          <Descriptions.Item label={<Space size={6}><PhoneCallOutlined />{t('admin.phoneField')}</Space>}>
            {profile.phone || t('profile.notProvided')}
          </Descriptions.Item>
          <Descriptions.Item label={<Space size={6}><MailOutlined />{t('profile.email')}</Space>}>
            {profile.email || t('profile.notProvided')}
          </Descriptions.Item>
          <Descriptions.Item label={<Space size={6}>{profile.role === 'student' ? <TeamOutlined /> : <BankOutlined />}{orgLabel}</Space>}>
            {orgValue || t('common.noGroup')}
          </Descriptions.Item>
          <Descriptions.Item label={<Space size={6}><CalendarOutlined />{t('profile.joined')}</Space>}>
            {formatDate(profile.created_at)}
          </Descriptions.Item>
          <Descriptions.Item label={<Space size={6}><ClockCircleOutlined />{t('profile.lastSeen')}</Space>}>
            {profile.last_seen ? formatDateTime(profile.last_seen) : '—'}
          </Descriptions.Item>
        </Descriptions>
      </div>
    </Card>
  );

  // Role-specific numbers — the same tiles the dashboards use, so a
  // student/teacher sees at a glance what their account has actually done
  // instead of just its static fields. Sits beside the identity card, not
  // below it, so the row uses the full page width the way every other
  // dashboard screen does.
  const statsSidebar = hasStats && (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {profile.role === 'student' && (
        <>
          <StatCard title={t('profile.completedAssignments')} value={profile.stats.completed_assignments} prefix={<FileDoneOutlined />} color="#1c9de9" />
          <StatCard
            title={t('profile.averageScore')}
            value={profile.stats.average_score ?? t('profile.noScoreYet')}
            prefix={<TrophyOutlined />}
            color="#f0a020"
          />
        </>
      )}
      {profile.role === 'teacher' && (
        <>
          <StatCard title={t('profile.groupsManaged')} value={profile.stats.groups_count} prefix={<TeamOutlined />} color="#1c9de9" />
          <StatCard title={t('profile.studentsTotal')} value={profile.stats.students_count} prefix={<TrophyOutlined />} color="#22b07d" />
        </>
      )}
    </Space>
  );

  return (
    <div>
      <DashboardHero
        title={t('profile.title')}
        extra={<Button type="primary" icon={<EditOutlined />} onClick={openEdit}>{t('profile.edit')}</Button>}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={hasStats ? 16 : 24}>{infoCard}</Col>
        {hasStats && <Col xs={24} lg={8}>{statsSidebar}</Col>}
      </Row>

      <Modal
        title={t('profile.edit')}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={480}
        destroyOnClose
      >
        <Tabs
          items={[
            {
              key: 'info',
              label: t('profile.infoTab'),
              children: (
                <Form form={form} layout="vertical" onFinish={saveProfile} initialValues={profile}>
                  <Form.Item name="username" label={t('auth.username')}><Input disabled /></Form.Item>
                  <Form.Item name="full_name" label={t('auth.fullName')}><Input /></Form.Item>
                  <Form.Item
                    name="email"
                    label={t('profile.email')}
                    rules={[{ type: 'email', message: t('profile.emailInvalid') }]}
                  >
                    <Input placeholder="name@example.com" />
                  </Form.Item>
                  <Form.Item
                    name="phone"
                    label={t('admin.phoneField')}
                    getValueFromEvent={(e) => formatUzPhone(e.target.value)}
                    rules={[{ validator: (_, v) => (!v || UZ_PHONE_RE.test(v) ? Promise.resolve() : Promise.reject(new Error(t('admin.phoneInvalid')))) }]}
                  >
                    <Input placeholder="+998 90 123-45-67" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving}>{t('common.save')}</Button>
                </Form>
              ),
            },
            {
              key: 'password',
              label: t('profile.changePassword'),
              children: (
                <Form form={pwdForm} layout="vertical" onFinish={savePassword}>
                  <Form.Item name="old_password" label={t('profile.currentPassword')} rules={[{ required: true }]}><Input.Password /></Form.Item>
                  <Form.Item name="new_password" label={t('profile.newPassword')} rules={[{ required: true, min: 4 }]}><Input.Password /></Form.Item>
                  <Button htmlType="submit" loading={pwdSaving}>{t('profile.changeBtn')}</Button>
                </Form>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
