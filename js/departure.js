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

};
// ======================================
// Create Departure
// ======================================

function createDeparture(runway){

    const depCallsign =
    document.getElementById("depcallsign").value.trim();


    const depLevel =
    document.getElementById("deplevel").value.trim();



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


        type:"A320",


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



        // Climb

        if(ac.level < ac.targetLevel){

            const climbFpm = ac.climbRateFpm || 1500;

            ac.level += climbFpm / 100 / 60;


            ac.verticalSpeed = climbFpm;



            if(ac.level >= ac.targetLevel){

                ac.level = ac.targetLevel;

                ac.verticalSpeed = 0;

            }

        }


    });

}
