import { Card, Statistic } from 'antd';

// Stat tile with a gradient-tinted icon badge + a lifted hover. Rendered
// dozens of times across the three dashboards (admin/teacher/student), so
// this one component is the highest-leverage place to raise the "first
// screen after login" feel — every caller gets it for free.
export default function StatCard({ title, value, prefix, suffix, color = '#1c9de9' }) {
  return (
    <Card
      bordered={false}
      className="shadow-sm card-hover premium-enter"
      style={{ borderRadius: 18 }}
      styles={{ body: { display: 'flex', alignItems: 'center', gap: 16, padding: 20 } }}
    >
      {prefix && (
        <div
          className="stat-icon"
          style={{
            width: 50,
            height: 50,
            flex: '0 0 50px',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            color,
            background: `linear-gradient(135deg, ${color}26, ${color}0d)`,
            boxShadow: `inset 0 0 0 1px ${color}22`,
          }}
        >
          {prefix}
        </div>
      )}
      <Statistic title={title} value={value} suffix={suffix} valueStyle={{ color, fontWeight: 700, fontSize: 24 }} />
    </Card>
  );
}
