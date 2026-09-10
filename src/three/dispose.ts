import { BufferGeometry, DirectionalLight, Material, Mesh, Object3D, SkinnedMesh, Texture } from 'three';

/** Dispose each owned GPU resource once, including resources shared by GLB meshes. */
export function disposeObject(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((node) => {
    if (node instanceof DirectionalLight) node.shadow.dispose();
    if (node instanceof SkinnedMesh) node.skeleton.dispose();
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
  for (const texture of textures) {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close();
  }
  root.removeFromParent();
}
