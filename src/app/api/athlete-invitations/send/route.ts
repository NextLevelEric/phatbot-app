import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionHost) return `https://${productionHost}`;
  return "https://phatbot-app.vercel.app";
}

function activationUrl(appUrl: string, hashedToken: string, type: string) {
  return `${appUrl}/auth/accept-athlete-invite?token_hash=${encodeURIComponent(hashedToken)}&type=${encodeURIComponent(type)}`;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const emailDomain = process.env.RESEND_EMAIL_DOMAIN;
    if (!supabaseUrl || !publishableKey || !serviceRoleKey || !resendKey || !emailDomain) {
      return NextResponse.json({ error: "Athlete invitation service is not fully configured." }, { status: 500 });
    }

    const userClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: coach } = await admin.from("coach_profiles").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!coach) return NextResponse.json({ error: "Coach mode is required." }, { status: 403 });

    const body = await request.json();
    const athleteEmail = String(body.athleteEmail ?? "").trim().toLowerCase();
    const athleteName = String(body.athleteName ?? "").trim();
    if (!athleteEmail || !athleteEmail.includes("@")) return NextResponse.json({ error: "Enter a valid athlete email." }, { status: 400 });
    if (athleteEmail === user.email?.toLowerCase()) return NextResponse.json({ error: "Use a different email for the athlete." }, { status: 400 });

    const appUrl = getAppUrl();
    let athleteUserId: string;
    let joinUrl: string;
    let status: "invited" | "resent" | "linked" = "invited";

    const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });
    const existing = listed.users.find((candidate) => candidate.email?.toLowerCase() === athleteEmail);

    if (existing) {
      athleteUserId = existing.id;
      if (existing.last_sign_in_at) {
        status = "linked";
        joinUrl = `${appUrl}/auth?email=${encodeURIComponent(athleteEmail)}`;
      } else {
        const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email: athleteEmail,
          options: { redirectTo: `${appUrl}/auth/accept-athlete-invite` },
        });
        if (generateError) return NextResponse.json({ error: generateError.message }, { status: 500 });
        status = "resent";
        joinUrl = activationUrl(appUrl, generated.properties.hashed_token, generated.properties.verification_type);
      }
    } else {
      const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
        type: "invite",
        email: athleteEmail,
        options: { redirectTo: `${appUrl}/auth/accept-athlete-invite`, data: athleteName ? { display_name: athleteName } : undefined },
      });
      if (generateError || !generated.user) return NextResponse.json({ error: generateError?.message ?? "Unable to create athlete account." }, { status: 500 });
      athleteUserId = generated.user.id;
      joinUrl = activationUrl(appUrl, generated.properties.hashed_token, generated.properties.verification_type);
    }

    await admin.from("profiles").upsert({ id: athleteUserId, display_name: athleteName || null, role: "athlete" }, { onConflict: "id" });
    await admin.from("athlete_profiles").upsert({ user_id: athleteUserId }, { onConflict: "user_id" });
    const { error: linkError } = await admin.from("coach_athletes").upsert({ coach_user_id: user.id, athlete_user_id: athleteUserId, active: true }, { onConflict: "coach_user_id,athlete_user_id" });
    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

    const { data: coachProfile } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const coachName = coachProfile?.display_name?.trim() || "Your coach";
    const resend = new Resend(resendKey);
    const { error: emailError } = await resend.emails.send({
      from: `PHATBOT <invites@${emailDomain}>`,
      to: athleteEmail,
      subject: status === "resent" ? `${coachName} resent your PHATBOT invitation` : `${coachName} invited you to PHATBOT`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b"><p style="font-size:12px;letter-spacing:4px;font-weight:700">PHATBOT</p><h1 style="font-size:28px;margin:24px 0 12px">Your PHATBOT training space is ready.</h1><p style="font-size:16px;line-height:1.6;color:#52525b">${escapeHtml(coachName)} has connected you to PHATBOT. Your training plan can already be waiting for you.</p><a href="${joinUrl}" style="display:inline-block;margin-top:20px;padding:14px 22px;background:#18181b;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">${status === "linked" ? "Open PHATBOT" : "Activate PHATBOT Account"}</a><p style="margin-top:28px;font-size:13px;color:#71717a">Use ${escapeHtml(athleteEmail)} for your PHATBOT account.</p></div>`,
    });
    if (emailError) return NextResponse.json({ error: `Athlete workspace was created, but the invitation email could not be sent: ${emailError.message}`, athleteUserId }, { status: 502 });

    return NextResponse.json({ ok: true, athleteUserId, status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to invite athlete." }, { status: 500 });
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char] ?? char));
}
