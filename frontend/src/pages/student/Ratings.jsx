import { useEffect, useState } from 'react';
import { Card, Table, Rate, Button, Typography, Space, message, Progress } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { subjectsApi } from '../../api';
import DashboardHero from '../../components/DashboardHero';

export default function Ratings() {
  const { t } = useTranslation();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    subjectsApi.ratings().then(setData).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const downloadReport = async () => {
    try {
      const blob = await subjectsApi.reportPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Academic_Report.pdf'; a.click();
      URL.revokeObjectURL(url);
    } catch { message.error(t('common.error')); }
  };

  const columns = [
    { title: t('common.subject'), dataIndex: 'subject_name' },
    { title: t('nav.ratings'), dataIndex: 'rating', width: 200, render: (v) => <Space><Rate disabled allowHalf value={v} /><span>{v}</span></Space> },
    { title: t('student.avgScore'), dataIndex: 'average_score', width: 180, render: (v) => <Progress percent={Math.round(v)} size="small" /> },
    { title: t('student.completed'), width: 120, render: (_, r) => `${r.completed_assignments}/${r.total_assignments}` },
  ];

  return (
    <div>
      <DashboardHero
        title={t('student.academicRating')}
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh')}</Button>
            <Button type="primary" icon={<DownloadOutlined />} onClick={downloadReport}>{t('common.pdfReport')}</Button>
          </Space>
        }
      />
      <Card bordered={false} className="shadow-sm" style={{ borderRadius: 16 }}><Table rowKey="subject_id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 700 }} pagination={false} /></Card>
    </div>
  );
}
