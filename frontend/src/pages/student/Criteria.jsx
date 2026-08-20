import { useEffect, useState } from 'react';
import { Row, Col, Card, List, Typography, Empty, Tag, Progress, Space, Spin, Alert } from 'antd';
import { CheckCircleTwoTone, BulbOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { subjectsApi, assignmentsApi } from '../../api';
import DashboardHero from '../../components/DashboardHero';

const { Title, Paragraph, Text } = Typography;

export default function Criteria() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language; // criteria come back translated, so a switch re-fetches
  const [subjects, setSubjects] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [active, setActive] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [rubric, setRubric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingRubric, setLoadingRubric] = useState(false);

  useEffect(() => {
    Promise.all([subjectsApi.list(), subjectsApi.ratings()])
      .then(([s, r]) => { setSubjects(s); setRatings(r); })
      .finally(() => setLoading(false));
  }, []);

  // Rubrics are defined per assignment, so picking a subject lists its
  // assignments and picking one of those shows what it is actually graded on.
  useEffect(() => {
    if (!active) return;
    setAssignments([]); setActiveAssignment(null); setRubric(null);
    subjectsApi.assignments(active.id).then((list) => {
      setAssignments(list);
      if (list.length) setActiveAssignment(list[0]);
    }).catch(() => {});
  }, [active]);

  useEffect(() => {
    if (!activeAssignment) { setRubric(null); return; }
    setLoadingRubric(true);
    assignmentsApi.criteria(activeAssignment.id)
      .then(setRubric)
      .catch(() => setRubric(null))
      .finally(() => setLoadingRubric(false));
  }, [activeAssignment, lang]);

  const rating = ratings.find((r) => r.subject_id === active?.id);

  return (
    <div>
      <DashboardHero title={t('student.criteriaTitle')} />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card size="small" loading={loading}>
            <List
              dataSource={subjects}
              renderItem={(s) => (
                <List.Item
                  onClick={() => setActive(s)}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: active?.id === s.id ? '#eaf5ff' : 'transparent',
                  }}
                >
                  <List.Item.Meta
                    title={s.name}
                    description={<Text type="secondary" style={{ fontSize: 12 }}>{s.code}</Text>}
                  />
                  <Tag>{s.assignment_count}</Tag>
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} md={16}>
          {!active ? (
            <Card><Empty description={t('student.criteriaPick')} /></Card>
          ) : (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Card>
                <Title level={4} style={{ marginBottom: 4 }}>{active.name}</Title>
                {rating && (
                  <Space size="large" wrap>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('student.avgScore')}</Text>
                      <Progress percent={Math.round(rating.average_score)} size="small" style={{ width: 160 }} />
                    </div>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('student.completed')}</Text>
                      <div style={{ fontWeight: 600 }}>
                        {rating.completed_assignments}/{rating.total_assignments}
                      </div>
                    </div>
                  </Space>
                )}
              </Card>

              {assignments.length === 0 ? (
                <Card><Empty description={t('student.noAssignments')} /></Card>
              ) : (
                <>
                  <Card size="small" title={t('nav.assignments')}>
                    <Space wrap>
                      {assignments.map((a) => (
                        <Tag
                          key={a.id}
                          color={activeAssignment?.id === a.id ? 'blue' : 'default'}
                          style={{ cursor: 'pointer', padding: '4px 10px' }}
                          onClick={() => setActiveAssignment(a)}
                        >
                          {a.title}
                        </Tag>
                      ))}
                    </Space>
                  </Card>

                  <Card title={<><BulbOutlined /> {t('student.criteriaFor', { title: activeAssignment?.title || '' })}</>}>
                    {loadingRubric ? (
                      <Spin />
                    ) : !rubric ? (
                      <Empty description={t('common.empty')} />
                    ) : (
                      <>
                        <Alert
                          type="info"
                          showIcon
                          style={{ marginBottom: 12 }}
                          message={rubric.custom ? t('student.criteriaCustom') : t('student.criteriaStandard')}
                        />
                        <List
                          dataSource={rubric.criteria}
                          renderItem={(c) => (
                            <List.Item>
                              <List.Item.Meta
                                avatar={<CheckCircleTwoTone twoToneColor="var(--brand)" />}
                                title={
                                  <Space wrap>
                                    <span>{c.name}</span>
                                    <Tag color="blue">{c.weight}%</Tag>
                                    <Tag>{t('student.criteriaMax', { max: c.max_score })}</Tag>
                                  </Space>
                                }
                                description={c.description || null}
                              />
                            </List.Item>
                          )}
                        />
                        <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                          {t('student.criteriaNote')}
                        </Paragraph>
                      </>
                    )}
                  </Card>
                </>
              )}
            </Space>
          )}
        </Col>
      </Row>
    </div>
  );
}
