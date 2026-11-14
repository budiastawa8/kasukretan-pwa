import { registerPlugin } from "@capacitor/core";
import type { ThermalPrinterPlugin } from "./definitions";

const ThermalPrinter = registerPlugin<ThermalPrinterPlugin>("ThermalPrinter", {
  web: () => import("./web").then((m) => new m.ThermalPrinterWeb()),
});

export * from "./definitions";
export { ThermalPrinter };
