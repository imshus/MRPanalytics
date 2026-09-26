package com.itsolution.prathamanalytics;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Native shell for MRPscan Analytics. It loads the analytics server's web app in a WebView.
 * No database credentials live in the APK: the server holds them and exposes a read-only API.
 * If the server is unreachable, a local "connect" screen lets the user fix the server address.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "pratham_analytics"; // kept so saved server address survives the rename
    private static final String KEY_SERVER = "server_url";
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
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                Uri server = Uri.parse(serverUrl());
                boolean sameServer = uri.getHost() != null && uri.getHost().equals(server.getHost()) && uri.getPort() == server.getPort();
                if (!sameServer && ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                    return true; // invoice PDFs and other external links open in the browser
                }
                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showConnect(String.valueOf(error.getDescription()));
            }
        });
        web.addJavascriptInterface(new Shell(), "MRPscanShell");
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(serverUrl());
        setContentView(web);
    }

    private String serverUrl() {
        return prefs.getString(KEY_SERVER, BuildConfig.DEFAULT_SERVER_URL);
    }

    private void showConnect(String error) {
        String url = CONNECT_PAGE + "?server=" + Uri.encode(serverUrl()) + (error != null ? "&error=" + Uri.encode(error) : "");
        web.loadUrl(url);
    }

    /** Bridge used by connect.html and by the web app's "Server" button. */
    public class Shell {
        @JavascriptInterface
        public String getServerUrl() { return serverUrl(); }

        @JavascriptInterface
        public String getDefaultServerUrl() { return BuildConfig.DEFAULT_SERVER_URL; }

        @JavascriptInterface
        public void connect(String url) {
            String clean = url == null ? "" : url.trim();
            if (clean.isEmpty()) return;
            if (!clean.startsWith("http://") && !clean.startsWith("https://")) clean = "http://" + clean;
            while (clean.endsWith("/")) clean = clean.substring(0, clean.length() - 1);
            prefs.edit().putString(KEY_SERVER, clean).apply();
            final String target = clean + "/";
            web.post(() -> { web.clearHistory(); web.loadUrl(target); });
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
