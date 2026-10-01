/* آزمون سرتاسری اندپوینت رسانه (api/media.php / api/reports.php) روی PHP واقعی + SQLite
   این ابزار توسعه است و بخشی از اپ نیست: PHP را با php-wasm اجرا می‌کند و همان
   فایل‌های مخزن را در حافظه‌ی PHP می‌نویسد تا مسیر واقعی «آپلود عکس و فیلم» آزمایش شود.

   نکته‌ی اجرا: هر سناریو در یک نمونه‌ی تازه‌ی PHP اجرا می‌شود (چون اندپوینت‌ها با
   exit پایان می‌یابند) و «وضعیت» (فایل دیتابیس + فایل‌های آپلودشده) بین سناریوها
   دست‌به‌دست می‌شود. */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { PhpNode } from 'php-wasm/PhpNode';
import { getLibs as getSqliteLibs } from 'php-wasm-sqlite/8.4.mjs';

const ROOT = process.env.EPLAK_ROOT || '/home/user/eplak-fixed';
const CODE_FILES = [
  'shared/bootstrap.php',
  'shared/media.php',
  'admin/includes/db.php',
  'api/_common.php',
  'api/media.php',
  'api/reports.php',
  'api/users.php',
];
const CONFIG = `<?php
return [
  'driver' => 'sqlite',
  'sqlite_path' => '/app/data/eplak.sqlite',
  'media' => [
    'dir' => '/app/uploads/media',
    'max_image_bytes' => 12 * 1024 * 1024,
    'max_video_bytes' => 96 * 1024 * 1024,
    'max_count' => 6,
    'max_video_seconds' => 90,
  ],
];`;

/* ── نمونه‌سازی فایل‌های آزمایشی ─────────────────────────────────────── */
function pngBytes(w = 8, h = 8) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (1 + w * 3) + 1 + x * 3;
      raw[o] = 0; raw[o + 1] = 201; raw[o + 2] = 167;
    }
  }
  const crcTable = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mp4Bytes() {
  const b = Buffer.alloc(80);
  b.writeUInt32BE(32, 0);
  b.write('ftyp', 4, 'ascii');
  b.write('isom', 8, 'ascii');
  b.writeUInt32BE(512, 12);
  b.write('isomiso2mp41', 16, 'ascii');
  b.write('mdat', 40, 'ascii');
  return b;
}

function jpegBytes() {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    Buffer.alloc(64, 7),
    Buffer.from([0xff, 0xd9]),
  ]);
}

const FIXTURES = {
  '/app/tmp/photo.png': pngBytes(),
  '/app/tmp/photo.jpg': jpegBytes(),
  '/app/tmp/movie.mp4': mp4Bytes(),
  '/app/tmp/evil.jpg': Buffer.from('<?php system($_GET["c"]); ?> this is not an image at all'),
};

/* ── اجرای سناریوها روی یک نمونه‌ی PHP ─────────────────────────────────
   اندپوینت‌ها با exit پایان می‌یابند؛ php-wasm پس از exit «منجمد» می‌شود و
   با refresh() دوباره زنده می‌شود (فایل‌سیستم بین refresh باقی می‌ماند). */
const php = new PhpNode({ sharedLibs: getSqliteLibs() });
let phpOut = '';
php.addEventListener('output', (e) => { phpOut += String(e.detail); });

let started = false;

async function bootstrapFs() {
  await php.run('<?php @mkdir("/app/tmp", 0777, true); @mkdir("/app/uploads/media", 0777, true); @mkdir("/app/data", 0777, true);');
  for (const rel of CODE_FILES) {
    const data = fs.readFileSync(path.join(ROOT, rel));
    const dir = path.posix.dirname('/app/' + rel);
    await php.run(`<?php @mkdir(${JSON.stringify(dir)}, 0777, true);`);
    await php.writeFile('/app/' + rel, data);
  }
  await php.writeFile('/app/shared/config.php', CONFIG);
  for (const [p, bytes] of Object.entries(FIXTURES)) {
    await php.writeFile(p, bytes);
  }
}

async function scenario(code) {
  if (!started) {
    await bootstrapFs();
    started = true;
  } else {
    await php.refresh();
  }
  /* فایل‌های آزمایشی پیش از هر سناریو دوباره ساخته می‌شوند؛ موتور آپلود
     فایل موقت را «جابه‌جا» (move) می‌کند و همان فایل دیگر وجود ندارد. */
  for (const [p, bytes] of Object.entries(FIXTURES)) {
    await php.writeFile(p, bytes);
  }
  phpOut = '';
  await php.run(code);
  return phpOut;
}

const jsonLine = (text) => {
  const lines = String(text).trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('{')) {
      try { return JSON.parse(line); } catch (e) { /* ادامه */ }
    }
  }
  return null;
};

const phone = '09123456789';
const baseEnv = `define('EPLAK_MEDIA_CLI_TEST', true);
$_SERVER['HTTP_HOST'] = 'example.com';`;

const results = {};

/* ۱) ساخت دیتابیس، کاربر و گزارش */
const boot = await scenario(`<?php
${baseEnv}
require '/app/shared/bootstrap.php';
$pdo = eplakGetPdo();
$pdo->prepare(eplakUsersUpsertSql($pdo, false))->execute([':phone'=>'${phone}',':name'=>'تست',':address'=>'',':nid'=>'']);
$pdo->prepare('INSERT INTO reports (user_phone,title,description,category,status) VALUES (?,?,?,?,?)')
    ->execute(['${phone}','گزارش آزمایشی','توضیح آزمایشی','نظافت','pending']);
echo "REPORT_ID=" . $pdo->lastInsertId() . "\\n";
echo "MEDIA_TABLE=" . (count($pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name='media'")->fetchAll()) ? 'yes' : 'no') . "\\n";
$cols = array_map(function($c){ return $c['name']; }, $pdo->query('PRAGMA table_info(users)')->fetchAll());
echo "USER_COLS=" . implode(',', $cols) . "\\n";
`);
console.log('--- bootstrap ---\n' + boot.trim());
const reportId = Number((boot.match(/REPORT_ID=(\d+)/) || [])[1]);
results.mediaTable = /MEDIA_TABLE=yes/.test(boot);
results.userAvatarColumn = /avatar/.test((boot.match(/USER_COLS=(.*)/) || [])[1] || '');

/* ۲) آپلود عکس */
const uploadImage = await scenario(`<?php
${baseEnv}
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['SCRIPT_NAME'] = '/eplak-fixed/api/media.php';
$_POST['phone'] = '${phone}';
$_POST['source'] = 'camera';
$_FILES['file'] = ['name'=>'IMG_0001.PNG','type'=>'image/png','tmp_name'=>'/app/tmp/photo.png','error'=>0,'size'=>filesize('/app/tmp/photo.png')];
require '/app/api/media.php';
`);
const imageJson = jsonLine(uploadImage);
console.log('--- upload image ---\n' + JSON.stringify(imageJson, null, 1));
results.imageUploadOk = !!(imageJson && imageJson.success && imageJson.items[0].kind === 'image');
results.imageNameKept = imageJson && imageJson.items[0].name;
results.imageUrl = imageJson && imageJson.items[0].url;

/* ۳) آپلود فیلم */
const uploadVideo = await scenario(`<?php
${baseEnv}
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['SCRIPT_NAME'] = '/eplak-fixed/api/media.php';
$_POST['phone'] = '${phone}';
$_POST['source'] = 'camera';
$_POST['duration_ms'] = '4200';
$_FILES['file'] = ['name'=>'clip.mp4','type'=>'video/mp4','tmp_name'=>'/app/tmp/movie.mp4','error'=>0,'size'=>filesize('/app/tmp/movie.mp4')];
require '/app/api/media.php';
`);
const videoJson = jsonLine(uploadVideo);
console.log('--- upload video ---\n' + JSON.stringify(videoJson, null, 1));
results.videoUploadOk = !!(videoJson && videoJson.success && videoJson.items[0].kind === 'video');
results.videoDuration = videoJson && videoJson.items[0].duration_ms;

/* ۴) فایل جعلی (PHP با پسوند jpg) باید رد شود */
const uploadEvil = await scenario(`<?php
${baseEnv}
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['SCRIPT_NAME'] = '/eplak-fixed/api/media.php';
$_POST['phone'] = '${phone}';
$_POST['source'] = 'upload';
$_FILES['file'] = ['name'=>'evil.jpg','type'=>'image/jpeg','tmp_name'=>'/app/tmp/evil.jpg','error'=>0,'size'=>filesize('/app/tmp/evil.jpg')];
require '/app/api/media.php';
`);
const evilJson = jsonLine(uploadEvil);
console.log('--- fake image (must be rejected) ---\n' + JSON.stringify(evilJson, null, 1));
results.fakeImageRejected = !!(evilJson && evilJson.success === false);
results.fakeImageError = evilJson && evilJson.error;

/* ۵) آپلود چند فایلی */
const uploadMulti = await scenario(`<?php
${baseEnv}
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['SCRIPT_NAME'] = '/eplak-fixed/api/media.php';
$_POST['phone'] = '${phone}';
$_POST['source'] = 'gallery';
$_FILES['files'] = ['name'=>['a.png','b.jpg'],'type'=>['image/png','image/jpeg'],'tmp_name'=>['/app/tmp/photo.png','/app/tmp/photo.jpg'],'error'=>[0,0],'size'=>[filesize('/app/tmp/photo.png'),filesize('/app/tmp/photo.jpg')]];
require '/app/api/media.php';
`);
const multiJson = jsonLine(uploadMulti);
console.log('--- upload two images ---\n' + JSON.stringify({ success: multiJson && multiJson.success, count: multiJson && multiJson.count }, null, 1));
results.multiUploadCount = multiJson && multiJson.count;

/* ۶) اتصال رسانه‌ها به گزارش از طریق اندپوینت */
const attach = await scenario(`<?php
${baseEnv}
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['SCRIPT_NAME'] = '/eplak-fixed/api/media.php';
$_GET['action'] = 'attach';
$_POST['phone'] = '${phone}';
$_POST['report_id'] = '${reportId}';
$_POST['ids'] = [1, 2];
require '/app/api/media.php';
`);
const attachJson = jsonLine(attach);
console.log('--- attach to report ---\n' + JSON.stringify({ success: attachJson && attachJson.success, attached: attachJson && attachJson.attached, items: (attachJson && attachJson.items || []).map(i => `${i.id}:${i.kind}`) }, null, 1));
results.attachEndpointOk = !!(attachJson && attachJson.success && attachJson.attached >= 1);

/* ۷) فهرست رسانه‌های کاربر */
const listMedia = await scenario(`<?php
${baseEnv}
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/eplak-fixed/api/media.php';
$_GET['action'] = 'list';
$_GET['phone'] = '${phone}';
require '/app/api/media.php';
`);
const listJson = jsonLine(listMedia);
console.log('--- list media ---\n' + JSON.stringify({ success: listJson && listJson.success, count: listJson && listJson.count, kinds: (listJson && listJson.items || []).map(i => i.kind) }));
results.listMediaOk = !!(listJson && listJson.success && listJson.count >= 4);

/* ۸) گزارش‌ها همراه با رسانه (GET api/reports.php) */
const reportsGet = await scenario(`<?php
${baseEnv}
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/eplak-fixed/api/reports.php';
$_GET['phone'] = '${phone}';
require '/app/api/reports.php';
`);
const reportsJson = jsonLine(reportsGet);
const firstReportMedia = reportsJson && reportsJson.reports && reportsJson.reports[0] && reportsJson.reports[0].media;
console.log('--- reports list ---\n' + JSON.stringify({ success: reportsJson && reportsJson.success, reports: reportsJson && reportsJson.reports.length, mediaOfFirst: (firstReportMedia || []).map(m => `${m.id}:${m.kind}:${m.url ? 'url' : '-'}`) }, null, 1));
results.reportsListHasMedia = !!(firstReportMedia && firstReportMedia.length >= 2);

/* ۹) تنظیمات و سقف‌های سرور */
const cfg = await scenario(`<?php
${baseEnv}
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/eplak-fixed/api/media.php';
$_GET['action'] = 'config';
require '/app/api/media.php';
`);
const cfgJson = jsonLine(cfg);
console.log('--- config ---\n' + JSON.stringify(cfgJson));
results.configOk = !!(cfgJson && cfgJson.success && cfgJson.limits && cfgJson.server);

/* ۱۰) حذف رسانه توسط مالک + بررسی فایل روی دیسک + .htaccess */
const fileChecks = await scenario(`<?php
${baseEnv}
require '/app/shared/bootstrap.php';
require '/app/shared/media.php';
$pdo = eplakGetPdo();
$rows = eplakMediaRowsForUser($pdo, '${phone}');
echo "USER_MEDIA=" . count($rows) . "\\n";
$forReport = eplakMediaRowsForReport($pdo, ${reportId});
echo "REPORT_MEDIA=" . count($forReport) . "\\n";
$abs = eplakMediaAbsolutePath($forReport[0]);
echo "FILE_EXISTS=" . (is_file($abs) ? 'yes' : 'no') . " size=" . filesize($abs) . "\\n";
echo "HTACCESS=" . (is_file('/app/uploads/media/.htaccess') ? 'yes' : 'no') . "\\n";
echo "URL=" . eplakMediaUrlForRow($forReport[0]) . "\\n";
echo "HOURLY=" . eplakMediaHourlyUsage($pdo, '${phone}') . "\\n";
echo "DELETED=" . (eplakMediaDeleteForUser($pdo, (int)$forReport[0]['id'], '${phone}') ? 'yes' : 'no') . "\\n";
echo "AFTER_DELETE=" . count(eplakMediaRowsForReport($pdo, ${reportId})) . "\\n";
echo "WRONG_OWNER=" . (eplakMediaDeleteForUser($pdo, (int)$forReport[1]['id'], '09999999999') ? 'DELETED-BUG' : 'blocked') . "\\n";
echo "SNIFF_PNG=" . eplakMediaSniffMime('/app/tmp/photo.png') . "\\n";
echo "SNIFF_MP4=" . eplakMediaSniffMime('/app/tmp/movie.mp4') . "\\n";
echo "SNIFF_JPEG=" . eplakMediaSniffMime('/app/tmp/photo.jpg') . "\\n";
echo "SNIFF_EVIL=" . (eplakMediaSniffMime('/app/tmp/evil.jpg') === '' ? '(rejected)' : 'PROBLEM') . "\\n";
echo "INI_BYTES=" . eplakMediaIniBytes('8M') . "," . eplakMediaIniBytes('512K') . "," . eplakMediaIniBytes('-1') . "\\n";
echo "SERVER_LIMITS=" . json_encode(eplakMediaServerLimits()) . "\\n";
`);
console.log('--- file/ownership/sniff checks ---\n' + fileChecks.trim());
results.fileOnDisk = /FILE_EXISTS=yes/.test(fileChecks);
results.htaccessWritten = /HTACCESS=yes/.test(fileChecks);
results.deleteWorked = /DELETED=yes/.test(fileChecks);
results.ownerIsolation = /WRONG_OWNER=blocked/.test(fileChecks);
results.sniffOk = /SNIFF_PNG=image\/png/.test(fileChecks) && /SNIFF_MP4=video\/mp4/.test(fileChecks) && /SNIFF_JPEG=image\/jpeg/.test(fileChecks) && /SNIFF_EVIL=\(rejected\)/.test(fileChecks);
results.iniBytesOk = /INI_BYTES=8388608,524288,0/.test(fileChecks);

/* ۱۱) رویداد گزارش + رسانه در یک درخواست (شبیه‌سازی مسیر واقعی اپ) */
const endToEnd = await scenario(`<?php
${baseEnv}
require '/app/shared/bootstrap.php';
require '/app/shared/media.php';
$pdo = eplakGetPdo();
/* سرویس: ذخیره‌ی فایل و سپس درج گزارش و اتصال — همان ترتیبی که اپ انجام می‌دهد */
$info = eplakMediaValidateUpload('/app/tmp/photo.png', filesize('/app/tmp/photo.png'), 'e2e.png', 'image/png', 'camera');
$stored = eplakMediaStoreFile($pdo, '/app/tmp/photo.png', ['phone'=>'${phone}','report_id'=>null,'original_name'=>'e2e.png','source'=>'camera'], $info);
echo "STORED_ID=" . $stored['id'] . "\\n";
$pdo->prepare('INSERT INTO reports (user_phone,title,description,category,status) VALUES (?,?,?,?,?)')
    ->execute(['${phone}','گزارش با پیوست','توضیح','نظافت','pending']);
$newReportId = (int) $pdo->lastInsertId();
$attached = eplakMediaAttachToReport($pdo, [$stored['id']], $newReportId, '${phone}');
echo "ATTACHED=" . $attached . "\\n";
$media = eplakMediaRowsForReport($pdo, $newReportId);
echo "COUNT=" . count($media) . "\\n";
echo "PUBLIC=" . json_encode(eplakMediaRowToPublic($media[0]), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\\n";
`);
console.log('--- store+attach service flow ---\n' + endToEnd.trim());
results.storeAndAttachFlow = /ATTACHED=1/.test(endToEnd) && /COUNT=1/.test(endToEnd);

/* ── جمع‌بندی ─────────────────────────────────────────────────────── */
const summary = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, typeof v === 'boolean' ? v : String(v).slice(0, 120)]));
console.log('\n--- SUMMARY ---\n' + JSON.stringify(summary, null, 2));
const failed = Object.entries(results).filter(([, v]) => v === false);
if (failed.length) {
  console.log('\nFAILED CHECKS: ' + failed.map(([k]) => k).join(', '));
  process.exitCode = 1;
} else {
  console.log('\nALL CHECKS PASSED ✅');
}
