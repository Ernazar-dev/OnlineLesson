import { Grid } from 'antd';

const { useBreakpoint } = Grid;

// Single source of truth for "phone-width screen" — DashboardLayout already
// reads `screens.xs` this same way (antd's xs breakpoint is a max-width
// query, true only below ~576px) to hide the header search/clock; this hook
// just gives every page that same check without hand-rolling its own
// matchMedia listener or duplicating the antd Grid import.
export default function useIsMobile() {
  const screens = useBreakpoint();
  return !!screens.xs;
}
