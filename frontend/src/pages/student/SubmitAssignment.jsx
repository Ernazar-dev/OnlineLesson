import { useState, useRef, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Button, Typography, message, Upload, Tag, Spin, Row, Col, Alert,
} from 'antd';
import {
  ArrowLeftOutlined, ArrowRightOutlined, SendOutlined, InboxOutlined,
  PictureOutlined, SafetyOutlined,
} from '../../icons';
import { useTranslation } from 'react-i18next';
import { assignmentsApi, settingsApi } from '../../api';
import { useAuth } from '../../store/auth';
import Loading from '../../components/Loading';
import UserAvatar from '../../components/UserAvatar';
import { apiError } from '../../utils/format';

const { Dragger } = Upload;

export default function SubmitAssignment() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [rubric, setRubric] = useState(null); // { custom, criteria: [...] }
  const [rubricFailed, setRubricFailed] = useState(false);
  const [assignment, setAssignment] = useState(null); // carries the attempt state
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [flowchart, setFlowchart] = useState(null);
  const [flowchartUrl, setFlowchartUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const flowchartInput = useRef(null);
  // The admin's "Maks. fayl hajmi (MB)" setting — read once so the hint text
  // and the client-side check below match whatever the admin currently has
  // it set to, instead of a hardcoded number that drifted from it. 50 is
  // just the fallback while this hasn't loaded yet / if it fails.
  const [maxFileMb, setMaxFileMb] = useState(50);
  useEffect(() => {
    settingsApi.public().then((s) => setMaxFileMb(s.max_file_size || 50)).catch(() => {});
  }, []);

  // The wizard must ask for exactly what the work will be graded on, so the
  // questions come from the assignment's rubric rather than a fixed list.
  useEffect(() => {
    let alive = true;
    assignmentsApi
      .criteria(assignmentId)
      .then((r) => { if (alive) setRubric(r); })
      .catch(() => {
        // Falling back to the standard sections still produces a valid
        // submission — better than blocking the student on a failed lookup.
        if (alive) { setRubric({ custom: false, criteria: [] }); setRubricFailed(true); }
      });
    // How many tries the student has already spent. Worth knowing before they
    // start writing, not only when the server refuses the fourth one.
    assignmentsApi
      .get(assignmentId)
      .then((a) => { if (alive) setAssignment(a); })
      .catch(() => {});
    return () => { alive = false; };
    // `lang`: the rubric arrives in the caller's language, so switching it must
    // re-read the questions. Answers are keyed by the (language-independent)
    // criterion key, so nothing the student has written is lost.
  }, [assignmentId, lang]);

  const attemptNo = (assignment?.attempts_used ?? 0) + 1;
  const maxAttempts = assignment?.max_attempts ?? 1;
  const noAttemptsLeft = assignment ? (assignment.attempts_left ?? 1) <= 0 : false;

  const custom = !!rubric?.custom;

  // The submission screen is file-upload only: no written answers, whether
  // the assignment uses the 9 standard criteria or a teacher's own rubric.
  // The AI grades every criterion straight off the uploaded file and
  // flowchart, so there is never anything for the student to type.
  const fields = useMemo(() => {
    if (!rubric || !custom) return [];
    return rubric.criteria.map((c) => ({
      key: c.key,
      title: c.name,
      hint: c.description || '',
      weight: c.weight,
      max: c.max_score,
    }));
  }, [rubric, custom]);

  // Step 0 = upload, step 1 = review. No per-criterion text steps.
  const totalSteps = 2;
  const isUpload = step === 0;
  const isReview = step === totalSteps - 1;

  const pickFlowchart = (f) => {
    setFlowchart(f);
    setFlowchartUrl(URL.createObjectURL(f));
    return false;
  };

  const next = () => {
    if (isUpload && !file) return message.error(t('submit.needMainFile'));
    if (isReview) return finalize();
    setStep((s) => s + 1);
  };

  const finalize = async () => {
    setSubmitting(true);
    const fd = new FormData();
    fd.append('file', file);
    if (flowchart) fd.append('flowchart_image', flowchart);
    try {
      const res = await assignmentsApi.submit(assignmentId, fd);
      navigate(`/student/submissions/${res.submission_id}`);
    } catch (e) {
      message.error(apiError(e, t('submit.sendError')));
      setSubmitting(false);
    }
  };

  const dots = useMemo(
    () =>
      Array.from({ length: totalSteps }, (_, i) => (
        <span
          key={i}
          style={{
            height: 4,
            flex: 1,
            borderRadius: 4,
            background: i < step ? '#12b76a' : i === step ? 'var(--brand)' : '#e3ebf7',
            transition: 'background 0.25s ease',
          }}
        />
      )),
    [step, totalSteps]
  );

  const flowchartPicker = (
    <div
      onClick={() => flowchartInput.current?.click()}
      style={{
        border: '1px dashed #b9d2e8', borderRadius: 10, padding: 32,
        textAlign: 'center', cursor: 'pointer', background: '#fafcff',
      }}
    >
      <input
        ref={flowchartInput}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && pickFlowchart(e.target.files[0])}
      />
      {flowchartUrl ? (
        <img src={flowchartUrl} alt="flowchart" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 10 }} />
      ) : (
        <>
          <PictureOutlined style={{ fontSize: 32, color: 'var(--brand)' }} />
          <div style={{ fontWeight: 600, marginTop: 12 }}>{t('submit.flowchartUpload')}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('submit.flowchartFormats')}
          </Typography.Text>
        </>
      )}
    </div>
  );

  if (!rubric) return <Loading />;

  return (
    <Row gutter={[16, 16]}>
      {/* ---- Student card (left rail) ---------------------------------- */}
      <Col xs={24} lg={6}>
        <Card style={{ position: 'sticky', top: 80, textAlign: 'center' }}>
          <UserAvatar name={user?.full_name || user?.username} src={user?.avatar_url} size={88} style={{ fontSize: 30 }} />
          <Typography.Title level={5} style={{ marginTop: 12, marginBottom: 0 }}>
            {user?.full_name || user?.username}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            ID {user?.id}
          </Typography.Text>
          <div style={{ marginTop: 12 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {t('submit.currentCourse')}
            </Typography.Text>
            <Tag color="blue" style={{ marginTop: 4 }}>{user?.group_name || '—'}</Tag>
          </div>
          <Button block style={{ marginTop: 20 }} onClick={() => navigate(-1)}>
            {t('common.cancel')}
          </Button>
        </Card>
      </Col>

      {/* ---- Wizard ---------------------------------------------------- */}
      <Col xs={24} lg={18}>
        <Card>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>{t('submit.title')}</Typography.Title>
          <Typography.Text type="secondary">{t('submit.wizardSubtitle')}</Typography.Text>

          <div style={{ display: 'flex', gap: 4, margin: '20px 0 8px' }}>{dots}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('submit.stepOf', { n: step + 1, total: totalSteps })}
          </Typography.Text>

          <div style={{ minHeight: 340, marginTop: 24 }}>
            {isUpload && (
              <>
                <Tag color="blue">{t('submit.phase', { n: 1 })}: {t('submit.phaseInitial')}</Tag>
                {/* A retry can only help: the best attempt is what gets graded,
                    so a weaker second try never costs the student their mark. */}
                {maxAttempts > 1 && (
                  <Alert
                    type={noAttemptsLeft ? 'error' : attemptNo > 1 ? 'warning' : 'info'}
                    showIcon
                    style={{ marginTop: 12 }}
                    message={
                      noAttemptsLeft
                        ? t('submit.noAttemptsLeft', { max: maxAttempts })
                        : t('submit.attemptOf', { n: attemptNo, max: maxAttempts })
                    }
                    description={
                      noAttemptsLeft
                        ? undefined
                        : assignment?.best_score == null
                          ? t('submit.bestCounts')
                          : t('submit.bestCountsWith', { best: Math.round(assignment.best_score) })
                    }
                  />
                )}
                {rubricFailed && (
                  <Alert type="warning" showIcon style={{ marginTop: 12 }} message={t('submit.rubricError')} />
                )}
                {custom && (
                  <Alert type="info" showIcon style={{ marginTop: 12 }} message={t('submit.customRubric')} />
                )}
                <Typography.Title level={4} style={{ marginTop: 12 }}>{t('submit.uploadMainDoc')}</Typography.Title>
                <Typography.Paragraph type="secondary">{t('submit.uploadHint')}</Typography.Paragraph>
                <Dragger
                  beforeUpload={(f) => {
                    if (f.size > maxFileMb * 1024 * 1024) {
                      message.error(t('submit.fileTooLarge', { mb: maxFileMb }));
                      return Upload.LIST_IGNORE;
                    }
                    setFile(f);
                    return false;
                  }}
                  onRemove={() => setFile(null)}
                  maxCount={1}
                  accept=".py,.java,.cpp,.txt,.pdf,.js,.doc,.docx,.ppt,.pptx"
                >
                  <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                  <p className="ant-upload-text">{t('submit.dragDrop')}</p>
                  <p className="ant-upload-hint">{t('submit.maxSize', { mb: maxFileMb })}</p>
                </Dragger>

                {/* Optional: the grader reads it when present, but not every
                    submission has (or needs) a diagram. */}
                <div style={{ marginTop: 20 }}>
                  <Typography.Text strong>{t('submit.diagramOptional')}</Typography.Text>
                  <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                    {t('submit.diagramHint')}
                  </Typography.Paragraph>
                  {flowchartPicker}
                </div>
              </>
            )}

            {isReview && (
              <>
                <Tag color="blue">{t('submit.phase', { n: totalSteps })}: {t('submit.phaseFinal')}</Tag>
                <Typography.Title level={4} style={{ marginTop: 12 }}>
                  {t('submit.reviewSubmission')}
                </Typography.Title>

                {/* Nothing to review but the two files — the AI grades every
                    criterion straight off them. */}
                <div style={{ padding: '10px 0', borderBottom: '1px solid #eef5fa' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t('submit.mainFile')}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    {file?.name}
                  </Typography.Text>
                  {flowchart && (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 12 }}>{t('submit.flowchart')}</div>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                        {flowchart.name}
                      </Typography.Text>
                    </>
                  )}
                </div>

                <Card size="small" style={{ marginTop: 16, background: '#fafcff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SafetyOutlined style={{ color: 'var(--brand)' }} />
                    <strong>{t('submit.aiCheck')}</strong>
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('submit.aiCheckDesc')}
                  </Typography.Text>
                </Card>
              </>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => setStep((s) => s - 1)}
              style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
            >
              {t('common.back')}
            </Button>
            <Button
              type="primary"
              onClick={next}
              loading={submitting}
              // No tries left: the server would refuse it, so don't walk the
              // student through the whole wizard first.
              disabled={noAttemptsLeft}
              icon={isReview ? <SendOutlined /> : <ArrowRightOutlined />}
            >
              {isReview ? t('submit.send') : t('submit.continue')}
            </Button>
          </div>
        </Card>
      </Col>

      {/* ---- Grading overlay ------------------------------------------- */}
      {submitting && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(9,26,58,0.72)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: '#fff', textAlign: 'center', padding: 24,
          }}
        >
          <Spin size="large" />
          <Typography.Title level={4} style={{ color: '#fff', marginTop: 24 }}>
            {t('submit.overlayTitle')}
          </Typography.Title>
          <Typography.Text style={{ color: '#c9d9f5' }}>
            {t('submit.overlaySubtitleN', { n: rubric?.criteria?.length || fields.length })}
          </Typography.Text>
        </div>
      )}
    </Row>
  );
}
