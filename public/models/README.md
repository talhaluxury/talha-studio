# Put your store model here as `store.glb`
If `store.glb` exists it replaces the built-in showroom. If missing, the built-in showroom is used.

Node names inside the GLB (set in Blender / your 3D tool):
- `product_<productId>`: tappable item; opens the product with that Firestore id (or demo id d1..d9).
- `collider_*`: invisible box meshes the camera cannot walk through (counters, racks, walls).
- `spawn`: empty object marking where the customer starts (inside the entrance).
Walkable bounds come from the model's overall size. Keep floor at y=0. Real-world scale (1 unit = 1 m).
Target: under ~15 MB, baked lighting, meshopt-compressed (e.g. `npx @gltf-transform/cli optimize in.glb store.glb --compress meshopt`).
