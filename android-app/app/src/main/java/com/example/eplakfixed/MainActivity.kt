package com.example.eplakfixed

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    companion object {
        /* حافظه‌ی «باید دوباره کد تایید گرفته شود».
           خواسته‌ی کارفرما: پس از خروج از اپ (دوبار زدن دکمه‌ی بازگشت) و باز
           شدن دوباره، حساب کاربری به‌خاطر سپرده نشود و کاربر باید دوباره کد
           تایید بگیرد. */
        const val SESSION_PREFS = "eplak_session"
        const val KEY_REQUIRE_LOGIN = "require_login"
    }

    private lateinit var webView: WebView

    /* ── انتخاب عکس/فیلم از گالری ─────────────────────────────────────────
       بدون این بخش، ضربه زدن روی «افزودن عکس یا فیلم» در فرم ثبت درخواست
       هیچ کاری نمی‌کرد (اندروید فایل‌چوزر را خودش باز نمی‌کند و باید با
       onShowFileChooser از طرف صفحه‌ی وب باز شود). */
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    /* ── موقعیت مکانی (GPS) ───────────────────────────────────────────────
       callback مربوط به درخواست موقعیت از داخل WebView تا زمان پاسخ کاربر
       نگه داشته می‌شود. */
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private var pendingGeoOrigin: String? = null

    /* درخواست اجازه‌ی اعلان (اندروید ۱۳ و بالاتر) — نتیجه‌اش به لایه‌ی وب خبر داده می‌شود */
    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            webView.evaluateJavascript(
                "window.eplakNativePermissionResult && window.eplakNativePermissionResult($granted);",
                null
            )
        }

    /* نتیجه‌ی انتخاب فایل (تک یا چند فایل) به WebView برگردانده می‌شود.
       اگر کاربر لغو کند، باید مقدار null بفرستیم؛ وگرنه فیلد فایل هرگز
       دوباره کار نمی‌کرد. */
    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = filePathCallback ?: return@registerForActivityResult
            filePathCallback = null
            callback.onReceiveValue(collectChosenUris(result.resultCode, result.data))
        }

    /* نتیجه‌ی اجازه‌ی موقعیت مکانی */
    private val locationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
            val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true

            /* پاسخ به WebView (اگر درخواست از سمت خود WebView آمده باشد) */
            val callback = pendingGeoCallback
            val origin = pendingGeoOrigin
            pendingGeoCallback = null
            pendingGeoOrigin = null
            if (callback != null && origin != null) {
                callback.invoke(origin, granted, false)
            }

            /* خبر دادن به لایه‌ی وب تا در صورت گرفتن اجازه، موقعیت را دوباره بخواهد */
            notifyWebLocationPermission(granted)

            if (!granted) {
                Toast.makeText(
                    this,
                    "اجازه‌ی موقعیت مکانی داده نشد؛ می‌توانید محل را با کشیدن نقشه انتخاب کنید",
                    Toast.LENGTH_LONG
                ).show()
            }
        }

    private fun notifyWebLocationPermission(granted: Boolean) {
        webView.post {
            try {
                webView.evaluateJavascript(
                    "window.eplakLocationPermissionResult && window.eplakLocationPermissionResult($granted);",
                    null
                )
            } catch (e: Throwable) {
            }
        }
    }

    private fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
        return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
    }

    private fun requestLocationPermission() {
        if (hasLocationPermission()) {
            notifyWebLocationPermission(true)
            return
        }
        locationPermissionLauncher.launch(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        )
    }

    /* Uriهای انتخاب‌شده (یک فایل یا چند فایل) از نتیجه‌ی گالری */
    private fun collectChosenUris(resultCode: Int, data: Intent?): Array<Uri>? {
        if (resultCode != android.app.Activity.RESULT_OK || data == null) return null

        /* انتخاب چندتایی */
        data.clipData?.let { clip ->
            val uris = ArrayList<Uri>(clip.itemCount)
            for (i in 0 until clip.itemCount) {
                clip.getItemAt(i)?.uri?.let { uris.add(it) }
            }
            if (uris.isNotEmpty()) return uris.toTypedArray()
        }

        /* انتخاب تک‌فایل */
        data.data?.let { return arrayOf(it) }
        return null
    }

    /* ساخت Intent گالری: هم عکس، هم فیلم و (اگر صفحه چند انتخاب بخواهد) چندتایی */
    private fun buildFileChooserIntent(params: WebChromeClient.FileChooserParams): Intent {
        val mimeTypes = LinkedHashSet<String>()
        params.acceptTypes?.forEach { raw ->
            raw.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach { mimeTypes.add(it) }
        }
        if (mimeTypes.isEmpty()) {
            mimeTypes.add("image/*")
            mimeTypes.add("video/*")
        }

        val allowMultiple = params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE

        val pickIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toTypedArray())
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple)
        }

        return Intent.createChooser(pickIntent, "انتخاب عکس یا فیلم").apply {
            /* روی برخی گوشی‌ها، پنجره‌ی انتخاب باید از ترد اصلی باز شود */
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        /* اگر این، یک «بالا آمدن تازه»ی اپ است (نه چرخش صفحه یا برگشت از
           پس‌زمینه)، ورود قبلی معتبر نیست و لایه‌ی وب باید صفحه‌ی کد تایید را
           نشان بدهد. */
        if (savedInstanceState == null) {
            getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_REQUIRE_LOGIN, true)
                .apply()
        }

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

        /* فعال‌سازی موقعیت‌یابی داخل WebView (به‌جز اجازه‌ی کاربر، همین گزینه
           هم باید روشن باشد تا navigator.geolocation کار کند). */
        @Suppress("DEPRECATION")
        webSettings.setGeolocationEnabled(true)

        // دیباگ وب‌ویو فقط در بیلد Debug (در نسخه‌ی انتشار، امکان اتصال DevTools به اپ بسته می‌شود)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // پل ارتباطی جاوااسکریپت و اندروید برای خروج هماهنگ و کنترل سخت‌افزاری
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidApp")

        // اتصال کلاینت‌ها
        webView.webViewClient = WebViewClient()

        /* ── WebChromeClient واقعی ────────────────────────────────────────
           دو قابلیت حیاتی از همین‌جا تأمین می‌شود:
             ۱) باز شدن گالری برای انتخاب عکس/فیلم در فرم ثبت درخواست
             ۲) اجازه‌ی موقعیت مکانی برای بخش «موقعیت» (GPS گوشی) */
        webView.webChromeClient = object : WebChromeClient() {

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                /* درخواست قبلی (اگر نیمه‌کاره مانده) بسته می‌شود */
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                return try {
                    fileChooserLauncher.launch(buildFileChooserIntent(fileChooserParams))
                    true
                } catch (e: ActivityNotFoundException) {
                    this@MainActivity.filePathCallback = null
                    filePathCallback.onReceiveValue(null)
                    Toast.makeText(
                        this@MainActivity,
                        "برنامه‌ی گالری روی این گوشی پیدا نشد",
                        Toast.LENGTH_LONG
                    ).show()
                    false
                } catch (e: Throwable) {
                    this@MainActivity.filePathCallback = null
                    filePathCallback.onReceiveValue(null)
                    false
                }
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                if (hasLocationPermission()) {
                    /* اجازه قبلاً گرفته شده است */
                    callback.invoke(origin, true, false)
                    return
                }

                /* اجازه را از کاربر می‌گیریم و پس از پاسخ، به WebView خبر می‌دهیم */
                pendingGeoCallback = callback
                pendingGeoOrigin = origin
                requestLocationPermission()
            }

            override fun onGeolocationPermissionsHidePrompt() {
                super.onGeolocationPermissionsHidePrompt()
                pendingGeoCallback = null
                pendingGeoOrigin = null
            }
        }

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
            /* پیش از بسته شدن، علامت می‌زنیم که دفعه‌ی بعد کد تایید لازم است */
            activity.getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_REQUIRE_LOGIN, true)
                .apply()
            activity.runOnUiThread {
                activity.finish()
            }
        }

        /* ── موقعیت مکانی (GPS) ───────────────────────────────────────────
           لایه‌ی وب (modules/reports.js) پیش از صدا زدن navigator.geolocation
           این دو متد را صدا می‌زند تا اگر اجازه داده نشده، اول از کاربر پرسیده
           شود؛ نتیجه‌ی اجازه با window.eplakLocationPermissionResult به وب
           برمی‌گردد. */

        /** آیا اجازه‌ی موقعیت مکانی به اپ داده شده است؟ */
        @JavascriptInterface
        fun hasLocationPermission(): Boolean = this@MainActivity.hasLocationPermission()

        /** درخواست اجازه‌ی موقعیت مکانی از کاربر (اندروید ۶ و بالاتر) */
        @JavascriptInterface
        fun requestLocationPermission() {
            activity.runOnUiThread { this@MainActivity.requestLocationPermission() }
        }

        /** باز کردن صفحه‌ی تنظیمات خود اپ (برای روشن کردن دسترسی موقعیت) */
        @JavascriptInterface
        fun openAppSettings() {
            activity.runOnUiThread {
                try {
                    val intent = Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", activity.packageName, null)
                    )
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    activity.startActivity(intent)
                } catch (e: Throwable) {
                    try {
                        activity.startActivity(
                            Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        )
                    } catch (e2: Throwable) {
                    }
                }
            }
        }

        /** آیا سرویس موقعیت‌یاب گوشی (GPS) روشن است؟ */
        @JavascriptInterface
        fun isLocationServiceEnabled(): Boolean {
            return try {
                val manager = activity.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    manager.isLocationEnabled
                } else {
                    manager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) ||
                        manager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)
                }
            } catch (e: Throwable) {
                true
            }
        }

        /** باز کردن یک لینک بیرونی (مثل نمایش موقعیت در نقشه‌ی کامل) */
        @JavascriptInterface
        fun openUrl(url: String) {
            if (url.isBlank()) return
            activity.runOnUiThread {
                try {
                    activity.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                } catch (e: Throwable) {
                    Toast.makeText(activity, "برنامه‌ای برای باز کردن این لینک پیدا نشد", Toast.LENGTH_SHORT).show()
                }
            }
        }

        /* ── نگه‌داشتن حساب در اپ؟ ─────────────────────────────────────────
           اگر اپ تازه بالا آمده باشد یا کاربر با دوبار دکمه‌ی بازگشت خارج شده
           باشد، این متد true برمی‌گرداند؛ لایه‌ی وب در این حالت اطلاعات ورود
           را پاک می‌کند و صفحه‌ی «ورود + کد تایید» را نشان می‌دهد. */
        @JavascriptInterface
        fun shouldRequireLogin(): Boolean {
            return activity.getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_REQUIRE_LOGIN, false)
        }

        /** کاربر همین حالا کد تایید را درست وارد کرده است */
        @JavascriptInterface
        fun markLoginDone() {
            activity.getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_REQUIRE_LOGIN, false)
                .apply()
        }

        /** قبل از خروج کامل از اپ صدا زده می‌شود (دوبار دکمه‌ی بازگشت) */
        @JavascriptInterface
        fun prepareExit() {
            activity.getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_REQUIRE_LOGIN, true)
                .apply()
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

        /* ── توکن فایربیس (برای اعلان در حالت بسته بودن کامل اپ) ─────────────
           لایه‌ی وب این توکن را می‌گیرد و همراه شماره‌ی کاربر به سرور می‌فرستد
           (api/push.php?action=register_fcm). اگر پروژه‌ی فایربیس راه‌اندازی
           نشده باشد، رشته‌ی خالی برمی‌گردد و هیچ خطایی رخ نمی‌دهد. */

        /** توکن فایربیس این دستگاه (اگر آماده باشد) */
        @JavascriptInterface
        fun getFcmToken(): String {
            val prefs = activity.getSharedPreferences(EplakMessagingService.PREFS, Context.MODE_PRIVATE)

            /* توکن قبلی که خود فایربیس ساخته و در دستگاه ذخیره شده است */
            val cached = prefs.getString(EplakMessagingService.KEY_TOKEN, "") ?: ""
            if (cached.isNotEmpty()) return cached

            /* درخواست توکن تازه؛ نتیجه غیرهمگام است و دفعه‌ی بعد خوانده می‌شود.
               اگر پروژه‌ی فایربیس راه‌اندازی نشده باشد، رشته‌ی خالی برمی‌گردد. */
            return try {
                com.google.firebase.messaging.FirebaseMessaging.getInstance().token
                    .addOnSuccessListener { fresh ->
                        prefs.edit().putString(EplakMessagingService.KEY_TOKEN, fresh).apply()
                    }
                ""
            } catch (e: Throwable) {
                ""
            }
        }

        /** آیا اعلان فایربیس روی این دستگاه آماده است؟ */
        @JavascriptInterface
        fun isFcmReady(): Boolean {
            val prefs = activity.getSharedPreferences(EplakMessagingService.PREFS, Context.MODE_PRIVATE)
            if (!(prefs.getString(EplakMessagingService.KEY_TOKEN, "") ?: "").isEmpty()) return true
            return try {
                com.google.firebase.FirebaseApp.getInstance()
                true
            } catch (e: Throwable) {
                false
            }
        }

        /** درخواست تازه‌سازی توکن (اگر کاربر بعداً اجازه‌ی اعلان داد) */
        @JavascriptInterface
        fun refreshFcmToken() {
            try {
                com.google.firebase.messaging.FirebaseMessaging.getInstance().token
                    .addOnSuccessListener { fresh ->
                        activity.getSharedPreferences(EplakMessagingService.PREFS, Context.MODE_PRIVATE)
                            .edit().putString(EplakMessagingService.KEY_TOKEN, fresh).apply()
                    }
            } catch (e: Throwable) {
                /* فایربیس فعال نیست */
            }
        }
    }
}
