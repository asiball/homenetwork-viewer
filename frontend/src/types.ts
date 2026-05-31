import type { components } from "./types/api-schema";

export type Group = components["schemas"]["Device"]["group"];

export const GROUP_ORDER: Group[] = ["Infra", "IoT", "Media", "Mobile", "Computer", "Misc"];

export type Conn = NonNullable<components["schemas"]["Device"]["conn"]>;

export const CONN_OPTIONS: Conn[] = [
  "Wired 1G",
  "Wired 2.5G",
  "Wired 100M",
  "Wi-Fi 2.4 GHz",
  "Wi-Fi 5 GHz",
  "Wi-Fi 6 GHz",
  "—",
];

// Device `type` is open (spec §3.1) but these drive the form's datalist.
export const TYPE_OPTIONS = [
  "router",
  "ap",
  "nas",
  "switch",
  "hub",
  "desktop",
  "laptop",
  "phone",
  "tablet",
  "wearable",
  "tv",
  "media",
  "console",
  "speaker",
  "camera",
  "printer",
  "reader",
  "robot",
];

export type NetInfo = components["schemas"]["NetInfo"];
export type HwInfo = components["schemas"]["HwInfo"];
export type Metrics = components["schemas"]["Metrics"];
export type ServiceRow = components["schemas"]["Service"];
export type Drive = components["schemas"]["Drive"];
export type StorageInfo = components["schemas"]["StorageInfo"];
export type Ownership = components["schemas"]["Ownership"];
export type DeviceDetail = components["schemas"]["DeviceDetail"];
export type Device = components["schemas"]["Device"];
export type PortSlot = components["schemas"]["PortSlot"];
export type Switch = components["schemas"]["Switch"];
export type Cable = components["schemas"]["Cable"];
export type Meta = components["schemas"]["Meta"];

export interface Catalog {
  devices: Device[];
  switches: Switch[];
  cables: Cable[];
  meta: Meta;
}
