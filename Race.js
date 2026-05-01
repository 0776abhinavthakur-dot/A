```javascript
/**
 * ============================================================================
 * F1 BOT — race.js (ADVANCED SIMULATION ENGINE)
 * Command: /race OR .race
 * ============================================================================
 * Features:
 * • 24 Track Calendar with unique characteristics (Degradation, Overtake Delta)
 * • 20 Real AI Drivers with Aggression, Consistency, and Tyre Management stats
 * • Dynamic Weather System (Clear, Cloudy, Rain) affecting grip and tyre choice
 * • Comprehensive Tyre Model (Soft, Medium, Hard, Inters, Wets) with temp & deg
 * • ERS Management (Deploy, Hotlap, Overtake modes) mapped to battery capacity
 * • Safety Cars (SC) and Virtual Safety Cars (VSC) with delta times
 * • Interactive Pit Stops via Discord Select Menus
 * • Multi-Embed Telemetry UI optimised for mobile viewing
 * • Detailed Incident and Overtake logging per lap
 * ============================================================================
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

const { getUser, carScore, applyRaceRewards } = require('./car.js');

// ============================================================================
// 1. CONFIGURATION & CONSTANTS
// ============================================================================

const TICK_RATE_MS = 6000; 
const DEFAULT_TEAM_NAME = 'Shaurya Racing'; // Custom default

const WEATHER_STATES = {
  CLEAR: { name: 'Clear', emoji: '☀️', baseGrip: 1.0, rainIntensity: 0 },
  CLOUDY: { name: 'Cloudy', emoji: '☁️', baseGrip: 0.98, rainIntensity: 0 },
  LIGHT_RAIN: { name: 'Light Rain', emoji: '🌦️', baseGrip: 0.85, rainIntensity: 0.4 },
  HEAVY_RAIN: { name: 'Heavy Rain', emoji: '🌧️', baseGrip: 0.65, rainIntensity: 0.9 },
};

const TYRE_COMPOUNDS = {
  SOFT: { id: 'SOFT', name: 'Soft', emoji: '🔴', basePace: -1.2, wearRate: 4.5, wetGrip: 0.1, optimalTemp: 100 },
  MEDIUM: { id: 'MEDIUM', name: 'Medium', emoji: '🟡', basePace: -0.6, wearRate: 2.2, wetGrip: 0.1, optimalTemp: 90 },
  HARD: { id: 'HARD', name: 'Hard', emoji: '⚪', basePace: 0.0, wearRate: 1.1, wetGrip: 0.1, optimalTemp: 85 },
  INTERMEDIATE: { id: 'INTERMEDIATE', name: 'Inters', emoji: '🟢', basePace: 2.5, wearRate: 3.0, wetGrip: 0.8, optimalTemp: 70 },
  WET: { id: 'WET', name: 'Wets', emoji: '🔵', basePace: 4.5, wearRate: 2.0, wetGrip: 1.0, optimalTemp: 60 },
};

const DRIVING_MODES = {
  PUSH: { id: 'push', name: 'Push', paceMod: -0.8, wearMod: 1.8, ersDrain: 15 },
  BALANCED: { id: 'balanced', name: 'Balanced', paceMod: 0.0, wearMod: 1.0, ersDrain: 0 },
  CONSERVE: { id: 'conserve', name: 'Conserve', paceMod: 0.9, wearMod: 0.5, ersDrain: -10 }, // Recovers ERS
};

const ERS_MODES = {
  OFF: { id: 'off', name: 'Harvest', paceMod: 0.5, drain: -15 },
  NORMAL: { id: 'normal', name: 'Normal', paceMod: 0.0, drain: 0 },
  OVERTAKE: { id: 'overtake', name: 'Overtake', paceMod: -1.0, drain: 25 },
  HOTLAP: { id: 'hotlap', name: 'Hotlap', paceMod: -1.5, drain: 35 },
};

// ============================================================================
// 2. DATABASE: TRACKS & DRIVERS
// ============================================================================

const TRACKS = [
  { id: 'bhr', name: 'Bahrain', emoji: '🇧🇭', laps: 15, baseLapTime: 92.0, wearFactor: 1.4, overtakeDelta: 0.6, pitLoss: 24.0 },
  { id: 'sau', name: 'Jeddah', emoji: '🇸🇦', laps: 15, baseLapTime: 89.0, wearFactor: 0.8, overtakeDelta: 0.8, pitLoss: 21.0 },
  { id: 'aus', name: 'Melbourne', emoji: '🇦🇺', laps: 15, baseLapTime: 79.0, wearFactor: 1.0, overtakeDelta: 0.9, pitLoss: 22.0 },
  { id: 'jpn', name: 'Suzuka', emoji: '🇯🇵', laps: 15, baseLapTime: 90.0, wearFactor: 1.6, overtakeDelta: 1.2, pitLoss: 23.0 },
  { id: 'chn', name: 'Shanghai', emoji: '🇨🇳', laps: 15, baseLapTime: 96.0, wearFactor: 1.3, overtakeDelta: 0.7, pitLoss: 24.0 },
  { id: 'mia', name: 'Miami', emoji: '🇺🇸', laps: 15, baseLapTime: 89.0, wearFactor: 1.1, overtakeDelta: 0.8, pitLoss: 21.5 },
  { id: 'emi', name: 'Imola', emoji: '🇮🇹', laps: 15, baseLapTime: 76.0, wearFactor: 1.0, overtakeDelta: 1.4, pitLoss: 28.0 },
  { id: 'mon', name: 'Monaco', emoji: '🇲🇨', laps: 15, baseLapTime: 72.0, wearFactor: 0.5, overtakeDelta: 2.5, pitLoss: 20.0 },
  { id: 'can', name: 'Montreal', emoji: '🇨🇦', laps: 15, baseLapTime: 73.0, wearFactor: 0.9, overtakeDelta: 0.6, pitLoss: 19.0 },
  { id: 'esp', name: 'Barcelona', emoji: '🇪🇸', laps: 15, baseLapTime: 74.0, wearFactor: 1.5, overtakeDelta: 1.1, pitLoss: 23.0 },
  { id: 'aut', name: 'Red Bull Ring', emoji: '🇦🇹', laps: 15, baseLapTime: 65.0, wearFactor: 1.0, overtakeDelta: 0.5, pitLoss: 20.0 },
  { id: 'gbr', name: 'Silverstone', emoji: '🇬🇧', laps: 15, baseLapTime: 88.0, wearFactor: 1.7, overtakeDelta: 0.9, pitLoss: 25.0 },
  { id: 'hun', name: 'Hungaroring', emoji: '🇭🇺', laps: 15, baseLapTime: 78.0, wearFactor: 1.2, overtakeDelta: 1.5, pitLoss: 22.0 },
  { id: 'bel', name: 'Spa', emoji: '🇧🇪', laps: 10, baseLapTime: 106.0, wearFactor: 1.3, overtakeDelta: 0.7, pitLoss: 20.0 },
  { id: 'nld', name: 'Zandvoort', emoji: '🇳🇱', laps: 15, baseLapTime: 71.0, wearFactor: 1.4, overtakeDelta: 1.3, pitLoss: 21.0 },
  { id: 'ita', name: 'Monza', emoji: '🇮🇹', laps: 15, baseLapTime: 81.0, wearFactor: 0.9, overtakeDelta: 0.4, pitLoss: 24.0 },
  { id: 'aze', name: 'Baku', emoji: '🇦🇿', laps: 15, baseLapTime: 103.0, wearFactor: 1.1, overtakeDelta: 0.6, pitLoss: 21.0 },
  { id: 'sgp', name: 'Singapore', emoji: '🇸🇬', laps: 15, baseLapTime: 93.0, wearFactor: 1.4, overtakeDelta: 1.6, pitLoss: 28.0 },
  { id: 'usa', name: 'Austin', emoji: '🇺🇸', laps: 15, baseLapTime: 96.0, wearFactor: 1.3, overtakeDelta: 0.8, pitLoss: 20.0 },
  { id: 'mex', name: 'Mexico City', emoji: '🇲🇽', laps: 15, baseLapTime: 79.0, wearFactor: 1.0, overtakeDelta: 0.9, pitLoss: 22.0 },
  { id: 'bra', name: 'Interlagos', emoji: '🇧🇷', laps: 15, baseLapTime: 71.0, wearFactor: 1.2, overtakeDelta: 0.7, pitLoss: 20.0 },
  { id: 'las', name: 'Las Vegas', emoji: '🇺🇸', laps: 15, baseLapTime: 94.0, wearFactor: 0.8, overtakeDelta: 0.5, pitLoss: 21.0 },
  { id: 'qat', name: 'Lusail', emoji: '🇶🇦', laps: 15, baseLapTime: 84.0, wearFactor: 1.8, overtakeDelta: 1.0, pitLoss: 24.0 },
  { id: 'abu', name: 'Abu Dhabi', emoji: '🇦🇪', laps: 15, baseLapTime: 85.0, wearFactor: 1.1, overtakeDelta: 0.8, pitLoss: 22.0 },
];

const AI_DRIVERS = [
  { id: 'ver', name: 'M. Verstappen', pace: 98, consistency: 95, def: 95, att: 96, tyreMan: 90, team: 'Red Bull' },
  { id: 'nor', name: 'L. Norris', pace: 95, consistency: 92, def: 88, att: 92, tyreMan: 88, team: 'McLaren' },
  { id: 'lec', name: 'C. Leclerc', pace: 95, consistency: 88, def: 90, att: 93, tyreMan: 85, team: 'Ferrari' },
  { id: 'sai', name: 'C. Sainz', pace: 92, consistency: 94, def: 92, att: 89, tyreMan: 89, team: 'Ferrari' },
  { id: 'pia', name: 'O. Piastri', pace: 91, consistency: 90, def: 85, att: 90, tyreMan: 82, team: 'McLaren' },
  { id: 'rus', name: 'G. Russell', pace: 90, consistency: 89, def: 88, att: 91, tyreMan: 84, team: 'Mercedes' },
  { id: 'ham', name: 'L. Hamilton', pace: 93, consistency: 93, def: 90, att: 94, tyreMan: 95, team: 'Mercedes' },
  { id: 'alo', name: 'F. Alonso', pace: 89, consistency: 95, def: 96, att: 90, tyreMan: 92, team: 'Aston Martin' },
  { id: 'per', name: 'S. Pérez', pace: 87, consistency: 80, def: 89, att: 85, tyreMan: 91, team: 'Red Bull' },
  { id: 'str', name: 'L. Stroll', pace: 82, consistency: 75, def: 80, att: 82, tyreMan: 78, team: 'Aston Martin' },
  { id: 'tsu', name: 'Y. Tsunoda', pace: 84, consistency: 80, def: 85, att: 86, tyreMan: 76, team: 'RB' },
  { id: 'ric', name: 'D. Ricciardo', pace: 83, consistency: 82, def: 83, att: 84, tyreMan: 80, team: 'RB' },
  { id: 'hul', name: 'N. Hülkenberg', pace: 85, consistency: 85, def: 86, att: 82, tyreMan: 75, team: 'Haas' },
  { id: 'mag', name: 'K. Magnussen', pace: 81, consistency: 78, def: 92, att: 88, tyreMan: 72, team: 'Haas' },
  { id: 'alb', name: 'A. Albon', pace: 86, consistency: 88, def: 89, att: 85, tyreMan: 86, team: 'Williams' },
  { id: 'sar', name: 'L. Sargeant', pace: 78, consistency: 70, def: 75, att: 76, tyreMan: 70, team: 'Williams' },
  { id: 'gas', name: 'P. Gasly', pace: 85, consistency: 84, def: 85, att: 86, tyreMan: 82, team: 'Alpine' },
  { id: 'oco', name: 'E. Ocon', pace: 84, consistency: 85, def: 88, att: 85, tyreMan: 83, team: 'Alpine' },
  { id: 'bot', name: 'V. Bottas', pace: 82, consistency: 86, def: 80, att: 80, tyreMan: 85, team: 'Kick Sauber' },
  { id: 'zho', name: 'G. Zhou', pace: 80, consistency: 82, def: 81, att: 81, tyreMan: 80, team: 'Kick Sauber' },
];

// ============================================================================
// 3. CORE SIMULATION CLASSES
// ============================================================================

class RaceCar {
  constructor(id, name, isUser, stats, startingTyre) {
    this.id = id;
    this.name = name;
    this.isUser = isUser;
    
    // Core attributes mapped to a 0-100 scale
    this.paceBase = stats.pace || 80;
    this.consistency = stats.consistency || 80;
    this.defending = stats.def || 80;
    this.attacking = stats.att || 80;
    this.tyreMan = stats.tyreMan || 80;

    // Race State
    this.totalTime = 0.0;
    this.lastLapTime = 0.0;
    this.interval = 0.0;
    this.lapsCompleted = 0;
    
    // Systems State
    this.tyre = TYRE_COMPOUNDS[startingTyre];
    this.tyreWear = 0.0; // 0% to 100% (100% is puncture/undriveable)
    this.tyreAge = 0; // Laps on this compound
    this.ersBattery = 100.0; // %
    this.carHealth = 100.0; // %

    // Player controls
    this.driveMode = DRIVING_MODES.BALANCED;
    this.ersMode = ERS_MODES.NORMAL;
    
    // Status flags
    this.inPits = false;
    this.retired = false;
    this.pitStops = 0;
  }

  getTyrePerformanceDrop() {
    // Non-linear degradation curve (cliff effect)
    let drop = 0;
    if (this.tyreWear > 70) drop += (this.tyreWear - 70) * 0.2;
    if (this.tyreWear > 90) drop += (this.tyreWear - 90) * 0.5;
    return drop;
  }
}

class RaceSession {
  constructor(track, userCarScore, userName) {
    this.track = track;
    this.currentLap = 0;
    this.weather = WEATHER_STATES.CLEAR;
    this.safetyCarStatus = 'NONE'; // 'NONE', 'VSC', 'SC'
    this.scLapsRemaining = 0;
    this.raceLog = [];
    
    this.grid = [];
    this.initializeGrid(userCarScore, userName);
  }

  initializeGrid(userScore, userName) {
    // Map the user's /car upgrade score (0-100) to pace stats
    const userPace = 70 + (userScore * 0.3); // Max upgrades = 100 pace
    
    // Default user stats based on upgrades
    const userStats = {
      pace: userPace,
      consistency: 85,
      def: 80 + (userScore * 0.15),
      att: 80 + (userScore * 0.15),
      tyreMan: 75 + (userScore * 0.2),
    };

    this.grid.push(new RaceCar('USER', userName, true, userStats, 'MEDIUM'));

    AI_DRIVERS.forEach(ai => {
      // AI starts on mixed strategies based on grid position (simplified)
      let startTyre = Math.random() > 0.5 ? 'MEDIUM' : 'SOFT';
      this.grid.push(new RaceCar(ai.id, ai.name, false, ai, startTyre));
    });

    // Qualifying simulation (stagger starts)
    this.grid.forEach(car => {
      // Fast cars start higher up (negative time offset for logic)
      let qualiRng = (Math.random() * 2) - 1; 
      let gridDelta = ((100 - car.paceBase) * 0.2) + qualiRng;
      car.totalTime = gridDelta; 
    });

    // Sort grid based on qualifying time
    this.grid.sort((a, b) => a.totalTime - b.totalTime);
  }

  log(msg) {
    this.raceLog.unshift(`**Lap ${this.currentLap}**: ${msg}`);
    if (this.raceLog.length > 6) this.raceLog.pop(); // Keep last 6 events
  }

  updateWeather() {
    // 5% chance of weather shift per lap
    if (Math.random() < 0.05) {
      const states = Object.keys(WEATHER_STATES);
      const next = states[Math.floor(Math.random() * states.length)];
      if (this.weather !== WEATHER_STATES[next]) {
        this.weather = WEATHER_STATES[next];
        this.log(`Weather changed to ${this.weather.emoji} **${this.weather.name}**!`);
      }
    }
  }

  handleSafetyCar() {
    if (this.safetyCarStatus !== 'NONE') {
      this.scLapsRemaining--;
      if (this.scLapsRemaining <= 0) {
        this.log(`🟢 The ${this.safetyCarStatus} is ending. Racing resumes!`);
        this.safetyCarStatus = 'NONE';
      }
      return true; // Indicates SC is active
    }

    // SC Deployment Logic (2% chance per lap)
    if (Math.random() < 0.02) {
      const type = Math.random() > 0.6 ? 'SC' : 'VSC';
      this.safetyCarStatus = type;
      this.scLapsRemaining = type === 'SC' ? 3 : 1;
      this.log(`🟡 **${type} DEPLOYED** due to debris on track! Pace reduced.`);
      return true;
    }
    return false;
  }

  simulateTick() {
    this.currentLap++;
    this.updateWeather();
    const isSC = this.handleSafetyCar();

    this.grid.forEach((car, index) => {
      if (car.retired) return;

      // 1. Calculate Base Lap Time
      let lapTime = this.track.baseLapTime;

      // 2. Adjust for Pace Stat (Higher pace = lower time)
      lapTime -= (car.paceBase - 80) * 0.15; 

      // 3. Driver Modes (Player only)
      if (car.isUser) {
        lapTime += car.driveMode.paceMod;
        lapTime += car.ersMode.paceMod;
      }

      // 4. ERS Battery Management
      if (car.isUser) {
        car.ersBattery -= car.driveMode.ersDrain;
        car.ersBattery -= car.ersMode.drain;
        car.ersBattery = Math.max(0, Math.min(100, car.ersBattery)); // Clamp 0-100
        
        if (car.ersBattery === 0 && car.ersMode !== ERS_MODES.OFF) {
          // Force harvest if battery dead
          car.ersMode = ERS_MODES.OFF;
        }
      }

      // 5. Tyre Compound & Wear Impact
      lapTime += car.tyre.basePace;
      lapTime += car.getTyrePerformanceDrop();

      // Weather impact on tyres
      let gripDeficit = this.weather.baseGrip - car.tyre.wetGrip;
      if (gripDeficit < 0) gripDeficit = 0; // Proper tyre for conditions
      lapTime += gripDeficit * 5.0; // Huge penalty for wrong tyres in rain

      // Calculate wear for this lap
      let wearIncrease = car.tyre.wearRate * this.track.wearFactor;
      if (car.isUser) wearIncrease *= car.driveMode.wearMod;
      
      // AI tyre saving
      if (!car.isUser) wearIncrease *= (110 - car.tyreMan) / 100;

      car.tyreWear += wearIncrease;
      car.tyreAge++;

      // 6. Safety Car Delta
      if (isSC) {
        lapTime += this.safetyCarStatus === 'SC' ? 20.0 : 12.0;
        car.tyreWear *= 0.3; // Less wear under SC
        if (car.isUser) car.ersBattery = Math.min(100, car.ersBattery + 20); // Recharge
      }

      // 7. Pit Stop Execution
      if (car.inPits) {
        lapTime += this.track.pitLoss;
        car.tyreWear = 0;
        car.tyreAge = 0;
        car.inPits = false;
        car.pitStops++;
        
        if (car.isUser) {
          this.log(`You completed a pit stop. Fitted ${car.tyre.emoji} ${car.tyre.name}.`);
        }
      }

      // 8. AI Pit Logic (Basic)
      if (!car.isUser && !car.inPits) {
        let shouldPit = false;
        if (this.weather.rainIntensity > 0.5 && car.tyre.id !== 'WET' && car.tyre.id !== 'INTERMEDIATE') shouldPit = true;
        if (this.weather.rainIntensity === 0 && (car.tyre.id === 'WET' || car.tyre.id === 'INTERMEDIATE')) shouldPit = true;
        if (car.tyreWear > 75) shouldPit = true;

        if (shouldPit) {
          car.inPits = true;
          if (this.weather.rainIntensity > 0.7) car.tyre = TYRE_COMPOUNDS.WET;
          else if (this.weather.rainIntensity > 0.3) car.tyre = TYRE_COMPOUNDS.INTERMEDIATE;
          else car.tyre = TYRE_COMPOUNDS.HARD; // Default safe AI choice
        }
      }

      // 9. Incident / DNF check
      if (Math.random() < 0.005) { // 0.5% chance per lap
        car.retired = true;
        this.log(`❌ **${car.name}** has retired from the race (Mechanical Failure).`);
      }
      if (car.tyreWear >= 100 && !car.retired) {
        car.retired = true;
        this.log(`💥 **${car.name}** suffered a massive puncture and is out!`);
      }

      // 10. Randomness / Consistency
      let consistencyRng = (Math.random() * 2) * ((100 - car.consistency) / 100);
      lapTime += consistencyRng;

      // Apply to total time
      car.lastLapTime = lapTime;
      car.totalTime += lapTime;
      car.lapsCompleted = this.currentLap;
    });

    this.resolvePositionsAndOvertakes();
  }

  resolvePositionsAndOvertakes() {
    // Filter active cars
    let active = this.grid.filter(c => !c.retired);
    let retired = this.grid.filter(c => c.retired);

    // Sort by total time
    active.sort((a, b) => a.totalTime - b.totalTime);

    // Calculate intervals & Check overtakes
    for (let i = 0; i < active.length; i++) {
      if (i === 0) {
        active[i].interval = 0;
        continue;
      }

      let carBehind = active[i];
      let carAhead = active[i - 1];
      let gap = carBehind.totalTime - carAhead.totalTime;

      // Overtake Logic (if gap is very small, < 0.8s)
      if (gap < this.track.overtakeDelta && this.safetyCarStatus === 'NONE') {
        let overtakeChance = (carBehind.attacking - carAhead.defending) * 0.01;
        
        // ERS and Modes boost overtake chance heavily
        if (carBehind.isUser && carBehind.ersMode.id === 'overtake') overtakeChance += 0.3;
        if (carAhead.isUser && carAhead.ersMode.id === 'off') overtakeChance += 0.4; // Defenseless

        // Base 10% chance + stats difference
        if (Math.random() < 0.1 + overtakeChance) {
          // Overtake successful! Swap times slightly to reflect pass
          carBehind.totalTime -= (gap + 0.1); 
          
          if (carBehind.isUser) this.log(`🔥 You overtook ${carAhead.name} for P${i}!`);
          if (carAhead.isUser) this.log(`⚠️ ${carBehind.name} got past you! You drop to P${i+1}.`);
          
          // Re-sort required after time mutation
          active.sort((a, b) => a.totalTime - b.totalTime);
          i--; // Re-evaluate this index
          continue; 
        }
      }
      active[i].interval = active[i].totalTime - active[i - 1].totalTime;
    }

    this.grid = [...active, ...retired]; // Keep retired at bottom
  }
}

// ============================================================================
// 4. DISCORD UI BUILDERS
// ============================================================================

function generateProgressBar(percent, length = 10) {
  const p = Math.max(0, Math.min(100, percent));
  const filled = Math.round((p / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatTime(seconds) {
  if (seconds < 60) return seconds.toFixed(3) + 's';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
}

function buildRaceEmbed(session) {
  const t = session.track;
  const embed = new EmbedBuilder()
    .setTitle(`${t.emoji} Grand Prix: ${t.name}`)
    .setColor(0x00FF00)
    .setDescription(`**Lap:** \`${session.currentLap} / ${t.laps}\` | **Weather:** ${session.weather.emoji} ${session.weather.name}`);

  if (session.safetyCarStatus !== 'NONE') {
    embed.setColor(0xFFDD00);
    embed.addFields({ name: '⚠️ TRACK CAUTION', value: `${session.safetyCarStatus} is deployed. Reduced pace.` });
  }

  // Build Leaderboard String
  let boardStr = '';
  session.grid.slice(0, 15).forEach((car, index) => { // Show top 15
    const pos = String(index + 1).padStart(2, '0');
    let gapStr = index === 0 ? 'Leader' : `+${car.interval.toFixed(3)}`;
    if (car.retired) gapStr = 'OUT';
    
    let nameStr = car.isUser ? `**${car.name.substring(0,10)}** 🎮` : car.name.substring(0,13);
    boardStr += `\`${pos}\` | ${car.tyre.emoji} | ${nameStr.padEnd(16, ' ')} | \`${gapStr.padEnd(8, ' ')}\`\n`;
  });

  embed.addFields({ name: '🏁 Live Timing', value: boardStr || 'Starting...' });

  // Add Race Log
  if (session.raceLog.length > 0) {
    embed.addFields({ name: '📻 Race Control Log', value: session.raceLog.join('\n') });
  }

  return embed;
}

function buildPlayerDashEmbed(session) {
  const player = session.grid.find(c => c.isUser);
  const pos = session.grid.findIndex(c => c.isUser) + 1;
  
  if (!player) return new EmbedBuilder().setTitle('Player out of session');

  const embed = new EmbedBuilder()
    .setTitle(`🏎️ Cockpit Dashboard | P${pos}`)
    .setColor(0x1E90FF);

  if (player.retired) {
    return embed.setDescription('❌ **CAR RETIRED**\nYou are out of the race.').setColor(0xFF0000);
  }

  const wearColor = player.tyreWear > 70 ? '🔴' : player.tyreWear > 40 ? '🟡' : '🟢';
  const ersColor = player.ersBattery < 20 ? '🔴' : player.ersBattery > 80 ? '🟢' : '🟡';

  embed.addFields(
    { name: '🔵 Tyres', value: `Compound: ${player.tyre.emoji} ${player.tyre.name}\nWear: ${wearColor} ${generateProgressBar(player.tyreWear, 10)} ${player.tyreWear.toFixed(1)}%\nAge: ${player.tyreAge} Laps`, inline: true },
    { name: '⚡ ERS System', value: `Mode: **${player.ersMode.name}**\nBattery: ${ersColor} ${generateProgressBar(player.ersBattery, 10)} ${Math.floor(player.ersBattery)}%`, inline: true },
    { name: '🎮 Current Strategy', value: `Driving Style: **${player.driveMode.name}**\nPit Stops: ${player.pitStops}\nLast Lap: \`${formatTime(player.lastLapTime)}\``, inline: false }
  );

  if (player.inPits) {
    embed.addFields({ name: '🔧 PIT LANE', value: 'Car is currently in the box!' });
  }

  return embed;
}

function buildControls(player) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('race_drive_push').setLabel('🔥 Push').setStyle(player?.driveMode.id === 'push' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('race_drive_balanced').setLabel('⚖️ Balanced').setStyle(player?.driveMode.id === 'balanced' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('race_drive_conserve').setLabel('🛡️ Conserve').setStyle(player?.driveMode.id === 'conserve' ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('race_ers_overtake').setLabel('⚡ Overtake').setStyle(player?.ersMode.id === 'overtake' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('race_ers_normal').setLabel('🔋 Normal').setStyle(player?.ersMode.id === 'normal' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('race_ers_off').setLabel('🔄 Harvest').setStyle(player?.ersMode.id === 'off' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('race_pit_menu').setLabel('🔧 Box Box').setStyle(ButtonStyle.Danger).setDisabled(player?.inPits || player?.retired)
  );

  return [row1, row2];
}

function buildPitMenu() {
  const options = Object.values(TYRE_COMPOUNDS).map(t => ({
    label: `Fit ${t.name} Tyres`,
    value: t.id,
    emoji: t.emoji,
    description: `Degradation: ${t.wearRate}x | Base Pace offset: ${t.basePace}s`
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('race_pit_select')
      .setPlaceholder('🔧 Select compound for next stop...')
      .addOptions(options)
  );
}

// ============================================================================
// 5. MAIN COMMAND EXECUTION
// ============================================================================

async function execute(interaction, isPrefix = false) {
  const user = isPrefix ? interaction.author : interaction.user;
  const channel = interaction.channel;
  
  // Fetch user data from car.js db
  const userData = getUser(user.id);
  const uScore = parseFloat(carScore(userData));

  // --- Track Selection Screen ---
  const trackSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('race_track_init')
      .setPlaceholder('🗺️ Select Grand Prix Location...')
      .addOptions(TRACKS.slice(0, 24).map(t => ({ // Map all 24 tracks
        label: t.name,
        value: t.id,
        emoji: t.emoji,
        description: `${t.laps} Laps | Deg: ${t.wearFactor}x`
      })))
  );

  const setupEmbed = new EmbedBuilder()
    .setTitle('🏎️ Race Control Setup')
    .setColor(0xE10600)
    .setDescription(`Welcome back to the paddock.\nYour car performance score is **${uScore}/100**.\n\nPlease select the circuit to begin the simulation.`);

  let replyMessage;
  if (isPrefix) {
    replyMessage = await interaction.reply({ embeds: [setupEmbed], components: [trackSelect] });
  } else {
    await interaction.reply({ embeds: [setupEmbed], components: [trackSelect] });
    replyMessage = await interaction.fetchReply();
  }

  // Await track choice
  const filter = i => i.user.id === user.id;
  const trackCollector = replyMessage.createMessageComponentCollector({ filter, time: 60000, max: 1 });

  trackCollector.on('collect', async (i) => {
    await i.deferUpdate();
    const trackId = i.values[0];
    const selectedTrack = TRACKS.find(t => t.id === trackId);
    
    await startGrandPrix(i, replyMessage, user, selectedTrack, uScore);
  });
}

// ============================================================================
// 6. GRAND PRIX LOOP
// ============================================================================

async function startGrandPrix(interaction, replyMessage, user, track, uScore) {
  // Initialize Session
  const session = new RaceSession(track, uScore, user.username);
  const playerCar = session.grid.find(c => c.isUser);

  // Send DM starting grid
  try {
    await user.send(`🚦 **Lights out and away we go at ${track.name}!**\nReturn to the channel to manage your ERS, Driving style, and Tyres.`);
  } catch (e) {
    console.log('DM failed.');
  }

  // Setup Collectors for Buttons
  const controlCollector = replyMessage.createMessageComponentCollector({
    filter: i => i.user.id === user.id,
    time: (track.laps * TICK_RATE_MS) + 30000 // Timeout safely after race end
  });

  controlCollector.on('collect', async (i) => {
    if (playerCar.retired) {
      await i.reply({ content: 'Your car is retired. You cannot make inputs.', ephemeral: true });
      return;
    }

    const cid = i.customId;

    // Drive Modes
    if (cid === 'race_drive_push') playerCar.driveMode = DRIVING_MODES.PUSH;
    if (cid === 'race_drive_balanced') playerCar.driveMode = DRIVING_MODES.BALANCED;
    if (cid === 'race_drive_conserve') playerCar.driveMode = DRIVING_MODES.CONSERVE;

    // ERS Modes
    if (cid === 'race_ers_overtake') playerCar.ersMode = ERS_MODES.OVERTAKE;
    if (cid === 'race_ers_normal') playerCar.ersMode = ERS_MODES.NORMAL;
    if (cid === 'race_ers_off') playerCar.ersMode = ERS_MODES.OFF;

    // Pit Stops
    if (cid === 'race_pit_menu') {
      await i.update({ components: [buildPitMenu()] });
      return; // Early return to not re-render main UI yet
    }
    
    if (cid === 'race_pit_select') {
      const selectedCompound = i.values[0];
      playerCar.tyre = TYRE_COMPOUNDS[selectedCompound];
      playerCar.inPits = true;
      session.log(`📦 Box Box. Changing to ${playerCar.tyre.name} tyres.`);
    }

    // Acknowledge update silently
    if (!i.deferred && !i.replied) await i.deferUpdate();
    
    // Force UI render immediately for responsiveness
    await updateRaceUI(replyMessage, session, playerCar);
  });

  // Main Race Loop Interval
  const raceLoop = setInterval(async () => {
    if (session.currentLap >= track.laps) {
      clearInterval(raceLoop);
      controlCollector.stop();
      await finishRace(replyMessage, session, user);
      return;
    }

    // Tick simulation
    session.simulateTick();

    // Render UI
    await updateRaceUI(replyMessage, session, playerCar);

  }, TICK_RATE_MS);
}

// Helper to push UI updates
async function updateRaceUI(message, session, playerCar) {
  try {
    const embeds = [buildRaceEmbed(session), buildPlayerDashEmbed(session)];
    const components = playerCar.retired ? [] : buildControls(playerCar);
    await message.edit({ embeds, components });
  } catch (err) {
    console.error('Failed to update race UI (Rate limit or deleted message).');
  }
}

// ============================================================================
// 7. RACE CONCLUSION
// ============================================================================

async function finishRace(message, session, user) {
  const finalPos = session.grid.findIndex(c => c.isUser) + 1;
  const playerCar = session.grid.find(c => c.isUser);

  let finishDesc = `The checkered flag has fallen at **${session.track.name}**!\n\n`;
  
  if (playerCar.retired) {
    finishDesc += `❌ You **RETIRED** from the race.\n`;
  } else {
    finishDesc += `🏆 You finished in **P${finalPos}**!\n`;
  }

  // Calculate Rewards
  let rewardData;
  if (playerCar.retired) {
    rewardData = { moneyEarned: 0, rndEarned: 0 };
  } else {
    rewardData = applyRaceRewards(user.id, finalPos);
    finishDesc += `\n💰 Winnings: **$${rewardData.moneyEarned.toLocaleString()}**`;
    finishDesc += `\n🔬 R&D Points: **${rewardData.rndEarned.toLocaleString()}**`;
  }

  // Build Results Embed
  const resultEmbed = new EmbedBuilder()
    .setTitle('🏁 RACE CLASSIFICATION')
    .setColor(0xE10600)
    .setDescription(finishDesc);

  let resStr = '';
  session.grid.forEach((car, i) => {
    const pos = String(i + 1).padStart(2, '0');
    let gap = i === 0 ? 'Winner' : `+${car.interval.toFixed(3)}s`;
    if (car.retired) gap = 'DNF';
    
    let marker = car.isUser ? '🎮' : '';
    resStr += `\`${pos}\` | ${car.name.padEnd(15, ' ')} ${marker}| \`${gap.padEnd(9, ' ')}\`\n`;
  });

  resultEmbed.addFields({ name: 'Final Standings', value: resStr });

  try {
    await message.edit({ embeds: [resultEmbed], components: [] });
  } catch (e) {
    console.error('Could not post race results.');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('race')
    .setDescription('🏁 Start an advanced F1 simulation. Manage ERS, Tyres, and Pit Stops.'),
  execute
};

```
