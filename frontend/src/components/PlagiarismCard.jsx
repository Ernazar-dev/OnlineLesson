import { Card, Alert, Progress, Tag, Collapse, Typography, Space, Empty, Button } from 'antd';
import { SafetyCertificateOutlined, WarningOutlined, ReloadOutlined } from '../icons';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../utils/format';

// How each verdict band is presented. `alert` drives the banner, `color` the
// percentage ring — red is reserved for findings that actually cost marks, so a
// student working legitimately from the same textbook is never shown a red card.
const BANDS = {
  clean: { alert: 'success', color: '#12b76a' },
  low: { alert: 'info', color: 'var(--brand)' },
  moderate: { alert: 'warning', color: '#f79009' },
  high: { alert: 'error', color: '#f04438' },
  duplicate: { alert: 'error', color: '#f04438' },
  too_short: { alert: 'info', color: '#8c8c8c' },
  skipped: { alert: 'info', color: '#8c8c8c' },
};

/**
 * The originality result for one submission.
 *
 * `staff` (teacher/admin) additionally sees whose work was matched and what
 * that student wrote; a student sees only their own matched passages, because
 * naming a classmate is a conversation for the teacher to have, not an
 * automatic accusation delivered to another student.
 */
export default function PlagiarismCard({ plagiarism, staff = false, onRecheck, rechecking = false }) {
  const { t } = useTranslation();
  // Nothing to show and nothing to do — a student looking at work that predates
  // the check sees no empty card.
  if (!plagiarism && !onRecheck) return null;

  const status = plagiarism?.status || 'skipped';
  const band = BANDS[status] || BANDS.skipped;
  const score = plagiarism?.score;
  const measured = score !== null && score !== undefined;
  const matches = plagiarism?.matches || [];
  const penalty = plagiarism?.penalty || 0;

  return (
    <Card
      style={{ marginBottom: 16 }}
      title={
        <Space>
          {status === 'clean' || !measured ? <SafetyCertificateOutlined /> : <WarningOutlined />}
          {t('plagiarism.title')}
        </Space>
      }
      extra={
        <Space>
          {measured && (
            <Tag color={band.alert === 'success' ? 'green' : band.alert === 'error' ? 'red' : band.alert === 'warning' ? 'orange' : 'blue'}>
              {t(`plagiarism.status.${status}`)}
            </Tag>
          )}
          {onRecheck && (
            <Button size="small" icon={<ReloadOutlined />} loading={rechecking} onClick={onRecheck}>
              {t('plagiarism.recheck')}
            </Button>
          )}
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space align="center" size="large" wrap>
          {measured && (
            <Progress
              type="circle"
              size={92}
              percent={Math.round(score)}
              strokeColor={band.color}
              format={(p) => `${p}%`}
            />
          )}
          <div style={{ flex: 1, minWidth: 240 }}>
            <Alert
              type={band.alert}
              showIcon
              message={t(`plagiarism.message.${status}`, { percent: Math.round(score || 0) })}
              description={
                penalty > 0 ? t('plagiarism.penalty', { penalty: penalty.toFixed(1) }) : undefined
              }
            />
          </div>
        </Space>

        {plagiarism?.checked_at && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('plagiarism.checkedAt', { date: formatDateTime(plagiarism.checked_at) })}
          </Typography.Text>
        )}

        {matches.length > 0 && (
          <div>
            <Typography.Text strong>{t('plagiarism.matchesHeading')}</Typography.Text>
            <Collapse
              style={{ marginTop: 8 }}
              items={matches.map((m, i) => ({
                key: String(m.id ?? i),
                label: (
                  <Space wrap>
                    <span style={{ fontWeight: 500 }}>
                      {/* Students see "an earlier submission"; staff see who. */}
                      {staff ? m.student_name || t('plagiarism.unknownStudent') : t('plagiarism.anotherWork')}
                    </span>
                    <Tag color={m.similarity >= 70 ? 'red' : m.similarity >= 40 ? 'orange' : 'blue'}>
                      {Math.round(m.similarity)}%
                    </Tag>
                    {m.verdict && <Tag>{t(`plagiarism.verdict.${m.verdict}`, m.verdict)}</Tag>}
                  </Space>
                ),
                children: (
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    {staff && (m.assignment_title || m.matched_at) && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {[m.assignment_title, m.matched_at && formatDateTime(m.matched_at)]
                          .filter(Boolean)
                          .join(' · ')}
                      </Typography.Text>
                    )}
                    {m.explanation && <Typography.Paragraph style={{ marginBottom: 0 }}>{m.explanation}</Typography.Paragraph>}

                    {/* How the two figures were reached — a high literal overlap
                        means pasted text, a high AI figure with low overlap means
                        the work was reworded. Only staff need that distinction. */}
                    {staff && (m.lexical_similarity != null || m.ai_similarity != null) && (
                      <Space size="small" wrap>
                        {m.lexical_similarity != null && (
                          <Tag>{t('plagiarism.literalOverlap', { percent: Math.round(m.lexical_similarity) })}</Tag>
                        )}
                        {m.ai_similarity != null && (
                          <Tag>{t('plagiarism.aiEstimate', { percent: Math.round(m.ai_similarity) })}</Tag>
                        )}
                      </Space>
                    )}

                    {(m.snippets || []).length > 0 && (
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {t('plagiarism.passages')}
                        </Typography.Text>
                        {(m.snippets || []).map((s, k) => (
                          <div
                            key={k}
                            style={{
                              marginTop: 6, padding: '8px 12px', borderLeft: '3px solid #ffbb96',
                              background: '#fff7f0', borderRadius: 4, fontSize: 12,
                            }}
                          >
                            <Typography.Text italic>“{s.suspect}”</Typography.Text>
                            {staff && s.source && s.source !== s.suspect && (
                              <>
                                <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
                                  {t('plagiarism.inTheOtherWork')}
                                </Typography.Text>
                                <Typography.Text italic type="secondary">“{s.source}”</Typography.Text>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Space>
                ),
              }))}
            />
          </div>
        )}

        {measured && status !== 'clean' && !matches.length && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('plagiarism.noMatchDetail')} />
        )}
      </Space>
    </Card>
  );
}
