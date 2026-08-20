// PDF report generation (submission report + academic report) using pdfkit.
// Returns a Buffer so routes can stream it directly.

import PDFDocument from 'pdfkit';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

// pdfkit's built-in Helvetica is WinAnsi-only, so Cyrillic feedback came out as
// garbage. DejaVu covers Latin (incl. Uzbek) and Cyrillic in one face.
const require = createRequire(import.meta.url);
const FONTS = (() => {
  try {
    const dir = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
    const regular = path.join(dir, 'DejaVuSans.ttf');
    const bold = path.join(dir, 'DejaVuSans-Bold.ttf');
    if (fs.existsSync(regular) && fs.existsSync(bold)) return { regular, bold };
  } catch {
    /* fall through to the built-in fonts */
  }
  return null;
})();

/** Creates an A4 document that can render Cyrillic, falling back to Helvetica. */
function createDoc() {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  if (FONTS) {
    doc.registerFont('body', FONTS.regular);
    doc.registerFont('bodyBold', FONTS.bold);
    doc.font('body');
  }
  return doc;
}

/** Switches to the bold face for whichever font set is active. */
function bold(doc) {
  return doc.font(FONTS ? 'bodyBold' : 'Helvetica-Bold');
}

/** Switches back to the regular face. */
function regular(doc) {
  return doc.font(FONTS ? 'body' : 'Helvetica');
}

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export async function generateSubmissionPdf(submissionId, data) {
  const doc = createDoc();

  bold(doc).fontSize(20).text('Submission Report', { align: 'center' });
  regular(doc);
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#666').text(`Report #${submissionId}`, { align: 'center' });
  doc.moveDown();
  doc.fillColor('#000');

  doc.fontSize(12);
  doc.text(`Assignment: ${data.assignment_title || '-'}`);
  doc.text(`Student: ${data.student_name || '-'}`);
  doc.text(`Submitted: ${data.submitted_at || '-'}`);
  doc.text(`Status: ${data.status || '-'}`);
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor('#1677ff').text(`Overall score: ${data.overall_score ?? 0}/100`);
  doc.fillColor('#000').moveDown();

  // The originality result belongs on the printed report too — this is the copy
  // a teacher files, and a deduction has to be traceable to its reason.
  if (data.plagiarism && data.plagiarism.score !== null && data.plagiarism.score !== undefined) {
    const p = data.plagiarism;
    const alarming = p.penalty > 0 || ['high', 'duplicate', 'moderate'].includes(p.status);
    doc.fontSize(13).fillColor('#000').text('Originality check', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor(alarming ? '#cf1322' : '#389e0d')
      .text(`Similarity: ${Math.round(p.score)}%  (${p.status || 'clean'})`);
    if (p.penalty > 0) doc.fillColor('#cf1322').text(`Score reduced by ${p.penalty} points.`);
    if (p.report) doc.fontSize(9).fillColor('#333').text(String(p.report));
    doc.fillColor('#000').moveDown();
  }

  doc.fontSize(13).text('Sections', { underline: true });
  doc.moveDown(0.3);
  (data.criteria_scores || []).forEach((c) => {
    doc.fontSize(11).fillColor('#000').text(`${c.criterion}: ${c.score ?? 0}/100`);
    if (c.comment) doc.fontSize(9).fillColor('#555').text(String(c.comment), { indent: 12 });
    doc.moveDown(0.3);
  });

  doc.moveDown();
  doc.fontSize(13).fillColor('#000').text('AI Summary', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#333').text(data.ai_comment || 'No summary available.');

  return toBuffer(doc);
}

export async function generateAcademicReportPdf(student, subjects) {
  const doc = createDoc();

  bold(doc).fontSize(20).text('Academic Report', { align: 'center' });
  regular(doc);
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Student: ${student.name || '-'}`, { align: 'center' });
  if (student.email) doc.fontSize(10).fillColor('#666').text(student.email, { align: 'center' });
  doc.fillColor('#000').moveDown();

  subjects.forEach((s) => {
    doc.fontSize(14).fillColor('#1677ff').text(s.name);
    doc.fillColor('#000').fontSize(10);
    doc.text(
      `Rating: ${s.rating}/5   |   Avg score: ${Math.round(s.average_score)}/100   |   ` +
        `Completed: ${s.completed_assignments}/${s.total_assignments}`
    );
    (s.submissions || []).forEach((sub) => {
      const dt = sub.submitted_at ? new Date(sub.submitted_at).toISOString().slice(0, 10) : '-';
      doc.fontSize(9).fillColor('#555').text(`  • ${sub.title} — ${sub.score ?? 0}/100 (${dt})`);
    });
    doc.fillColor('#000').moveDown(0.7);
  });

  return toBuffer(doc);
}
