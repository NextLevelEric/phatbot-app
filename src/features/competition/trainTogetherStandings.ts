import type { TrainTogetherStanding } from "@/components/TrainTogetherCompetitionBoard";

// Read-only RPCs may reject on transport failures or return database errors.
export async function readRoomStandings(request: () => PromiseLike<{
  data: unknown; error: unknown;
}>): Promise<{ rows: TrainTogetherStanding[]; failed: boolean }> {
  try {
    const { data, error } = await request();
    if (error) return { rows: [], failed: true };
    return { rows: (data ?? []) as TrainTogetherStanding[], failed: false };
  } catch {
    return { rows: [], failed: true };
  }
}
