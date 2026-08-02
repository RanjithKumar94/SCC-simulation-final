// ======================================
// ATC RADAR SIMULATOR
// radar.js - PART 1
// ======================================

// Canvas
const canvas = document.getElementById("radar");
const ctx = canvas.getContext("2d");

// Radar Size
const RADAR_RADIUS = 380;
const MAX_RANGE = 60;
const PIXELS_PER_NM = RADAR_RADIUS / MAX_RANGE;

function nm(value){
    return value * PIXELS_PER_NM;
}

// Radar Centre
const CENTER_X = canvas.width / 2;
const CENTER_Y = canvas.height / 2;

// CCB VOR
const CCB = {
    x: CENTER_X,
    y: CENTER_Y + 3
};

// Colours
const BG_COLOR = "#000000";
const RING_COLOR = "#333333";
const ROUTE_COLOR = "#555555";
const TEXT_COLOR = "#999999";
const AIRCRAFT_COLOR = "#00FF00";
const AIRCRAFT_SELECTED_COLOR = "#FFFF00";
const EMERGENCY_SQUAWKS = ["7500", "7600", "7700"];
const EMERGENCY_BLINK_COLOR = "#FF0000";

// ======================================
// Emergency squawk alert tone - a short
// two-beep chime played once whenever an
// aircraft (arrival OR departure) is newly
// set to 7500/7600/7700. Generated with
// WebAudio so no external sound file is
// needed. Safe to call from anywhere.
// ======================================
function playEmergencyAlertSound(){

    try{

        const AudioCtx = window.AudioContext || window.webkitAudioContext;

        if(!AudioCtx) return;

        const actx = new AudioCtx();

        const playBeep = (startDelaySec)=>{

            const osc = actx.createOscillator();
            const gain = actx.createGain();

            osc.type = "square";
            osc.frequency.value = 880;

            const startAt = actx.currentTime + startDelaySec;

            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);

            osc.connect(gain);
            gain.connect(actx.destination);

            osc.start(startAt);
            osc.stop(startAt + 0.2);

        };

        playBeep(0);
        playBeep(0.25);

    }
    catch(e){

        console.log("Emergency alert sound failed:", e);

    }

}

// ATS Routes
const ROUTES = [

    {name:"B425", bearing:190},
    {name:"W14", bearing:350},
    {name:"R416", bearing:70},
    {name:"Q1", bearing:252},
    {name:"Q2", bearing:270},
    {name:"G473 NW", bearing:300},
    {name:"G473 SE", bearing:120},
    {name:"088-R/CCB", bearing:88}

];

// ======================================
// Named Fixes (reporting points at 50 NM,
// one at the end of each CCB route)
// ======================================

const FIXES = [

    {name:"ELBIS", bearing:190, distance:50},
    {name:"ANKIT", bearing:252, distance:50},
    {name:"SULEM", bearing:300, distance:50},
    {name:"MANUR", bearing:270, distance:50},
    {name:"BAMUL", bearing:350, distance:50},
    {name:"MANDU", bearing:70,  distance:50},
    {name:"DUMAS", bearing:120, distance:50}

];

function getFixByName(name){

    const fix = FIXES.find(f => f.name === name);

    if(!fix) return null;

    const pos = bearingToXY(fix.bearing, fix.distance);

    pos.bearing = fix.bearing;

    return pos;

}

function drawFixes(){

    FIXES.forEach(fix=>{

        const p = bearingToXY(fix.bearing, fix.distance);

        // Triangle marker (standard reporting-point symbol)

        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 6);
        ctx.lineTo(p.x - 5, p.y + 4);
        ctx.lineTo(p.x + 5, p.y + 4);
        ctx.closePath();

        ctx.strokeStyle = TEXT_COLOR;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = TEXT_COLOR;
        ctx.font = "13px Consolas";
        ctx.textAlign = "left";

        ctx.fillText(fix.name, p.x + 8, p.y + 4);

    });

}

// ======================================
// Extra unnamed route: DUMAS to the
// 088-R/CCB route at 20 NM from CCB
// ======================================

const EXTRA_ROUTES = [

    {
        from:{bearing:120, distance:50},   // DUMAS
        to:{bearing:88, distance:20}
    }

];

function drawExtraRoutes(){

    ctx.strokeStyle = ROUTE_COLOR;
    ctx.lineWidth = 2;

    EXTRA_ROUTES.forEach(r=>{

        const start = bearingToXY(r.from.bearing, r.from.distance);
        const end   = bearingToXY(r.to.bearing, r.to.distance);

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

    });

}

// ======================================
// NDBs (defined by radial/distance from CCB)
// ======================================

const NDBS = [

    {name:"PJ", fullName:"PANKAJ", bearing:190, distance:30},   // sits on the B425 track
    {name:"BR", fullName:"BINSAR", bearing:252, distance:35},
    {name:"NT", fullName:"NIPTAN", bearing:30,  distance:19}

];

// Resolve each NDB's x/y once CCB is known
NDBS.forEach(ndb=>{

    const pos = bearingToXY(ndb.bearing, ndb.distance);

    ndb.x = pos.x;
    ndb.y = pos.y;

});

function getNDB(name){

    return NDBS.find(n => n.name === name);

}

// ======================================
// Holding Patterns (right/left racetrack)
// Only CCB, NT, PJ and BR are supported.
// CCB has 4 published entries in the real
// procedure (078/095 Right, 238/241 Left) -
// defaulting to CCB-26 (ILS) 078 Right here
// since it's usable regardless of VAD-99
// status. Flag if a different one is wanted.
// ======================================

const HOLD_FIXES = {
    "CCB": {inboundTrack:78, turn:"RIGHT", mha:30},

    // NT hold: inbound track 090 means the aircraft flies inbound
    // TO the fix heading 090 (i.e. approaching from the west, so
    // on the inbound leg it sits on a bearing of 270 FROM NT).
    // Outbound leg is the reciprocal, heading 270.
    //
    // The turn that actually shapes the pattern is the ENTRY turn
    // (inbound 090 -> outbound 270), since it's flown gradually
    // over the whole outbound leg. The return turn barely matters
    // visually - once inbound, the sim homes straight on the fix.
    // turn:"LEFT" means that entry turn sweeps 090 -> 000 -> 270,
    // i.e. through the NORTH, putting the pattern on the north
    // side of the inbound/outbound track. ("RIGHT" would sweep
    // 090 -> 180 -> 270, through the south - the wrong side.)
    "NT":  {inboundTrack:90, turn:"LEFT", mha:30},

    "PJ":  {inboundTrack:10, turn:"LEFT",  mha:65},
    "BR":  {inboundTrack:72, turn:"RIGHT", mha:65}
};

function getHoldFixPosition(name){

    if(name === "CCB"){
        return {x:CCB.x, y:CCB.y};
    }

    const ndb = getNDB(name);

    if(ndb){
        return {x:ndb.x, y:ndb.y};
    }

    return null;

}

// ======================================
// Routes that originate from an NDB
// rather than from CCB directly
// ======================================

const NDB_ROUTES = [

    {name:"W-20", from:"PJ", track:160, length:31},
    {name:"109 TR PJ", from:"PJ", track:109, length:44}

];

// ======================================
// Convert Bearing & Distance to X,Y
// ======================================

function bearingToXY(bearing, distance){

    return pointFromXY(CCB, bearing, distance);

}

// ======================================
// Intersection of infinite line p1-p2
// with infinite line p3-p4, or null if
// parallel. Used to find where the
// approach funnel lines cross the
// traffic circuit box edge.
// ======================================

function lineIntersect(p1, p2, p3, p4){

    const x1=p1.x, y1=p1.y, x2=p2.x, y2=p2.y;
    const x3=p3.x, y3=p3.y, x4=p4.x, y4=p4.y;

    const denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);

    if(Math.abs(denom) < 1e-9) return null;

    const t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denom;

    return {
        x: x1 + t*(x2-x1),
        y: y1 + t*(y2-y1)
    };

}

// ======================================
// Generic projection from ANY origin point
// (used for NDB-based routes, e.g. PJ NDB)
// ======================================

function pointFromXY(origin, bearing, distance){

    const angle = (bearing - 90) * Math.PI / 180;

    const scale = RADAR_RADIUS / MAX_RANGE;

    return {

        x: origin.x + Math.cos(angle) * distance * scale,

        y: origin.y + Math.sin(angle) * distance * scale

    };

}

// ======================================
// Radar Background
// ======================================

function drawBackground(){

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.strokeStyle = RING_COLOR;

    for(let i=10;i<=60;i+=10){

        ctx.lineWidth = (i === 30) ? 2.5 : 1;

        ctx.beginPath();

        ctx.arc(
            CCB.x,
            CCB.y,
            i * RADAR_RADIUS / MAX_RANGE,
            0,
            Math.PI * 2
        );

        ctx.stroke();

    }
}
// ======================================
// Runway Configuration
// ======================================

const RUNWAYS = {

    "0826": {
        bearing1:260, label1:"08",
        bearing2:80,  label2:"26"
    },

    "1533": {
        bearing1:335, label1:"15",
        bearing2:155, label2:"33"
    }

};

// Default active runway
let activeRunway = "0826";
let activeRunwayDirection = "26";   // exact selection: "08","26","15","33"

// Display range filter (NM) - does NOT rescale the map,
// just hides aircraft further than this from CCB
let displayRange = 60;

// Set from the setup screen before the exercise starts.
// When false, VAD-99 doesn't apply: DUMAS traffic just
// continues outbound on R120 instead of the 320/R088 route.
let vad99Active = true;

function getActiveRunway(){
    return RUNWAYS[activeRunway];
}

function setActiveRunwayFromSelect(value){

    activeRunwayDirection = value;

    if(value === "08" || value === "26"){
        activeRunway = "0826";
    }
    else{
        activeRunway = "1533";
    }

}

// ======================================
// RWY 08/26 real physical geometry
// (from actual survey data - not the
// simplified "CCB sits on the centreline"
// model used elsewhere in this file)
// ======================================

const RWY_0826_DATA = {

    lengthM: 3812,          // full pavement length
    widthM: 60,

    displacedFrom08M: 140,  // 08 landing threshold, in from physical 08 end
    displacedFrom26M: 240,  // 26 landing threshold, in from physical 26 end

    ccbPerpOffsetM: 400,    // CCB's perpendicular distance from centreline

    // ASSUMPTION: CCB's perpendicular foot on the centreline lands
    // exactly at the RWY08 displaced (landing) threshold. Flagged
    // for confirmation - easy to adjust if that's not quite right.
    ccbFootIsRwy08Threshold: true

};

function metersToPx(m){
    return nm(m / 1852);
}

// Computes the real touchdown points / pavement ends for 08/26,
// all relative to CCB, in canvas pixel space.
function getRunway0826Geometry(){

    const d = RWY_0826_DATA;

    // "along" = direction of travel landing on 26 (08 -> 26), bearing 080
    const alongAngle = (80 - 90) * Math.PI / 180;
    const along = {x:Math.cos(alongAngle), y:Math.sin(alongAngle)};

    // perpendicular to the runway (side CCB sits on - assumption,
    // flip sign here if it renders on the wrong side)
    const perp = {x:-along.y, y:along.x};

    function addScaled(base, dir, meters){
        const px = metersToPx(meters);
        return {x: base.x + dir.x*px, y: base.y + dir.y*px};
    }

    // CCB's foot on the centreline = RWY08 landing threshold (assumption above)
    const touchdown08 = addScaled(CCB, perp, -d.ccbPerpOffsetM);

    const pavementStart08 = addScaled(touchdown08, along, -d.displacedFrom08M);
    const pavementEnd26   = addScaled(pavementStart08, along, d.lengthM);
    const touchdown26     = addScaled(pavementEnd26, along, -d.displacedFrom26M);

    return {along, perp, touchdown08, touchdown26, pavementStart08, pavementEnd26};

}

// Landing heading (direction of travel while touching down) per runway direction
const RWY_LANDING_HEADING = {"08":80, "26":260, "15":155, "33":335};

// Two lines splaying outward (localiser capture "feathers"),
// apex at 8.5 NM from touchdown on the extended centreline,
// each 10 NM long. Drawn as open rays - never connected to
// each other.
const APPROACH_FUNNEL_BEARINGS = {
    "08": [230, 290],
    "26": [50, 110],
    "15": [305, 5],
    "33": [125, 185]
};

const APPROACH_FUNNEL_APEX_NM = 8.5;
const APPROACH_FUNNEL_LENGTH_NM = 10;

// Two vector headings a controller would typically give to
// intercept the localiser/centreline for each runway
const INTERCEPT_HEADINGS = {
    "08": [50, 110],
    "26": [230, 290],
    "15": [125, 185],
    "33": [305, 5]
};

// Perpendicular distance (NM) from an aircraft to the extended
// approach centreline of the active runway - used to detect
// localiser capture.
// Is this aircraft actually flying INBOUND toward the active
// runway's touchdown point right now? Checked by heading, not
// by whether it's an "arrival" or "departure" object - a
// departure that's turned back toward the field counts too,
// and a departure climbing out on the runway heading (which
// can numerically match the inbound course) does not.
function isFlyingInboundToRunway(ac){

    const touchdown = getTouchdownPoint(activeRunwayDirection);

    const toTouchdownX = touchdown.x - ac.x;
    const toTouchdownY = touchdown.y - ac.y;

    const headingAngle = (ac.heading - 90) * Math.PI / 180;
    const headingDirX = Math.cos(headingAngle);
    const headingDirY = Math.sin(headingAngle);

    const dot = toTouchdownX*headingDirX + toTouchdownY*headingDirY;

    return dot > 0;   // heading generally points toward touchdown

}

function getPerpDistanceToCentrelineNM(ac){

    const touchdown = getTouchdownPoint(activeRunwayDirection);
    const approachBearing = getApproachBearing(activeRunwayDirection);

    const angle = (approachBearing - 90) * Math.PI / 180;
    const dir = {x:Math.cos(angle), y:Math.sin(angle)};
    const perp = {x:-dir.y, y:dir.x};

    const dx = ac.x - touchdown.x;
    const dy = ac.y - touchdown.y;

    const perpPx = dx*perp.x + dy*perp.y;

    return Math.abs(perpPx) / PIXELS_PER_NM;

}

function getApproachBearing(direction){
    return (RWY_LANDING_HEADING[direction] + 180) % 360;
}

function getTouchdownPoint(direction){

    // Touchdown sits 1NM from CCB, offset toward that runway's own
    // threshold direction: RWY08 1NM west (toward the 08 threshold),
    // RWY26 1NM east (toward the 26 threshold), and the same idea
    // for RWY15/33 (335/155). Reuses the existing RUNWAYS bearings
    // rather than a separate table, so they can't drift apart.
    for(const pairKey in RUNWAYS){

        const pair = RUNWAYS[pairKey];

        if(pair.label1 === direction){
            return pointFromXY(CCB, pair.bearing1, 1);
        }

        if(pair.label2 === direction){
            return pointFromXY(CCB, pair.bearing2, 1);
        }

    }

    // Fallback - unknown direction, default to CCB itself
    return {x: CCB.x, y: CCB.y};

}

// Distance correction from the CCB-based touchdown offset above
// (kept as a function so existing call sites don't need changes).
function getTouchdownCorrectionNM(direction){

    return 1;

}

// ======================================
// PART 2
// Draw Runway
// ======================================

function drawRunway(){

    const rwy = getActiveRunway();

    if(activeRunway === "0826"){

        // Real dimensioned rectangle from actual survey data
        const geo = getRunway0826Geometry();
        const halfWidthPx = metersToPx(RWY_0826_DATA.widthM) / 2;

        const corners = [

            {x: geo.pavementStart08.x + geo.perp.x*halfWidthPx,
             y: geo.pavementStart08.y + geo.perp.y*halfWidthPx},

            {x: geo.pavementEnd26.x + geo.perp.x*halfWidthPx,
             y: geo.pavementEnd26.y + geo.perp.y*halfWidthPx},

            {x: geo.pavementEnd26.x - geo.perp.x*halfWidthPx,
             y: geo.pavementEnd26.y - geo.perp.y*halfWidthPx},

            {x: geo.pavementStart08.x - geo.perp.x*halfWidthPx,
             y: geo.pavementStart08.y - geo.perp.y*halfWidthPx}

        ];

        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        corners.slice(1).forEach(c => ctx.lineTo(c.x, c.y));
        ctx.closePath();
        ctx.fill();

        // Displaced threshold tick marks
        [geo.touchdown08, geo.touchdown26].forEach(td=>{

            const tPx = metersToPx(15);

            ctx.strokeStyle = "#FF0000";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(td.x + geo.perp.x*tPx, td.y + geo.perp.y*tPx);
            ctx.lineTo(td.x - geo.perp.x*tPx, td.y - geo.perp.y*tPx);
            ctx.stroke();

        });

    }
    else{

        // No survey data yet for 15/33 - simplified line
        const p1 = bearingToXY(rwy.bearing1,10);
        const p2 = bearingToXY(rwy.bearing2,10);

        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 4;

        ctx.beginPath();
        ctx.moveTo(p1.x,p1.y);
        ctx.lineTo(p2.x,p2.y);
        ctx.stroke();

    }

}

// ======================================
// Extended Approach Centreline with tick
// marks, anchored to the true touchdown
// point (not CCB) for the active runway.
// Every 1 NM out to 15 NM: 0.5 NM tick
// each side; at 5/10/15 NM: 1 NM each side.
// ======================================

function drawCentreline(){

    const touchdown = getTouchdownPoint(activeRunwayDirection);
    const approachBearing = getApproachBearing(activeRunwayDirection);

    const angle = (approachBearing - 90) * Math.PI / 180;
    const dir = {x:Math.cos(angle), y:Math.sin(angle)};
    const perp = {x:-dir.y, y:dir.x};

    ctx.save();

    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.5;

    const end15 = {
        x: touchdown.x + dir.x*nm(15),
        y: touchdown.y + dir.y*nm(15)
    };

    ctx.beginPath();
    ctx.moveTo(touchdown.x, touchdown.y);
    ctx.lineTo(end15.x, end15.y);
    ctx.stroke();

    for(let d=1; d<=15; d++){

        const center = {
            x: touchdown.x + dir.x*nm(d),
            y: touchdown.y + dir.y*nm(d)
        };

        const half = (d % 5 === 0) ? nm(1) : nm(0.5);

        const p1 = {x:center.x + perp.x*half, y:center.y + perp.y*half};
        const p2 = {x:center.x - perp.x*half, y:center.y - perp.y*half};

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

    }

    ctx.restore();

}

// ======================================
// Approach Funnel - two open lines (not
// connected to each other) splaying out
// from 8.5NM from touchdown, showing the
// localiser capture area for the active
// runway direction.
// ======================================

function drawApproachFunnel(){

    const touchdown = getTouchdownPoint(activeRunwayDirection);
    const approachBearing = getApproachBearing(activeRunwayDirection);

    const apex = pointFromXY(touchdown, approachBearing, APPROACH_FUNNEL_APEX_NM);

    const bearings = APPROACH_FUNNEL_BEARINGS[activeRunwayDirection] || [];

    ctx.save();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.5;

    bearings.forEach(b=>{

        const end = pointFromXY(apex, b, APPROACH_FUNNEL_LENGTH_NM);

        ctx.beginPath();
        ctx.moveTo(apex.x, apex.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

    });

    ctx.restore();

}
// ======================================
// Draw Traffic Circuit (active runway)
// ======================================

function drawTrafficCircuit(){

    const rwy = getActiveRunway();

    // Each end is 12NM out from that direction's own touchdown
    // point (not CCB directly), so the box stays consistent with
    // the 1NM CCB->touchdown offset used everywhere else.
    const end1 = pointFromXY(getTouchdownPoint(rwy.label1), rwy.bearing1, 12);
    const end2 = pointFromXY(getTouchdownPoint(rwy.label2), rwy.bearing2, 12);

    const dx = end2.x - end1.x;
    const dy = end2.y - end1.y;
    const len = Math.sqrt(dx*dx + dy*dy);

    const px = -dy / len;
    const py = dx / len;

    const offset = nm(5);

    const top1 = {x:end1.x + px*offset, y:end1.y + py*offset};
    const top2 = {x:end2.x + px*offset, y:end2.y + py*offset};
    const bot1 = {x:end1.x - px*offset, y:end1.y - py*offset};
    const bot2 = {x:end2.x - px*offset, y:end2.y - py*offset};

    ctx.strokeStyle="#FFFFFF";
    ctx.lineWidth=2;

    // Long edges (top & bottom), full length, unaffected
    ctx.beginPath();
    ctx.moveTo(top1.x,top1.y);
    ctx.lineTo(top2.x,top2.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(bot1.x,bot1.y);
    ctx.lineTo(bot2.x,bot2.y);
    ctx.stroke();

    // Which end faces the active approach funnel
    const nearIsEnd1 = activeRunwayDirection === rwy.label1;
    const nearIsEnd2 = activeRunwayDirection === rwy.label2;

    const nearTop = nearIsEnd1 ? top1 : top2;
    const nearBot = nearIsEnd1 ? bot1 : bot2;
    const farTop  = nearIsEnd1 ? top2 : top1;
    const farBot  = nearIsEnd1 ? bot2 : bot1;

    // Far cap - plain full width edge, no funnel on this side
    ctx.beginPath();
    ctx.moveTo(farTop.x,farTop.y);
    ctx.lineTo(farBot.x,farBot.y);
    ctx.stroke();

    // Near cap - a gap is cut out exactly where the two approach
    // funnel lines cross it, so the box doesn't overlap the funnel
    const funnelBearings = APPROACH_FUNNEL_BEARINGS[activeRunwayDirection];
    let gapCut = false;

    if(funnelBearings && (nearIsEnd1 || nearIsEnd2)){

        const touchdown = getTouchdownPoint(activeRunwayDirection);
        const approachBearing = getApproachBearing(activeRunwayDirection);
        const apex = pointFromXY(touchdown, approachBearing, APPROACH_FUNNEL_APEX_NM);

        const tipA = pointFromXY(apex, funnelBearings[0], APPROACH_FUNNEL_LENGTH_NM);
        const tipB = pointFromXY(apex, funnelBearings[1], APPROACH_FUNNEL_LENGTH_NM);

        const crossA = lineIntersect(apex, tipA, nearTop, nearBot);
        const crossB = lineIntersect(apex, tipB, nearTop, nearBot);

        if(crossA && crossB){

            const dA = (crossA.x-nearTop.x)*px + (crossA.y-nearTop.y)*py;
            const dB = (crossB.x-nearTop.x)*px + (crossB.y-nearTop.y)*py;

            const upperCross = dA > dB ? crossA : crossB;
            const lowerCross = dA > dB ? crossB : crossA;

            ctx.beginPath();
            ctx.moveTo(nearTop.x, nearTop.y);
            ctx.lineTo(upperCross.x, upperCross.y);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(lowerCross.x, lowerCross.y);
            ctx.lineTo(nearBot.x, nearBot.y);
            ctx.stroke();

            gapCut = true;

        }

    }

    if(!gapCut){

        // No funnel on this side (or geometry didn't cross) -
        // draw the near cap as a plain full width edge
        ctx.beginPath();
        ctx.moveTo(nearTop.x,nearTop.y);
        ctx.lineTo(nearBot.x,nearBot.y);
        ctx.stroke();

    }

}
// ======================================
// Draw CCB VOR
// ======================================

function drawCCB(){

    ctx.beginPath();
    ctx.arc(CCB.x,CCB.y,4,0,Math.PI*2);

    ctx.fillStyle="#00FFFF";
    ctx.fill();

}

// ======================================
// Draw ATS Routes
// ======================================

function drawRoutes(){

    ctx.strokeStyle=ROUTE_COLOR;
    ctx.lineWidth=2;

    ROUTES.forEach(route=>{

        const end = bearingToXY(route.bearing,60);

        ctx.beginPath();
        ctx.moveTo(CCB.x,CCB.y);
        ctx.lineTo(end.x,end.y);
        ctx.stroke();

    });

}
// ======================================
// Draw NDBs
// ======================================

function drawNDBs(){

    NDBS.forEach(ndb=>{

        // Dot-in-circle marker (standard NDB symbol, to
        // distinguish from the CCB VOR circle)

        ctx.save();

        ctx.translate(ndb.x, ndb.y);

        ctx.strokeStyle = "#FFAA00";
        ctx.lineWidth = 1.5;

        // Outer circle
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = "#FFAA00";
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

    });

}

// ======================================
// Draw routes that originate from an NDB
// ======================================

function drawNDBRoutes(){

    ctx.strokeStyle = ROUTE_COLOR;
    ctx.lineWidth = 2;

    NDB_ROUTES.forEach(route=>{

        const origin = getNDB(route.from);

        if(!origin){
            console.warn("NDB_ROUTES: unknown origin NDB", route.from);
            return;
        }

        const end = pointFromXY(
            {x:origin.x, y:origin.y},
            route.track,
            route.length
        );

        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

    });

}

// ======================================
// VAD-99 Area (GND/UNL)
// NOTE: approximated from the chart image -
// no exact radial/distance vertices were given.
// Adjust the bearing/distance pairs below if you
// have the official coordinates.
// ======================================

const VAD99 = [

    {bearing:127, distance:16},   // A
    {bearing:118, distance:21},   // B
    {bearing:140, distance:27},   // C
    {bearing:150, distance:23},   // D
    {bearing:148, distance:16}    // E

];

function drawVAD99(){

    if(!vad99Active) return;
    if(VAD99.length === 0) return;

    ctx.save();

    ctx.beginPath();

    VAD99.forEach((pt,i)=>{

        const p = bearingToXY(pt.bearing, pt.distance);

        if(i === 0){
            ctx.moveTo(p.x,p.y);
        }
        else{
            ctx.lineTo(p.x,p.y);
        }

    });

    ctx.closePath();

    ctx.fillStyle = "rgba(255,0,0,0.20)";
    ctx.fill();

    ctx.strokeStyle = "#FF0000";
    ctx.lineWidth = 2;
    ctx.stroke();

    const labelPt = bearingToXY(130, 19);

    ctx.fillStyle = "#FF0000";
    ctx.font = "13px Consolas";
    ctx.textAlign = "center";
    ctx.fillText("VAD-99", labelPt.x, labelPt.y - 4);
    ctx.fillText("GND/UNL", labelPt.x, labelPt.y + 10);
    ctx.textAlign = "left";

    ctx.restore();

}

// ======================================
// VAR-115
// Arc at 40NM between R025 and R050 from
// CCB, then a red line from each end of
// the arc splaying outward (020 from the
// R025 end, 060 from the R050 end), each
// extended until it reaches 60NM from CCB.
// ======================================

const VAR115_R1 = 25;
const VAR115_R2 = 50;
const VAR115_ARC_NM = 40;
const VAR115_LINE1_BEARING = 20;
const VAR115_LINE2_BEARING = 60;
const VAR115_OUTER_NM = 60;

// Length (NM) along a ray - starting at bearing/distance from CCB,
// heading along rayBearing - needed to reach a given range from CCB
function rayReachRangeNM(originBearing, originDistNM, rayBearing, targetRangeNM){

    const originAngle = (originBearing - 90) * Math.PI / 180;
    const ox = Math.cos(originAngle) * originDistNM;
    const oy = Math.sin(originAngle) * originDistNM;

    const dirAngle = (rayBearing - 90) * Math.PI / 180;
    const dx = Math.cos(dirAngle);
    const dy = Math.sin(dirAngle);

    const b = 2 * (ox*dx + oy*dy);
    const c = ox*ox + oy*oy - targetRangeNM*targetRangeNM;

    const disc = b*b - 4*c;

    if(disc < 0) return null;

    const sqrtDisc = Math.sqrt(disc);
    const t = Math.max((-b + sqrtDisc) / 2, (-b - sqrtDisc) / 2);

    return t >= 0 ? t : null;

}

function drawVAR115(){

    ctx.save();
    ctx.strokeStyle = "#FF0000";
    ctx.lineWidth = 2;

    // Arc at 40NM from R025 to R050
    const radiusPx = VAR115_ARC_NM * PIXELS_PER_NM;
    const startAngle = (VAR115_R1 - 90) * Math.PI / 180;
    const endAngle = (VAR115_R2 - 90) * Math.PI / 180;

    ctx.beginPath();
    ctx.arc(CCB.x, CCB.y, radiusPx, startAngle, endAngle, false);
    ctx.stroke();

    // Line from the R025 end of the arc, along bearing 020,
    // out to 60NM from CCB
    const p1 = bearingToXY(VAR115_R1, VAR115_ARC_NM);
    const t1 = rayReachRangeNM(VAR115_R1, VAR115_ARC_NM, VAR115_LINE1_BEARING, VAR115_OUTER_NM);

    if(t1 !== null){

        const e1 = pointFromXY(p1, VAR115_LINE1_BEARING, t1);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(e1.x, e1.y);
        ctx.stroke();

    }

    // Line from the R050 end of the arc, along bearing 060,
    // out to 60NM from CCB
    const p2 = bearingToXY(VAR115_R2, VAR115_ARC_NM);
    const t2 = rayReachRangeNM(VAR115_R2, VAR115_ARC_NM, VAR115_LINE2_BEARING, VAR115_OUTER_NM);

    if(t2 !== null){

        const e2 = pointFromXY(p2, VAR115_LINE2_BEARING, t2);

        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(e2.x, e2.y);
        ctx.stroke();

    }

    ctx.fillStyle = "#FF0000";
    ctx.font = "13px Consolas";
    ctx.textAlign = "center";
    ctx.fillText("VAR-115", p1.x + 10, p1.y - 6);
    ctx.textAlign = "left";

    ctx.restore();

}

// ======================================
// Range / Bearing Line (RBL)
// Works between: aircraft-aircraft,
// aircraft-point, or point-point
// ======================================

let rbls = [];
let rblMode = false;
let rblFirstPoint = null;

function updateRblStatus(text){

    const el = document.getElementById("rblStatus");

    if(el){
        el.textContent = text;
    }

}

// Resolve a stored RBL endpoint to its current x/y.
// Returns null if it referenced an aircraft that's no longer active.
function resolveRblPoint(pt, activeList){

    if(pt.ac){

        if(!activeList.includes(pt.ac)) return null;

        return {x:pt.ac.x, y:pt.ac.y};

    }

    return {x:pt.x, y:pt.y};

}

// ======================================
// Projected Track (speed vector)
// Shows where each aircraft will be in
// N minutes, based on true heading/speed
// ======================================

let projectionMinutes = 0;

function drawProjectedPaths(){

    if(projectionMinutes <= 0) return;

    const activeList =
    [...(typeof aircraft !== "undefined" ? aircraft : []),
     ...(typeof departures !== "undefined" ? departures : [])]
    .filter(ac => ac.active);

    ctx.save();
    ctx.strokeStyle = "#00FFFF";
    ctx.lineWidth = 1;
    ctx.setLineDash([4,4]);

    activeList.forEach(ac=>{

        const distanceNM = ac.speed * (projectionMinutes / 60);
        const angle = (ac.heading - 90) * Math.PI / 180;

        const endX = ac.x + Math.cos(angle) * nm(distanceNM);
        const endY = ac.y + Math.sin(angle) * nm(distanceNM);

        ctx.beginPath();
        ctx.moveTo(ac.x, ac.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

    });

    ctx.setLineDash([]);
    ctx.restore();

}

function drawRBLs(){

    const activeList =
    [...(typeof aircraft !== "undefined" ? aircraft : []),
     ...(typeof departures !== "undefined" ? departures : [])]
    .filter(ac => ac.active);

    rbls.forEach(rbl=>{

        const a = resolveRblPoint(rbl.a, activeList);
        const b = resolveRblPoint(rbl.b, activeList);

        if(!a || !b) return;

        const ax = a.x, ay = a.y;
        const bx = b.x, by = b.y;

        const dx = bx - ax;
        const dy = by - ay;

        const distanceNM = Math.sqrt(dx*dx + dy*dy) / PIXELS_PER_NM;

        let bearing = (Math.atan2(dy,dx) * 180 / Math.PI) + 90;
        bearing = (bearing + 360) % 360;

        ctx.save();

        ctx.strokeStyle = "#00FFFF";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6,4]);

        ctx.beginPath();
        ctx.moveTo(ax,ay);
        ctx.lineTo(bx,by);
        ctx.stroke();

        ctx.setLineDash([]);

        const midX = (ax+bx)/2;
        const midY = (ay+by)/2;

        const label =
        Math.round(bearing) + "°/" +
        distanceNM.toFixed(1) + "NM";

        ctx.fillStyle = "#00FFFF";
        ctx.font = "13px Consolas";
        ctx.textAlign = "center";
        ctx.fillText(label, midX, midY - 6);
        ctx.textAlign = "left";

        ctx.restore();

    });

}

// ======================================
// TRAFFIC CIRCUIT CONFIGURATION
// ======================================

const CIRCUIT = {

    centreline:15,
    final:8,
    upwind:8,
    downwind:12,
    width:5

};

  // ======================================
// PART 3
// Draw Aircraft (placeholder)
// ======================================

// ======================================
// Draw Aircraft
// ======================================
// ======================================
// Draw Unknown Blips
// ======================================

function drawUnknownBlips(){

    unknownBlips.forEach(blip => {

        if(!blip.active) return;

        ctx.beginPath();
        ctx.arc(blip.x, blip.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#00FF00";
        ctx.fill();

    });

}
// ======================================
// Draw Aircraft
// ======================================
// ======================================
// Draw Aircraft
// ======================================

// ======================================
// Draw Aircraft
// ======================================

function drawAircraft(){

    // Draw unknown traffic
    if(typeof unknownBlips !== "undefined"){

        unknownBlips.forEach(blip=>{

            if(!blip.active) return;

            const blipIsSelected =
            (typeof selectedBlip !== "undefined") && selectedBlip === blip;

            // History trail (same cadence/length as aircraft)
            if(blip.trail && blip.trail.length){

                blip.trail.forEach(pt=>{

                    const dx = pt.x - blip.x;
                    const dy = pt.y - blip.y;

                    if(Math.sqrt(dx*dx + dy*dy) < 5) return;

                    ctx.fillStyle = blipIsSelected ? AIRCRAFT_SELECTED_COLOR : "#993333";
                    ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3);

                });

            }

            ctx.fillStyle = blipIsSelected ? AIRCRAFT_SELECTED_COLOR : "#FF0000";

            ctx.beginPath();

            ctx.arc(
                blip.x,
                blip.y,
                6,
                0,
                Math.PI * 2
            );

            ctx.fill();

            if(blipIsSelected){

                ctx.strokeStyle = AIRCRAFT_SELECTED_COLOR;
                ctx.lineWidth = 1.5;

                ctx.beginPath();
                ctx.arc(blip.x, blip.y, 10, 0, Math.PI * 2);
                ctx.stroke();

            }

        });

    }


    if(typeof aircraft === "undefined") return;


    const activeList =
    [...aircraft, ...(typeof departures !== "undefined" ? departures : [])]
    .filter(ac=>{

        if(!ac.active) return false;

        if(typeof displayRange !== "undefined"){

            const dx = ac.x - CCB.x;
            const dy = ac.y - CCB.y;
            const distNM = Math.sqrt(dx*dx + dy*dy) / PIXELS_PER_NM;

            if(distNM > displayRange) return false;

        }

        return true;

    });


    // =====================================
    // PASS 1: compute label anchor points,
    // then repel overlapping labels apart
    // =====================================

    const LABEL_W = 100;
    const LABEL_H = 60;

    const labels = activeList.map(ac=>{

        const angle = ac.labelAngle * Math.PI / 180;
        const leaderLength = 45;

        const bx = ac.x + Math.cos(angle) * leaderLength;
        const by = ac.y + Math.sin(angle) * leaderLength;

        // Text is drawn to the right of the pivot if cos(angle)>=0,
        // to the left otherwise - so the collision box must sit on
        // that same side, not centered on the pivot.
        const dir = Math.cos(angle) >= 0 ? 1 : -1;

        if(!ac.labelOffset){
            ac.labelOffset = {x:0, y:0};
        }

        return {
            ac,
            bx, by, dir,
            ox: ac.labelOffset.x,
            oy: ac.labelOffset.y
        };

    });

    for(let pass=0; pass<8; pass++){

        for(let i=0; i<labels.length; i++){

            for(let j=i+1; j<labels.length; j++){

                const a = labels[i];
                const b = labels[j];

                // Box centre = pivot + offset, shifted toward the
                // side the text actually renders on, plus a bit
                // for the vertical spread of the 3 text lines.
                const ax = a.bx + a.ox + a.dir * (LABEL_W/2);
                const ay = a.by + a.oy + 6;
                const cx = b.bx + b.ox + b.dir * (LABEL_W/2);
                const cy = b.by + b.oy + 6;

                const dx = cx - ax;
                const dy = cy - ay;

                const overlapX = LABEL_W - Math.abs(dx);
                const overlapY = LABEL_H - Math.abs(dy);

                if(overlapX > 0 && overlapY > 0){

                    // Push apart along the axis with LESS overlap
                    if(overlapX < overlapY){

                        const push = (overlapX / 2 + 1) * (dx >= 0 ? 1 : -1);
                        a.ox -= push;
                        b.ox += push;

                    }
                    else{

                        const push = (overlapY / 2 + 1) * (dy >= 0 ? 1 : -1);
                        a.oy -= push;
                        b.oy += push;

                    }

                }

            }

        }

    }

    // Persist (with light smoothing so labels glide, not jump)
    // and clamp so a label can't drift off arbitrarily far.
    labels.forEach(l=>{

        l.ac.labelOffset.x += (l.ox - l.ac.labelOffset.x) * 0.5;
        l.ac.labelOffset.y += (l.oy - l.ac.labelOffset.y) * 0.5;

        l.ac.labelOffset.x = Math.max(-70, Math.min(70, l.ac.labelOffset.x));
        l.ac.labelOffset.y = Math.max(-70, Math.min(70, l.ac.labelOffset.y));

    });


    // =====================================
    // PASS 2: draw trail, blip, leader line,
    // and label at its (possibly repelled) spot
    // =====================================

    labels.forEach(({ac, bx, by})=>{

        const x = ac.x;
        const y = ac.y;

        const isSelected =
        (typeof selectedAircraft !== "undefined") &&
        selectedAircraft === ac;

        const acColor = isSelected
        ? AIRCRAFT_SELECTED_COLOR
        : AIRCRAFT_COLOR;

        const lx = bx + ac.labelOffset.x;
        const ly = by + ac.labelOffset.y;


        // =====================================
        // History trail (last 3-4 positions)
        // =====================================

        if(ac.trail && ac.trail.length){

            ac.trail.forEach(pt=>{

                // Skip any point sitting right on top of the
                // aircraft's own symbol - avoids a blurred/shaded
                // look where the dot and the blip overlap.
                const dx = pt.x - x;
                const dy = pt.y - y;

                if(Math.sqrt(dx*dx + dy*dy) < 5) return;

                ctx.fillStyle = isSelected
                ? AIRCRAFT_SELECTED_COLOR
                : AIRCRAFT_COLOR;

                ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3);

            });

        }


        // =====================================
        // Aircraft blip - diamond that rotates with true heading,
        // nose tip pointing the direction of flight
        // =====================================

        const hdgAngle = (ac.heading - 90) * Math.PI / 180;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(hdgAngle);

        ctx.strokeStyle = acColor;
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(5, 0);     // nose corner
        ctx.lineTo(0, 5);
        ctx.lineTo(-5, 0);
        ctx.lineTo(0, -5);
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = acColor;
        ctx.beginPath();
        ctx.arc(0, 0, 1.4, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();



        // =====================================
        // Emergency squawk (7500/7600/7700) -
        // blink the leader line AND the whole
        // label red until the controller
        // clicks/acknowledges it. Computed here
        // (before the leader line is drawn) so
        // both use the same on/off flicker.
        // Applies to arrivals AND departures -
        // both live in the same activeList.
        // =====================================

        const isEmergencySquawk =
        ac.squawk && EMERGENCY_SQUAWKS.includes(ac.squawk);

        const blinkOn = Math.floor(Date.now() / 400) % 2 === 0;

        const emergencyBlinking =
        isEmergencySquawk && !ac.emergencyAck && blinkOn;



        // =====================================
        // Leader line (follows the label
        // even after it's been repelled)
        // =====================================

        ctx.strokeStyle = emergencyBlinking ? EMERGENCY_BLINK_COLOR : acColor;
        ctx.lineWidth = emergencyBlinking ? 2 : 1;


        ctx.beginPath();

        ctx.moveTo(x,y);

        ctx.lineTo(lx,ly);

        ctx.stroke();



        // =====================================
        // Label anchor
        // =====================================

        let labelX;
        let align;

        const angle = ac.labelAngle * Math.PI / 180;

        if(Math.cos(angle) >= 0){

            // Right side label
            labelX = lx + 8;
            align = "left";

        }
        else{

            // Left side label
            labelX = lx - 8;
            align = "right";

        }


        // Label uses the same emergencyBlinking flag computed
        // above the leader line, so both flicker in sync.

        const labelColor = emergencyBlinking
        ? EMERGENCY_BLINK_COLOR
        : acColor;

        ctx.textAlign = align;
        ctx.fillStyle = labelColor;
        ctx.font = "14px Consolas";



        const hasSquawk = ac.squawk !== undefined && ac.squawk !== null && ac.squawk !== "";

        if(hasSquawk){

            // =====================================
            // Row 1: squawk code (A + code)
            // =====================================

            ctx.fillText(
                "A" + ac.squawk,
                labelX,
                ly - 25
            );

        }


        // =====================================
        // Callsign - always shown regardless of
        // squawk state
        // =====================================

        ctx.fillText(
            ac.callsign,
            labelX,
            ly - 10
        );


        if(hasSquawk){

            // =====================================
            // Row: actual level, target level,
            // climb/descend rate (hundreds of ft/min)
            // =====================================

            const currentFL =
            Math.round(ac.level);

            const assignedFL =
            Math.round(ac.targetLevel);

            let rateText = "";

            if(ac.verticalSpeed > 0){

                rateText =
                " ↑" + Math.round(Math.abs(ac.verticalSpeed)/100);

            }
            else if(ac.verticalSpeed < 0){

                rateText =
                " ↓" + Math.round(Math.abs(ac.verticalSpeed)/100);

            }

            const levelText =
            currentFL + " " + assignedFL + rateText;

            ctx.fillText(
                levelText,
                labelX,
                ly + 5
            );



            // =====================================
            // Row: speed
            // =====================================

            const speedText =
            Math.round(ac.speed) + "KT";

            ctx.fillText(
                speedText,
                labelX,
                ly + 20
            );

        }
        else{

            // Primary radar only - no transponder data.
            // Callsign already shown above; the only other
            // thing shown is the controller's own memory of
            // the assigned level, nothing else (no actual
            // altitude, no speed).

            ctx.fillText(
                String(Math.round(ac.targetLevel)),
                labelX,
                ly + 5
            );

        }



        // Reset
        ctx.textAlign = "left";


    });

}
// ======================================
// Draw Complete Radar
// ======================================

function getZoomFactor(){
    return 60 / displayRange;
}

// Convert a raw canvas click (screen space) into the same
// world-space coordinates aircraft x/y are stored in,
// undoing the zoom transform used for rendering.
function screenToWorld(mx, my){

    const zoom = getZoomFactor();

    return {
        x: CCB.x + (mx - CCB.x) / zoom,
        y: CCB.y + (my - CCB.y) / zoom
    };

}

function drawRadar(){

    ctx.clearRect(0,0,canvas.width,canvas.height);

    const zoom = getZoomFactor();

    ctx.save();

    // Zoom around CCB - underlying aircraft x/y never change,
    // only how they're rendered on screen changes.
    ctx.translate(CCB.x, CCB.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-CCB.x, -CCB.y);

    drawBackground();
    drawRoutes();
    drawExtraRoutes();
    drawNDBRoutes();
    drawVAD99();
    drawVAR115();
    drawRunway();
    drawTrafficCircuit();
    drawCentreline();
    drawApproachFunnel();
    drawCCB();
    drawNDBs();
    drawFixes();

    drawUnknownBlips();
    drawAircraft();
    drawProjectedPaths();
    drawRBLs();

    ctx.restore();

    requestAnimationFrame(drawRadar);

}

// ======================================
// Start Radar
// ======================================

window.onload = function(){

    drawRadar();

    const rwySelect = document.getElementById("runwaySelect");

    function updateInterceptButtonLabels(){

        const hdgs = INTERCEPT_HEADINGS[activeRunwayDirection] || [null,null];
        const btn1 = document.getElementById("interceptHdg1");
        const btn2 = document.getElementById("interceptHdg2");

        if(btn1) btn1.textContent = hdgs[0] !== null
            ? String(hdgs[0]).padStart(3,"0")
            : "-";

        if(btn2) btn2.textContent = hdgs[1] !== null
            ? String(hdgs[1]).padStart(3,"0")
            : "-";

    }

    if(rwySelect){

        setActiveRunwayFromSelect(rwySelect.value);
        updateInterceptButtonLabels();

        rwySelect.onchange = function(){
            setActiveRunwayFromSelect(this.value);
            updateInterceptButtonLabels();
        };

    }

    function clearForApproach(heading){

        if(selectedAircraft == null){
            alert("Select an aircraft first.");
            return;
        }

        selectedAircraft.targetHeading = heading;
        selectedAircraft.turnDirection = "SHORTEST";
        selectedAircraft.targetLevel = 20;   // 2000 ft, until established
        selectedAircraft.locIntercept = true;
        selectedAircraft.directToFix = null;
        selectedAircraft.established = false;
        selectedAircraft.viaDumasRoute = false;
        selectedAircraft.goAround = false;

    }

    const interceptBtn1 = document.getElementById("interceptHdg1");
    const interceptBtn2 = document.getElementById("interceptHdg2");

    if(interceptBtn1){
        interceptBtn1.onclick = function(){
            const hdgs = INTERCEPT_HEADINGS[activeRunwayDirection];
            if(hdgs) clearForApproach(hdgs[0]);
        };
    }

    if(interceptBtn2){
        interceptBtn2.onclick = function(){
            const hdgs = INTERCEPT_HEADINGS[activeRunwayDirection];
            if(hdgs) clearForApproach(hdgs[1]);
        };
    }

    const discontinueBtn = document.getElementById("discontinueApproachBtn");

    if(discontinueBtn){

        discontinueBtn.onclick = function(){

            if(selectedAircraft == null){
                alert("Select an aircraft first.");
                return;
            }

            selectedAircraft.locIntercept = false;
            selectedAircraft.established = false;
            selectedAircraft.approach = false;
            selectedAircraft.arrivalPhase = false;
            selectedAircraft.viaDumasRoute = false;
            selectedAircraft.directToFix = null;
            selectedAircraft.goAround = true;

            // Go around: climb, keep current heading
            selectedAircraft.targetHeading = Math.round(selectedAircraft.heading) % 360;
            selectedAircraft.turnDirection = "SHORTEST";
            selectedAircraft.targetLevel = Math.round(selectedAircraft.level) + 20;

        };

    }

    function setProjectionButtonState(mins){

        projectionMinutes = mins;

        const btns = {
            0: document.getElementById("projOffBtn"),
            2: document.getElementById("proj2Btn"),
            5: document.getElementById("proj5Btn"),
            10: document.getElementById("proj10Btn")
        };

        Object.keys(btns).forEach(key=>{
            if(btns[key]){
                btns[key].style.background = (Number(key) === mins) ? "#007700" : "";
            }
        });

    }

    const projOffBtn = document.getElementById("projOffBtn");
    const proj2Btn = document.getElementById("proj2Btn");
    const proj5Btn = document.getElementById("proj5Btn");
    const proj10Btn = document.getElementById("proj10Btn");

    if(projOffBtn) projOffBtn.onclick = function(){ setProjectionButtonState(0); };
    if(proj2Btn) proj2Btn.onclick = function(){ setProjectionButtonState(2); };
    if(proj5Btn) proj5Btn.onclick = function(){ setProjectionButtonState(5); };
    if(proj10Btn) proj10Btn.onclick = function(){ setProjectionButtonState(10); };

    setProjectionButtonState(0);

    const dctButtons = document.querySelectorAll(".dctBtn");

    dctButtons.forEach(btn=>{

        btn.onclick = function(){

            if(selectedAircraft == null){
                alert("Select an aircraft first.");
                return;
            }

            selectedAircraft.directToFix = btn.getAttribute("data-fix");
            selectedAircraft.established = false;
            selectedAircraft.locIntercept = false;
            selectedAircraft.viaDumasRoute = false;
            selectedAircraft.holdFix = null;
            selectedAircraft.holdPhase = null;

        };

    });

    const holdButtons = document.querySelectorAll(".holdBtn");

    holdButtons.forEach(btn=>{

        btn.onclick = function(){

            if(selectedAircraft == null){
                alert("Select an aircraft first.");
                return;
            }

            selectedAircraft.holdFix = btn.getAttribute("data-fix");
            selectedAircraft.holdPhase = null;
            selectedAircraft.holdOutboundTimer = 0;

            // A hold clearance supersedes any direct-to-fix routing
            selectedAircraft.directToFix = null;
            selectedAircraft.viaDumasRoute = false;

        };

    });

    const rangeSelect = document.getElementById("rangeSelect");

    if(rangeSelect){

        displayRange = Number(rangeSelect.value);

        rangeSelect.onchange = function(){
            displayRange = Number(this.value);
        };

    }

    const rblBtn = document.getElementById("rblBtn");
    const clearRblBtn = document.getElementById("clearRblBtn");

    if(rblBtn){

        rblBtn.onclick = function(){

            rblMode = !rblMode;
            rblFirstPoint = null;

            rblBtn.style.background = rblMode ? "#007700" : "";
            rblBtn.textContent = rblMode ? "RBL: ON (click 2 pts)" : "DRAW RBL";

            updateRblStatus(
                rblMode
                ? "RBL mode ON — click an aircraft or any point"
                : "RBL mode off"
            );

            console.log("RBL mode:", rblMode);

        };

    }

    if(clearRblBtn){

        clearRblBtn.onclick = function(){

            rbls = [];
            rblFirstPoint = null;
            updateRblStatus(rblMode ? "RBL mode ON — click an aircraft or any point" : "");

        };

    }

};

canvas.addEventListener("click", function(e){

    console.log("Canvas clicked");

});
// ======================================
// Label Click Detection
// ======================================
// ======================================
// Aircraft Selection + Label Rotation
// ======================================

canvas.addEventListener("click", function(e){

    const rect = canvas.getBoundingClientRect();

    // The canvas can now render smaller than its internal 900x900
    // resolution (responsive/mobile layout), so raw client
    // coordinates must be scaled up to canvas-internal pixel space.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    // =====================================
    // RBL mode: click aircraft OR any point,
    // on either end, in any combination
    // =====================================

    if(rblMode){

        const world = screenToWorld(mx, my);

        const activeList =
        [...aircraft, ...(typeof departures !== "undefined" ? departures : [])]
        .filter(ac => ac.active);

        const hitAircraft = activeList.find(ac=>{
            const dx = world.x - ac.x;
            const dy = world.y - ac.y;
            return Math.sqrt(dx*dx+dy*dy) <= 18 / getZoomFactor();
        });

        // Either the aircraft we clicked, or the raw point clicked
        const clickedPoint = hitAircraft
        ? {ac: hitAircraft}
        : {x: world.x, y: world.y};

        const clickedLabel = hitAircraft
        ? hitAircraft.callsign
        : "point (" + Math.round(world.x) + "," + Math.round(world.y) + ")";

        if(!rblFirstPoint){

            rblFirstPoint = clickedPoint;
            console.log("RBL: first point =", clickedLabel);
            updateRblStatus("RBL: " + clickedLabel + " selected — click a second aircraft or point");

        }
        else{

            rbls.push({a:rblFirstPoint, b:clickedPoint});
            console.log("RBL drawn:", clickedLabel);
            updateRblStatus("RBL drawn to " + clickedLabel);
            rblFirstPoint = null;

        }

        return;

    }

const world = screenToWorld(mx, my);

// =====================================
// Unknown blip selection - lets the
// controller identify a primary-only
// contact (e.g. one requesting priority
// landing): callsign + level entered via
// the Identify Unknown Traffic panel.
// =====================================

if(typeof unknownBlips !== "undefined"){

    const hitBlip = unknownBlips.find(blip=>{

        if(!blip.active) return false;

        const dx = world.x - blip.x;
        const dy = world.y - blip.y;

        return Math.sqrt(dx*dx + dy*dy) <= 15 / getZoomFactor();

    });

    if(hitBlip){

        selectedBlip = hitBlip;
        selectedAircraft = null;

        const identifyForm = document.getElementById("identifyForm");
        const identifyEmpty = document.getElementById("identifyEmpty");

        if(identifyForm) identifyForm.style.display = "block";
        if(identifyEmpty) identifyEmpty.style.display = "none";

        console.log("Unknown blip selected at", Math.round(hitBlip.x), Math.round(hitBlip.y));

        return;

    }

}

[...aircraft, ...(typeof departures !== "undefined" ? departures : [])].forEach(ac=>{
        if(!ac.active) return;

        const angle = ac.labelAngle * Math.PI / 180;
        const leaderLength = 45;

        const bx = ac.x + Math.cos(angle) * leaderLength;
        const by = ac.y + Math.sin(angle) * leaderLength;

        const offX = ac.labelOffset ? ac.labelOffset.x : 0;
        const offY = ac.labelOffset ? ac.labelOffset.y : 0;

        const lx = bx + offX;
        const ly = by + offY;

        // Match the same left/right alignment the label is drawn with
        const dirRight = Math.cos(angle) >= 0;
        const labelX = dirRight ? lx + 8 : lx - 8;

        const boxLeft  = dirRight ? labelX : labelX - 100;
        const boxRight = dirRight ? labelX + 100 : labelX;

        // Label hit box - covers the whole label (up to 4 lines), click anywhere on it
        if(
            world.x >= boxLeft &&
            world.x <= boxRight &&
            world.y >= ly - 35 &&
            world.y <= ly + 30
        ){
console.log(
    "Clicked aircraft:",
    ac.callsign,
    ac.labelAngle
);
            // Select aircraft
            selectedAircraft = ac;

            // Deselect any unknown blip - the two selections are
            // mutually exclusive
            selectedBlip = null;

            const identifyFormEl = document.getElementById("identifyForm");
            const identifyEmptyEl = document.getElementById("identifyEmpty");

            if(identifyFormEl) identifyFormEl.style.display = "none";
            if(identifyEmptyEl) identifyEmptyEl.style.display = "block";

            // Acknowledge any emergency squawk (7500/7600/7700) -
            // stops the label blinking red until it changes again
            ac.emergencyAck = true;

            // Rotate label 45°
            ac.labelAngle = (ac.labelAngle + 45) % 360;

            // Fill control panel
            document.getElementById("callsign").value = ac.callsign;

            const squawkEl = document.getElementById("squawkInput");
            if(squawkEl){
                squawkEl.value = ac.squawk || "";
            }
            document.getElementById("heading").value = ac.targetHeading;
            document.getElementById("level").value = ac.targetLevel;

            const speedEl = document.getElementById("speedInput");

            if(speedEl){
                speedEl.value =
                (ac.targetSpeed !== undefined ? ac.targetSpeed : ac.speed);
            }

            const climbEl = document.getElementById("climbRateInput");

            if(climbEl){
                climbEl.value = ac.climbRateFpm || 1500;
            }

            const descentEl = document.getElementById("descentRateInput");

            if(descentEl){
                descentEl.value = ac.descentRateFpm || 1500;
            }

            // Turn direction
            const turn = document.querySelector(
                `input[name="turnDir"][value="${ac.turnDirection}"]`
            );

            if(turn){
                turn.checked = true;
            }

            console.log(ac.callsign + " selected");
        }

    });

});
