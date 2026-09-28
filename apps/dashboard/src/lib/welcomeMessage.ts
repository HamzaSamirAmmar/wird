// The ready-to-send message a supervisor pastes into WhatsApp/Telegram/SMS when handing a
// new employee their credentials. Centralized here so the single-create and bulk-create
// flows produce the exact same wording.

const BOT_USERNAME = 'wird_channel_bot';
const APP_URL = 'https://wird-app.pages.dev/';

export function buildWelcomeMessage({
  fullName,
  username,
  password,
}: {
  fullName: string;
  username: string;
  password: string;
}): string {
  return `السلام عليكم ورحمة الله وبركاته يا ${fullName}

تم إنشاء حسابك في تطبيق الورد اليومي، اتبع الخطوات التالية:

١. افتح بوت التيليجرام واضغط "Start" حتى يصلك تذكير وردك اليومي: https://t.me/${BOT_USERNAME}
٢. افتح التطبيق من هذا الرابط وسجّل الدخول ثم عيّن كلمة مرور جديدة: ${APP_URL}
٣. لتثبيت التطبيق على هاتفك من المتصفح: افتح الرابط أعلاه ثم من قائمة المتصفح اختر "إضافة إلى الشاشة الرئيسية"

اسم المستخدم: ${username}
كلمة المرور المؤقتة: ${password}

عن أبي أمامة الباهلي رضي الله عنه قال: سمعت رسول الله صلى الله عليه وسلم يقول: «اقْرَؤُوا الْقُرْآنَ فَإِنَّهُ يَأْتِي يَوْمَ الْقِيَامَةِ شَفِيعًا لِأَصْحَابِهِ» (رواه مسلم)

تقبل الله منك`;
}
