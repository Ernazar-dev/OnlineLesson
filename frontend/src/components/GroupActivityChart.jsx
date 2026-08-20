import { Card, Empty, Tooltip, Typography } from 'antd';
import { BarChartOutlined } from '../icons';
import { useTranslation } from 'react-i18next';

/**
 * Horizontal bar chart of group activity (submissions per group), sorted high→low.
 * Single measure across categories => one sequential blue hue, no legend needed —
 * the card title names the measure. Each row hovers a tooltip with the breakdown.
 */
export default function GroupActivityChart({ data, loading }) {
  const { t } = useTranslation();

  const rows = [...(data || [])]
    .sort((a, b) => b.submission_count - a.submission_count)
    .slice(0, 8);
  const max = Math.max(1, ...rows.map((r) => r.submission_count));
  const hasActivity = rows.some((r) => r.submission_count > 0 || r.student_count > 0);

  return (
    <Card
      title={<><BarChartOutlined style={{ marginRight: 8, color: 'var(--brand)' }} />{t('dashboard.groupActivity')}</>}
      style={{ marginTop: 16 }}
      loading={loading}
    >
      {!rows.length || !hasActivity ? (
        <Empty description={t('dashboard.noGroupData')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {rows.map((r) => {
            const pct = Math.round((r.submission_count / max) * 100);
            return (
              <Tooltip
                key={r.id}
                title={
                  <div style={{ lineHeight: 1.7 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.name}</div>
                    <div>{t('admin.submissions')}: {r.submission_count}</div>
                    <div>{t('teacher.studentCount', { count: r.student_count })}</div>
                    <div>{t('admin.activeStudents')}: {r.active_students}</div>
                  </div>
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'default' }}>
                  <Typography.Text
                    ellipsis
                    style={{ width: 120, flexShrink: 0, fontSize: 13 }}
                    title={r.name}
                  >
                    {r.name}
                  </Typography.Text>
                  <div
                    style={{
                      flex: 1,
                      height: 22,
                      background: '#f0f2f5',
                      borderRadius: 6,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        minWidth: r.submission_count > 0 ? 6 : 0,
                        height: '100%',
                        borderRadius: 6,
                        background: 'linear-gradient(90deg, var(--brand) 0%, var(--brand-light) 100%)',
                        transition: 'width .6s ease',
                      }}
                    />
                  </div>
                  <Typography.Text strong style={{ width: 34, textAlign: 'right', flexShrink: 0 }}>
                    {r.submission_count}
                  </Typography.Text>
                </div>
              </Tooltip>
            );
          })}
        </div>
      )}
    </Card>
  );
}
