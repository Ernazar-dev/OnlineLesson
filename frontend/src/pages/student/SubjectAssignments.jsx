import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, List, Tag, Button, Typography, Space, Empty, message } from 'antd';
import { ArrowLeftOutlined, UploadOutlined, EyeOutlined, ClockCircleOutlined, SendOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { subjectsApi } from '../../api';
import Loading from '../../components/Loading';
import { formatWindow } from '../../utils/format';
import DashboardHero from '../../components/DashboardHero';

export default function SubjectAssignments() {
  const { t } = useTranslation();
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  useEffect(() => {
    subjectsApi.assignments(subjectId).then(setItems).catch(() => { message.error(t('common.error')); setItems([]); });
  }, [subjectId, t]);

  if (!items) return <Loading />;

  // Same attempt rules as the main assignment list: several tries per task, the
  // best one is the grade. A submitted assignment is therefore not necessarily
  // a finished one — it stays open while tries remain.
  const attemptsOf = (a) => ({
    used: a.attempts_used ?? 0,
    left: a.attempts_left ?? 0,
    max: a.max_attempts ?? 1,
    bestId: a.best_submission_id ?? a.submission_id ?? null,
    bestScore: a.best_score ?? null,
  });

  return (
    <div style={{ maxWidth: 900 }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/student/subjects')} style={{ marginBottom: 16 }}>{t('common.back')}</Button>
      <DashboardHero title={t('nav.assignments')} />
      {items.length === 0 ? <Empty description={t('student.noAssignments')} /> : (
        <List
          dataSource={items}
          renderItem={(a) => {
            const { used, left, max, bestId, bestScore } = attemptsOf(a);
            const canSubmit = left > 0 && !a.is_expired && !a.is_upcoming;
            return (
            <Card style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <Space wrap>
                    <Typography.Text strong>{a.title}</Typography.Text>
                    <Tag>{a.assignment_type}</Tag>
                    {a.is_expired && <Tag color="red">{t('student.expired')}</Tag>}
                    {a.is_upcoming && <Tag>{t('student.notStarted')}</Tag>}
                    {used > 0 && (
                      bestScore === null || bestScore === undefined ? (
                        <Tag color="processing">{t('common.analyzing')}</Tag>
                      ) : (
                        // The best try is the mark, so that is the number shown.
                        <Tag color={bestScore >= 70 ? 'green' : bestScore >= 50 ? 'orange' : 'red'}>
                          {t('student.bestScore', { score: Math.round(bestScore) })}
                        </Tag>
                      )
                    )}
                    {used > 0 && <Tag>{t('student.attemptsUsed', { used, max })}</Tag>}
                  </Space>
                  <div><Typography.Text type="secondary">{a.description}</Typography.Text></div>
                  {(a.deadline || a.start_at) && (
                    <div style={{ marginTop: 4 }}>
                      <ClockCircleOutlined /> <Typography.Text type="secondary">{formatWindow(a.start_at, a.deadline)}</Typography.Text>
                    </div>
                  )}
                </div>
                <Space direction="vertical">
                  {/* The result stays reachable, and so does a retry: a weaker
                      attempt cannot cost the student the mark they already have. */}
                  {bestId && (
                    <Button icon={<EyeOutlined />} onClick={() => navigate(`/student/submissions/${bestId}`)}>{t('student.result')}</Button>
                  )}
                  {canSubmit && (
                    <Button
                      type="primary"
                      icon={used ? <SendOutlined /> : <UploadOutlined />}
                      onClick={() => navigate(`/student/submit/${a.id}`)}
                    >
                      {used ? t('student.retryLeft', { left }) : t('student.submit')}
                    </Button>
                  )}
                  {!canSubmit && used > 0 && left === 0 && <Tag>{t('student.noAttemptsLeft')}</Tag>}
                </Space>
              </div>
            </Card>
            );
          }}
        />
      )}
    </div>
  );
}
