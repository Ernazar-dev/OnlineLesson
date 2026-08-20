import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma.js';
import { t, DEFAULT_LANG } from '../i18n/index.js';

const ADMIN_LOG = path.resolve(process.cwd(), 'admin.txt');

/**
 * Append a line to admin.txt (best-effort, mirrors the original Flask behaviour).
 * The file is a single flat audit trail, so it is always written in the default
 * language rather than in whatever language the acting user had selected.
 */
export function appendAdminLog(action, actor, detailsKey, params) {
  try {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const details = t(DEFAULT_LANG, detailsKey, params);
    // Asynchronous on purpose. This runs inside request handlers, and a
    // synchronous write blocks the whole event loop — on the 0.1 CPU of a free
    // instance that is a pause every other request pays for. Nothing waits on
    // the audit line, so it can land whenever the disk gets to it.
    fs.appendFile(ADMIN_LOG, `${ts} | ${action} | ${actor} | ${details}\n`, 'utf-8', () => {});
  } catch (e) {
    // non-fatal
  }
}

/**
 * Persist an ActivityLog row (best-effort). `details` is stored as an encoded
 * key + params instead of a finished sentence, so the admin viewing the log
 * sees it in their own language — see decodeDetails.
 */
export async function logActivity(userId, action, detailsKey, params, ipAddress) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: userId ?? null,
        action,
        details: encodeDetails(detailsKey, params),
        ipAddress: ipAddress ?? null,
      },
    });
  } catch (e) {
    // non-fatal
  }
}

export function encodeDetails(key, params) {
  return JSON.stringify({ k: key, p: params ?? {} });
}

/** Renders a stored details value; rows written before i18n are plain text and pass through. */
export function decodeDetails(details, lang) {
  if (!details) return details;
  try {
    const parsed = JSON.parse(details);
    if (parsed && typeof parsed.k === 'string') return t(lang, parsed.k, parsed.p);
  } catch (e) {
    // legacy plain-text row
  }
  return details;
}
