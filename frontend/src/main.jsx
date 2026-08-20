import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { useTranslation } from 'react-i18next';
import ruRU from 'antd/locale/ru_RU';
import uzUZ from 'antd/locale/uz_UZ';
import enUS from 'antd/locale/en_US';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/uz-latn';
import 'dayjs/locale/en';
import App from './App';
import './i18n';
import './index.css';

// Brand palette — `colorPrimary` starts from the logo mark's own royal blue
// (src/images/logo-mark.png), nudged further toward a clear-sky cyan-azure
// and given a little more air in its lightness: the same color family the
// mark uses, but the fresher, sun-on-water cut of it rather than a flat
// corporate blue. The semantic colors below are deliberately "fresh"
// (higher-chroma, less traffic-light) restyles of antd's stock
// success/warning/error, not antd's defaults.
const BRAND = '#1c9de9';

// A soft navy-tinted shadow scale (the same formula Untitled UI's own design
// system uses: layered rgba(16,24,40, …) rather than flat black) — reads as
// "premium SaaS" instead of the harsher default antd drop-shadow. --shadow-rgb
// is the CSS custom property backing it (index.css); componentss below build
// on the same three stops so every card/dropdown/popover in the app shares
// one consistent depth language.
const SHADOW_XS = '0 1px 2px rgba(var(--shadow-rgb),0.06)';
const SHADOW_SM = '0 1px 3px rgba(var(--shadow-rgb),0.08), 0 1px 2px rgba(var(--shadow-rgb),0.04)';
const SHADOW_MD = '0 4px 8px -2px rgba(var(--shadow-rgb),0.08), 0 2px 4px -2px rgba(var(--shadow-rgb),0.04)';
const SHADOW_LG = '0 12px 20px -4px rgba(var(--shadow-rgb),0.10), 0 4px 8px -2px rgba(var(--shadow-rgb),0.04)';

const theme = {
  token: {
    colorPrimary: BRAND,
    colorInfo: BRAND,
    colorLink: BRAND,
    colorSuccess: '#12b76a',
    colorWarning: '#f79009',
    colorError: '#f04438',
    borderRadius: 12,
    fontSize: 14,
    wireframe: false,
    colorBgLayout: '#f2f8fc',
    boxShadow: SHADOW_SM,
    boxShadowSecondary: SHADOW_MD,
    boxShadowTertiary: SHADOW_XS,
    // Inter for body/UI text everywhere; headings, the sidebar brand and nav
    // labels pick up Plus Jakarta Sans instead via index.css (both fonts are
    // loaded in index.html) — a deliberate two-face pairing rather than antd's
    // plain system-font default.
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  components: {
    Card: {
      paddingLG: 22, borderRadiusLG: 18,
      boxShadowTertiary: SHADOW_XS,
    },
    Button: { controlHeight: 38, fontWeight: 500, primaryShadow: '0 4px 12px rgba(var(--brand-rgb),0.28)', borderRadius: 10 },
    Input: { controlHeight: 38 },
    Table: { headerBg: '#f4faff', borderColor: '#e8f0f7' },
    Menu: { itemBorderRadius: 8, itemMarginInline: 8, darkItemBg: 'transparent' },
    Layout: { headerBg: '#ffffff', siderBg: '#0a2d40' },
    Dropdown: { boxShadowSecondary: SHADOW_LG },
    Modal: { boxShadow: SHADOW_LG },
    // Pill-shaped controls (see .ant-segmented / .ant-tabs overrides in
    // index.css for the rest of the treatment) — matches the rounded
    // grey-track toggle language the client's reference site uses.
    Segmented: { borderRadius: 8, trackBg: 'transparent', itemColor: '#5b6b7c', itemSelectedBg: '#ffffff' },
    Tabs: { itemSelectedColor: BRAND, inkBarColor: BRAND, titleFontSizeLG: 15 },
  },
};

const ANTD_LOCALES = { uz: uzUZ, ru: ruRU, en: enUS };
const DAYJS_LOCALES = { uz: 'uz-latn', ru: 'ru', en: 'en' };

// Keeps antd's built-in strings (date pickers, pagination, empty states) and
// dayjs formatting in sync with the language picked in the UI.
function LocalizedApp() {
  const { i18n } = useTranslation();
  const lng = ANTD_LOCALES[i18n.language] ? i18n.language : 'uz';
  dayjs.locale(DAYJS_LOCALES[lng]);

  return (
    <ConfigProvider theme={theme} locale={ANTD_LOCALES[lng]}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LocalizedApp />
  </React.StrictMode>
);
