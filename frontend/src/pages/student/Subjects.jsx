import { useEffect, useState } from 'react';
import { Row, Col, Card, Empty, Badge } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { subjectsApi } from '../../api';
import { mediaUrl } from '../../api/client';
import Loading from '../../components/Loading';
import DashboardHero from '../../components/DashboardHero';
import { getSubjectVisual } from '../../utils/subjectVisual';

export default function StudentSubjects() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState(null);

  useEffect(() => { subjectsApi.list().then(setSubjects).catch(() => setSubjects([])); }, []);
  if (!subjects) return <Loading />;

  return (
    <div>
      <DashboardHero title={t('nav.subjects')} />
      {subjects.length === 0 && <Empty description={t('student.noSubjectsWithTasks')} />}
      <Row gutter={[16, 16]}>
        {subjects.map((s) => {
          // An admin can set a real picture for a subject on /admin/subjects;
          // until one is set, the cover is built from the name instead — same
          // "picture on top, name below" card shape as the Literature list.
          const { Icon, gradient } = getSubjectVisual(s.name);
          return (
            <Col xs={24} sm={12} lg={8} key={s.id}>
              <Badge.Ribbon text={t('student.taskShort', { count: s.assignment_count })} color="blue">
                <Card
                  hoverable
                  className="card-hover"
                  bordered={false}
                  style={{ borderRadius: 16, overflow: 'hidden' }}
                  styles={{ body: { padding: '14px 16px' } }}
                  onClick={() => navigate(`/student/subjects/${s.id}`)}
                  cover={
                    s.image_url ? (
                      <img
                        alt={s.name}
                        src={mediaUrl(s.image_url)}
                        style={{ height: 128, width: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          height: 128, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: gradient,
                        }}
                      >
                        <Icon className="stat-icon" weight="duotone" style={{ fontSize: 48, color: '#fff' }} />
                      </div>
                    )
                  }
                >
                  <Card.Meta
                    title={<div style={{ textAlign: 'center', fontWeight: 700, fontSize: 16 }}>{s.name}</div>}
                    description={s.code ? <div style={{ textAlign: 'center' }}>{s.code}</div> : null}
                  />
                </Card>
              </Badge.Ribbon>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}
