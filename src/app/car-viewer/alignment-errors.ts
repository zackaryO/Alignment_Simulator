/**
 * @file alignment-errors.ts
 *
 * Static data tables describing canned alignment-error scenarios and the
 * SAI-based diagnostic chart used by the simulator's "Errors" mode.
 *
 * The textbook content (descriptions, driving effects, tire-wear patterns,
 * SAI/Camber/IA combinations) is sourced from Mercedes-Benz DRIVE Alignment
 * Certification EKP 10.21 — the same student curriculum used by the
 * Mercedes-Benz technician training programs.
 *
 * Two pieces of data live here:
 *   1. {@link ERROR_DEFINITIONS} — every selectable scenario plus the
 *      slider-state offsets the simulator should apply when the user picks
 *      it. The numbers in `state` are deliberately exaggerated so the
 *      visualization is unmistakable.
 *   2. {@link SLA_DIAGNOSTICS} / {@link MACPHERSON_DIAGNOSTICS} — lookup
 *      tables for the diagnostic chart modal. Given a suspension type and
 *      three TriState observations, {@link lookupDiagnostic} returns the
 *      most likely root cause.
 */

/** All angle categories shown in the Errors-mode grid. */
export type AngleCategory =
  | 'Camber' | 'Caster' | 'Toe' | 'SAI' | 'IncludedAngle' | 'ScrubRadius' | 'Setback';

/**
 * Slider-state delta applied when an error scenario is loaded. Any field
 * left undefined means "leave that slider at its factory-default value".
 * Values are degrees and follow the same sign conventions as the UI sliders.
 */
export interface AlignmentErrorState {
  leftCamber?: number;
  rightCamber?: number;
  totalToe?: number;
  caster?: number;
  sai?: number;
}

/** A single canned scenario that can be selected from the Errors-mode grid. */
export interface AlignmentError {
  /** Stable identifier — used as the active-button key in the UI. */
  id: string;
  /** Which angle category this error belongs to (used for grouping in the UI). */
  angle: AngleCategory;
  /** Short label shown on the button, e.g. "Pos. Left", "Too High". */
  variant: string;
  /** Plain-language explanation of what the error means physically. */
  description: string;
  /** How the error feels from the driver's seat. */
  drivingEffect: string;
  /** The tire-wear pattern that develops if the error is left uncorrected. */
  tireWear: string;
  /** Slider-state offsets the simulator should apply to depict this scenario. */
  state: AlignmentErrorState;
}

export const ERROR_DEFINITIONS: AlignmentError[] = [
  // ===== CAMBER =====
  {
    id: 'camber-pos-left',
    angle: 'Camber',
    variant: 'Pos. Left',
    description: 'Left wheel tilts outward at the top beyond spec.',
    drivingEffect: 'Vehicle pulls/drifts toward the LEFT (the side with more positive camber).',
    tireWear: 'Outside shoulder wear on the left front tire.',
    state: { leftCamber: 4, rightCamber: 0 }
  },
  {
    id: 'camber-neg-left',
    angle: 'Camber',
    variant: 'Neg. Left',
    description: 'Left wheel tilts inward at the top beyond spec.',
    drivingEffect: 'Vehicle may pull toward the RIGHT (toward the more positive side). Reduces straight-line stability.',
    tireWear: 'Inside shoulder wear on the left front tire.',
    state: { leftCamber: -4, rightCamber: 0 }
  },
  {
    id: 'camber-cross',
    angle: 'Camber',
    variant: 'Cross > 0.5°',
    description: 'Side-to-side camber difference exceeds 0.5°. Vehicle pulls toward the more positive side.',
    drivingEffect: 'Steady pull during straight-line driving. Driver must hold steering wheel against the pull.',
    tireWear: 'Uneven shoulder wear, side dependent on which wheel has the larger angle.',
    state: { leftCamber: 2.5, rightCamber: -1 }
  },

  // ===== CASTER =====
  {
    id: 'caster-low',
    angle: 'Caster',
    variant: 'Too Low',
    description: 'Steering axis is tilted forward (or insufficiently rearward).',
    drivingEffect: 'Poor steering self-centering — wheel does not return after a turn. Vehicle wanders and is prone to a slight drift. Susceptible to crosswinds, tire taper/conicity, and wheel wobble.',
    tireWear: 'None directly, but the resulting drift can cause secondary wear.',
    state: { caster: 0 }
  },
  {
    id: 'caster-high',
    angle: 'Caster',
    variant: 'Too High',
    description: 'Steering axis is tilted excessively rearward.',
    drivingEffect: 'High steering and holding forces, especially at low speeds. Heavy on-center feel. Any side-to-side imbalance still produces a slight drift.',
    tireWear: 'None directly.',
    state: { caster: 18 }
  },
  {
    id: 'caster-cross',
    angle: 'Caster',
    variant: 'Diff L/R',
    description: 'Caster differs side-to-side. Vehicle drifts toward the side with the LESS positive caster.',
    drivingEffect: 'Steady drift / slight pull during straight-line driving toward the LOWER caster side. A small intentional split (≈0.3–1°) is sometimes used to compensate for road crown.',
    tireWear: 'None directly.',
    state: { caster: 6 }
  },

  // ===== TOE =====
  {
    id: 'toe-in-excessive',
    angle: 'Toe',
    variant: 'Toe-In',
    description: 'Front of both wheels point toward centerline beyond spec.',
    drivingEffect: 'Nervous, twitchy straight-ahead driving. Tires scrub. Toe does NOT cause a steady continuous pull — instead the vehicle reacts erratically with intermittent darting as one tire grabs more than the other.',
    tireWear: 'Feathered edge on outside of tread (run hand from center outward — feels smooth out, sharp in).',
    state: { totalToe: 2.5 }
  },
  {
    id: 'toe-out-excessive',
    angle: 'Toe',
    variant: 'Toe-Out',
    description: 'Front of both wheels point away from centerline beyond spec.',
    drivingEffect: 'Spongy / wandering handling. Vehicle darts on bumps. Toe does NOT cause a steady continuous pull — instead it produces an intermittent, erratic pull that changes direction as load and surface vary.',
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
    variant: 'Diff L/R',
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
//
// The technician measures three things on the alignment rack — SAI, camber,
// and Included Angle (camber + SAI) — and classifies each as OK, Less, or
// Greater than spec. The combination uniquely identifies a bent or
// mis-positioned suspension component.
// ============================================================================

/** Front suspension type — drives which lookup table is used. */
export type SuspensionType = 'SLA' | 'MacPherson';
/** Three-way measurement classification: at spec, below spec, above spec. */
export type TriState = 'OK' | 'Less' | 'Greater';

/** One row in the SAI diagnostic chart. */
export interface DiagnosticEntry {
  sai: TriState;
  camber: TriState;
  ia: TriState;
  /** The most likely physical fault for this combination of readings. */
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

/**
 * Resolve a (suspension type, SAI, camber, IA) tuple to its diagnosis from
 * the EKP 10.21 chart.
 *
 * Returns the matching problem text if the combination appears in the
 * chart, or a polite "no match" message — many combinations are simply
 * within spec, so absence of a match is not necessarily an error.
 */
export function lookupDiagnostic(
  type: SuspensionType, sai: TriState, camber: TriState, ia: TriState
): string {
  const table = type === 'SLA' ? SLA_DIAGNOSTICS : MACPHERSON_DIAGNOSTICS;
  const match = table.find(e => e.sai === sai && e.camber === camber && e.ia === ia);
  return match ? match.problem : 'No matching problem in chart for this combination. The angles may be within spec, or the combination is unusual — verify measurements.';
}

/**
 * Group {@link ERROR_DEFINITIONS} by angle category so the UI can render
 * one row per category. Computed once at module load time and cached on the
 * component.
 */
export function getErrorsByAngle(): Map<AngleCategory, AlignmentError[]> {
  const map = new Map<AngleCategory, AlignmentError[]>();
  for (const err of ERROR_DEFINITIONS) {
    if (!map.has(err.angle)) map.set(err.angle, []);
    map.get(err.angle)!.push(err);
  }
  return map;
}
