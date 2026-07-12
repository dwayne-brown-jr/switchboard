import type { Vertical } from "../verticals";
import { AUTO_TEMPLATE } from "./auto";
import { AUTO_APPEARANCE_TEMPLATE } from "./auto_appearance";
import { HVAC_TEMPLATE } from "./hvac";
import { HOME_SERVICES_TEMPLATE } from "./home_services";
import { CLEANING_TEMPLATE } from "./cleaning";
import { OTHER_TEMPLATE } from "./other";

export const TEMPLATES: Record<Vertical, string> = {
  auto: AUTO_TEMPLATE,
  auto_appearance: AUTO_APPEARANCE_TEMPLATE,
  hvac: HVAC_TEMPLATE,
  home_services: HOME_SERVICES_TEMPLATE,
  cleaning: CLEANING_TEMPLATE,
  other: OTHER_TEMPLATE,
};
