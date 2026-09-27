import { isValidUsername } from '@wird/domain';

// ──────────────────────────────────────────────────────────────────────────────
// Common Arabic names → standard English transliteration
// Checked against dictionary first, so أحمد→ahmad not ahmd.
// ──────────────────────────────────────────────────────────────────────────────

const NAMES: Record<string, string> = {
  // ── Male names ───────────────────────────────────────────────────────────
  'محمد': 'muhammad',
  'أحمد': 'ahmad',
  'احمد': 'ahmad',
  'علي': 'ali',
  'حسن': 'hasan',
  'حسين': 'hussein',
  'إبراهيم': 'ibrahim',
  'ابراهيم': 'ibrahim',
  'خالد': 'khalid',
  'عمر': 'omar',
  'يوسف': 'yusuf',
  'سعد': 'saad',
  'فهد': 'fahad',
  'سلطان': 'sultan',
  'ناصر': 'nasser',
  'صالح': 'saleh',
  'سليمان': 'sulaiman',
  'فيصل': 'faisal',
  'تركي': 'turki',
  'ماجد': 'majed',
  'سامي': 'sami',
  'وليد': 'waleed',
  'طارق': 'tariq',
  'ياسر': 'yasser',
  'أنس': 'anas',
  'انس': 'anas',
  'عثمان': 'othman',
  'بلال': 'bilal',
  'عمار': 'ammar',
  'حمزة': 'hamza',
  'حمزه': 'hamza',
  'زياد': 'ziad',
  'راشد': 'rashed',
  'سالم': 'salem',
  'منصور': 'mansour',
  'سعيد': 'saeed',
  'مبارك': 'mubarak',
  'هاني': 'hani',
  'نايف': 'nayef',
  'مشعل': 'mishaal',
  'بدر': 'badr',
  'بندر': 'bandar',
  'جاسم': 'jasim',
  'حمد': 'hamad',
  'ريان': 'rayan',
  'آدم': 'adam',
  'ادم': 'adam',
  'عيسى': 'issa',
  'موسى': 'musa',
  'نوح': 'nouh',
  'هارون': 'haroun',
  'داود': 'dawood',
  'يحيى': 'yahya',
  'أيوب': 'ayoub',
  'ايوب': 'ayoub',
  'يونس': 'younus',
  'إسماعيل': 'ismail',
  'اسماعيل': 'ismail',
  'إسحاق': 'ishaq',
  'اسحاق': 'ishaq',
  'يعقوب': 'yaqoub',
  'مصطفى': 'mustafa',
  'كريم': 'kareem',
  'عادل': 'adel',
  'ماهر': 'maher',
  'زيد': 'zaid',
  'مالك': 'malik',
  'حاتم': 'hatem',
  'رامي': 'rami',
  'باسم': 'basem',
  'مروان': 'marwan',
  'ليث': 'laith',
  'عمران': 'imran',
  'أسامة': 'osama',
  'اسامة': 'osama',
  'أسامه': 'osama',
  'فارس': 'fares',
  'سيف': 'saif',
  'عماد': 'emad',
  'نبيل': 'nabil',
  'جمال': 'jamal',
  'أمين': 'amin',
  'امين': 'amin',
  'شريف': 'sharif',
  'رضا': 'rida',
  'هشام': 'hisham',
  'توفيق': 'tawfiq',
  'وائل': 'wael',
  'غسان': 'ghassan',
  'رائد': 'raed',
  'أيمن': 'ayman',
  'ايمن': 'ayman',
  'أشرف': 'ashraf',
  'اشرف': 'ashraf',
  'عصام': 'essam',
  'حسام': 'hussam',
  'ثامر': 'thamer',
  'مشاري': 'mishari',
  'عدنان': 'adnan',
  'محمود': 'mahmoud',
  'مصعب': 'musab',
  'أنور': 'anwar',
  'انور': 'anwar',
  'عامر': 'amer',
  'سراج': 'siraj',
  'ثابت': 'thabet',
  'معاذ': 'muath',
  'طلال': 'talal',
  'نواف': 'nawaf',
  'سعود': 'saud',
  'عبدالله': 'abdullah',
  'عبدالرحمن': 'abdulrahman',
  'عبدالعزيز': 'abdulaziz',
  'عبدالملك': 'abdulmalik',
  'عبدالكريم': 'abdulkareem',
  'عبدالحكيم': 'abdulhakeem',
  'عبدالسلام': 'abdulsalam',
  'عبدالقادر': 'abdulqader',
  'عبدالمجيد': 'abdulmajeed',
  'عبدالحميد': 'abdulhameed',
  'عبدالرحيم': 'abdulraheem',
  'عبدالواحد': 'abdulwahed',
  'عبدالرزاق': 'abdulrazzaq',
  'عبدالباسط': 'abdulbaset',
  'عبدالمحسن': 'abdulmohsen',
  'عبدالإله': 'abdulilah',
  'عبدالاله': 'abdulilah',
  'عبدالجبار': 'abduljabbar',
  'عبدالفتاح': 'abdulfattah',
  'عبدالهادي': 'abdulhadi',
  'عبدالنور': 'abdulnour',
  'عبدالعظيم': 'abdulazeem',
  'عبداللطيف': 'abdullatif',
  'عبدالمنعم': 'abdulmunem',
  'عبدالرؤوف': 'abdulraouf',
  'رضوان': 'ridwan',
  'عبده': 'abdo',
  'مراد': 'murad',
  'فراس': 'firas',
  'إياد': 'eyad',
  'اياد': 'eyad',
  'بشار': 'bashar',
  'بشر': 'bishr',
  'تيسير': 'tayseer',
  'جابر': 'jaber',
  'حذيفة': 'huthaifa',
  'حذيفه': 'huthaifa',
  'خليل': 'khalil',
  'زهير': 'zuhair',
  'سامر': 'samer',
  'شادي': 'shadi',
  'صهيب': 'suhaib',
  'ضياء': 'diaa',
  'عبد': 'abd',
  'عدي': 'adi',
  'فادي': 'fadi',
  'قاسم': 'qasim',
  'كمال': 'kamal',
  'لؤي': 'louai',
  'مؤيد': 'muayad',
  'مأمون': 'mamoun',
  'مجد': 'majd',
  'معتز': 'mutaz',
  'نادر': 'nader',
  'هيثم': 'haitham',
  'وسام': 'wesam',
  'وسيم': 'waseem',
  'يزيد': 'yazeed',
  'يامن': 'yamen',
  'سهيل': 'suhail',
  'صلاح': 'salah',
  'عابد': 'abed',
  'رياض': 'riyad',
  'غيث': 'ghaith',
  'أمجد': 'amjad',
  'امجد': 'amjad',
  'حارث': 'harith',
  'باسل': 'basel',
  'تميم': 'tamim',
  'نعمان': 'numan',
  'رفيق': 'rafiq',
  'وحيد': 'waheed',
  'مجاهد': 'mujahid',
  'جهاد': 'jihad',
  'همام': 'humam',
  'عبير': 'abeer',
  'أكرم': 'akram',
  'اكرم': 'akram',
  'أسعد': 'asaad',
  'سمير': 'samir',
  'طلحة': 'talha',
  'طلحه': 'talha',
  'عزيز': 'aziz',
  'حبيب': 'habib',
  'إلياس': 'ilyas',
  'الياس': 'ilyas',
  'عارف': 'aref',
  'لطفي': 'lutfi',
  'رشيد': 'rasheed',
  'حميد': 'hameed',
  'مجيد': 'majeed',
  'رشاد': 'rashad',
  'فؤاد': 'fuad',
  'جلال': 'jalal',
  'بهاء': 'bahaa',
  'علاء': 'alaa',
  'زكي': 'zaki',
  'مازن': 'mazen',
  'تامر': 'tamer',
  'عمرو': 'amr',
  'شيخ': 'sheikh',
  'نصر': 'nasr',
  'قصي': 'qusai',
  'هلال': 'hilal',
  'جعفر': 'jaafar',
  'أوس': 'aws',
  'اوس': 'aws',
  'يزن': 'yazan',
  'نذير': 'nadhir',
  'وضاح': 'waddah',
  'ظافر': 'dhafer',
  'صقر': 'saqr',
  'عزام': 'azzam',
  'هاشم': 'hashem',
  'سنان': 'sinan',
  'رؤوف': 'raouf',
  'لبيب': 'labib',
  'شكري': 'shukri',
  'أنيس': 'anis',
  'انيس': 'anis',

  // ── Female names ─────────────────────────────────────────────────────────
  'فاطمة': 'fatima',
  'فاطمه': 'fatima',
  'عائشة': 'aisha',
  'عائشه': 'aisha',
  'خديجة': 'khadija',
  'خديجه': 'khadija',
  'مريم': 'mariam',
  'زينب': 'zainab',
  'نورة': 'noura',
  'نوره': 'noura',
  'نور': 'nour',
  'سارة': 'sara',
  'ساره': 'sara',
  'ليلى': 'laila',
  'هند': 'hind',
  'لينا': 'lina',
  'ريم': 'reem',
  'رنا': 'rana',
  'دانا': 'dana',
  'هدى': 'huda',
  'سلمى': 'salma',
  'أسماء': 'asmaa',
  'اسماء': 'asmaa',
  'لمياء': 'lamiaa',
  'ملاك': 'malak',
  'روان': 'rawan',
  'جنى': 'jana',
  'حلا': 'hala',
  'تالا': 'tala',
  'سمر': 'samar',
  'أمل': 'amal',
  'امل': 'amal',
  'نجلاء': 'najlaa',
  'منال': 'manal',
  'مها': 'maha',
  'ابتسام': 'ibtisam',
  'سناء': 'sanaa',
  'وفاء': 'wafaa',
  'رغد': 'raghad',
  'شهد': 'shahad',
  'لولوة': 'lulwa',
  'لولوه': 'lulwa',
  'حصة': 'hessa',
  'حصه': 'hessa',
  'منيرة': 'muneera',
  'منيره': 'muneera',
  'بشرى': 'bushra',
  'رقية': 'ruqaya',
  'رقيه': 'ruqaya',
  'سمية': 'sumaya',
  'سميه': 'sumaya',
  'ياسمين': 'yasmin',
  'نادين': 'nadine',
  'لمى': 'lama',
  'هيا': 'haya',
  'مي': 'mai',
  'نهى': 'nuha',
  'غادة': 'ghada',
  'غاده': 'ghada',
  'رانيا': 'rania',
  'رانية': 'rania',
  'رانيه': 'rania',
  'سلوى': 'salwa',
  'ديما': 'dima',
  'آلاء': 'alaa',
  'الاء': 'alaa',
  'آمنة': 'amna',
  'امنة': 'amna',
  'آمنه': 'amna',
  'إيمان': 'iman',
  'ايمان': 'iman',
  'أريج': 'areej',
  'اريج': 'areej',
  'بتول': 'batool',
  'تسنيم': 'tasneem',
  'جميلة': 'jameela',
  'جميله': 'jameela',
  'حنين': 'haneen',
  'دعاء': 'duaa',
  'رهام': 'reham',
  'رهف': 'rahaf',
  'سدين': 'sadeen',
  'شيماء': 'shaimaa',
  'عفاف': 'afaf',
  'لجين': 'lujain',
  'لطيفة': 'latifa',
  'لطيفه': 'latifa',
  'ميسون': 'maysoon',
  'هديل': 'hadeel',
  'وجدان': 'wijdan',

  // ── Common last-name / tribe patterns ────────────────────────────────────
  'الله': 'allah',
  'الرحمن': 'alrahman',
  'الدين': 'aldin',
  'الحق': 'alhaq',
  'الإسلام': 'alislam',
  'الاسلام': 'alislam',
};

// ──────────────────────────────────────────────────────────────────────────────
// Character-level Arabic → Latin fallback
// ──────────────────────────────────────────────────────────────────────────────

/** Arabic diacritics (tashkeel) to strip before transliterating */
const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

const CHAR_MAP: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ؤ': 'u', 'ئ': 'i', 'ء': '',
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a',
};

/** Transliterate a single Arabic word using the character map */
function charMapWord(word: string): string {
  const stripped = word.replace(TASHKEEL, '');
  let result = '';
  for (const ch of stripped) {
    result += CHAR_MAP[ch] ?? ch; // pass through Latin / digits
  }
  return result;
}

/** Check if a string contains any Arabic characters */
function hasArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

/**
 * Transliterate a single word — dictionary first, char-map fallback.
 * Handles عبد + second-word compounds written as two words.
 */
function transliterateWord(word: string): string {
  if (!hasArabic(word)) return word; // English / digits pass through

  // Strip tashkeel for dictionary lookup too
  const clean = word.replace(TASHKEEL, '');

  // Exact dictionary hit
  if (NAMES[clean]) return NAMES[clean];

  // Character-level fallback
  return charMapWord(clean);
}

/**
 * Suggests a valid username from a full name (Arabic or English).
 *
 * Uses a dictionary of ~200 common Arabic names for natural transliteration,
 * falling back to character-level mapping for unknown names.
 *
 * Examples:
 *   'أحمد علي'      → 'ahmad_ali'
 *   'محمد الحسن'    → 'muhammad_alhsn'
 *   'عبد الله خالد'  → 'abdullah_khalid'
 *   'John Doe'      → 'john_doe'
 *   'فاطمة الزهراء' → 'fatima_alzhraa'
 */
export function suggestUsername(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';

  const words = trimmed.split(/\s+/);

  // Handle عبد compounds written with a space: merge عبد + next word
  const merged: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const clean = words[i].replace(TASHKEEL, '');
    if (clean === 'عبد' && i + 1 < words.length) {
      merged.push(words[i] + words[i + 1]);
      i++; // skip next word, it's been merged
    } else {
      merged.push(words[i]);
    }
  }

  const parts = merged.map(transliterateWord);

  const suggested = parts
    .join('_')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '') // strip everything not allowed
    .replace(/_+/g, '_')        // collapse consecutive underscores
    .replace(/^_|_$/g, '')      // trim leading/trailing underscores
    .slice(0, 32);              // max username length

  return isValidUsername(suggested) ? suggested : suggested.slice(0, 32);
}
