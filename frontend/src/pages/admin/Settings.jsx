import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Row, Col } from 'antd';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api';
import Loading from '../../components/Loading';
import DashboardHero from '../../components/DashboardHero';

const FIELDS = [
  { key: 'site_name', label: 'admin.siteName' },
  { key: 'default_language', label: 'admin.defaultLanguage' },
  { key: 'ai_risk_threshold', label: 'admin.aiRiskThreshold' },
  { key: 'plagiarism_threshold', label: 'admin.plagiarismThreshold' },
  { key: 'max_file_size', label: 'admin.maxFileSize' },
  { key: 'allowed_file_types', label: 'admin.allowedFileTypes' },
  { key: 'max_users_per_teacher', label: 'admin.maxUsersPerTeacher' },
];

export default function AdminSettings() {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { adminApi.settings().then((s) => { form.setFieldsValue(s); setLoaded(true); }).catch(() => setLoaded(true)); }, [form]);

  const save = async (values) => {
    setSaving(true);
    try { await adminApi.saveSettings(values); message.success(t('admin.settingsSaved')); }
    catch { message.error(t('common.error')); } finally { setSaving(false); }
  };

  if (!loaded) return <Loading />;

  return (
    <div style={{ maxWidth: 700 }}>
      <DashboardHero title={t('admin.settingsTitle')} />
      <Card bordered={false} className="shadow-sm" style={{ borderRadius: 16 }}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={16}>
            {FIELDS.map((f) => (
              <Col xs={24} sm={12} key={f.key}>
                <Form.Item name={f.key} label={t(f.label)}><Input /></Form.Item>
              </Col>
            ))}
          </Row>
          <Button type="primary" htmlType="submit" loading={saving}>{t('common.save')}</Button>
        </Form>
      </Card>
    </div>
  );
}
