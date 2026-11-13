// Iconos de categoría (Lucide, licencia ISC). Se guarda el nombre; si falta, se deduce del nombre de la categoría.
import {
  Baby, Banknote, Briefcase, Bus, Car, Coffee, Dumbbell, Gift, GraduationCap, HeartPulse, House, Landmark, Laptop,
  PawPrint, Pizza, Plane, Repeat, Shirt, ShoppingBasket, Smartphone, Sparkles, Tag, Ticket, TrendingUp, Utensils, Zap,
  type IconNode,
} from "lucide";

export const CATEGORY_ICONS: Record<string, IconNode> = {
  casa: House, compra: ShoppingBasket, comida: Utensils, cafe: Coffee, pizza: Pizza, transporte: Bus, coche: Car,
  viajes: Plane, ocio: Ticket, deporte: Dumbbell, salud: HeartPulse, ropa: Shirt, regalos: Gift, caprichos: Sparkles,
  suscripciones: Repeat, movil: Smartphone, luz: Zap, estudios: GraduationCap, mascotas: PawPrint, peques: Baby,
  prestamos: Landmark, trabajo: Briefcase, nomina: Banknote, tecnologia: Laptop, inversion: TrendingUp, otros: Tag,
};

const GUESS: [RegExp, string][] = [
  [/vivienda|alquiler|hipoteca|casa|hogar/i, "casa"], [/super|compra|mercado/i, "compra"], [/comida|restaur|cena/i, "comida"],
  [/caf/i, "cafe"], [/transporte|bus|metro|tren/i, "transporte"], [/coche|gasolina|parking/i, "coche"], [/viaje|vacacion/i, "viajes"],
  [/ocio|cine|concierto|fiesta/i, "ocio"], [/deporte|gimnasio|gym/i, "deporte"], [/salud|farmacia|médic|medic/i, "salud"],
  [/ropa/i, "ropa"], [/regalo/i, "regalos"], [/capricho/i, "caprichos"], [/suscrip/i, "suscripciones"], [/móvil|movil|teléfono/i, "movil"],
  [/luz|agua|gas|factura/i, "luz"], [/estudi|curso|libro/i, "estudios"], [/mascota|perro|gato/i, "mascotas"], [/hij|beb|niñ/i, "peques"],
  [/préstamo|prestamo|deuda|cuota/i, "prestamos"], [/nómina|nomina|sueldo|salario/i, "nomina"], [/trabajo|freelance|factur/i, "trabajo"],
  [/extra|venta/i, "nomina"], [/invers/i, "inversion"],
];

export function categoryIconName(c: { name: string; icon?: string } | null | undefined): string {
  if (!c) return "otros";
  if (c.icon && CATEGORY_ICONS[c.icon]) return c.icon;
  return GUESS.find(([re]) => re.test(c.name))?.[1] ?? "otros";
}
export const categoryIcon = (c: { name: string; icon?: string } | null | undefined): IconNode => CATEGORY_ICONS[categoryIconName(c)];
