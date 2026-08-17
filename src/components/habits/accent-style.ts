import type { CSSProperties } from "react";

export function habitAccentStyle(customColor: string | null | undefined): CSSProperties | undefined {
  if (!customColor) return undefined;

  const red = Number.parseInt(customColor.slice(1, 3), 16);
  const green = Number.parseInt(customColor.slice(3, 5), 16);
  const blue = Number.parseInt(customColor.slice(5, 7), 16);
  const deep = [red, green, blue]
    .map((channel) => Math.round(channel * 0.55).toString(16).padStart(2, "0"))
    .join("");

  return {
    "--accent": customColor,
    "--accent-deep": `#${deep}`,
    "--accent-rgb": `${red}, ${green}, ${blue}`,
  } as CSSProperties;
}
