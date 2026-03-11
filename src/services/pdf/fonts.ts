import { Font } from "@react-pdf/renderer";
import path from "path";

let fontsRegistered = false;

export function registerFonts() {
  if (fontsRegistered) return;

  Font.register({
    family: "FrankRuhlLibre",
    fonts: [
      {
        src: path.join(process.cwd(), "public/fonts/FrankRuhlLibre-Regular.ttf"),
        fontWeight: 400,
      },
      {
        src: path.join(process.cwd(), "public/fonts/FrankRuhlLibre-Bold.ttf"),
        fontWeight: 700,
      },
    ],
  });

  Font.register({
    family: "Heebo",
    fonts: [
      {
        src: path.join(process.cwd(), "public/fonts/Heebo-Regular.ttf"),
        fontWeight: 400,
      },
      {
        src: path.join(process.cwd(), "public/fonts/Heebo-Bold.ttf"),
        fontWeight: 700,
      },
    ],
  });

  fontsRegistered = true;
}
