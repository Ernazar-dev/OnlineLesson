import { useEffect, useRef, useState, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { Alert, Button, Space, Typography, Result, Spin, Tooltip, message } from 'antd';
import {
  AudioOutlined, AudioMutedOutlined, VideoCameraOutlined, VideoCameraAddOutlined,
  DesktopOutlined, PhoneOutlined, ReloadOutlined, UserOutlined, PushpinOutlined,
} from '../icons';
import { useTranslation } from 'react-i18next';
import { liveSessionsApi } from '../api';
import { apiError } from '../utils/format';
import useIsMobile from '../hooks/useIsMobile';

// How often every participant polls for who the teacher has spotlighted.
// The call has no other realtime channel to push that over (see the
// spotlight state comment on the backend route) — a couple of seconds of
// lag before "the teacher just called on you" reaches everyone is fine.
const SPOTLIGHT_POLL_MS = 2500;

// Agora provides the media transport (WebRTC routing, TURN/STUN) — every pixel
// on screen below is this app's own: the grid, the tiles, the control bar.
// Nothing here shows Agora's name or UI, only what the platform renders itself.

const BRAND = '#1c9de9';

/** "Nodira Karimova" -> "NK", "nodira" -> "N" — a tile's avatar fallback. */
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

/**
 * One video tile — plays whatever track it is handed into its own DOM node.
 * `stage` sizes it to fill/contain its box instead of a fixed 16:9 grid cell
 * (the tile the teacher — or whoever is spotlighted — occupies takes up
 * whatever space its stage column gives it). `onPin` renders a small pin
 * button in the corner (teacher only, see AgoraVideoRoom): pressing it on a
 * grid tile spotlights that person, and on the stage tile itself clears the
 * spotlight back to the teacher.
 */
function VideoTile({ track, name, role, isTeacher, isLocal, cameraOff, micOff, speaking, stage, onPin, pinned }) {
  const { t } = useTranslation();
  const containerRef = useRef(null);

  useEffect(() => {
    if (track && containerRef.current) track.play(containerRef.current);
    return () => { try { track?.stop(); } catch { /* already detached */ } };
  }, [track]);

  return (
    <div
      className="live-tile"
      style={{
        position: 'relative', borderRadius: 16, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #141d29 0%, #0c121a 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: speaking
          ? `0 0 0 2px ${BRAND}, 0 0 26px rgba(28,157,233,0.55)`
          : '0 6px 20px rgba(0,0,0,0.35)',
        transition: 'box-shadow .2s ease',
        ...(stage
          ? { width: '100%', height: '100%' }
          : { width: '100%', aspectRatio: '16 / 9' }),
      }}
    >
      {track && !cameraOff ? (
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      ) : (
        <div
          style={{
            width: '28%', maxWidth: 84, minWidth: 48, aspectRatio: '1 / 1', borderRadius: '50%',
            background: `linear-gradient(135deg, ${BRAND}, #0f5f92)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
          }}
        >
          <Typography.Text style={{ color: '#fff', fontWeight: 700, fontSize: '1.6em', fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>
            {initials(name) || <UserOutlined />}
          </Typography.Text>
        </div>
      )}
      {onPin && (
        <Tooltip title={pinned ? t('liveSession.stopSpotlight') : t('liveSession.spotlightStudent')}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            style={{
              position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: '50%',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: pinned ? BRAND : 'rgba(8,12,18,0.55)', backdropFilter: 'blur(6px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            }}
          >
            <PushpinOutlined weight={pinned ? 'fill' : 'regular'} style={{ fontSize: 15, color: '#fff' }} />
          </button>
        </Tooltip>
      )}
      <div
        style={{
          position: 'absolute', left: 10, bottom: 10, maxWidth: 'calc(100% - 20px)',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(8,12,18,0.6)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 999, padding: '4px 10px 4px 8px',
        }}
      >
        {micOff && <AudioMutedOutlined style={{ color: '#ff6b6b', fontSize: 12, flexShrink: 0 }} />}
        <Typography.Text
          ellipsis
          style={{ color: '#fff', fontSize: 12.5, fontWeight: 500, fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}
        >
          {name}{isLocal ? ` · ${t('liveSession.you')}` : ''}
        </Typography.Text>
        <span
          style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.2, flexShrink: 0,
            padding: '1px 7px', borderRadius: 999,
            color: isTeacher ? '#f7b955' : 'rgba(255,255,255,0.75)',
            background: isTeacher ? 'rgba(247,144,9,0.18)' : 'rgba(255,255,255,0.12)',
          }}
        >
          {role}
        </span>
      </div>
    </div>
  );
}

/**
 * The Live Classroom call itself. Fetches a short-lived join token for
 * `sessionId`, joins the matching Agora channel, and renders a self-hosted
 * grid + control bar around it — the video infrastructure is Agora's, the UI
 * is entirely the platform's.
 *
 * `onLeave` fires once the call is torn down (button click, or an
 * unrecoverable connection failure); the caller is responsible for closing
 * whatever overlay hosts this component.
 */
export default function AgoraVideoRoom({ sessionId, displayName, isTeacher, teacherUid, onLeave }) {
  const { t } = useTranslation();
  const clientRef = useRef(null);
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });
  const screenTrackRef = useRef(null);
  const joinedRef = useRef(false);

  const [phase, setPhase] = useState('connecting'); // connecting | live | failed
  const [errorMessage, setErrorMessage] = useState('');
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  // uid -> { videoTrack, hasAudio, joinedOnly } — an entry exists the moment a
  // remote user is present in the channel (joinedOnly: true, no media yet)
  // so the roster always reflects who's actually there, even before/instead
  // of them publishing a camera or mic.
  const [remoteUsers, setRemoteUsers] = useState({});
  const [attempt, setAttempt] = useState(0);
  // Set when the channel join succeeded but the camera/mic couldn't be
  // acquired (permission denied, device busy, etc). Unlike errorMessage this
  // does NOT block the call — the user still sees and hears everyone else,
  // they just can't be seen/heard themselves until they retry.
  const [mediaError, setMediaError] = useState('');
  const [mediaRetrying, setMediaRetrying] = useState(false);
  const [ownUid, setOwnUid] = useState(null);
  const [speakingUids, setSpeakingUids] = useState(() => new Set());
  // uid -> real display name for everyone allowed in this session (the Agora
  // uid a remote user joins with is their own user id — see the backend's
  // /token handler), so tiles show a name instead of a bare "#uid". Best
  // effort: a lookup miss (e.g. an admin sitting in) just falls back to that.
  const [roster, setRoster] = useState({});
  const mountedRef = useRef(true);
  const isMobile = useIsMobile();

  // uid of whoever the teacher has spotlighted onto the big stage, or null
  // for the default (the teacher themself). Polled from the backend — see
  // SPOTLIGHT_POLL_MS above — so every participant's stage matches what the
  // teacher set, teacher included.
  const [spotlightUid, setSpotlightUid] = useState(null);

  const role = isTeacher ? t('common.teacher') : t('common.student');

  const teardown = useCallback(async () => {
    const client = clientRef.current;
    try { screenTrackRef.current?.close?.(); } catch { /* noop */ }
    try { localTracksRef.current.audioTrack?.close(); } catch { /* noop */ }
    try { localTracksRef.current.videoTrack?.close(); } catch { /* noop */ }
    localTracksRef.current = { audioTrack: null, videoTrack: null };
    screenTrackRef.current = null;
    if (client && joinedRef.current) {
      try { await client.leave(); } catch { /* noop */ }
    }
    joinedRef.current = false;
    liveSessionsApi.leave(sessionId).catch(() => {});
  }, [sessionId]);

  // Tries to grab the camera/mic and publish them. Safe to call again later
  // (e.g. from a "retry" button) once the channel is already joined — that's
  // how a student who denied the permission prompt can grant it and come
  // on camera without leaving and rejoining the whole call.
  const acquireLocalMedia = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !joinedRef.current) return false;
    try {
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      if (!mountedRef.current) { audioTrack.close(); videoTrack.close(); return false; }
      localTracksRef.current = { audioTrack, videoTrack };
      await client.publish([audioTrack, videoTrack]);
      if (!mountedRef.current) {
        // Unmounted while the publish above was in flight — teardown() ran
        // before these tracks existed in localTracksRef, so it never closed
        // them. Left alone they'd keep streaming camera/mic to a channel
        // nothing is listening to any more.
        try { await client.unpublish([audioTrack, videoTrack]); } catch { /* noop */ }
        audioTrack.close();
        videoTrack.close();
        localTracksRef.current = { audioTrack: null, videoTrack: null };
        return false;
      }
      setLocalVideoTrack(videoTrack);
      setMicOn(true);
      setCameraOn(true);
      setMediaError('');
      return true;
    } catch (e) {
      if (!mountedRef.current) return false;
      // Same NotAllowedError family covered above: denied prompt, prior
      // "Block" choice, camera already in use, or a plain http:// origin.
      const permissionDenied =
        e?.code === 'PERMISSION_DENIED' || /NotAllowedError|Permission denied/i.test(e?.message || '');
      setMediaError(
        permissionDenied ? t('liveSession.permissionDenied') : apiError(e, t('liveSession.connectFailedHint'))
      );
      setMicOn(false);
      setCameraOn(false);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const retryMedia = async () => {
    setMediaRetrying(true);
    try { await acquireLocalMedia(); } finally { if (mountedRef.current) setMediaRetrying(false); }
  };

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    setPhase('connecting');
    setErrorMessage('');
    setMediaError('');
    setRemoteUsers({});
    setSpeakingUids(new Set());
    setRoster({});

    // Not needed to render a single frame of video, so it's fetched
    // independently of the join/token flow above and never blocks getting
    // into the call — tiles just fall back to "Participant #uid" until it
    // resolves (or forever, if it fails).
    liveSessionsApi
      .roster(sessionId)
      .then((rows) => {
        if (cancelled) return;
        const map = {};
        rows.forEach((r) => { if (r.name) map[r.id] = r.name; });
        setRoster(map);
      })
      .catch(() => {});

    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    // A remote user occupies a tile from the moment they're in the channel,
    // not only once they manage to publish a camera/mic — otherwise a
    // participant whose own media failed (see acquireLocalMedia above)
    // would be invisible to everyone else too, and the room would look
    // empty even with people in it.
    client.on('user-joined', (user) => {
      setRemoteUsers((prev) => (prev[user.uid] ? prev : { ...prev, [user.uid]: { videoTrack: null, hasAudio: false } }));
    });
    client.on('user-published', async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType);
      } catch (e) {
        // A failed subscribe here is exactly what makes two people "in" the
        // same call not actually see/hear each other with no visible error —
        // logged so it's diagnosable instead of silently swallowed.
        console.warn('live session subscribe failed:', user.uid, mediaType, e?.message || e);
        return;
      }
      if (mediaType === 'video') {
        setRemoteUsers((prev) => ({
          ...prev,
          [user.uid]: { ...prev[user.uid], videoTrack: user.videoTrack, hasAudio: prev[user.uid]?.hasAudio },
        }));
      } else if (mediaType === 'audio') {
        user.audioTrack?.play();
        setRemoteUsers((prev) => ({ ...prev, [user.uid]: { ...prev[user.uid], hasAudio: true } }));
      }
    });
    client.on('user-unpublished', (user, mediaType) => {
      setRemoteUsers((prev) => {
        if (!prev[user.uid]) return prev;
        const next = { ...prev[user.uid] };
        if (mediaType === 'video') next.videoTrack = null;
        if (mediaType === 'audio') next.hasAudio = false;
        return { ...prev, [user.uid]: next };
      });
    });
    client.on('user-left', (user) => {
      setRemoteUsers((prev) => {
        const next = { ...prev };
        delete next[user.uid];
        return next;
      });
    });
    // Lets a tile glow while its owner is actually talking — small, but it's
    // the difference between a grid of static photos and a call that feels
    // like people are in it together.
    client.on('volume-indicator', (volumes) => {
      const loud = new Set();
      volumes.forEach((v) => { if (v.level > 15) loud.add(v.uid); });
      setSpeakingUids(loud);
    });

    (async () => {
      try {
        const { token, app_id: appId, channel, uid } = await liveSessionsApi.getToken(sessionId);
        // React.StrictMode (see main.jsx) double-invokes this effect in dev:
        // mount, cleanup, mount again. The cleanup above runs synchronously
        // while this join is still in flight, so its teardown() finds
        // joinedRef.current still false and skips client.leave() — if we then
        // just carried on, this orphaned client would join and sit in the
        // channel under this same uid forever (nothing else ever calls leave
        // on it again), fighting the real client for that uid's slot. That's
        // exactly what makes two people "in" the same call not see each
        // other, and each leaked ghost connection left running its own
        // subscriptions/volume-indicator polling in the background is a
        // steady way for the tab to slow down or lock up over time.
        await client.join(appId, channel, token, uid);
        joinedRef.current = true;
        if (cancelled) {
          try { await client.leave(); } catch { /* noop */ }
          joinedRef.current = false;
          return;
        }
        setOwnUid(uid);
        try { client.enableAudioVolumeIndicator(); } catch { /* not fatal */ }
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(apiError(e, t('liveSession.connectFailedHint')));
        setPhase('failed');
        return;
      }
      if (cancelled) return;
      // Channel join succeeded — let the student into the room even if the
      // camera/mic can't be acquired, so they can still see and hear
      // everyone else. acquireLocalMedia() sets mediaError on failure instead
      // of blocking the call.
      setPhase('live');
      await acquireLocalMedia();
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, attempt]);

  // Keeps everyone's stage in sync with whoever the teacher last spotlighted
  // — see the SPOTLIGHT_POLL_MS comment above for why polling, not a push.
  useEffect(() => {
    if (phase !== 'live') return undefined;
    let cancelled = false;
    const poll = () => {
      liveSessionsApi
        .getSpotlight(sessionId)
        .then(({ uid }) => { if (!cancelled) setSpotlightUid((prev) => (prev === uid ? prev : uid)); })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, SPOTLIGHT_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [phase, sessionId]);

  // Teacher-only: put `uid` on everyone's stage, or null to go back to
  // showing the teacher. Updates locally right away so the teacher's own
  // screen doesn't wait out a poll cycle; the next poll just confirms it.
  const setSpotlight = async (uid) => {
    setSpotlightUid(uid);
    try {
      await liveSessionsApi.setSpotlight(sessionId, uid);
    } catch (e) {
      message.error(apiError(e, t('common.error')));
    }
  };

  const toggleMic = async () => {
    const track = localTracksRef.current.audioTrack;
    if (!track) { await retryMedia(); return; }
    await track.setEnabled(micOn ? false : true);
    setMicOn((v) => !v);
  };

  const toggleCamera = async () => {
    const track = localTracksRef.current.videoTrack;
    if (!track) { await retryMedia(); return; }
    await track.setEnabled(cameraOn ? false : true);
    setCameraOn((v) => !v);
  };

  const toggleScreenShare = async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      if (!sharingScreen) {
        const screenTrack = await AgoraRTC.createScreenVideoTrack({ encoderConfig: '1080p_1' }, 'disable');
        screenTrackRef.current = screenTrack;
        if (localTracksRef.current.videoTrack) await client.unpublish(localTracksRef.current.videoTrack);
        await client.publish(screenTrack);
        setLocalVideoTrack(screenTrack);
        // Screen-share tracks end themselves when the user picks "Stop sharing"
        // from the browser's own UI, not just from our button.
        screenTrack.on('track-ended', () => toggleScreenShare());
        setSharingScreen(true);
      } else {
        const screenTrack = screenTrackRef.current;
        if (screenTrack) { await client.unpublish(screenTrack); screenTrack.close(); screenTrackRef.current = null; }
        if (localTracksRef.current.videoTrack) {
          await client.publish(localTracksRef.current.videoTrack);
          setLocalVideoTrack(localTracksRef.current.videoTrack);
        }
        setSharingScreen(false);
      }
    } catch (e) {
      // Most common cause: the user cancelled the browser's "share screen" picker.
      if (e?.message && !/permission|cancel/i.test(e.message)) message.error(t('common.error'));
    }
  };

  const leave = async () => {
    await teardown();
    onLeave?.();
  };

  const pageBg = {
    background:
      'radial-gradient(1100px 700px at 12% -10%, rgba(28,157,233,0.16), transparent 60%), ' +
      'radial-gradient(900px 600px at 100% 110%, rgba(28,157,233,0.10), transparent 55%), #0a0e14',
  };

  if (phase === 'failed') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...pageBg }}>
        <div style={{
          background: 'rgba(20,26,34,0.6)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '8px 16px',
        }}
        >
          <Result
            status="warning"
            title={<span style={{ color: '#fff' }}>{t('liveSession.connectFailed')}</span>}
            subTitle={<span style={{ color: 'rgba(255,255,255,0.65)' }}>{errorMessage}</span>}
            extra={(
              <Space>
                <Button icon={<ReloadOutlined />} onClick={() => setAttempt((n) => n + 1)}>{t('common.retry')}</Button>
                <Button onClick={leave}>{t('liveSession.leave')}</Button>
              </Space>
            )}
          />
        </div>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column', gap: 14,
        alignItems: 'center', justifyContent: 'center', ...pageBg,
      }}
      >
        <Spin size="large" />
        <span style={{ color: 'rgba(255,255,255,0.75)', fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>
          {t('liveSession.connecting')}
        </span>
      </div>
    );
  }

  // One normalized list for local + remote, so the stage/grid split below
  // doesn't care which one any given participant is.
  const localEntry = ownUid != null ? {
    uid: Number(ownUid),
    track: localVideoTrack,
    name: displayName || role,
    role,
    isTeacher,
    isLocal: true,
    cameraOff: !cameraOn && !sharingScreen,
    micOff: !micOn,
    speaking: speakingUids.has(Number(ownUid)),
  } : null;
  const remoteEntryList = Object.entries(remoteUsers).map(([uid, u]) => {
    const uidNum = Number(uid);
    const remoteIsTeacher = uidNum === Number(teacherUid);
    return {
      uid: uidNum,
      track: u.videoTrack,
      name: roster[uid] || `${t('liveSession.participant')} #${uid}`,
      role: remoteIsTeacher ? t('common.teacher') : t('common.student'),
      isTeacher: remoteIsTeacher,
      isLocal: false,
      micOff: u.hasAudio === false,
      speaking: speakingUids.has(uidNum),
    };
  });
  const allEntries = localEntry ? [localEntry, ...remoteEntryList] : remoteEntryList;

  // The stage always shows one person: whoever the teacher spotlighted, or
  // the teacher themself by default. Everyone else — including the teacher,
  // once a student is spotlighted — is a card in the grid.
  const mainUid = spotlightUid != null ? spotlightUid : Number(teacherUid);
  const mainEntry = allEntries.find((e) => e.uid === mainUid) || null;
  const gridEntries = allEntries.filter((e) => e !== mainEntry);
  const spotlightActive = !!mainEntry && mainEntry.uid !== Number(teacherUid);

  const stageTile = (
    <div style={{
      flex: isMobile ? '0 0 52%' : '0 0 68%', minWidth: 0, minHeight: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
    >
      {mainEntry ? (
        <VideoTile
          {...mainEntry}
          stage
          onPin={isTeacher && spotlightActive ? () => setSpotlight(null) : undefined}
          pinned={spotlightActive}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%', borderRadius: 16,
          background: 'linear-gradient(160deg, #141d29 0%, #0c121a 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.45)', fontSize: 13,
        }}
        >
          {t('liveSession.waitingForTeacher')}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', ...pageBg }}>
      <style>{`
        .live-ctrl-btn { background: rgba(255,255,255,0.08) !important; border: none !important; color: #fff !important; transition: transform .15s ease, background .15s ease; }
        .live-ctrl-btn:hover:not(:disabled) { background: rgba(255,255,255,0.16) !important; transform: translateY(-2px); }
        .live-ctrl-btn.ant-btn-dangerous { background: rgba(240,68,56,0.85) !important; color: #fff !important; }
        .live-ctrl-btn.ant-btn-dangerous:hover:not(:disabled) { background: rgba(240,68,56,1) !important; }
        .live-ctrl-btn.ant-btn-primary:not(.ant-btn-dangerous) { background: ${BRAND} !important; }
        .live-leave-btn { transition: transform .15s ease; }
        .live-leave-btn:hover:not(:disabled) { transform: translateY(-2px) scale(1.04); }
        .live-tile:hover { border-color: rgba(255,255,255,0.14) !important; }
      `}
      </style>

      {mediaError && (
        <div style={{ padding: '12px 16px 0' }}>
          <Alert
            type="warning"
            showIcon
            message={mediaError}
            style={{
              background: 'rgba(247,144,9,0.12)', border: '1px solid rgba(247,144,9,0.35)',
              borderRadius: 12, color: '#f7b955',
            }}
            action={(
              <Button size="small" loading={mediaRetrying} onClick={retryMedia}>
                {t('common.retry')}
              </Button>
            )}
          />
        </div>
      )}

      <div style={{
        // minHeight: 0 overrides the flex item's default min-height: auto —
        // without it this row refuses to shrink below its content's natural
        // height, so it overflows past the fixed-position overlay's bottom
        // edge instead of scrolling, pushing the control bar off screen.
        flex: 1, minHeight: 0, padding: 16, gap: 14,
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
      }}
      >
        {stageTile}

        <div style={{
          flex: '1 1 auto', minWidth: 0, minHeight: 0, overflow: 'auto',
          display: 'grid', gap: 10, alignContent: 'start',
          // More cards → auto-fill packs more, smaller columns; few cards →
          // fewer, bigger ones. Exactly "arranged by however many there are".
          gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 110 : 150}px, 1fr))`,
        }}
        >
          {gridEntries.map((e) => (
            <VideoTile
              key={e.uid}
              {...e}
              onPin={isTeacher ? () => setSpotlight(e.uid) : undefined}
              pinned={false}
            />
          ))}
        </div>
      </div>

      {gridEntries.length === 0 && (
        <div style={{ textAlign: 'center', paddingBottom: 8, color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
          {t('liveSession.waitingForOthers')}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 16px 22px' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            borderRadius: 999, background: 'rgba(20,26,34,0.72)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 14px 34px rgba(0,0,0,0.4)',
          }}
        >
          <Tooltip title={micOn ? t('liveSession.mute') : t('liveSession.unmute')}>
            <Button
              className="live-ctrl-btn"
              shape="circle" size="large" danger={!micOn}
              icon={micOn ? <AudioOutlined /> : <AudioMutedOutlined />}
              onClick={toggleMic}
            />
          </Tooltip>
          <Tooltip title={cameraOn ? t('liveSession.cameraOff') : t('liveSession.cameraOn')}>
            <Button
              className="live-ctrl-btn"
              shape="circle" size="large" danger={!cameraOn}
              icon={cameraOn ? <VideoCameraOutlined /> : <VideoCameraAddOutlined />}
              onClick={toggleCamera}
              disabled={sharingScreen}
            />
          </Tooltip>
          <Tooltip title={sharingScreen ? t('liveSession.stopShareScreen') : t('liveSession.shareScreen')}>
            <Button
              className="live-ctrl-btn"
              shape="circle" size="large" type={sharingScreen ? 'primary' : 'default'}
              icon={<DesktopOutlined />}
              onClick={toggleScreenShare}
            />
          </Tooltip>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
          <Tooltip title={t('liveSession.leave')}>
            <Button
              className="live-leave-btn"
              shape="circle" size="large" type="primary" danger
              icon={<PhoneOutlined style={{ transform: 'rotate(135deg)' }} />}
              onClick={leave}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
