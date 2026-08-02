// ======================================
// main.js
// ATC Simulator Engine
// ======================================
let simulatorPaused = false;
let simulatorStarted = false;


const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");


pauseBtn.onclick = function(){

    simulatorPaused = true;

    console.log("PAUSED =", simulatorPaused);

};


resumeBtn.onclick = function(){

    simulatorPaused = false;

    console.log("RESUMED =", simulatorPaused);

};
let selectedAircraft = null;
let selectedBlip = null;
let unknownBlips = [];
document.getElementById("rwy26Blip").onclick = function(){

    // If there's already an unidentified blip out there, this
    // click resets the scenario rather than adding another one -
    // hide (remove) whatever's currently active and start fresh
    // from 60NM, same as a brand new unknown contact.
    const hadActiveBlip = unknownBlips.some(b => b.active);

    if(hadActiveBlip){

        unknownBlips.forEach(b => { b.active = false; });

        if(selectedBlip){

            selectedBlip = null;

            const identifyForm = document.getElementById("identifyForm");
            const identifyEmpty = document.getElementById("identifyEmpty");

            if(identifyForm) identifyForm.style.display = "none";
            if(identifyEmpty) identifyEmpty.style.display = "block";

        }

    }

    let start, heading;

    if(typeof activeRunwayDirection !== "undefined" && activeRunwayDirection === "08"){

        // RWY 08 active: unknown traffic enters from R210 at 60 NM, heading 360
        start = bearingToXY(210, 60);
        heading = 360;

    }
    else{

        // Default (RWY 26): R035 at 60 NM, heading 180
        start = bearingToXY(35, 60);
        heading = 180;

    }

    unknownBlips.push({

        x: start.x,
        y: start.y,

        heading: heading,
        speed: 550,

        trail: [],
        trailTimer: 0,

        active: true

    });

};

// ======================================
// Identify Unknown Traffic (priority
// landing request) - promotes whichever
// blip is currently selected (see the
// blip click-handling in radar.js) into
// a full aircraft: callsign + level as
// entered here, current position/heading/
// speed carried over exactly as-is, and
// its trail history carried over too so
// there's no visual jump.
// ======================================
document.addEventListener("DOMContentLoaded", function(){

    const identifyBtn = document.getElementById("identifyBtn");

    if(!identifyBtn) return;

    identifyBtn.onclick = function(){

        if(!selectedBlip || !selectedBlip.active){
            alert("Select an unknown blip on the radar first.");
            return;
        }

        const callsignEl = document.getElementById("identifyCallsign");
        const typeEl = document.getElementById("identifyType");
        const levelEl = document.getElementById("identifyLevel");

        const callsign = callsignEl ? callsignEl.value.trim() : "";

        if(callsign === ""){
            alert("Enter a callsign before identifying this traffic.");
            return;
        }

        const type = typeEl ? typeEl.value : "A320";
        const level = levelEl && levelEl.value !== "" ? parseInt(levelEl.value) : 100;

        const newAc = {

            callsign: callsign,
            type: type,
            route: "",
            entryRadial: 0,
            distance: 0,

            x: selectedBlip.x,
            y: selectedBlip.y,

            labelAngle: 0,

            heading: selectedBlip.heading,
            targetHeading: selectedBlip.heading,
            turnDirection: "SHORTEST",

            level: level,
            targetLevel: level,
            verticalSpeed: 0,

            speed: selectedBlip.speed,
            targetSpeed: selectedBlip.speed,

            ccbETA: "",
            squawk: "",   // identified by voice, not yet assigned a code

            priorityLanding: true,   // requested priority landing as unknown traffic

            // Carry the blip's own track history over so the
            // trail doesn't reset/jump the moment it's identified
            trail: selectedBlip.trail ? selectedBlip.trail.slice() : [],
            trailTimer: 0,

            arrivalPhase: false,
            removeTimer: 0,
            landed: false,
            active: true,
            spawned: true

        };

        aircraft.push(newAc);

        // Deactivate the now-identified blip (kept in the array,
        // same as blips that fly out of range - keeps its array
        // index stable for the report's proximity tracking)
        selectedBlip.active = false;
        selectedBlip = null;

        // Select the newly-identified aircraft so the controller
        // can carry straight on giving it instructions
        selectedAircraft = newAc;

        document.getElementById("callsign").value = newAc.callsign;
        document.getElementById("heading").value = newAc.targetHeading;
        document.getElementById("level").value = newAc.targetLevel;

        const speedEl = document.getElementById("speedInput");
        if(speedEl) speedEl.value = newAc.targetSpeed;

        // Reset + hide the identify form
        if(callsignEl) callsignEl.value = "";
        if(levelEl) levelEl.value = "";

        const identifyForm = document.getElementById("identifyForm");
        const identifyEmpty = document.getElementById("identifyEmpty");

        if(identifyForm) identifyForm.style.display = "none";
        if(identifyEmpty) identifyEmpty.style.display = "block";

    };

});
// Simulation Time
let simHour = 5;
let simMinute = 0;
let simSecond = 0;
//--------------------------------------
// Time Functions
//--------------------------------------

function currentMinutes() {
    return simHour * 60 + simMinute;
}

function timeToMinutes(time) {
    const t = time.split(":");
    return parseInt(t[0]) * 60 + parseInt(t[1]);
}

function entryOffset(type) {

    switch(type){

        case "ATR72":
        case "DO228":
            return 18;

        default:
            return 14;
    }

}

document.getElementById("applyBtn").onclick = function(){

    if(selectedAircraft == null){
        alert("Select an aircraft first.");
        return;
    }

    const hdg = document.getElementById("heading").value;
    const lvl = document.getElementById("level").value;

    const spdEl = document.getElementById("speedInput");
    const spd = spdEl ? spdEl.value : "";

    const climbEl = document.getElementById("climbRateInput");
    const climbRate = climbEl ? climbEl.value : "";

    const descentEl = document.getElementById("descentRateInput");
    const descentRate = descentEl ? descentEl.value : "";

    const squawkEl = document.getElementById("squawkInput");

    if(hdg !== ""){

        const newHeading = parseInt(hdg) % 360;

        // The heading box is always pre-filled with the aircraft's
        // current target heading when it's selected, so without this
        // check, clicking APPLY to change just level/speed would
        // silently cancel any active hold or DCT clearance every time.
        // Only treat it as a genuine new heading instruction if the
        // value actually changed.
        if(newHeading !== selectedAircraft.targetHeading){

            selectedAircraft.targetHeading = newHeading;
            selectedAircraft.directToFix = null;
            selectedAircraft.viaDumasRoute = false;
            selectedAircraft.holdFix = null;
            selectedAircraft.holdPhase = null;

        }

    }

    if(lvl !== "")
        selectedAircraft.targetLevel = parseInt(lvl);

    if(spd !== "")
        selectedAircraft.targetSpeed = parseInt(spd);

    if(climbRate !== "")
        selectedAircraft.climbRateFpm = parseInt(climbRate);

    if(descentRate !== "")
        selectedAircraft.descentRateFpm = parseInt(descentRate);

    // Squawk applies even when blank - that's how you clear it
    // to simulate the aircraft going primary-only.
    if(squawkEl){

        const newSquawk = squawkEl.value.trim();
        const prevSquawk = selectedAircraft.squawk;

        selectedAircraft.squawk = newSquawk;

        // Emergency squawk newly set (7500/7600/7700) - start the
        // label AND leader line blinking red, plus play the alert
        // tone, until the controller clicks/acknowledges it. Only
        // do this when the code is actually CHANGING to an
        // emergency squawk - otherwise pressing APPLY again for an
        // unrelated heading/level/speed change while an already-
        // acknowledged emergency squawk is still sitting in this
        // field would restart the blink/alarm every single time.
        // Works the same for arrivals and departures - both are
        // ordinary selectedAircraft references here.
        const isNewEmergency =
        typeof EMERGENCY_SQUAWKS !== "undefined"
            ? EMERGENCY_SQUAWKS.includes(newSquawk)
            : ["7500","7600","7700"].includes(newSquawk);

        if(isNewEmergency && newSquawk !== prevSquawk){

            selectedAircraft.emergencyAck = false;

            if(typeof playEmergencyAlertSound === "function"){
                playEmergencyAlertSound();
            }

        }

    }
    const turn =
document.querySelector('input[name="turnDir"]:checked').value;


selectedAircraft.turnDirection = turn;
    console.log(
    "TURN SELECTED:",
    document.querySelector('input[name="turnDir"]:checked').value
);
    console.log(
    "AIRCRAFT TURN:",
    selectedAircraft.callsign,
    selectedAircraft.turnDirection
);
console.log(
    "COMMAND GIVEN:",
    selectedAircraft.callsign,
    selectedAircraft.targetHeading
);
};
//--------------------------------------
// Clock
//--------------------------------------

function updateClock(){

    simSecond++;

    if(simSecond>=60){

        simSecond=0;
        simMinute++;

    }

    if(simMinute>=60){

        simMinute=0;
        simHour++;

    }

    document.getElementById("clock").innerHTML =
        String(simHour).padStart(2,"0")+":"+
        String(simMinute).padStart(2,"0")+":"+
        String(simSecond).padStart(2,"0");

}

//--------------------------------------
// Spawn Aircraft
//--------------------------------------
function spawnRWY26Unknown() {

    const start = bearingToXY(35, 60);

    unknownBlips.push({
        x: start.x,
        y: start.y,
        heading: 180,
        speed: 550,
        active: true
    });

}
function spawnAircraft(){

    aircraft.forEach(ac=>{

        if(ac.spawned) return;

        const etaMinutes = timeToMinutes(ac.ccbETA);
        const nmPerMin = ac.speed / 60;   // knots -> NM/min

        // The time at which this aircraft would naturally be
        // 60NM out, if flying at its speed toward CCB to arrive
        // exactly at its ETA.
        const minutesFor60NM = nmPerMin > 0 ? 60 / nmPerMin : 0;
        const naturalSpawnMinute = etaMinutes - minutesFor60NM;

        if(currentMinutes() >= naturalSpawnMinute){

            // How much flight time is actually left until ETA
            // right now - if the sim started later than the
            // "natural" spawn time, this is less than 60NM.
            const minutesRemaining = etaMinutes - currentMinutes();

            let spawnDistance = minutesRemaining * nmPerMin;

            if(spawnDistance > 60) spawnDistance = 60;
            if(spawnDistance < 0) spawnDistance = 0;

            const start = bearingToXY(ac.entryRadial, spawnDistance);

            ac.x = start.x;
            ac.y = start.y;
            ac.distance = spawnDistance;

            ac.spawned = true;
            ac.active = true;

            // Published VAD-99 route: aircraft entering via R120
            // (G473 SE) fly straight over DUMAS by default anyway,
            // so arm the DUMAS routing automatically instead of
            // waiting for the controller to press DCT-DUMAS. This
            // reuses the existing DUMAS -> 320 -> R088 logic as-is.
            if(ac.entryRadial === 120 && vad99Active){
                ac.directToFix = "DUMAS";
            }

            console.log(ac.callsign+" entered at "+spawnDistance.toFixed(1)+" NM");

        }

    });

}
// =====================================
// Arrival Descent Logic
// =====================================


//--------------------------------------
// Move Aircraft
//--------------------------------------
function moveUnknownBlips(){

    unknownBlips.forEach(blip => {

        if(!blip.active) return;

        // Trail points, same cadence as aircraft (every 4 sec,
        // keep last 4) - lets the controller see the raw track
        // history before it's ever identified.
        if(!blip.trail) blip.trail = [];
        if(blip.trailTimer === undefined) blip.trailTimer = 0;

        blip.trailTimer++;

        if(blip.trailTimer >= 8){

            blip.trail.push({x:blip.x, y:blip.y});

            if(blip.trail.length > 4){
                blip.trail.shift();
            }

            blip.trailTimer = 0;

        }

        const movement = blip.speed / 3600;

        const pixels = movement * PIXELS_PER_NM;

        const angle = (blip.heading - 90) * Math.PI / 180;

        blip.x += Math.cos(angle) * pixels;
        blip.y += Math.sin(angle) * pixels;

        const dx = blip.x - CCB.x;
        const dy = blip.y - CCB.y;

        const distance = Math.sqrt(dx * dx + dy * dy) / PIXELS_PER_NM;

        if(distance > 65){

            blip.active = false;

        }

    });

}

function moveAircraft(){

    aircraft.forEach(ac=>{

        if(!ac.active) return;


        // ===============================
        // Speed transition toward target speed
        // (assumed ~5 KT/sec acceleration/deceleration)
        // ===============================

        if(ac.speed < ac.targetSpeed){

            ac.speed += 5;

            if(ac.speed > ac.targetSpeed){
                ac.speed = ac.targetSpeed;
            }

        }
        else if(ac.speed > ac.targetSpeed){

            ac.speed -= 5;

            if(ac.speed < ac.targetSpeed){
                ac.speed = ac.targetSpeed;
            }

        }

        // ===============================
        // Movement (NM per second), derived
        // from current speed: 300 KT = 5 NM/min
        // ===============================

        const movement = ac.speed / 3600;

        // ===============================
        // Heading turn
        // ===============================
// ======================================
// Heading Turn with Direction Control
// ======================================
if(ac.heading !== ac.targetHeading){

    const turnRate = 3;

    if(ac.turnDirection === "LEFT"){

        // Counter-clockwise distance remaining to target
        let diffLeft =
        (ac.heading - ac.targetHeading + 360) % 360;

        if(diffLeft <= turnRate){

            ac.heading = ac.targetHeading;

        }
        else{

            ac.heading -= turnRate;

            if(ac.heading < 0)
                ac.heading += 360;

        }

    }


    else if(ac.turnDirection === "RIGHT"){

        // Clockwise distance remaining to target
        let diffRight =
        (ac.targetHeading - ac.heading + 360) % 360;

        if(diffRight <= turnRate){

            ac.heading = ac.targetHeading;

        }
        else{

            ac.heading += turnRate;

            if(ac.heading >= 360)
                ac.heading -= 360;

        }

    }


    else{

        // SHORTEST TURN

        let diff =
        (ac.targetHeading - ac.heading + 360) % 360;

        if(diff > 180)
            diff -= 360;


        if(Math.abs(diff) <= turnRate){

            ac.heading = ac.targetHeading;

        }
        else{

            ac.heading += diff > 0
            ? turnRate
            : -turnRate;

        }


        if(ac.heading < 0)
            ac.heading += 360;


        if(ac.heading >= 360)
            ac.heading -= 360;

    }


}


        // ===============================
        // Direct To Fix - continuously home
        // in on the fix until reached
        // ===============================

        if(ac.directToFix && typeof getFixByName === "function"){

            const fixPos = getFixByName(ac.directToFix);

            if(fixPos){

                const fdx = fixPos.x - ac.x;
                const fdy = fixPos.y - ac.y;

                const distToFixNM = Math.sqrt(fdx*fdx + fdy*fdy) / PIXELS_PER_NM;

                if(distToFixNM <= 1){

                    if(ac.directToFix === "DUMAS" && vad99Active){

                        // Special published route: DUMAS -> track 320
                        // (only applies while VAD-99 is active)
                        ac.targetHeading = 320;
                        ac.turnDirection = "SHORTEST";
                        ac.viaDumasRoute = true;

                    }
                    else if(fixPos.bearing !== undefined){

                        // Arrived - join outbound on the same radial
                        // from CCB this fix sits on (i.e. continue
                        // along the route the fix belongs to)
                        ac.targetHeading = Math.round(fixPos.bearing) % 360;
                        ac.turnDirection = "SHORTEST";

                    }

                    ac.directToFix = null;

                }
                else{

                    let bearingToFix =
                    (Math.atan2(fdy, fdx) * 180 / Math.PI) + 90;

                    bearingToFix = (bearingToFix + 360) % 360;

                    ac.targetHeading = Math.round(bearingToFix) % 360;
                    ac.turnDirection = "SHORTEST";

                }

            }
            else{

                ac.directToFix = null;

            }

        }

        // ===============================
        // Holding Pattern - fly to the hold
        // fix, then race-track (simplified
        // entry: turn and join the outbound
        // leg directly, no parallel/offset
        // sector logic).
        // ===============================

        if(ac.holdFix && typeof getHoldFixPosition === "function"){

            const holdCfg = HOLD_FIXES[ac.holdFix];
            const fixPos = getHoldFixPosition(ac.holdFix);

            if(holdCfg && fixPos){

                const hdx = fixPos.x - ac.x;
                const hdy = fixPos.y - ac.y;

                const distToHoldFixNM =
                Math.sqrt(hdx*hdx + hdy*hdy) / PIXELS_PER_NM;

                if(!ac.holdPhase){

                    // Still inbound to the hold fix - home in on it
                    if(distToHoldFixNM <= 1){

                        ac.holdPhase = "OUTBOUND";
                        ac.turnDirection = holdCfg.turn;
                        ac.targetHeading = (holdCfg.inboundTrack + 180) % 360;
                        ac.holdOutboundTimer = 0;

                    }
                    else{

                        let bearingToHoldFix =
                        (Math.atan2(hdy, hdx) * 180 / Math.PI) + 90;

                        bearingToHoldFix = (bearingToHoldFix + 360) % 360;

                        ac.targetHeading = Math.round(bearingToHoldFix) % 360;
                        ac.turnDirection = "SHORTEST";

                    }

                }
                else if(ac.holdPhase === "OUTBOUND"){

                    // Only start timing once established on the
                    // outbound heading (not still mid-turn) - use
                    // a small tolerance rather than exact equality
                    let hDiff = Math.abs(ac.heading - ac.targetHeading);
                    if(hDiff > 180) hDiff = 360 - hDiff;

                    if(hDiff < 1){

                        ac.holdOutboundTimer = (ac.holdOutboundTimer || 0) + 1;

                        // 1 min up to & incl FL140, 1.5 min above
                        const outboundSec = ac.level > 140 ? 90 : 60;

                        if(ac.holdOutboundTimer >= outboundSec){

                            ac.holdPhase = "INBOUND";
                            ac.turnDirection = holdCfg.turn;
                            ac.targetHeading = holdCfg.inboundTrack;
                            ac.holdOutboundTimer = 0;

                        }

                    }

                }
                else if(ac.holdPhase === "INBOUND"){

                    if(distToHoldFixNM <= 1){

                        // Crossed the fix inbound - fly another lap
                        ac.holdPhase = "OUTBOUND";
                        ac.turnDirection = holdCfg.turn;
                        ac.targetHeading = (holdCfg.inboundTrack + 180) % 360;
                        ac.holdOutboundTimer = 0;

                    }
                    else{

                        // Home continuously on the fix rather than flying a
                        // fixed heading - a fixed heading only closes the
                        // loop if the outbound turn happened to line up
                        // perfectly, otherwise the aircraft just flies past
                        // the fix and never re-triggers another lap.
                        let bearingToHoldFix =
                        (Math.atan2(hdy, hdx) * 180 / Math.PI) + 90;

                        bearingToHoldFix = (bearingToHoldFix + 360) % 360;

                        ac.targetHeading = Math.round(bearingToHoldFix) % 360;
                        ac.turnDirection = "SHORTEST";

                    }

                }

            }
            else{

                ac.holdFix = null;
                ac.holdPhase = null;

            }

        }

        // ===============================
// Distance to TOUCHDOWN - now that touchdown
// sits 1NM from CCB (toward the active
// runway's own threshold), this must measure
// against the real touchdown point, not CCB
// directly, or the whole approach/speed/
// descent schedule below drifts out of sync
// with where the aircraft actually needs to be.
// ===============================

const touchdownPointNow =
(typeof getTouchdownPoint === "function")
? getTouchdownPoint(activeRunwayDirection)
: CCB;

const touchdownDistance = Math.sqrt(
    (ac.x - touchdownPointNow.x)*(ac.x - touchdownPointNow.x) +
    (ac.y - touchdownPointNow.y)*(ac.y - touchdownPointNow.y)
) / PIXELS_PER_NM;

// Published route: once via DUMAS on track 320,
// automatically establish R088 inbound at 20NM from
// CCB - unless the controller has since given other
// instructions (viaDumasRoute gets cleared then).
if(ac.viaDumasRoute && touchdownDistance <= 20){

    ac.targetHeading = 268;   // inbound on R088
    ac.turnDirection = "SHORTEST";
    ac.viaDumasRoute = false;

}

// ===============================
// Localiser capture: if cleared to
// intercept, turn onto final course
// once the centreline is crossed
// ===============================

if(ac.locIntercept && !ac.established){

    if(typeof getPerpDistanceToCentrelineNM === "function"){

        const perpNM = getPerpDistanceToCentrelineNM(ac);

        if(perpNM <= 3){

            ac.established = true;
            ac.locIntercept = false;

        }

    }

}

// While established but not yet exactly on the centreline,
// steer toward a point further down the line (not just the
// final heading) so the aircraft actually converges onto it
// instead of flying parallel beside it.
if(ac.established){

    const touchdown = getTouchdownPoint(activeRunwayDirection);
    const inboundHeading = RWY_LANDING_HEADING[activeRunwayDirection];
    const inboundAngle = (inboundHeading - 90) * Math.PI / 180;
    const inboundDir = {x:Math.cos(inboundAngle), y:Math.sin(inboundAngle)};
    const perpDir = {x:-inboundDir.y, y:inboundDir.x};

    const dx = ac.x - touchdown.x;
    const dy = ac.y - touchdown.y;

    const alongPx = dx*inboundDir.x + dy*inboundDir.y;
    const perpPx = dx*perpDir.x + dy*perpDir.y;
    const perpNM = Math.abs(perpPx) / PIXELS_PER_NM;

    if(perpNM <= 0.05){

        // Close enough - hold the exact final course
        ac.targetHeading = inboundHeading;

    }
    else{

        // Aim at a point on the centreline, 3NM closer to
        // touchdown than our current along-track position
        // (but never past touchdown itself)
        const leadPx = 3 * PIXELS_PER_NM;
        let aimAlongPx = alongPx + leadPx;

        if(aimAlongPx > 0) aimAlongPx = 0;

        const aimX = touchdown.x + inboundDir.x*aimAlongPx;
        const aimY = touchdown.y + inboundDir.y*aimAlongPx;

        let bearingToAim =
        (Math.atan2(aimY - ac.y, aimX - ac.x) * 180 / Math.PI) + 90;

        bearingToAim = (bearingToAim + 360) % 360;

        ac.targetHeading = Math.round(bearingToAim);
        ac.turnDirection = "SHORTEST";

    }

}

// Once established, switch to the final-approach descent
// profile (existing logic below already ramps 2000ft -> 0
// between 8.5NM and touchdown) as soon as we're in range.
if(ac.established && touchdownDistance <= 8.5 && ac.targetLevel !== 0){

    ac.targetLevel = 0;

}

// ===============================
// Arrival phase at 8.5 NM (from touchdown)
// ===============================

if(touchdownDistance <= 8.5){

    ac.arrivalPhase = true;

}


// ===============================
// Controller selected descent
// (skipped once on the distance-based
// final approach profile - see below)
// ===============================

if(ac.approach){

    // Final approach profile owns the level entirely from here

}
else if(ac.level > ac.targetLevel){

    const descentFpm = ac.descentRateFpm || 1500;
    const descentRate = descentFpm / 100 / 60;   // FL/sec

    ac.level -= descentRate;

    ac.verticalSpeed = -descentFpm;


    if(ac.level <= ac.targetLevel){

        ac.level = ac.targetLevel;

        ac.verticalSpeed = 0;

    }

}


else if(ac.level < ac.targetLevel){

    const climbFpm = ac.climbRateFpm || 1500;
    const climbRate = climbFpm / 100 / 60;   // FL/sec

    ac.level += climbRate;

    ac.verticalSpeed = climbFpm;


    if(ac.level >= ac.targetLevel){

        ac.level = ac.targetLevel;

        ac.verticalSpeed = 0;

    }

}


else{

    ac.verticalSpeed = 0;

}

        // =====================================
// Final Approach Descent
// =====================================

if(touchdownDistance <= 8.5 && ac.targetLevel === 0){

    ac.approach = true;

}


if(ac.approach){

    // Descend based on distance remaining TO TOUCHDOWN

    let requiredLevel = touchdownDistance * 2.35;

    if(requiredLevel < 0)
        requiredLevel = 0;


    if(ac.level > requiredLevel){

        const descentFpm = ac.descentRateFpm || 1500;
        const descentRate = descentFpm / 100 / 60;   // FL/sec

        ac.level -= descentRate;

        ac.verticalSpeed = -descentFpm;


        if(ac.level <= requiredLevel){

            ac.level = requiredLevel;

        }

    }

}

        // ===============================
        // Move aircraft
        // ===============================

        // Trail points are captured every 4 seconds (not every
        // tick) - at typical speeds, 1 second of movement is
        // sub-pixel on a 60NM display, so per-tick dots would sit
        // invisibly on top of each other and the aircraft itself.
        if(!ac.trail) ac.trail = [];
        if(ac.trailTimer === undefined) ac.trailTimer = 0;

        ac.trailTimer++;

        if(ac.trailTimer >= 8){

            ac.trail.push({x:ac.x, y:ac.y});

            if(ac.trail.length > 4){
                ac.trail.shift();
            }

            ac.trailTimer = 0;

        }

        const pixels =
        movement * PIXELS_PER_NM;


        const angle =
        (ac.heading - 90) * Math.PI / 180;


        ac.x += Math.cos(angle) * pixels;
        ac.y += Math.sin(angle) * pixels;


        ac.distance -= movement;


        if(ac.distance < 0)
            ac.distance = 0;



        // ===============================
        // Landing (based on distance to touchdown)
        // ===============================

        const landingTouchdownPoint =
        (typeof getTouchdownPoint === "function")
        ? getTouchdownPoint(activeRunwayDirection)
        : CCB;

        const landingTouchdownDistance = Math.sqrt(
            (ac.x - landingTouchdownPoint.x)*(ac.x - landingTouchdownPoint.x) +
            (ac.y - landingTouchdownPoint.y)*(ac.y - landingTouchdownPoint.y)
        ) / PIXELS_PER_NM;

        if(landingTouchdownDistance <= 0.5 && ac.level <= 1){

            ac.landed = true;

            if(!ac.reportedLanding && typeof logLanding === "function"){
                ac.reportedLanding = true;
                logLanding(ac);
            }

        }



        // ===============================
        // Remove after 3 seconds
        // ===============================

        if(ac.landed){

            ac.removeTimer =
            (ac.removeTimer || 0) + 1;


            if(ac.removeTimer >= 3){

                ac.active = false;

                console.log(
                    ac.callsign + " removed"
                );

            }

        }


    });

}
//--------------------------------------
// Start Simulator
//--------------------------------------


setInterval(function(){

    if(!simulatorStarted){
        return;
    }

    console.log("Timer:", simulatorPaused);

    if(simulatorPaused === true){
        return;
    }

    updateClock();

    spawnAircraft();

    moveAircraft();

    if(typeof moveDepartures === "function"){
    moveDepartures();
}

    moveUnknownBlips();

    if(typeof checkSeparation === "function"){
        checkSeparation();
    }

    if(typeof checkTerrain === "function"){
        checkTerrain();
    }

},1000);
