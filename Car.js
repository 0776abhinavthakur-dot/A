/**
 * ============================================================
 *  F1 BOT — car.js
 *  Command: /car  OR  .car
 *  ============================================================
 *  Features:
 *   • 70 upgradeable car parts across 9 categories
 *   • Each part has 10 upgrade levels
 *   • Currency: Money (💰) and R&D Points (🔬)
 *   • Default budget: 50,000,000 (50M) + 5,000 R&D
 *   • Post-race earnings scale with finishing position
 *   • Full Discord button/select-menu pagination UI
 *   • Works with both "/" slash commands and "." prefix
 * ============================================================
 *
 *  SETUP IN index.js / bot entry:
 *    const carCommand = require('./commands/car');
 *    // Register slash command via REST:
 *    //   carCommand.slashData  ← SlashCommandBuilder data
 *    // Prefix handler:
 *    //   if (cmd === 'car') carCommand.execute(interaction, isPrefix)
 *
 *  DATABASE (adapt to your DB — shown with a simple Map for demo):
 *    The file exports getUser / saveUser helpers you can swap for
 *    MongoDB / SQLite / JSON-file etc.
 * ============================================================
 */

'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
} = require('discord.js');

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────

const DEFAULT_MONEY  = 50_000_000;   // 50 Million starting budget
const DEFAULT_RND    = 5_000;        // 5,000 R&D points
const PARTS_PER_PAGE = 5;            // parts shown per embed page
const MAX_LEVEL      = 10;           // maximum upgrade level per part
const COLLECTOR_TIMEOUT = 120_000;   // 2 minutes before UI expires

/**
 * Post-race money & R&D rewards by finishing position (1–20).
 * Values increase each race — multiply by raceNumber for scaling.
 */
const RACE_REWARDS = {
  1:  { money: 5_000_000, rnd: 500 },
  2:  { money: 4_000_000, rnd: 400 },
  3:  { money: 3_200_000, rnd: 320 },
  4:  { money: 2_600_000, rnd: 260 },
  5:  { money: 2_100_000, rnd: 210 },
  6:  { money: 1_700_000, rnd: 170 },
  7:  { money: 1_400_000, rnd: 140 },
  8:  { money: 1_100_000, rnd: 110 },
  9:  { money:   900_000, rnd:  90 },
  10: { money:   750_000, rnd:  75 },
  11: { money:   600_000, rnd:  60 },
  12: { money:   500_000, rnd:  50 },
  13: { money:   420_000, rnd:  42 },
  14: { money:   350_000, rnd:  35 },
  15: { money:   290_000, rnd:  29 },
  16: { money:   240_000, rnd:  24 },
  17: { money:   200_000, rnd:  20 },
  18: { money:   160_000, rnd:  16 },
  19: { money:   130_000, rnd:  13 },
  20: { money:   100_000, rnd:  10 },
};

// ─────────────────────────────────────────────
//  70 CAR PARTS  (9 categories)
// ─────────────────────────────────────────────
//  Each part:
//    id          – unique key stored in DB
//    name        – display name
//    category    – category label
//    emoji       – decorative emoji
//    description – short flavour text
//    effect      – what upgrading improves (for display)
//    baseMoney   – cost at level 1; scales * level^1.8
//    baseRnd     – R&D cost at level 1; scales * level^1.5
// ─────────────────────────────────────────────

const CATEGORIES = [
  {
    key:   'power_unit',
    label: '⚡ Power Unit',
    color: 0xFF4500,
    parts: [
      { id: 'ice',           name: 'Internal Combustion Engine', emoji: '🔥', description: 'The heart of the car — 1.6L V6 turbo hybrid.',          effect: 'Top speed & raw power',      baseMoney: 3_000_000, baseRnd: 300 },
      { id: 'mgu_k',        name: 'MGU-K (Motor Generator K)',  emoji: '⚡', description: 'Recovers kinetic energy under braking.',                  effect: 'Acceleration & ERS deploy',  baseMoney: 2_500_000, baseRnd: 250 },
      { id: 'mgu_h',        name: 'MGU-H (Motor Generator H)',  emoji: '🌀', description: 'Harvests energy from exhaust gases via the turbo.',       effect: 'ERS efficiency & turbo lag', baseMoney: 2_800_000, baseRnd: 280 },
      { id: 'energy_store', name: 'Energy Store (Battery)',      emoji: '🔋', description: 'Stores harvested electrical energy.',                     effect: 'ERS capacity & deployment',  baseMoney: 1_800_000, baseRnd: 180 },
      { id: 'turbocharger', name: 'Turbocharger',                emoji: '💨', description: 'Forces more air into the combustion chamber.',            effect: 'Power output & response',    baseMoney: 1_500_000, baseRnd: 150 },
      { id: 'exhaust',      name: 'Exhaust System',              emoji: '💥', description: 'Routes combustion gases and affects aero balance.',       effect: 'Downforce interaction & BHP', baseMoney: 1_000_000, baseRnd: 100 },
      { id: 'oil_system',   name: 'Oil & Lubrication System',    emoji: '🛢️', description: 'Keeps all moving parts running at peak temperature.',     effect: 'Reliability & friction loss', baseMoney:   800_000, baseRnd:  80 },
      { id: 'cooling',      name: 'Cooling System',              emoji: '❄️', description: 'Manages thermal loads across PU and electronics.',        effect: 'Thermal reliability & drag',  baseMoney:   900_000, baseRnd:  90 },
    ],
  },
  {
    key:   'aerodynamics',
    label: '🌬️ Aerodynamics',
    color: 0x1E90FF,
    parts: [
      { id: 'front_wing',      name: 'Front Wing',          emoji: '🪶', description: 'Primary downforce generator at the front.',              effect: 'Front downforce & balance',  baseMoney: 2_200_000, baseRnd: 220 },
      { id: 'rear_wing',       name: 'Rear Wing',           emoji: '🪃', description: 'Generates downforce at the rear of the car.',            effect: 'Rear downforce & drag',      baseMoney: 2_200_000, baseRnd: 220 },
      { id: 'floor',           name: 'Floor',               emoji: '🏗️', description: 'Ground-effect surface — the biggest aero element.',     effect: 'Total downforce',            baseMoney: 3_500_000, baseRnd: 350 },
      { id: 'diffuser',        name: 'Diffuser',            emoji: '🌊', description: 'Accelerates underfloor airflow to generate suction.',    effect: 'Rear downforce & drag',      baseMoney: 2_000_000, baseRnd: 200 },
      { id: 'sidepods',        name: 'Sidepods',            emoji: '📦', description: 'Houses radiators and manages airflow to rear.',          effect: 'Cooling drag & aero balance', baseMoney: 1_700_000, baseRnd: 170 },
      { id: 'drs',             name: 'DRS System',          emoji: '📡', description: 'Drag Reduction System — opens rear wing flap.',          effect: 'Straight-line speed gain',   baseMoney: 1_200_000, baseRnd: 120 },
      { id: 'bargeboards',     name: 'Bargeboards',         emoji: '🔀', description: 'Complex turning vane assemblies between wheels.',        effect: 'Airflow management',         baseMoney: 1_600_000, baseRnd: 160 },
      { id: 'nose_cone',       name: 'Nose Cone',           emoji: '🔺', description: 'Directs airflow under the car cleanly.',                 effect: 'Front aero efficiency',      baseMoney: 1_400_000, baseRnd: 140 },
      { id: 'monkey_seat',     name: 'Monkey Seat',         emoji: '🐒', description: 'Small wing above the exhaust; helps seal diffuser.',     effect: 'Rear diffuser efficiency',   baseMoney:   900_000, baseRnd:  90 },
      { id: 'beam_wing',       name: 'Beam Wing',           emoji: '🔗', description: 'Connects rear wing pillars; generates extra downforce.', effect: 'Rear downforce',             baseMoney:   950_000, baseRnd:  95 },
      { id: 'endplates',       name: 'Wing Endplates',      emoji: '🛡️', description: 'Minimise vortex losses at wing tips.',                  effect: 'Aero efficiency',            baseMoney:   750_000, baseRnd:  75 },
      { id: 'vortex_gens',     name: 'Vortex Generators',   emoji: '🌪️', description: 'Small fins that energise boundary layer flow.',          effect: 'Flow attachment',            baseMoney:   700_000, baseRnd:  70 },
      { id: 'upper_flap',      name: 'Upper Wing Flap',     emoji: '🪁', description: 'Secondary flap on front wing; tune balance finely.',     effect: 'Front balance & downforce',  baseMoney: 1_100_000, baseRnd: 110 },
      { id: 'cascade_wings',   name: 'Cascade Wings',       emoji: '🌀', description: 'Multi-element cascade on front wing assembly.',          effect: 'Corner downforce',           baseMoney: 1_300_000, baseRnd: 130 },
      { id: 'turning_vanes',   name: 'Turning Vanes',       emoji: '↩️', description: 'Guide airflow around the front suspension.',            effect: 'Underbody seal efficiency',  baseMoney:   850_000, baseRnd:  85 },
    ],
  },
  {
    key:   'chassis',
    label: '🏎️ Chassis',
    color: 0xFFD700,
    parts: [
      { id: 'monocoque',      name: 'Carbon Monocoque',   emoji: '🦴', description: 'The structural backbone of the entire car.',             effect: 'Rigidity & weight saving',   baseMoney: 4_000_000, baseRnd: 400 },
      { id: 'roll_hoop',      name: 'Roll Hoop',          emoji: '🔰', description: 'Protects driver in case of rollover.',                   effect: 'Safety & aero integration',  baseMoney: 1_200_000, baseRnd: 120 },
      { id: 'crash_struct',   name: 'Crash Structure',    emoji: '💢', description: 'Deformable zones that absorb impact energy.',           effect: 'Safety & weight',            baseMoney: 1_000_000, baseRnd: 100 },
      { id: 'halo',           name: 'Halo Device',        emoji: '😇', description: 'Titanium head protection above the cockpit.',           effect: 'Safety & aero tweaks',       baseMoney:   900_000, baseRnd:  90 },
      { id: 'fuel_tank',      name: 'Fuel Tank (Bladder)', emoji: '⛽', description: 'Flexible safety cell storing up to 110kg of fuel.',    effect: 'Weight distribution',        baseMoney: 1_100_000, baseRnd: 110 },
      { id: 'safety_cell',    name: 'Safety Cell',        emoji: '🧱', description: 'Surrounds the driver in a protective carbon shell.',    effect: 'Driver safety rating',       baseMoney: 1_500_000, baseRnd: 150 },
      { id: 'cockpit',        name: 'Cockpit Ergonomics', emoji: '🪑', description: 'Optimised seating position and control layout.',       effect: 'Driver reaction time',       baseMoney:   800_000, baseRnd:  80 },
      { id: 'ballast',        name: 'Ballast System',     emoji: '⚖️', description: 'Repositionable weight to tune centre of gravity.',     effect: 'Balance & CoG optimisation', baseMoney:   700_000, baseRnd:  70 },
    ],
  },
  {
    key:   'suspension',
    label: '🔧 Suspension',
    color: 0x32CD32,
    parts: [
      { id: 'front_susp',  name: 'Front Suspension',    emoji: '🔩', description: 'Inboard pushrod geometry managing tyre contact patch.',  effect: 'Front grip & response',       baseMoney: 1_800_000, baseRnd: 180 },
      { id: 'rear_susp',   name: 'Rear Suspension',     emoji: '🔩', description: 'Pullrod rear geometry integrated with gearbox casing.', effect: 'Rear stability & traction',   baseMoney: 1_800_000, baseRnd: 180 },
      { id: 'pushrod',     name: 'Pushrod Geometry',    emoji: '📐', description: 'Push-type actuator connecting wishbone to rocker.',     effect: 'Mechanical grip balance',     baseMoney: 1_200_000, baseRnd: 120 },
      { id: 'pullrod',     name: 'Pullrod Geometry',    emoji: '📐', description: 'Pull-type actuator for lower CoG at rear.',             effect: 'Rear stability & CoG',        baseMoney: 1_200_000, baseRnd: 120 },
      { id: 'dampers',     name: 'Dampers (Shock Abs.)', emoji: '🌡️', description: 'Controls body motion frequency and ride height.',      effect: 'Ride quality & tyre wear',    baseMoney: 1_500_000, baseRnd: 150 },
      { id: 'arb',         name: 'Anti-Roll Bars',      emoji: '🔄', description: 'Limits body roll during cornering.',                   effect: 'Corner balance & agility',    baseMoney:   900_000, baseRnd:  90 },
      { id: 'upright',     name: 'Uprights',            emoji: '📌', description: 'Hub carriers connecting wheel to suspension arms.',    effect: 'Steering precision',          baseMoney: 1_100_000, baseRnd: 110 },
      { id: 'hub',         name: 'Wheel Hub Assembly',  emoji: '⚙️', description: 'Bearings and spindles — minimise friction losses.',   effect: 'Rolling resistance',          baseMoney:   800_000, baseRnd:  80 },
    ],
  },
  {
    key:   'brakes',
    label: '🛑 Brakes',
    color: 0xDC143C,
    parts: [
      { id: 'brake_cal_f',  name: 'Front Brake Calipers', emoji: '🔴', description: 'Carbon-titanium calipers clamping the front discs.',   effect: 'Braking force & feel',        baseMoney: 1_600_000, baseRnd: 160 },
      { id: 'brake_cal_r',  name: 'Rear Brake Calipers',  emoji: '🔴', description: 'Smaller rear calipers balanced with regen braking.',  effect: 'Rear brake balance',          baseMoney: 1_400_000, baseRnd: 140 },
      { id: 'brake_discs',  name: 'Carbon Brake Discs',   emoji: '💿', description: 'Carbon-carbon discs operating at 1000°C+.',           effect: 'Stopping distance',           baseMoney: 1_200_000, baseRnd: 120 },
      { id: 'brake_pads',   name: 'Brake Pads',           emoji: '🟥', description: 'Friction material matched to disc compound.',         effect: 'Bite & modulation',           baseMoney:   600_000, baseRnd:  60 },
      { id: 'brake_ducts',  name: 'Brake Ducts',          emoji: '🌬️', description: 'Channels cooling air to discs and calipers.',         effect: 'Thermal management & wear',   baseMoney:   800_000, baseRnd:  80 },
      { id: 'brake_bias',   name: 'Brake Bias System',    emoji: '⚖️', description: 'Driver-adjustable F/R brake distribution.',          effect: 'Adjustability & rotation',    baseMoney:   700_000, baseRnd:  70 },
    ],
  },
  {
    key:   'gearbox',
    label: '⚙️ Gearbox',
    color: 0x9400D3,
    parts: [
      { id: 'gb_casing',   name: 'Gearbox Casing',    emoji: '🏗️', description: 'Carbon/titanium structure — doubles as rear suspension mount.', effect: 'Rigidity & weight',          baseMoney: 2_000_000, baseRnd: 200 },
      { id: 'gear_ratios', name: 'Gear Ratios',        emoji: '🔢', description: 'Track-specific ratio stack tuned for power delivery.',           effect: 'Acceleration & top speed',   baseMoney: 1_300_000, baseRnd: 130 },
      { id: 'clutch',      name: 'Clutch System',      emoji: '🤝', description: 'Multi-plate carbon clutch for race starts and pit stops.',      effect: 'Race start performance',     baseMoney:   900_000, baseRnd:  90 },
      { id: 'diff',        name: 'Differential',       emoji: '🌀', description: 'Electronic diff controls power split on corner exit.',           effect: 'Traction & corner speed',    baseMoney: 1_700_000, baseRnd: 170 },
      { id: 'driveshafts', name: 'Driveshafts',        emoji: '↔️', description: 'Transfer torque from gearbox to rear wheels.',                  effect: 'Power loss & reliability',   baseMoney:   800_000, baseRnd:  80 },
      { id: 'gear_sel',    name: 'Gear Selector',      emoji: '🕹️', description: 'Electrohydraulic paddle-shift actuation system.',               effect: 'Shift speed & reliability',  baseMoney: 1_000_000, baseRnd: 100 },
    ],
  },
  {
    key:   'electronics',
    label: '💻 Electronics',
    color: 0x00CED1,
    parts: [
      { id: 'ecu',          name: 'ECU (Control Unit)',   emoji: '🧠', description: 'Standard FIA ECU — optimise mappings and strategies.',  effect: 'Engine maps & strategy',      baseMoney: 2_500_000, baseRnd: 250 },
      { id: 'hydraulics',   name: 'Hydraulic System',     emoji: '💧', description: 'Powers gear shifts, DRS, clutch, suspension.',         effect: 'System response & reliability',baseMoney: 1_400_000, baseRnd: 140 },
      { id: 'sensors',      name: 'Sensor Array',         emoji: '📡', description: 'Hundreds of sensors feeding data to the pit wall.',    effect: 'Data resolution & strategy',  baseMoney:   900_000, baseRnd:  90 },
      { id: 'data_logger',  name: 'Data Logger',          emoji: '📊', description: 'High-frequency data recording for post-race analysis.',effect: 'Setup improvement rate',      baseMoney:   800_000, baseRnd:  80 },
      { id: 'driver_disp',  name: 'Driver Display',       emoji: '🖥️', description: 'Steering wheel LCD with live telemetry readouts.',     effect: 'Driver awareness & reaction', baseMoney:   700_000, baseRnd:  70 },
      { id: 'power_steer',  name: 'Power Steering',       emoji: '🎮', description: 'Electrically-assisted steering — reduces driver load.', effect: 'Driver fatigue & feel',       baseMoney: 1_100_000, baseRnd: 110 },
      { id: 'comms',        name: 'Team Radio & Comms',   emoji: '📻', description: 'Encrypted radio, telemetry link to pit wall.',         effect: 'Strategic communication',     baseMoney:   600_000, baseRnd:  60 },
    ],
  },
  {
    key:   'tyres',
    label: '🔵 Tyres & Wheels',
    color: 0xFFA500,
    parts: [
      { id: 'tyre_comp',   name: 'Tyre Compounds',       emoji: '🏁', description: 'Work with Pirelli to optimise compound selection.',    effect: 'Tyre strategy range',         baseMoney: 1_200_000, baseRnd: 120 },
      { id: 'wheel_rims',  name: 'Wheel Rims (18")',      emoji: '⭕', description: '18-inch forged magnesium alloy rims.',                effect: 'Unsprung weight',             baseMoney: 1_000_000, baseRnd: 100 },
      { id: 'tyre_press',  name: 'Tyre Pressure System', emoji: '💨', description: 'TPMS monitoring across all four corners.',            effect: 'Tyre optimisation',           baseMoney:   700_000, baseRnd:  70 },
      { id: 'tyre_warm',   name: 'Tyre Blankets',        emoji: '🔆', description: 'Pre-heat tyres to optimal operating window.',         effect: 'Race start grip',             baseMoney:   500_000, baseRnd:  50 },
      { id: 'wheel_nut',   name: 'Wheel Nut System',     emoji: '🔑', description: 'Single-nut design for sub-2.0s pit stop target.',     effect: 'Pit stop speed',              baseMoney:   600_000, baseRnd:  60 },
      { id: 'wheel_cover', name: 'Wheel Covers (Aero)',  emoji: '🛡️', description: 'Aerodynamic covers reducing turbulent wheel wake.',   effect: 'Drag & aero wake',            baseMoney:   800_000, baseRnd:  80 },
    ],
  },
  {
    key:   'driver',
    label: '👨‍✈️ Driver Systems',
    color: 0xC0C0C0,
    parts: [
      { id: 'steer_wheel',  name: 'Steering Wheel',        emoji: '🎮', description: '200+ functions on a carbon-fibre D-shaped wheel.',   effect: 'Control precision & speed',   baseMoney: 1_500_000, baseRnd: 150 },
      { id: 'seat',         name: 'Custom Race Seat',       emoji: '💺', description: 'Carbon shell moulded to the exact driver\'s body.',  effect: 'Driver comfort & support',    baseMoney:   700_000, baseRnd:  70 },
      { id: 'hans',         name: 'HANS Device',            emoji: '🦺', description: 'Head-and-Neck Support limiting head movement.',     effect: 'Driver safety rating',        baseMoney:   500_000, baseRnd:  50 },
      { id: 'helmet_iface', name: 'Helmet Interface',       emoji: '⛑️', description: 'Air/drinks feeds and comm links inside helmet.',   effect: 'Driver hydration & focus',    baseMoney:   600_000, baseRnd:  60 },
      { id: 'drinks_sys',   name: 'Drinks System',          emoji: '💧', description: 'In-cockpit liquid feed for driver hydration.',      effect: 'Driver stamina (late laps)',   baseMoney:   400_000, baseRnd:  40 },
      { id: 'biometrics',   name: 'Biometric System',       emoji: '❤️', description: 'Real-time driver heart-rate, G-force monitoring.',  effect: 'Medical response time',       baseMoney:   800_000, baseRnd:  80 },
    ],
  },
];

// Flat list of all 70 parts for easy lookup
const ALL_PARTS = CATEGORIES.flatMap(cat =>
  cat.parts.map(p => ({ ...p, categoryKey: cat.key, categoryLabel: cat.label, categoryColor: cat.color }))
);

// ─────────────────────────────────────────────
//  COST FORMULAS
// ─────────────────────────────────────────────

/**
 * Money cost to upgrade a part TO a given target level.
 * Scales exponentially: base * targetLevel^1.8
 */
function moneyCost(part, targetLevel) {
  return Math.floor(part.baseMoney * Math.pow(targetLevel, 1.8));
}

/**
 * R&D cost to upgrade a part TO a given target level.
 * Scales: base * targetLevel^1.5
 */
function rndCost(part, targetLevel) {
  return Math.floor(part.baseRnd * Math.pow(targetLevel, 1.5));
}

/**
 * Performance rating contribution of one part at a given level (0–100 scale).
 * level 0 = 0, level 10 = 100.
 */
function partPerformance(level) {
  return (level / MAX_LEVEL) * 100;
}

/**
 * Overall car performance score (0–100) averaged across all 70 parts.
 */
function carScore(userData) {
  const levels = ALL_PARTS.map(p => userData.parts[p.id] ?? 0);
  const total  = levels.reduce((s, l) => s + partPerformance(l), 0);
  return (total / ALL_PARTS.length).toFixed(1);
}

// ─────────────────────────────────────────────
//  SIMPLE IN-MEMORY DATABASE  (swap for real DB)
// ─────────────────────────────────────────────

const db = new Map(); // userId → userData

function getUser(userId) {
  if (!db.has(userId)) {
    const fresh = {
      userId,
      money:     DEFAULT_MONEY,
      rnd:       DEFAULT_RND,
      racesCompleted: 0,
      parts:     Object.fromEntries(ALL_PARTS.map(p => [p.id, 0])),
    };
    db.set(userId, fresh);
  }
  return db.get(userId);
}

function saveUser(userId, data) {
  db.set(userId, data);
}

/**
 * Call this after each race to award resources.
 * @param {string} userId
 * @param {number} position  – 1-based finishing position (1–20)
 * @returns {{ moneyEarned, rndEarned }}
 */
function applyRaceRewards(userId, position) {
  const user   = getUser(userId);
  const clamp  = Math.max(1, Math.min(20, position));
  const base   = RACE_REWARDS[clamp];
  const raceNo = user.racesCompleted + 1;

  // Scale reward linearly with race number
  const moneyEarned = Math.floor(base.money * (1 + (raceNo - 1) * 0.05));
  const rndEarned   = Math.floor(base.rnd   * (1 + (raceNo - 1) * 0.05));

  user.money         += moneyEarned;
  user.rnd           += rndEarned;
  user.racesCompleted = raceNo;

  saveUser(userId, user);
  return { moneyEarned, rndEarned };
}

// ─────────────────────────────────────────────
//  EMBED BUILDERS
// ─────────────────────────────────────────────

function buildCategorySelectMenu(interactionId) {
  const options = CATEGORIES.map(cat => ({
    label: cat.label,
    value: cat.key,
    description: `${cat.parts.length} parts`,
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`car_cat_${interactionId}`)
      .setPlaceholder('📂  Select a car category…')
      .addOptions(options)
  );
}

function buildCategoryOverviewEmbed(userData) {
  const score = carScore(userData);
  const embed = new EmbedBuilder()
    .setTitle('🏎️  Car Development Centre')
    .setColor(0xFF1801)
    .setDescription(
      `> **Overall Performance Rating:** \`${score}/100\`\n` +
      `> 💰 Budget: **$${userData.money.toLocaleString()}**   🔬 R&D: **${userData.rnd.toLocaleString()} pts**\n` +
      `> 🏁 Races Completed: **${userData.racesCompleted}**\n\n` +
      `Use the **dropdown** below to browse categories, then upgrade parts.\n` +
      `Each part has **10 upgrade levels** — higher levels cost more money & R&D.`
    )
    .setFooter({ text: 'F1 Bot • Car Development' })
    .setTimestamp();

  for (const cat of CATEGORIES) {
    const levels   = cat.parts.map(p => userData.parts[p.id] ?? 0);
    const avgLevel = (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1);
    const maxed    = levels.filter(l => l >= MAX_LEVEL).length;
    const bar      = makeProgressBar(avgLevel, MAX_LEVEL, 8);

    embed.addFields({
      name: cat.label,
      value: `${bar} Avg Lv.**${avgLevel}** | ${maxed}/${cat.parts.length} maxed`,
      inline: true,
    });
  }

  return embed;
}

function buildPartListEmbed(userData, categoryKey, page) {
  const cat   = CATEGORIES.find(c => c.key === categoryKey);
  if (!cat) return null;

  const start = page * PARTS_PER_PAGE;
  const slice = cat.parts.slice(start, start + PARTS_PER_PAGE);
  const total = Math.ceil(cat.parts.length / PARTS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setTitle(`${cat.label}  — Parts List`)
    .setColor(cat.color)
    .setDescription(
      `💰 Budget: **$${userData.money.toLocaleString()}**   🔬 R&D: **${userData.rnd.toLocaleString()} pts**\n` +
      `📄 Page **${page + 1}/${total}** — Select a part to upgrade it.`
    )
    .setFooter({ text: `${cat.parts.length} parts in this category` });

  for (const part of slice) {
    const lvl  = userData.parts[part.id] ?? 0;
    const bar  = makeProgressBar(lvl, MAX_LEVEL, 10);
    const next = lvl + 1;
    const canUpgrade = lvl < MAX_LEVEL;

    let costLine = canUpgrade
      ? `💰 Next: **$${moneyCost(part, next).toLocaleString()}** | 🔬 **${rndCost(part, next).toLocaleString()} R&D**`
      : '✅ **FULLY UPGRADED**';

    embed.addFields({
      name: `${part.emoji} ${part.name}  (Lv. ${lvl}/${MAX_LEVEL})`,
      value:
        `${bar}\n` +
        `*${part.description}*\n` +
        `📈 Effect: ${part.effect}\n` +
        costLine,
    });
  }

  return embed;
}

function buildUpgradeConfirmEmbed(userData, part) {
  const lvl  = userData.parts[part.id] ?? 0;
  const next = lvl + 1;
  const mc   = moneyCost(part, next);
  const rc   = rndCost(part, next);
  const canAffordMoney = userData.money >= mc;
  const canAffordRnd   = userData.rnd   >= rc;
  const canDo = canAffordMoney && canAffordRnd && lvl < MAX_LEVEL;

  const embed = new EmbedBuilder()
    .setTitle(`${part.emoji}  Upgrade: ${part.name}`)
    .setColor(canDo ? 0x00FF7F : 0xFF4444)
    .setDescription(
      `**Category:** ${part.categoryLabel}\n` +
      `**Effect:** ${part.effect}\n\n` +
      `*${part.description}*`
    )
    .addFields(
      { name: '📊 Current Level', value: `**${lvl}** → **${next > MAX_LEVEL ? '—' : next}**`, inline: true },
      { name: '💰 Money Cost',   value: `$${mc.toLocaleString()}\nYou have: $${userData.money.toLocaleString()}`, inline: true },
      { name: '🔬 R&D Cost',     value: `${rc.toLocaleString()} pts\nYou have: ${userData.rnd.toLocaleString()}`, inline: true }
    )
    .setFooter({ text: canDo ? '✅ You can afford this upgrade!' : '❌ Insufficient funds or max level reached.' });

  if (lvl >= MAX_LEVEL) {
    embed.setDescription('> ✅ This part is **fully upgraded** — no further upgrades available.');
  }

  return embed;
}

// ─────────────────────────────────────────────
//  BUTTON ROW BUILDERS
// ─────────────────────────────────────────────

function buildPartPageButtons(categoryKey, page, totalPages, interactionId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`car_prev_${categoryKey}_${page}_${interactionId}`)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`car_next_${categoryKey}_${page}_${interactionId}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`car_back_${interactionId}`)
      .setLabel('🏠 Back to Overview')
      .setStyle(ButtonStyle.Primary),
  );
  return row1;
}

function buildPartUpgradeButtons(categoryKey, page, partId, interactionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`car_upgrade_${partId}_${categoryKey}_${page}_${interactionId}`)
      .setLabel('⬆️ Upgrade')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`car_cancel_${categoryKey}_${page}_${interactionId}`)
      .setLabel('✖ Cancel')
      .setStyle(ButtonStyle.Danger),
  );
}

function buildPartSelectButtons(categoryKey, page, parts, startIndex, interactionId) {
  // Numbered buttons (1–5) to select a part on the current page
  const row = new ActionRowBuilder();
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const lvl  = 0; // placeholder — caller passes user data separately if needed
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`car_select_${part.id}_${categoryKey}_${page}_${interactionId}`)
        .setLabel(`[${i + 1}] ${part.name.slice(0, 18)}`)
        .setStyle(ButtonStyle.Secondary)
    );
  }
  return row;
}

// ─────────────────────────────────────────────
//  UTILITY
// ─────────────────────────────────────────────

/**
 * Renders a Unicode progress bar.
 * @param {number} value   – current value
 * @param {number} max     – maximum value
 * @param {number} width   – bar width in characters
 */
function makeProgressBar(value, max, width = 10) {
  const filled = Math.round((value / max) * width);
  const empty  = width - filled;
  return `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
}

function fmt(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// ─────────────────────────────────────────────
//  MAIN COMMAND HANDLER
// ─────────────────────────────────────────────

/**
 * Entry point — called from your command router.
 *
 * @param {import('discord.js').ChatInputCommandInteraction
 *       | import('discord.js').Message} interaction
 * @param {boolean} isPrefix – true when invoked via "." prefix
 */
async function execute(interaction, isPrefix = false) {
  const userId  = isPrefix ? interaction.author.id : interaction.user.id;
  const channel = isPrefix ? interaction.channel   : interaction.channel;
  const iid     = userId.slice(-6); // short ID for custom IDs

  const userData = getUser(userId);

  // ── Initial reply ──────────────────────────────
  const overviewEmbed  = buildCategoryOverviewEmbed(userData);
  const categorySelect = buildCategorySelectMenu(iid);

  let reply;
  if (isPrefix) {
    reply = await interaction.reply({ embeds: [overviewEmbed], components: [categorySelect] });
  } else {
    await interaction.reply({ embeds: [overviewEmbed], components: [categorySelect] });
    reply = await interaction.fetchReply();
  }

  // ── Interaction collector (buttons + selects) ──
  const collector = channel.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    time:   COLLECTOR_TIMEOUT,
  });

  let currentCategory = null;
  let currentPage     = 0;
  let currentPartId   = null;

  collector.on('collect', async (i) => {
    await i.deferUpdate();
    const cid = i.customId;

    // ── Category selected via dropdown ──────────
    if (cid === `car_cat_${iid}`) {
      currentCategory = i.values[0];
      currentPage     = 0;
      await showPartList(i, userId, currentCategory, currentPage, iid);
      return;
    }

    // ── Pagination: Previous page ───────────────
    if (cid.startsWith(`car_prev_`)) {
      const parts = cid.split('_');
      currentCategory = parts[2];
      currentPage     = Math.max(0, parseInt(parts[3]) - 1);
      await showPartList(i, userId, currentCategory, currentPage, iid);
      return;
    }

    // ── Pagination: Next page ───────────────────
    if (cid.startsWith(`car_next_`)) {
      const parts = cid.split('_');
      currentCategory = parts[2];
      currentPage     = parseInt(parts[3]) + 1;
      await showPartList(i, userId, currentCategory, currentPage, iid);
      return;
    }

    // ── Back to overview ────────────────────────
    if (cid === `car_back_${iid}`) {
      currentCategory = null;
      currentPage     = 0;
      currentPartId   = null;
      const fresh = getUser(userId);
      const embed = buildCategoryOverviewEmbed(fresh);
      await i.editReply({ embeds: [embed], components: [buildCategorySelectMenu(iid)] });
      return;
    }

    // ── Part selected (numbered button) ─────────
    if (cid.startsWith(`car_select_`)) {
      const segments = cid.split('_');
      // car_select_{partId}_{catKey}_{page}_{iid}
      currentPartId   = segments[2];
      currentCategory = segments[3];
      currentPage     = parseInt(segments[4]);
      await showUpgradeConfirm(i, userId, currentPartId, currentCategory, currentPage, iid);
      return;
    }

    // ── Upgrade confirmed ───────────────────────
    if (cid.startsWith(`car_upgrade_`)) {
      const segments = cid.split('_');
      const partId   = segments[2];
      const catKey   = segments[3];
      const pg       = parseInt(segments[4]);
      await doUpgrade(i, userId, partId, catKey, pg, iid);
      return;
    }

    // ── Cancel upgrade ──────────────────────────
    if (cid.startsWith(`car_cancel_`)) {
      const segments = cid.split('_');
      currentCategory = segments[2];
      currentPage     = parseInt(segments[3]);
      await showPartList(i, userId, currentCategory, currentPage, iid);
      return;
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      try {
        await reply.edit({ components: [] });
      } catch (_) { /* message may be deleted */ }
    }
  });
}

// ─────────────────────────────────────────────
//  SCREEN RENDERERS
// ─────────────────────────────────────────────

async function showPartList(i, userId, categoryKey, page, iid) {
  const userData  = getUser(userId);
  const cat       = CATEGORIES.find(c => c.key === categoryKey);
  const totalPages = Math.ceil(cat.parts.length / PARTS_PER_PAGE);
  const pageSlice  = cat.parts.slice(page * PARTS_PER_PAGE, (page + 1) * PARTS_PER_PAGE);

  const embed      = buildPartListEmbed(userData, categoryKey, page);
  const navRow     = buildPartPageButtons(categoryKey, page, totalPages, iid);
  const selectRow  = buildPartSelectButtons(categoryKey, page, pageSlice, page * PARTS_PER_PAGE, iid);
  const backSelect = buildCategorySelectMenu(iid);

  await i.editReply({
    embeds: [embed],
    components: [backSelect, selectRow, navRow],
  });
}

async function showUpgradeConfirm(i, userId, partId, categoryKey, page, iid) {
  const userData = getUser(userId);
  const part     = ALL_PARTS.find(p => p.id === partId);
  if (!part) return;

  const embed   = buildUpgradeConfirmEmbed(userData, part);
  const buttons = buildPartUpgradeButtons(categoryKey, page, partId, iid);

  await i.editReply({
    embeds: [embed],
    components: [buttons],
  });
}

async function doUpgrade(i, userId, partId, categoryKey, page, iid) {
  const userData = getUser(userId);
  const part     = ALL_PARTS.find(p => p.id === partId);
  if (!part) return;

  const currentLevel = userData.parts[partId] ?? 0;
  const nextLevel    = currentLevel + 1;

  // Validation
  if (currentLevel >= MAX_LEVEL) {
    await i.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF4444)
          .setTitle('❌ Already Maxed')
          .setDescription(`**${part.emoji} ${part.name}** is already at **Level ${MAX_LEVEL}** — fully upgraded!`)
      ],
      components: [buildPartPageButtons(categoryKey, page, Math.ceil(CATEGORIES.find(c=>c.key===categoryKey).parts.length / PARTS_PER_PAGE), iid)],
    });
    return;
  }

  const mc = moneyCost(part, nextLevel);
  const rc = rndCost(part, nextLevel);

  if (userData.money < mc) {
    await i.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF4444)
          .setTitle('❌ Insufficient Budget')
          .setDescription(
            `Upgrading **${part.name}** to Level ${nextLevel} costs **$${mc.toLocaleString()}**.\n` +
            `You only have **$${userData.money.toLocaleString()}**.\n\n` +
            `💡 Finish more races to earn money!`
          )
      ],
      components: [buildPartPageButtons(categoryKey, page, Math.ceil(CATEGORIES.find(c=>c.key===categoryKey).parts.length / PARTS_PER_PAGE), iid)],
    });
    return;
  }

  if (userData.rnd < rc) {
    await i.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF4444)
          .setTitle('❌ Insufficient R&D Points')
          .setDescription(
            `Upgrading **${part.name}** to Level ${nextLevel} requires **${rc.toLocaleString()} R&D**.\n` +
            `You only have **${userData.rnd.toLocaleString()} pts**.\n\n` +
            `💡 Higher finishing positions earn more R&D points!`
          )
      ],
      components: [buildPartPageButtons(categoryKey, page, Math.ceil(CATEGORIES.find(c=>c.key===categoryKey).parts.length / PARTS_PER_PAGE), iid)],
    });
    return;
  }

  // ── Apply upgrade ─────────────────────────────
  userData.money          -= mc;
  userData.rnd            -= rc;
  userData.parts[partId]   = nextLevel;
  saveUser(userId, userData);

  const newScore = carScore(userData);

  const successEmbed = new EmbedBuilder()
    .setColor(0x00FF7F)
    .setTitle(`✅  Upgrade Successful!`)
    .setDescription(
      `**${part.emoji} ${part.name}** upgraded to **Level ${nextLevel}**!\n\n` +
      `📈 Effect improved: *${part.effect}*\n\n` +
      `💰 Spent: **$${mc.toLocaleString()}**  |  🔬 Spent: **${rc.toLocaleString()} R&D**\n` +
      `Remaining: **$${userData.money.toLocaleString()}** & **${userData.rnd.toLocaleString()} R&D**\n\n` +
      `🏎️ Overall Car Score: **${newScore}/100**`
    )
    .setFooter({ text: nextLevel === MAX_LEVEL ? '🏆 Part is now FULLY MAXED!' : `Next level will cost $${moneyCost(part, nextLevel+1).toLocaleString()} | ${rndCost(part, nextLevel+1).toLocaleString()} R&D` })
    .setTimestamp();

  const cat        = CATEGORIES.find(c => c.key === categoryKey);
  const totalPages = Math.ceil(cat.parts.length / PARTS_PER_PAGE);

  await i.editReply({
    embeds: [successEmbed],
    components: [buildPartPageButtons(categoryKey, page, totalPages, iid)],
  });
}

// ─────────────────────────────────────────────
//  SLASH COMMAND DATA  (register with Discord)
// ─────────────────────────────────────────────

const slashData = new SlashCommandBuilder()
  .setName('car')
  .setDescription('🏎️  Open the Car Development Centre — upgrade your F1 car\'s 70 parts!');

// ─────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  // Slash command metadata
  data: slashData,
  slashData,

  // Main handler (works for both slash and prefix)
  execute,

  // Race reward utility — call from your race result handler
  applyRaceRewards,

  // Direct DB access (swap for real DB wrappers)
  getUser,
  saveUser,

  // Exported helpers (useful for other command files)
  ALL_PARTS,
  CATEGORIES,
  RACE_REWARDS,
  moneyCost,
  rndCost,
  carScore,
  DEFAULT_MONEY,
  DEFAULT_RND,
};

/*
 * ─────────────────────────────────────────────────────────────
 *  HOW TO WIRE THIS INTO YOUR BOT  (index.js example)
 * ─────────────────────────────────────────────────────────────
 *
 *  const { Client, GatewayIntentBits } = require('discord.js');
 *  const carCmd = require('./commands/car');
 *
 *  const client = new Client({ intents: [
 *    GatewayIntentBits.Guilds,
 *    GatewayIntentBits.GuildMessages,
 *    GatewayIntentBits.MessageContent,
 *  ]});
 *
 *  // ── Slash command handler ──────────────────
 *  client.on('interactionCreate', async (interaction) => {
 *    if (!interaction.isChatInputCommand()) return;
 *    if (interaction.commandName === 'car') {
 *      await carCmd.execute(interaction, false);
 *    }
 *  });
 *
 *  // ── Prefix command handler (".car" or ".Car") ──
 *  const PREFIX = '.';
 *  client.on('messageCreate', async (message) => {
 *    if (message.author.bot) return;
 *    if (!message.content.startsWith(PREFIX)) return;
 *    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
 *    const cmd  = args.shift().toLowerCase();
 *    if (cmd === 'car') {
 *      await carCmd.execute(message, true);
 *    }
 *  });
 *
 *  // ── After a race finishes, call: ─────────────
 *  //   const result = carCmd.applyRaceRewards(userId, finishingPosition);
 *  //   console.log(`Earned $${result.moneyEarned} and ${result.rndEarned} R&D`);
 *
 *  client.login(process.env.DISCORD_TOKEN);
 *
 * ─────────────────────────────────────────────────────────────
 */
