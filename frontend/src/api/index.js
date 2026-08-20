import api from './client';

export const authApi = {
  // `retry` because this is the request that meets a sleeping server first, and
  // repeating it is harmless — signing in twice leaves you signed in once.
  login: (data) => api.post('/auth/login', data, { retry: true }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
};

export const usersApi = {
  profile: () => api.get('/api/users/profile').then((r) => r.data),
  updateProfile: (data) => api.put('/api/users/profile', data).then((r) => r.data),
  changePassword: (data) => api.put('/api/users/password', data).then((r) => r.data),
  myGroup: () => api.get('/api/users/my-group').then((r) => r.data),
  uploadAvatar: (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return api.post('/api/users/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  removeAvatar: () => api.delete('/api/users/avatar').then((r) => r.data),
};

export const assignmentsApi = {
  list: () => api.get('/assignments/').then((r) => r.data),
  get: (id) => api.get(`/assignments/${id}`).then((r) => r.data),
  create: (data) => api.post('/assignments/', data).then((r) => r.data),
  update: (id, data) => api.put(`/assignments/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/assignments/${id}`).then((r) => r.data),
  mySubmissions: () => api.get('/assignments/my_submissions').then((r) => r.data),
  submissions: (id) => api.get(`/assignments/${id}/submissions`).then((r) => r.data),
  roster: (id) => api.get(`/assignments/${id}/roster`).then((r) => r.data),
  extendDeadline: (id, data) => api.post(`/assignments/${id}/extend`, data).then((r) => r.data),
  submissionDetail: (id) => api.get(`/assignments/submissions/${id}`).then((r) => r.data),
  criteria: (id) => api.get(`/assignments/${id}/criteria`).then((r) => r.data),
  saveCriteria: (id, criteria) => api.put(`/assignments/${id}/criteria`, { criteria }).then((r) => r.data),
  review: (id, data) => api.post(`/assignments/submissions/${id}/review`, data).then((r) => r.data),
  recheckPlagiarism: (id) =>
    api.post(`/assignments/submissions/${id}/plagiarism-check`).then((r) => r.data),
  submit: (id, formData) =>
    api.post(`/assignments/${id}/submit`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),
  exportPdf: (id) => api.get(`/assignments/export/${id}`, { responseType: 'blob' }).then((r) => r.data),
  downloadFile: (id) => api.get(`/assignments/download/${id}`, { responseType: 'blob' }).then((r) => r.data),
};

export const subjectsApi = {
  list: () => api.get('/api/subjects/').then((r) => r.data),
  assignments: (id) => api.get(`/api/subjects/${id}/assignments`).then((r) => r.data),
  ratings: () => api.get('/api/subjects/academic-ratings').then((r) => r.data),
  recalc: (id) => api.post(`/api/subjects/${id}/calculate-rating`).then((r) => r.data),
  reportPdf: () => api.get('/api/subjects/academic-report/download', { responseType: 'blob' }).then((r) => r.data),
};

export const notificationsApi = {
  list: () => api.get('/api/notifications/').then((r) => r.data),
  read: (id) => api.post(`/api/notifications/${id}/read`).then((r) => r.data),
  readAll: () => api.post('/api/notifications/read-all').then((r) => r.data),
};

// Read-only news feed — what admin/News.jsx publishes, scoped server-side to
// the caller's own role (plus anything aimed at everyone).
export const newsApi = {
  list: () => api.get('/api/news').then((r) => r.data),
};

// The handful of admin settings non-admin pages need to actually honour
// (currently just the upload size cap) — see routes/settings.js.
export const settingsApi = {
  public: () => api.get('/api/settings/public').then((r) => r.data),
};

export const literatureApi = {
  list: () => api.get('/api/literature/').then((r) => r.data),
  add: (formData) =>
    api.post('/api/literature/', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  update: (id, formData) =>
    api.put(`/api/literature/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  remove: (id) => api.delete(`/api/literature/${id}`).then((r) => r.data),
  download: (id) => api.get(`/api/literature/download/${id}`, { responseType: 'blob' }).then((r) => r.data),
  downloads: () => api.get('/api/literature/downloads').then((r) => r.data),
};

export const liveSessionsApi = {
  list: () => api.get('/api/live-sessions').then((r) => r.data),
  get: (id) => api.get(`/api/live-sessions/${id}`).then((r) => r.data),
  create: (data) => api.post('/api/live-sessions', data).then((r) => r.data),
  start: (id) => api.patch(`/api/live-sessions/${id}/start`).then((r) => r.data),
  end: (id) => api.patch(`/api/live-sessions/${id}/end`).then((r) => r.data),
  cancel: (id) => api.delete(`/api/live-sessions/${id}`).then((r) => r.data),
  // Issues the short-lived Agora join credentials — called by AgoraVideoRoom
  // itself right before joining, never cached, never requested for a session
  // that isn't already live.
  getToken: (id) => api.post(`/api/live-sessions/${id}/token`).then((r) => r.data),
  leave: (id) => api.post(`/api/live-sessions/${id}/leave`).then((r) => r.data),
  // uid -> real name for everyone allowed in this session's call, so remote
  // tiles can be labelled with a name instead of Agora's bare numeric uid.
  roster: (id) => api.get(`/api/live-sessions/${id}/roster`).then((r) => r.data),
  // Who's on the big stage right now — polled by everyone in the call,
  // written only by the teacher (see AgoraVideoRoom's spotlight controls).
  getSpotlight: (id) => api.get(`/api/live-sessions/${id}/spotlight`).then((r) => r.data),
  setSpotlight: (id, uid) => api.post(`/api/live-sessions/${id}/spotlight`, { uid }).then((r) => r.data),
};

export const teacherApi = {
  groups: () => api.get('/api/teacher/groups').then((r) => r.data),
  groupActivity: () => api.get('/api/teacher/group-activity').then((r) => r.data),
  groupStudents: (id) => api.get(`/api/teacher/groups/${id}/students`).then((r) => r.data),
  students: () => api.get('/api/teacher/students').then((r) => r.data),
  student: (id) => api.get(`/api/teacher/student/${id}`).then((r) => r.data),
  // Reusable criteria library
  criteria: () => api.get('/api/teacher/criteria').then((r) => r.data),
  createCriterion: (data) => api.post('/api/teacher/criteria', data).then((r) => r.data),
  updateCriterion: (id, data) => api.put(`/api/teacher/criteria/${id}`, data).then((r) => r.data),
  deleteCriterion: (id) => api.delete(`/api/teacher/criteria/${id}`).then((r) => r.data),
  loadStandardCriteria: () => api.post('/api/teacher/criteria/load-standard').then((r) => r.data),
};

export const adminApi = {
  stats: () => api.get('/api/admin/stats').then((r) => r.data),
  users: () => api.get('/api/admin/users').then((r) => r.data),
  createUser: (data) => api.post('/api/admin/users', data).then((r) => r.data),
  updateUser: (id, data) => api.put(`/api/admin/users/${id}`, data).then((r) => r.data),
  deleteUser: (id) => api.delete(`/api/admin/users/${id}`).then((r) => r.data),
  toggleUser: (id) => api.post(`/api/admin/users/${id}/toggle`).then((r) => r.data),
  subjects: () => api.get('/api/admin/subjects').then((r) => r.data),
  // Multipart so the picture can travel alongside name/code/description in one
  // request, same shape as literatureApi.add/update.
  createSubject: (formData) =>
    api.post('/api/admin/subjects', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  updateSubject: (id, formData) =>
    api.put(`/api/admin/subjects/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  deleteSubject: (id) => api.delete(`/api/admin/subjects/${id}`).then((r) => r.data),
  groups: () => api.get('/api/admin/groups').then((r) => r.data),
  groupActivity: () => api.get('/api/admin/group-activity').then((r) => r.data),
  createGroup: (data) => api.post('/api/admin/groups', data).then((r) => r.data),
  updateGroup: (id, data) => api.put(`/api/admin/groups/${id}`, data).then((r) => r.data),
  deleteGroup: (id) => api.delete(`/api/admin/groups/${id}`).then((r) => r.data),
  groupStudents: (id) => api.get(`/api/admin/groups/${id}/students`).then((r) => r.data),
  // A student's profile + stats for the group roster drawer — the teacher
  // route already allows the admin role, so there's no need for a duplicate.
  studentDetail: (id) => api.get(`/api/teacher/student/${id}`).then((r) => r.data),
  teachers: () => api.get('/api/admin/teachers').then((r) => r.data),
  news: () => api.get('/api/admin/news').then((r) => r.data),
  createNews: (data) => api.post('/api/admin/news', data).then((r) => r.data),
  updateNews: (id, data) => api.put(`/api/admin/news/${id}`, data).then((r) => r.data),
  deleteNews: (id) => api.delete(`/api/admin/news/${id}`).then((r) => r.data),
  settings: () => api.get('/api/admin/settings').then((r) => r.data),
  saveSettings: (data) => api.post('/api/admin/settings', data).then((r) => r.data),
  logs: () => api.get('/api/admin/activity-logs').then((r) => r.data),
  leaderboard: () => api.get('/api/admin/stats/leaderboard').then((r) => r.data),
  // Teacher actions feed (assignment created, live session started, …) — see
  // the comment on GET /admin/notifications for why it reads ActivityLog now.
  notifications: () => api.get('/api/admin/notifications').then((r) => r.data),
};
