import { useEffect, useState } from 'react';
import { Row, Col, Card, Tag, Empty } from 'antd';
import { FileTextOutlined, TeamOutlined } from '../../icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { assignmentsApi, teacherApi } from '../../api';
import StatCard from '../../components/StatCard';
import DashboardHero from '../../components/DashboardHero';
import GroupActivityChart from '../../components/GroupActivityChart';

export default function TeacherDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    assignmentsApi.list().then(setAssignments).catch(() => {});
    teacherApi.groups().then(setGroups).catch(() => {});
    teacherApi.groupActivity().then(setActivity).catch(() => setActivity([]));
  }, []);

  return (
    <div>
      <DashboardHero title={t('teacher.cabinet')} />
      <Row gutter={[16, 16]} className="stagger-grid">
        <Col xs={24} sm={12}><StatCard title={t('teacher.myAssignments')} value={assignments.length} prefix={<FileTextOutlined />} /></Col>
        <Col xs={24} sm={12}><StatCard title={t('teacher.myGroups')} value={groups.length} prefix={<TeamOutlined />} color="#2f54eb" /></Col>
      </Row>
      <GroupActivityChart data={activity} loading={activity === null} />
      <Card title={t('teacher.recentAssignments')} style={{ marginTop: 16 }} extra={<a onClick={() => navigate('/teacher/assignments')}>{t('common.all')}</a>}>
        {assignments.length ? (
          <div>
            {assignments.slice(0, 6).map((a, i) => (
              <div
                key={a.id}
                className="dash-row premium-enter"
                data-clickable
                style={{ animationDelay: `${i * 0.04}s` }}
                onClick={() => navigate(`/teacher/assignments/${a.id}/submissions`)}
              >
                <div
                  className="dash-row-icon"
                  style={{
                    color: a.is_expired ? 'var(--error)' : 'var(--success)',
                    background: a.is_expired ? 'rgba(240,68,56,0.12)' : 'rgba(18,183,106,0.12)',
                  }}
                >
                  <FileTextOutlined />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dash-row-title">{a.title}</div>
                  <div className="dash-row-meta">{`${a.course || t('common.general')} · ${a.group_name || t('common.noGroup')}`}</div>
                </div>
                {a.is_expired ? <Tag color="red">{t('student.expired')}</Tag> : <Tag color="green">{t('teacher.active')}</Tag>}
              </div>
            ))}
          </div>
        ) : <Empty description={t('teacher.noAssignments')} />}
      </Card>
    </div>
  );
}
