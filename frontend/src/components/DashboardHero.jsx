import { Typography } from 'antd';

// The page title every dashboard home opens with — bumped from antd's default
// h3 treatment to something that actually reads as "this is the start of the
// page" (bold, tight tracking, a small brand accent bar) rather than a plain
// label sitting above a grid of cards. One component so admin/teacher/student
// all get the same lift instead of three copies drifting apart.
export default function DashboardHero({ title, extra }) {
  return (
    <div
      className="premium-enter"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 22,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          className="hero-accent-bar"
          style={{
            width: 5, height: 26, borderRadius: 3, flex: '0 0 auto',
            background: 'linear-gradient(180deg, var(--brand), var(--ai-accent))',
          }}
        />
        <Typography.Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: '-0.02em' }}>
          {title}
        </Typography.Title>
      </div>
      {extra}
    </div>
  );
}
