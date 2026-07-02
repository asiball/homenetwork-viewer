// Shared types — mirror backend/app/models.py and spec/homenet-spec.md §3.

export type Group = "Infra" | "IoT" | "Media" | "Mobile" | "Computer" | "Misc";

export const GROUP_ORDER: Group[] = ["Infra", "IoT", "Media", "Mobile", "Computer", "Misc"];

export type Conn =
  | "Wired 1G"
  | "Wired 2.5G"
  | "Wired 100M"
  | "Wi-Fi 2.4 GHz"
  | "Wi-Fi 5 GHz"
  | "Wi-Fi 6 GHz"
  | "—";

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

export interface NetInfo {
  ipv4?: string | null;
  ipv6?: string | null;
  gateway?: string | null;
  dns?: string | null;
  dhcp?: string | null;
  vlan?: string | null;
  rssi?: string | null;
}

export interface HwInfo {
  cpu_full?: string | null;
  arch?: string | null;
  mem_full?: string | null;
  chassis?: string | null;
  bios?: string | null;
  motherboard?: string | null;
  gpu?: string[] | null;
  storage_drives?: string[] | null;
}

export interface Metrics {
  cpu_pct?: number;
  cpu_series?: number[];
  mem_pct?: number;
  mem_series?: number[];
  net_in?: number;
  net_out?: number;
  net_in_series?: number[];
  temp?: number;
}

export interface ServiceRow {
  port: number;
  proto: string;
  svc: string;
  banner: string;
}

export interface Drive {
  nm: string;
  md?: string;
  size?: string;
  pct: number;
}

export interface StorageInfo {
  drives?: Drive[] | null;
  pool?: string | null;
  health?: string | null;
}

export interface Ownership {
  manufacturer?: string | null;
  model?: string | null;
  purchased?: string | null;
  price?: string | null;
  warranty?: string | null;
  location?: string | null;
  tags?: string[] | null;
}

// Custom-PC build management (#97). A Part is one component with its own
// purchase / warranty / lifecycle; BuildEvent records add/remove/replace.
export const PART_CATEGORIES = [
  "cpu",
  "gpu",
  "ram",
  "storage",
  "mainboard",
  "psu",
  "cooler",
  "case",
  "other",
] as const;
export type PartCategory = (typeof PART_CATEGORIES)[number];
export const PART_STATUSES = ["active", "spare", "retired", "failing"] as const;
export type PartStatus = (typeof PART_STATUSES)[number];
export const BUILD_ACTIONS = ["add", "remove", "replace"] as const;
export type BuildAction = (typeof BUILD_ACTIONS)[number];

export interface Part {
  id: string;
  category: PartCategory;
  model: string;
  serial?: string | null;
  purchased?: string | null;
  price_jpy?: number | null;
  warranty_until?: string | null;
  status: PartStatus;
}

export interface BuildEvent {
  date: string;
  action: BuildAction;
  part_id: string;
  note?: string | null;
}

export interface DeviceDetail {
  net?: NetInfo | null;
  hw?: HwInfo | null;
  metrics?: Metrics | null;
  services?: ServiceRow[] | null;
  storage?: StorageInfo | null;
  hist7?: number[] | null;
  own?: Ownership | null;
  parts?: Part[] | null;
  build_events?: BuildEvent[] | null;
}

// Reachability time series (#93). Computed server-side from the collector's
// append-only samples; `uptime` is a 0..1 ratio, null on a day with no samples.
export interface ReachabilityDay {
  date: string;
  uptime: number | null;
  samples: number;
}

export interface ReachabilityEvent {
  ts: string;
  kind: "up" | "down";
}

export interface ReachabilityHistory {
  device_id: string;
  days: number;
  history: ReachabilityDay[];
  uptime_pct: number | null;
  events: ReachabilityEvent[];
}

export interface Device {
  id: string;
  name: string;
  host: string;
  ip: string;
  mac: string;
  group: Group;
  type: string;
  online: boolean;
  cpu?: string;
  mem?: string;
  storage?: string;
  conn?: Conn;
  ring?: 0 | 1 | 2;
  idx?: number;
  last?: string;
  uptime?: string;
  notes?: string;
  /** Admin / web UI, opened in a new tab. */
  url?: string;
  detail?: DeviceDetail | null;
}

// Body for POST/PUT. Clearable optional fields may be `null` to erase a stored
// value (the backend merge treats an explicit null as "clear", an omitted key
// as "keep"). `detail.own` is already nullable on DeviceDetail.
export type DeviceWrite = Omit<
  Device,
  "conn" | "ring" | "url" | "cpu" | "mem" | "storage" | "notes" | "detail"
> & {
  conn?: Conn | null;
  ring?: 0 | 1 | 2 | null;
  url?: string | null;
  cpu?: string | null;
  mem?: string | null;
  storage?: string | null;
  notes?: string | null;
  detail?: DeviceDetail | null;
};

export interface PortSlot {
  device: string;
  cable?: string | null;
  role?: "uplink" | "downlink" | null;
}

export interface Switch {
  id: string;
  name: string;
  model?: string | null;
  type: "switch" | "hub";
  location?: string | null;
  portCount?: number | null;
  speed?: string | null;
  managed?: boolean | null;
  online: boolean;
  notes?: string | null;
  radio?: string | null;
  portMap: Record<string, PortSlot | null>;
}

export interface Cable {
  id: string;
  cat?: string | null;
  len?: string | null;
  color?: string | null;
  jacket?: string | null;
  fromDev: string;
  fromPort?: string | number | null;
  toDev: string;
  toPort?: string | number | null;
  notes?: string | null;
}

export interface Meta {
  total: number;
  online: number;
  offline: number;
  updated_at?: string | null;
  /** ISO8601 instant of the collector's most recent reachability sweep, or
   *  null if it has never run (spec §4.3 "next scan" countdown). */
  last_sweep: string | null;
  /** ISO8601 instant of the next scheduled sweep, or null. */
  next_sweep: string | null;
  /** Collector sweep cadence in seconds (0 if unknown/disabled). */
  sweep_interval: number;
}

export interface Catalog {
  devices: Device[];
  switches: Switch[];
  cables: Cable[];
  meta: Meta;
}
