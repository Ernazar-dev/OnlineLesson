// Seed the platform's baseline: the single bootstrap admin (credentials from
// .env), a starter department + subjects, and default settings. No demo teacher
// or student accounts — the admin creates every other account from inside the
// app and hands out the login/password.
// Run with: npm run seed
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

async function upsertAdmin() {
  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  return prisma.user.upsert({
    where: { username: config.adminUsername },
    update: { role: 'admin', fullName: config.adminFullName, passwordHash, isActive: true },
    create: {
      username: config.adminUsername,
      role: 'admin',
      fullName: config.adminFullName,
      isActive: true,
      passwordHash,
    },
  });
}

async function main() {
  console.log('Seeding database...');

  const admin = await upsertAdmin();

  // Department + subjects (structural starter data, not demo accounts)
  const dep = await prisma.department.upsert({
    where: { name: 'Computer Science' },
    update: {},
    create: { name: 'Computer Science', description: 'CS Department' },
  });

  const subjectNames = ['Programming', 'Engineering Mathematics', 'Databases'];
  for (const name of subjectNames) {
    await prisma.subject.upsert({
      where: { code: name.toUpperCase().replace(/ /g, '_') },
      update: {},
      create: {
        name,
        code: name.toUpperCase().replace(/ /g, '_'),
        description: `${name} course`,
        departmentId: dep.id,
      },
    });
  }

  // Settings
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // Welcome news
  const newsCount = await prisma.news.count();
  if (newsCount === 0) {
    await prisma.news.create({
      data: {
        title: 'Welcome to AI Assistant Platform',
        content: 'The platform has been migrated to Node.js + PostgreSQL + React.',
        authorId: admin.id,
      },
    });
  }

  console.log('Seed complete.');
  console.log(`  ${config.adminUsername} / (ADMIN_PASSWORD from .env)  (admin)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
