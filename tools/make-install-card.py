#!/usr/bin/env python3
"""ساخت کارت نصب اپ (کد QR + راهنمای فارسی) برای نسخه‌ی آزمونی APK.

هر بار که APK ساخته می‌شود، این اسکریپت یک کارت تصویری می‌سازد تا تست‌کننده با
دوربین گوشی، فایل نصبی را مستقیم دانلود کند.

اجرا:
    python3 tools/make-install-card.py \
        --url "https://github.com/OWNER/REPO/releases/download/apk-latest/eplak-app.apk" \
        --version 2.0.33 --build 33 --kb 11468 \
        --out eplak-apk-install-card.png

پیش‌نیازها: pip install qrcode pillow arabic-reshaper python-bidi fonttools brotli
"""
import argparse
import os
import sys

import qrcode
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display
from fontTools.ttLib import TTFont

TEAL = (0, 201, 167)
DARK = (15, 23, 42)
GRAY = (100, 116, 139)
LIGHT = (241, 245, 249)

FA_DIGITS = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')


def font_ttf(woff2_path: str, cache_path: str) -> str:
    """فونت woff2 پروژه را به ttf تبدیل می‌کند (PIL فقط ttf/otf را می‌خواند)."""
    if os.path.isfile(cache_path) and os.path.getmtime(cache_path) >= os.path.getmtime(woff2_path):
        return cache_path
    font = TTFont(woff2_path)
    font.flavor = None
    font.save(cache_path)
    return cache_path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', required=True, help='لینک دانلود مستقیم فایل APK')
    ap.add_argument('--version', default='')
    ap.add_argument('--build', default='')
    ap.add_argument('--kb', default='')
    ap.add_argument('--out', default='eplak-apk-install-card.png')
    ap.add_argument('--fonts', default=os.path.join(os.path.dirname(__file__), '..', 'admin', 'assets', 'fonts'))
    args = ap.parse_args()

    reg = font_ttf(os.path.join(args.fonts, 'IranianSans-Regular.woff2'), '/tmp/card-reg.ttf')
    bold = font_ttf(os.path.join(args.fonts, 'IranianSans-Bold.woff2'), '/tmp/card-bold.ttf')

    try:
        size_mb = max(1, round(int(args.kb) / 1024)) if args.kb else 0
    except ValueError:
        size_mb = 0

    w, h = 1000, 1420
    img = Image.new('RGB', (w, h), 'white')
    d = ImageDraw.Draw(img)

    def fa(text: str) -> str:
        text = text.translate(FA_DIGITS).replace('\u200c', '').replace('→', '»')
        return get_display(arabic_reshaper.reshape(text))

    def fnt(size: int, is_bold: bool = False):
        return ImageFont.truetype(bold if is_bold else reg, size)

    def center_fa(text, y, size, color=DARK, is_bold=False):
        t = fa(text)
        f = fnt(size, is_bold)
        d.text(((w - d.textlength(t, font=f)) / 2, y), t, font=f, fill=color)

    def right_fa(text, x_right, y, size, color=DARK, is_bold=False):
        t = fa(text)
        f = fnt(size, is_bold)
        d.text((x_right - d.textlength(t, font=f), y), t, font=f, fill=color)

    # سرصفحه
    d.rectangle([0, 0, w, 190], fill=TEAL)
    center_fa('اپ ای‌پلاک — نسخه‌ی آزمایشی', 42, 46, (255, 255, 255), True)
    center_fa('شامل اصلاح بارگذاری عکس و فیلم + دوربین داخل اپ', 112, 28, (4, 40, 34))

    # کد QR
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=2)
    qr.add_data(args.url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color=DARK, back_color='white').convert('RGB')
    qr_size = 440
    qr_img = qr_img.resize((qr_size, qr_size), Image.NEAREST)
    qx, qy = (w - qr_size) // 2, 240
    d.rounded_rectangle([qx - 18, qy - 18, qx + qr_size + 18, qy + qr_size + 18], radius=22, outline=LIGHT, width=3)
    img.paste(qr_img, (qx, qy))

    # راهنمای نصب
    steps = [
        '۱) دوربین گوشی را روی کد بالا بگیرید و لینک را باز کنید',
        '۲) فایل نصبی اپ را دانلود کنید' + (f' (حدود {size_mb} مگابایت)' if size_mb else ''),
        '۳) اگر گوشی اجازه خواست، نصب از منابع ناشناس را روشن کنید',
        '۴) نصب کنید؛ روی نسخه‌ی قبلی هم به‌عنوان به‌روزرسانی می‌نشیند',
    ]
    y = qy + qr_size + 70
    for step in steps:
        right_fa(step, w - 70, y, 28, DARK)
        y += 46

    # کادر آزمون
    y += 14
    d.rounded_rectangle([50, y, w - 50, y + 210], radius=20, fill=LIGHT)
    right_fa('آزمون روی گوشی:', w - 78, y + 20, 30, TEAL, True)
    tests = [
        'در اپ: ثبت گزارش، بعد دکمه‌ی «عکس» و «فیلم»، گرفتن با دوربین یا انتخاب از گالری',
        'بعد از ثبت، در «گزارش‌های من» عکس و فیلم نمایش داده شود',
    ]
    yy = y + 68
    for t in tests:
        right_fa('• ' + t, w - 78, yy, 26, DARK)
        yy += 44
    right_fa('• اگر اینترنت قطع بود، فایل در صف می‌ماند و بعداً خودش ارسال می‌شود', w - 78, yy, 24, GRAY)

    # مشخصات ساخت
    y += 250
    info = ' '.join(x for x in [
        f'نسخه {args.version}' if args.version else '',
        f'ساخت {args.build}' if args.build else '',
        f'{size_mb} مگابایت' if size_mb else '',
    ] if x)
    info = info.replace('.', '٫').replace(' • ', '  •  ')
    if info:
        center_fa(info, y, 26, GRAY)
    y += 44
    center_fa('این نسخه به سرور سامانه وصل می‌شود؛ هنگام اولین ارسال عکس/فیلم،', y, 22, GRAY)
    y += 34
    center_fa('آدرس سرویس‌دهی (پوشه‌ی سرویس) را یک‌بار وارد کنید و ذخیره می‌شود.', y, 22, GRAY)

    img.save(args.out, quality=95)
    print('saved →', args.out, img.size)
    return 0


if __name__ == '__main__':
    sys.exit(main())
