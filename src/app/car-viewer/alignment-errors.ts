/**
 * Alignment error definitions and diagnostic chart data.
 * Content sourced from Mercedes-Benz DRIVE Alignment Certification EKP 10.21.
 */

export type AngleCategory =
  | 'Camber' | 'Caster' | 'Toe' | 'SAI' | 'IncludedAngle' | 'ScrubRadius' | 'Setback';

export interface AlignmentErrorState {
  // The values applied to the wheels to depict this error visually
  leftCamber?: number;
  rightCamber?: number;
  totalToe?: number;
  caster?: number;
  sai?: number;
}

export interface AlignmentError {
  id: string;
  angle: AngleCategory;
  variant: string;        // e.g. "Excessive Positive"
  description: string;    // What the error is
  drivingEffect: string;  // How it affects driving
  tireWear: string;       // Tire wear pattern
  state: AlignmentErrorState;
}

export const ERROR_DEFINITIONS: AlignmentError[] = [
  // ===== CAMBER =====
  {
    id: 'camber-pos-left',
    angle: 'Camber',
    variant: 'Excessive Positive (Left)',
    description: 'Left wheel tilts outward at the top beyond spec.',
    drivingEffect: 'Vehicle pulls/drifts toward the LEFT (the side with more positive camber).',
    tireWear: 'Outside shoulder wear on the left front tire.',
    state: { leftCamber: 4, rightCamber: 0 }
  },
  {
    id: 'camber-neg-left',
    angle: 'Camber',
    variant: 'Excessive Negative (Left)',
    description: 'Left wheel tilts inward at the top beyond spec.',
    drivingEffect: 'Vehicle may pull toward the RIGHT (toward the more positive side). Reduces straight-line stability.',
    tireWear: 'Inside shoulder wear on the left front tire.',
    state: { leftCamber: -4, rightCamber: 0 }
  },
  {
    id: 'camber-cross',
    angle: 'Camber',
    variant: 'Cross Camber > 0.5°',
    description: 'Side-to-side camber difference exceeds 0.5°. Vehicle pulls toward the more positive side.',
    drivingEffect: 'Steady pull during straight-line driving. Driver must hold steering wheel against the pull.',
    tireWear: 'Uneven shoulder wear, side dependent on which wheel has the larger angle.',
    state: { leftCamber: 2.5, rightCamber: -1 }
  },

  // ===== CASTER =====
  {
    id: 'caster-low',
    angle: 'Caster',
    variant: 'Too Negative / Low',
    description: 'Steering axis is tilted forward (or insufficiently rearward).',
    drivingEffect: 'Poor steering self-centering. Vehicle wanders. Susceptible to crosswinds and tire pull. Steering wheel does not return after turn.',
    tireWear: 'Generally none directly, but allows other wear from poor tracking.',
    state: { caster: 0 }
  },
  {
    id: 'caster-high',
    angle: 'Caster',
    variant: 'Excessive Positive / High',
    description: 'Steering axis is tilted excessively rearward.',
    drivingEffect: 'High steering effort, especially at low speeds. Heavy "on-center" feel.',
    tireWear: 'None directly.',
    state: { caster: 18 }
  },
  {
    id: 'caster-cross',
    angle: 'Caster',
    variant: 'Different Left/Right',
    description: 'Caster differs side-to-side. Vehicle pulls toward the side with the LESS positive caster.',
    drivingEffect: 'Steady pull during straight-line driving. Pulls toward the LOWER caster side.',
    tireWear: 'None directly.',
    state: { caster: 6 }
  },

  // ===== TOE =====
  {
    id: 'toe-in-excessive',
    angle: 'Toe',
    variant: 'Excessive Toe-In',
    description: 'Front of both wheels point toward centerline beyond spec.',
    drivingEffect: 'Nervous, twitchy straight-ahead driving. Tires scrub.',
    tireWear: 'Feathered edge on outside of tread (run hand from center outward — feels smooth out, sharp in).',
    state: { totalToe: 2.5 }
  },
  {
    id: 'toe-out-excessive',
    angle: 'Toe',
    variant: 'Excessive Toe-Out',
    description: 'Front of both wheels point away from centerline beyond spec.',
    drivingEffect: 'Spongy/wandering handling characteristics. Vehicle darts on bumps.',
    tireWear: 'Feathered edge on inside of tread.',
    state: { totalToe: -2.5 }
  },

  // ===== SAI =====
  {
    id: 'sai-low',
    angle: 'SAI',
    variant: 'Too Small',
    description: 'Steering axis inclination is less than spec — generally indicates a bent strut, knuckle, or chassis damage.',
    drivingEffect: 'Poor steering self-centering. Susceptibility to tire faults (taper, conicity). Can lead to pulling to one side.',
    tireWear: 'None directly, but pull may cause secondary wear.',
    state: { sai: 5 }
  },
  {
    id: 'sai-high',
    angle: 'SAI',
    variant: 'Too Large',
    description: 'Steering axis inclination exceeds spec.',
    drivingEffect: 'High steering and holding forces.',
    tireWear: 'None directly.',
    state: { sai: 19 }
  },
  {
    id: 'sai-uneven',
    angle: 'SAI',
    variant: 'Different Left/Right',
    description: 'SAI differs side-to-side — usually indicates bent suspension component or chassis damage.',
    drivingEffect: 'Susceptible to pulling to one side. Torque steer. Brake pull. Bump steer. Pull toward the LESSER angle.',
    tireWear: 'None directly.',
    state: { sai: 13 }
  },

  // ===== SCRUB RADIUS =====
  {
    id: 'scrub-pos',
    angle: 'ScrubRadius',
    variant: 'Positive',
    description: 'SAI line meets the road inboard of the tire centerline. Most common configuration.',
    drivingEffect: 'Stable straight-ahead driving but requires counter-steering during unequal braking. Pushes toe inward when braking.',
    tireWear: 'None directly.',
    state: {}
  },
  {
    id: 'scrub-neg',
    angle: 'ScrubRadius',
    variant: 'Negative',
    description: 'SAI line meets the road outboard of the tire centerline. Used with ABS for stability.',
    drivingEffect: 'Steering automatically counter-steers during uneven braking — driver only lightly holds steering. Pulls toe outward when braking.',
    tireWear: 'None directly.',
    state: {}
  },
  {
    id: 'scrub-zero',
    angle: 'ScrubRadius',
    variant: 'Zero',
    description: 'SAI line meets the road exactly at the tire centerline.',
    drivingEffect: 'Prevents transfer of unequal forces during braking or with a defective tire. High steering forces at standstill.',
    tireWear: 'None directly.',
    state: {}
  }
];

// ============================================================================
// Diagnostic chart data — Mercedes DRIVE EKP 10.21 pages 56-57
// ============================================================================

export type SuspensionType = 'SLA' | 'MacPherson';
export type TriState = 'OK' | 'Less' | 'Greater';

export interface DiagnosticEntry {
  sai: TriState;
  camber: TriState;
  ia: TriState;
  problem: string;
}

export const SLA_DIAGNOSTICS: DiagnosticEntry[] = [
  { sai: 'OK',      camber: 'Less',    ia: 'Less',    problem: 'Bent Spindle' },
  { sai: 'Less',    camber: 'Greater', ia: 'OK',      problem: 'Bent lower control arm' },
  { sai: 'Greater', camber: 'Less',    ia: 'OK',      problem: 'Bent upper control arm' },
  { sai: 'Less',    camber: 'Greater', ia: 'Greater', problem: 'Bent lower control arm and/or spindle' },
];

export const MACPHERSON_DIAGNOSTICS: DiagnosticEntry[] = [
  { sai: 'OK',      camber: 'Less',    ia: 'Less',    problem: 'Bent spindle or strut' },
  { sai: 'OK',      camber: 'Greater', ia: 'Greater', problem: 'Bent spindle or strut' },
  { sai: 'Less',    camber: 'Greater', ia: 'OK',      problem: 'Bent control arm or strut tower out at top' },
  { sai: 'Greater', camber: 'Greater', ia: 'Greater', problem: 'Bent strut or strut tower in at top' },
  { sai: 'Less',    camber: 'Greater', ia: 'Greater', problem: 'Bent control arm, or strut tower out at top, or bent spindle and/or strut' },
  { sai: 'Less',    camber: 'Less',    ia: 'Less',    problem: 'Strut tower in at top, and spindle or control arm or strut bent' },
];

export function lookupDiagnostic(
  type: SuspensionType, sai: TriState, camber: TriState, ia: TriState
): string {
  const table = type === 'SLA' ? SLA_DIAGNOSTICS : MACPHERSON_DIAGNOSTICS;
  const match = table.find(e => e.sai === sai && e.camber === camber && e.ia === ia);
  return match ? match.problem : 'No matching problem in chart for this combination. The angles may be within spec, or the combination is unusual — verify measurements.';
}

/** Group errors by angle category for UI display */
export function getErrorsByAngle(): Map<AngleCategory, AlignmentError[]> {
  const map = new Map<AngleCategory, AlignmentError[]>();
  for (const err of ERROR_DEFINITIONS) {
    if (!map.has(err.angle)) map.set(err.angle, []);
    map.get(err.angle)!.push(err);
  }
  return map;
}
