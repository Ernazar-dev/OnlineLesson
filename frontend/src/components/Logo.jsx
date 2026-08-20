import logoMark from '../images/logo-mark.png';
import logoFull from '../images/logo-full.png';

// Single source of truth for the platform brand. The name lives here rather
// than in the locale files: it is a proper noun, so it stays identical in every
// language.
export const APP_NAME = "Masofaviy ta'lim";

// The same name broken where it reads best when it has to stack — the sider
// brand block sets it as two lines beside the mark.
export const APP_NAME_LINES = ['Masofaviy', "ta'lim"];

// Icon only (graduation cap + book + laptop, the platform's mark), cropped
// square from the source artwork and set on a white plate — for tight spots
// (sider header, favicon-sized slots) where the icon has to work on both the
// dark sider and light cards. See src/images/Masofaviy ta’lim logo.png for
// the full-resolution source this and logo-full.png were both cropped from.
export function LogoMark({ size = 36, radius = 10, style }) {
  return (
    <img
      src={logoMark}
      alt={APP_NAME}
      width={size}
      height={size}
      style={{
        flex: `0 0 ${size}px`,
        borderRadius: radius,
        objectFit: 'cover',
        display: 'block',
        ...style,
      }}
    />
  );
}

// Full lockup (icon + wordmark), cropped tight to its wide banner shape — for
// the login card and anywhere else with room to breathe.
export function LogoFull({ width = 200, style }) {
  return (
    <img
      src={logoFull}
      alt={APP_NAME}
      style={{ width, maxWidth: '100%', height: 'auto', borderRadius: 8, display: 'block', ...style }}
    />
  );
}
