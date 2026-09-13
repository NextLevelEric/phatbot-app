# Stock program catalog source mapping

This review maps every distinct exercise label in the four source workbooks to a
canonical PHATBOT exercise. Matching is exact and reviewed; no fuzzy matching is
used. Categories: **A** existing canonical exact match, **B** existing reviewed
alias, **C** new safe alias to an existing canonical, **D** new canonical exercise.

| Raw workbook label | Category | Canonical exercise |
| --- | --- | --- |
| Assisted Dip | D | Assisted Dip |
| Back Extension | D | Back Extension |
| Barbell Skull Crusher | D | Barbell Skull Crusher |
| Barbell Squat | C | Barbell Back Squat |
| Bayesian Curl (Face-Away Cable Curl, Low to high Cable Curl) | D | Bayesian Cable Curl |
| Bent Over Barbell Row | B | Bent-Over Barbell Row |
| Body Weight Lunge | D | Bodyweight Lunge |
| Bulgarian Split Squat | D | Bulgarian Split Squat |
| Cable Flexion Row | D | Cable Flexion Row |
| Cable Lat Prayers | D | Cable Lat Prayer |
| Cable Preacher Curls | D | Cable Preacher Curl |
| Cable Tricep Extension | D | Cable Triceps Extension |
| Cable Tricep Extensions | D | Cable Triceps Extension |
| Chest Fly | D | Chest Fly |
| Chest Supported Dumbell Row | B | Chest-Supported Dumbbell Row |
| Chest Supported Plated Row | D | Plate-Loaded Chest-Supported Row |
| Conventional Deadlift | A | Conventional Deadlift |
| Dead Hang | D | Dead Hang |
| Deficit Push Ups | D | Deficit Push-Up |
| Deficit pushups | D | Deficit Push-Up |
| Dips | D | Dip |
| Dumbbell Incline Bench Press | C | Incline Dumbbell Bench Press |
| Dumbbell Lateral Raise | D | Dumbbell Lateral Raise |
| Dumbbell Preacher Curls | D | Dumbbell Preacher Curl |
| Flat barbell bench press | B | Barbell Bench Press |
| Good Mornings | D | Good Morning |
| Guilotine Smith Press | D | Guillotine Smith Press |
| Hammer Strength Lateral Raise | D | Hammer Strength Lateral Raise |
| Hammer Strength Plate-Loaded Iso-Lateral Decline Chest Press | D | Hammer Strength Plate-Loaded Iso-Lateral Decline Chest Press |
| Hanging Leg Lift | D | Hanging Leg Raise |
| Heel Elevated Barbell Squat | D | Heel-Elevated Barbell Squat |
| Hip Abducter Machine | D | Hip Abductor Machine |
| Hip Adducter Machine | D | Hip Adductor Machine |
| Incline Dumbbell Bench Press | A | Incline Dumbbell Bench Press |
| Incline Dumbbell Lateral Raise | D | Incline Dumbbell Lateral Raise |
| ISO Dumbbell Preacher Curls | D | Dumbbell Preacher Curl |
| ISO Leg Extension | D | Iso-Lateral Leg Extension |
| Lateral Raise | D | Lateral Raise |
| Leg Curls | D | Leg Curl |
| Leg extension | D | Leg Extension |
| Machine Chest Fly | D | Machine Chest Fly |
| Neutral Grip Pull Down | B | Neutral-Grip Lat Pulldown |
| Pendulum Squat | D | Pendulum Squat |
| Plate Loaded Seated Dip | D | Plate-Loaded Seated Dip |
| plate-loaded seated row | D | Plate-Loaded Seated Row |
| Plated Chest Fly | D | Plate-Loaded Chest Fly |
| Plated Leg Press | D | Plate-Loaded Leg Press |
| Pull Ups | D | Pull-Up |
| RDLS | B | Romanian Deadlift |
| Seated Dumbbell Lateral Raise | D | Seated Dumbbell Lateral Raise |
| Seated Dumbbell Shoulder Press | C | Dumbbell Shoulder Press |
| Seated Incline Dumbbell Curl | D | Seated Incline Dumbbell Curl |
| Seated Leg Curls | D | Seated Leg Curl |
| Sissy Squat | D | Sissy Squat |
| Traditional Deadlift | B | Conventional Deadlift |
| Tricep Cable katanas | D | Triceps Katana Extension |
| Upright Barbell Row | D | Upright Barbell Row |
| Upright Row | D | Upright Row |
| Weighted Sit up | D | Weighted Sit-Up |
| Weighted Sit Ups | D | Weighted Sit-Up |
| Wide Grip Cable Pull Downs | D | Wide-Grip Lat Pulldown |
| Wide Grip Pull Down | D | Wide-Grip Lat Pulldown |
| Wide Grip Pull Ups | D | Wide-Grip Pull-Up |

No raw label remains unresolved. Four source labels intentionally remain generic
canonical identities because the workbook does not identify equipment/setup:
`Chest Fly`, `Lateral Raise`, `Leg Curl`, and `Upright Row`. They are not merged
with cable, dumbbell, seated, machine, barbell, or plate-loaded variants.

## New canonical metadata

Secondary muscles are shown in stored order. A dash means no reviewed secondary
muscle is recorded.

| Canonical exercise | Primary | Secondary | Pattern | Equipment | Class | Laterality | Setup |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Assisted Dip | triceps | chest, shoulders | vertical push | machine | compound | bilateral | other |
| Back Extension | back | glutes, hamstrings | hinge | bodyweight | compound | bilateral | other |
| Barbell Skull Crusher | triceps | — | isolation | barbell | isolation | bilateral | flat |
| Bayesian Cable Curl | biceps | — | isolation | cable | isolation | unilateral | standing |
| Bodyweight Lunge | quads | glutes | lunge | bodyweight | compound | unilateral | standing |
| Bulgarian Split Squat | quads | glutes | lunge | other | compound | unilateral | standing |
| Cable Flexion Row | back | biceps | horizontal pull | cable | compound | bilateral | seated |
| Cable Lat Prayer | back | — | vertical pull | cable | isolation | bilateral | standing |
| Cable Preacher Curl | biceps | — | isolation | cable | isolation | bilateral | seated |
| Cable Triceps Extension | triceps | — | isolation | cable | isolation | bilateral | standing |
| Chest Fly | chest | — | isolation | other | isolation | bilateral | other |
| Plate-Loaded Chest-Supported Row | back | biceps | horizontal pull | machine | compound | bilateral | chest-supported |
| Dead Hang | back | shoulders | other | bodyweight | compound | bilateral | other |
| Deficit Push-Up | chest | triceps, shoulders | horizontal push | bodyweight | compound | bilateral | other |
| Dip | triceps | chest, shoulders | vertical push | bodyweight | compound | bilateral | other |
| Dumbbell Lateral Raise | shoulders | — | isolation | dumbbell | isolation | bilateral | standing |
| Dumbbell Preacher Curl | biceps | — | isolation | dumbbell | isolation | unilateral | seated |
| Good Morning | hamstrings | glutes, back | hinge | barbell | compound | bilateral | standing |
| Guillotine Smith Press | chest | triceps, shoulders | horizontal push | smith machine | compound | bilateral | flat |
| Hammer Strength Lateral Raise | shoulders | — | isolation | machine | isolation | bilateral | seated |
| Hammer Strength Plate-Loaded Iso-Lateral Decline Chest Press | chest | triceps, shoulders | horizontal push | machine | compound | unilateral | decline |
| Hanging Leg Raise | core | — | core | bodyweight | compound | bilateral | other |
| Heel-Elevated Barbell Squat | quads | glutes | squat | barbell | compound | bilateral | standing |
| Hip Abductor Machine | glutes | — | isolation | machine | isolation | bilateral | seated |
| Hip Adductor Machine | other | — | isolation | machine | isolation | bilateral | seated |
| Incline Dumbbell Lateral Raise | shoulders | — | isolation | dumbbell | isolation | bilateral | incline |
| Iso-Lateral Leg Extension | quads | — | isolation | machine | isolation | unilateral | seated |
| Lateral Raise | shoulders | — | isolation | other | isolation | bilateral | other |
| Leg Curl | hamstrings | — | isolation | other | isolation | bilateral | other |
| Leg Extension | quads | — | isolation | machine | isolation | bilateral | seated |
| Machine Chest Fly | chest | — | isolation | machine | isolation | bilateral | seated |
| Pendulum Squat | quads | glutes | squat | machine | compound | bilateral | standing |
| Plate-Loaded Seated Dip | triceps | chest, shoulders | vertical push | machine | compound | bilateral | seated |
| Plate-Loaded Seated Row | back | biceps | horizontal pull | machine | compound | bilateral | seated |
| Plate-Loaded Chest Fly | chest | — | isolation | machine | isolation | bilateral | seated |
| Plate-Loaded Leg Press | quads | glutes | squat | machine | compound | bilateral | seated |
| Pull-Up | back | biceps | vertical pull | bodyweight | compound | bilateral | other |
| Seated Dumbbell Lateral Raise | shoulders | — | isolation | dumbbell | isolation | bilateral | seated |
| Seated Incline Dumbbell Curl | biceps | — | isolation | dumbbell | isolation | bilateral | incline |
| Seated Leg Curl | hamstrings | — | isolation | machine | isolation | bilateral | seated |
| Sissy Squat | quads | — | squat | bodyweight | isolation | bilateral | standing |
| Triceps Katana Extension | triceps | — | isolation | cable | isolation | bilateral | standing |
| Upright Barbell Row | shoulders | biceps, back | vertical pull | barbell | compound | bilateral | standing |
| Upright Row | shoulders | biceps, back | vertical pull | other | compound | bilateral | standing |
| Weighted Sit-Up | core | — | core | other | isolation | bilateral | other |
| Wide-Grip Lat Pulldown | back | biceps | vertical pull | cable | compound | bilateral | seated |
| Wide-Grip Pull-Up | back | biceps | vertical pull | bodyweight | compound | bilateral | other |

## Program seed shape

| Family slug | Published version slug | Workouts | Exercise prescriptions by workout |
| --- | --- | ---: | --- |
| `first-day-in-the-gym` | `first-day-in-the-gym-v1` | 4 | 3, 3, 3, 4 |
| `full-body` | `full-body-v1` | 2 | 7, 7 |
| `strength-as-a-skill` | `strength-as-a-skill-v1` | 6 | 4, 4, 5, 4, 4, 4 |
| `inaugural-eager-beaver` | `inaugural-eager-beaver-v1` | 6 | 5, 6, 5, 6, 5, 4 |

Each spreadsheet exercise block becomes one ordered
`training_program_exercises` row. Its repeated source rows become one ordered
`prescribed_set_targets text[]`. The four blank Dumbbell Lateral Raise targets in
Inaugural Eager Beaver remain `['', '', '', '']`; no target is inferred.
