import { Dropdown, Button } from 'antd';
import { GlobalOutlined, DownOutlined, CheckOutlined } from '../icons';
import { useTranslation } from 'react-i18next';
import { setLang, SUPPORTED } from '../i18n';

const LABELS = { uz: "O'zbekcha", ru: 'Русский', en: 'English' };
const SHORT = { uz: 'UZ', ru: 'RU', en: 'EN' };

export default function LanguageSwitcher({ size = 'middle', type = 'text' }) {
  const { i18n } = useTranslation();
  const current = SUPPORTED.includes(i18n.language) ? i18n.language : 'uz';

  const menu = {
    items: SUPPORTED.map((lng) => ({
      key: lng,
      label: LABELS[lng],
      icon: lng === current ? <CheckOutlined /> : <span style={{ display: 'inline-block', width: 14 }} />,
    })),
    onClick: ({ key }) => setLang(key),
  };

  return (
    <Dropdown menu={menu} placement="bottomRight" trigger={['click']}>
      <Button type={type} size={size} icon={<GlobalOutlined />}>
        {SHORT[current]} <DownOutlined style={{ fontSize: 10 }} />
      </Button>
    </Dropdown>
  );
}
