import { seasonalOutfit, type Expression } from "../robot/expressions";
import type { OutfitName } from "../robot/outfits";
import { Tico } from "../robot/Tico";
import type { TicoProfile } from "../types";

/** La ropa que lleva un Tico hoy (la suya, o la de temporada si no lleva nada). */
export function outfitFor(profile: TicoProfile, seasonal: boolean, date = new Date()): OutfitName {
  if (profile.outfit !== "none" || !seasonal) return profile.outfit;
  return seasonalOutfit(date) ?? "none";
}

interface Props {
  profile: TicoProfile;
  size: number;
  seasonal: boolean;
  expression?: Expression;
}

/** Tico pequeño y quieto (para listas y botones): no gasta CPU. */
export function TicoAvatar({ profile, size, seasonal, expression = "idle" }: Props) {
  return (
    <Tico
      size={size}
      baseColor={profile.baseColor}
      accentColor={profile.accentColor}
      expression={expression}
      outfit={outfitFor(profile, seasonal)}
      animated={false}
    />
  );
}
