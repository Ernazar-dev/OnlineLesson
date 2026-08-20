import { useState, useEffect, Suspense } from 'react';
import { Layout, Menu, Dropdown, Typography, Grid, Input } from 'antd';
import {
  DashboardOutlined, BookOutlined, FileTextOutlined, TrophyOutlined,
  BellOutlined, ReadOutlined, TeamOutlined, UserOutlined, SettingOutlined,
  ProfileOutlined, LogoutOutlined, MenuUnfoldOutlined, MenuFoldOutlined,
  DatabaseOutlined, NotificationOutlined, HistoryOutlined,
  QuestionCircleOutlined, CheckSquareOutlined, FileDoneOutlined,
  SolutionOutlined, SearchOutlined, VideoCameraOutlined,
} from '../icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/auth';
import Loading from '../components/Loading';
import LanguageSwitcher from '../components/LanguageSwitcher';
import NotificationBell from '../components/NotificationBell';
import UserAvatar from '../components/UserAvatar';
import { LogoMark, APP_NAME_LINES } from '../components/Logo';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

// Menu order mirrors the original Python dashboards so returning users find every
// item exactly where they left it. Items that only exist in this build
// (admin → subjects, student → notifications) are slotted next to the closest
// matching Python item rather than changing the established order.
const MENUS = {
  student: [
    { key: '/student', icon: <DashboardOutlined />, label: 'nav.overview' },
    { key: '/student/subjects', icon: <BookOutlined />, label: 'nav.subjects' },
    { key: '/student/assignments', icon: <FileTextOutlined />, label: 'nav.assignments' },
    { key: '/student/ratings', icon: <TrophyOutlined />, label: 'nav.academicParams' },
    { key: '/student/submissions', icon: <FileDoneOutlined />, label: 'nav.results' },
    { key: '/student/literature', icon: <ReadOutlined />, label: 'nav.literature' },
    { key: '/student/criteria', icon: <CheckSquareOutlined />, label: 'nav.criteria' },
    { key: '/student/groups', icon: <TeamOutlined />, label: 'nav.myGroups' },
    { key: '/student/live-sessions', icon: <VideoCameraOutlined />, label: 'nav.liveSessions' },
    { key: '/student/notifications', icon: <BellOutlined />, label: 'nav.notifications' },
    { key: '/student/news', icon: <NotificationOutlined />, label: 'nav.news' },
    { key: '/student/help', icon: <QuestionCircleOutlined />, label: 'nav.help' },
  ],
  teacher: [
    { key: '/teacher', icon: <DashboardOutlined />, label: 'nav.overview' },
    { key: '/teacher/assignments', icon: <FileTextOutlined />, label: 'nav.assignments' },
    { key: '/teacher/criteria', icon: <CheckSquareOutlined />, label: 'nav.criteria' },
    { key: '/teacher/students', icon: <TrophyOutlined />, label: 'nav.scores' },
    { key: '/teacher/groups', icon: <TeamOutlined />, label: 'nav.myGroups' },
    { key: '/teacher/live-sessions', icon: <VideoCameraOutlined />, label: 'nav.liveSessions' },
    { key: '/teacher/news', icon: <NotificationOutlined />, label: 'nav.news' },
    { key: '/teacher/literature', icon: <ReadOutlined />, label: 'nav.literature' },
    { key: '/teacher/help', icon: <QuestionCircleOutlined />, label: 'nav.help' },
  ],
  admin: [
    { key: '/admin', icon: <DashboardOutlined />, label: 'nav.stats' },
    { key: '/admin/users', icon: <UserOutlined />, label: 'nav.users' },
    { key: '/admin/teachers', icon: <SolutionOutlined />, label: 'nav.teachers' },
    { key: '/admin/groups', icon: <TeamOutlined />, label: 'nav.groups' },
    { key: '/admin/leaderboard', icon: <TrophyOutlined />, label: 'nav.leaderboard' },
    { key: '/admin/subjects', icon: <DatabaseOutlined />, label: 'nav.subjects' },
    { key: '/admin/news', icon: <NotificationOutlined />, label: 'nav.news' },
    { key: '/admin/logs', icon: <HistoryOutlined />, label: 'nav.logs' },
    { key: '/admin/notifications', icon: <BellOutlined />, label: 'nav.notifications' },
    { key: '/admin/help', icon: <QuestionCircleOutlined />, label: 'nav.help' },
    { key: '/admin/settings', icon: <SettingOutlined />, label: 'nav.settings' },
  ],
};

// Live clock in the header — the original admin top-bar showed the current time.
// Hours and minutes only: a seconds counter flickering in the corner is noise,
// not information.
function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <Typography.Text type="secondary" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </Typography.Text>
  );
}

export default function DashboardLayout() {
  const { t } = useTranslation();
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const [collapsed, setCollapsed] = useState(false);

  const rawItems = MENUS[role] || [];
  // Each icon rides in its own rounded chip (see .nav-icon-chip in index.css)
  // instead of sitting bare against the dark sider — mirrors the same
  // tinted-badge language StatCard already uses on the light side of the app.
  const items = rawItems.map((i) => ({
    ...i,
    icon: <span className="nav-icon-chip">{i.icon}</span>,
    label: t(i.label),
  }));
  // Select the deepest matching menu key
  const selected =
    items
      .map((i) => i.key)
      .filter((k) => location.pathname === k || location.pathname.startsWith(k + '/'))
      .sort((a, b) => b.length - a.length)[0] || items[0]?.key;

  const userMenu = {
    items: [
      { key: 'profile', icon: <ProfileOutlined />, label: t('nav.profile') },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: t('nav.logout'), danger: true },
    ],
    onClick: async ({ key }) => {
      if (key === 'logout') {
        await logout();
        navigate('/login');
      } else if (key === 'profile') {
        navigate(`/${role}/profile`);
      }
    },
  };

  // Admin header search — mirrors the original admin top-bar search box.
  // Submitting jumps to the Users list with the query applied.
  const onHeaderSearch = (value) => {
    const q = (value || '').trim();
    navigate(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        // 240 instead of antd's default 200: the widest menu label
        // ("Akademik parametrlar", and its Russian equivalent) needs the extra
        // room. The brand block no longer drives this — its name stacks.
        width={240}
        // `trigger={null}` drops the "<" bar antd pins to the bottom of the
        // sider. It duplicated the header's menu button and ate the space the
        // last menu item needed.
        trigger={null}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={screens.xs ? 0 : 80}
        theme="dark"
        style={{ position: 'sticky', top: 0, height: '100vh' }}
      >
        {/* Brand block: the shield alone when collapsed, shield on the left and
            the platform name stacked to its right when not. Two lines beside the
            mark instead of one long line — the block reads as a lockup, and the
            name gets a legible size instead of being shrunk to fit one row. */}
        <div
          style={{
            height: 44, flex: '0 0 auto', margin: '16px 12px 14px', paddingBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#fff',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <LogoMark size={38} radius={10} style={{ boxShadow: '0 4px 14px rgba(var(--brand-rgb), 0.55)' }} />
          {!collapsed && (
            <div className="brand-face" style={{ whiteSpace: 'nowrap', textAlign: 'left', letterSpacing: 0.2 }}>
              <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{APP_NAME_LINES[0]}</div>
              <div style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.25, color: 'rgba(255,255,255,0.72)' }}>
                {APP_NAME_LINES[1]}
              </div>
            </div>
          )}
        </div>
        {/* Scrolls independently — see .sider-menu in index.css. */}
        <div className="sider-menu">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selected]}
            items={items}
            onClick={({ key }) => navigate(key)}
          />
        </div>
      </Sider>

      <Layout>
        <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 4px rgba(var(--brand-rgb),0.06)', borderBottom: '1px solid #e8f0f7', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 auto', minWidth: 0 }}>
            <span
              onClick={() => setCollapsed(!collapsed)}
              className="header-icon-chip"
              style={{ cursor: 'pointer', fontSize: 17 }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </span>
            {role === 'admin' && !screens.xs && (
              <Input
                allowClear
                className="header-search"
                prefix={<SearchOutlined style={{ color: '#9aaebf' }} />}
                placeholder={t('admin.searchPlaceholder')}
                onPressEnter={(e) => onHeaderSearch(e.target.value)}
                onChange={(e) => { if (!e.target.value) onHeaderSearch(''); }}
                style={{ maxWidth: 320, width: '100%', background: '#f4faff' }}
                variant="filled"
              />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>
            {role === 'admin' && !screens.xs && <HeaderClock />}
            <NotificationBell />
            <LanguageSwitcher />
            <Dropdown menu={userMenu} placement="bottomRight">
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserAvatar
                  name={user?.display_name || user?.full_name || user?.username}
                  src={user?.avatar_url}
                  style={{ background: 'linear-gradient(135deg, var(--brand) 0%, var(--brand-light) 100%)' }}
                />
                {!screens.xs && (
                  <div style={{ lineHeight: 1.2 }}>
                    <Typography.Text strong>{user?.username}</Typography.Text>
                    <div style={{ fontSize: 12, color: '#999', textTransform: 'capitalize' }}>{role}</div>
                  </div>
                )}
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ margin: 16 }}>
          <Suspense fallback={<Loading />}>
            <div key={location.pathname} className="page-enter">
              <Outlet />
            </div>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}
