package com.example.eplakfixed

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import java.util.Locale

/**
 * MainActivity — میزبان وب‌ویوی اپ ای‌پلاک
 *
 * نکته‌های کلیدی این نسخه (رفع مشکل «عکس و فیلم بارگذاری نمی‌شود»):
 *  ۱) صفحه از طریق WebViewAssetLoader با آدرس https سرو می‌شود
 *     (https://appassets.androidplatform.net/assets/index.html) تا «زمینه‌ی امن»
 *     برقرار باشد؛ بدون آن، دوربین داخل اپ (getUserMedia) در وب‌ویو کار نمی‌کند.
 *  ۲) onShowFileChooser پیاده‌سازی شده است؛ بدون آن، لمس دکمه‌ی «افزودن عکس»
 *     در هیچ نسخه‌ای از اندروید پنجره‌ی انتخاب فایل را باز نمی‌کرد.
 *  ۳) مجوزهای دوربین/میکروفون هنگام درخواست صفحه (onPermissionRequest)
 *     به‌صورت زمان اجرا گرفته و به صفحه داده می‌شود.
 *  ۴) آدرس سرور (API) از منابع اپ خوانده و به‌صورت پل JS در اختیار صفحه
 *     قرار می‌گیرد (AndroidApp.getApiBaseUrl).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    /** callback انتخاب فایل که وب‌ویو منتظر آن است */
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    /** درخواست مجوز دوربین/میکروفون که منتظر نتیجه‌ی مجوز اندروید است */
    private var pendingPermissionRequest: PermissionRequest? = null

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        val request = pendingPermissionRequest
        pendingPermissionRequest = null
        if (request == null) return@registerForActivityResult

        val allGranted = result.values.all { it }
        if (allGranted) {
            request.grant(request.resources)
        } else {
            request.deny()
        }
    }

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result: ActivityResult ->
        val callback = filePathCallback
        filePathCallback = null
        if (callback == null) return@registerForActivityResult

        if (result.resultCode != Activity.RESULT_OK) {
            callback.onReceiveValue(null)
            return@registerForActivityResult
        }

        val data: Intent? = result.data
        val uris: Array<Uri>? = when {
            data == null -> null
            data.clipData != null -> {
                val clip = data.clipData!!
                Array(clip.itemCount) { index -> clip.getItemAt(index).uri }
            }
            data.data != null -> arrayOf(data.data!!)
            else -> null
        }
        callback.onReceiveValue(uris)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.myWebView)
        val webSettings: WebSettings = webView.settings

        // فعال‌سازی جاوااسکریپت و ذخیره‌سازی
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
        webSettings.databaseEnabled = true
        webSettings.javaScriptCanOpenWindowsAutomatically = true

        // پخش ویدیوهای گزارش‌ها بدون نیاز به لمس دوم
        webSettings.mediaPlaybackRequiresUserGesture = false

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
            // آدرس سرور ممکن است http باشد (شبکه‌ی داخلی) در حالی که صفحه https سرو می‌شود
            webSettings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        // دیباگ وب‌ویو فقط در بیلد Debug (در نسخه‌ی انتشار، امکان اتصال DevTools به اپ بسته می‌شود)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // پل ارتباطی جاوااسکریپت و اندروید برای خروج هماهنگ و آدرس سرور
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidApp")

        // سرو دارایی‌های اپ روی یک مبدأ https (زمینه‌ی امن برای دوربین و fetch)
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            /** بدون این متد، هیچ پنجره‌ی انتخاب فایلی باز نمی‌شود */
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                // درخواست قبلی (اگر ناتمام مانده) آزاد می‌شود
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                return try {
                    fileChooserLauncher.launch(fileChooserParams.createIntent())
                    true
                } catch (primaryError: Exception) {
                    // برخی دستگاه‌ها برای نوع درخواستی (مثلاً camcorder) پیکر ندارند
                    try {
                        val fallback = Intent(Intent.ACTION_GET_CONTENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = "*/*"
                        }
                        fileChooserLauncher.launch(
                            Intent.createChooser(fallback, getString(R.string.pick_file))
                        )
                        true
                    } catch (secondaryError: Exception) {
                        this@MainActivity.filePathCallback = null
                        filePathCallback.onReceiveValue(null)
                        false
                    }
                }
            }

            /** مجوز دوربین/میکروفون برای getUserMedia داخل صفحه */
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val origin = request.origin?.toString().orEmpty().lowercase(Locale.ROOT)
                    val isOurPage = origin.isEmpty() ||
                        origin.contains(ASSET_HOST) ||
                        origin.startsWith("file:")

                    if (!isOurPage) {
                        request.deny()
                        return@runOnUiThread
                    }

                    val resources = request.resources
                    val needsCamera = resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    val needsAudio = resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)

                    val missing = mutableListOf<String>()
                    if (needsCamera && !hasPermission(Manifest.permission.CAMERA)) {
                        missing.add(Manifest.permission.CAMERA)
                    }
                    if (needsAudio && !hasPermission(Manifest.permission.RECORD_AUDIO)) {
                        missing.add(Manifest.permission.RECORD_AUDIO)
                    }

                    if (missing.isEmpty()) {
                        request.grant(resources)
                    } else {
                        pendingPermissionRequest = request
                        permissionLauncher.launch(missing.toTypedArray())
                    }
                }
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

        // بارگذاری فایل HTML از مبدأ امن (https) — لازمه‌ی کار دوربین در اپ
        webView.loadUrl("$ASSET_BASE_URL/assets/index.html")
    }

    override fun onDestroy() {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        super.onDestroy()
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    class WebAppInterface(private val activity: MainActivity) {
        @JavascriptInterface
        fun exitApp() {
            activity.runOnUiThread { activity.finish() }
        }

        /**
         * آدرس سرور (پوشه‌ی api) برای بارگذاری عکس و فیلم.
         * مقدار پیش‌فرض در `res/values/strings.xml` با نام `api_base_url` است؛
         * اگر خالی باشد، صفحه خودش از کاربر می‌پرسد.
         */
        @JavascriptInterface
        fun getApiBaseUrl(): String {
            return try {
                activity.getString(R.string.api_base_url).trim()
            } catch (e: Exception) {
                ""
            }
        }
    }

    companion object {
        private const val ASSET_HOST = "appassets.androidplatform.net"
        private const val ASSET_BASE_URL = "https://$ASSET_HOST"
    }
}
