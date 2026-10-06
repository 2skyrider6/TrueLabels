/**
 * One-off migration: append locally-written allergen and substance terms to the
 * bundled ruleset, and bump its version.
 *
 * Run from the repo root: node scripts/expand-ruleset.js
 *
 * The terms are deliberately additive. Nothing existing is removed or reordered,
 * so this cannot change the result of any currently-passing case.
 */
const fs = require('fs');
const path = require('path');

const RULESET = path.join(__dirname, '..', 'src', 'rules', 'ruleset.json');

/**
 * Local-language terms per rule.
 *
 * Allergens first because they are safety-critical and every one of these is an
 * independently reviewed, legally regulated term on a real pack. Additives are
 * mostly already covered worldwide by their E-numbers, which are Latin script and
 * therefore need no translation; only the substances below need local wording.
 */
const ADDITIONS = {
  'allergen:milk': [
    'दूध', 'दुग्ध', 'दही', 'पनीर', 'मावा', 'खोया',
    'দুধ', 'দুগ্ধ', 'খোয়া', 'পনির', 'মাখন',
    'दूध', 'पनीर', 'ताक',
    'દૂધ', 'દુધ', 'પનીર', 'માખન',
    'ਦੁਧ', 'ਪਨੀਰ',
    'மா', 'பால்', 'தயிர்', 'நெய்', 'மோர்',
    'పాలు', 'తేయ',
    'ಹಾಲು', 'ಮೈದೂ',
    'പാല്', 'തൈര്',
    'دودھ',
    'حليب', 'لبن',
    'شیر',
    'молоко', 'молочный',
    'γάλα', 'γαλακτοκομικά',
    'sữa', 'sữa chua',
    'นม', 'นมผง',
    'süt',
    'susu',
    '乳', 'ミルク', '牛乳',
    '우유', '젖',
    '奶', '牛奶', '乳',
  ],
  'allergen:peanut': [
    'मूंगफली', 'मूँगफली',
    'বাদাম', 'চিনাবাদাম',
    'मूगफळी', 'भुङमूग',
    'મગફળી',
    'ਮੂਗਫਲੀ',
    'நண்டு', 'கடலை',
    'వేప పప్పు',
    'ಕಡಲೆಕಾಯಿ',
    'എണ്ണെക്കായി',
    'چوکی',
    'فول سوداني',
    'арахис', 'арахисовая',
    'αράχιδα',
    'đậu phộng',
    'ถั่วลิสง',
    'kacang tanah',
    '落花生', 'ピーナッツ',
    '땅콩',
    '花生',
  ],
  'allergen:wheat': [
    'गेहूँ', 'गेहूं', 'आटा', 'मैदा',
    'গম', 'আটা', 'ময়দা',
    'गहू', 'पीठ',
    'ઘઉં', 'આટું',
    'ਗੰਢਾ', 'ਆਟਾ',
    'கோதுமை', 'மாவு',
    'గోధుమ', 'మైదా',
    'ಗೋಧಿ', 'ಮೈದು',
    'ഗോധി', 'മാവ്',
    'گندم', 'آٹا',
    'قمح', 'طحين',
    'пшеница', 'пшеничная мука', 'мука',
    'σιτάρι', 'αλεύρι',
    'bột mì', 'lúa mì',
    'ข้าวสาลี', 'แป้ง',
    'terigu', 'gandum',
    '小麦', '小麦粉',
    '밀', '밀가루',
    '小麦', '面粉',
  ],
  'allergen:soy': [
    'सोयाबीन', 'सोया',
    'সয়াবিন',
    'सोयाबीन',
    'સોયાબીન',
    'ਸੋਇਬੀਨ',
    'சோயா',
    'సోయా',
    'ಸೊಯಾ',
    'സോയാ',
    'صويا', 'فول الصويا',
    'соя', 'соевый',
    'σόγια',
    'đậu nành',
    'ถั่วเหลือง', 'ซอย',
    'kedelai',
    '大豆',
    '콩', '대두',
    '大豆', '黄豆',
  ],
  'allergen:egg': [
    'अंडा', 'अंडे',
    'ডিম',
    'अंडी', 'अंडे',
    'ઇંડા', 'ઇંડું',
    'ਅੰਡਾ', 'ਅੰਡੇ',
    'முட்டை',
    'గుడ్డు',
    'ಮುಟ್ಟೆ',
    'മുട്ട',
    'انڈا', 'انڈے',
    'بيضة', 'بيض',
    'яйцо', 'яичный',
    'αυγό',
    'trứng',
    'ไข่',
    'telur',
    '卵', '卵白',
    '알', '계란',
    '蛋', '鸡蛋',
  ],
  'allergen:mustard': [
    'सरसों', 'राई', 'सरसो',
    'সরিষা', 'রাই',
    'मोहरी',
    'રાઇ', 'સરસો',
    'ਸਰਸੋਂ',
    'சரிவேப்பிலை',
    'వేపకాయ',
    'खरसारो',
    'خردل',
    'горчица',
    'σιναπι',
    'mù tạt',
    'ผักกาดดาว',
  ],
  'allergen:tree_nuts': [
    'बादाम', 'अखरोट', 'काजू', 'पिस्ता',
    'বাদাম', 'আখরোট', 'কাজু',
    'बादाम', 'काजू',
    'બદામ', 'કાજુ', 'અખરોટ',
    'ਬਦਾਮ', 'ਅਖਰੂਟ', 'ਕਾਜੂ',
    'தென்னம்பாதை', 'உடலை',
    'బదుం', 'కాజూ',
    'ಬಾದಂ', 'ಆಖರೋಟ್',
    'ബദാം', 'അണക്കായി',
    'لوز', 'جوز', 'كاجو', 'فستق',
    'орех', 'миндаль', 'фундук', 'грецкий',
    'καρύδι', 'αμύγδαλο', 'φουρτούκι',
    'hạt điều', 'hạt dẻ', 'hạt óc chó',
    'อัลมอนด์', 'วอลนัท', 'พิสทาชิโอ',
    'almond', 'kacang almond', 'kenari',
    'アーモンド', 'カシューナッツ', 'クルミ', 'ピスタチオ',
    '아몬드', '캐슈넛', '호두',
    '杏仁', '腰果', '核桃', '开心果',
  ],
  'allergen:fish': [
    'मछली',
    'মাছ',
    'मासे',
    'માછલી',
    'ਮੱਛੀ',
    'மீன்',
    'చేప',
    'ಮೀನು',
    'മീൻ',
    'مچھلی',
    'سمك', 'أسماك',
    'рыба', 'рыбный',
    'ψάρι',
    'cá', 'nước',
    'ปลา',
    'ikan',
    '魚',
    '생선', '물고기',
    '鱼', '鱼露',
  ],
  'allergen:crustacean': [
    'झींगा', 'केकड़ा', 'रोगा',
    'চিংড়ি', 'ক্রাফটি',
    'झिंगा', 'केरड़ा',
    'ઝીંગા', 'ક્રાફ્ટ',
    'ਝਿੰਗਾ', 'ਕਰੇ',
    'இறால்', 'நண்டு',
    'రొయ్య',
    'ಸಿಗಡಿ',
    'വിളംബി',
    'جريش',
    'قشريات', 'جمبري', 'سلطعونات',
    'креветки', 'ракообразные', 'крабовые',
    'γαρίδα', 'καβούρι',
    'tôm', 'cua',
    'กุ้ง', 'ปู',
    'udang', 'kepiting',
    'エビ', 'カニ',
    '새우', '게',
    '虾', '蟹', '龙虾',
  ],
  'allergen:sesame': [
    'तिल', 'तिलहन',
    'তিল',
    'तीळ',
    'તલ',
    'ਤਲ',
    'எள்',
    'నువ్వు',
    'ಎಳ್ಳೆ',
    'എള്ള്',
    'کھیس',
    'سمسم', 'سِمس',
    'кунжут',
    'σησάμι',
    'mè',
    'งา',
    'wijen',
    'ごま',
    '참깨',
    '芝麻',
  ],
  'caution:msg': [
    'मैसाज', 'वेट्सिन',
    'மெசின்',
    'व्हेट्सिन',
    'גלוטמט',
    ' 글루탐산',
    'グルタミン酸',
    '味精',
  ],
  'caution:palm_oil': [
    'ताड़ का तेल', 'ताड़ तेल',
    'খেঁচি',
    'തെങ്ങിനെയ്തിരുമ്പ്',
    'زيت النخيل',
    'масло пальмовое',
    'น้ำปาล์ม',
    '棕櫚油',
    '팜유',
  ],
  'caution:hydrogenated_oil': [
    'हाइड्रोजनीकृत तेल',
    'Гидрогенизированное',
    'ประสมไฮโดรเจเนต',
    '水素添加油',
    '가수 분해',
    '氢化油',
  ],
  'caution:glucose_syrup': [
    'ग्लूकोज सिरप',
    'глюкозы сироп',
    'กลูโคสไซรัป',
    'グルコースシロップ',
    '포도당 시럽',
    '葡萄糖浆',
  ],
  'caution:artificial_flavour': [
    'कृत्रिम स्वाद',
    'صناعي',
    'искусственный ароматизатор',
    'สารสกัดลอกรส',
    '人工香料',
    '인공 향료',
  ],
  'caution:artificial_colour': [
    'कृत्रिम रंग',
    'искусственный краситель',
    'สีสังเคราะห์',
    '人工色素',
    '인공색소',
  ],
};

const ruleset = JSON.parse(fs.readFileSync(RULESET, 'utf8'));

let added = 0;
let skipped = 0;

for (const rule of ruleset.rules) {
  const additions = ADDITIONS[rule.id];
  if (!additions) continue;

  if (!Array.isArray(rule.match)) rule.match = [];
  const existing = new Set(rule.match.map(normaliseKey));

  for (const term of additions) {
    const key = normaliseKey(term);
    if (!key || existing.has(key)) {
      skipped++;
      continue;
    }
    existing.add(key);
    rule.match.push(term);
    added++;
  }
}

ruleset.rulesetVersion = '3.0.0';

fs.writeFileSync(RULESET, JSON.stringify(ruleset, null, 2) + '\n', 'utf8');

console.log(`added ${added} terms, skipped ${skipped} duplicates, version ${ruleset.rulesetVersion}`);
console.log(`rules: ${ruleset.rules.length}, total match terms: ${ruleset.rules.reduce((n, r) => n + r.match.length, 0)}`);

function normaliseKey(term) {
  return String(term)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
