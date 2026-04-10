<div align="center">

# Wheel Alignment Simulator

### An interactive 3D playground for understanding caster, camber, toe and SAI

**[Live Demo](https://zackaryo.github.io/Alignment_Simulator/)**

![Angular](https://img.shields.io/badge/Angular-16-DD0031?style=for-the-badge&logo=angular&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r163-000000?style=for-the-badge&logo=three.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.1-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-22cc44?style=for-the-badge)

</div>

---

## What is this?

The **Wheel Alignment Simulator** is a browser-based, real-time 3D tool that
turns the abstract math of vehicle wheel alignment into something you can
*see and play with*. Drag a slider, watch the wheel tilt. Steer the car,
watch the body lift. Pick a textbook fault, watch exactly how it manifests
on a real vehicle.

It was built as a teaching aid for automotive technician students learning
the Mercedes-Benz DRIVE Alignment Certification urriculum, but
it works equally well for anyone who has ever stared at a four-wheel
alignment printout and wished the angles would just *show themselves*.

> **Try it →** [zackaryo.github.io/Alignment_Simulator](https://zackaryo.github.io/Alignment_Simulator/)

---

## Why it exists

Wheel alignment is one of those topics where the words are easy but the
mental model is hard. "Caster is the forward-or-rearward tilt of the
steering axis." Sure — but *what does that look like, and why does the body
lift on one side when you steer*?

Most teaching materials answer that question with a static diagram and a
paragraph of prose. This project answers it with **a working car you can
turn the wheels on**, with every relevant axis drawn directly onto the
model in colour-coded 3D.

You can:

- **Drag any angle** between its physical limits and watch the wheel and
  body react in real time.
- **Compare zero-geometry vs. real geometry** through translucent ribbons
  that show exactly where the toe-tip path *would* be vs. where it
  actually is.
- **Load canned fault scenarios** and immediately see (and read about)
  what each one does to driving feel and tire wear.
- **Run the SAI diagnostic chart** to identify a bent component from the
  three-measurement combination a real alignment rack would give you.

---

## Features

### Geometry mode — the playground

| Slider           | Range    | What it does                                  |
| ---------------- | -------- | --------------------------------------------- |
| **Caster**       | 0° – 12° | Tilts the steering axis fore/aft              |
| **SAI / KPI**    | 0° – 20° | Tilts the steering axis inboard/outboard      |
| **Camber** (L/R) | ±5°      | Tilts the top of each wheel in/out            |
| **Toe** (total)  | ±3°      | Points both wheels in or out from centerline  |
| **Steering**     | ±40°     | Turns the wheels with full Ackermann split    |

Two visual modes:

- **Conceptual** — the body stays still so you can study the angles in
  isolation.
- **Actual** — the body lifts and rolls in response to SAI/caster jacking
  while the tires stay glued to the road. This is what really happens
  when you turn the wheel of a parked car.

### Errors mode — the textbook scenarios

A grid of one-click fault scenarios drawn from EKP 10.21:

- **Camber** — positive left, negative left, cross-camber pull
- **Caster** — too high, too low, side-to-side mismatch
- **Toe** — excessive toe-in, excessive toe-out
- **SAI** — too small, too large, side-to-side mismatch
- **Scrub Radius** — positive, negative, zero

Each scenario shows the visual effect on the 3D model *and* a plain-language
panel explaining what the error is, how it feels from the driver's seat,
and what tire-wear pattern to look for.

### SAI Diagnostic Chart

A built-in modal implementing the Mercedes-Benz EKP 10.21 SAI / Camber /
Included-Angle diagnostic table. Pick your suspension type (SLA or
MacPherson Strut), classify your three measurements as `OK` / `Less` /
`Greater`, and the simulator will name the most likely bent component.

---

## The visuals — what every line means

| Element                    | Colour              | Meaning                                              |
| -------------------------- | ------------------- | ---------------------------------------------------- |
| Camber line                | RED                 | Vertical reference through the wheel hub             |
| Steering axis              | GREEN               | The inclined caster + SAI axis                       |
| Toe line                   | BLUE                | Forward direction the wheel actually points          |
| Spindle line               | YELLOW              | Lateral spin axis of the wheel                       |
| Toe tracer                 | BLUE dots           | Live trail of where the toe tip has been             |
| Inner-wheel highlight      | ORANGE dots         | Marks the inside wheel of the current Ackermann turn |
| Reference arc              | grey dashed         | Path each tip would trace under zero geometry        |
| Deviation ribbon (toe)     | translucent BLUE    | Gap between zero-geometry and actual toe path        |
| Deviation ribbon (spindle) | translucent YELLOW  | Gap between zero-geometry and actual spindle path    |
| Jacking indicator          | GREEN ↑ / RED ↓     | Body lift caused by SAI/caster geometry              |
| Road plane                 | grey grid           | The actual road surface — all wheels stay on it      |

---

## How it works under the hood

### The pivot hierarchy

Every wheel is wrapped in a three-level Three.js pivot stack so that each
alignment angle has exactly one rotation it can call home:

```text
carModel
 └── assembly       ← positioned at the wheel center, allows vertical jacking
      └── turnPivot   ← rotates around the inclined steering axis (caster + SAI)
           └── alignmentPivot  ← applies static camber and toe
                └── wheelMesh  ← original GLTF wheel, residual rotations stripped
```

Why three levels? Because the alignment pivot lives *inside* the steering
pivot, the wheel's effective camber and toe automatically change as the
wheel is steered through the inclined axis. That's exactly what real
suspension linkages do, and it's what produces the camber-roll-with-turn
that you can see in the simulator.

### Ackermann steering

The single steering slider drives both wheels through the ideal Ackermann
geometry — the inner wheel turns more than the outer wheel so they trace
concentric circles around a common turn centre instead of scrubbing.

```text
δ_inner = atan( L / (R − W/2) )
δ_outer = atan( L / (R + W/2) )
where R = L / tan(δ_avg)
```

The colour-coded toe tracer makes the difference visible: the inner wheel's
trail glows orange while the outer wheel's stays blue.

### Body roll & jacking

In *Actual* mode the body lifts and tilts in response to SAI/caster
jacking. The amount of lift at each corner is computed from the geometric
displacement of the spindle as it sweeps around the inclined steering
axis, scaled by a 0.4 absorption coefficient that approximates real spring
compliance. The body then rolls about its longitudinal axis while the
wheels are counter-translated through the carModel's local frame to keep
them on the road plane — exactly the way a real car behaves when you turn
the wheel of a parked vehicle and feel the body rise.

---

## Project layout

```text
my-threejs-car/
├── docs/                          ← built site (served by GitHub Pages)
└── src/
    ├── assets/
    │   └── model/                 ← GLTF Mercedes-Benz GLC model
    └── app/
        ├── app.module.ts          ← Angular bootstrap
        ├── app-routing.module.ts
        └── car-viewer/
            ├── car-viewer.component.ts    ← Top-level Angular + Three.js setup
            ├── car-viewer.component.html  ← UI markup (modes, sliders, modal)
            ├── car-viewer.component.css
            ├── wheel-assembly.ts          ← Per-wheel pivot hierarchy
            ├── axis-lines.ts              ← Visualization helpers
            └── alignment-errors.ts        ← Error definitions + diagnostic chart
```

The interesting code is all in [src/app/car-viewer/](src/app/car-viewer/).
Every file there has detailed JSDoc comments explaining the math and
design decisions — if you're curious how a particular effect is built,
start with [car-viewer.component.ts](src/app/car-viewer/car-viewer.component.ts)
and follow the imports.

---

## Running it locally

```bash
# install dependencies
npm install

# start the dev server (http://localhost:4200)
npm start
```

Note: the production build is committed to [docs/](docs/) so the GitHub
Pages deployment can serve it. If you rebuild, make sure to preserve the
custom GitHub Pages files ([docs/404.html](docs/404.html) and
[docs/assets/css/style.scss](docs/assets/css/style.scss)).

---

## Credits

- **3D model:** [500 Followers Milestone — Mercedes-Benz GLC LP](https://sketchfab.com/3d-models/500-followers-milestone-mercedes-benz-glc-lp-35837d361a084e1eb70f78a93f56177f)
  on Sketchfab.
- **Curriculum reference:** Mercedes-Benz DRIVE Alignment Certification
  EKP 10.21 (used for the alignment-error definitions and the SAI
  diagnostic chart).
- **Built with:** [Angular 16](https://angular.io/), [Three.js r163](https://threejs.org/),
  TypeScript 5.1.

Built by **Zack Otterstrom**.

---

<div align="center">

**Curious how a particular effect is built?** Open
[src/app/car-viewer/](src/app/car-viewer/) — every file has detailed
inline documentation explaining the math, the pivot hierarchy, and the
design choices behind each visualization.

</div>
