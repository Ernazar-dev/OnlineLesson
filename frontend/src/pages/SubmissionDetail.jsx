import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Progress, Collapse, Tag, Button, Typography, Descriptions, Space, message, Empty, Spin,
  InputNumber, Input, Alert,
} from 'antd';
import { DownloadOutlined, ArrowLeftOutlined, ReloadOutlined, EditOutlined, FileTextOutlined } from '../icons';
import { useTranslation } from 'react-i18next';
import { assignmentsApi } from '../api';
import { useAuth } from '../store/auth';
import Loading from '../components/Loading';
import PlagiarismCard from '../components/PlagiarismCard';
import { apiError, formatDateTime } from '../utils/format';

const scoreColor = (s) => (s >= 85 ? '#12b76a' : s >= 70 ? '#1c9de9' : s >= 50 ? '#f79009' : '#f04438');
const POLL_MS = 5000; // auto-refresh interval while AI grading runs in the background

/** "gemini:gemini-3.5-flash" means nothing to a student — say what happened. */
function gradedByLabel(engine, t) {
  if (engine === 'error') return t('detail.gradedByError');
  if (engine === 'quality-check') return t('detail.gradedByNoContent');
  if (engine === 'format-unreadable') return t('detail.gradedByUnreadable');
  if (engine?.startsWith('gemini:')) return t('detail.gradedByAi');
  return t('detail.gradedByBasic');
}

export default function SubmissionDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [review, setReview] = useState(null); // { score, comment } while editing
  const [saving, setSaving] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [openingWork, setOpeningWork] = useState(false);

  const canReview = user?.role === 'teacher' || user?.role === 'admin';

  // `background` = silent poll (no full-page spinner), used by the auto-refresh timer.
  const load = useCallback(
    (background = false) => {
      if (background) setRefreshing(true);
      else setLoading(true);
      return assignmentsApi
        .submissionDetail(id)
        .then(setData)
        .catch(() => { if (!background) message.error(t('detail.loadError')); })
        .finally(() => { setLoading(false); setRefreshing(false); });
    },
    [id, t]
  );

  useEffect(() => { load(); }, [load]);

  // While the submission is still processing, poll automatically so the result
  // appears on its own — no manual refresh needed.
  const processingRef = useRef(false);
  processingRef.current = data ? data.overall_score === null || data.overall_score === undefined : true;
  useEffect(() => {
    const timer = setInterval(() => {
      if (processingRef.current) load(true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const exportPdf = async () => {
    try {
      const blob = await assignmentsApi.exportPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Report_${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { message.error(t('detail.exportError')); }
  };

  // Opens the file the student actually submitted (not the AI-generated PDF
  // report) in a new tab — a PDF or image renders inline, anything else the
  // browser can't preview falls back to its own download prompt.
  const viewStudentWork = async () => {
    setOpeningWork(true);
    try {
      const blob = await assignmentsApi.downloadFile(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      message.error(t('detail.studentWorkMissing'));
    } finally { setOpeningWork(false); }
  };

  const saveReview = async () => {
    setSaving(true);
    try {
      await assignmentsApi.review(id, { score: review.score, comment: review.comment });
      message.success(t('detail.reviewSaved'));
      setReview(null);
      await load(true);
    } catch (e) {
      message.error(apiError(e, t('common.error')));
    } finally { setSaving(false); }
  };

  // Work handed in before the originality check existed has never been compared,
  // and a copy only becomes provable once the work it was taken from is also in
  // the corpus — so a teacher can always ask for the comparison to be re-run.
  const recheck = async () => {
    setRechecking(true);
    try {
      await assignmentsApi.recheckPlagiarism(id);
      await load(true);
      message.success(t('plagiarism.recheckDone'));
    } catch (e) {
      message.error(apiError(e, t('common.error')));
    } finally { setRechecking(false); }
  };

  if (loading) return <Loading />;
  if (!data) return <Empty description={t('detail.notFound')} />;

  const processing = data.overall_score === null || data.overall_score === undefined;
  const finalScore = data.final_score ?? data.overall_score;
  const corrected = data.teacher_score !== null && data.teacher_score !== undefined;

  return (
    <div style={{ maxWidth: 900 }}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>{t('common.back')}</Button>
        <Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => load(true)}>{t('common.refresh')}</Button>
        <Button type="primary" icon={<DownloadOutlined />} onClick={exportPdf} disabled={processing}>{t('common.pdfReport')}</Button>
        {data.has_file && (
          <Button icon={<FileTextOutlined />} loading={openingWork} onClick={viewStudentWork}>
            {t('detail.studentWork')}
          </Button>
        )}
        {canReview && !processing && !review && (
          <Button
            icon={<EditOutlined />}
            onClick={() => setReview({ score: finalScore, comment: data.teacher_comment || '' })}
          >
            {t('detail.correctScore')}
          </Button>
        )}
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions title={data.assignment_title} column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label={t('common.student')}>{data.student_name}</Descriptions.Item>
          <Descriptions.Item label={t('detail.submittedAt')}>
            {formatDateTime(data.submitted_at)}
          </Descriptions.Item>
          {data.max_attempts > 1 && (
            <Descriptions.Item label={t('student.attempt')}>
              <Space size={4} wrap>
                <Tag>{t('student.attemptN', { n: data.attempt || 1, max: data.max_attempts })}</Tag>
                {data.is_best
                  ? <Tag color="green">{t('student.counts')}</Tag>
                  : <Tag color="default">{t('student.notCounted')}</Tag>}
              </Space>
            </Descriptions.Item>
          )}
        </Descriptions>

        {/* Switching between tries. Sibling attempts sit under the same route
            whichever role is viewing, so the link is resolved relative to this
            page rather than hardcoded to /student or /teacher. */}
        {(data.attempts || []).length > 1 && (
          <Space size={4} wrap style={{ marginTop: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('student.allAttempts')}
            </Typography.Text>
            {data.attempts.map((a) => (
              <Tag
                key={a.id}
                color={a.id === data.id ? 'blue' : a.is_best ? 'green' : 'default'}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`../${a.id}`, { relative: 'path' })}
              >
                {t('student.attemptShort', { n: a.attempt || 1 })}
                {a.score === null || a.score === undefined ? ' · …' : ` · ${Math.round(a.score)}`}
              </Tag>
            ))}
          </Space>
        )}

        {/* Only the best attempt is graded, so a student looking at a weaker try
            is told so plainly — and taken to the one that counts. */}
        {data.is_best === false && data.best_submission_id && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message={t('student.betterAttempt', { score: Math.round(data.best_score ?? 0) })}
            action={
              <Button
                size="small"
                onClick={() => navigate(`../${data.best_submission_id}`, { relative: 'path' })}
              >
                {t('student.openBest')}
              </Button>
            }
          />
        )}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          {processing ? (
            <Space direction="vertical" size="small">
              <Spin />
              <Typography.Text type="secondary">{t('detail.processing')}</Typography.Text>
            </Space>
          ) : (
            <Space direction="vertical" align="center" size="small">
              <Progress
                type="dashboard"
                percent={Math.round(finalScore)}
                strokeColor={scoreColor(finalScore)}
                format={(p) => `${p}/100`}
              />
              {corrected && (
                <Tag color="purple">
                  {t('detail.teacherCorrected', { ai: Math.round(data.overall_score) })}
                </Tag>
              )}
              {/* The AI grade already has the originality deduction taken off,
                  so the mark is never explained without saying why it dropped. */}
              {!corrected && data.plagiarism?.penalty > 0 && (
                <Tag color="red">
                  {t('plagiarism.deducted', { penalty: data.plagiarism.penalty.toFixed(1) })}
                </Tag>
              )}
            </Space>
          )}
        </div>
      </Card>

      {canReview && review && (
        <Card title={t('detail.correctScore')} style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert type="info" showIcon message={t('detail.reviewHint')} />
            <Space>
              <span>{t('common.score')}:</span>
              <InputNumber
                min={0}
                max={100}
                value={review.score}
                onChange={(v) => setReview((r) => ({ ...r, score: v }))}
              />
              <span>/ 100</span>
            </Space>
            <Input.TextArea
              rows={3}
              placeholder={t('detail.reviewCommentPlaceholder')}
              value={review.comment}
              onChange={(e) => setReview((r) => ({ ...r, comment: e.target.value }))}
            />
            <Space>
              <Button type="primary" loading={saving} onClick={saveReview}>{t('common.save')}</Button>
              <Button onClick={() => setReview(null)}>{t('common.cancel')}</Button>
              {corrected && (
                <Button
                  danger
                  onClick={async () => {
                    await assignmentsApi.review(id, { score: null, comment: '' });
                    setReview(null);
                    load(true);
                  }}
                >
                  {t('detail.reviewReset')}
                </Button>
              )}
            </Space>
          </Space>
        </Card>
      )}

      {!processing && (
        <>
          {/* Originality sits above the marks: if the work was copied, that is
              the first thing a teacher needs to know about the grade below. */}
          <PlagiarismCard
            plagiarism={data.plagiarism}
            staff={canReview}
            onRecheck={canReview ? recheck : undefined}
            rechecking={rechecking}
          />

          {corrected && data.teacher_comment && (
            <Card title={t('detail.teacherComment')} style={{ marginBottom: 16 }}>
              <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                {data.teacher_comment}
              </Typography.Paragraph>
            </Card>
          )}

          <Card
            title={t('detail.sectionScores')}
            style={{ marginBottom: 16 }}
            extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('detail.expandHint')}</Typography.Text>}
          >
            {/* Collapsed by default: nine sections would otherwise fill the page.
                The header carries the score at a glance; expanding shows the
                student's own answer, the AI feedback, and the cited evidence. */}
            <Collapse
              accordion
              items={(data.sections || []).map((s, i) => {
                const answer = (s.content || '')
                  .replace('[Image uploaded]', '')
                  .trim();
                return {
                  key: String(i),
                  label: (
                    <Space wrap>
                      <span style={{ fontWeight: 500 }}>{s.section_name}</span>
                      <Tag color={scoreColor((s.score / (s.max_score || 100)) * 100)}>
                        {Math.round(s.score)}/{s.max_score || 100}
                      </Tag>
                      {s.weight != null && <Tag>{s.weight}%</Tag>}
                    </Space>
                  ),
                  children: (
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      {/* What the student actually wrote for this section. */}
                      <div>
                        <Typography.Text strong style={{ fontSize: 12 }}>
                          {t('detail.studentAnswer')}
                        </Typography.Text>
                        <Typography.Paragraph
                          type={answer ? undefined : 'secondary'}
                          italic={!answer}
                          style={{
                            whiteSpace: 'pre-wrap', marginBottom: 0, marginTop: 4,
                            padding: '8px 12px', background: '#f7f9fc', borderRadius: 4,
                          }}
                        >
                          {answer || t('detail.noAnswerGiven')}
                        </Typography.Paragraph>
                      </div>

                      {/* The AI's justification for the mark. */}
                      {s.feedback && (
                        <Typography.Text type="secondary">{s.feedback}</Typography.Text>
                      )}

                      {/* The quote the grader based this score on — makes the mark
                          checkable rather than something to trust. */}
                      {s.evidence && (
                        <div
                          style={{
                            padding: '8px 12px', borderLeft: '3px solid #b9d2e8',
                            background: '#fafcff', borderRadius: 4, fontSize: 12,
                          }}
                        >
                          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                            {t('detail.evidence')}
                          </Typography.Text>
                          <Typography.Text italic>“{s.evidence}”</Typography.Text>
                        </div>
                      )}
                    </Space>
                  ),
                };
              })}
            />
          </Card>

          <Card
            title={t('detail.aiSummary')}
            extra={
              data.graded_by && (
                // Students see what graded their work, not which model did it.
                // The raw engine id stays available to staff, who need it to
                // tell a real grading apart from a fallback.
                <Tag
                  className={data.graded_by.startsWith('gemini:') ? 'ai-tag' : undefined}
                  title={canReview ? data.graded_by : undefined}
                >
                  {gradedByLabel(data.graded_by, t)}
                </Tag>
              )
            }
          >
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
              {data.ai_feedback_summary || t('detail.noSummary')}
            </Typography.Paragraph>
          </Card>
        </>
      )}
    </div>
  );
}
