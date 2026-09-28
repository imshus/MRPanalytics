package com.itsolution.prathamanalytics;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * MRPanalytics phone app. The analytics UI is bundled inside the APK (assets/ui, copied from
 * frontend/src at build time), so it always shows, whatever the server serves at its web address.
 * The UI asks for data at /api; this activity fetches it natively from the data server
 * (SERVER_URL, default https://analytics.mrpscan.com) so no browser cross-site rules apply.
 * No database credentials live in the APK: the server holds them behind the access key.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "pratham_analytics"; // kept so saved server address survives updates
    private static final String KEY_SERVER = "server_url";
    // Reserved Android host for app-bundled content; it never resolves on the network.
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + APP_HOST + "/";
    private static final String CONNECT_PAGE = "file:///android_asset/connect.html";

    private WebView web;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setTextZoom(100);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!APP_HOST.equals(uri.getHost())) return null;
                String path = uri.getPath() == null ? "/" : uri.getPath();
                if (path.equals("/api") || path.startsWith("/api/")) return fetchApi(request, uri);
                return serveAsset(path);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (APP_HOST.equals(uri.getHost()) || "file".equals(uri.getScheme())) return false;
                if ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                    return true; // invoice PDFs and other external links open in the browser
                }
                return false;
            }
        });
        web.addJavascriptInterface(new Shell(), "MRPscanShell");
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
        setContentView(web);
    }

    /** Data server base, without trailing slash. */
    private String serverUrl() {
        String url = prefs.getString(KEY_SERVER, BuildConfig.DEFAULT_SERVER_URL);
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        return url;
    }

    /** Serves the bundled UI from assets/ui. Unknown paths fall back to index.html (hash routing). */
    private WebResourceResponse serveAsset(String path) {
        String name = path.equals("/") || path.isEmpty() ? "index.html" : path.substring(1);
        if (name.contains("..")) return text(403, "Forbidden", "text/plain", "Forbidden");
        InputStream in;
        try {
            in = getAssets().open("ui/" + name);
        } catch (IOException notFound) {
            try { in = getAssets().open("ui/index.html"); name = "index.html"; }
            catch (IOException e) { return text(404, "Not Found", "text/plain", "UI missing from app"); }
        }
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse(mimeFor(name), "UTF-8", 200, "OK", headers, in);
    }

    /** Forwards the UI's /api request to the data server natively (no CORS in the way). */
    private WebResourceResponse fetchApi(WebResourceRequest request, Uri uri) {
        String target = serverUrl() + uri.getEncodedPath() + (uri.getEncodedQuery() != null ? "?" + uri.getEncodedQuery() : "");
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(target).openConnection();
            conn.setRequestMethod("GET".equalsIgnoreCase(request.getMethod()) ? "GET" : request.getMethod());
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(90000);
            conn.setInstanceFollowRedirects(true);
            for (Map.Entry<String, String> h : request.getRequestHeaders().entrySet()) {
                String k = h.getKey().toLowerCase();
                if (k.equals("x-access-key") || k.equals("accept") || k.equals("accept-language")) conn.setRequestProperty(h.getKey(), h.getValue());
            }
            int status = conn.getResponseCode();
            InputStream body = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (body == null) body = new ByteArrayInputStream(new byte[0]);
            String contentType = conn.getContentType() == null ? "application/json" : conn.getContentType();
            String mime = contentType.split(";")[0].trim();
            String charset = "UTF-8";
            for (String part : contentType.split(";")) {
                String p = part.trim();
                if (p.toLowerCase().startsWith("charset=")) charset = p.substring(8);
            }
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            String reason = conn.getResponseMessage();
            if (reason == null || reason.trim().isEmpty()) reason = status < 400 ? "OK" : "Error";
            if (!mime.contains("json")) {
                // The data server answered with something that is not the API (e.g. an HTML error page).
                return text(502, "Bad Gateway", "application/json",
                        "{\"error\":\"The server at " + escJson(serverUrl()) + " did not answer as the MRPanalytics API (HTTP " + status + ").\"}");
            }
            return new WebResourceResponse(mime, charset, status, reason, headers, body);
        } catch (Exception e) {
            if (conn != null) conn.disconnect();
            return text(502, "Bad Gateway", "application/json",
                    "{\"error\":\"Cannot reach the data server " + escJson(serverUrl()) + ": " + escJson(String.valueOf(e.getMessage())) + "\"}");
        }
    }

    private static WebResourceResponse text(int status, String reason, String mime, String body) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse(mime, "UTF-8", status, reason, headers,
                new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }

    private static String escJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ");
    }

    private static String mimeFor(String name) {
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".js")) return "text/javascript";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".json")) return "application/json";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    private void showConnect(String error) {
        String url = CONNECT_PAGE + "?server=" + Uri.encode(serverUrl()) + (error != null ? "&error=" + Uri.encode(error) : "");
        web.loadUrl(url);
    }

    /** Bridge used by connect.html and by the UI's "Server" button. */
    public class Shell {
        @JavascriptInterface
        public String getServerUrl() { return serverUrl(); }

        @JavascriptInterface
        public String getDefaultServerUrl() { return BuildConfig.DEFAULT_SERVER_URL; }

        @JavascriptInterface
        public void connect(String url) {
            String clean = url == null ? "" : url.trim();
            if (clean.isEmpty()) return;
            if (!clean.startsWith("http://") && !clean.startsWith("https://")) clean = "https://" + clean;
            while (clean.endsWith("/")) clean = clean.substring(0, clean.length() - 1);
            prefs.edit().putString(KEY_SERVER, clean).apply();
            web.post(() -> { web.clearHistory(); web.loadUrl(START_URL); });
        }

        @JavascriptInterface
        public void openSettings() { web.post(() -> showConnect(null)); }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
