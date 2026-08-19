import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const emailDomain = process.env.RESEND_EMAIL_DOMAIN;
    if (!supabaseUrl || !supabaseKey || !resendKey || !emailDomain) return NextResponse.json({ error: "Email service is not configured." }, { status: 500 });

    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const coachEmail = String(body.coachEmail ?? "").trim().toLowerCase();
    if (!coachEmail || !coachEmail.includes("@") || coachEmail === user.email?.toLowerCase()) return NextResponse.json({ error: "Enter a valid coach email address." }, { status: 400 });

    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
    const athleteName = profile?.display_name?.trim() || "A PHATBOT athlete";
    const { error: inviteError } = await supabase.from("coach_invitations").insert({ athlete_user_id: user.id, coach_email: coachEmail });
    if (inviteError) return NextResponse.json({ error: inviteError.code === "23505" ? "You already have a pending invitation for that coach." : inviteError.message }, { status: 400 });

    const origin = new URL(request.url).origin;
    const joinUrl = `${origin}/auth/coach?email=${encodeURIComponent(coachEmail)}`;
    const resend = new Resend(resendKey);
    const from = `PHATBOT <invites@${emailDomain}>`;
    const { error: emailError } = await resend.emails.send({
      from,
      to: coachEmail,
      subject: `${athleteName} invited you to coach them on PHATBOT`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b"><p style="font-size:12px;letter-spacing:4px;font-weight:700">PHATBOT</p><h1 style="font-size:28px;margin:24px 0 12px">${escapeHtml(athleteName)} invited you to coach them.</h1><p style="font-size:16px;line-height:1.6;color:#52525b">PHATBOT helps coaches review athlete workouts, progressive overload, personal records, weekly scoring, and strength progress.</p><a href="${joinUrl}" style="display:inline-block;margin-top:20px;padding:14px 22px;background:#18181b;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">View Athlete Invitation</a><p style="margin-top:28px;font-size:13px;color:#71717a">This invitation expires in 14 days. Sign up or sign in using ${escapeHtml(coachEmail)} to review it.</p></div>`,
    });
    if (emailError) {
      await supabase.from("coach_invitations").update({ status: "cancelled" }).eq("athlete_user_id", user.id).eq("coach_email", coachEmail).eq("status", "pending");
      return NextResponse.json({ error: `Invitation email could not be sent: ${emailError.message}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, coachEmail });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send invitation." }, { status: 500 }); }
}

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] ?? char)); }
