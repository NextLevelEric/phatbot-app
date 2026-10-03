package com.nextleveldigitalmedia.phatbot;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;

/** Health Connect may open onboarding repeatedly; never prompt for permissions automatically. */
public class HealthConnectOnboardingActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        new AlertDialog.Builder(this).setTitle("Connect PHATBOT")
            .setMessage("Open PHATBOT, sign in, then open Me > Health & Wearables to review data use and connect Health Connect.")
            .setPositiveButton("Open PHATBOT", (dialog, which) -> {
                startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
                finish();
            }).setNegativeButton("Not now", (dialog, which) -> finish())
            .setOnCancelListener(dialog -> finish()).show();
    }
}
