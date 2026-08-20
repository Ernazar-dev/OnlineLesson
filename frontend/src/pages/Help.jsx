import { Card, Collapse, Typography, Table, Tag, Alert, Space } from 'antd';
import { QuestionCircleOutlined } from '../icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/auth';
import DashboardHero from '../components/DashboardHero';

const { Paragraph, Title } = Typography;

/** The 5-point scale table the reference platform documents for every role. */
function GradeScale({ t }) {
  const rows = [
    { key: 5, grade: '5 (90-100%)', color: 'green', desc: t('help.g5') },
    { key: 4, grade: '4 (70-89%)', color: 'cyan', desc: t('help.g4') },
    { key: 3, grade: '3 (50-69%)', color: 'gold', desc: t('help.g3') },
    { key: 2, grade: '2 (20-49%)', color: 'orange', desc: t('help.g2') },
    { key: 1, grade: '1 (0-19%)', color: 'red', desc: t('help.g1') },
  ];
  return (
    <Table
      size="small"
      pagination={false}
      dataSource={rows}
      columns={[
        { title: t('help.grade'), dataIndex: 'grade', width: 140, render: (v, r) => <Tag color={r.color}>{v}</Tag> },
        { title: t('common.description'), dataIndex: 'desc' },
      ]}
    />
  );
}

function Bullets({ items }) {
  return <ul style={{ paddingLeft: 20, margin: 0 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

export default function Help() {
  const { t } = useTranslation();
  const { role } = useAuth();

  const studentPanels = [
    { key: 'q1', label: t('help.q1'), children: <Paragraph>{t('help.a1')}</Paragraph> },
    {
      key: 'q2',
      label: t('help.q2'),
      children: <Bullets items={[t('help.a2_1'), t('help.a2_2'), t('help.a2_3'), t('help.a2_4')]} />,
    },
    {
      key: 'q3',
      label: t('help.q3'),
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <strong style={{ color: '#cf1322' }}>{t('help.lowers')}</strong>
            <Bullets items={[t('help.l1'), t('help.l2'), t('help.l3')]} />
          </div>
          <div>
            <strong style={{ color: '#389e0d' }}>{t('help.raises')}</strong>
            <Bullets items={[t('help.r1'), t('help.r2'), t('help.r3')]} />
          </div>
        </Space>
      ),
    },
    { key: 'scale', label: t('help.gradeScale'), children: <GradeScale t={t} /> },
  ];

  const teacherPanels = [
    {
      key: 'tq1',
      label: t('help.teacherQ1'),
      children: <Bullets items={[t('help.tc1'), t('help.tc2'), t('help.tc3')]} />,
    },
    {
      key: 'tq2',
      label: t('help.principles'),
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Bullets items={[t('help.p1'), t('help.p2'), t('help.p3')]} />
          <Alert type="warning" showIcon message={t('help.strict1')} />
          <Alert type="warning" showIcon message={t('help.strict2')} />
        </Space>
      ),
    },
    { key: 'scale', label: t('help.gradeScale'), children: <GradeScale t={t} /> },
  ];

  const adminPanels = [
    {
      key: 'logic',
      label: t('help.adminLogic'),
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Paragraph>{t('help.adminIntro')}</Paragraph>
          <Bullets items={[t('help.roleAdmin'), t('help.roleTeacher'), t('help.roleStudent')]} />
        </Space>
      ),
    },
    {
      key: 'groups',
      label: t('help.groupsTitle'),
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <strong>{t('help.groupsHowCreate')}</strong>
            <Paragraph style={{ marginBottom: 0 }}>{t('help.groupsHowCreateA')}</Paragraph>
          </div>
          <div>
            <strong>{t('help.groupsHowAdd')}</strong>
            <Paragraph style={{ marginBottom: 0 }}>{t('help.groupsHowAddA')}</Paragraph>
          </div>
        </Space>
      ),
    },
    { key: 'scale', label: t('help.gradeScale'), children: <GradeScale t={t} /> },
  ];

  const items =
    role === 'admin' ? adminPanels : role === 'teacher' ? teacherPanels : studentPanels;

  return (
    <div>
      <DashboardHero title={<><QuestionCircleOutlined /> {t('help.title')}</>} />
      <Card bordered={false} className="shadow-sm" style={{ borderRadius: 16 }}>
        <Collapse accordion defaultActiveKey={[items[0].key]} items={items} />
      </Card>
    </div>
  );
}
