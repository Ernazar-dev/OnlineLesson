// Agora RTC token generation. The video call itself (WebRTC media routing,
// TURN/STUN) is handled entirely by Agora's service — this is only the short-
// lived credential that lets a client join one specific channel. Nothing here
// ever reaches the client UI; the app's own Live Classroom screen is what the
// user sees (see components/AgoraVideoRoom.jsx on the frontend).

import agoraPkg from 'agora-token';
import config from '../config.js';

// `agora-token` is a CommonJS package; under Node ESM only the default export
// is available, so the named builders are pulled off it rather than imported
// directly (a plain `import { RtcTokenBuilder } from 'agora-token'` throws).
const { RtcTokenBuilder, RtcRole } = agoraPkg;

/**
 * Builds a short-lived Agora RTC token for one user joining one channel.
 *
 * `tokenExpire`/`privilegeExpire` in the underlying builder are **durations in
 * seconds from now**, not absolute timestamps — passing an epoch value there
 * (a common mistake) would make the token valid for decades instead of `ttl`.
 */
export function buildAgoraToken({ channelName, uid, role = 'publisher' }) {
  const { agoraAppId: appId, agoraAppCertificate: appCertificate, agoraTokenTtl: ttl } = config;

  if (!appId || !appCertificate) {
    throw new Error(
      'AGORA_APP_ID yoki AGORA_APP_CERTIFICATE sozlanmagan — agora.io saytida bepul hisob ochib, ' +
      '"App Certificate" yoqilgan loyiha yarating va ikkalasini ham backend/.env fayliga qo\'ying.'
    );
  }

  const resolvedRole = role === 'subscriber' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    resolvedRole,
    ttl,
    ttl
  );

  return { token, appId, channel: channelName, uid, expiresIn: ttl };
}

export default { buildAgoraToken };
