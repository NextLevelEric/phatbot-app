"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { scoreExercisePerformance, type PerformanceSet } from "@/features/scoring/progressiveOverload";

type RawSet = { weight: number; reps: number; partial_reps: number; set_type: string; set_number: number };
type ExerciseSession = { exercise_id: string; position: number; notes: string | null; sets: RawSet[] };
type WorkoutSession = { id: string; workout_id: string; workout_name_snapshot: string; completed_at: string };
type WeeklyWorkout = { id: string; name: string; completedAt: string; score: number | null };