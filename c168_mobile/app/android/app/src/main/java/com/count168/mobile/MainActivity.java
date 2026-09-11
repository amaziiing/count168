package com.count168.mobile;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** 监听器只装一次；重复 setOnApplyWindowInsetsListener 会把自己覆盖掉。 */
    private boolean insetsListenerAttached = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySystemBarInsets();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView view = bridge == null ? null : bridge.getWebView();
                if (view != null && view.canGoBack()) {
                    view.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        // 兜底：旋转/切回前台/系统栏变化后再确认一次内边距
        applySystemBarInsets();
    }

    // targetSdk 35+ enforces edge-to-edge: the WebView extends behind the status
    // and navigation bars, so the page's own app bar slides under the status bar
    // (its right-side buttons then collide with the clock/battery icons) and
    // bottom-anchored UI gets covered by the nav bar. Pad the WebView with the
    // system-bar insets so page layout starts below the status bar and ends above
    // the nav bar. On Android < 15 the insets are 0 (no edge-to-edge) → no-op.
    private void applySystemBarInsets() {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;

        if (!insetsListenerAttached) {
            ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                        WindowInsetsCompat.Type.systemBars()
                                | WindowInsetsCompat.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
            insetsListenerAttached = true;
        }

        // 关键：setContentView 阶段 WebView 就已 attach，系统栏 insets 在那时已经派发过；
        // 之后才装监听器不会自动重放 —— 必须主动再请求一次，否则 padding 一直是 0，
        // 顶部栏就会被状态栏压住（v1.0/v1.1 上看到的问题）。
        ViewCompat.requestApplyInsets(webView);
    }
}
