/* ==========================================
   F1 COMMAND CENTER - DYNAMIC APPLICATION
   Fetches live data from Jolpica F1 API
   Auto-detects current season year
   ========================================== */

// ==========================================
// CONFIGURATION
// ==========================================

const CURRENT_YEAR = new Date().getFullYear();
const API_BASE = 'https://api.jolpi.ca/ergast/f1';

const TEAM_COLORS = {
    // 2026 Teams (confirmed)
    'McLaren': '#FF8000',
    'Red Bull': '#3671C6',
    'Mercedes': '#27F4D2',
    'Ferrari': '#E8002D',
    'Williams': '#64C4FF',
    'Aston Martin': '#229971',
    'Alpine F1 Team': '#FF87BC',
    'Alpine': '#FF87BC',
    'Haas F1 Team': '#B6BABD',
    'Haas': '#B6BABD',
    // Racing Bulls — all possible API name variants
    'Racing Bulls': '#6692FF',
    'RB F1 Team': '#6692FF',
    'Visa Cash App Racing Bulls': '#6692FF',
    'VCARB': '#6692FF',
    // Audi (was Sauber/Kick Sauber — keeping old names for 2025 fallback data)
    'Audi': '#BB0000',
    'Audi F1 Team': '#BB0000',
    'Audi Revolut': '#BB0000',
    'Kick Sauber': '#52E252',   // 2024 fallback
    'Sauber': '#52E252',        // 2023-2024 fallback
    // Cadillac (new entry 2026)
    'Cadillac': '#FFD700',
    'Cadillac F1 Team': '#FFD700',
    'TWG Cadillac': '#FFD700'
};

const COUNTRY_FLAGS = {
    'Australia': '🇦🇺', 'China': '🇨🇳', 'Japan': '🇯🇵', 'Bahrain': '🇧🇭',
    'Saudi Arabia': '🇸🇦', 'USA': '🇺🇸', 'Italy': '🇮🇹', 'Monaco': '🇲🇨',
    'Spain': '🇪🇸', 'Canada': '🇨🇦', 'Austria': '🇦🇹', 'UK': '🇬🇧',
    'Belgium': '🇧🇪', 'Hungary': '🇭🇺', 'Netherlands': '🇳🇱',
    'Azerbaijan': '🇦🇿', 'Singapore': '🇸🇬', 'Mexico': '🇲🇽',
    'Brazil': '🇧🇷', 'Qatar': '🇶🇦', 'UAE': '🇦🇪',
    'United Kingdom': '🇬🇧', 'United States': '🇺🇸'
};

function getTeamColor(teamName) {
    if (!teamName) return '#888';
    for (const [key, value] of Object.entries(TEAM_COLORS)) {
        if (teamName.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(teamName.toLowerCase())) {
            return value;
        }
    }
    return '#888';
}

// ==========================================
// STATE - populated by API calls
// ==========================================

let state = {
    year: CURRENT_YEAR,
    driverStandings: [],
    constructorStandings: [],
    lastRaceResults: [],
    lastRaceName: '',
    lastRaceCircuit: '',
    lastRaceRound: '',
    lastRaceCountry: '',
    lastCircuitId: '',
    raceCalendar: [],
    drivers: [],
    raceResults: [],
    qualifyingResults: [],
    // Phase 1 new
    pitStops: [],
    fastestLap: null,
    tyreStints: [],
    lapTimesData: [],
    raceControlMsgs: [],
    pointsTimeline: [],
    // Phase 2 new (v5)
    sprintResults: [],      // [{pos, code, name, team, time, points}]
    lastRaceQuali: [],      // [{pos, code, name, team, q1, q2, q3}] for last race
    weatherData: [],        // OpenF1 weather samples
    speedTrapData: [],      // [{driverNum, code, name, topSpeed}]
    sectorData: [],         // [{driverNum, code, name, s1, s2, s3}] - best sectors
    // v6 Bet Intelligence
    allQualiResults: [],    // [{round, raceName, driverCode, team, pos}] ALL rounds
    betAnalysisYear: null,  // Set when using prev year data as fallback
    lastCircuitId: '',      // circuitId of the last/next race
    lastRaceName: '',       // display name of the last/next race
    loading: true,
    errors: []
};

// ==========================================
// API FETCHING
// ==========================================

async function fetchJSON(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn(`Failed to fetch ${url}:`, err);
        return null;
    }
}

async function fetchAllData(year) {
    showLoadingState();
    state.year = year;
    state.errors = [];

    // Update all year-related labels dynamically
    const badge = document.querySelector('.season-badge');
    if (badge) badge.textContent = `SEASON ${year}`;

    const seasonLabel = document.getElementById('seasonLabel');
    if (seasonLabel) seasonLabel.textContent = `${year} Season`;

    const calendarTitle = document.getElementById('calendarTitle');
    if (calendarTitle) calendarTitle.textContent = `${year} Race Calendar`;

    // Fetch all endpoints in parallel
    const [standingsData, constructorData, lastRaceData, calendarData, driversData, resultsData, qualifyingData, sprintData, lastRaceQualiData] = await Promise.all([
        fetchJSON(`${API_BASE}/${year}/driverStandings.json`),
        fetchJSON(`${API_BASE}/${year}/constructorStandings.json`),
        fetchJSON(`${API_BASE}/${year}/last/results.json`),
        fetchJSON(`${API_BASE}/${year}.json`),
        fetchJSON(`${API_BASE}/${year}/drivers.json`),
        fetchJSON(`${API_BASE}/${year}/results.json?limit=500`),
        fetchJSON(`${API_BASE}/${year}/qualifying.json?limit=500`),
        fetchJSON(`${API_BASE}/${year}/last/sprint.json`),
        fetchJSON(`${API_BASE}/${year}/last/qualifying.json`)
    ]);

    // Parse driver standings
    if (standingsData?.MRData?.StandingsTable?.StandingsLists?.length > 0) {
        const list = standingsData.MRData.StandingsTable.StandingsLists[0];
        state.driverStandings = list.DriverStandings.map(ds => ({
            pos: parseInt(ds.position),
            code: ds.Driver.code || ds.Driver.familyName.substring(0, 3).toUpperCase(),
            name: `${ds.Driver.givenName} ${ds.Driver.familyName}`,
            team: ds.Constructors[0]?.name || 'Unknown',
            points: parseInt(ds.points),
            wins: parseInt(ds.wins),
            nationality: ds.Driver.nationality || '',
            dob: ds.Driver.dateOfBirth || ''
        }));
    } else {
        state.driverStandings = [];
        state.errors.push('Driver standings not available yet for this season.');
    }

    // Parse constructor standings
    if (constructorData?.MRData?.StandingsTable?.StandingsLists?.length > 0) {
        const list = constructorData.MRData.StandingsTable.StandingsLists[0];
        state.constructorStandings = list.ConstructorStandings.map(cs => ({
            pos: parseInt(cs.position),
            name: cs.Constructor.name,
            nationality: cs.Constructor.nationality || '',
            points: parseInt(cs.points),
            wins: parseInt(cs.wins)
        }));
    } else {
        state.constructorStandings = [];
        state.errors.push('Constructor standings not available yet.');
    }

    // Parse last race results
    if (lastRaceData?.MRData?.RaceTable?.Races?.length > 0) {
        const race = lastRaceData.MRData.RaceTable.Races[0];
        state.lastRaceName = race.raceName;
        state.lastRaceCircuit = race.Circuit.circuitName;
        state.lastCircuitId = race.Circuit.circuitId;
        state.lastRaceRound = race.round;
        state.lastRaceCountry = race.Circuit.Location.country;
        state.lastRaceResults = race.Results.slice(0, 10).map(r => ({
            pos: parseInt(r.position),
            code: r.Driver.code || r.Driver.familyName.substring(0, 3).toUpperCase(),
            name: `${r.Driver.givenName} ${r.Driver.familyName}`,
            team: r.Constructor.name,
            time: r.Time?.time || r.status || 'N/A',
            points: parseInt(r.points)
        }));
    } else if (resultsData?.MRData?.RaceTable?.Races?.length > 0) {
        // Fallback: use the very last race in results list
        const races = resultsData.MRData.RaceTable.Races;
        const race = races[races.length - 1];
        state.lastRaceName = race.raceName;
        state.lastRaceCircuit = race.Circuit.circuitName;
        state.lastCircuitId = race.Circuit.circuitId;
        state.lastRaceRound = race.round;
        state.lastRaceCountry = race.Circuit.Location.country;
        state.lastRaceResults = race.Results.slice(0, 10).map(r => ({
            pos: parseInt(r.position),
            code: r.Driver.code || r.Driver.familyName.substring(0, 3).toUpperCase(),
            name: `${r.Driver.givenName} ${r.Driver.familyName}`,
            team: r.Constructor.name,
            time: r.Time?.time || r.status || 'N/A',
            points: parseInt(r.points)
        }));
    } else {
        state.lastRaceResults = [];
        state.errors.push('No race results available yet.');
    }

    // Parse calendar
    if (calendarData?.MRData?.RaceTable?.Races?.length > 0) {
        state.raceCalendar = calendarData.MRData.RaceTable.Races.map(r => ({
            round: parseInt(r.round),
            name: r.raceName,
            circuit: r.Circuit.circuitName,
            locality: r.Circuit.Location.locality,
            country: r.Circuit.Location.country,
            date: r.date,
            time: r.time || '',
            sprint: !!(r.Sprint || r.SprintQualifying),
            hasResults: false
        }));
    } else {
        state.raceCalendar = [];
        state.errors.push('Race calendar not available yet.');
    }

    // Parse drivers
    if (driversData?.MRData?.DriverTable?.Drivers?.length > 0) {
        state.drivers = driversData.MRData.DriverTable.Drivers.map(d => ({
            id: d.driverId,
            code: d.code || d.familyName.substring(0, 3).toUpperCase(),
            name: `${d.givenName} ${d.familyName}`,
            number: d.permanentNumber || '',
            nationality: d.nationality || '',
            dob: d.dateOfBirth || ''
        }));
    }

    // Parse full season race results
    state.raceResults = [];
    const completedRounds = new Set();
    if (resultsData?.MRData?.RaceTable?.Races?.length > 0) {
        resultsData.MRData.RaceTable.Races.forEach(race => {
            const round = parseInt(race.round);
            completedRounds.add(round);
            (race.Results || []).forEach(r => {
                state.raceResults.push({
                    round,
                    raceName: race.raceName,
                    circuitId: race.Circuit.circuitId,
                    driverCode: r.Driver.code || r.Driver.familyName.substring(0, 3).toUpperCase(),
                    driverName: `${r.Driver.givenName} ${r.Driver.familyName}`,
                    team: r.Constructor.name,
                    pos: parseInt(r.position),
                    grid: parseInt(r.grid),
                    points: parseFloat(r.points),
                    dnf: r.status !== 'Finished' && !r.status.startsWith('+'),
                    status: r.status
                });
            });
        });
    }

    // Mark calendar races as completed if results exist
    state.raceCalendar.forEach(r => {
        if (completedRounds.has(r.round)) r.hasResults = true;
    });

    // Parse full season qualifying results
    state.qualifyingResults = [];
    if (qualifyingData?.MRData?.RaceTable?.Races?.length > 0) {
        qualifyingData.MRData.RaceTable.Races.forEach(race => {
            const round = parseInt(race.round);
            (race.QualifyingResults || []).forEach(q => {
                state.qualifyingResults.push({
                    round,
                    driverCode: q.Driver.code || q.Driver.familyName.substring(0, 3).toUpperCase(),
                    driverName: `${q.Driver.givenName} ${q.Driver.familyName}`,
                    team: q.Constructor.name,
                    pos: parseInt(q.position)
                });
            });
        });
    }

    // NEW: Parse pit stops for last race
    state.pitStops = [];
    state.fastestLap = null;
    if (lastRaceData?.MRData?.RaceTable?.Races?.length > 0) {
        const race = lastRaceData.MRData.RaceTable.Races[0];
        (race.Results || []).forEach(r => {
            if (r.FastestLap && r.FastestLap.rank === '1') {
                state.fastestLap = {
                    driverCode: r.Driver.code || r.Driver.familyName.substring(0, 3).toUpperCase(),
                    driverName: `${r.Driver.givenName} ${r.Driver.familyName}`,
                    team: r.Constructor.name,
                    time: r.FastestLap.Time?.time || '',
                    lap: r.FastestLap.lap || ''
                };
            }
        });
    }
    const pitData = await fetchJSON(`${API_BASE}/${state.year}/${state.lastRaceRound}/pitstops.json?limit=200`);
    if (pitData?.MRData?.RaceTable?.Races?.length > 0) {
        const pits = pitData.MRData.RaceTable.Races[0].PitStops || [];
        // Group by driver
        const driverPits = {};
        pits.forEach(p => {
            const key = p.driverId;
            if (!driverPits[key]) driverPits[key] = { driverId: p.driverId, stops: [] };
            driverPits[key].stops.push({ lap: parseInt(p.lap), duration: parseFloat(p.duration) });
        });
        // Match with lastRaceResults for names/teams
        state.pitStops = Object.values(driverPits).map(d => {
            const result = state.lastRaceResults.find(r => r.code && d.driverId.includes(r.code.toLowerCase())) ||
                state.driverStandings.find(s => s.name.toLowerCase().split(' ').some(part => d.driverId.includes(part)));
            const bestDuration = Math.min(...d.stops.map(s => s.duration));
            return {
                driverId: d.driverId,
                code: result?.code || d.driverId.substring(0, 3).toUpperCase(),
                name: result?.name || d.driverId,
                team: result?.team || '',
                stopCount: d.stops.length,
                bestDuration,
                stops: d.stops
            };
        }).sort((a, b) => a.bestDuration - b.bestDuration);
    }

    // NEW: Build points timeline from raceResults
    state.pointsTimeline = [];
    if (state.raceResults.length > 0) {
        const rounds = [...new Set(state.raceResults.map(r => r.round))].sort((a, b) => a - b);
        const topDriverCodes = state.driverStandings.slice(0, 6).map(d => d.code);
        const cumPoints = {};
        topDriverCodes.forEach(code => { cumPoints[code] = 0; });
        rounds.forEach(round => {
            const roundResults = state.raceResults.filter(r => r.round === round);
            topDriverCodes.forEach(code => {
                const entry = roundResults.find(r => r.driverCode === code);
                if (entry) cumPoints[code] = (cumPoints[code] || 0) + entry.points;
                state.pointsTimeline.push({ round, driverCode: code, points: cumPoints[code] || 0 });
            });
        });
    }

    // NEW v6: Parse ALL qualifying rounds (for H2H / delta analysis)
    state.allQualiResults = [];
    if (qualifyingData?.MRData?.RaceTable?.Races) {
        qualifyingData.MRData.RaceTable.Races.forEach(race => {
            const round = parseInt(race.round);
            (race.QualifyingResults || []).forEach(q => {
                state.allQualiResults.push({
                    round,
                    raceName: race.raceName,
                    driverCode: q.Driver.code || q.Driver.familyName.substring(0, 3).toUpperCase(),
                    team: q.Constructor.name,
                    pos: parseInt(q.position),
                    q3: q.Q3 || '', q2: q.Q2 || '', q1: q.Q1 || ''
                });
            });
        });
    }

    // Store circuitId from last race for circuit records lookup
    if (lastRaceData?.MRData?.RaceTable?.Races?.length > 0) {
        state.lastCircuitId = lastRaceData.MRData.RaceTable.Races[0].Circuit?.circuitId || '';
    }

    // NEW v5: Parse sprint results
    state.sprintResults = [];
    if (sprintData?.MRData?.RaceTable?.Races?.length > 0) {
        const race = sprintData.MRData.RaceTable.Races[0];
        state.sprintResults = (race.SprintResults || []).slice(0, 10).map(r => ({
            pos: parseInt(r.position),
            code: r.Driver.code || r.Driver.familyName.substring(0, 3).toUpperCase(),
            name: `${r.Driver.givenName} ${r.Driver.familyName}`,
            team: r.Constructor.name,
            time: r.Time?.time || r.status || 'N/A',
            points: parseInt(r.points)
        }));
        if (state.sprintResults.length > 0) {
            const card = document.getElementById('sprintCard');
            if (card) card.style.display = '';
        }
    }

    // NEW v5: Parse last-race qualifying (with actual Q times)
    state.lastRaceQuali = [];
    if (lastRaceQualiData?.MRData?.RaceTable?.Races?.length > 0) {
        const race = lastRaceQualiData.MRData.RaceTable.Races[0];
        state.lastRaceQuali = (race.QualifyingResults || []).map(q => ({
            pos: parseInt(q.position),
            code: q.Driver.code || q.Driver.familyName.substring(0, 3).toUpperCase(),
            name: `${q.Driver.givenName} ${q.Driver.familyName}`,
            team: q.Constructor.name,
            q1: q.Q1 || '',
            q2: q.Q2 || '',
            q3: q.Q3 || ''
        }));
    }

    state.loading = false;
    renderAll();
    // Kick off OpenF1 async (non-blocking)
    fetchOpenF1Data();

    // v6 BET EDGE: If current season has no race results yet (pre-season),
    // load previous year's data as baseline for analysis features
    if (state.raceResults.length === 0) {
        const prevYear = state.year - 1;
        state.betAnalysisYear = prevYear;

        // Jolpica caps at 100 results/page — fetch pages sequentially (with delay) to avoid 429s
        const offsets = [0, 100, 200, 300, 400];
        const delay = ms => new Promise(r => setTimeout(r, ms));

        const resultsPages = [];
        for (const o of offsets) {
            resultsPages.push(await fetchJSON(`${API_BASE}/${prevYear}/results.json?limit=100&offset=${o}`));
            if (o < 400) await delay(150);
        }

        const qualiPages = [];
        for (const o of offsets) {
            qualiPages.push(await fetchJSON(`${API_BASE}/${prevYear}/qualifying.json?limit=100&offset=${o}`));
            if (o < 400) await delay(150);
        }

        const prevStandingsData = await fetchJSON(`${API_BASE}/${prevYear}/driverStandings.json`);

        // Merge all results pages into one Races array
        const allRaces = {};
        resultsPages.forEach(page => {
            (page?.MRData?.RaceTable?.Races || []).forEach(race => {
                const key = race.round;
                if (!allRaces[key]) allRaces[key] = race;
                else allRaces[key].Results = (allRaces[key].Results || []).concat(race.Results || []);
            });
        });

        const mergedRaces = Object.values(allRaces).sort((a, b) => parseInt(a.round) - parseInt(b.round));

        if (mergedRaces.length > 0) {
            // Capture last circuit from prev year
            const lastPrevRace = mergedRaces[mergedRaces.length - 1];
            if (!state.lastCircuitId && lastPrevRace?.Circuit?.circuitId) {
                state.lastCircuitId = lastPrevRace.Circuit.circuitId;
                state.lastRaceName = lastPrevRace.raceName;
            }
            mergedRaces.forEach(race => {
                const round = parseInt(race.round);
                (race.Results || []).forEach(r => {
                    state.raceResults.push({
                        round,
                        raceName: race.raceName,
                        circuitId: race.Circuit?.circuitId || '',
                        driverCode: r.Driver.code || r.Driver.familyName.substring(0, 3).toUpperCase(),
                        driverName: `${r.Driver.givenName} ${r.Driver.familyName}`,
                        team: r.Constructor.name,
                        pos: parseInt(r.position),
                        grid: parseInt(r.grid),
                        points: parseFloat(r.points),
                        dnf: r.status !== 'Finished' && !r.status.startsWith('+'),
                        status: r.status
                    });
                });
            });
        }

        // Merge all qualifying pages
        const allQualiRaces = {};
        qualiPages.forEach(page => {
            (page?.MRData?.RaceTable?.Races || []).forEach(race => {
                const key = race.round;
                if (!allQualiRaces[key]) allQualiRaces[key] = race;
                else allQualiRaces[key].QualifyingResults = (allQualiRaces[key].QualifyingResults || []).concat(race.QualifyingResults || []);
            });
        });
        Object.values(allQualiRaces).forEach(race => {
            const round = parseInt(race.round);
            (race.QualifyingResults || []).forEach(q => {
                state.allQualiResults.push({
                    round,
                    raceName: race.raceName,
                    driverCode: q.Driver.code || q.Driver.familyName.substring(0, 3).toUpperCase(),
                    team: q.Constructor.name,
                    pos: parseInt(q.position),
                    q3: q.Q3 || '', q2: q.Q2 || '', q1: q.Q1 || ''
                });
            });
        });

        // Prev year driver standings fallback
        if (state.driverStandings.length === 0 && prevStandingsData?.MRData?.StandingsTable?.StandingsLists?.length > 0) {
            const list = prevStandingsData.MRData.StandingsTable.StandingsLists[0];
            state.driverStandings = list.DriverStandings.map(ds => ({
                pos: parseInt(ds.position),
                code: ds.Driver.code || ds.Driver.familyName.substring(0, 3).toUpperCase(),
                name: `${ds.Driver.givenName} ${ds.Driver.familyName}`,
                team: ds.Constructors[0]?.name || 'Unknown',
                points: parseInt(ds.points),
                wins: parseInt(ds.wins),
                nationality: ds.Driver.nationality || '',
                dob: ds.Driver.dateOfBirth || ''
            }));
        }

        // v6: Prev year constructor standings fallback
        const prevConstructorData = await fetchJSON(`${API_BASE}/${prevYear}/constructorStandings.json`);
        if (state.constructorStandings.length === 0 && prevConstructorData?.MRData?.StandingsTable?.StandingsLists?.length > 0) {
            const list = prevConstructorData.MRData.StandingsTable.StandingsLists[0];
            state.constructorStandings = list.ConstructorStandings.map(cs => ({
                pos: parseInt(cs.position),
                name: cs.Constructor.name,
                nationality: cs.Constructor.nationality || '',
                points: parseInt(cs.points),
                wins: parseInt(cs.wins)
            }));
        }

        // v6: Prev year sprint results fallback
        const prevSprintData = await fetchJSON(`${API_BASE}/${prevYear}/last/sprint.json`);
        if (state.sprintResults.length === 0 && prevSprintData?.MRData?.RaceTable?.Races?.length > 0) {
            const race = prevSprintData.MRData.RaceTable.Races[0];
            state.sprintResults = (race.SprintResults || []).slice(0, 10).map(r => ({
                pos: parseInt(r.position),
                code: r.Driver.code || r.Driver.familyName.substring(0, 3).toUpperCase(),
                name: `${r.Driver.givenName} ${r.Driver.familyName}`,
                team: r.Constructor.name,
                time: r.Time?.time || r.status || 'N/A',
                points: parseInt(r.points)
            }));
        }

        // v6: Prev year last race results fallback (for Pit Stop Analysis and others)
        const prevLastRaceData = await fetchJSON(`${API_BASE}/${prevYear}/last/results.json`);
        if (state.lastRaceResults.length === 0 && prevLastRaceData?.MRData?.RaceTable?.Races?.length > 0) {
            const race = prevLastRaceData.MRData.RaceTable.Races[0];
            state.lastRaceName = race.raceName;
            state.lastRaceCircuit = race.Circuit.circuitName;
            state.lastCircuitId = race.Circuit.circuitId;
            state.lastRaceRound = race.round;
            state.lastRaceCountry = race.Circuit.Location.country;
            state.lastRaceResults = race.Results.slice(0, 10).map(r => ({
                pos: parseInt(r.position),
                code: r.Driver.code || r.Driver.familyName.substring(0, 3).toUpperCase(),
                name: `${r.Driver.givenName} ${r.Driver.familyName}`,
                team: r.Constructor.name,
                time: r.Time?.time || r.status || 'N/A',
                points: parseInt(r.points)
            }));
        }

        console.log(`[BET EDGE] Loaded ${state.raceResults.length} race results, ${state.allQualiResults.length} quali results from ${prevYear}`);

        // Re-render EVERYTHING now that fallback state is ready
        state.loading = false;
        renderAll();
    }
    
    state.loading = false;
    renderAll();
}

// Always load current year only — no fallback to previous seasons
async function initData() {
    await fetchAllData(CURRENT_YEAR);
}

// ==========================================
// LOADING STATE
// ==========================================

function showLoadingState() {
    const sections = ['battleContainer', 'lastRaceInfo', 'topDriversGrid',
        'constructorBars', 'nextRaceContent'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = `
                <div style="text-align:center;padding:40px;color:var(--text-muted);">
                    <div class="loading-shimmer" style="width:200px;height:20px;border-radius:8px;margin:0 auto 12px;"></div>
                    <div style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;letter-spacing:1px;">
                        FETCHING F1 DATA...
                    </div>
                </div>
            `;
        }
    });
}

function showEmptyState(container, message) {
    container.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--text-muted);">
            <div style="font-size:2rem;margin-bottom:12px;">🏁</div>
            <div style="font-size:0.85rem;font-weight:600;margin-bottom:4px;">No Data Available</div>
            <div style="font-size:0.75rem;">${message}</div>
        </div>
    `;
}

// ==========================================
// APP INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initYearSelector();
    initData();
});

function initYearSelector() {
    // Add year selector to the header status area
    const headerStatus = document.querySelector('.header-status');
    if (!headerStatus) return;

    const yearSelect = document.createElement('select');
    yearSelect.id = 'yearSelector';
    yearSelect.style.cssText = `
        font-family: 'Orbitron', sans-serif;
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 1px;
        padding: 6px 12px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-medium);
        border-radius: var(--radius-full);
        color: var(--text-primary);
        cursor: pointer;
        outline: none;
    `;

    // Add years from 2018 to current+1
    for (let y = CURRENT_YEAR; y >= 2018; y--) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        if (y === CURRENT_YEAR) option.selected = true;
        yearSelect.appendChild(option);
    }

    yearSelect.addEventListener('change', (e) => {
        const year = parseInt(e.target.value);
        fetchAllData(year);
    });

    headerStatus.insertBefore(yearSelect, headerStatus.firstChild);
}

// ==========================================
// RENDER ALL
// ==========================================

function renderAll() {
    renderOverview();
    renderStandings();
    renderCalendar();
    renderPredictions();
    renderAnalytics();
    renderPitStopAnalysis();
    renderPointsTimeline();
    renderSprintResults();
    renderCircuitRecords();
    renderNationalityGrid();
    renderQualiGap();
    renderStrategyLab();
    renderUndercutAnalysis();
    // Bet Intelligence
    renderTeammateBattle();
    renderDriverForm();
    renderDNFReliability();
    renderPodiumConversion();
    renderCircuitDNA();
    renderQualiToRaceConversion();
    renderChampionshipPermutations();
    renderCircuitHistory();
    animateCounters();
}

// ==========================================
// NAVIGATION
// ==========================================

function initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.getElementById(`section-${section}`).classList.add('active');
            if (section === 'overview') animateCounters();
            if (section === 'standings') setTimeout(animateProgressBars, 100);
            if (section === 'analytics') animatePieCharts();
        });
    });

    const toggleBtns = document.querySelectorAll('.toggle-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.standings-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(`${btn.dataset.tab}Panel`).classList.add('active');
            setTimeout(animateProgressBars, 100);
        });
    });
}

// ==========================================
// COUNTER ANIMATION
// ==========================================

function animateCounters() {
    document.querySelectorAll('.hero-stat-value[data-count]').forEach(el => {
        const target = parseInt(el.dataset.count);
        let current = 0;
        const increment = Math.max(target / 40, 1);
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            el.textContent = Math.round(current);
        }, 30);
    });
}

// ==========================================
// OVERVIEW SECTION
// ==========================================

function renderOverview() {
    // Update hero stats
    const totalRaces = state.raceCalendar.length;
    
    // Drivers: Standings first, then drivers list, then results
    const driverCodes = new Set([
        ...state.driverStandings.map(d => d.code),
        ...state.drivers.map(d => d.code),
        ...state.raceResults.map(r => r.driverCode)
    ]);
    const uniqueDrivers = driverCodes.size;

    // Teams: Standings first, then results
    const teamNames = new Set([
        ...state.constructorStandings.map(t => t.name),
        ...state.raceResults.map(r => r.team)
    ]);
    const totalTeams = teamNames.size;

    const sprintRaces = state.raceCalendar.filter(r => r.sprint).length;

    const heroValues = document.querySelectorAll('.hero-stat-value[data-count]');
    if (heroValues.length >= 4) {
        heroValues[0].dataset.count = totalRaces;
        heroValues[1].dataset.count = uniqueDrivers;
        heroValues[2].dataset.count = totalTeams;
        heroValues[3].dataset.count = sprintRaces;
        animateCounters();
    }

    renderChampionshipBattle();
    renderLastRace();
    renderTopDrivers();
    renderConstructorBars();
    renderSeasonProgress();
}

function renderChampionshipBattle() {
    const container = document.getElementById('battleContainer');

    if (state.driverStandings.length === 0) {
        showEmptyState(container, 'Season standings will appear once racing begins.');
        return;
    }

    const top10 = state.driverStandings.slice(0, 10);
    let html = '';

    top10.forEach((driver, i) => {
        const teamColor = getTeamColor(driver.team);
        html += `
            <div class="battle-driver">
                <div class="team-color-bar" style="background: ${teamColor}"></div>
                <div class="battle-position pos-${i + 1}">${driver.pos}</div>
                <div class="battle-info">
                    <div class="battle-name">${driver.name}</div>
                    <div class="battle-team" style="color: ${teamColor}">${driver.team}</div>
                </div>
                <div class="battle-stats">
                    <div>
                        <div class="battle-points">${driver.points}</div>
                        <div class="battle-points-label">PTS</div>
                    </div>
                    <div class="battle-wins">🏆 ${driver.wins} wins</div>
                </div>
            </div>
        `;
        if (i === 0 && top10.length > 1) {
            const gap = top10[0].points - top10[1].points;
            html += `
                <div class="battle-gap">
                    <div class="battle-gap-value">${gap > 0 ? '+' : ''}${gap} pts</div>
                    <div class="battle-gap-label">GAP P1 → P2</div>
                </div>
            `;
        }
    });

    container.innerHTML = html;
}

function renderLastRace() {
    const container = document.getElementById('lastRaceInfo');

    if (state.lastRaceResults.length === 0) {
        showEmptyState(container, 'No race results yet this season.');
        return;
    }

    const flag = COUNTRY_FLAGS[state.lastRaceCountry] || '🏁';

    let html = `
        <div class="race-header">
            <div class="calendar-flag">${flag}</div>
            <div class="race-name">${state.lastRaceName}</div>
            <div class="race-circuit">${state.lastRaceCircuit} • Round ${state.lastRaceRound}</div>
        </div>
        <div class="race-results-list">
    `;

    state.lastRaceResults.forEach(result => {
        const teamColor = getTeamColor(result.team);
        const posClass = result.pos <= 3 ? `p${result.pos}` : '';
        html += `
            <div class="race-result-item">
                <div class="team-color-bar" style="background: ${teamColor}; height: 24px;"></div>
                <div class="race-result-pos ${posClass}">${result.pos}</div>
                <div style="flex:1">
                    <div class="race-result-driver">${result.name}</div>
                    <div class="race-result-team" style="color: ${teamColor}">${result.team}</div>
                </div>
                <div class="race-result-time">${result.time}</div>
                <div class="race-result-points">${result.points > 0 ? '+' + result.points : ''}</div>
            </div>
        `;
    });

    html += `</div>`;

    // Fastest Lap banner (F3)
    if (state.fastestLap) {
        const fl = state.fastestLap;
        const color = getTeamColor(fl.team);
        html += `<div class="fastest-lap-banner">
            <span>⚡</span>
            <span>Fastest Lap:</span>
            <strong onclick="openDriverModal('${fl.driverCode}')" class="driver-clickable" style="color:${color}">${fl.driverName}</strong>
            <span class="fl-time">${fl.time}</span>
            <span style="color:var(--text-muted);font-size:0.72rem;">Lap ${fl.lap}</span>
        </div>`;
    }

    container.innerHTML = html;
}

function renderTopDrivers() {
    const container = document.getElementById('topDriversGrid');

    if (state.driverStandings.length === 0) {
        showEmptyState(container, 'Standings data not available yet.');
        return;
    }

    const top5 = state.driverStandings.slice(0, 5);
    let html = '';

    top5.forEach(driver => {
        const teamColor = getTeamColor(driver.team);
        html += `
            <div class="top-driver-card">
                <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${teamColor};"></div>
                <div class="top-driver-pos">${driver.pos}</div>
                <div class="top-driver-code" style="color: ${teamColor}">${driver.code}</div>
                <div class="top-driver-name driver-clickable" onclick="openDriverModal('${driver.code}')">${driver.name}</div>
                <div class="top-driver-team">${driver.team}</div>
                <div class="top-driver-points">${driver.points}</div>
                <div class="top-driver-points-label">POINTS</div>
                ${driver.wins > 0 ? `<div class="top-driver-wins">🏆 ${driver.wins} wins</div>` : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderConstructorBars() {
    const container = document.getElementById('constructorBars');

    if (state.constructorStandings.length === 0) {
        showEmptyState(container, 'Constructor data not available yet.');
        return;
    }

    const maxPoints = state.constructorStandings[0].points || 1;
    let html = '';

    state.constructorStandings.forEach(team => {
        const teamColor = getTeamColor(team.name);
        const width = (team.points / maxPoints * 100);
        html += `
            <div class="constructor-bar-item">
                <div class="constructor-bar-name" style="color: ${teamColor}">${team.name}</div>
                <div class="constructor-bar-track">
                    <div class="constructor-bar-fill" style="width: 0%; background: ${teamColor};" data-width="${width}">
                        <span class="constructor-bar-points">${team.points}</span>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    setTimeout(() => {
        container.querySelectorAll('.constructor-bar-fill').forEach(bar => {
            bar.style.width = bar.dataset.width + '%';
        });
    }, 200);
}

function renderSeasonProgress() {
    const container = document.getElementById('nextRaceContent');
    const now = new Date();
    
    // A race is completed if it has results OR if its date is in the past
    const isCompleted = r => r.hasResults || new Date(r.date + 'T23:59:59') < now;
    
    const completedRaces = state.raceCalendar.filter(isCompleted).length;
    const totalRaces = state.raceCalendar.length;
    const progress = totalRaces > 0 ? (completedRaces / totalRaces * 100) : 0;

    // Find upcoming races (those without results AND in the future/today)
    const upcomingRaces = state.raceCalendar.filter(r => !r.hasResults && new Date(r.date + 'T23:59:59') >= now);
    const pastRaces = state.raceCalendar.filter(isCompleted);

    let html = `
        <div>
            <div class="season-progress-bar">
                <div class="season-progress-fill" style="width: 0%" data-width="${progress}"></div>
            </div>
            <div class="season-progress-text">${completedRaces} of ${totalRaces} races completed (${Math.round(progress)}%)</div>
        </div>
    `;

    if (upcomingRaces.length > 0) {
        html += `<div class="upcoming-races">
            <div style="font-family:'Orbitron',sans-serif;font-size:0.7rem;font-weight:700;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px;">UPCOMING RACES</div>`;

        upcomingRaces.slice(0, 5).forEach((race, i) => {
            const flag = COUNTRY_FLAGS[race.country] || '🏁';
            const raceDate = new Date(race.date);
            const dateStr = raceDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
            const daysUntil = Math.ceil((raceDate - now) / (1000 * 60 * 60 * 24));

            html += `
                <div class="upcoming-race-item ${i === 0 ? 'next-up' : ''}">
                    <div class="upcoming-race-round">R${String(race.round).padStart(2, '0')}</div>
                    <div class="upcoming-race-flag">${flag}</div>
                    <div class="upcoming-race-info">
                        <div class="upcoming-race-name">${race.name}</div>
                        <div class="upcoming-race-date">${race.locality || race.circuit} • ${dateStr}${i === 0 && daysUntil > 0 ? ` • in ${daysUntil} days` : i === 0 && daysUntil <= 0 ? ' • RACE WEEKEND' : ''}</div>
                    </div>
                    ${race.sprint ? '<span class="upcoming-race-badge badge-sprint">SPRINT</span>' : ''}
                    ${i === 0 ? '<span class="upcoming-race-badge" style="color:var(--f1-red);background:rgba(225,6,0,0.1);border:1px solid rgba(225,6,0,0.2);">NEXT UP</span>' : ''}
                </div>
            `;
        });
        html += '</div>';
    } else if (pastRaces.length > 0) {
        html += `<div class="upcoming-races">
            <div style="font-family:'Orbitron',sans-serif;font-size:0.7rem;font-weight:700;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px;">SEASON COMPLETE ✅</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);padding:12px;">
                All ${totalRaces} races have been completed for the ${state.year} season!
            </div>
        </div>`;
    } else {
        html += `<div class="upcoming-races">
            <div style="font-family:'Orbitron',sans-serif;font-size:0.7rem;font-weight:700;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px;">SEASON NOT STARTED</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);padding:12px;">
                The ${state.year} race calendar will appear once it's published by the FIA.
            </div>
        </div>`;
    }

    container.innerHTML = html;
    setTimeout(() => {
        const fill = container.querySelector('.season-progress-fill');
        if (fill) fill.style.width = fill.dataset.width + '%';
    }, 300);
}

// ==========================================
// STANDINGS SECTION
// ==========================================

function renderStandings() {
    renderDriversTable();
    renderConstructorsTable();
}

function renderDriversTable() {
    const tbody = document.getElementById('driversTableBody');
    if (state.driverStandings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No standings data available yet. Check back after the first race!</td></tr>';
        return;
    }

    const maxPoints = state.driverStandings[0].points || 1;
    let html = '';

    state.driverStandings.forEach(driver => {
        const teamColor = getTeamColor(driver.team);
        const posClass = driver.pos === 1 ? 'gold' : driver.pos === 2 ? 'silver' : driver.pos === 3 ? 'bronze' : '';
        const progressWidth = (driver.points / maxPoints * 100);

        html += `
            <tr>
                <td class="pos-cell ${posClass}">${driver.pos}</td>
                <td>
                    <div class="driver-cell">
                        <span class="driver-code" style="border: 1px solid ${teamColor}; color: ${teamColor}">${driver.code}</span>
                        <span class="driver-fullname">${driver.name}</span>
                    </div>
                </td>
                <td>
                    <div class="team-cell">
                        <span class="team-dot" style="background: ${teamColor}"></span>
                        <span>${driver.team}</span>
                    </div>
                </td>
                <td class="points-cell">${driver.points}</td>
                <td class="wins-cell">${driver.wins > 0 ? '🏆 ' + driver.wins : '-'}</td>
                <td>
                    <div class="progress-bar-mini">
                        <div class="progress-bar-mini-fill" style="width: 0%; background: ${teamColor}" data-width="${progressWidth}"></div>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    setTimeout(animateProgressBars, 300);
}

function renderConstructorsTable() {
    const tbody = document.getElementById('constructorsTableBody');
    if (state.constructorStandings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No constructor data available yet.</td></tr>';
        return;
    }

    const maxPoints = state.constructorStandings[0].points || 1;
    let html = '';

    state.constructorStandings.forEach(team => {
        const teamColor = getTeamColor(team.name);
        const posClass = team.pos === 1 ? 'gold' : team.pos === 2 ? 'silver' : team.pos === 3 ? 'bronze' : '';
        const progressWidth = (team.points / maxPoints * 100);

        html += `
            <tr>
                <td class="pos-cell ${posClass}">${team.pos}</td>
                <td>
                    <div class="team-cell">
                        <span class="team-dot" style="background: ${teamColor}"></span>
                        <span style="font-weight:700">${team.name}</span>
                    </div>
                </td>
                <td>${team.nationality}</td>
                <td class="points-cell">${team.points}</td>
                <td class="wins-cell">${team.wins > 0 ? '🏆 ' + team.wins : '-'}</td>
                <td>
                    <div class="progress-bar-mini">
                        <div class="progress-bar-mini-fill" style="width: 0%; background: ${teamColor}" data-width="${progressWidth}"></div>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function animateProgressBars() {
    document.querySelectorAll('.progress-bar-mini-fill').forEach(bar => {
        bar.style.width = bar.dataset.width + '%';
    });
}

// ==========================================
// CALENDAR SECTION
// ==========================================

function renderCalendar() {
    const container = document.getElementById('calendarGrid');

    if (state.raceCalendar.length === 0) {
        showEmptyState(container, `The ${state.year} race calendar is not available yet.`);
        return;
    }

    const now = new Date();
    let html = '';

    state.raceCalendar.forEach(race => {
        const flag = COUNTRY_FLAGS[race.country] || '🏁';
        const raceDate = new Date(race.date);
        const isCompleted = raceDate < now;
        const dateStr = raceDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

        let statusClass = isCompleted ? 'completed' : 'upcoming';
        if (race.sprint && !isCompleted) statusClass = 'sprint-weekend';

        html += `
            <div class="calendar-race-card ${statusClass}">
                <div class="calendar-round">ROUND ${String(race.round).padStart(2, '0')}</div>
                <div class="calendar-flag">${flag}</div>
                <div class="calendar-race-name">${race.name}</div>
                <div class="calendar-circuit">${race.locality || race.circuit}</div>
                <div class="calendar-date">${dateStr}</div>
                ${race.sprint ? '<div class="calendar-sprint-tag">⚡ SPRINT WEEKEND</div>' : ''}
                ${isCompleted ? '<div class="calendar-winner" style="color:var(--f1-green);">✅ Completed</div>' : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}

// ==========================================
// PREDICTIONS SECTION
// ==========================================

function renderPredictions() {
    renderChampPrediction();
    renderTeamTrends();
    renderH2H();
    renderInsights();
    renderNextRacePrediction();
}

// ---- HELPER: stats per driver from raceResults ----
function buildDriverStats() {
    const map = {};
    const rounds = [...new Set(state.raceResults.map(r => r.round))].sort((a, b) => a - b);
    const totalRounds = rounds.length;

    state.raceResults.forEach(r => {
        if (!map[r.driverCode]) map[r.driverCode] = { code: r.driverCode, name: r.driverName, team: r.team, positions: [], points: [], dnfs: 0, podiums: 0, wins: 0, pointsByRound: {} };
        const d = map[r.driverCode];
        d.positions.push(r.pos);
        d.points.push(r.points);
        d.pointsByRound[r.round] = r.points;
        if (r.dnf) d.dnfs++;
        if (r.pos <= 3) d.podiums++;
        if (r.pos === 1) d.wins++;
    });

    // Qualifying averages
    state.qualifyingResults.forEach(q => {
        if (map[q.driverCode]) {
            if (!map[q.driverCode].qualifyingPositions) map[q.driverCode].qualifyingPositions = [];
            map[q.driverCode].qualifyingPositions.push(q.pos);
        }
    });

    Object.values(map).forEach(d => {
        d.racesCompleted = d.positions.length;
        d.avgPos = d.racesCompleted > 0 ? d.positions.reduce((a, b) => a + b, 0) / d.racesCompleted : 20;
        d.avgQuali = d.qualifyingPositions?.length > 0
            ? d.qualifyingPositions.reduce((a, b) => a + b, 0) / d.qualifyingPositions.length
            : 20;

        // Recent form: last 5 races avg finish position (lower = better)
        const last5 = d.positions.slice(-5);
        d.recentAvgPos = last5.length > 0 ? last5.reduce((a, b) => a + b, 0) / last5.length : 20;

        // Momentum: points in last half vs first half
        const mid = Math.floor(totalRounds / 2);
        const firstHalfRounds = rounds.slice(0, mid);
        const secondHalfRounds = rounds.slice(mid);
        d.firstHalfPts = firstHalfRounds.reduce((s, rnd) => s + (d.pointsByRound[rnd] || 0), 0);
        d.secondHalfPts = secondHalfRounds.reduce((s, rnd) => s + (d.pointsByRound[rnd] || 0), 0);
        d.ptsPerRace = d.racesCompleted > 0 ? d.points.reduce((a, b) => a + b, 0) / d.racesCompleted : 0;
    });

    return map;
}

function renderChampPrediction() {
    const container = document.getElementById('champPredictionContent');
    if (state.driverStandings.length === 0) {
        showEmptyState(container, 'Predictions will be generated once there is enough data.');
        return;
    }

    const nextYear = state.year + 1;
    const top6 = state.driverStandings.slice(0, 6);
    const driverStats = buildDriverStats();
    const totalPoints = top6.reduce((s, d) => s + d.points, 0) || 1;
    const totalRaces = state.raceResults.length > 0
        ? Math.max(...state.raceResults.map(r => r.round))
        : 1;

    // 5-factor scoring for each candidate
    const candidates = top6.map((driver, i) => {
        const stats = driverStats[driver.code] || {};
        const racesCompleted = stats.racesCompleted || 1;

        // Factor 1: Season points share (30%)
        const f1 = (driver.points / totalPoints) * 0.30;

        // Factor 2: Win rate — wins / races (20%)
        const f2 = (driver.wins / racesCompleted) * 0.20;

        // Factor 3: Podium consistency — podiums / races (20%)
        const podiums = stats.podiums || 0;
        const f3 = (podiums / racesCompleted) * 0.20;

        // Factor 4: Recent form last 5 races — lower avg pos = better, normalized to 20 (20%)
        const recentAvgPos = stats.recentAvgPos || 20;
        const f4 = ((20 - recentAvgPos) / 19) * 0.20;

        // Factor 5: Qualifying pace — lower avg grid = better, normalized (10%)
        const avgQuali = stats.avgQuali || 10;
        const f5 = ((20 - avgQuali) / 19) * 0.10;

        const score = f1 + f2 + f3 + f4 + f5;
        return {
            ...driver,
            score,
            podiums,
            racesCompleted,
            recentAvgPos: recentAvgPos.toFixed(1),
            avgQuali: (stats.avgQuali || 0).toFixed(1),
            dnfs: stats.dnfs || 0
        };
    });

    // Normalize to percentages
    const totalScore = candidates.reduce((s, c) => s + c.score, 0) || 1;
    candidates.forEach(c => { c.chance = Math.round((c.score / totalScore) * 100); });
    const sumChances = candidates.reduce((s, c) => s + c.chance, 0);
    if (sumChances !== 100) candidates[0].chance += (100 - sumChances);

    let html = `
        <p style="font-size:0.72rem;color:var(--text-secondary);margin-bottom:16px;padding:10px 14px;background:var(--bg-glass);border-radius:8px;border:1px solid rgba(0,229,255,0.12);line-height:1.5">
            🧮 <strong>Statistical Model for ${nextYear}</strong> — 5-factor analysis: season points share, win rate, podium consistency, recent form (last 5 races) &amp; qualifying pace.
        </p>
    `;

    candidates.forEach((pred, i) => {
        const teamColor = getTeamColor(pred.team);
        const trendIcon = pred.recentAvgPos < pred.avgPos ? '📈' : pred.recentAvgPos > pred.avgPos + 2 ? '📉' : '➡️';
        html += `
            <div class="prediction-driver-card" style="margin-bottom:10px;padding:12px;background:var(--bg-glass);border:1px solid var(--border-subtle);border-radius:10px;display:flex;align-items:center;gap:12px;transition:all 0.2s;">
                <div class="team-color-bar" style="background:${teamColor};width:4px;height:48px;border-radius:2px;flex-shrink:0;"></div>
                <div style="width:28px;text-align:center;font-family:'Orbitron',sans-serif;font-size:1.1rem;font-weight:900;color:${i === 0 ? 'var(--f1-yellow)' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--text-muted)'}">${i + 1}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:0.9rem;">${pred.name} <span style="font-size:0.7rem;color:var(--text-muted);">${trendIcon}</span></div>
                    <div style="font-size:0.7rem;color:${teamColor};margin:2px 0;">${pred.team}</div>
                    <div style="font-size:0.62rem;color:var(--text-muted);display:flex;gap:10px;flex-wrap:wrap;">
                        <span>🏆 ${pred.wins}W / ${pred.podiums}P</span>
                        <span>🎯 Avg Q${pred.avgQuali}</span>
                        <span>📉 Last5 P${pred.recentAvgPos}</span>
                        <span style="color:${pred.dnfs > 2 ? 'var(--f1-red)' : 'var(--text-muted)'};">⚠️ ${pred.dnfs} DNF</span>
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-family:'Orbitron',sans-serif;font-size:1.3rem;font-weight:800;color:${teamColor}">${pred.chance}%</div>
                    <div style="width:80px;height:6px;background:var(--bg-tertiary);border-radius:3px;margin-top:6px;overflow:hidden;">
                        <div class="prediction-bar-fill" style="height:100%;width:0%;background:${teamColor};border-radius:3px;transition:width 1s ease;" data-width="${pred.chance}"></div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    setTimeout(() => {
        container.querySelectorAll('.prediction-bar-fill').forEach(bar => {
            bar.style.width = bar.dataset.width + '%';
        });
    }, 300);
}

function renderTeamTrends() {
    const container = document.getElementById('teamTrendsContent');
    if (state.constructorStandings.length === 0) {
        showEmptyState(container, 'Team trends will appear once the season progresses.');
        return;
    }

    // Build team stats from raceResults
    const teamMap = {};
    const rounds = [...new Set(state.raceResults.map(r => r.round))].sort((a, b) => a - b);
    const mid = Math.floor(rounds.length / 2);
    const firstHalfRounds = new Set(rounds.slice(0, mid));
    const secondHalfRounds = new Set(rounds.slice(mid));

    state.raceResults.forEach(r => {
        if (!teamMap[r.team]) teamMap[r.team] = { firstHalfPts: 0, secondHalfPts: 0, totalPts: 0, races: 0 };
        const t = teamMap[r.team];
        t.totalPts += r.points;
        t.races++;
        if (firstHalfRounds.has(r.round)) t.firstHalfPts += r.points;
        if (secondHalfRounds.has(r.round)) t.secondHalfPts += r.points;
    });

    let html = '';
    state.constructorStandings.forEach(team => {
        const teamColor = getTeamColor(team.name);
        const stats = teamMap[team.name];
        let trend, icon, desc;

        if (stats && rounds.length >= 4) {
            // Real momentum from race data
            const diff = stats.secondHalfPts - stats.firstHalfPts;
            const ppr = stats.races > 0 ? (stats.totalPts / stats.races * 2).toFixed(1) : '?'; // per race (per 2 entries)
            if (diff > 15) {
                trend = 'trend-up'; icon = '📈';
                desc = `Strong momentum — scored ${stats.secondHalfPts} pts in second half vs ${stats.firstHalfPts} in first half (+${diff}pts). ${team.wins} wins.`;
            } else if (diff < -15) {
                trend = 'trend-down'; icon = '📉';
                desc = `Losing momentum — dropped from ${stats.firstHalfPts} pts (first half) to ${stats.secondHalfPts} pts (second half). ${team.points} pts total.`;
            } else {
                trend = 'trend-stable'; icon = '➡️';
                desc = `Consistent pace — ${stats.firstHalfPts} pts first half, ${stats.secondHalfPts} second half. ${team.points} pts total, ${team.wins} wins.`;
            }
        } else {
            // Fallback: use championship position
            if (team.pos <= 2) { trend = 'trend-up'; icon = '📈'; desc = `${team.wins} wins, ${team.points} points — championship contender.`; }
            else if (team.pos <= 5) { trend = 'trend-stable'; icon = '➡️'; desc = `${team.points} points — solid midfield performance.`; }
            else { trend = 'trend-down'; icon = '📉'; desc = `${team.points} points — fighting at the back.`; }
        }

        html += `
            <div class="team-trend-item" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-subtle);">
                <div style="display:flex;align-items:center;gap:8px;min-width:130px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:${teamColor};flex-shrink:0;"></span>
                    <span style="font-size:0.78rem;font-weight:600;">${team.name}</span>
                </div>
                <div style="font-size:1.2rem;flex-shrink:0;">${icon}</div>
                <div style="font-size:0.7rem;color:var(--text-secondary);flex:1;">${desc}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderH2H() {
    const container = document.getElementById('h2hContent');
    if (state.driverStandings.length < 2) {
        showEmptyState(container, 'Teammate battles will appear with more data.');
        return;
    }

    // Group by team from driverStandings
    const teamDrivers = {};
    state.driverStandings.forEach(d => {
        if (!teamDrivers[d.team]) teamDrivers[d.team] = [];
        teamDrivers[d.team].push(d);
    });

    // Build qualifying stats per driver
    const qualiMap = {};
    state.qualifyingResults.forEach(q => {
        if (!qualiMap[q.driverCode]) qualiMap[q.driverCode] = [];
        qualiMap[q.driverCode].push(q.pos);
    });

    const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    let html = '';
    Object.entries(teamDrivers).forEach(([team, drivers]) => {
        if (drivers.length < 2) return;
        const d1 = drivers[0], d2 = drivers[1];
        const total = (d1.points + d2.points) || 1;
        const d1Pct = Math.round(d1.points / total * 100);
        const d2Pct = 100 - d1Pct;
        const teamColor = getTeamColor(team);

        // Qualifying H2H
        const d1QualiAvg = avg(qualiMap[d1.code] || []);
        const d2QualiAvg = avg(qualiMap[d2.code] || []);
        let qualiInfo = '';
        if (d1QualiAvg !== null && d2QualiAvg !== null) {
            const qualiGap = Math.abs(d1QualiAvg - d2QualiAvg).toFixed(1);
            const qualiFaster = d1QualiAvg < d2QualiAvg ? d1.code : d2.code;
            qualiInfo = `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px;text-align:center;">🎯 Qualifying: <strong style="color:${teamColor}">${qualiFaster}</strong> faster by avg ${qualiGap} positions</div>`;
        }

        html += `
            <div class="h2h-battle" style="padding:12px 0;border-bottom:1px solid var(--border-subtle);">
                <div style="font-size:0.7rem;font-weight:700;color:${teamColor};margin-bottom:8px;letter-spacing:1px;text-transform:uppercase;">${team}</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="text-align:right;min-width:52px;">
                        <div style="font-family:'Orbitron',sans-serif;font-size:0.85rem;font-weight:700;">${d1.code}</div>
                        <div style="font-size:0.62rem;color:var(--text-muted);">${d1.points} pts</div>
                    </div>
                    <div style="flex:1;display:flex;height:22px;border-radius:4px;overflow:hidden;">
                        <div style="width:${d1Pct}%;background:${teamColor};display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;color:rgba(0,0,0,0.7);transition:width 1s ease;">${d1Pct > 15 ? d1Pct + '%' : ''}</div>
                        <div style="width:${d2Pct}%;background:${teamColor}44;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;color:var(--text-muted);">${d2Pct > 15 ? d2Pct + '%' : ''}</div>
                    </div>
                    <div style="text-align:left;min-width:52px;">
                        <div style="font-family:'Orbitron',sans-serif;font-size:0.85rem;font-weight:700;">${d2.code}</div>
                        <div style="font-size:0.62rem;color:var(--text-muted);">${d2.points} pts</div>
                    </div>
                </div>
                ${qualiInfo}
            </div>
        `;
    });

    container.innerHTML = html || '<div style="text-align:center;padding:20px;color:var(--text-muted);">No teammate pairings found.</div>';
}

function renderInsights() {
    const container = document.getElementById('insightsContent');
    if (state.driverStandings.length === 0) {
        showEmptyState(container, 'Insights will be generated as the season unfolds.');
        return;
    }

    const ds = state.driverStandings;
    const cs = state.constructorStandings;
    const dStats = buildDriverStats();
    const insights = [];

    // 1. Championship gap
    if (ds.length >= 2) {
        const gap = ds[0].points - ds[1].points;
        insights.push({
            icon: gap <= 10 ? '🔥' : '⚔️',
            title: gap <= 10 ? 'Razor-Thin Championship Battle!' : `${ds[0].name} Leads`,
            desc: `${ds[0].name} leads with ${ds[0].points} pts — ${gap === 0 ? 'tied with' : gap + ' pts ahead of'} ${ds[1].name} (${ds[1].points} pts).`
        });
    }

    // 2. Momentum leader (most improvement second half)
    const momentumLeader = Object.values(dStats).reduce((best, d) => {
        const gain = d.secondHalfPts - d.firstHalfPts;
        return gain > (best.gain || -Infinity) ? { ...d, gain } : best;
    }, {});
    if (momentumLeader.name && momentumLeader.gain > 10) {
        insights.push({
            icon: '📈',
            title: `${momentumLeader.name} On Fire`,
            desc: `Best momentum of the season: scored ${momentumLeader.secondHalfPts} pts in the second half vs ${momentumLeader.firstHalfPts} in the first half (+${momentumLeader.gain} pts gain).`
        });
    }

    // 3. Qualifying ace (best avg grid position)
    const qualiAce = Object.values(dStats).filter(d => d.avgQuali > 0 && d.racesCompleted >= 3)
        .reduce((best, d) => d.avgQuali < (best.avgQuali || 99) ? d : best, {});
    if (qualiAce.name) {
        insights.push({
            icon: '⚡',
            title: `${qualiAce.name} — Qualifying King`,
            desc: `Best average qualifying position on the grid: P${qualiAce.avgQuali.toFixed(1)} over ${qualiAce.racesCompleted} qualifying sessions.`
        });
    }

    // 4. Reliability nightmare (most DNFs)
    const mostDNFs = Object.values(dStats).reduce((worst, d) => d.dnfs > (worst.dnfs || 0) ? d : worst, {});
    if (mostDNFs.dnfs >= 2) {
        insights.push({
            icon: '⚠️',
            title: `${mostDNFs.name} — Reliability Issues`,
            desc: `${mostDNFs.dnfs} DNFs this season${mostDNFs.team ? ' for ' + mostDNFs.team : ''} — most retirements on the grid. A mechanical lottery.`
        });
    }

    // 5. Comeback king (most positions gained race vs grid avg)
    const comebackKing = Object.values(dStats).filter(d => d.racesCompleted >= 3).reduce((best, d) => {
        // Avg gain = avg(grid - finish pos) from raceResults
        const gains = state.raceResults
            .filter(r => r.driverCode === d.code && !r.dnf)
            .map(r => r.grid - r.pos);
        const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : -99;
        return avgGain > (best.avgGain || -99) ? { ...d, avgGain } : best;
    }, {});
    if (comebackKing.name && comebackKing.avgGain > 0) {
        insights.push({
            icon: '🚀',
            title: `${comebackKing.name} — Overtake Master`,
            desc: `Gains an average of +${comebackKing.avgGain.toFixed(1)} positions per race from grid to finish. The grid's best racer.`
        });
    }

    // 6. Constructor dominance
    if (cs.length >= 2) {
        const gap = cs[0].points - cs[1].points;
        insights.push({
            icon: '🏗️',
            title: `${cs[0].name} ${gap > 100 ? 'Dominance' : 'Leads Constructors'}`,
            desc: `${cs[0].points} pts and ${cs[0].wins} wins — ${gap > 0 ? gap + ' pts ahead of ' + cs[1].name + '.' : 'level with ' + cs[1].name + '.'}`
        });
    }

    // 7. Win distribution
    const totalWins = ds.reduce((s, d) => s + d.wins, 0);
    const winnersCount = ds.filter(d => d.wins > 0).length;
    if (totalWins > 0) {
        insights.push({
            icon: '📊',
            title: 'Win Spread',
            desc: `${totalWins} races, ${winnersCount} different winner${winnersCount > 1 ? 's' : ''}. ${winnersCount <= 2 ? 'Championship is top-heavy 🎯' : winnersCount >= 6 ? 'Incredibly competitive season! 🌟' : 'Good depth at the front.'}`
        });
    }

    // 8. Young gun
    const now = new Date();
    const youngDrivers = ds.filter(d => {
        if (!d.dob) return false;
        const age = Math.floor((now - new Date(d.dob)) / (365.25 * 24 * 60 * 60 * 1000));
        return age <= 23;
    });
    if (youngDrivers.length > 0) {
        const best = youngDrivers.reduce((a, b) => a.points > b.points ? a : b);
        const age = Math.floor((now - new Date(best.dob)) / (365.25 * 24 * 60 * 60 * 1000));
        insights.push({
            icon: '🌟',
            title: `${best.name} — Young Gun`,
            desc: `Aged ${age}, top young talent with ${best.points} pts (P${best.pos}). ${youngDrivers.length} drivers under 24 competing this season.`
        });
    }

    // 9. Midfield battle
    if (cs.length >= 7) {
        const midfield = cs.slice(4, 8);
        const gaps = midfield.slice(1).map((t, i) => midfield[i].points - t.points);
        const minGap = Math.min(...gaps);
        insights.push({
            icon: '🔄',
            title: 'Midfield Warfare',
            desc: `${midfield.map(t => t.name).join(', ')} fighting for P5-P8. Smallest gap: ${minGap} pts — one bad race changes everything.`
        });
    }

    // 10. Points efficiency (pts per race for top drivers)
    const efficiencyLeader = Object.values(dStats).filter(d => d.racesCompleted >= 3)
        .reduce((best, d) => d.ptsPerRace > (best.ptsPerRace || 0) ? d : best, {});
    if (efficiencyLeader.name) {
        insights.push({
            icon: '💎',
            title: `${efficiencyLeader.name} — Points Machine`,
            desc: `Highest points-per-race average: ${efficiencyLeader.ptsPerRace.toFixed(1)} pts/race over ${efficiencyLeader.racesCompleted} races. Maximum efficiency.`
        });
    }

    let html = '';
    insights.forEach(insight => {
        html += `
            <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-subtle);align-items:flex-start;">
                <div style="font-size:1.4rem;flex-shrink:0;">${insight.icon}</div>
                <div>
                    <div style="font-weight:700;font-size:0.85rem;color:var(--text-primary);margin-bottom:3px;">${insight.title}</div>
                    <div style="font-size:0.74rem;color:var(--text-secondary);line-height:1.45;">${insight.desc}</div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderNextRacePrediction() {
    // Find the container — add it dynamically to the predictions grid if not present
    let container = document.getElementById('nextRacePredContent');
    if (!container) {
        const grid = document.querySelector('.predictions-grid');
        if (!grid) return;
        const card = document.createElement('div');
        card.className = 'card prediction-card';
        card.id = 'nextRaceCard2';
        card.style.gridColumn = '1 / -1'; // full width
        card.innerHTML = `
            <div class="card-header">
                <h2 class="card-title">
                    <span class="title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;display:inline-block;vertical-align:middle;"><path d="M19 17H5a2 2 0 0 1 0-4h14a2 2 0 0 0 0-4H5"/><circle cx="5" cy="17" r="2"/><circle cx="19" cy="17" r="2"/></svg></span>
                    Next Race Prediction
                    <span class="info-tooltip">?<span class="tooltip-text">Algorithm based on 5 factors: Last Race Result (30%), Championship Pos (20%), Circuit History (20%), Recent Form (20%), and Quali Conversion (10%).</span></span>
                </h2>
                <span class="card-badge prediction-badge">FORECAST</span>
            </div>
            <div id="nextRacePredContent"></div>
        `;
        grid.appendChild(card);
        container = document.getElementById('nextRacePredContent');
    }

    if (state.driverStandings.length === 0) {
        showEmptyState(container, 'Next race prediction available once season data is loaded.');
        return;
    }

    // Find next race from calendar
    const today = new Date();
    const upcoming = state.raceCalendar.filter(r => new Date(r.date) >= today);
    const nextRace = upcoming[0];
    if (!nextRace) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Season complete — no upcoming races.</div>';
        return;
    }

    const dStats = buildDriverStats();

    // Score top 8 drivers for next race
    const top8 = state.driverStandings.slice(0, 8).map(driver => {
        const stats = dStats[driver.code] || {};

        // Wins at this circuit in the current season (proxy using circuit name in recent results)
        const circuitWins = state.raceResults.filter(r =>
            r.driverCode === driver.code && r.pos === 1
        ).length;

        // Recent form: last 3 races avg finish
        const last3 = (stats.positions || []).slice(-3);
        const last3Avg = last3.length > 0 ? last3.reduce((a, b) => a + b, 0) / last3.length : 10;

        // Qualifying strength
        const avgQuali = stats.avgQuali || 10;

        // Score: 40% recent form (inverse), 30% season points, 20% quali pace, 10% circuit wins bonus
        const recentScore = (20 - last3Avg) / 19;
        const pointsScore = driver.points / (state.driverStandings[0].points || 1);
        const qualiScore = (20 - avgQuali) / 19;
        const circuitBonus = circuitWins * 0.05;

        const score = recentScore * 0.4 + pointsScore * 0.3 + qualiScore * 0.2 + circuitBonus;
        return { ...driver, score, last3Avg: last3Avg.toFixed(1), avgQuali: avgQuali.toFixed(1), circuitWins, stats };
    }).sort((a, b) => b.score - a.score);

    // Convert to win probability %
    const totalScore = top8.reduce((s, d) => s + d.score, 0) || 1;
    top8.forEach(d => { d.winProb = Math.round(d.score / totalScore * 100); });
    const sumProb = top8.reduce((s, d) => s + d.winProb, 0);
    if (sumProb !== 100) top8[0].winProb += (100 - sumProb);

    const flag = COUNTRY_FLAGS[nextRace.country] || '🏁';
    const raceDateStr = new Date(nextRace.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
    const daysAway = Math.ceil((new Date(nextRace.date) - today) / (1000 * 60 * 60 * 24));

    let html = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;padding:14px;background:var(--bg-glass);border-radius:10px;border:1px solid var(--border-subtle);">
            <div style="font-size:2.5rem;">${flag}</div>
            <div style="flex:1;">
                <div style="font-family:'Orbitron',sans-serif;font-weight:700;font-size:0.95rem;">${nextRace.name}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;">📍 ${nextRace.locality}, ${nextRace.country} • ${raceDateStr}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-family:'Orbitron',sans-serif;font-size:1.4rem;font-weight:900;color:var(--f1-red);">${daysAway}</div>
                <div style="font-size:0.6rem;color:var(--text-muted);letter-spacing:1px;">DAYS AWAY</div>
                ${nextRace.sprint ? '<div style="margin-top:4px;font-size:0.6rem;background:rgba(255,107,53,0.15);border:1px solid rgba(255,107,53,0.3);color:var(--f1-orange);padding:2px 8px;border-radius:10px;">SPRINT WKD</div>' : ''}
            </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
    `;

    top8.forEach((pred, i) => {
        const teamColor = getTeamColor(pred.team);
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
        html += `
            <div style="padding:10px;background:var(--bg-glass);border:1px solid ${i < 3 ? teamColor + '44' : 'var(--border-subtle)'};border-radius:8px;position:relative;overflow:hidden;">
                <div style="position:absolute;top:0;left:0;right:0;height:2px;background:${teamColor};"></div>
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                        <div style="font-weight:700;font-size:0.82rem;">${medal} ${pred.code}</div>
                        <div style="font-size:0.65rem;color:${teamColor};">${pred.team}</div>
                    </div>
                    <div style="font-family:'Orbitron',sans-serif;font-size:1.1rem;font-weight:800;color:${teamColor};">${pred.winProb}%</div>
                </div>
                <div style="font-size:0.62rem;color:var(--text-muted);margin-top:6px;display:flex;gap:8px;">
                    <span>📉 Form P${pred.last3Avg}</span>
                    <span>🎯 Q${pred.avgQuali}</span>
                </div>
                <div style="margin-top:6px;height:4px;background:var(--bg-tertiary);border-radius:2px;overflow:hidden;">
                    <div style="height:100%;width:${pred.winProb}%;background:${teamColor};transition:width 1s ease;"></div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}


// ==========================================
// ANALYTICS SECTION
// ==========================================

function renderAnalytics() {
    renderPointsDistribution();
    renderWinDistribution();
    renderAgeAnalysis();
    renderRecords();
}

function renderPointsDistribution() {
    const container = document.getElementById('pointsDistContent');

    if (state.constructorStandings.length === 0) {
        showEmptyState(container, 'Points distribution chart needs race data.');
        return;
    }

    const totalPoints = state.constructorStandings.reduce((sum, t) => sum + t.points, 0) || 1;

    let html = '<div class="points-pie-container">';
    state.constructorStandings.forEach(team => {
        const pct = (team.points / totalPoints * 100).toFixed(1);
        const teamColor = getTeamColor(team.name);
        const dashOffset = 157 - (157 * pct / 100);
        const shortName = team.name.replace(/ F1 Team/g, '').replace(/ Racing/g, '');

        html += `
            <div class="pie-item">
                <div class="pie-circle">
                    <svg viewBox="0 0 56 56">
                        <circle class="pie-bg" cx="28" cy="28" r="25" stroke="${teamColor}22"/>
                        <circle class="pie-fill" cx="28" cy="28" r="25" stroke="${teamColor}" stroke-dashoffset="157" data-offset="${dashOffset}"/>
                    </svg>
                    <span class="pie-value" style="color:${teamColor}">${pct}%</span>
                </div>
                <div class="pie-label">${shortName}</div>
            </div>
        `;
    });
    html += '</div>';

    container.innerHTML = html;
    setTimeout(animatePieCharts, 300);
}

function animatePieCharts() {
    document.querySelectorAll('.pie-fill').forEach(circle => {
        circle.style.strokeDashoffset = circle.dataset.offset;
    });
}

function renderWinDistribution() {
    const container = document.getElementById('winDistContent');

    const winners = state.driverStandings.filter(d => d.wins > 0).sort((a, b) => b.wins - a.wins);

    if (winners.length === 0) {
        showEmptyState(container, 'No race winners yet this season.');
        return;
    }

    const maxWins = winners[0]?.wins || 1;
    let html = '<div class="win-bars">';

    winners.forEach(driver => {
        const teamColor = getTeamColor(driver.team);
        let blocks = '';
        for (let i = 0; i < driver.wins; i++) {
            blocks += `<div class="win-bar-block" style="background: ${teamColor}; flex: 1;">🏆</div>`;
        }

        html += `
            <div class="win-bar-item">
                <div class="win-bar-driver" style="color: ${teamColor}">${driver.name}</div>
                <div class="win-bar-track">${blocks}</div>
                <div class="win-bar-count">${driver.wins}</div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

function renderAgeAnalysis() {
    const container = document.getElementById('ageAnalysisContent');
    const now = new Date();

    const driversWithAge = state.driverStandings.filter(d => d.dob).map(d => {
        const dob = new Date(d.dob);
        const age = Math.floor((now - dob) / (365.25 * 24 * 60 * 60 * 1000));
        return { ...d, age };
    });

    if (driversWithAge.length === 0) {
        showEmptyState(container, 'Age data not available.');
        return;
    }

    const youngest = driversWithAge.reduce((a, b) => a.age < b.age ? a : b);
    const oldest = driversWithAge.reduce((a, b) => a.age > b.age ? a : b);
    const avgAge = (driversWithAge.reduce((sum, d) => sum + d.age, 0) / driversWithAge.length).toFixed(1);
    const under25 = driversWithAge.filter(d => d.age < 25).length;
    const over30 = driversWithAge.filter(d => d.age >= 30).length;
    const champion = driversWithAge[0]; // P1 driver

    const html = `
        <div class="age-list">
            <div class="age-stat">
                <span class="age-stat-label">👶 Youngest Driver</span>
                <span class="age-stat-value age-highlight">${youngest.name} (${youngest.age})</span>
            </div>
            <div class="age-stat">
                <span class="age-stat-label">🧓 Oldest Driver</span>
                <span class="age-stat-value">${oldest.name} (${oldest.age})</span>
            </div>
            <div class="age-stat">
                <span class="age-stat-label">📊 Average Grid Age</span>
                <span class="age-stat-value age-highlight">${avgAge} years</span>
            </div>
            <div class="age-stat">
                <span class="age-stat-label">⚡ Drivers Under 25</span>
                <span class="age-stat-value">${under25} drivers</span>
            </div>
            <div class="age-stat">
                <span class="age-stat-label">🎖️ Drivers 30+</span>
                <span class="age-stat-value">${over30} drivers</span>
            </div>
            <div class="age-stat">
                <span class="age-stat-label">🏆 Championship Leader Age</span>
                <span class="age-stat-value age-highlight">${champion.name} (${champion.age})</span>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function renderRecords() {
    const container = document.getElementById('recordsContent');

    if (state.driverStandings.length === 0) {
        showEmptyState(container, 'Season records will be populated as races occur.');
        return;
    }

    const ds = state.driverStandings;
    const cs = state.constructorStandings;

    const topWinner = ds.reduce((a, b) => a.wins > b.wins ? a : b);
    const topScorer = ds[0];
    const gap = ds.length >= 2 ? Math.abs(ds[0].points - ds[1].points) : 0;

    const records = [
        { label: 'Most Race Wins', value: `${topWinner.wins}`, holder: `${topWinner.name} (${topWinner.team})` },
        { label: 'Most Points', value: `${topScorer.points}`, holder: `${topScorer.name} (${topScorer.team})` },
    ];

    if (cs.length > 0) {
        records.push({ label: 'Constructor Leader', value: `${cs[0].points} pts`, holder: cs[0].name });
    }

    records.push({ label: 'Championship P1', value: `${topScorer.points} pts`, holder: topScorer.name });
    records.push({ label: 'P1 vs P2 Gap', value: `${gap} pts`, holder: ds.length >= 2 ? `${ds[0].name} vs ${ds[1].name}` : 'N/A' });

    if (cs.length >= 2) {
        records.push({ label: 'Constructor Gap P1-P2', value: `${cs[0].points - cs[1].points} pts`, holder: `${cs[0].name} vs ${cs[1].name}` });
    }

    const totalWins = ds.reduce((sum, d) => sum + d.wins, 0);
    const winnersCount = ds.filter(d => d.wins > 0).length;
    records.push({ label: 'Different Winners', value: `${winnersCount}`, holder: `${totalWins} total races won` });

    // Best rookie (age < 23)
    const now = new Date();
    const rookies = ds.filter(d => {
        if (!d.dob) return false;
        const age = Math.floor((now - new Date(d.dob)) / (365.25 * 24 * 60 * 60 * 1000));
        return age <= 22;
    }).sort((a, b) => b.points - a.points);

    if (rookies.length > 0) {
        records.push({ label: 'Best Young Driver', value: `${rookies[0].points} pts`, holder: rookies[0].name });
    }

    let html = '';
    records.forEach(record => {
        html += `
            <div class="record-item">
                <div>
                    <div class="record-label">${record.label}</div>
                    <div class="record-holder">${record.holder}</div>
                </div>
                <div class="record-value">${record.value}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ==========================================
// NEW FEATURES v4
// ==========================================

const OPENF1_BASE = 'https://api.openf1.org/v1';

// ---- OpenF1 async loader ----
async function fetchOpenF1Data() {
    if (!state.lastRaceRound || state.lastRaceRound === '') return;

    // Find the session_key for the last race of this season
    const sessionsData = await fetchJSON(
        `${OPENF1_BASE}/sessions?year=${state.year}&session_name=Race`
    );
    if (!sessionsData || sessionsData.length === 0) return;

    // Take the most recent completed race session
    const session = sessionsData[sessionsData.length - 1];
    const sessionKey = session.session_key;

    // Fetch stints, laps (top 5 drivers by finishing pos), race control
    const top5Numbers = [];
    if (state.lastRaceResults.length > 0) {
        // We need driver numbers — map from OpenF1 drivers
        const driversData = await fetchJSON(
            `${OPENF1_BASE}/drivers?session_key=${sessionKey}`
        );
        if (driversData) {
            const top5Names = state.lastRaceResults.slice(0, 5).map(r => r.code);
            top5Names.forEach(code => {
                const d = driversData.find(d => d.name_acronym === code);
                if (d) top5Numbers.push(d.driver_number);
            });
        }
    }

    const [stintsData, rcData] = await Promise.all([
        fetchJSON(`${OPENF1_BASE}/stints?session_key=${sessionKey}`),
        fetchJSON(`${OPENF1_BASE}/race_control?session_key=${sessionKey}`)
    ]);

    if (stintsData) state.tyreStints = stintsData;
    if (rcData) {
        state.raceControlMsgs = rcData.filter(m =>
            m.flag || m.category === 'SafetyCar' || m.category === 'Drs' ||
            m.message?.toLowerCase().includes('safety') ||
            m.message?.toLowerCase().includes('deploy') ||
            m.message?.toLowerCase().includes('retire') ||
            m.message?.toLowerCase().includes('penalty')
        ).slice(0, 30);
    }

    // Fetch lap times for top-5 by driver number
    if (top5Numbers.length > 0) {
        const lapFetches = top5Numbers.slice(0, 5).map(num =>
            fetchJSON(`${OPENF1_BASE}/laps?session_key=${sessionKey}&driver_number=${num}`)
        );
        const lapResults = await Promise.all(lapFetches);
        state.lapTimesData = lapResults
            .filter(Boolean)
            .flat()
            .filter(l => l.lap_duration && l.lap_duration > 0);
    }

    // Also fetch ALL driver laps for sector + speed data
    const allLapsData = await fetchJSON(`${OPENF1_BASE}/laps?session_key=${sessionKey}`);

    // Process sector times & speed traps from ALL laps
    if (allLapsData && Array.isArray(allLapsData)) {
        const driverLaps = {};
        allLapsData.forEach(l => {
            const num = l.driver_number;
            if (!driverLaps[num]) driverLaps[num] = [];
            driverLaps[num].push(l);
        });

        // Build sector/speed data per driver
        state.sectorData = Object.entries(driverLaps).map(([num, laps]) => {
            const validLaps = laps.filter(l => l.duration_sector_1 && l.duration_sector_2 && l.duration_sector_3);
            if (validLaps.length === 0) return null;
            const bestS1 = Math.min(...validLaps.map(l => l.duration_sector_1));
            const bestS2 = Math.min(...validLaps.map(l => l.duration_sector_2));
            const bestS3 = Math.min(...validLaps.map(l => l.duration_sector_3));
            return { driverNum: num, s1: bestS1, s2: bestS2, s3: bestS3 };
        }).filter(Boolean).sort((a, b) => (a.s1 + a.s2 + a.s3) - (b.s1 + b.s2 + b.s3));

        state.speedTrapData = Object.entries(driverLaps).map(([num, laps]) => {
            const speedLaps = laps.filter(l => l.st_speed && l.st_speed > 0);
            if (speedLaps.length === 0) return null;
            const topSpeed = Math.max(...speedLaps.map(l => l.st_speed));
            return { driverNum: num, topSpeed };
        }).filter(Boolean).sort((a, b) => b.topSpeed - a.topSpeed);
    }

    // Fetch weather data
    const weatherRaw = await fetchJSON(`${OPENF1_BASE}/weather?session_key=${sessionKey}`);
    if (weatherRaw && weatherRaw.length > 0) {
        // Use a sample from middle of race for representative conditions
        const mid = Math.floor(weatherRaw.length / 2);
        state.weatherData = [weatherRaw[mid]];
    }

    // Re-render all analytics cards now that we have data
    renderTyreStrategy();
    renderLapTimeEvolution();
    renderRaceControlTimeline();
    renderSectorTimes();
    renderTopSpeed();
    renderTyreDegradation();
    renderWeather();
}

// ---- F2: Pit Stop Analysis ----
function renderPitStopAnalysis() {
    const container = document.getElementById('pitStopContent');
    if (!container) return;

    if (state.pitStops.length === 0) {
        showEmptyState(container, 'Pit stop data not available for this race.');
        return;
    }

    const fastest = state.pitStops[0];
    let html = `
        <div class="fastest-pit-banner">
            <span>🥇</span>
            <span>Fastest pit stop: <strong>${fastest.name || fastest.code}</strong> — 
            <strong>${fastest.bestDuration.toFixed(1)}s</strong></span>
        </div>
        <div class="pit-stop-grid">
    `;

    state.pitStops.forEach((d, i) => {
        const teamColor = getTeamColor(d.team);
        html += `
            <div class="pit-stop-driver-row ${i === 0 ? 'fastest-pit' : ''}">
                <div class="pit-dot" style="background:${teamColor}"></div>
                <div class="pit-name driver-clickable" onclick="openDriverModal('${d.code}')">${d.name || d.code}</div>
                <div class="pit-count">${d.stopCount} stop${d.stopCount !== 1 ? 's' : ''}</div>
                <div class="pit-best">${d.bestDuration.toFixed(1)}s</div>
                ${i === 0 ? '<span>⚡</span>' : ''}
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// ---- F1: Championship Points Timeline (Canvas chart) ----
function renderPointsTimeline() {
    const container = document.getElementById('pointsTimelineContent');
    if (!container) return;

    if (state.pointsTimeline.length === 0) {
        showEmptyState(container, 'Championship timeline will appear once races have been completed.');
        return;
    }

    const rounds = [...new Set(state.pointsTimeline.map(p => p.round))].sort((a, b) => a - b);
    const driverCodes = [...new Set(state.pointsTimeline.map(p => p.driverCode))];

    const W = Math.min(900, container.clientWidth || 800);
    const H = 260;
    const PAD = { top: 20, right: 80, bottom: 30, left: 50 };

    const maxPts = Math.max(...state.pointsTimeline.map(p => p.points), 10);

    container.innerHTML = `
        <div class="timeline-chart-container">
            <div class="timeline-canvas-wrap">
                <canvas id="timelineCanvas" width="${W}" height="${H}" style="width:100%;height:${H}px;"></canvas>
            </div>
            <div class="timeline-legend" id="timelineLegend"></div>
        </div>
    `;

    const canvas = document.getElementById('timelineCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const xScale = r => PAD.left + ((r - rounds[0]) / (rounds[rounds.length - 1] - rounds[0] + 0.01)) * (W - PAD.left - PAD.right);
    const yScale = p => H - PAD.bottom - (p / maxPts) * (H - PAD.top - PAD.bottom);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach(frac => {
        const y = PAD.top + frac * (H - PAD.top - PAD.bottom);
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '10px Inter';
        ctx.fillText(Math.round(maxPts * (1 - frac)), 4, y + 4);
    });

    // Round markers on X axis
    rounds.forEach(r => {
        const x = xScale(r);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '9px Inter';
        ctx.fillText(`R${r}`, x - 6, H - 4);
    });

    // Draw lines per driver
    const legendEl = document.getElementById('timelineLegend');
    let legendHtml = '';

    driverCodes.forEach(code => {
        const standing = state.driverStandings.find(d => d.code === code);
        const color = standing ? getTeamColor(standing.team) : '#888';
        const pts = rounds.map(r => {
            const entry = state.pointsTimeline.find(p => p.round === r && p.driverCode === code);
            return entry ? entry.points : null;
        });

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        let started = false;
        rounds.forEach((r, i) => {
            if (pts[i] === null) return;
            const x = xScale(r), y = yScale(pts[i]);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Last point dot + label
        const lastPt = pts.filter(p => p !== null).pop();
        if (lastPt !== undefined) {
            const lastR = rounds[pts.lastIndexOf(lastPt)];
            ctx.beginPath();
            ctx.arc(xScale(lastR), yScale(lastPt), 4, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.fillStyle = color;
            ctx.font = 'bold 9px Inter';
            ctx.fillText(code, xScale(lastR) + 7, yScale(lastPt) + 3);
        }

        legendHtml += `<div class="timeline-legend-item">
            <div class="timeline-legend-line" style="background:${color}"></div>
            <span style="color:rgba(255,255,255,0.7)">${standing?.name || code}</span>
        </div>`;
    });

    if (legendEl) legendEl.innerHTML = legendHtml;
}

// ---- F6: Tyre Strategy Visualizer ----
function renderTyreStrategy() {
    const container = document.getElementById('tyreStrategyContent');
    if (!container) return;

    if (!state.tyreStints || state.tyreStints.length === 0) {
        showEmptyState(container, 'Tyre strategy data loading from OpenF1...');
        return;
    }

    // Group stints by driver
    const byDriver = {};
    state.tyreStints.forEach(s => {
        const num = s.driver_number;
        if (!byDriver[num]) byDriver[num] = [];
        byDriver[num].push(s);
    });

    const totalLaps = Math.max(...state.tyreStints.map(s => s.lap_end || 0), 20);

    // Map driver numbers to codes using lastRaceResults
    const numToCode = {};
    if (state.tyreStints.length > 0 && state.lastRaceResults.length > 0) {
        // Best effort mapping — we'll match by position in grid
    }

    const compound_labels = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W', UNKNOWN: '?', TEST_UNKNOWN: '?' };
    const tyre_colors_css = { SOFT: '#e8002d', MEDIUM: '#ffd700', HARD: '#e0e0e0', INTERMEDIATE: '#39b54a', WET: '#0072ff' };

    const usedCompounds = [...new Set(state.tyreStints.map(s => s.compound))].filter(Boolean);

    let legendHtml = '<div class="tyre-legend">';
    usedCompounds.forEach(c => {
        const color = tyre_colors_css[c] || '#555';
        legendHtml += `<div class="tyre-legend-item">
            <div class="tyre-legend-swatch" style="background:${color}"></div>
            <span style="color:rgba(255,255,255,0.6)">${c}</span>
        </div>`;
    });
    legendHtml += '</div>';

    let rowsHtml = '';
    // Sort drivers by finishing position (from lastRaceResults)
    const sortedNums = Object.keys(byDriver);
    sortedNums.forEach(num => {
        const stints = byDriver[num].sort((a, b) => a.stint_number - b.stint_number);
        const acronym = stints[0]?.driver_number ? `#${num}` : `#${num}`;

        let stintBarHtml = '';
        stints.forEach(s => {
            const lap_start = s.lap_start || 1;
            const lap_end = s.lap_end || totalLaps;
            const width = ((lap_end - lap_start + 1) / totalLaps) * 100;
            const compound = (s.compound || 'UNKNOWN').toUpperCase();
            const label = compound_labels[compound] || '?';
            stintBarHtml += `<div class="tyre-stint tyre-${compound}" 
                style="flex:${width}" 
                title="${compound} — Laps ${lap_start}-${lap_end} (${lap_end - lap_start + 1} laps)">${width > 8 ? label : ''}</div>`;
        });

        rowsHtml += `<div class="tyre-strategy-row">
            <div class="tyre-driver-label">${acronym}</div>
            <div class="tyre-stints">${stintBarHtml}</div>
        </div>`;
    });

    container.innerHTML = `
        ${legendHtml}
        <div class="tyre-strategy-wrapper">
            <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:8px;padding-left:60px;">← Lap 1 · · · Lap ${totalLaps} →</div>
            ${rowsHtml}
        </div>
        <p style="font-size:0.65rem;color:var(--text-muted);margin-top:10px;">Data: OpenF1 API · Each block = one tyre stint</p>
    `;
}

// ---- F7: Lap Time Evolution (Canvas chart) ----
function renderLapTimeEvolution() {
    const container = document.getElementById('lapTimeContent');
    if (!container) return;

    if (!state.lapTimesData || state.lapTimesData.length === 0) {
        showEmptyState(container, 'Lap time data loading from OpenF1...');
        return;
    }

    const driverNums = [...new Set(state.lapTimesData.map(l => l.driver_number))].slice(0, 5);
    const maxLap = Math.max(...state.lapTimesData.map(l => l.lap_number || 0), 20);

    // Filter to reasonable lap times (remove outliers: pit in/out, SC laps)
    const validLaps = state.lapTimesData.filter(l =>
        l.lap_duration && l.lap_duration > 60 && l.lap_duration < 300
    );
    if (validLaps.length === 0) {
        showEmptyState(container, 'No valid lap time data available.');
        return;
    }

    const minTime = Math.min(...validLaps.map(l => l.lap_duration));
    const maxTime = Math.max(...validLaps.map(l => l.lap_duration));
    const timeRange = maxTime - minTime;

    const W = container.clientWidth || 400;
    const H = 220;
    const PAD = { top: 15, right: 10, bottom: 30, left: 55 };

    container.innerHTML = `
        <div class="laptime-canvas-wrap">
            <canvas id="lapTimeCanvas" width="${W}" height="${H}" style="width:100%;height:${H}px;"></canvas>
        </div>
        <div class="timeline-legend" id="lapTimeLegend"></div>
        <p class="laptime-note">Showing qualifying lap time approximations. Outlier laps (pit, SC) filtered.</p>
    `;

    const canvas = document.getElementById('lapTimeCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const xS = lap => PAD.left + ((lap - 1) / (maxLap - 1 || 1)) * (W - PAD.left - PAD.right);
    const yS = t => H - PAD.bottom - ((t - minTime) / (timeRange || 1)) * (H - PAD.top - PAD.bottom);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    [0, 0.5, 1].forEach(f => {
        const y = PAD.top + f * (H - PAD.top - PAD.bottom);
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        const label = (minTime + (1 - f) * timeRange);
        const m = Math.floor(label / 60);
        const s = (label % 60).toFixed(1);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillText(`${m}:${s.padStart(4, '0')}`, 2, y + 3);
    });

    const palette = ['#FF8000', '#3671C6', '#27F4D2', '#E8002D', '#64C4FF'];
    let legendHtml = '';

    driverNums.forEach((num, idx) => {
        const color = palette[idx % palette.length];
        const laps = validLaps.filter(l => l.driver_number === num).sort((a, b) => a.lap_number - b.lap_number);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        let started = false;
        laps.forEach(l => {
            const x = xS(l.lap_number), y = yS(l.lap_duration);
            if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        });
        ctx.stroke();
        legendHtml += `<div class="timeline-legend-item">
            <div class="timeline-legend-line" style="background:${color}"></div>
            <span style="color:rgba(255,255,255,0.6)">#${num}</span>
        </div>`;
    });

    const legendEl = document.getElementById('lapTimeLegend');
    if (legendEl) legendEl.innerHTML = legendHtml;
}

// ---- F8: Race Control Timeline ----
function renderRaceControlTimeline() {
    const container = document.getElementById('raceControlContent');
    if (!container) return;

    if (!state.raceControlMsgs || state.raceControlMsgs.length === 0) {
        showEmptyState(container, 'Race control messages loading from OpenF1...');
        return;
    }

    const getIcon = (msg) => {
        const m = (msg.message || '').toLowerCase();
        const f = (msg.flag || '').toUpperCase();
        const cat = (msg.category || '').toLowerCase();
        if (f === 'RED' || m.includes('red flag')) return { icon: '🔴', badge: 'rc-badge-red', label: 'RED FLAG' };
        if (f === 'YELLOW' || m.includes('yellow')) return { icon: '🟡', badge: 'rc-badge-yellow', label: 'YELLOW' };
        if (cat.includes('safetycar') || m.includes('safety car') || m.includes('deploy')) return { icon: '🚗', badge: 'rc-badge-sc', label: 'SAFETY CAR' };
        if (m.includes('vsc') || m.includes('virtual safety')) return { icon: '🟠', badge: 'rc-badge-sc', label: 'VSC' };
        if (cat === 'drs' || m.includes('drs')) return { icon: '✅', badge: 'rc-badge-drs', label: 'DRS' };
        if (m.includes('penalty') || m.includes('investigation')) return { icon: '⚖️', badge: 'rc-badge-red', label: 'PENALTY' };
        if (m.includes('retire') || m.includes('retirement')) return { icon: '🔧', badge: 'rc-badge-info', label: 'RETIRE' };
        return { icon: '📻', badge: 'rc-badge-info', label: 'INFO' };
    };

    let html = '<div class="rc-timeline">';
    state.raceControlMsgs.forEach(msg => {
        const { icon, badge, label } = getIcon(msg);
        const lapStr = msg.lap_number ? `Lap ${msg.lap_number}` : '—';
        const msgText = msg.message || msg.flag || 'Message';
        html += `
            <div class="rc-event">
                <div class="rc-lap">${lapStr}</div>
                <div class="rc-icon">${icon}</div>
                <div class="rc-text">
                    <span class="rc-badge ${badge}">${label}</span>
                    ${msgText}
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// ---- F4: Driver Profile Modal ----
async function openDriverModal(driverCode) {
    const modal = document.getElementById('driverModal');
    const content = document.getElementById('driverModalContent');
    if (!modal || !content) return;

    modal.classList.add('active');

    // Find driver in state
    const standing = state.driverStandings.find(d => d.code === driverCode);
    const driver = state.drivers.find(d => d.code === driverCode) || standing;

    const name = standing?.name || driver?.name || driverCode;
    const team = standing?.team || '';
    const nationality = standing?.nationality || driver?.nationality || '';
    const dob = standing?.dob || driver?.dob || '';
    const teamColor = getTeamColor(team);
    const flag = COUNTRY_FLAGS[nationality] || '🏎️';

    let age = '';
    if (dob) {
        age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
    }

    // Build local season stats
    const driverRaces = state.raceResults.filter(r => r.driverCode === driverCode);
    const wins = driverRaces.filter(r => r.pos === 1).length;
    const podiums = driverRaces.filter(r => r.pos <= 3).length;
    const dnfs = driverRaces.filter(r => r.dnf).length;
    const seasonPts = standing?.points || 0;
    const avgPos = driverRaces.length > 0
        ? (driverRaces.reduce((s, r) => s + r.pos, 0) / driverRaces.length).toFixed(1)
        : '—';
    const avgQuali = (() => {
        const qualResults = state.qualifyingResults.filter(q => q.driverCode === driverCode);
        return qualResults.length > 0
            ? (qualResults.reduce((s, q) => s + q.pos, 0) / qualResults.length).toFixed(1)
            : '—';
    })();

    content.innerHTML = `
        <div class="driver-modal-header">
            <div class="driver-modal-flag">${flag}</div>
            <div>
                <div class="driver-modal-name" style="color:${teamColor}">${name}</div>
                <div class="driver-modal-team">${team} · ${nationality}</div>
                ${age ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">Age ${age}${dob ? ` (${dob.substring(0, 4)})` : ''}</div>` : ''}
            </div>
        </div>

        <div class="driver-modal-stats">
            <div class="driver-modal-stat">
                <div class="driver-modal-stat-val">${seasonPts}</div>
                <div class="driver-modal-stat-label">${state.year} Points</div>
            </div>
            <div class="driver-modal-stat">
                <div class="driver-modal-stat-val">${wins}</div>
                <div class="driver-modal-stat-label">Wins</div>
            </div>
            <div class="driver-modal-stat">
                <div class="driver-modal-stat-val">${podiums}</div>
                <div class="driver-modal-stat-label">Podiums</div>
            </div>
            <div class="driver-modal-stat">
                <div class="driver-modal-stat-val">${standing?.pos || '—'}</div>
                <div class="driver-modal-stat-label">Position</div>
            </div>
            <div class="driver-modal-stat">
                <div class="driver-modal-stat-val">${avgPos}</div>
                <div class="driver-modal-stat-label">Avg Finish</div>
            </div>
            <div class="driver-modal-stat">
                <div class="driver-modal-stat-val">${avgQuali}</div>
                <div class="driver-modal-stat-label">Avg Quali</div>
            </div>
        </div>

        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:0.78rem;color:var(--text-secondary);">
            <span>🏎️ ${driverRaces.length} races</span>
            <span>🔧 ${dnfs} DNFs</span>
            ${state.fastestLap?.driverCode === driverCode ? '<span style="color:#bf3eff">⚡ Fastest Lap holder</span>' : ''}
        </div>

        ${driverRaces.length > 0 ? `
        <div style="margin-top:16px;">
            <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Points per Race</div>
            <div style="display:flex;gap:2px;align-items:flex-end;height:40px;">
                ${driverRaces.slice(-10).map(r => {
        const h = Math.round((r.points / 26) * 40);
        return `<div title="R${r.round}: ${r.points} pts (P${r.pos})"
                        style="flex:1;height:${Math.max(h, 2)}px;background:${teamColor};border-radius:2px 2px 0 0;opacity:0.8;cursor:default;"></div>`;
    }).join('')}
            </div>
            <div style="font-size:0.6rem;color:var(--text-muted);margin-top:3px;">Last ${Math.min(10, driverRaces.length)} races</div>
        </div>` : ''}
    `;
}

function closeDriverModal(event) {
    if (event.target === document.getElementById('driverModal')) {
        document.getElementById('driverModal').classList.remove('active');
    }
}

// ==========================================
// NEW FEATURES v5
// ==========================================

// ---- Sprint Race Results ----
function renderSprintResults() {
    const container = document.getElementById('sprintContent');
    if (!container) return;
    if (state.sprintResults.length === 0) return;

    let html = `<div class="sprint-results-list">`;
    state.sprintResults.forEach(r => {
        const teamColor = getTeamColor(r.team);
        const posClass = r.pos <= 3 ? `p${r.pos}` : '';
        html += `<div class="sprint-result-item">
            <div class="sprint-pos ${posClass}">${r.pos}</div>
            <div class="team-color-bar" style="background:${teamColor};height:20px;width:3px;border-radius:2px;flex-shrink:0;"></div>
            <div style="flex:1">
                <div style="font-weight:600;font-size:0.8rem;" class="driver-clickable" onclick="openDriverModal('${r.code}')">${r.name}</div>
                <div style="font-size:0.68rem;color:${teamColor};">${r.team}</div>
            </div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--text-secondary);">${r.time}</div>
            ${r.points > 0 ? `<div style="font-size:0.68rem;color:var(--f1-yellow);font-weight:600;">+${r.points}</div>` : ''}
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

// ---- Circuit Records (fetches from Jolpica) ----
async function renderCircuitRecords() {
    const container = document.getElementById('circuitRecordsContent');
    if (!container || !state.lastCircuitId) return;

    const [fastestData, qualiRecordData] = await Promise.all([
        fetchJSON(`${API_BASE}/circuits/${state.lastCircuitId}/fastest/1/results.json?limit=1`),
        fetchJSON(`${API_BASE}/circuits/${state.lastCircuitId}/qualifying/1/results.json?limit=1`)
    ]);

    let html = '<div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">🏆 Circuit Records</div>';
    html += '<div class="circuit-records-strip">';

    if (fastestData?.MRData?.RaceTable?.Races?.length > 0) {
        const race = fastestData.MRData.RaceTable.Races[0];
        const res = race.Results?.[0];
        const fl = res?.FastestLap;
        if (fl) {
            html += `<div class="circuit-record-badge">
                <div class="cr-label">Race Fastest Lap</div>
                <div class="cr-value">${fl.Time?.time || '—'}</div>
                <div class="cr-holder">${res.Driver?.familyName || '—'} (${race.season})</div>
            </div>`;
        }
    }

    if (qualiRecordData?.MRData?.RaceTable?.Races?.length > 0) {
        const race = qualiRecordData.MRData.RaceTable.Races[0];
        const q = race.QualifyingResults?.[0];
        if (q) {
            const bestQ = q.Q3 || q.Q2 || q.Q1 || '—';
            html += `<div class="circuit-record-badge">
                <div class="cr-label">Pole Record</div>
                <div class="cr-value">${bestQ}</div>
                <div class="cr-holder">${q.Driver?.familyName || '—'} (${race.season})</div>
            </div>`;
        }
    }

    html += '</div>';
    container.innerHTML = html;
}

// ---- Driver Nationality Grid ----
function renderNationalityGrid() {
    const container = document.getElementById('nationalityContent');
    if (!container) return;

    const allDrivers = state.driverStandings.length > 0 ? state.driverStandings : [];
    if (allDrivers.length === 0) {
        showEmptyState(container, 'Driver data not available.');
        return;
    }

    // Group by nationality
    const byNat = {};
    allDrivers.forEach(d => {
        const nat = d.nationality || 'Unknown';
        if (!byNat[nat]) byNat[nat] = [];
        byNat[nat].push(d);
    });

    let html = '<div class="nationality-grid">';
    Object.entries(byNat).sort((a, b) => b[1].length - a[1].length).forEach(([nat, drivers]) => {
        const flag = COUNTRY_FLAGS[nat] || '🏳️';
        const teamColor = getTeamColor(drivers[0].team);
        const driverList = drivers.map(d => d.name.split(' ').pop()).join(', ');
        html += `<div class="nationality-card" onclick="openDriverModal('${drivers[0].code}')">
            <div class="nationality-flag-big">${flag}</div>
            <div class="nationality-info">
                <div class="nationality-country">${nat}</div>
                <div class="nationality-drivers">${driverList}</div>
            </div>
            <div style="width:3px;height:30px;background:${teamColor};border-radius:2px;margin-left:4px;"></div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

// ---- Qualifying Gap to Pole ----
function renderQualiGap() {
    const container = document.getElementById('qualiGapContent');
    if (!container) return;

    if (state.lastRaceQuali.length === 0) {
        showEmptyState(container, 'Qualifying data loading...');
        return;
    }

    // Parse best Q time to seconds for gap calculation
    const parseTime = (t) => {
        if (!t) return null;
        const parts = t.split(':');
        if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        return parseFloat(t);
    };

    const driversWithTime = state.lastRaceQuali.map(q => {
        const best = q.q3 || q.q2 || q.q1;
        return { ...q, bestTime: parseTime(best), bestStr: best };
    }).filter(q => q.bestTime !== null);

    if (driversWithTime.length === 0) {
        showEmptyState(container, 'Qualifying times not available yet.');
        return;
    }

    const poleTime = driversWithTime[0].bestTime;
    const maxGap = driversWithTime[driversWithTime.length - 1].bestTime - poleTime || 1;

    let html = '<div class="quali-gap-list">';
    driversWithTime.slice(0, 15).forEach((q, i) => {
        const gap = q.bestTime - poleTime;
        const gapStr = i === 0 ? 'POLE' : `+${gap.toFixed(3)}`;
        const barWidth = i === 0 ? 0 : (gap / maxGap) * 100;
        const teamColor = getTeamColor(q.team);
        html += `<div class="quali-gap-row ${i === 0 ? 'pole' : ''}">
            <div class="quali-gap-pos">${q.pos}</div>
            <div class="quali-gap-name driver-clickable" onclick="openDriverModal('${q.code}')" style="color:${i === 0 ? 'var(--f1-yellow)' : ''}">${q.name.split(' ').pop()}</div>
            <div class="quali-gap-bar-wrap">
                <div class="quali-gap-bar" style="width:${barWidth}%;background:${teamColor}"></div>
            </div>
            <div class="quali-gap-time" style="color:${i === 0 ? 'var(--f1-yellow)' : ''}">${gapStr}</div>
        </div>`;
    });
    html += `</div><div style="font-size:0.65rem;color:var(--text-muted);margin-top:8px;">Pole: ${driversWithTime[0].name} — ${driversWithTime[0].bestStr}</div>`;
    container.innerHTML = html;
}

// ---- Sector Times Breakdown (OpenF1) ----
function renderSectorTimes() {
    const container = document.getElementById('sectorTimesContent');
    if (!container) return;

    if (!state.sectorData || state.sectorData.length === 0) {
        showEmptyState(container, 'Sector data loading from OpenF1...');
        return;
    }

    const top10 = state.sectorData.slice(0, 10);

    // Find best sector across all drivers
    const bestS1 = Math.min(...top10.map(d => d.s1));
    const bestS2 = Math.min(...top10.map(d => d.s2));
    const bestS3 = Math.min(...top10.map(d => d.s3));
    const theoreticalBest = bestS1 + bestS2 + bestS3;

    const fmt = (s) => {
        const m = Math.floor(s / 60);
        const sec = (s % 60).toFixed(3);
        return m > 0 ? `${m}:${sec.padStart(6, '0')}` : sec;
    };

    let html = `<table class="sector-table"><thead><tr>
        <th>Driver</th>
        <th>S1</th><th>S2</th><th>S3</th>
        <th>Best Lap</th>
    </tr></thead><tbody>`;

    top10.forEach(d => {
        const total = d.s1 + d.s2 + d.s3;
        html += `<tr>
            <td><span class="driver-clickable" onclick="openDriverModal('${String(d.driverNum)}')">
                #${d.driverNum}
            </span></td>
            <td class="${d.s1 === bestS1 ? 'sector-purple' : 'sector-normal'}">${fmt(d.s1)}</td>
            <td class="${d.s2 === bestS2 ? 'sector-purple' : 'sector-normal'}">${fmt(d.s2)}</td>
            <td class="${d.s3 === bestS3 ? 'sector-purple' : 'sector-normal'}">${fmt(d.s3)}</td>
            <td class="sector-normal">${fmt(total)}</td>
        </tr>`;
    });

    html += `</tbody></table>
    <div class="best-lap-banner">
        <span>⚡</span>
        <span>Theoretical Best Lap:</span>
        <span class="best-lap-time">${fmt(theoreticalBest)}</span>
        <span style="font-size:0.68rem;color:var(--text-muted);">(best S1+S2+S3 composite)</span>
    </div>`;

    container.innerHTML = html;
}

// ---- Top Speed Rankings (OpenF1 speed trap) ----
function renderTopSpeed() {
    const container = document.getElementById('topSpeedContent');
    if (!container) return;

    if (!state.speedTrapData || state.speedTrapData.length === 0) {
        showEmptyState(container, 'Speed trap data loading from OpenF1...');
        return;
    }

    const top10 = state.speedTrapData.slice(0, 10);
    const maxSpeed = top10[0].topSpeed;

    let html = '<div class="speed-list">';
    top10.forEach((d, i) => {
        const barPct = (d.topSpeed / maxSpeed) * 100;
        html += `<div class="speed-row">
            <div class="speed-rank ${i === 0 ? 'gold' : ''}">${i + 1}</div>
            <div class="speed-name">#${d.driverNum}</div>
            <div class="speed-bar-wrap"><div class="speed-bar" style="width:${barPct}%"></div></div>
            <div class="speed-val">${d.topSpeed}</div>
            <div class="speed-unit">km/h</div>
        </div>`;
    });
    html += '</div>';
    html += `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:10px;">⚡ Top speed registered at speed trap — Last Race</div>`;
    container.innerHTML = html;
}

// ---- Tyre Degradation Model ----
function renderTyreDegradation() {
    const container = document.getElementById('tyreDegContent');
    if (!container) return;

    if (!state.lapTimesData || state.lapTimesData.length === 0) {
        showEmptyState(container, 'Tyre degradation data loading from OpenF1...');
        return;
    }

    // We need stints to match laps to compounds
    if (!state.tyreStints || state.tyreStints.length === 0) {
        showEmptyState(container, 'Tyre stint data needed for degradation model...');
        return;
    }

    // Build compound -> [lap_times by tyre age] mapping using stints + laps
    const compoundLaps = {};
    state.tyreStints.forEach(stint => {
        const compound = (stint.compound || 'UNKNOWN').toUpperCase();
        if (compound === 'UNKNOWN' || compound === 'TEST_UNKNOWN') return;
        if (!compoundLaps[compound]) compoundLaps[compound] = [];

        // Find laps from this driver in this stint range
        const driverLaps = state.lapTimesData.filter(l =>
            l.driver_number === stint.driver_number &&
            l.lap_number >= (stint.lap_start || 1) &&
            l.lap_number <= (stint.lap_end || 99) &&
            l.lap_duration > 60 && l.lap_duration < 300
        );

        // Tyre age = lap within stint (starting at 1)
        driverLaps.forEach(l => {
            const age = l.lap_number - (stint.lap_start || 1) + 1;
            if (age > 0) compoundLaps[compound].push({ age, time: l.lap_duration });
        });
    });

    const compoundColors = { SOFT: '#e8002d', MEDIUM: '#ffd700', HARD: '#e0e0e0', INTERMEDIATE: '#39b54a', WET: '#0072ff' };

    let html = '<div class="tyre-deg-grid">';
    Object.entries(compoundLaps).forEach(([compound, laps]) => {
        if (laps.length < 3) return;

        // Sort by tyre age and compute average deg rate (lap time increase per lap)
        const byAge = {};
        laps.forEach(l => {
            if (!byAge[l.age]) byAge[l.age] = [];
            byAge[l.age].push(l.time);
        });

        const ages = Object.keys(byAge).map(Number).sort((a, b) => a - b);
        if (ages.length < 2) return;

        const avgByAge = ages.map(age => ({
            age,
            avg: byAge[age].reduce((s, t) => s + t, 0) / byAge[age].length
        }));

        // Linear regression for deg rate
        const n = avgByAge.length;
        const sumX = avgByAge.reduce((s, p) => s + p.age, 0);
        const sumY = avgByAge.reduce((s, p) => s + p.avg, 0);
        const sumXY = avgByAge.reduce((s, p) => s + p.age * p.avg, 0);
        const sumX2 = avgByAge.reduce((s, p) => s + p.age * p.age, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const degPer10 = slope * 10;

        const color = compoundColors[compound] || '#888';
        html += `<div class="tyre-deg-compound" style="border-color:${color}22;">
            <div class="tyre-deg-compound-name" style="color:${color}">${compound}</div>
            <div class="tyre-deg-rate">${degPer10 > 0 ? '+' : ''}${degPer10.toFixed(2)}s</div>
            <div class="tyre-deg-unit">per 10 laps degradation</div>
            <div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px;">${laps.length} laps analyzed</div>
        </div>`;
    });
    html += '</div>';
    html += '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:10px;">📊 Linear regression over tyre age • Positive = slower per lap</div>';
    container.innerHTML = html;
}

// ---- Weather Card (OpenF1) ----
function renderWeather() {
    const container = document.getElementById('weatherContent');
    if (!container) return;

    // Add tooltip to its parent card header (dynamically)
    const card = container.closest('.card');
    if (card) {
        const title = card.querySelector('.card-title');
        if (title && !title.querySelector('.info-tooltip')) {
            title.innerHTML += `<span class="info-tooltip">?<span class="tooltip-text">Real-time track conditions from OpenF1 sensors. Air/Track temperature and rainfall probability.</span></span>`;
        }
    }

    if (!state.weather || state.weather.length === 0) {
        showEmptyState(container, 'Weather data loading from OpenF1...');
        return;
    }

    const w = state.weatherData[0];
    const isRaining = w.rainfall > 0;
    const windDir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((w.wind_direction || 0) % 360) / 45) % 8];

    const html = `
        <div class="weather-grid">
            <div class="weather-item">
                <div class="weather-icon">🌡️</div>
                <div class="weather-value">${(w.air_temperature || 0).toFixed(1)}°</div>
                <div class="weather-label">Air Temp</div>
            </div>
            <div class="weather-item">
                <div class="weather-icon">🏁</div>
                <div class="weather-value">${(w.track_temperature || 0).toFixed(1)}°</div>
                <div class="weather-label">Track Temp</div>
            </div>
            <div class="weather-item ${isRaining ? 'weather-rain' : ''}">
                <div class="weather-icon">${isRaining ? '🌧️' : '☀️'}</div>
                <div class="weather-value">${isRaining ? w.rainfall?.toFixed(1) + 'mm' : 'DRY'}</div>
                <div class="weather-label">${isRaining ? 'Rainfall' : 'Conditions'}</div>
            </div>
            <div class="weather-item">
                <div class="weather-icon">💧</div>
                <div class="weather-value">${(w.humidity || 0).toFixed(0)}%</div>
                <div class="weather-label">Humidity</div>
            </div>
            <div class="weather-item">
                <div class="weather-icon">💨</div>
                <div class="weather-value">${(w.wind_speed || 0).toFixed(1)}</div>
                <div class="weather-label">Wind m/s ${windDir}</div>
            </div>
            <div class="weather-item">
                <div class="weather-icon">🌬️</div>
                <div class="weather-value">${w.pressure ? w.pressure.toFixed(0) : '—'}</div>
                <div class="weather-label">Pressure hPa</div>
            </div>
        </div>
        <div style="font-size:0.65rem;color:var(--text-muted);margin-top:10px;">📡 OpenF1 weather data — mid-race sample</div>
    `;
    container.innerHTML = html;
}

// ---- Strategy Lab: Pit Stop Optimizer ----
function renderStrategyLab() {
    const container = document.getElementById('strategySimContent');
    if (!container) return;

    const html = `
        <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:16px;">
            Configure race parameters and calculate the optimal pit stop strategy based on tyre degradation data.
        </div>

        <div class="strategy-control-row">
            <label class="strategy-label">Race Length</label>
            <input class="strategy-input" id="strat-laps" type="number" value="58" min="20" max="80" style="width:70px;">
            <span style="font-size:0.75rem;color:var(--text-muted);">laps</span>
        </div>
        <div class="strategy-control-row">
            <label class="strategy-label">Pit Stop Loss</label>
            <input class="strategy-input" id="strat-pit-loss" type="number" value="22" min="15" max="35" style="width:70px;">
            <span style="font-size:0.75rem;color:var(--text-muted);">seconds</span>
        </div>
        <div class="strategy-control-row">
            <label class="strategy-label">Strategy</label>
            <select class="strategy-select" id="strat-stops">
                <option value="1">1 Stop</option>
                <option value="2" selected>2 Stop</option>
                <option value="3">3 Stop</option>
            </select>
        </div>
        <div class="strategy-control-row">
            <label class="strategy-label">Start Compound</label>
            <select class="strategy-select" id="strat-c1">
                <option value="MEDIUM" selected>Medium</option>
                <option value="SOFT">Soft</option>
                <option value="HARD">Hard</option>
            </select>
        </div>
        <button class="strategy-btn" onclick="calculateStrategy()">⚙️ CALCULATE</button>
        <div id="strategyResult"></div>
    `;
    container.innerHTML = html;
}

function calculateStrategy() {
    const laps = parseInt(document.getElementById('strat-laps')?.value || 58);
    const pitLoss = parseFloat(document.getElementById('strat-pit-loss')?.value || 22);
    const stops = parseInt(document.getElementById('strat-stops')?.value || 2);
    const startCompound = document.getElementById('strat-c1')?.value || 'MEDIUM';
    const result = document.getElementById('strategyResult');
    if (!result) return;

    // Tyre deg rates (from state if available, else use defaults)
    const getDeg = (compound) => {
        // These are seconds per 10 laps from the model
        const defaults = { SOFT: 0.8, MEDIUM: 0.4, HARD: 0.2, INTERMEDIATE: 0.3, WET: 0.35 };
        return defaults[compound] || 0.4;
    };

    // Calculate optimal stint lengths
    const stintLaps = Math.floor(laps / (stops + 1));
    const compounds = [startCompound];

    // Alternate between compounds
    const compoundOrder = startCompound === 'SOFT'
        ? ['SOFT', 'MEDIUM', 'HARD']
        : startCompound === 'MEDIUM'
            ? ['MEDIUM', 'HARD', 'SOFT']
            : ['HARD', 'MEDIUM', 'SOFT'];

    for (let i = 1; i <= stops; i++) {
        compounds.push(compoundOrder[i % 3]);
    }

    // Simulate total time
    let totalDeg = 0;
    let stintStartLap = 1;
    const stintPlan = [];

    for (let i = 0; i <= stops; i++) {
        const isLast = i === stops;
        const stintEnd = isLast ? laps : stintStartLap + stintLaps - 1;
        const stintLen = stintEnd - stintStartLap + 1;
        const compound = compounds[i];
        const degRate = getDeg(compound) / 10; // per lap
        const stintDeg = (stintLen * (stintLen - 1) / 2) * degRate;
        totalDeg += stintDeg;
        stintPlan.push({ num: i + 1, compound, from: stintStartLap, to: stintEnd, laps: stintLen });
        stintStartLap = stintEnd + 1;
    }

    const totalPitLoss = stops * pitLoss;
    const totalTime = totalDeg + totalPitLoss;

    const compoundBadge = (c) => {
        const colors = { SOFT: '#e8002d', MEDIUM: '#ffd700', HARD: '#e0e0e0', INTERMEDIATE: '#39b54a', WET: '#0072ff' };
        return `<span class="tyre-stint tyre-${c}" style="flex:none;padding:2px 8px;font-size:0.65rem;">${c[0]}</span>`;
    };

    let html = `<div class="strategy-result">
        <div class="strategy-result-title">📋 Optimal ${stops}-Stop Strategy</div>`;

    stintPlan.forEach(s => {
        html += `<div class="strategy-stint-row">
            <div class="strategy-stint-num">${s.num}</div>
            <div class="strategy-stint-compound">${compoundBadge(s.compound)} ${s.compound}</div>
            <div style="flex:1;font-size:0.75rem;color:var(--text-secondary);">Laps ${s.from}–${s.to} (${s.laps} laps)</div>
        </div>`;
    });

    html += `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border-subtle);font-size:0.78rem;display:flex;gap:16px;flex-wrap:wrap;">
        <span>⏱️ Pit time lost: <strong style="color:var(--f1-yellow)">${totalPitLoss.toFixed(0)}s</strong></span>
        <span>📉 Deg penalty: <strong style="color:var(--f1-cyan)">${totalDeg.toFixed(1)}s</strong></span>
        <span>Total estimate: <strong style="color:var(--f1-red)">${(totalTime / 60).toFixed(0)}m ${(totalTime % 60).toFixed(0)}s</strong></span>
    </div></div>`;

    result.innerHTML = html;
}

// ---- Undercut Analysis ----
function renderUndercutAnalysis() {
    const container = document.getElementById('underCutContent');
    if (!container) return;

    if (state.lastRaceResults.length === 0) {
        showEmptyState(container, 'Race data needed for undercut analysis.');
        return;
    }

    // Build undercut windows from pit stop data + qualifying gap
    const top8 = state.lastRaceResults.slice(0, 8);

    let html = `
        <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:12px;">
            Analysis of gaps where an undercut was/could be viable — based on qualifying pace deltas and pit window timing.
        </div>
        <table class="undercut-table"><thead><tr>
            <th>Driver</th><th>Avg Gap (s)</th><th>Pit Stops</th><th>Undercut Window</th>
        </tr></thead><tbody>
    `;

    top8.forEach((r, i) => {
        const qualiEntry = state.lastRaceQuali.find(q => q.code === r.code);
        const pitEntry = state.pitStops.find(p => p.code === r.code);
        const stops = pitEntry?.stopCount || '?';

        let gapStr = '—';
        let window = '<span class="undercut-none">—</span>';

        if (qualiEntry && i > 0) {
            const prevQ = state.lastRaceQuali.find(q => q.code === top8[i - 1].code);
            const parseT = t => {
                if (!t) return null;
                const p = t.split(':');
                return p.length === 2 ? parseFloat(p[0]) * 60 + parseFloat(p[1]) : parseFloat(t);
            };
            const myT = parseT(qualiEntry.q3 || qualiEntry.q2 || qualiEntry.q1);
            const prevT = parseT(prevQ?.q3 || prevQ?.q2 || prevQ?.q1);
            if (myT && prevT) {
                const gap = (myT - prevT).toFixed(3);
                gapStr = `+${gap}s`;
                const gapNum = parseFloat(gap);
                if (pitEntry && gapNum < pitEntry.bestDuration + 5) {
                    window = `<span class="undercut-potential">✅ Viable (~${pitEntry.bestDuration.toFixed(1)}s stop)</span>`;
                } else {
                    window = '<span class="undercut-none">❌ Too slow</span>';
                }
            }
        }

        const teamColor = getTeamColor(r.team);
        html += `<tr>
            <td>
                <span style="display:inline-block;width:3px;height:12px;background:${teamColor};border-radius:1px;margin-right:6px;vertical-align:middle;"></span>
                <span class="driver-clickable" onclick="openDriverModal('${r.code}')">${r.name.split(' ').pop()}</span>
            </td>
            <td style="font-family:'JetBrains Mono',monospace;font-size:0.72rem;">${gapStr}</td>
            <td style="text-align:center;">${stops}</td>
            <td>${window}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    html += '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:10px;">📊 Based on qualifying pace deltas vs pit stop duration</div>';
    container.innerHTML = html;
}

// ==========================================
// BET EDGE INTELLIGENCE - v6
// ==========================================

// ---- 1. TEAMMATE BATTLE TRACKER ----
function renderTeammateBattle() {
    const container = document.getElementById('teammateBattleContent');
    if (!container) return;

    if (state.raceResults.length === 0) {
        showEmptyState(container, 'Race data needed for H2H analysis.');
        return;
    }

    // Group drivers by team — use raceResults as data source (reliable for cross‑year fallback)
    const teamDriverMap = {};
    state.raceResults.forEach(r => {
        if (!r.team || r.team === 'Unknown') return;
        if (!teamDriverMap[r.team]) teamDriverMap[r.team] = new Set();
        teamDriverMap[r.team].add(r.driverCode);
    });

    // Convert to usable driver objects with display names
    const teams = {};
    Object.entries(teamDriverMap).forEach(([team, driverCodes]) => {
        if (driverCodes.size < 2) return;
        const [code1, code2] = [...driverCodes];
        const findDriver = code => {
            const sd = state.driverStandings.find(d => d.code === code);
            const rr = state.raceResults.find(r => r.driverCode === code);
            return {
                code,
                name: sd?.name || rr?.driverName || code,
                team
            };
        };
        teams[team] = [findDriver(code1), findDriver(code2)];
    });

    const completedRounds = [...new Set(state.raceResults.map(r => r.round))];

    let html = '<div class="battle-list">';

    Object.entries(teams).forEach(([team, drivers]) => {
        if (drivers.length < 2) return;
        const [d1, d2] = drivers;
        const teamColor = getTeamColor(team);

        // Qualifying H2H
        let qD1Wins = 0, qD2Wins = 0;
        completedRounds.forEach(round => {
            const q1 = state.allQualiResults.find(q => q.round === round && q.driverCode === d1.code);
            const q2 = state.allQualiResults.find(q => q.round === round && q.driverCode === d2.code);
            if (q1 && q2) { if (q1.pos < q2.pos) qD1Wins++; else if (q2.pos < q1.pos) qD2Wins++; }
        });

        // Race H2H (both must finish)
        let rD1Wins = 0, rD2Wins = 0;
        completedRounds.forEach(round => {
            const r1 = state.raceResults.find(r => r.round === round && r.driverCode === d1.code);
            const r2 = state.raceResults.find(r => r.round === round && r.driverCode === d2.code);
            if (r1 && r2 && !r1.dnf && !r2.dnf) {
                if (r1.pos < r2.pos) rD1Wins++; else if (r2.pos < r1.pos) rD2Wins++;
            }
        });

        const qTotal = qD1Wins + qD2Wins || 1;
        const rTotal = rD1Wins + rD2Wins || 1;
        const qD1Pct = Math.round((qD1Wins / qTotal) * 100);
        const rD1Pct = Math.round((rD1Wins / rTotal) * 100);

        const qualiWinner = qD1Wins > qD2Wins ? d1.name.split(' ').pop() : qD2Wins > qD1Wins ? d2.name.split(' ').pop() : 'Tied';
        const raceWinner = rD1Wins > rD2Wins ? d1.name.split(' ').pop() : rD2Wins > rD1Wins ? d2.name.split(' ').pop() : 'Tied';

        html += `<div class="battle-row">
            <div class="battle-team-name" style="color:${teamColor}">${team}</div>

            <div class="battle-h2h-bar">
                <div class="battle-driver-name" onclick="openDriverModal('${d1.code}')">${d1.name.split(' ').pop()}</div>
                <div class="battle-bar-wrap">
                    <div class="battle-bar-left" style="width:${qD1Pct}%;background:${teamColor};">${qD1Wins}</div>
                    <div class="battle-bar-right" style="width:${100 - qD1Pct}%;background:${teamColor}44;">${qD2Wins}</div>
                </div>
                <div class="battle-driver-name" style="text-align:right;" onclick="openDriverModal('${d2.code}')">${d2.name.split(' ').pop()}</div>
            </div>
            <div class="battle-label">
                <span>QUALIFYING — Winner: <span class="battle-winner">${qualiWinner}</span></span>
            </div>

            <div class="battle-h2h-bar" style="margin-top:6px;">
                <div class="battle-driver-name" onclick="openDriverModal('${d1.code}')">${d1.name.split(' ').pop()}</div>
                <div class="battle-bar-wrap">
                    <div class="battle-bar-left" style="width:${rD1Pct}%;background:${teamColor};">${rD1Wins}</div>
                    <div class="battle-bar-right" style="width:${100 - rD1Pct}%;background:${teamColor}44;">${rD2Wins}</div>
                </div>
                <div class="battle-driver-name" style="text-align:right;" onclick="openDriverModal('${d2.code}')">${d2.name.split(' ').pop()}</div>
            </div>
            <div class="battle-label">
                <span>RACE — Winner: <span class="battle-winner">${raceWinner}</span></span>
            </div>
        </div>`;
    });

    html += '</div>';
    html += `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:10px;">🤼 H2H counts over ${completedRounds.length} races — race H2H requires both to finish</div>`;
    container.innerHTML = html;
}

// ---- 2. DRIVER FORM INDEX ----
function renderDriverForm() {
    const container = document.getElementById('driverFormContent');
    if (!container) return;
    if (state.raceResults.length === 0) {
        showEmptyState(container, 'Race data loading...');
        return;
    }

    const completedRounds = [...new Set(state.raceResults.map(r => r.round))].sort((a, b) => a - b);
    const last5 = completedRounds.slice(-5);

    // Compute weighted form score for each driver: win=25, pod=15, pts=8, finish=3, dnf=-5
    const WEIGHTS = [0.15, 0.2, 0.25, 0.3, 0.4]; // older→newer

    const driverScores = state.driverStandings.map(d => {
        const roundResults = last5.map(round =>
            state.raceResults.find(r => r.round === round && r.driverCode === d.code)
        );

        let score = 0;
        const dots = roundResults.map((r, i) => {
            const w = WEIGHTS[i] || 0.4;
            if (!r) return { cls: 'form-dot-nc', label: '—', pts: 0 };
            if (r.dnf) {
                score -= 5 * w;
                return { cls: 'form-dot-miss', label: 'DNF', pts: -5 };
            }
            if (r.pos === 1) { score += 25 * w; return { cls: 'form-dot-win', label: 'W', pts: 25 }; }
            if (r.pos <= 3) { score += 15 * w; return { cls: 'form-dot-pod', label: `P${r.pos}`, pts: 15 }; }
            if (r.pos <= 10) { score += 8 * w; return { cls: 'form-dot-pts', label: `P${r.pos}`, pts: 8 }; }
            score += 3 * w;
            return { cls: 'form-dot-nc', label: `P${r.pos}`, pts: 3 };
        });

        const trend = dots.length >= 2 ? (dots[dots.length - 1].pts > dots[dots.length - 2].pts ? '↑' : dots[dots.length - 1].pts < dots[dots.length - 2].pts ? '↓' : '→') : '→';
        return { ...d, score: Math.round(score * 10) / 10, dots, trend };
    }).sort((a, b) => b.score - a.score);

    let html = '<div class="form-list">';
    driverScores.forEach((d, i) => {
        const scoreClass = d.score >= 20 ? 'hot' : d.score >= 10 ? 'good' : d.score >= 4 ? 'avg' : 'cold';
        html += `<div class="form-row">
            <div class="form-rank">${i + 1}</div>
            <div class="form-driver-name" onclick="openDriverModal('${d.code}')">${d.name.split(' ').pop()}</div>
            <div class="form-dots">
                ${d.dots.map(dot => `<div class="form-dot ${dot.cls}" title="${dot.label}">${dot.label === '—' ? '' : dot.label.startsWith('P') ? dot.label.slice(1) : dot.label}</div>`).join('')}
            </div>
            <div class="form-trend">${d.trend}</div>
            <div class="form-score ${scoreClass}">${d.score}</div>
        </div>`;
    });
    html += '</div>';
    html += `<div style="font-size:0.62rem;color:var(--text-muted);margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
        <span>🏆 Win=25pts</span><span>🥉 Podium=15pts</span><span>🔵 Points=8pts</span><span>❌ DNF=-5pts</span>
        <span style="margin-left:auto;">Recent races weighted higher</span>
    </div>`;
    container.innerHTML = html;
}

// ---- 3. DNF & RELIABILITY DASHBOARD ----
function renderDNFReliability() {
    const container = document.getElementById('dnfContent');
    if (!container) return;
    if (state.raceResults.length === 0) {
        showEmptyState(container, 'Race data loading...');
        return;
    }

    const completedRounds = [...new Set(state.raceResults.map(r => r.round))].length;

    // Build team map from actual race results data (reliable team names)
    const teamMap = {};
    state.raceResults.forEach(r => {
        if (!r.team || r.team === 'Unknown') return;
        if (!teamMap[r.team]) teamMap[r.team] = { drivers: {}, total: 0, dnfs: 0, team: r.team };
        if (!teamMap[r.team].drivers[r.driverCode]) {
            // Get display name from driverStandings if available
            const sd = state.driverStandings.find(d => d.code === r.driverCode);
            teamMap[r.team].drivers[r.driverCode] = {
                name: sd ? sd.name : r.driverName || r.driverCode,
                code: r.driverCode, dnfs: 0, races: 0
            };
        }
        teamMap[r.team].drivers[r.driverCode].races++;
        teamMap[r.team].total++;
        if (r.dnf) { teamMap[r.team].drivers[r.driverCode].dnfs++; teamMap[r.team].dnfs++; }
    });

    const teams = Object.values(teamMap).sort((a, b) => (a.dnfs / (a.total || 1)) - (b.dnfs / (b.total || 1)));

    let html = '<div class="dnf-grid">';
    teams.forEach(team => {
        const reliability = team.total > 0 ? ((1 - team.dnfs / team.total) * 100) : 100;
        const teamColor = getTeamColor(team.team);
        const barColor = reliability > 90 ? 'var(--f1-green)' : reliability > 75 ? '#ffd700' : 'rgba(220,40,0,0.8)';

        html += `<div class="dnf-team-card">
            <div class="dnf-team-name" style="color:${teamColor}">${team.team}</div>
            <div style="display:flex;justify-content:space-between;font-size:0.7rem;margin-bottom:4px;">
                <span style="color:var(--text-muted)">Reliability</span>
                <span style="color:${barColor};font-weight:700;font-family:'Orbitron',sans-serif;font-size:0.75rem;">${reliability.toFixed(0)}%</span>
            </div>
            <div class="dnf-reliability-bar-wrap">
                <div class="dnf-reliability-bar" style="width:${reliability}%;background:${barColor};"></div>
            </div>
            <div class="dnf-drivers-row">
                ${Object.values(team.drivers).map(d => `
                    <div class="dnf-driver-pill" onclick="openDriverModal('${d.code}')" style="cursor:pointer;">
                        ${d.name.split(' ').pop()}
                        <div class="dnf-count-badge ${d.dnfs === 0 ? 'zero' : ''}">${d.dnfs === 0 ? '✓' : d.dnfs + ' DNF'}</div>
                    </div>`).join('')}
            </div>
            ${team.dnfs > 0 ? `<div style="font-size:0.6rem;color:rgba(255,80,80,0.8);margin-top:6px;">⚠️ ${team.dnfs} DNF in ${Math.floor(team.total / 2)} races</div>` : ''}
        </div>`;
    });
    html += '</div>';
    html += `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:10px;">📊 ${completedRounds} races completed — sorted by reliability (best first)</div>`;
    container.innerHTML = html;
}

// ---- 4. PODIUM CONVERSION RATE ----
async function renderPodiumConversion() {
    const container = document.getElementById('podiumConversionContent');
    if (!container) return;

    if (!state.lastCircuitId) {
        showEmptyState(container, 'Circuit data not available.');
        return;
    }

    // Fetch last 10 races at this circuit
    const data = await fetchJSON(`${API_BASE}/circuits/${state.lastCircuitId}/results.json?limit=200`);

    if (!data?.MRData?.RaceTable?.Races?.length) {
        showEmptyState(container, 'No historical data for this circuit.');
        return;
    }

    // For each qualifying starting position (1-10), calculate % that converted to podium
    const races = data.MRData.RaceTable.Races.slice(-12); // last 12 editions
    const conversionMap = {}; // gridPos → {podiums, total}

    races.forEach(race => {
        (race.Results || []).forEach(r => {
            const grid = parseInt(r.grid);
            const pos = parseInt(r.position);
            if (grid < 1 || grid > 10) return;
            if (!conversionMap[grid]) conversionMap[grid] = { podiums: 0, total: 0 };
            conversionMap[grid].total++;
            if (pos <= 3) conversionMap[grid].podiums++;
        });
    });

    const positions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const podiumColors = ['#ffd700', '#c0c0c0', '#cd7f32', 'var(--f1-cyan)', 'var(--f1-blue)', '#888', '#777', '#666', '#555', '#444'];

    let html = `<div style="font-size:0.72rem;color:var(--text-secondary);margin-bottom:12px;">
        Grid position → podium probability at <strong>${state.lastRaceName || 'this circuit'}</strong> (last ${races.length} editions)
    </div>`;
    html += '<div class="podium-conv-grid">';

    positions.forEach((pos, idx) => {
        const conv = conversionMap[pos];
        const pct = conv ? Math.round((conv.podiums / conv.total) * 100) : 0;
        const color = podiumColors[idx];

        html += `<div class="podium-conv-col">
            <div class="podium-conv-pos">P${pos}</div>
            <div class="podium-conv-bar-wrap">
                <div class="podium-conv-bar" style="height:${pct}%;background:${color};min-height:${pct > 0 ? 4 : 0}px;"></div>
            </div>
            <div class="podium-conv-pct" style="color:${color}">${pct}%</div>
        </div>`;
    });

    html += '</div>';
    html += `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:8px;">🏆 P1 frontrow = highest historical podium conversion</div>`;
    container.innerHTML = html;
}

// ---- 5. CIRCUIT DNA ----
function renderCircuitDNA() {
    const container = document.getElementById('circuitDnaContent');
    if (!container) return;

    // Next race circuit lookup
    const nextRace = state.raceCalendar.find(r => r.status === 'upcoming' || r.status === 'next');
    const circuitName = nextRace?.circuit || state.lastRaceCircuit || 'Unknown';

    // Circuit DNA database — key data points per circuit
    const CIRCUIT_DNA = {
        'bahrain': { overtaking: 8, sc: 30, tyreWear: 7, puSensitivity: 6, drsZones: 3, note: 'Tyre degradation circuit — C3/C4/C5 compounds' },
        'jeddah': { overtaking: 7, sc: 65, tyreWear: 5, puSensitivity: 8, drsZones: 3, note: 'High SC probability — street circuit' },
        'albert_park': { overtaking: 6, sc: 55, tyreWear: 5, puSensitivity: 7, drsZones: 3, note: 'Safety Cars frequent here' },
        'suzuka': { overtaking: 4, sc: 40, tyreWear: 8, puSensitivity: 7, drsZones: 1, note: 'Technical, requires max downforce' },
        'shanghai': { overtaking: 7, sc: 35, tyreWear: 6, puSensitivity: 6, drsZones: 2, note: 'Good overtaking circuit' },
        'miami': { overtaking: 6, sc: 55, tyreWear: 6, puSensitivity: 7, drsZones: 3, note: 'Street-like surface' },
        'imola': { overtaking: 3, sc: 45, tyreWear: 6, puSensitivity: 7, drsZones: 1, note: 'Hard to overtake — quali crucial' },
        'monaco': { overtaking: 1, sc: 55, tyreWear: 2, puSensitivity: 3, drsZones: 1, note: 'Qualifying is the race — positions rarely change' },
        'villeneuve': { overtaking: 6, sc: 50, tyreWear: 6, puSensitivity: 6, drsZones: 3, note: 'Montreal wall of champions' },
        'circuit_gilles_villeneuve': { overtaking: 6, sc: 50, tyreWear: 6, puSensitivity: 6, drsZones: 3, note: 'Montreal wall of champions' },
        'red_bull_ring': { overtaking: 7, sc: 30, tyreWear: 5, puSensitivity: 8, drsZones: 2, note: 'Power circuit — engine modes decisive' },
        'silverstone': { overtaking: 7, sc: 35, tyreWear: 9, puSensitivity: 7, drsZones: 2, note: 'Very high tyre wear — 2-stop likely' },
        'hungaroring': { overtaking: 3, sc: 35, tyreWear: 7, puSensitivity: 5, drsZones: 1, note: 'Monaco without walls — qualifying everything' },
        'spa': { overtaking: 8, sc: 50, tyreWear: 5, puSensitivity: 9, drsZones: 2, note: 'High power sensitivity — weather factor' },
        'zandvoort': { overtaking: 2, sc: 40, tyreWear: 7, puSensitivity: 6, drsZones: 1, note: 'Last edition 2026 — few overtaking spots' },
        'monza': { overtaking: 8, sc: 50, tyreWear: 3, puSensitivity: 10, drsZones: 2, note: 'Ultimate power circuit — engine is everything' },
        // 🆕 2026 NEW CIRCUIT — The Madring, Madrid Spain
        'madrid': { overtaking: 6, sc: 60, tyreWear: 6, puSensitivity: 7, drsZones: 3, note: '🆕 2026 debut — street circuit, high SC probability' },
        'mad_ring': { overtaking: 6, sc: 60, tyreWear: 6, puSensitivity: 7, drsZones: 3, note: '🆕 2026 debut — The Madring, Madrid' },
        'ifema': { overtaking: 6, sc: 60, tyreWear: 6, puSensitivity: 7, drsZones: 3, note: '🆕 2026 debut — The Madring, Madrid' },
        // Spain Round 1 (Barcelona remains on calendar)
        'catalunya': { overtaking: 5, sc: 30, tyreWear: 7, puSensitivity: 7, drsZones: 2, note: 'Barcelona — good test for overall package' },
        'baku': { overtaking: 7, sc: 65, tyreWear: 4, puSensitivity: 8, drsZones: 2, note: 'Highest SC probability of permanent circuits' },
        'marina_bay': { overtaking: 3, sc: 60, tyreWear: 5, puSensitivity: 4, drsZones: 3, note: 'Night street circuit — SC almost certain' },
        'losail': { overtaking: 6, sc: 25, tyreWear: 8, puSensitivity: 6, drsZones: 1, note: 'Extreme tyre degradation — 2-stop races' },
        'austin': { overtaking: 7, sc: 40, tyreWear: 7, puSensitivity: 7, drsZones: 2, note: 'COTA — balanced circuit, good racing' },
        'rodriguez': { overtaking: 5, sc: 35, tyreWear: 5, puSensitivity: 6, drsZones: 3, note: 'High altitude — low downforce, unique conditions' },
        'interlagos': { overtaking: 8, sc: 50, tyreWear: 6, puSensitivity: 7, drsZones: 2, note: 'Classic overtaking circuit — unpredictable weather' },
        'vegas': { overtaking: 6, sc: 55, tyreWear: 4, puSensitivity: 9, drsZones: 3, note: 'Street circuit — high speed, night, abrasive surface' },
        'yas_marina': { overtaking: 6, sc: 30, tyreWear: 5, puSensitivity: 7, drsZones: 3, note: 'Season finale circuit — clean races typical' }
    };

    // Match circuit — try circuitId first, then circuit name substring
    let dna = null;
    const circId = state.lastCircuitId;

    // Direct match by circuitId
    if (circId && CIRCUIT_DNA[circId]) {
        dna = CIRCUIT_DNA[circId];
    } else {
        // Partial match
        const circlower = (nextRace?.circuit || '').toLowerCase();
        const match = Object.entries(CIRCUIT_DNA).find(([key]) =>
            circlower.includes(key) || key.includes(circlower.split(' ')[0])
        );
        if (match) dna = match[1];
    }

    if (!dna) dna = { overtaking: 5, sc: 40, tyreWear: 5, puSensitivity: 6, drsZones: 2, note: 'Generic estimate' };

    const dnaItems = [
        { icon: '🏎️', label: 'Overtaking Index', value: dna.overtaking, max: 10, color: '#00e5ff', unit: '/10', sub: dna.overtaking >= 7 ? 'HIGH — races rarely settled in quali' : dna.overtaking <= 3 ? 'LOW — quali crucial' : 'MEDIUM' },
        { icon: '🚨', label: 'Safety Car Prob.', value: dna.sc, max: 100, color: dna.sc >= 55 ? '#ff4040' : dna.sc >= 40 ? '#ffd700' : '#00c851', unit: '%', sub: dna.sc >= 55 ? 'HIGH — bet safety car yes' : dna.sc >= 35 ? 'MODERATE' : 'LOW — usually clean' },
        { icon: '🛞', label: 'Tyre Wear', value: dna.tyreWear, max: 10, color: '#ffd700', unit: '/10', sub: dna.tyreWear >= 8 ? 'SEVERE — 2-stop likely' : dna.tyreWear <= 3 ? 'LOW — 1-stop easy' : 'MODERATE' },
        { icon: '⚡', label: 'PU Sensitivity', value: dna.puSensitivity, max: 10, color: '#bf3eff', unit: '/10', sub: dna.puSensitivity >= 8 ? 'HIGH — engine power = key' : 'Low downforce helps here' },
        { icon: '📡', label: 'DRS Zones', value: dna.drsZones, max: 3, color: '#00c851', unit: ' zones', sub: `${dna.drsZones} activation zones` }
    ];

    let html = `<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:12px;">
        🗺️ DNA profile for <strong style="color:var(--text-primary)">${nextRace?.circuit || circuitName}</strong> — ${nextRace?.country || ''}
    </div>`;
    html += '<div class="dna-grid">';
    dnaItems.forEach(item => {
        const pct = (item.value / item.max) * 100;
        html += `<div class="dna-card">
            <div class="dna-icon">${item.icon}</div>
            <div class="dna-label">${item.label}</div>
            <div class="dna-gauge"><div class="dna-gauge-fill" style="width:${pct}%;background:${item.color};"></div></div>
            <div class="dna-value" style="color:${item.color}">${item.value}${item.unit}</div>
            <div class="dna-subtext">${item.sub}</div>
        </div>`;
    });
    html += '</div>';
    html += `<div style="margin-top:12px;padding:10px 12px;background:rgba(255,140,0,0.06);border:1px solid rgba(255,140,0,0.2);border-radius:8px;font-size:0.78rem;">
        💡 <strong>Bet Insight:</strong> ${dna.note}
    </div>`;
    container.innerHTML = html;
}

// ---- 6. QUALIFYING → RACE POSITION DELTA ----
function renderQualiToRaceConversion() {
    const container = document.getElementById('qualiRaceConvContent');
    if (!container) return;

    if (state.allQualiResults.length === 0 || state.raceResults.length === 0) {
        showEmptyState(container, 'Need quali + race data for delta analysis.');
        return;
    }

    const rounds = [...new Set(state.raceResults.map(r => r.round))];

    // Compute per-driver average delta (racePos - qualiPos)
    const driverDeltas = {};
    state.driverStandings.forEach(d => {
        driverDeltas[d.code] = { code: d.code, name: d.name, team: d.team, deltas: [] };
    });

    rounds.forEach(round => {
        state.driverStandings.forEach(d => {
            const q = state.allQualiResults.find(r => r.round === round && r.driverCode === d.code);
            const r = state.raceResults.find(r => r.round === round && r.driverCode === d.code);
            if (q && r && r.pos && q.pos) {
                const isDNF = r.status && r.status !== 'Finished' && !r.status.startsWith('+');
                if (!isDNF) driverDeltas[d.code].deltas.push(r.pos - q.pos);
            }
        });
    });

    // Compute averages and sort
    const sorted = Object.values(driverDeltas)
        .filter(d => d.deltas.length > 0)
        .map(d => ({
            ...d,
            avg: d.deltas.reduce((s, v) => s + v, 0) / d.deltas.length,
            races: d.deltas.length
        }))
        .sort((a, b) => a.avg - b.avg);

    let html = '<div class="qr-list">';
    sorted.forEach(d => {
        const avg = d.avg;
        const deltaStr = avg === 0 ? '±0' : avg < 0 ? `+${Math.abs(avg).toFixed(1)}` : `-${avg.toFixed(1)}`;
        const cls = avg < -0.5 ? 'gain' : avg > 0.5 ? 'loss' : 'even';
        const arrow = avg < -0.5 ? '▲' : avg > 0.5 ? '▼' : '→';
        const teamColor = getTeamColor(d.team);
        html += `<div class="qr-row">
            <div style="width:3px;height:14px;background:${teamColor};border-radius:1px;flex-shrink:0;"></div>
            <div class="qr-name" onclick="openDriverModal('${d.code}')">${d.name.split(' ').pop()}</div>
            <div class="qr-arrow" style="color:${cls === 'gain' ? 'var(--f1-green)' : cls === 'loss' ? 'rgba(255,60,40,0.9)' : 'var(--text-muted)'}">${arrow}</div>
            <div class="qr-delta ${cls}" title="${d.races} races">${deltaStr} pos</div>
        </div>`;
    });
    html += '</div>';
    html += `<div style="font-size:0.62rem;color:var(--text-muted);margin-top:10px;">
        ▲ = gains places in race vs quali • ▼ = loses places • Average over ${rounds.length} rounds
    </div>`;
    container.innerHTML = html;
}

// ---- 7. CHAMPIONSHIP PERMUTATIONS ----
function renderChampionshipPermutations() {
    const container = document.getElementById('champPermContent');
    if (!container) return;
    if (state.driverStandings.length === 0) {
        showEmptyState(container, 'Standings data loading...');
        return;
    }

    const leader = state.driverStandings[0];
    const completedRounds = [...new Set(state.raceResults.map(r => r.round))].length;
    // When using prev year data, remaining is for the CURRENT year upcoming season
    const isUsingPrevYear = !!state.betAnalysisYear;
    const remaining = isUsingPrevYear ? 24 : Math.max(0, (state.raceCalendar.length || 24) - completedRounds);
    const maxPtsPerRace = 26; // 25 + fastest lap
    const maxRemainingPts = remaining * maxPtsPerRace;
    const yearLabel = isUsingPrevYear ? `(${state.betAnalysisYear} final standings — ${state.year} season upcoming)` : '';

    let html = `<div class="champ-summary">
        <div class="champ-leader-name">👑 ${leader.name}</div>
        <div style="font-size:0.75rem;color:var(--text-secondary);">
            ${leader.points} pts — ${remaining} races in upcoming season — max ${maxRemainingPts} pts available
            ${yearLabel ? `<div style="margin-top:3px;color:var(--text-muted);font-size:0.65rem;">📊 Based on ${yearLabel}</div>` : ''}
        </div>
    </div>`;

    html += '<div class="champ-scenarios">';

    const top5 = state.driverStandings.slice(0, 5);
    top5.forEach((d, i) => {
        if (i === 0) return; // skip leader

        const gap = leader.points - d.points;
        const canCatch = d.points + maxRemainingPts > leader.points;
        const leaderCanSecure = remaining > 0 && gap > maxRemainingPts;

        let scenarioCls = 'champ-scenario-possible';
        let text = '';

        if (!canCatch) {
            scenarioCls = 'champ-scenario-impossible';
            text = `Mathematically eliminated — ${gap} pts behind, only ${maxRemainingPts} available`;
        } else if (leaderCanSecure) {
            scenarioCls = 'champ-scenario-likely';
            text = `Alive but ${leader.name} can clinch title soon`;
        } else {
            const racesNeeded = Math.ceil(gap / maxPtsPerRace);
            const ptsNeeded = gap + 1;
            text = `Needs to outscore ${leader.name.split(' ').pop()} by ${ptsNeeded} pts total — reachable in ${racesNeeded} perfect race${racesNeeded > 1 ? 's' : ''}`;
        }

        html += `<div class="champ-scenario ${scenarioCls}">
            <div class="champ-scenario-driver">${d.name} — ${d.points} pts (${gap > 0 ? '-' : '+'}${Math.abs(gap)})</div>
            <div class="champ-scenario-text">${text}</div>
        </div>`;
    });

    // Leader can clinch scenario
    if (remaining > 0) {
        const d2 = top5[1];
        const gapToP2 = leader.points - d2.points;
        const ptsToClinh = maxRemainingPts - gapToP2 + 1;
        if (ptsToClinh > 0 && ptsToClinh <= maxRemainingPts) {
            html += `<div class="champ-scenario champ-scenario-likely" style="border-color:rgba(255,215,0,0.4);">
                <div class="champ-scenario-driver" style="color:var(--f1-yellow);">🏆 ${leader.name} clinch scenario</div>
                <div class="champ-scenario-text">Can clinch title if ${d2.name.split(' ').pop()} scores ≤ ${Math.max(0, gapToP2 - 1)} more points than ${leader.name.split(' ').pop()}</div>
            </div>`;
        }
    }

    html += '</div>';
    html += `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:10px;">Max ${maxPtsPerRace} pts/race (win + fastest lap)</div>`;
    container.innerHTML = html;
}

// ---- 8. CIRCUIT HISTORY (async) ----
async function renderCircuitHistory() {
    const container = document.getElementById('circuitHistoryContent');
    if (!container) return;

    const circId = state.lastCircuitId;
    if (!circId) {
        showEmptyState(container, 'Circuit ID not available yet.');
        return;
    }

    container.innerHTML = `<div style="font-size:0.75rem;color:var(--text-muted);padding:10px;">⏳ Loading circuit history...</div>`;

    const data = await fetchJSON(`${API_BASE}/circuits/${circId}/results.json?limit=80`);
    if (!data?.MRData?.RaceTable?.Races?.length) {
        showEmptyState(container, 'No circuit history found.');
        return;
    }

    const last5Races = data.MRData.RaceTable.Races.slice(-5).reverse();

    let html = '<div class="circuit-history-list">';
    last5Races.forEach(race => {
        const winner = race.Results?.[0];
        if (!winner) return;
        const teamColor = getTeamColor(winner.Constructor?.name || '');
        const gapStr = race.Results?.[1]?.Time?.time ? `+${race.Results[1].Time.time}` : '';

        html += `<div class="circuit-win-row">
            <div class="circuit-win-year">${race.season}</div>
            <div style="width:3px;height:28px;background:${teamColor};border-radius:2px;flex-shrink:0;"></div>
            <div style="flex:1;">
                <div class="circuit-win-driver" onclick="openDriverModal('${winner.Driver?.code || ''}');" style="cursor:pointer;">
                    ${winner.Driver?.givenName} ${winner.Driver?.familyName}
                </div>
                <div class="circuit-win-team" style="color:${teamColor};">${winner.Constructor?.name}</div>
            </div>
            <div style="text-align:right;">
                ${gapStr ? `<div class="circuit-win-time">${gapStr} to P2</div>` : ''}
                <div style="font-size:0.6rem;color:var(--text-muted);">${race.raceName?.replace(/Grand Prix/, 'GP')}</div>
            </div>
        </div>`;
    });
    html += '</div>';
    html += `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:10px;">📜 Last 5 editions at this venue</div>`;
    container.innerHTML = html;
}
