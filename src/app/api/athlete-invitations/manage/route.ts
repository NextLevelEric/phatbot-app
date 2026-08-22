import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getAppUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const origin = new URL(request.url).origin;
  if (!origin.includes("localhost") && !origin.includes("127.0.0.1")) return origin;
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return vercelHost ? `https://${vercelHost}` : origin;
}

async function context(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !supabaseUrl || !publishableKey || !serviceRoleKey) return null;
  const userClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await userClient.auth.getUser(token);
  if (!user) return null;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: coach } = await admin.from("coach_profiles").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!coach) return null;
  return { user, admin };
}

export async function GET(request: Request) {
  const ctx = await context(request);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, admin } = ctx;
  const { data: links, error } = await admin.from("coach_athletes").select("athlete_user_id").eq("coach_user_id", user.id).eq("active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = [] as { athleteUserId: string; email: string; name: string; createdAt: string | null }[];
  for (const link of links ?? []) {
    const { data: authUser } = await admin.auth.admin.getUserById(link.athlete_user_id);
    const athlete = authUser.user;
    if (!athlete || athlete.last_sign_in_at) continue;
    const { data: profile } = await admin.from("profiles").select("display_name").eq("id", athlete.id).maybeSingle();
    rows.push({ athleteUserId: athlete.id, email: athlete.email ?? "", name: profile?.display_name ?? "Athlete", createdAt: athlete.created_at ?? null });
  }
  return NextResponse.json({ invites: rows });
}

export async function POST(request: Request) {
  try {
    const ctx = await context(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { user, admin } = ctx;
    const body = await request.json();
    const action = String(body.action ?? "");
    const athleteUserId = String(body.athleteUserId ?? "");
    if (!athleteUserId) return NextResponse.json({ error: "Athlete is required." }, { status: 400 });
    const { data: link } = await admin.from("coach_athletes").select("athlete_user_id").eq("coach_user_id", user.id).eq("athlete_user_id", athleteUserId).eq("active", true).maybeSingle();
    if (!link) return NextResponse.json({ error: "You do not have access to this athlete." }, { status: 403 });
    const { data: authResult } = await admin.auth.admin.getUserById(athleteUserId);
    const athlete = authResult.user;
    if (!athlete?.email) return NextResponse.json({ error: "Athlete account not found." }, { status: 404 });
    if (athlete.last_sign_in_at) return NextResponse.json({ error: "This athlete has already activated their account." }, { status: 400 });

    if (action === "resend") {
      const resendKey = process.env.RESEND_API_KEY;
      const emailDomain = process.env.RESEND_EMAIL_DOMAIN;
      if (!resendKey || !emailDomain) return NextResponse.json({ error: "Email service is not configured." }, { status: 500 });
      const appUrl = getAppUrl(request);
      const { data: generated, error: generateError } = await admin.auth.admin.generateLink({ type: "magiclink", email: athlete.email, options: { redirectTo: `${appUrl}/auth/accept-athlete-invite` } });
      if (generateError) return NextResponse.json({ error: generateError.message }, { status: 500 });
      const joinUrl = `${appUrl}/auth/accept-athlete-invite?token_hash=${encodeURIComponent(generated.properties.hashed_token)}&type=${encodeURIComponent(generated.properties.verification_type)}`;
      const { data: coachProfile } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      const coachName = coachProfile?.display_name?.trim() || "Your coach";
      const resend = new Resend(resendKey);
      const { error: emailError } = await resend.emails.send({
        from: `PHATBOT <invites@${emailDomain}>`,
        to: athlete.email,
        subject: `${coachName} resent your PHATBOT invitation`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b"><p style="font-size:12px;letter-spacing:4px;font-weight:700">PHATBOT</p><h1 style="font-size:28px;margin:24px 0 12px">Your PHATBOT training space is ready.</h1><p style="font-size:16px;line-height:1.6;color:#52525b">${coachName} resent your PHATBOT activation link.</p><a href="${joinUrl}" style="display:inline-block;margin-top:20px;padding:14px 22px;background:#18181b;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Activate PHATBOT Account</a></div>`,
      });
      if (emailError) return NextResponse.json({ error: emailError.message }, { status: 502 });
      return NextResponse.json({ ok: true });
    }

    if (action === "cancel") {
      const { count } = await admin.from("workout_sessions").select("id", { count: "exact", head: true }).eq("athlete_user_id", athleteUserId);
      if ((count ?? 0) > 0) return NextResponse.json({ error: "This athlete already has workout history, so the account cannot be deleted from pending invites." }, { status: 400 });
      await admin.from("workouts").delete().eq("athlete_user_id", athleteUserId);
      await admin.from("coach_athletes").delete().eq("athlete_user_id", athleteUserId);
      await admin.from("athlete_invitations").delete().eq("athlete_email", athlete.email.toLowerCase());
      const { error: deleteError } = await admin.auth.admin.deleteUser(athleteUserId);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to manage invitation." }, { status: 500 });
  }
}
