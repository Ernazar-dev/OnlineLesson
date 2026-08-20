import { useEffect, useState } from 'react';
import { Table, Avatar, Spin, Empty } from 'antd';
import { UserOutlined, TrophyOutlined } from '../../icons';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api';
import { useAuth } from '../../store/auth';

/* ═══════════ Metall ranglar palitrasi ═══════════ */
const metals = [
  {
    key: 'gold',
    labelKey: 'admin.rankChampion',
    ribbon: '#c62f2f',
    ribbonDark: '#9e2020',
    metal: ['#fff7d1', '#ffd75e', '#f0a10e', '#b87700'],
    ringGrad: 'conic-gradient(from 0deg, #ffd75e, #fff3b0, #f0a10e, #ffe98a, #ffd75e)',
    glow: 'rgba(240, 161, 14, 0.45)',
    stepGrad: 'linear-gradient(165deg, #fff3cf 0%, #ffdf85 45%, #f2b135 100%)',
    stepEdge: '#e9a71f',
    numGrad: 'linear-gradient(180deg, #a86e00, #f4c14b)',
    text: '#7a5200',
    pillGrad: 'linear-gradient(135deg, #f7b733, #e08a00)',
    stepH: 120,
  },
  {
    key: 'silver',
    labelKey: 'admin.rankSilver',
    ribbon: '#3f6db3',
    ribbonDark: '#2d5290',
    metal: ['#ffffff', '#e9eef4', '#b6c0cb', '#8794a2'],
    ringGrad: 'conic-gradient(from 0deg, #dfe5ec, #ffffff, #a7b2be, #eef2f6, #dfe5ec)',
    glow: 'rgba(140, 152, 165, 0.38)',
    stepGrad: 'linear-gradient(165deg, #fafcfe 0%, #e3e9ef 45%, #bec8d2 100%)',
    stepEdge: '#aab5c1',
    numGrad: 'linear-gradient(180deg, #6b7887, #b9c3ce)',
    text: '#46525f',
    pillGrad: 'linear-gradient(135deg, #9fabb8, #77879a)',
    stepH: 100,
  },
  {
    key: 'bronze',
    labelKey: 'admin.rankBronze',
    ribbon: '#3c7d4e',
    ribbonDark: '#2b5f3a',
    metal: ['#ffe9d8', '#eba871', '#c97c3f', '#93542a'],
    ringGrad: 'conic-gradient(from 0deg, #eba871, #ffe0c2, #b56b31, #f3c39a, #eba871)',
    glow: 'rgba(181, 107, 49, 0.38)',
    stepGrad: 'linear-gradient(165deg, #fcefe3 0%, #f0c9a4 45%, #d69258 100%)',
    stepEdge: '#c8804a',
    numGrad: 'linear-gradient(180deg, #8a4d1e, #dc9c5e)',
    text: '#6f3f18',
    pillGrad: 'linear-gradient(135deg, #d18a4e, #a95f2b)',
    stepH: 80,
  },
];

const scoreOf = (r) => Math.round((r.average_score ?? 0) * 10) / 10;
const nameOf = (r) => r.full_name || r.username;

/* ═══════════ Maxsus SVG medal (lenta + metall doira + raqam) ═══════════ */
function MedalSVG({ place, size = 44 }) {
  const m = metals[place];
  const id = `medal-${m.key}`;
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 40 56" style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`${id}-face`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor={m.metal[0]} />
          <stop offset="45%" stopColor={m.metal[1]} />
          <stop offset="80%" stopColor={m.metal[2]} />
          <stop offset="100%" stopColor={m.metal[3]} />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={m.metal[1]} />
          <stop offset="100%" stopColor={m.metal[3]} />
        </linearGradient>
      </defs>
      {/* Lenta */}
      <path d="M11 0 h8.5 v21 l-8.5 -5.5 z" fill={m.ribbonDark} />
      <path d="M20.5 0 h8.5 v15.5 l-8.5 5.5 z" fill={m.ribbon} />
      {/* Medal doirasi */}
      <circle cx="20" cy="37" r="15.5" fill={`url(#${id}-rim)`} />
      <circle cx="20" cy="37" r="13" fill={`url(#${id}-face)`} />
      <circle cx="20" cy="37" r="10" fill="none" stroke={m.metal[3]} strokeOpacity="0.45" strokeWidth="1" strokeDasharray="2.5 2" />
      {/* Raqam */}
      <text x="20" y="42" textAnchor="middle" fontSize="14" fontWeight="900" fontFamily="inherit" fill={m.metal[3]}>
        {place + 1}
      </text>
      {/* Yaltiroq nuqta */}
      <ellipse cx="14.5" cy="30.5" rx="4" ry="2.6" fill="#ffffff" opacity="0.55" transform="rotate(-28 14.5 30.5)" />
    </svg>
  );
}

/* ═══════════ Maxsus SVG toj (faqat chempion uchun) ═══════════ */
function CrownSVG({ size = 44 }) {
  return (
    <svg width={size} height={size * 0.68} viewBox="0 0 48 33" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="crown-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe98a" />
          <stop offset="55%" stopColor="#f5b91e" />
          <stop offset="100%" stopColor="#d18a00" />
        </linearGradient>
      </defs>
      <path
        d="M5 25 L8.5 8.5 L17.5 17.5 L24 4.5 L30.5 17.5 L39.5 8.5 L43 25 Z"
        fill="url(#crown-gold)"
        stroke="#b87700"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <rect x="5" y="25.5" width="38" height="5" rx="2.5" fill="url(#crown-gold)" stroke="#b87700" strokeWidth="1" />
      <circle cx="8.5" cy="7" r="2.4" fill="#ffe98a" stroke="#b87700" strokeWidth="0.9" />
      <circle cx="24" cy="3" r="2.6" fill="#ffe98a" stroke="#b87700" strokeWidth="0.9" />
      <circle cx="39.5" cy="7" r="2.4" fill="#ffe98a" stroke="#b87700" strokeWidth="0.9" />
      <circle cx="24" cy="28" r="1.7" fill="#c62f2f" />
      <circle cx="14.5" cy="28" r="1.4" fill="#2f86c6" />
      <circle cx="33.5" cy="28" r="1.4" fill="#2f9e52" />
    </svg>
  );
}

/* ═══════════ Bitta podium ustuni ═══════════ */
function PodiumColumn({ entry, place, isMe }) {
  const { t } = useTranslation();
  const m = metals[place];
  const isGold = place === 0;
  return (
    <div className={`pd-col pd-${m.key}`} style={{ '--glow': m.glow }}>
      {/* Orqa fon nuri */}
      <span className="pd-halo" style={{ background: `radial-gradient(circle, ${m.glow} 0%, transparent 68%)` }} />

      {/* Chempion uchun uchqunlar */}
      {isGold && (
        <>
          <span className="pd-spark s1">✦</span>
          <span className="pd-spark s2">✦</span>
          <span className="pd-spark s3">✧</span>
          <span className="pd-spark s4">✦</span>
        </>
      )}

      <div className="pd-champ">
        {isGold && <div className="pd-crown"><CrownSVG size={46} /></div>}

        {/* Aylanuvchi metall halqa ichida avatar */}
        <div className="pd-ring-wrap" style={{ width: isGold ? 96 : 80, height: isGold ? 96 : 80 }}>
          <span className="pd-ring" style={{ background: m.ringGrad }} />
          <span className="pd-ring-inner">
            <Avatar
              size={isGold ? 82 : 66}
              icon={<UserOutlined />}
              src={entry.avatar_url}
              style={{ background: '#fff', color: m.text, display: 'block' }}
            />
          </span>
        </div>

        {/* Avatar yoniga osilgan medal */}
        <div className="pd-medal">
          <MedalSVG place={place} size={isGold ? 34 : 30} />
        </div>
      </div>

      <div className="pd-name" style={{ fontSize: isGold ? 16.5 : 14.5 }}>
        {nameOf(entry)}
        {isMe && <span className="pd-me">({t('admin.you')})</span>}
      </div>
      <div className="pd-rank-label" style={{ color: m.text }}>{t(m.labelKey)}</div>

      <div className="pd-pill" style={{ background: m.pillGrad }}>
        {scoreOf(entry)} <span style={{ fontWeight: 600, opacity: 0.85, fontSize: 11.5 }}>{t('admin.points')}</span>
      </div>

      {/* Podium zinapoyasi */}
      <div
        className="pd-step"
        style={{
          height: m.stepH,
          background: m.stepGrad,
          borderColor: m.stepEdge,
          boxShadow: `0 18px 38px -10px ${m.glow}`,
        }}
      >
        <span className="pd-step-shine" />
        <span className="pd-step-num" style={{ backgroundImage: m.numGrad }}>{place + 1}</span>
      </div>
    </div>
  );
}

export default function AdminLeaderboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { adminApi.leaderboard().then(setData).finally(() => setLoading(false)); }, []);

  const top3 = data.slice(0, 3);
  const rest = data.slice(3);

  const columns = [
    {
      title: '#',
      key: 'rank',
      width: 70,
      render: (_, __, idx) => (
        <span className="mono-index">{String(idx + 4).padStart(2, '0')}</span>
      ),
    },
    {
      title: t('common.student'),
      key: 'name',
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar
            icon={<UserOutlined />}
            src={r.avatar_url}
            style={{
              background: r.id === user?.id ? 'var(--lb-accent)' : 'var(--lb-line)',
              color: r.id === user?.id ? '#fff' : 'var(--lb-muted)',
            }}
          />
          <span style={{ color: 'var(--lb-ink)', fontWeight: r.id === user?.id ? 700 : 500 }}>
            {nameOf(r)}
            {r.id === user?.id && <span style={{ color: 'var(--lb-accent)', marginLeft: 6, fontSize: 12 }}>({t('admin.you')})</span>}
          </span>
        </div>
      ),
    },
    { title: t('common.group'), dataIndex: 'group_name', render: (v) => v || '-' },
    {
      title: t('student.avgScore'),
      dataIndex: 'average_score',
      width: 130,
      align: 'right',
      render: (_, r) => (
        <span>
          <strong style={{ fontSize: 15, fontWeight: 700, color: 'var(--lb-ink)' }}>{scoreOf(r)}</strong>
          <span style={{ color: 'var(--lb-muted)', fontSize: 12, marginLeft: 4 }}>{t('admin.points')}</span>
        </span>
      ),
    },
    { title: t('admin.workCount'), dataIndex: 'submission_count', width: 100, align: 'right' },
  ];

  return (
    <div
      className="lb-page"
      style={{
        '--lb-ink': '#1f2d3d',
        '--lb-muted': '#7a8aa0',
        '--lb-accent': 'var(--brand)',
        '--lb-surface': '#ffffff',
        '--lb-line': '#e6edf6',
      }}
    >
      <style>{`
        .lb-page { padding: 8px 0 40px; }
        .lb-head { text-align: center; max-width: 640px; margin: 0 auto 8px; padding: 0 16px; }
        .lb-eyebrow {
          display: inline-flex; align-items: center; gap: 7px;
          color: var(--lb-accent); font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.16em; font-size: 12.5px;
        }
        .lb-title {
          font-weight: 800; color: var(--lb-ink); letter-spacing: -0.02em;
          line-height: 1.12; margin: 12px 0 8px; font-size: clamp(26px, 4vw, 40px);
        }
        .lb-title em { color: var(--lb-accent); font-style: normal; }
        .lb-sub { color: var(--lb-muted); font-size: 14.5px; margin: 0 0 36px; }
        .mono-index { font-variant-numeric: tabular-nums; font-size: 14px; color: var(--lb-muted); }

        /* ═══════════ PODIUM ═══════════ */
        .podium-stage {
          display: grid;
          grid-template-columns: 1fr 1.12fr 1fr;
          gap: 14px;
          align-items: end;
          margin: 8px auto 44px;
          max-width: 640px;
          padding: 26px 8px 0;
        }
        .pd-col {
          position: relative; width: 100%;
          display: flex; flex-direction: column; align-items: center;
          opacity: 0;
          animation: pd-rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .pd-bronze { animation-delay: 0.05s; }
        .pd-silver { animation-delay: 0.28s; }
        .pd-gold   { animation-delay: 0.5s; }
        @keyframes pd-rise {
          from { opacity: 0; transform: translateY(46px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .pd-halo {
          position: absolute; top: -8%; left: 50%;
          width: 220px; height: 220px; transform: translateX(-50%);
          pointer-events: none; animation: pd-halo-pulse 3s ease-in-out infinite;
        }
        @keyframes pd-halo-pulse {
          0%, 100% { opacity: 0.55; transform: translateX(-50%) scale(1); }
          50%      { opacity: 1;    transform: translateX(-50%) scale(1.12); }
        }

        .pd-champ { position: relative; margin-bottom: 12px; animation: pd-float 3.4s ease-in-out infinite; }
        @keyframes pd-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }

        .pd-crown {
          position: absolute; top: -34px; left: 50%; transform: translateX(-50%);
          z-index: 3; filter: drop-shadow(0 4px 8px rgba(209, 138, 0, 0.45));
          animation: pd-crown-sway 2.6s ease-in-out infinite; transform-origin: bottom center;
        }
        @keyframes pd-crown-sway {
          0%, 100% { transform: translateX(-50%) rotate(-5deg); }
          50%      { transform: translateX(-50%) rotate(5deg); }
        }

        .pd-ring-wrap {
          position: relative; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 10px 26px var(--glow);
        }
        .pd-ring { position: absolute; inset: 0; border-radius: 50%; animation: pd-ring-spin 3.5s linear infinite; }
        @keyframes pd-ring-spin { to { transform: rotate(360deg); } }
        .pd-ring-inner {
          position: relative; z-index: 1; border-radius: 50%;
          background: #fff; padding: 3px; display: flex;
        }

        .pd-medal {
          position: absolute; bottom: -16px; right: -12px; z-index: 2;
          filter: drop-shadow(0 4px 7px rgba(0,0,0,0.22)); transform-origin: top center;
          animation: pd-medal-swing 3s ease-in-out infinite, pd-medal-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) 1s backwards;
        }
        @keyframes pd-medal-swing {
          0%, 100% { transform: rotate(-7deg); }
          50%      { transform: rotate(7deg); }
        }
        @keyframes pd-medal-pop {
          from { transform: scale(0); }
          to   { transform: scale(1); }
        }

        .pd-name {
          font-weight: 800; letter-spacing: -0.01em; text-align: center;
          line-height: 1.25; margin-top: 6px; position: relative; color: var(--lb-ink);
        }
        .pd-me { color: var(--lb-accent); font-size: 11.5px; font-weight: 700; margin-left: 5px; }
        .pd-rank-label {
          font-size: 11.5px; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.14em; margin-top: 3px; opacity: 0.85;
        }

        .pd-pill {
          color: #fff; font-weight: 800; font-size: 14.5px;
          padding: 5px 16px; border-radius: 999px; margin: 10px 0 14px;
          box-shadow: 0 6px 16px var(--glow), inset 0 1px 0 rgba(255,255,255,0.35);
          position: relative;
        }

        .pd-step {
          width: 100%; border-radius: 18px 18px 6px 6px;
          border: 1px solid; border-bottom-width: 4px;
          position: relative; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
        }
        .pd-step-num {
          font-size: 58px; font-weight: 900; line-height: 1; letter-spacing: -0.04em;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          opacity: 0.9; user-select: none;
        }
        .pd-gold .pd-step-num { font-size: 74px; }

        .pd-step-shine {
          position: absolute; top: 0; left: -70%; width: 55%; height: 100%;
          background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%);
          transform: skewX(-20deg); animation: pd-shine 3.6s ease-in-out infinite; pointer-events: none;
        }
        .pd-silver .pd-step-shine { animation-delay: 0.7s; }
        .pd-bronze .pd-step-shine { animation-delay: 1.4s; }
        @keyframes pd-shine {
          0%   { left: -70%; }
          40%  { left: 135%; }
          100% { left: 135%; }
        }

        .pd-spark {
          position: absolute; color: #f5b91e;
          text-shadow: 0 0 8px rgba(245, 185, 30, 0.8);
          pointer-events: none; z-index: 3; animation: pd-sparkle 1.9s ease-in-out infinite;
        }
        .pd-spark.s1 { top: 2px;  left: 16%; font-size: 15px; animation-delay: 0s; }
        .pd-spark.s2 { top: 42px; right: 12%; font-size: 11px; animation-delay: 0.5s; }
        .pd-spark.s3 { top: -14px; right: 26%; font-size: 13px; animation-delay: 1s; }
        .pd-spark.s4 { top: 70px; left: 9%;  font-size: 10px; animation-delay: 1.4s; }
        @keyframes pd-sparkle {
          0%, 100% { opacity: 0;   transform: scale(0.3) rotate(0deg); }
          50%      { opacity: 1;   transform: scale(1.15) rotate(40deg); }
        }

        .lb-table-wrap {
          max-width: 720px; margin: 0 auto; padding: 0 16px;
        }
        .lb-table .ant-table {
          background: var(--lb-surface);
          border: 1px solid var(--lb-line);
          border-radius: 14px; overflow: hidden;
        }
        .lb-table .highlighted-row > td { background: rgba(var(--brand-rgb), 0.06) !important; }

        @media (max-width: 580px) {
          .podium-stage { grid-template-columns: 1fr; gap: 30px; align-items: stretch; }
          .pd-order-1 { order: 1; } .pd-order-2 { order: 2; } .pd-order-3 { order: 3; }
          .pd-step { height: 74px !important; }
          .pd-step-num, .pd-gold .pd-step-num { font-size: 46px; }
        }
      `}</style>

      <div className="lb-head page-enter">
        <span className="lb-eyebrow"><TrophyOutlined /> {t('admin.leaderboardEyebrow')}</span>
        <h1 className="lb-title" dangerouslySetInnerHTML={{ __html: t('admin.leaderboardTitle').replace(/(\S+)\s*$/, '<em>$1</em>') }} />
        <p className="lb-sub">{t('admin.leaderboardSubtitle')}</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : data.length === 0 ? (
        <Empty description={t('admin.leaderboardEmpty')} style={{ padding: 40 }} />
      ) : (
        <>
          {/* ——— TOP-3 PODIUM: kumush | oltin | bronza ——— */}
          {top3.length > 0 && (
            <div className="podium-stage">
              <div className="pd-order-2" style={{ display: 'flex', alignItems: 'flex-end' }}>
                {top3[1] && <PodiumColumn entry={top3[1]} place={1} isMe={top3[1].id === user?.id} />}
              </div>
              <div className="pd-order-1" style={{ display: 'flex', alignItems: 'flex-end' }}>
                {top3[0] && <PodiumColumn entry={top3[0]} place={0} isMe={top3[0].id === user?.id} />}
              </div>
              <div className="pd-order-3" style={{ display: 'flex', alignItems: 'flex-end' }}>
                {top3[2] && <PodiumColumn entry={top3[2]} place={2} isMe={top3[2].id === user?.id} />}
              </div>
            </div>
          )}

          {/* Qolgan o'rinlar (4-o'rindan boshlab) */}
          {rest.length > 0 && (
            <div className="lb-table-wrap">
              <Table
                className="lb-table"
                dataSource={rest}
                columns={columns}
                rowKey="id"
                pagination={false}
                scroll={{ x: 640 }}
                rowClassName={(r) => (r.id === user?.id ? 'highlighted-row' : '')}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
