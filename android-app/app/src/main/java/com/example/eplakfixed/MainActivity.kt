package com.example.eplakfixed

import android.Manifest
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    /* درخواست اجازه‌ی اعلان (اندروید ۱۳ و بالاتر) — نتیجه‌اش به لایه‌ی وب خبر داده می‌شود */
    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            webView.evaluateJavascript(
                "window.eplakNativePermissionResult && window.eplakNativePermissionResult($granted);",
                null
            )
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById<WebView>(R.id.myWebView)
        val webSettings = webView.settings

        // فعال‌سازی جاوااسکریپت و ذخیره‌سازی
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
        webSettings.databaseEnabled = true
        webSettings.javaScriptCanOpenWindowsAutomatically = true

        // دسترسی به فایل‌ها
        webSettings.allowFileAccess = true
        webSettings.allowContentAccess = true
        @Suppress("DEPRECATION")
        webSettings.allowFileAccessFromFileURLs = true
        // دسترسی «universal» از file:// غیرفعال: در صورت هر XSS داخل وب‌ویو، امکان خواندن
        // فایل‌های محلی/داده‌های اپ از بین می‌رود. اپ برای کارکرد به آن نیاز ندارد.
        @Suppress("DEPRECATION")
        webSettings.allowUniversalAccessFromFileURLs = false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            webSettings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        // دیباگ وب‌ویو فقط در بیلد Debug (در نسخه‌ی انتشار، امکان اتصال DevTools به اپ بسته می‌شود)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // پل ارتباطی جاوااسکریپت و اندروید برای خروج هماهنگ و کنترل سخت‌افزاری
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidApp")

        // اتصال کلاینت‌ها
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        // مدیریت هوشمند دکمه بازگشت (Hardware Back Button / Gesture Back)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // ارسال رویداد بازگشت به لایه مدیریت تاریخچه در جاوااسکریپت
                webView.evaluateJavascript(
                    """
                    (function() {
                        if (typeof window.handleAppBack === 'function') {
                            return window.handleAppBack(false);
                        } else if (typeof window.goBack === 'function') {
                            return window.goBack();
                        }
                        return false;
                    })();
                    """.trimIndent()
                ) { result ->
                    val handled = result == "true"
                    // اگر در جاوااسکریپت هندل نشد (یا وب‌ویو هنوز لود نشده بود)
                    if (!handled) {
                        if (webView.canGoBack()) {
                            webView.goBack()
                        } else {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                            isEnabled = true
                        }
                    }
                }
            }
        })

        /* کانال اعلان‌ها از همان ابتدا ساخته می‌شود تا اعلان اول از دست نرود */
        NotificationBridge.ensureChannel(this)

        // بارگذاری فایل HTML
        webView.loadUrl("file:///android_asset/index.html")
    }

    inner class WebAppInterface(private val activity: AppCompatActivity) {

        @JavascriptInterface
        fun exitApp() {
            activity.runOnUiThread {
                activity.finish()
            }
        }

        /* ── اعلان سیستمی روی گوشی ────────────────────────────────────────
           اندروید در WebView نه Push API دارد و نه Notification API؛ پس اعلان
           از همین پل نمایش داده می‌شود. لایه‌ی وب (modules/live.js) وقتی اعلان
           تازه‌ای از سرور می‌گیرد این متد را صدا می‌زند. */

        /** ساخت/اطمینان از وجود کانال اعلان‌ها */
        @JavascriptInterface
        fun ensureNotificationChannel() {
            NotificationBridge.ensureChannel(activity)
        }

        /** آیا اعلان روی این گوشی مجاز است؟ */
        @JavascriptInterface
        fun notificationsEnabled(): Boolean = NotificationBridge.isEnabled(activity)

        /** درخواست اجازه‌ی اعلان از کاربر (اندروید ۱۳+) */
        @JavascriptInterface
        fun requestNotificationPermission() {
            activity.runOnUiThread {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    !NotificationBridge.isEnabled(activity)
                ) {
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        }

        /** نمایش اعلان در نوار اعلان‌های گوشی */
        @JavascriptInterface
        fun showNotification(title: String, body: String, id: String) {
            activity.runOnUiThread {
                NotificationBridge.show(activity, title, body, id)
            }
        }
    }
}
