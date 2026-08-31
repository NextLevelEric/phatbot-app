import { createSupabaseBrowserClient } from "@/lib/supabase";

export type ProductEventName =
  | "registration_completed"
  | "first_workout_created"
  | "workout_started"
  | "workout_completed"
  | "report_viewed";

type TrackProductEventOptions = {
  dedupeKey: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function trackProductEvent(
  eventName: ProductEventName,
  options: TrackProductEventOptions,
) {
  try {
    const supabase = createSupabaseBrowserClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return;

    const { error } = await supabase.from("product_events").insert({
      athlete_user_id: user.id,
      event_name: eventName,
      entity_type: options.entityType ?? null,
      entity_id: options.entityId ?? null,
      dedupe_key: options.dedupeKey,
      metadata: options.metadata ?? {},
    });

    if (error && error.code !== "23505") {
      console.warn("PHATBOT analytics event failed", {
        eventName,
        code: error.code,
      });
    }
  } catch (error) {
    console.warn("PHATBOT analytics unavailable", {
      eventName,
      error,
    });
  }
}
