# Project Gadget AI — 3D Environment

First prototype for the Project Gadget AI world.

## V0.1
- Pure black 3D viewport
- Dense Blender-style grid
- Free orbit / zoom / pan camera
- Keyboard navigation (WASD / arrows, Q/E vertical)
- Touch-friendly OrbitControls on mobile
- Placeholder origin object for the future character model

## Run
Open `index.html` in a modern browser with internet access (Three.js is loaded from jsDelivr).

For local development, a simple static server is recommended, e.g. `python3 -m http.server`.

## Next
Replace the placeholder with the real `.glb/.gltf/.fbx` character model, then add a character controller and animation system.
