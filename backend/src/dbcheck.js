// Bazani tekshirish: nega /auth/login 500 qaytaryapti?
//
// Login xatosi markaziy error handler'da 500 bo'lib chiqadi va haqiqiy sabab
// faqat server logida qoladi — hostda logga yetib bo'lmasa, hech narsa ko'rinmaydi.
// Bu skript o'sha uch savolga to'g'ridan-to'g'ri javob beradi:
//
//   1. .env topildimi va DATABASE_URL qaysi hostga qarayapti (parol yashiriladi)
//   2. Bazaga ulanish ishlayaptimi (sslmode/parol/tarmoq)
//   3. Jadvallar mavjudmi va admin foydalanuvchi bormi (db push + seed qilinganmi)
//
// Ishga tushirish (backend/ ichidan):  node src/dbcheck.js

import config from './config.js';
import prisma from './lib/prisma.js';

/** Parolni ko'rsatmasdan, ulanish satrining muhim qismlarini chiqaradi. */
function describeUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return {
      host: u.hostname,
      port: u.port || '5432',
      database: u.pathname.replace(/^\//, ''),
      user: u.username,
      params: u.search ? u.search.slice(1) : '(yo‘q)',
    };
  } catch {
    return { host: '(URL o‘qib bo‘lmadi — tirnoq/format xato?)' };
  }
}

console.log('\n=== DB tekshiruvi ===');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('XATO: DATABASE_URL bo‘sh. .env fayl topilmadi yoki o‘qilmadi.');
  console.error('  cwd:', process.cwd(), '— .env aynan shu papkada (backend/) bo‘lishi kerak.');
  process.exit(1);
}

const info = describeUrl(url);
console.log('DATABASE_URL:', JSON.stringify(info, null, 2));

// Neon SSL talab qiladi va ulanish satrida sslmode bo'lmasa ulanishni rad etadi.
if (/neon\.tech/.test(info.host || '') && !/sslmode=/.test(url))
  console.warn('⚠  Neon, lekin sslmode= yo‘q — ?sslmode=require qo‘shing.');
// Pooler (pgbouncer) orqali `prisma db push` ishlamaydi; sxemani direct URL bilan yuboring.
if (/-pooler\./.test(info.host || ''))
  console.warn('⚠  Pooler host — `prisma db push` uchun direct (‘-pooler’siz) URL kerak.');

try {
  await prisma.$queryRaw`SELECT 1`;
  console.log('✅ Ulanish: OK');
} catch (e) {
  console.error('❌ Ulanish XATO:', e.code || '', e.message.split('\n')[0]);
  console.error('  P1001 = hostga yetib bo‘lmadi (sslmode/tarmoq), P1000 = parol xato.');
  process.exit(1);
}

try {
  const users = await prisma.user.count();
  console.log(`✅ "users" jadvali: OK (${users} ta foydalanuvchi)`);
  if (users === 0) console.warn('⚠  Baza bo‘sh — `npm run seed` ishlatilmagan.');

  const admin = await prisma.user.findUnique({ where: { username: config.adminUsername } });
  if (admin) console.log(`✅ Admin "${admin.username}" bor (role=${admin.role}, active=${admin.isActive})`);
  else console.warn(`⚠  Admin "${config.adminUsername}" topilmadi — "npm run seed" kerak.`);
} catch (e) {
  console.error('❌ So‘rov XATO:', e.code || '', e.message.split('\n')[0]);
  if (e.code === 'P2021' || /does not exist/i.test(e.message))
    console.error('  Jadvallar yo‘q — yangi Neon bazasiga `npm run prisma:push` qilinmagan.');
  process.exit(1);
}

await prisma.$disconnect();
console.log('=== Hammasi joyida: login 500 sababi bazada emas ===\n');
