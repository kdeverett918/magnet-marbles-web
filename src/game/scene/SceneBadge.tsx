import { getBadgeTexture } from "./sceneBadgeTexture";

export function SceneBadge({
  label,
  color,
  position = [0, 0.8, 0],
  scale = [1.15, 0.42, 1],
  opacity = 0.94,
}: {
  label: string;
  color: string;
  position?: [number, number, number];
  scale?: [number, number, number];
  opacity?: number;
}) {
  return (
    <sprite position={position} scale={scale}>
      <spriteMaterial
        map={getBadgeTexture(label, color)}
        transparent
        opacity={opacity}
        depthWrite={false}
        depthTest
        toneMapped={false}
      />
    </sprite>
  );
}
