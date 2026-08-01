// ======================================
// setup.js
// Pre-simulation setup screen: lets the
// user input the start time and aircraft
// list instead of hardcoding aircraft.js
// ======================================

let acRowCount = 0;

function addAircraftRow(prefill){

    prefill = prefill || {};

    const id = "acRow" + (acRowCount++);

    const row = document.createElement("div");
    row.className = "acRow";
    row.id = id;

    row.innerHTML =
        '<input type="text" class="ac-callsign" placeholder="GFA103" value="' + (prefill.callsign || "") + '">' +

        '<select class="ac-type">' +
            '<option value="A320">A320</option>' +
            '<option value="B738">B738</option>' +
            '<option value="B747">B747</option>' +
            '<option value="ATR72">ATR72</option>' +
            '<option value="DO228">DO228</option>' +
        '</select>' +

        '<input type="number" class="ac-radial" placeholder="300" value="' + (prefill.entryRadial || "") + '">' +

        '<input type="number" class="ac-level" placeholder="180" value="' + (prefill.level != null ? prefill.level : 180) + '">' +

        '<input type="number" class="ac-targetlevel" placeholder="80" value="' + (prefill.targetLevel || "") + '">' +

        '<input type="number" class="ac-speed" placeholder="300" value="' + (prefill.speed || 300) + '">' +

        '<input type="text" class="ac-eta" placeholder="05:13" value="' + (prefill.ccbETA || "") + '">' +

        '<input type="text" class="ac-squawk" placeholder="1000" maxlength="4" value="' + (prefill.squawk || "") + '">' +

        '<button type="button" class="ac-remove">X</button>';

    document.getElementById("aircraftRows").appendChild(row);

    row.querySelector(".ac-remove").onclick = function(){
        row.remove();
    };

}

function timeToMinutesSetup(t){
    const parts = t.split(":");
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function startSimulatorFromSetup(){

    // ---- Start time ----
    const startTimeVal = document.getElementById("setupStartTime").value.trim() || "05:00";
    const parts = startTimeVal.split(":");

    simHour = parseInt(parts[0]) || 0;
    simMinute = parseInt(parts[1]) || 0;
    simSecond = 0;

    // ---- VAD-99 ----
    const vadEl = document.getElementById("setupVad99Active");
    vad99Active = vadEl ? vadEl.checked : true;

    // ---- Aircraft ----
    const rows = document.querySelectorAll("#aircraftRows .acRow");

    const newAircraft = [];

    rows.forEach(row=>{

        const callsign = row.querySelector(".ac-callsign").value.trim();

        if(callsign === "") return;   // skip empty rows

        const type = row.querySelector(".ac-type").value;
        const entryRadial = parseInt(row.querySelector(".ac-radial").value) || 0;
        const level = parseInt(row.querySelector(".ac-level").value) || 180;
        const targetLevel = parseInt(row.querySelector(".ac-targetlevel").value) || level;
        const speed = parseInt(row.querySelector(".ac-speed").value) || 300;
        const ccbETA = row.querySelector(".ac-eta").value.trim() || startTimeVal;
        const squawk = row.querySelector(".ac-squawk").value.trim();

        const heading = (entryRadial + 180) % 360;

        newAircraft.push({

            callsign: callsign,
            type: type,
            route: "",
            entryRadial: entryRadial,
            distance: 60,

            x: 0,
            y: 0,

            labelAngle: 0,

            heading: heading,
            targetHeading: heading,
            turnDirection: "SHORTEST",

            level: level,
            targetLevel: targetLevel,
            verticalSpeed: 0,

            speed: speed,
            targetSpeed: speed,

            ccbETA: ccbETA,
            squawk: squawk,   // blank = primary radar only (no transponder data)

            arrivalPhase: false,
            removeTimer: 0,
            landed: false,
            active: false,
            spawned: false

        });

    });

    aircraft = newAircraft;

    // ---- Reveal the radar, hide setup ----
    document.getElementById("setupScreen").style.display = "none";
    document.getElementById("container").style.display = "flex";

    simulatorStarted = true;

}

window.addEventListener("DOMContentLoaded", function(){

    // Start with a couple of blank rows ready to fill in
    addAircraftRow();
    addAircraftRow();

    document.getElementById("addAircraftRow").onclick = function(){
        addAircraftRow();
    };

    document.getElementById("startSimulatorBtn").onclick = startSimulatorFromSetup;

});
