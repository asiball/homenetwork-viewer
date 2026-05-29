// data.jsx — shared device list + topology helpers.
// 22 devices: 1 gateway (center), 2 infra (inner ring), 19 leaves (outer ring).
// Authored static data. id → device.

const DEVICES = [
  // ── Infrastructure ─────────────────────────────────────────────────
  { id:'gw',  name:'Gateway',         host:'gw.home.arpa',     ip:'192.168.1.1',   mac:'AA:BB:CC:00:01:01',
    type:'router',  group:'Infra',    conn:'—',            ring:0, idx:0,
    online:true,  last:'now', uptime:'47d 12h',
    cpu:'Quad ARM Cortex-A53 @ 1.5 GHz', mem:'1 GB DDR3', storage:'128 MB NOR',
    notes:'Fiber gateway. Bridged to ONU. Hands out 192.168.1.0/24.' },
  { id:'ap',  name:'Mesh AP · Living', host:'ap-liv.home.arpa', ip:'192.168.1.2',   mac:'AA:BB:CC:00:02:01',
    type:'ap',      group:'Infra',    conn:'Wired 1G',     ring:1, idx:0,
    online:true,  last:'now', uptime:'21d 04h',
    cpu:'Dual MIPS @ 880 MHz', mem:'512 MB', storage:'256 MB',
    notes:'Backhaul: wired. Channels 36 / 149. 14 clients.' },
  { id:'nas', name:'NAS',              host:'nas.home.arpa',    ip:'192.168.1.10',  mac:'AA:BB:CC:00:0A:11',
    type:'nas',     group:'Infra',    conn:'Wired 2.5G',   ring:1, idx:1,
    online:true,  last:'now', uptime:'105d 19h',
    cpu:'Intel N100 4C / 4T', mem:'16 GB DDR4', storage:'4 × 8 TB HDD · RAID5',
    notes:'SMB + Time Machine + Plex backend.' },

  // ── Outer ring (19 leaves, in clockwise order from top) ────────────
  { id:'pod',  name:'HomePod mini',    host:'hpod-kit.home.arpa', ip:'192.168.1.50', mac:'AA:BB:CC:00:32:00',
    type:'speaker', group:'IoT',      conn:'Wi-Fi 5 GHz',  ring:2, idx:0,
    online:true,  last:'now', uptime:'67d 02h',
    cpu:'Apple S5', mem:'1 GB', storage:'8 GB',
    notes:'Kitchen. AirPlay 2 target.' },
  { id:'hue',  name:'Hue Bridge',      host:'hue.home.arpa',    ip:'192.168.1.51',   mac:'AA:BB:CC:00:33:00',
    type:'hub',     group:'IoT',      conn:'Wired 100M',   ring:2, idx:1,
    online:true,  last:'now', uptime:'201d 06h',
    cpu:'ARM @ 400 MHz', mem:'128 MB', storage:'—',
    notes:'18 bulbs paired. Zigbee 3.0.' },
  { id:'cam',  name:'Front Camera',    host:'cam-fr.home.arpa', ip:'192.168.1.52',   mac:'AA:BB:CC:00:34:00',
    type:'camera',  group:'IoT',      conn:'Wi-Fi 5 GHz',  ring:2, idx:2,
    online:true,  last:'now', uptime:'33d 11h',
    cpu:'Ambarella S5L', mem:'512 MB', storage:'—',
    notes:'Records to NAS via RTSP. Motion zones: 3.' },
  { id:'aqa',  name:'Aqara Hub',       host:'aqara.home.arpa',  ip:'192.168.1.53',   mac:'AA:BB:CC:00:35:00',
    type:'hub',     group:'IoT',      conn:'Wi-Fi 2.4 GHz',ring:2, idx:3,
    online:true,  last:'now', uptime:'88d 18h',
    cpu:'—', mem:'—', storage:'—',
    notes:'14 sensors: door, motion, temp/humidity.' },
  { id:'roo',  name:'Roomba j7',       host:'roomba.home.arpa', ip:'192.168.1.54',   mac:'AA:BB:CC:00:36:00',
    type:'robot',   group:'IoT',      conn:'Wi-Fi 2.4 GHz',ring:2, idx:4,
    online:false, last:'5h 12m ago', uptime:'—',
    cpu:'—', mem:'—', storage:'—',
    notes:'Charging. Last run 09:14 today.' },
  { id:'atv',  name:'Apple TV 4K',     host:'appletv.home.arpa',ip:'192.168.1.40',   mac:'AA:BB:CC:00:28:00',
    type:'media',   group:'Media',    conn:'Wired 1G',     ring:2, idx:5,
    online:true,  last:'now', uptime:'14d 02h',
    cpu:'Apple A15', mem:'4 GB', storage:'128 GB',
    notes:'Main streamer. tvOS 17.' },
  { id:'tv',   name:'BRAVIA TV',       host:'bravia.home.arpa', ip:'192.168.1.41',   mac:'AA:BB:CC:00:29:00',
    type:'tv',      group:'Media',    conn:'Wired 1G',     ring:2, idx:6,
    online:true,  last:'now', uptime:'04h 12m',
    cpu:'MediaTek MT5895', mem:'4 GB', storage:'32 GB',
    notes:'65" 4K. Android TV 12.' },
  { id:'ps5',  name:'PS5',             host:'ps5.home.arpa',    ip:'192.168.1.42',   mac:'AA:BB:CC:00:2A:00',
    type:'console', group:'Media',    conn:'Wi-Fi 5 GHz',  ring:2, idx:7,
    online:false, last:'2d 03h ago', uptime:'—',
    cpu:'AMD Zen 2 8C / 16T', mem:'16 GB GDDR6', storage:'825 GB NVMe',
    notes:'Rest-mode auto-wake disabled.' },
  { id:'sw',   name:'Switch',          host:'switch.home.arpa', ip:'192.168.1.43',   mac:'AA:BB:CC:00:2B:00',
    type:'console', group:'Media',    conn:'Wi-Fi 5 GHz',  ring:2, idx:8,
    online:false, last:'9d 14h ago', uptime:'—',
    cpu:'NVIDIA Tegra X1', mem:'4 GB', storage:'32 GB',
    notes:'Mostly docked. OLED model.' },
  { id:'iph',  name:'iPhone 15 Pro',   host:'iphone.home.arpa', ip:'192.168.1.30',   mac:'AA:BB:CC:00:1E:00',
    type:'phone',   group:'Mobile',   conn:'Wi-Fi 6 GHz',  ring:2, idx:9,
    online:true,  last:'now', uptime:'—',
    cpu:'Apple A17 Pro', mem:'8 GB', storage:'256 GB',
    notes:'Primary phone.' },
  { id:'ipad', name:'iPad Air',        host:'ipad.home.arpa',   ip:'192.168.1.31',   mac:'AA:BB:CC:00:1F:00',
    type:'tablet',  group:'Mobile',   conn:'Wi-Fi 5 GHz',  ring:2, idx:10,
    online:true,  last:'now', uptime:'—',
    cpu:'Apple M2 8C', mem:'8 GB', storage:'256 GB',
    notes:'Sketching & reading.' },
  { id:'pix',  name:'Pixel 8',         host:'pixel.home.arpa',  ip:'192.168.1.32',   mac:'AA:BB:CC:00:20:00',
    type:'phone',   group:'Mobile',   conn:'Wi-Fi 5 GHz',  ring:2, idx:11,
    online:false, last:'12h 08m ago', uptime:'—',
    cpu:'Google Tensor G3', mem:'8 GB', storage:'128 GB',
    notes:'Dev / test phone.' },
  { id:'wch',  name:'Apple Watch',     host:'watch.home.arpa',  ip:'192.168.1.33',   mac:'AA:BB:CC:00:21:00',
    type:'wearable',group:'Mobile',   conn:'Wi-Fi 2.4 GHz',ring:2, idx:12,
    online:true,  last:'now', uptime:'—',
    cpu:'Apple S9', mem:'1 GB', storage:'64 GB',
    notes:'Series 9.' },
  { id:'rig',  name:'Desktop · rig',   host:'rig.home.arpa',    ip:'192.168.1.20',   mac:'AA:BB:CC:00:14:00',
    type:'desktop', group:'Computer', conn:'Wired 1G',     ring:2, idx:13,
    online:true,  last:'now', uptime:'2d 06h',
    cpu:'AMD Ryzen 7 7700X 8C / 16T', mem:'32 GB DDR5-6000', storage:'2 TB NVMe + 4 TB HDD',
    notes:'Workstation. Windows 11.' },
  { id:'mbp',  name:'MacBook Pro',     host:'mbp.home.arpa',    ip:'192.168.1.21',   mac:'AA:BB:CC:00:15:00',
    type:'laptop',  group:'Computer', conn:'Wi-Fi 6 GHz',  ring:2, idx:14,
    online:true,  last:'now', uptime:'08h 22m',
    cpu:'Apple M3 Pro 11C', mem:'18 GB unified', storage:'512 GB SSD',
    notes:'Work laptop. macOS 15.' },
  { id:'mini', name:'Mac mini',        host:'mini.home.arpa',   ip:'192.168.1.22',   mac:'AA:BB:CC:00:16:00',
    type:'desktop', group:'Computer', conn:'Wired 1G',     ring:2, idx:15,
    online:true,  last:'now', uptime:'58d 03h',
    cpu:'Apple M2 8C', mem:'16 GB unified', storage:'1 TB SSD',
    notes:'Home server: Docker + HomeKit hub.' },
  { id:'tp',   name:'ThinkPad',        host:'tp.home.arpa',     ip:'192.168.1.23',   mac:'AA:BB:CC:00:17:00',
    type:'laptop',  group:'Computer', conn:'Wi-Fi 5 GHz',  ring:2, idx:16,
    online:false, last:'3d 14h ago', uptime:'—',
    cpu:'Intel i7-1260P 12C / 16T', mem:'32 GB DDR4', storage:'1 TB NVMe',
    notes:'NixOS dev box.' },
  { id:'prn',  name:'Printer',         host:'epson.home.arpa',  ip:'192.168.1.60',   mac:'AA:BB:CC:00:3C:00',
    type:'printer', group:'Misc',     conn:'Wi-Fi 2.4 GHz',ring:2, idx:17,
    online:false, last:'3d 02h ago', uptime:'—',
    cpu:'—', mem:'—', storage:'—',
    notes:'Sleep mode. Wake-on-AirPrint.' },
  { id:'kin',  name:'Kindle',          host:'kindle.home.arpa', ip:'192.168.1.61',   mac:'AA:BB:CC:00:3D:00',
    type:'reader',  group:'Misc',     conn:'Wi-Fi 2.4 GHz',ring:2, idx:18,
    online:false, last:'2d 19h ago', uptime:'—',
    cpu:'NXP i.MX 7', mem:'512 MB', storage:'8 GB',
    notes:'Paperwhite (11th gen).' },
];

// Polar → Cartesian. angle: 0=top, 90=right (clockwise).
function polar(angle, r, cx, cy) {
  const rad = (angle * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

// Returns {x, y, angle, leafCount} for a device given layout config.
function layoutOf(d, cfg) {
  const { cx, cy, r1, r2, leafStart = 9, totalLeaves } = cfg;
  if (d.ring === 0) return { ...polar(0, 0, cx, cy), angle: 0 };
  if (d.ring === 1) {
    // 2 inner devices at top-right (45°) and top-left (315°)
    const angle = d.idx === 0 ? 45 : 315;
    return { ...polar(angle, r1, cx, cy), angle };
  }
  // ring 2: even spacing
  const step = 360 / totalLeaves;
  const angle = (leafStart + d.idx * step) % 360;
  return { ...polar(angle, r2, cx, cy), angle };
}

// Group color hue (used variant-side to pick from each palette)
const GROUP_ORDER = ['Infra', 'IoT', 'Media', 'Mobile', 'Computer', 'Misc'];

// Stats helpers
function countOnline(devs)  { return devs.filter(d => d.online).length; }
function countOffline(devs) { return devs.filter(d => !d.online).length; }

// ─── Physical layer ─────────────────────────────────────────────────
// Switches / hubs that sit between the gateway and the leaf devices.
// Each switch declares its port count + a portMap: { portNo: { device, cable, role? } }

const SWITCHES = [
  {
    id: 'sw-main',
    name: 'Switch · rack',
    model: 'TP-Link TL-SG108',
    type: 'switch',
    location: 'Office · rack shelf',
    portCount: 8,
    speed: '1 Gbps',
    managed: false,
    online: true,
    notes: 'Star center. Port 1 is the gateway uplink.',
    portMap: {
      1: { device:'gw',      cable:'CBL-01', role:'uplink' },
      2: { device:'nas',     cable:'CBL-02' },
      3: { device:'ap',      cable:'CBL-03' },
      4: { device:'sw-desk', cable:'CBL-04', role:'downlink' },
      5: { device:'atv',     cable:'CBL-05' },
      6: { device:'tv',      cable:'CBL-06' },
      7: { device:'hue',     cable:'CBL-07' },
      8: null,
    },
  },
  {
    id: 'sw-desk',
    name: 'Switch · desk',
    model: 'Netgear GS305',
    type: 'switch',
    location: 'Desk · under monitor arm',
    portCount: 5,
    speed: '1 Gbps',
    managed: false,
    online: true,
    notes: 'Workstation cluster. Uplink on port 1 from sw-main.',
    portMap: {
      1: { device:'sw-main', cable:'CBL-04', role:'uplink' },
      2: { device:'rig',     cable:'CBL-08' },
      3: { device:'mini',    cable:'CBL-09' },
      4: null,
      5: null,
    },
  },
  {
    id: 'hue',
    name: 'Hue Bridge',
    model: 'Philips Hue v2 (BSB002)',
    type: 'hub',
    location: 'Living · TV cabinet',
    portCount: 1,
    speed: '100 Mbps',
    managed: false,
    online: true,
    notes: 'Zigbee 3.0 hub. 18 bulbs paired. LAN side terminates here.',
    radio: 'Zigbee · ch 15',
    portMap: {
      1: { device:'sw-main', cable:'CBL-07', role:'uplink' },
    },
  },
  {
    id: 'aqa',
    name: 'Aqara Hub',
    model: 'Aqara M2 (HM2-G01)',
    type: 'hub',
    location: 'Hallway · ceiling',
    portCount: 0,
    speed: '—',
    managed: false,
    online: true,
    notes: 'Wireless-only (Zigbee + IR). 14 sensors paired.',
    radio: 'Zigbee 3.0 · ch 20',
    portMap: {},
  },
];

const CABLES = [
  { id:'CBL-01', cat:'Cat6',  len:'0.5 m', color:'gray',  jacket:'UTP',
    fromDev:'gw',      fromPort:'lan1',  toDev:'sw-main', toPort:1,
    notes:'Rack uplink. Pre-bundled with router.' },
  { id:'CBL-02', cat:'Cat6a', len:'1 m',   color:'blue',  jacket:'STP',
    fromDev:'sw-main', fromPort:2,       toDev:'nas',     toPort:'eth0',
    notes:'High-bandwidth pair for SMB / Plex.' },
  { id:'CBL-03', cat:'Cat6',  len:'8 m',   color:'white', jacket:'UTP',
    fromDev:'sw-main', fromPort:3,       toDev:'ap',      toPort:'PoE',
    notes:'In-wall run to living room mesh AP.' },
  { id:'CBL-04', cat:'Cat6',  len:'6 m',   color:'white', jacket:'UTP',
    fromDev:'sw-main', fromPort:4,       toDev:'sw-desk', toPort:1,
    notes:'In-wall run to desk switch.' },
  { id:'CBL-05', cat:'Cat6',  len:'7 m',   color:'white', jacket:'UTP',
    fromDev:'sw-main', fromPort:5,       toDev:'atv',     toPort:'eth',
    notes:'TV cluster ─ Apple TV.' },
  { id:'CBL-06', cat:'Cat6',  len:'7 m',   color:'white', jacket:'UTP',
    fromDev:'sw-main', fromPort:6,       toDev:'tv',      toPort:'lan',
    notes:'TV cluster ─ BRAVIA.' },
  { id:'CBL-07', cat:'Cat5e', len:'2 m',   color:'gray',  jacket:'UTP',
    fromDev:'sw-main', fromPort:7,       toDev:'hue',     toPort:'lan',
    notes:'Bundled with Hue Bridge.' },
  { id:'CBL-08', cat:'Cat6a', len:'2 m',   color:'black', jacket:'STP',
    fromDev:'sw-desk', fromPort:2,       toDev:'rig',     toPort:'eth0',
    notes:'Aftermarket braided. Snagless.' },
  { id:'CBL-09', cat:'Cat6',  len:'1 m',   color:'gray',  jacket:'UTP',
    fromDev:'sw-desk', fromPort:3,       toDev:'mini',    toPort:'eth0',
    notes:'OEM cable from Mac mini.' },
];

// Lookup helpers
function cableForDevice(devId) {
  // Find the cable whose "to" end terminates at this device
  return CABLES.find(c => c.toDev === devId) || CABLES.find(c => c.fromDev === devId) || null;
}
function switchForDevice(devId) {
  // Find a switch/hub that has this device on a downstream port (not uplink)
  for (const sw of SWITCHES) {
    for (const [port, slot] of Object.entries(sw.portMap || {})) {
      if (slot && slot.device === devId && slot.role !== 'uplink') {
        return { sw, port: Number(port) };
      }
    }
  }
  return null;
}
function deviceName(devId) {
  const d = DEVICES.find(x => x.id === devId);
  if (d) return d.name;
  const s = SWITCHES.find(x => x.id === devId);
  if (s) return s.name;
  return devId;
}

Object.assign(window, {
  DEVICES, SWITCHES, CABLES,
  polar, layoutOf, GROUP_ORDER,
  countOnline, countOffline,
  cableForDevice, switchForDevice, deviceName,
});
