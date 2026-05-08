# Antigravity

A lightweight 2D rocket simulator that runs in the browser. Build a rocket, launch it, and try to reach orbit.

Inspired by the physics of real spaceflight — gravity, thrust, atmospheric drag, and reentry heating are all modeled.

Current version dev:d0.3.7

Current version main:m0.2.1

**[Play on GitHub Pages](https://anromanianguy.github.io/Antigravity/)**

---

## Run locally

```bash
git clone https://github.com/anromanianguy/Antigravity.git
cd Antigravity
npm install
npm run dev
```

Then open `http://localhost:5173`.

---

## Features

- Modular rocket builder (VAB-style)
- Staging system — engines, decouplers
- Physics: gravity, thrust, fuel consumption, atmospheric drag
- Atmosphere simulation with altitude-based density and visual sky gradient
- Aerodynamic heating with reentry plasma effects and part destruction
- Map view with apoapsis/periapsis display and trajectory prediction
- Maneuver nodes

---

## Tech stack

- TypeScript
- HTML5 Canvas
- esbuild

---

## Roadmap

- [x] Rocket building
- [x] Launch and staging
- [x] Atmospheric simulation
- [x] Heating and reentry (partial working)
- [x] Map view (AP/PE, trajectory)
- [x] Maneuver nodes + SAS (WIP)
- [ ] Second gravity body (Moon,Sun,Mars,etc. WIP)
- [ ] Orbital transfer planning (WIP)
- [x] Heating and reentry
- [x] Map view (AP/PE, trajectory)
- [x] Maneuver nodes
- [ ] Second gravity body (Moon,WIP)
- [ ] Orbital transfer planning
- [ ] Landing system
- [ ] Advanced telemetry UI

---

## License

MIT
