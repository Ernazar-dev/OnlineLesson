import { useEffect, useState } from 'react';
import { Table, Typography, Tag, Button, Space } from 'antd';
import { SendOutlined, ReloadOutlined, CheckCircleOutlined } from '../../icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { assignmentsApi } from '../../api';
import { formatWindow } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';

export default function StudentAssignments() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // The list already carries this student's attempt state per assignment, so
  // there is nothing to cross-reference on the client.
  const load = () => {
    setLoading(true);
    assignmentsApi
      .list()
      .then(setData)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // A student gets several tries at an assignment and their best one is what
  // counts, so the row is built around "how did your best attempt do, and how
  // many tries are left" rather than a single submitted/not-submitted flag.
  // The counts come from the server, which is also what enforces the limit.
  const attemptsOf = (a) => ({
    used: a.attempts_used ?? 0,
    left: a.attempts_left ?? 0,
    max: a.max_attempts ?? 1,
    bestId: a.best_submission_id ?? null,
    bestScore: a.best_score ?? null,
  });

  const columns = [
    { title: t('common.title'), dataIndex: 'title', render: (v, r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{v}</div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.course} · {r.teacher_name}</Typography.Text>
      </div>
    ) },
    { title: t('student.deadline'), dataIndex: 'deadline', width: 210,
      render: (_, r) => formatWindow(r.start_at, r.deadline) },
    { title: t('common.status'), width: 220, render: (_, r) => {
      const { used, max, bestScore } = attemptsOf(r);
      if (!used) {
        if (r.is_expired) return <Tag color="red">{t('student.expired')}</Tag>;
        // The window hasn't opened yet — visible, but not yet submittable.
        if (r.is_upcoming) return <Tag color="default">{t('student.notStarted')}</Tag>;
        return <Tag color="blue">{t('common.open')}</Tag>;
      }
      return (
        <Space size={4} wrap>
          {bestScore === null || bestScore === undefined ? (
            <Tag color="processing">{t('common.analyzing')}</Tag>
          ) : (
            // The best attempt is the grade, so that is the number shown.
            <Tag color={bestScore >= 70 ? 'green' : bestScore >= 50 ? 'orange' : 'red'}>
              {t('student.bestScore', { score: Math.round(bestScore) })}
            </Tag>
          )}
          <Tag>{t('student.attemptsUsed', { used, max })}</Tag>
        </Space>
      );
    } },
    { title: t('student.action'), width: 230, render: (_, r) => {
      const { used, left, bestId } = attemptsOf(r);
      const canSubmit = left > 0 && !r.is_expired && !r.is_upcoming;
      return (
        <Space size={4} wrap>
          {/* Their result stays one click away for as long as they have one. */}
          {bestId && (
            <Button
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => navigate(`/student/submissions/${bestId}`)}
              style={{ color: '#389e0d', borderColor: '#b7eb8f', background: '#f6ffed' }}
            >
              {t('student.result')}
            </Button>
          )}
          {/* Tries remain: the student may improve on their best attempt, and
              a weaker retry cannot cost them the mark they already have. */}
          {canSubmit && (
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              onClick={() => navigate(`/student/submit/${r.id}`)}
            >
              {used ? t('student.retryLeft', { left }) : t('student.submit')}
            </Button>
          )}
          {!canSubmit && !bestId && (
            <Tag color="red">{r.is_upcoming ? t('student.notStarted') : t('student.expired')}</Tag>
          )}
          {!canSubmit && bestId && left === 0 && (
            <Tag>{t('student.noAttemptsLeft')}</Tag>
          )}
        </Space>
      );
    } },
  ];

  return (
    <div>
      <DashboardHero
        title={t('student.allAssignments')}
        extra={<Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh')}</Button>}
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        scroll={{ x: 800 }}
        locale={{ emptyText: t('student.noAssignments') }}
      />
    </div>
  );
}
