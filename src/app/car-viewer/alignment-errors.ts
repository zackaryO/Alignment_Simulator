/**
 * @file alignment-errors.ts
 *
 * Static data tables describing canned alignment-error scenarios and the
 * SAI-based diagnostic chart used by the simulator's "Errors" mode.
 *
 * The textbook content (descriptions, driving effects, tire-wear patterns,
 * SAI/Camber/IA combinations) is sourced from Mercedes-Benz DRIVE Alignment
 * Certification EKP 10.21, the same student curriculum used by the
 * Mercedes-Benz technician training programs.
 *
 * Two pieces of data live here:
 *   1. {@link ERROR_DEFINITIONS}, every selectable scenario plus the
 *      slider-state offsets the simulator should apply when the user picks
 *      it. The numbers in `state` are deliberately exaggerated so the
 *      visualization is unmistakable.
 *   2. {@link SLA_DIAGNOSTICS} / {@link MACPHERSON_DIAGNOSTICS}, lookup
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
  /** Stable identifier, used as the active-button key in the UI. */
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
    description: 'Steering axis is tilted forward, or insufficiently rearward.',
    drivingEffect: 'Weak self-returning action of the steering. The vehicle drifts, wanders, and reacts more strongly to crosswinds and to tire taper or wheel wobble.',
    tireWear: 'None directly, but the resulting drift can cause secondary wear.',
    state: { caster: 0 }
  },
  {
    id: 'caster-high',
    angle: 'Caster',
    variant: 'Too High',
    description: 'Steering axis is tilted excessively rearward.',
    drivingEffect: 'Steering feels weighty and effortful, particularly at low speed, with strong on-center resistance. Poor steering responsiveness.',
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
    drivingEffect: 'Twitchy, restless straight-ahead behavior. Tires scrub. Toe does NOT cause a steady continuous pull. Instead the vehicle reacts erratically with intermittent darting as one tire grabs more than the other.',
    tireWear: 'Feathered edge on outside of tread (run a hand from center outward; feels smooth on the way out and sharp on the way back).',
    state: { totalToe: 2.5 }
  },
  {
    id: 'toe-out-excessive',
    angle: 'Toe',
    variant: 'Toe-Out',
    description: 'Front of both wheels point away from centerline beyond spec.',
    drivingEffect: 'Loose, wandering handling. Vehicle darts on bumps. Toe does NOT cause a steady continuous pull. Instead it produces an intermittent, erratic pull that changes direction as load and surface vary.',
    tireWear: 'Feathered edge on inside of tread.',
    state: { totalToe: -2.5 }
  },

  // ===== SAI =====
  {
    id: 'sai-low',
    angle: 'SAI',
    variant: 'Too Small',
    description: 'Steering axis inclination is less than spec. Usually indicates a bent strut, knuckle, or chassis damage.',
    drivingEffect: 'Reduced self-center behavior, amplified reaction to tire conicity or taper, with a drift or pull often showing up on the road.',
    tireWear: 'None directly, but pull may cause secondary wear.',
    state: { sai: 5 }
  },
  {
    id: 'sai-high',
    angle: 'SAI',
    variant: 'Too Large',
    description: 'Steering axis inclination exceeds spec.',
    drivingEffect: 'Heavier steering input, and more force needed to hold a turn.',
    tireWear: 'None directly.',
    state: { sai: 19 }
  },
  {
    id: 'sai-uneven',
    angle: 'SAI',
    variant: 'Diff L/R',
    description: 'SAI differs side-to-side. Usually indicates a bent suspension component or chassis damage.',
    drivingEffect: 'The vehicle wants to pull to one side and also reacts through the steering wheel under throttle (torque reaction), under braking (brake pull), and over bumps (bump reaction). Pull is toward the smaller angle.',
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
    state: { sai: 10 }
  },
  {
    id: 'scrub-neg',
    angle: 'ScrubRadius',
    variant: 'Negative',
    description: 'SAI line meets the road outboard of the tire centerline. Used with ABS for stability.',
    drivingEffect: 'Steering automatically counter-steers during uneven braking, so the driver only lightly holds the wheel. Pulls toe outward when braking.',
    tireWear: 'None directly.',
    state: { sai: 10 }
  },
  {
    id: 'scrub-zero',
    angle: 'ScrubRadius',
    variant: 'Zero',
    description: 'SAI line meets the road exactly at the tire centerline.',
    drivingEffect: 'Isolates the steering from uneven braking and tire faults, at the cost of a noticeably stiff wheel when the car is not rolling. Also reduces steering feedback, removing some of the driver\'s feel of the road.',
    tireWear: 'None directly.',
    state: { sai: 10 }
  }
];

// ============================================================================
// Diagnostic chart data, Mercedes DRIVE EKP 10.21 pages 56-57
//
// The technician measures three things on the alignment rack, SAI, camber,
// and Included Angle (camber + SAI), and classifies each as OK, Less, or
// Greater than spec. The combination uniquely identifies a bent or
// mis-positioned suspension component.
// ============================================================================

/** Front suspension type, drives which lookup table is used. */
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
  { sai: 'Less',    camber: 'Greater', ia: 'OK',      problem: 'Bent control arm, or damaged strut tower' },
  { sai: 'Greater', camber: 'Greater', ia: 'Greater', problem: 'Bent strut, or damaged strut tower' },
  { sai: 'Less',    camber: 'Greater', ia: 'Greater', problem: 'Bent control arm, or damaged strut tower, or a bent spindle or strut (or both)' },
  { sai: 'Less',    camber: 'Less',    ia: 'Less',    problem: 'Damaged strut tower, together with a bent spindle, control arm, or strut' },
];

/**
 * Resolve a (suspension type, SAI, camber, IA) tuple to its diagnosis from
 * the EKP 10.21 chart.
 *
 * Returns the matching problem text if the combination appears in the
 * chart, or a polite "no match" message, many combinations are simply
 * within spec, so absence of a match is not necessarily an error.
 */
export function lookupDiagnostic(
  type: SuspensionType, sai: TriState, camber: TriState, ia: TriState
): string {
  const table = type === 'SLA' ? SLA_DIAGNOSTICS : MACPHERSON_DIAGNOSTICS;
  const match = table.find(e => e.sai === sai && e.camber === camber && e.ia === ia);
  return match ? match.problem : 'No matching problem in the chart for this combination. The angles may be within spec, or the combination is unusual. Verify measurements.';
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
