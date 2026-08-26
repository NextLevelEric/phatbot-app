import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DELETE_CONFIRMATION = "DELETE";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      console.error("PHATBOT account deletion is missing required server configuration.");
      return NextResponse.json({ error: "Account deletion is temporarily unavailable. Please contact support." }, { status: 503 });
    }

    const body = await request.json().catch(() => null);
    if (body?.confirmation !== DELETE_CONFIRMATION) {
      return NextResponse.json({ error: `Type ${DELETE_CONFIRMATION} to confirm account deletion.` }, { status: 400 });
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Preserve IDs of private exercises before deleting the auth user. The profile FK uses
    // ON DELETE SET NULL for exercises.created_by, so without this cleanup those exercises
    // could otherwise become orphaned system-looking records after account deletion.
    const { data: createdExercises, error: exerciseLookupError } = await admin
      .from("exercises")
      .select("id")
      .eq("created_by", user.id);
    if (exerciseLookupError) {
      console.error("PHATBOT account deletion could not inventory user-created exercises", exerciseLookupError);
      return NextResponse.json({ error: "We could not safely prepare this account for deletion. Please try again or contact support." }, { status: 500 });
    }
    const createdExerciseIds = (createdExercises ?? []).map((row) => row.id as string);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("PHATBOT account deletion failed", deleteError);
      return NextResponse.json({ error: "We could not delete your account. Please try again or contact support." }, { status: 500 });
    }

    if (createdExerciseIds.length > 0) {
      const { error: cleanupError } = await admin.from("exercises").delete().in("id", createdExerciseIds);
      if (cleanupError) {
        // The account itself is already gone. Keep the response successful, but record the
        // cleanup failure for operator follow-up rather than exposing database detail.
        console.error("PHATBOT deleted account but could not remove all orphaned user-created exercises", cleanupError);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PHATBOT account deletion encountered an unexpected error", error);
    return NextResponse.json({ error: "We could not delete your account. Please try again or contact support." }, { status: 500 });
  }
}
