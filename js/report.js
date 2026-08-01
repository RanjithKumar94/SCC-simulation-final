// ======================================
// report.js
// Post-exercise separation & spacing report
// ======================================

const CONFLICT_LATERAL_NM = 5;
const CONFLICT_VERTICAL_FT = 1000;
const BLIP_PROXIMITY_NM = 10;
const TERRAIN_MIN_FL = 65;
const TERRAIN_DISTANCE_NM = 30;

let acConflictLog = [];       // finalized aircraft-vs-aircraft conflicts
let blipProximityLog = [];    // finalized aircraft-vs-unknown-blip proximity events
let terrainLog = [];          // finalized terrain loss events
let landingLog = [];          // {callsign, timeSec, speed}
let spacingLog = [];          // finalized spacing between successive arrivals

let activeConflicts = {};       // key "A|B"       -> in-progress encounter
let activeBlipProximity = {};   // key "A|BLIP-n"  -> in-progress encounter
let activeTerrain = {};         // key callsign    -> in-progress encounter

function simTotalSeconds(){
    return simHour * 3600 + simMinute * 60 + simSecond;
}

function fmtClock(totalSec){

    const h = Math.floor(totalSec / 3600) % 24;
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    return String(h).padStart(2,"0") + ":" +
           String(m).padStart(2,"0") + ":" +
           String(s).padStart(2,"0");

}

function distNM(a, b){

    const dx = a.x - b.x;
    const dy = a.y - b.y;

    return Math.sqrt(dx*dx + dy*dy) / PIXELS_PER_NM;

}

// ======================================
// Called once per sim tick from main.js
// ======================================
function checkSeparation(){

    const now = simTotalSeconds();

    const allAircraft =
    [...(typeof aircraft !== "undefined" ? aircraft : []),
     ...(typeof departures !== "undefined" ? departures : [])]
    .filter(ac => ac.active);

    // ---- Aircraft vs Aircraft ----

    for(let i=0; i<allAircraft.length; i++){

        for(let j=i+1; j<allAircraft.length; j++){

            const a = allAircraft[i];
            const b = allAircraft[j];

            const key = a.callsign < b.callsign
                ? a.callsign + "|" + b.callsign
                : b.callsign + "|" + a.callsign;

            const lateral = distNM(a, b);
            const vertical = Math.abs(a.level - b.level) * 100;

            const inConflict =
                lateral < CONFLICT_LATERAL_NM &&
                vertical < CONFLICT_VERTICAL_FT;

            if(inConflict){

                if(!activeConflicts[key]){

                    activeConflicts[key] = {
                        a: a.callsign,
                        b: b.callsign,
                        startSec: now,
                        minLateral: lateral,
                        vertAtMin: vertical,
                        timeAtMinSec: now
                    };

                }
                else{

                    const c = activeConflicts[key];

                    if(lateral < c.minLateral){
                        c.minLateral = lateral;
                        c.vertAtMin = vertical;
                        c.timeAtMinSec = now;
                    }

                }

            }
            else if(activeConflicts[key]){

                acConflictLog.push(
                    Object.assign({}, activeConflicts[key], {endSec: now})
                );

                delete activeConflicts[key];

            }

        }

    }

    // ---- Aircraft vs Unknown Blip ----

    if(typeof unknownBlips !== "undefined"){

        allAircraft.forEach(ac=>{

            unknownBlips.forEach((blip, idx)=>{

                if(!blip.active) return;

                const key = ac.callsign + "|BLIP-" + idx;
                const lateral = distNM(ac, blip);

                const inProximity = lateral < BLIP_PROXIMITY_NM;

                if(inProximity){

                    if(!activeBlipProximity[key]){

                        activeBlipProximity[key] = {
                            ac: ac.callsign,
                            blip: "UNKNOWN-" + idx,
                            startSec: now,
                            minLateral: lateral,
                            timeAtMinSec: now
                        };

                    }
                    else{

                        const p = activeBlipProximity[key];

                        if(lateral < p.minLateral){
                            p.minLateral = lateral;
                            p.timeAtMinSec = now;
                        }

                    }

                }
                else if(activeBlipProximity[key]){

                    blipProximityLog.push(
                        Object.assign({}, activeBlipProximity[key], {endSec: now})
                    );

                    delete activeBlipProximity[key];

                }

            });

        });

    }

}

// ======================================
// Terrain loss - below FL65 beyond 30NM
// from CCB. Called once per sim tick.
// ======================================
function checkTerrain(){

    const now = simTotalSeconds();

    const allAircraft =
    [...(typeof aircraft !== "undefined" ? aircraft : []),
     ...(typeof departures !== "undefined" ? departures : [])]
    .filter(ac => ac.active);

    allAircraft.forEach(ac=>{

        const dx = ac.x - CCB.x;
        const dy = ac.y - CCB.y;
        const distFromCCB = Math.sqrt(dx*dx + dy*dy) / PIXELS_PER_NM;

        const inTerrainLoss =
            ac.level < TERRAIN_MIN_FL &&
            distFromCCB > TERRAIN_DISTANCE_NM;

        const key = ac.callsign;

        if(inTerrainLoss){

            if(!activeTerrain[key]){

                activeTerrain[key] = {
                    callsign: ac.callsign,
                    startSec: now,
                    minLevel: ac.level,
                    distAtMin: distFromCCB,
                    timeAtMinSec: now
                };

            }
            else{

                const t = activeTerrain[key];

                if(ac.level < t.minLevel){
                    t.minLevel = ac.level;
                    t.distAtMin = distFromCCB;
                    t.timeAtMinSec = now;
                }

            }

        }
        else if(activeTerrain[key]){

            terrainLog.push(
                Object.assign({}, activeTerrain[key], {endSec: now})
            );

            delete activeTerrain[key];

        }

    });

}

// ======================================
// Called once per landing (hooked from
// main.js/departure.js when ac.landed
// first goes true)
// ------------------------------------
// Every time an aircraft touches down,
// this looks at whichever OTHER aircraft
// is currently closest to touchdown (still
// airborne, inbound to the active runway)
// and records exactly how far out it is
// RIGHT NOW - not an after-the-fact
// estimate from two landing timestamps.
// Runs on every single landing, so the
// spacing log keeps building for the
// whole exercise, one entry per landing
// that actually had traffic behind it.
// ======================================
function logLanding(ac){

    const now = simTotalSeconds();

    landingLog.push({
        callsign: ac.callsign,
        timeSec: now,
        speed: ac.speed
    });

    if(typeof getTouchdownPoint !== "function" ||
       typeof activeRunwayDirection === "undefined"){
        return;
    }

    const touchdownPoint = getTouchdownPoint(activeRunwayDirection);

    const candidates =
    [...(typeof aircraft !== "undefined" ? aircraft : []),
     ...(typeof departures !== "undefined" ? departures : [])]
    .filter(other =>
        other !== ac &&
        other.active &&
        !other.landed &&
        (typeof isFlyingInboundToRunway !== "function" || isFlyingInboundToRunway(other))
    );

    if(candidates.length === 0) return;

    // The next aircraft in the sequence is whichever one is
    // physically closest to touchdown right now - not necessarily
    // the next one that was cleared, just the next one that will
    // actually arrive.
    let trailing = null;
    let trailingDistNM = Infinity;

    candidates.forEach(other=>{

        const dx = other.x - touchdownPoint.x;
        const dy = other.y - touchdownPoint.y;
        const distNM = Math.sqrt(dx*dx + dy*dy) / PIXELS_PER_NM;

        if(distNM < trailingDistNM){
            trailingDistNM = distNM;
            trailing = other;
        }

    });

    if(!trailing) return;

    let rating;

    if(trailingDistNM < 8){
        rating = "CAUTION - below 8 NM";
    }
    else if(trailingDistNM <= 10){
        rating = "Very good";
    }
    else if(trailingDistNM <= 12){
        rating = "Good (can improve)";
    }
    else if(trailingDistNM <= 14){
        rating = "Satisfactory";
    }
    else{
        rating = "Needs attention";
    }

    // Estimated remaining time for the trailing aircraft to reach
    // touchdown at its current groundspeed - shown in place of a
    // "time gap" since there's no second landing to measure from.
    const gapSec =
    trailing.speed > 0
    ? Math.round((trailingDistNM / trailing.speed) * 3600)
    : null;

    spacingLog.push({
        leading: ac.callsign,
        trailing: trailing.callsign,
        timeSec: now,
        gapSec: gapSec,
        estSpacingNM: trailingDistNM,
        rating: rating
    });

}

// ======================================
// Finalize any encounters still open at
// the moment the report is generated
// ======================================
function finalizeOpenEvents(){

    const now = simTotalSeconds();

    Object.keys(activeConflicts).forEach(key=>{
        acConflictLog.push(
            Object.assign({}, activeConflicts[key], {endSec: now})
        );
        delete activeConflicts[key];
    });

    Object.keys(activeBlipProximity).forEach(key=>{
        blipProximityLog.push(
            Object.assign({}, activeBlipProximity[key], {endSec: now})
        );
        delete activeBlipProximity[key];
    });

    Object.keys(activeTerrain).forEach(key=>{
        terrainLog.push(
            Object.assign({}, activeTerrain[key], {endSec: now})
        );
        delete activeTerrain[key];
    });

}

// ======================================
// Build & open the report
// ======================================
function generateReport(){

    finalizeOpenEvents();

    let html = "";

    html += "<html><head><title>Exercise Report</title>";
    html += "<style>";
    html += "body{background:#0b0b0b;color:#00ff66;font-family:Consolas,Arial,sans-serif;padding:24px;}";
    html += "h1,h2{color:#00ffff;}";
    html += "table{border-collapse:collapse;width:100%;margin-bottom:24px;}";
    html += "th,td{border:1px solid #008844;padding:6px 10px;text-align:left;font-size:14px;}";
    html += "th{background:#181818;color:#00ffff;}";
    html += ".bad{color:#ff4444;font-weight:bold;}";
    html += ".good{color:#00ff66;}";
    html += ".warn{color:#ffcc00;}";
    html += "p.note{color:#777;font-size:12px;}";
    html += "</style></head><body>";

    html += "<h1>ATC EXERCISE REPORT</h1>";
    html += "<p>Generated at " + fmtClock(simTotalSeconds()) + " (sim time)</p>";

    // ---- Separation conflicts ----

    html += "<h2>Loss of Separation (Aircraft vs Aircraft)</h2>";
    html += "<p>Threshold: lateral &lt; " + CONFLICT_LATERAL_NM +
            " NM AND vertical &lt; " + CONFLICT_VERTICAL_FT + " ft</p>";

    if(acConflictLog.length === 0){

        html += "<p class='good'>No losses of separation recorded.</p>";

    }
    else{

        html += "<table><tr><th>Time (CPA)</th><th>Aircraft A</th><th>Aircraft B</th>" +
                "<th>Min Lateral (NM)</th><th>Vertical at CPA (ft)</th></tr>";

        acConflictLog.forEach(c=>{

            html += "<tr class='bad'><td>" + fmtClock(c.timeAtMinSec) + "</td><td>" +
                    c.a + "</td><td>" + c.b + "</td><td>" +
                    c.minLateral.toFixed(1) + "</td><td>" +
                    Math.round(c.vertAtMin) + "</td></tr>";

        });

        html += "</table>";

    }

    // ---- Terrain loss ----

    html += "<h2>Terrain Loss</h2>";
    html += "<p>Threshold: below FL" + TERRAIN_MIN_FL +
            " while beyond " + TERRAIN_DISTANCE_NM + " NM from CCB</p>";

    if(terrainLog.length === 0){

        html += "<p class='good'>No terrain loss events recorded.</p>";

    }
    else{

        html += "<table><tr><th>Time (lowest point)</th><th>Aircraft</th>" +
                "<th>Lowest Level (FL)</th><th>Distance from CCB (NM)</th></tr>";

        terrainLog.forEach(t=>{

            html += "<tr class='bad'><td>" + fmtClock(t.timeAtMinSec) + "</td><td>" +
                    t.callsign + "</td><td>" + Math.round(t.minLevel) + "</td><td>" +
                    t.distAtMin.toFixed(1) + "</td></tr>";

        });

        html += "</table>";

    }

    // ---- Blip proximity ----

    html += "<h2>Proximity to Unknown Traffic</h2>";
    html += "<p>Threshold: lateral &lt; " + BLIP_PROXIMITY_NM + " NM</p>";

    if(blipProximityLog.length === 0){

        html += "<p class='good'>No proximity events recorded.</p>";

    }
    else{

        html += "<table><tr><th>Time (CPA)</th><th>Aircraft</th><th>Unknown Traffic</th>" +
                "<th>Min Lateral (NM)</th></tr>";

        blipProximityLog.forEach(p=>{

            html += "<tr class='warn'><td>" + fmtClock(p.timeAtMinSec) + "</td><td>" +
                    p.ac + "</td><td>" + p.blip + "</td><td>" +
                    p.minLateral.toFixed(1) + "</td></tr>";

        });

        html += "</table>";

    }

    // ---- Arrival spacing ----

    html += "<h2>Successive Arrival Spacing</h2>";
    html += "<p>8&ndash;10 NM: Very good &nbsp;|&nbsp; 10&ndash;12 NM: Good, can improve " +
            "&nbsp;|&nbsp; 12&ndash;14 NM: Satisfactory &nbsp;|&nbsp; &gt;14 NM: Needs attention " +
            "&nbsp;|&nbsp; &lt;8 NM: Caution</p>";

    if(spacingLog.length === 0){

        html += "<p>Not enough landings recorded to measure spacing.</p>";

    }
    else{

        html += "<table><tr><th>Leading A/C</th><th>Trailing A/C</th><th>Trailing ETA</th>" +
                "<th>Distance at Landing (NM)</th><th>Rating</th></tr>";

        spacingLog.forEach(s=>{

            const cls = s.rating.indexOf("CAUTION") === 0
                ? "bad"
                : (s.rating === "Needs attention" ? "warn" : "good");

            let etaStr;

            if(s.gapSec === null || s.gapSec === undefined){
                etaStr = "-";
            }
            else{
                const mm = Math.floor(s.gapSec / 60);
                const ss = s.gapSec % 60;
                etaStr = mm + "m " + ss + "s";
            }

            html += "<tr class='" + cls + "'><td>" + s.leading + "</td><td>" +
                    s.trailing + "</td><td>" + etaStr + "</td><td>" +
                    s.estSpacingNM.toFixed(1) + "</td><td>" + s.rating + "</td></tr>";

        });

        html += "</table>";

    }

    html += "<p class='note'>Arrival spacing is the trailing aircraft's actual distance " +
            "from touchdown at the moment the leading aircraft lands, with its ETA to " +
            "touchdown estimated from its groundspeed at that same moment.</p>";

    html += "</body></html>";

    const reportWindow = window.open("", "_blank");

    if(reportWindow){

        reportWindow.document.open();
        reportWindow.document.write(html);
        reportWindow.document.close();

    }
    else{

        alert("Please allow pop-ups to view the report.");

    }

}

// ======================================
// Wire up the button
// ======================================
document.addEventListener("DOMContentLoaded", function(){

    const btn = document.getElementById("generateReportBtn");

    if(btn){

        btn.onclick = function(){

            simulatorPaused = true;
            generateReport();

        };

    }

});
