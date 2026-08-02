// ======================================
// departure.js
// ATC Simulator Departure Engine
// ======================================

console.log("departure.js loaded");


let departures = [];

window.onload = function(){

    document.getElementById("createDeparture").onclick = function(){

        const runway =
        document.getElementById("depRunway").value;

        createDeparture(runway);

        document.getElementById("depcallsign").value="";
        document.getElementById("deplevel").value="";

    };

    // Callsigns are always uppercase - force it live as typed.
    const depCallsignInput = document.getElementById("depcallsign");

    if(depCallsignInput){

        depCallsignInput.oninput = function(){
            const pos = this.selectionStart;
            this.value = this.value.toUpperCase();
            this.setSelectionRange(pos, pos);
        };

    }

};
// ======================================
// Create Departure
// ======================================

function createDeparture(runway){

    const depCallsign =
    document.getElementById("depcallsign").value.trim().toUpperCase();


    const depLevel =
    document.getElementById("deplevel").value.trim();



    const depTypeEl = document.getElementById("depType");
    const depType = depTypeEl ? depTypeEl.value : "A320";

    let start;
    let heading;


    if(runway === "26"){

        // West of CCB
        start = bearingToXY(260,1);

        // RWY 26 departure towards west
        heading = 260;

    }
    else{

        // East of CCB
        start = bearingToXY(80,1);

        // RWY 08 departure towards east
        heading = 80;

    }



    departures.push({

        callsign:
        depCallsign || "DEP001",


        type:depType,


        x:start.x,
        y:start.y,


        labelAngle:0,


        heading:heading,

        targetHeading:heading,


        turnDirection:"SHORTEST",


        level:0,

        targetLevel:
        depLevel !== ""
        ? Number(depLevel)
        : 100,


        verticalSpeed:0,


        speed:250,

        targetSpeed:250,

        squawk:"1200",


        active:true

    });



    console.log(
        "Departure created:",
        depCallsign,
        "FL",
        depLevel
    );

}



// ======================================
// Buttons
// ======================================

document.getElementById("createDeparture").onclick = function(){


    const runway =
    document.getElementById("depRunway").value;


    createDeparture(runway);



    // Clear input after creating departure

    document.getElementById("depcallsign").value = "";

    document.getElementById("deplevel").value = "";


};




// ======================================
// Move Departures
// ======================================

function moveDepartures(){


    departures.forEach(ac=>{


        if(!ac.active)
            return;
console.log(
ac.callsign,
ac.heading,
ac.targetHeading
);
// ======================================
// Heading Turn
// ======================================

// ======================================
// Heading Turn with Direction Control
// ======================================
if(ac.heading !== ac.targetHeading){

    const turnRate = 3;

    if(ac.turnDirection === "LEFT"){

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

        // Published route: once via DUMAS on track 320,
        // automatically establish R088 inbound at 20NM from
        // CCB - unless the controller has since given other
        // instructions (viaDumasRoute gets cleared then).
        if(ac.viaDumasRoute){

            const ddx = ac.x - CCB.x;
            const ddy = ac.y - CCB.y;

            const distToCCB = Math.sqrt(ddx*ddx + ddy*ddy) / PIXELS_PER_NM;

            if(distToCCB <= 20){

                ac.targetHeading = 268;   // inbound on R088
                ac.turnDirection = "SHORTEST";
                ac.viaDumasRoute = false;

            }

        }

        // 5 NM per minute

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

        // ===============================
        // Speed transition toward target speed
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

        // Movement (NM/sec) derived from current speed
        const movement = ac.speed / 3600;


        const pixels =
        movement * PIXELS_PER_NM;



        const angle =
        (ac.heading - 90) * Math.PI / 180;



        ac.x += Math.cos(angle) * pixels;

        ac.y += Math.sin(angle) * pixels;



        // ===============================
        // Distance to TOUCHDOWN, not just to CCB
        // (RWY 08/26 threshold isn't at CCB - see
        // getTouchdownPoint in radar.js). Mirrors
        // the same fix on the arrival side in
        // main.js, so a departure that turns back
        // to land gets the identical glidepath/
        // landing behavior as an arrival would.
        // ===============================

        const touchdownPointNow =
        (typeof getTouchdownPoint === "function")
        ? getTouchdownPoint(activeRunwayDirection)
        : CCB;

        const touchdownDistance = Math.sqrt(
            (ac.x - touchdownPointNow.x)*(ac.x - touchdownPointNow.x) +
            (ac.y - touchdownPointNow.y)*(ac.y - touchdownPointNow.y)
        ) / PIXELS_PER_NM;

        // ===============================
        // Localiser capture: if cleared to
        // intercept (e.g. an emergency return
        // to land), turn onto final course once
        // the centreline is crossed
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
        // steer toward a point further down the line so the aircraft
        // actually converges onto it instead of flying parallel
        // beside it.
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
        // profile as soon as we're in range.
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
        // Controller selected climb/descent
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
