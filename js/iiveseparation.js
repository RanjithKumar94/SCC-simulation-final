// ======================================
// liveseparation.js
// ------------------------------------
// LIVE TRAFFIC display only - shows, for
// whichever aircraft the controller has
// currently selected, whether each other
// aircraft's track actually converges
// with it or not, based on PRESENT true
// heading and speed.
//
// This is intentionally kept separate
// from report.js: it never writes to
// acConflictLog or any other report data,
// and has no effect on the end-of-exercise
// report, which continues to log ACTUAL
// losses of separation exactly as before.
// ======================================

// Tracks that never come within this many
// NM of each other (on present heading/
// speed) are irrelevant to the selected
// aircraft - shown as "NO XING" rather
// than clutter.
const CROSSING_THRESHOLD_NM = 30;

// Beyond this horizon a straight-line projection from current
// heading/speed isn't meaningful (headings/speeds change too
// often in a real exercise) - treated the same as NO XING.
const LIVE_SEP_HORIZON_SEC = 1200;   // 20 minutes

function liveSepVelocityPxPerSec(ac){

    const angle = (ac.heading - 90) * Math.PI / 180;
    const speedPxPerSec = (ac.speed / 3600) * PIXELS_PER_NM;

    return {
        vx: Math.cos(angle) * speedPxPerSec,
        vy: Math.sin(angle) * speedPxPerSec
    };

}

// Closest point of approach between two aircraft, projecting
// forward on their CURRENT heading/speed only (held constant).
function liveSepPredictedCPA(a, b){

    const va = liveSepVelocityPxPerSec(a);
    const vb = liveSepVelocityPxPerSec(b);

    const rx = b.x - a.x;
    const ry = b.y - a.y;

    const vx = vb.vx - va.vx;
    const vy = vb.vy - va.vy;

    const currentDistNM = Math.sqrt(rx*rx + ry*ry) / PIXELS_PER_NM;

    const vSq = vx*vx + vy*vy;

    let tSec = 0;

    if(vSq > 1e-9){

        // Time from now at which separation is smallest. Negative
        // means they're already opening up - "now" is as close as
        // they get.
        const tRaw = -((rx*vx) + (ry*vy)) / vSq;
        tSec = Math.max(0, tRaw);

    }
    // else: relative velocity ~0 (same speed & heading) - separation
    // stays constant, t=0 is as good as any other time.

    if(tSec > LIVE_SEP_HORIZON_SEC){

        return {
            currentDistNM,
            minDistanceNM: currentDistNM,
            timeToCPASec: null
        };

    }

    const cx = rx + vx*tSec;
    const cy = ry + vy*tSec;

    const minDistanceNM = Math.sqrt(cx*cx + cy*cy) / PIXELS_PER_NM;

    return {
        currentDistNM,
        minDistanceNM,
        timeToCPASec: tSec
    };

}

// For the currently selected aircraft, checks every other active
// aircraft: does its track converge with the selected aircraft's
// to within CROSSING_THRESHOLD_NM on present heading/speed? If
// not, it's flagged noXing:true so the panel can show "NO XING"
// instead of a distance/ETA that doesn't matter.
function computeLiveSeparationForSelected(){

    if(typeof selectedAircraft === "undefined" || !selectedAircraft || !selectedAircraft.active){
        return null;
    }

    const allAircraft =
    [...(typeof aircraft !== "undefined" ? aircraft : []),
     ...(typeof departures !== "undefined" ? departures : [])]
    .filter(ac => ac.active && ac !== selectedAircraft);

    const results = allAircraft.map(other=>{

        const cpa = liveSepPredictedCPA(selectedAircraft, other);

        const noXing =
        cpa.timeToCPASec === null ||
        cpa.minDistanceNM >= CROSSING_THRESHOLD_NM;

        return {
            callsign: other.callsign,
            currentDistNM: cpa.currentDistNM,
            minDistanceNM: cpa.minDistanceNM,
            timeToCPASec: cpa.timeToCPASec,
            noXing
        };

    });

    // Converging traffic first (closest predicted separation
    // first), NO XING traffic pushed to the bottom.
    results.sort((x, y)=>{

        if(x.noXing !== y.noXing) return x.noXing ? 1 : -1;

        return x.minDistanceNM - y.minDistanceNM;

    });

    return results;

}

// ======================================
// Called once per sim tick from main.js,
// and once immediately on selection (see
// radar.js click handler) - refreshes the
// live traffic panel for whichever
// aircraft is currently selected.
// ======================================
function updateLiveSeparationPanel(){

    const panelBody = document.getElementById("liveSepBody");

    if(!panelBody) return;

    const emptyMsg = document.getElementById("liveSepEmpty");
    const table = document.getElementById("liveSepTable");
    const title = document.getElementById("liveSepTitle");

    const results = computeLiveSeparationForSelected();

    if(!results){

        if(title) title.textContent = "Traffic";

        if(emptyMsg){
            emptyMsg.textContent = "Select an aircraft to see traffic.";
            emptyMsg.style.display = "block";
        }

        if(table) table.style.display = "none";

        return;

    }

    if(title){
        title.textContent = "Traffic vs " + selectedAircraft.callsign;
    }

    if(results.length === 0){

        if(emptyMsg){
            emptyMsg.textContent = "No other traffic.";
            emptyMsg.style.display = "block";
        }

        if(table) table.style.display = "none";

        return;

    }

    if(emptyMsg) emptyMsg.style.display = "none";
    if(table) table.style.display = "table";

    panelBody.innerHTML = "";

    // Same lateral threshold report.js uses for an actual loss of
    // separation - used here only to highlight the row, never to
    // log anything.
    const lossThresholdNM =
    typeof CONFLICT_LATERAL_NM !== "undefined" ? CONFLICT_LATERAL_NM : 5;

    results.forEach(r=>{

        const tr = document.createElement("tr");

        if(r.noXing){

            tr.innerHTML =
                "<td>" + r.callsign + "</td>" +
                "<td>" + r.currentDistNM.toFixed(1) + "</td>" +
                "<td colspan='2' class='noXingCell'>NO XING</td>";

        }
        else{

            const isLoss = r.minDistanceNM < lossThresholdNM;

            tr.className = isLoss ? "predSepBad" : "";

            let eta;

            if(r.timeToCPASec < 1){
                eta = "now";
            }
            else{
                const mm = Math.floor(r.timeToCPASec / 60);
                const ss = Math.round(r.timeToCPASec % 60);
                eta = mm > 0 ? (mm + "m " + ss + "s") : (ss + "s");
            }

            tr.innerHTML =
                "<td>" + r.callsign + "</td>" +
                "<td>" + r.currentDistNM.toFixed(1) + "</td>" +
                "<td>" + r.minDistanceNM.toFixed(1) + "</td>" +
                "<td>" + eta + "</td>";

        }

        panelBody.appendChild(tr);

    });

}
