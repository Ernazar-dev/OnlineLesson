import { Avatar } from 'antd';
import { initials } from '../utils/format';
import { mediaUrl } from '../api/client';

// A user's circular picture — the photo they set from /profile, or their
// initials on a brand tile when they haven't set one. AntD's <Avatar> falls
// back to its children automatically if `src` is missing or fails to load,
// so every caller gets the same behavior for free just by passing name+src.
export default function UserAvatar({ name, src, size = 32, style, ...rest }) {
  return (
    <Avatar
      size={size}
      src={mediaUrl(src) || undefined}
      style={{ background: 'var(--brand)', color: '#fff', fontWeight: 600, flex: '0 0 auto', ...style }}
      {...rest}
    >
      {initials(name)}
    </Avatar>
  );
}
