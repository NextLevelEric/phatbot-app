package com.nextleveldigitalmedia.phatbot;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Public, read-only rationale. Never inherits the authenticated Capacitor bridge. */
public class HealthConnectPrivacyActivity extends Activity {
    public static final String PRIVACY_URL = "https://app.phatbotfit.com/privacy";
    public static final String DISCLOSURE = "PHATBOT reads the Health Connect categories you approve: steps, active calories, exercise sessions, distance, heart rate, and sleep sessions. "
        + "When you sync, approved data is sent to PHATBOT and stored with your account in its Supabase backend for activity history, cardio reports, daily progress, sleep records, and existing competition calculations. "
        + "Access is read-only; PHATBOT does not write to Health Connect or read in the background. You can grant only some categories or decline, and change access in Health Connect settings. Revoking access stops new reads; previously saved PHATBOT history remains until deleted.";
    private WebView policy;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (16 * getResources().getDisplayMetrics().density);
        layout.setPadding(padding, padding, padding, padding);
        layout.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(padding + insets.getSystemWindowInsetLeft(), padding + insets.getSystemWindowInsetTop(),
                padding + insets.getSystemWindowInsetRight(), padding + insets.getSystemWindowInsetBottom());
            return insets;
        });
        TextView heading = new TextView(this);
        heading.setText("PHATBOT Health Connect privacy\nRead-only access for the categories you choose. The PHATBOT privacy policy is shown below.");
        layout.addView(heading);
        Button rationale = new Button(this);
        rationale.setText("Why PHATBOT requests read access");
        rationale.setOnClickListener(view -> new android.app.AlertDialog.Builder(this)
            .setTitle("Health data in PHATBOT").setMessage(DISCLOSURE)
            .setPositiveButton("Close", null).show());
        layout.addView(rationale);
        Button browser = new Button(this);
        browser.setText("Open privacy policy in browser");
        browser.setOnClickListener(view -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_URL))); }
            catch (android.content.ActivityNotFoundException error) { heading.setText("Review the privacy policy at " + PRIVACY_URL + " when a browser is available."); }
        });
        layout.addView(browser);
        policy = new WebView(this);
        policy.getSettings().setJavaScriptEnabled(false);
        policy.getSettings().setAllowFileAccess(false);
        policy.getSettings().setAllowContentAccess(false);
        policy.setWebViewClient(new WebViewClient() {
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) heading.setText("The privacy policy could not load. Check your connection and reopen this page, or open " + PRIVACY_URL + " in a browser. No health data is read from this page.");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Intent extras and arbitrary links cannot navigate this exported activity.
                return !PRIVACY_URL.equals(request.getUrl().toString());
            }
        });
        layout.addView(policy, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);
        layout.requestApplyInsets();
        policy.loadUrl(PRIVACY_URL);
    }
    @Override public void onDestroy() {
        if (policy != null) policy.destroy();
        super.onDestroy();
    }
}
