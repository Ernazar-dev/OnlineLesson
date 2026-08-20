import { useEffect, useState } from 'react';
import { Row, Col, Card, Table, Tag, Button, Empty } from 'antd';
import {
  FileTextOutlined, FileDoneOutlined, ClockCircleOutlined, TrophyOutlined, SendOutlined,
} from '../../icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { subjectsApi, assignmentsApi } from '../../api';
import StatCard from '../../components/StatCard';
import DashboardHero from '../../components/DashboardHero';
import { useAuth } from '../../store/auth';
import { formatWindow } from '../../utils/format';
import useIsMobile from '../../hooks/useIsMobile';

export default function StudentDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [assignments, setAssignments] = useState([]);
  const [subs, setSubs] = useState([]);
  const [ratings, setRatings] = useState([]);

  useEffect(() => {
    assignmentsApi.list().then(setAssignments).catch(() => {});
    assignmentsApi.mySubmissions().then(setSubs).catch(() => {});
    subjectsApi.ratings().then(setRatings).catch(() => {});
  }, []);

  // Still actionable = tries left, not just "never submitted". A student with a
  // weak first attempt and two tries in hand still has work to do here.
  const active = assignments.filter((a) => !a.is_expired && (a.attempts_left ?? 1) > 0);
  const waiting = subs.filter((s) => !s.is_graded);
  // One score per assignment — the attempt that counts — so retrying a task
  // cannot drag a student's own average down.
  const graded = subs.filter((s) => s.is_graded && s.is_best !== false);
  const avgScore = graded.length
    ? Math.round(graded.reduce((a, b) => a + (b.final_score ?? b.overall_score ?? 0), 0) / graded.length)
    : 0;

  return (
    <div>
      <DashboardHero title={t('student.greeting', { name: user?.full_name || user?.username })} />

      <Row gutter={[16, 16]} className="stagger-grid">
        <Col xs={12} lg={6}>
          <StatCard title={t('student.statActive')} value={active.length} prefix={<FileTextOutlined />} />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard title={t('student.statSubmitted')} value={subs.length} prefix={<FileDoneOutlined />} />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard title={t('student.statWaiting')} value={waiting.length} prefix={<ClockCircleOutlined />} color="#f79009" />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard title={t('student.avgScore')} value={avgScore} suffix="/100" prefix={<TrophyOutlined />} color="#12b76a" />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card
            title={t('student.availableTop')}
            extra={<a onClick={() => navigate('/student/assignments')}>{t('common.all')}</a>}
          >
            {isMobile ? (
              active.length ? (
                <div>
                  {active.slice(0, 5).map((r, i) => (
                    <div
                      key={r.id}
                      className="dash-row premium-enter"
                      data-clickable
                      style={{ animationDelay: `${i * 0.04}s` }}
                      onClick={() => navigate(`/student/submit/${r.id}`)}
                    >
                      <div className="dash-row-icon" style={{ color: 'var(--brand)', background: 'rgba(var(--brand-rgb),0.12)' }}>
                        <FileTextOutlined />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="dash-row-title">{r.title}</div>
                        <div className="dash-row-meta">{formatWindow(r.start_at, r.deadline)}</div>
                      </div>
                      <Button
                        size="small"
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={(e) => { e.stopPropagation(); navigate(`/student/submit/${r.id}`); }}
                      />
                    </div>
                  ))}
                </div>
              ) : <Empty description={t('student.noAssignments')} style={{ padding: '20px 0' }} />
            ) : (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={active.slice(0, 5)}
                locale={{ emptyText: t('student.noAssignments') }}
                columns={[
                  { title: t('common.title'), dataIndex: 'title', ellipsis: true },
                  {
                    title: t('student.deadline'),
                    dataIndex: 'deadline',
                    width: 190,
                    render: (_, r) => formatWindow(r.start_at, r.deadline),
                  },
                  {
                    title: t('student.action'),
                    width: 120,
                    render: (_, r) => (
                      <Button
                        size="small"
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={() => navigate(`/student/submit/${r.id}`)}
                      >
                        {t('student.submit')}
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title={`${t('student.yourResults')} (${subs.length})`}
            extra={<a onClick={() => navigate('/student/submissions')}>{t('common.all')}</a>}
          >
            {isMobile ? (
              subs.length ? (
                <div>
                  {subs.slice(0, 5).map((r, i) => (
                    <div
                      key={r.id}
                      className="dash-row premium-enter"
                      data-clickable
                      style={{ animationDelay: `${i * 0.04}s` }}
                      onClick={() => navigate(`/student/submissions/${r.id}`)}
                    >
                      <div
                        className="dash-row-icon"
                        style={{
                          color: r.is_graded ? 'var(--success)' : 'var(--warning)',
                          background: r.is_graded ? 'rgba(18,183,106,0.12)' : 'rgba(247,144,9,0.12)',
                        }}
                      >
                        <FileDoneOutlined />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="dash-row-title">{r.assignment_title}</div>
                      </div>
                      {r.is_graded ? (
                        <Tag color={r.overall_score >= 50 ? 'green' : 'orange'}>{Math.round(r.overall_score)}</Tag>
                      ) : (
                        <Tag color="processing">{t('common.analyzing')}</Tag>
                      )}
                    </div>
                  ))}
                </div>
              ) : <Empty description={t('student.noWork')} style={{ padding: '20px 0' }} />
            ) : (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={subs.slice(0, 5)}
                locale={{ emptyText: t('student.noWork') }}
                columns={[
                  { title: t('common.title'), dataIndex: 'assignment_title', ellipsis: true },
                  {
                    title: t('common.score'),
                    width: 90,
                    render: (_, r) =>
                      r.is_graded ? (
                        <Tag color={r.overall_score >= 50 ? 'green' : 'orange'}>{Math.round(r.overall_score)}</Tag>
                      ) : (
                        <Tag color="processing">{t('common.analyzing')}</Tag>
                      ),
                  },
                  {
                    title: t('student.details'),
                    width: 90,
                    render: (_, r) => (
                      <Button type="link" size="small" onClick={() => navigate(`/student/submissions/${r.id}`)}>
                        {t('common.open')}
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
