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
// main.js when ac.landed first goes true)
// ======================================
function logLanding(ac){

    const now = simTotalSeconds();

    landingLog.push({
        callsign: ac.callsign,
        timeSec: now,
        speed: ac.speed
    });

    if(landingLog.length >= 2){

        const prev = landingLog[landingLog.length - 2];
        const curr = landingLog[landingLog.length - 1];

        const gapSec = curr.timeSec - prev.timeSec;

        // Estimated in-trail spacing at the moment the leading
        // aircraft landed, based on the trailing aircraft's own
        // approach groundspeed over the gap (holds fairly steady
        // on short final in this sim).
        const estSpacingNM = (curr.speed / 3600) * gapSec;

        let rating;

        if(estSpacingNM < 8){
            rating = "CAUTION - below 8 NM";
        }
        else if(estSpacingNM <= 10){
            rating = "Very good";
        }
        else if(estSpacingNM <= 12){
            rating = "Good (can improve)";
        }
        else if(estSpacingNM <= 14){
            rating = "Satisfactory";
        }
        else{
            rating = "Needs attention";
        }

        spacingLog.push({
            leading: prev.callsign,
            trailing: curr.callsign,
            gapSec: gapSec,
            estSpacingNM: estSpacingNM,
            rating: rating
        });

    }

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

        html += "<table><tr><th>Leading A/C</th><th>Trailing A/C</th><th>Time Gap</th>" +
                "<th>Est. Spacing (NM)</th><th>Rating</th></tr>";

        spacingLog.forEach(s=>{

            const cls = s.rating.indexOf("CAUTION") === 0
                ? "bad"
                : (s.rating === "Needs attention" ? "warn" : "good");

            const mm = Math.floor(s.gapSec / 60);
            const ss = s.gapSec % 60;

            html += "<tr class='" + cls + "'><td>" + s.leading + "</td><td>" +
                    s.trailing + "</td><td>" + mm + "m " + ss + "s</td><td>" +
                    s.estSpacingNM.toFixed(1) + "</td><td>" + s.rating + "</td></tr>";

        });

        html += "</table>";

    }

    html += "<p class='note'>Arrival spacing is estimated from the time gap between " +
            "landings and the trailing aircraft's own approach groundspeed at touchdown.</p>";

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
