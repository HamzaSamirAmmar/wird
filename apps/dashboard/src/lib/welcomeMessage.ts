// The ready-to-send message a supervisor pastes into Telegram/WhatsApp when handing a new
// employee their credentials. Centralized so single-create and bulk-create produce the same text.
//
// Username and password are wrapped in backticks: Telegram renders `text` as monospace on send,
// and a monospace span is copied with a single tap. Elsewhere the backticks are harmless.

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

تم إنشاء حسابك في تطبيق الورد اليومي.

اسم المستخدم:
\`${username}\`

كلمة المرور المؤقتة:
\`${password}\`

(اضغط على أيٍّ منهما لنسخه)

الخطوات:
١. افتح التطبيق وسجّل الدخول ثم عيّن كلمة مرور جديدة:
${APP_URL}
٢. ثبّت التطبيق: من قائمة المتصفح اختر "إضافة إلى الشاشة الرئيسية".
٣. افتح البوت واضغط "Start" ليصلك وردك يومياً:
https://t.me/${BOT_USERNAME}

«اقْرَؤُوا الْقُرْآنَ فَإِنَّهُ يَأْتِي يَوْمَ الْقِيَامَةِ شَفِيعًا لِأَصْحَابِهِ» (رواه مسلم)

تقبل الله منك`;
}
