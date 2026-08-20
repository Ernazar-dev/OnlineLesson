// Reset the database to a clean state for testing "from zero".
// Wipes every table, resets auto-increment IDs, then recreates ONLY the single
// bootstrap admin (credentials from .env) and the default settings.
//
// Run with: npm run reset
import bcrypt from 'bcryptjs';
import prisma from './lib/prisma.js';
import config from './config.js';

const DEFAULT_SETTINGS = {
  ai_risk_threshold: '60',
  plagiarism_threshold: '70',
  max_file_size: '50',
  allowed_file_types: '.pdf,.py,.java,.cpp,.js,.txt,.docx,.pptx',
  default_language: 'ru',
  site_name: 'Independent Work Evaluation-AI',
  max_users_per_teacher: '30',
};

// All @@map table names from schema.prisma.
const TABLES = [
  'section_score',
  'plagiarism_match',
  'submission',
  'criterion_template',
  'deadline_extension',
  'criterion',
  'assignment',
  'notification',
  'academic_rating',
  'student_subject',
  'teacher_student',
  'teacher_subject',
  'book_download',
  'book',
  'news',
  'activity_log',
  'user_profile',
  'subject',
  'group',
  'department',
  'setting',
  'user',
];

async function createAdmin() {
  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  return prisma.user.create({
    data: {
      username: config.adminUsername,
      role: 'admin',
      fullName: config.adminFullName,
      isActive: true,
      passwordHash,
    },
  });
}

async function main() {
  console.log('Resetting database...');

  // Wipe everything and reset ID counters back to 1.
  const list = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
  console.log('All tables truncated, IDs reset.');

  // Recreate only the single bootstrap admin (credentials from .env).
  await createAdmin();

  // Default settings (config, not test content).
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.create({ data: { key, value } });
  }

  console.log('Reset complete. Bootstrap admin:');
  console.log(`  ${config.adminUsername} / (ADMIN_PASSWORD from .env)  (admin)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
