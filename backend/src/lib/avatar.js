// Turns a user row's joined `profile: { avatarMime }` into the public URL a
// frontend <Avatar>/<img> can point at — the same shape as Subject/Book
// image URLs, and null (falls back to initials) when no photo is set.
// Needs the row's prisma query to include `profile: { select: { avatarMime: true } }`
// (or a wider select/include that still carries avatarMime).
export function avatarUrlOf(u) {
  return u?.profile?.avatarMime ? `/api/users/avatar/${u.id}` : null;
}
