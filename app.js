/* Compétition Salle — Mars (Test) V2
   Changements demandés :
   - Qualif : saisie du score final uniquement
   - Duels : saisir les scores réalisés par set (ex 28-26) -> calcul points de set, 1er à 5 gagne
*/

const KEY = "comp_salle_mars_test_v2";

/* ---------------- State ---------------- */
const state = loadState();

function loadState(){
  const raw = localStorage.getItem(KEY);
  if (raw){
    try { return JSON.parse(raw); } catch {}
  }
  return {
    config: {
      targets: 28,
      rhythm: "ABCD",
      top16Bye: true,
      duelCut: "all",
      setPointsToWin: 5,
      finalFromW: 3,
      printOverlay: { enabled:false, dataUrl:null, xMm:10, yMm:10, wMm:40, opacity:0.25 }
    },
    participants: [], // {id, nom, prenom, club, arme:CL|CO|BB, debutant:boolean, present:boolean}
    assignments: [],  // {participantId, target, slot} slot A/B/C/D
    qualif: {},       // pid -> {total:number, validated:boolean}
    bracket: null     // {matches:[...], finalMatchId}
  };
}

function saveState(){
  localStorage.setItem(KEY, JSON.stringify(state));
}

/* ---------------- Utils ---------------- */
function uid(prefix="id"){
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
function $(id){ return document.getElementById(id); }
function esc(s){ return (s ?? "").toString().replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function downloadText(filename, text, mime="text/plain"){
  const blob = new Blob([text], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function splitCsvLine(line){
  const res=[]; let cur=""; let q=false;
  for (let i=0;i<line.length;i++){
    const ch=line[i];
    if (ch === '"'){
      if (q && line[i+1] === '"'){ cur+='"'; i++; }
      else q=!q;
    } else if (ch === ',' && !q){
      res.push(cur); cur="";
    } else cur+=ch;
  }
  res.push(cur);
  return res;
}
function parseCsv(text){
  const lines = text.replace(/\r/g,"").split("\n").filter(l=>l.trim().length);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map(h=>h.trim().toLowerCase());
  const out=[];
  for (let i=1;i<lines.length;i++){
    const cols = splitCsvLine(lines[i]);
    const obj={};
    header.forEach((h,idx)=>obj[h]=cols[idx] ?? "");
    out.push(obj);
  }
  return out;
}
function participantLabel(p){
  return `${p.nom} ${p.prenom || ""}`.trim();
}
function getParticipant(pid){
  return state.participants.find(p=>p.id===pid) || null;
}
function clampInt(v, min, max){
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/* ---------------- Tabs ---------------- */
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("is-active"));
    document.querySelectorAll(".panel").forEach(p=>p.classList.remove("is-active"));
    btn.classList.add("is-active");
    $(btn.dataset.tab).classList.add("is-active");
    if (btn.dataset.tab === "affectations") renderAssignments();
    if (btn.dataset.tab === "qualif") renderQualif();
    if (btn.dataset.tab === "classement") renderRankingTable(lastRanking ?? null);
    if (btn.dataset.tab === "duels") renderBrackets();
  });
});

/* ---------------- Config ---------------- */

function bindConfig(){
  $("cfgTargets").value = state.config.targets;
  $("cfgRhythm").value = state.config.rhythm;
  $("cfgTop16Bye").value = state.config.top16Bye ? "true" : "false";
  $("cfgDuelCut").value = (state.config.duelCut === "all") ? "all" : String(state.config.duelCut);
  if ($("cfgFinalFromW")) $("cfgFinalFromW").value = String(state.config.finalFromW ?? 3);
  if ($("cfgSetPointsToWin")) $("cfgSetPointsToWin").value = String(state.config.setPointsToWin ?? 5);

  $("saveConfig").addEventListener("click", ()=>{
    state.config.targets = clampInt($("cfgTargets").value, 1, 200);
    state.config.rhythm = $("cfgRhythm").value;
    state.config.top16Bye = $("cfgTop16Bye").value === "true";
    const cutVal = $("cfgDuelCut").value;
    state.config.duelCut = (cutVal === "all") ? "all" : clampInt(cutVal, 16, 128);

    if ($("cfgFinalFromW")) state.config.finalFromW = clampInt($("cfgFinalFromW").value, 3, 5);
    if ($("cfgSetPointsToWin")) state.config.setPointsToWin = clampInt($("cfgSetPointsToWin").value, 3, 6);

    applySetPointsToWinToBracket(); // update existing duels
    saveState();
    renderBrackets();
    renderRoundsList?.(); // if defined
    updateDuelToWinLabel();
    alert("Paramètres enregistrés.");
  });

  $("resetAll").addEventListener("click", ()=>{
    if (!confirm("Tout effacer (inscriptions, affectations, qualifs et duels) ?")) return;
    localStorage.removeItem(LS_KEY);
    location.reload();
  });
}


/* ---------------- Greffe ---------------- */
function bindGreffe(){
  $("addParticipant").addEventListener("click", ()=>{
    const nom = $("pNom").value.trim();
    const prenom = $("pPrenom").value.trim();
    const club = $("pClub").value.trim();
    const debutant = $("pDebutant").value === "true";
    const arme = $("pArme").value;

    if (!nom) return alert("Nom obligatoire.");
    const p = { id: uid("p"), nom, prenom, club, arme, debutant, present: true };
    state.participants.push(p);
    state.qualif[p.id] = state.qualif[p.id] || { total: 0, validated:false };
    saveState();
    renderParticipants();
    $("pNom").value=""; $("pPrenom").value=""; $("pClub").value="";
  });

  $("search").addEventListener("input", renderParticipants);

  $("toggleAllPresent").addEventListener("click", ()=>{
    state.participants.forEach(p=>p.present=true);
    saveState(); renderParticipants();
  });
  $("clearAllPresent").addEventListener("click", ()=>{
    state.participants.forEach(p=>p.present=false);
    saveState(); renderParticipants();
  });
}

function renderParticipants(){
  const q = $("search").value.trim().toLowerCase();
  const tbody = $("participantsTable").querySelector("tbody");
  tbody.innerHTML = "";

  const rows = state.participants
    .slice()
    .sort((a,b)=> (a.nom||"").localeCompare(b.nom||""))
    .filter(p=>{
      if (!q) return true;
      const s = `${p.nom} ${p.prenom||""} ${p.club||""}`.toLowerCase();
      return s.includes(q);
    });

  for (const p of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(p.nom)}</td>
      <td>${esc(p.prenom || "")}</td>
      <td>${esc(p.club || "")}</td>
      <td><span class="pill">${esc(p.arme)}</span></td>
      <td>${p.debutant ? '<span class="pill bad">Oui</span>' : '<span class="pill ok">Non</span>'}</td>
      <td>
        <label class="inline">
          <input type="checkbox" data-present="${p.id}" ${p.present ? "checked":""} />
          <span class="pill">${p.present ? "Présent" : "Absent"}</span>
        </label>
      </td>
      <td><button class="btn danger" data-del="${p.id}">Suppr.</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("input[data-present]").forEach(cb=>{
    cb.addEventListener("change", ()=>{
      const p = getParticipant(cb.dataset.present);
      if (!p) return;
      p.present = cb.checked;
      saveState();
      renderParticipants();
    });
  });

  tbody.querySelectorAll("button[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const pid = btn.dataset.del;
      if (!confirm("Supprimer cet archer ?")) return;

      state.participants = state.participants.filter(p=>p.id!==pid);
      state.assignments = state.assignments.filter(a=>a.participantId!==pid);
      delete state.qualif[pid];
      if (state.bracket) state.bracket = null;

      saveState();
      renderParticipants();
    });
  });
}

/* ---------------- Affectations ---------------- */
function bindAffectations(){
  $("autoAssign").addEventListener("click", ()=>{
    const present = state.participants.filter(p=>p.present);
    if (present.length === 0) return alert("Aucun présent.");

    const capacity = state.config.targets * 4;
    if (present.length > capacity){
      if (!confirm(`Il y a ${present.length} présents pour ${capacity} places. L'auto-affectation placera seulement les ${capacity} premiers (triés). Continuer ?`)) return;
    }

    autoAssignTargets();
    saveState();
    renderAssignments();
    alert("Auto-affectation terminée.");
  });

  $("clearAssign").addEventListener("click", ()=>{
    if (!confirm("Vider toutes les affectations ?")) return;
    state.assignments = [];
    saveState();
    renderAssignments();
  });
}

function autoAssignTargets(){
  state.assignments = [];

  const targets = state.config.targets;
  const slots = ["A","B","C","D"];

  const pool = state.participants
    .filter(p=>p.present)
    .slice()
    .sort((a,b)=> (a.nom||"").localeCompare(b.nom||""));

  const capacity = targets * 4;
  const use = pool.slice(0, capacity);

  const CO = use.filter(p=>p.arme==="CO" && !p.debutant);
  const DEB = use.filter(p=>p.debutant);
  // Limite débutants par cible : 1 si possible, sinon 2 si nécessaire
  const beginnerLimit = (DEB.length <= targets) ? 1 : 2;
  const CL = use.filter(p=>p.arme==="CL" && !p.debutant);
  const BB = use.filter(p=>p.arme==="BB" && !p.debutant);

  const tmap = new Map();
  for (let t=1;t<=targets;t++) tmap.set(t, { A:null,B:null,C:null,D:null });

  function placeParticipant(p, t, slot){
    tmap.get(t)[slot]=p.id;
    state.assignments.push({ participantId:p.id, target:t, slot });
  }
  function firstFreeSlot(t){
    const obj = tmap.get(t);
    for (const s of slots){ if (!obj[s]) return s; }
    return null;
  }
  function countArme(t, arme){
    const obj = tmap.get(t);
    let n=0;
    for (const s of slots){
      const pid = obj[s];
      if (!pid) continue;
      const pp = getParticipant(pid);
      if (pp?.arme === arme && !pp?.debutant) n++;
    }
    return n;
  }
  function countBeginner(t){
    const obj = tmap.get(t);
    let n=0;
    for (const s of slots){
      const pid = obj[s]; if (!pid) continue;
      const pp = getParticipant(pid);
      if (pp?.debutant) n++;
    }
    return n;
  }
  function countClub(t, club){
    if (!club) return 0;
    const obj = tmap.get(t);
    let n=0;
    for (const s of slots){
      const pid = obj[s]; if (!pid) continue;
      const pp = getParticipant(pid);
      if ((pp?.club||"").trim().toLowerCase() === club.trim().toLowerCase()) n++;
    }
    return n;
  }

  function hasBB(t){
    const obj = tmap.get(t);
    for (const s of slots){
      const pid = obj[s];
      if (!pid) continue;
      const pp = getParticipant(pid);
      if (pp?.arme === "BB" && !pp?.debutant) return true;
    }
    return false;
  }

  // CO spread
  for (const p of CO){
    let chosen = null;
    for (let tt=1;tt<=targets;tt++){
      if (countArme(tt,"CO")===0 && firstFreeSlot(tt) && countClub(tt, p.club) < 2) { chosen = tt; break; }
    }
    if (!chosen){
      for (let tt=1;tt<=targets;tt++){
        if (firstFreeSlot(tt) && countClub(tt, p.club) < 2) { chosen = tt; break; }
      }
    }
    if (!chosen) break;
    placeParticipant(p, chosen, firstFreeSlot(chosen));
  }

  // Beginners prefer CL/CO and no BB
  for (const p of DEB){
    let chosen = null;
    for (let tt=1;tt<=targets;tt++){
      const free = firstFreeSlot(tt);
      if (!free) continue;
      const co = countArme(tt,"CO");
      const cl = countArme(tt,"CL");
      const bb = hasBB(tt);
      if (!bb && (co+cl) >= 1 && countBeginner(tt) < beginnerLimit && countClub(tt, p.club) < 2) { chosen = tt; break; }
    }
    if (!chosen){
      for (let tt=1;tt<=targets;tt++){
        const free = firstFreeSlot(tt);
        if (!free) continue;
        if (!hasBB(tt) && countBeginner(tt) < beginnerLimit && countClub(tt, p.club) < 2) { chosen = tt; break; }
      }
    }
    if (!chosen){
      for (let tt=1;tt<=targets;tt++){
        if (firstFreeSlot(tt) && countClub(tt, p.club) < 2) { chosen = tt; break; }
      }
    }
    if (!chosen) break;
    placeParticipant(p, chosen, firstFreeSlot(chosen));
  }

  // rest CL then BB
  const rest = [...CL, ...BB].filter(p=>!state.assignments.some(a=>a.participantId===p.id));
  for (const p of rest){
    let chosen = null;

    if (p.arme === "BB"){
      for (let tt=1;tt<=targets;tt++){
        const free = firstFreeSlot(tt);
        if (!free) continue;
        const obj = tmap.get(tt);
        const hasDeb = ["A","B","C","D"].some(s=>{
          const pid = obj[s];
          const pp = pid ? getParticipant(pid) : null;
          return pp?.debutant;
        });
        if (!hasDeb) { chosen = tt; break; }
      }
    }

    if (!chosen){
      for (let tt=1;tt<=targets;tt++){
        if (firstFreeSlot(tt) && countClub(tt, p.club) < 2) { chosen = tt; break; }
      }
    }
    if (!chosen) break;
    placeParticipant(p, chosen, firstFreeSlot(chosen));
  }

  // ensure qualif exists
  state.participants.forEach(p=>{
    state.qualif[p.id] = state.qualif[p.id] || { total:0, validated:false };
  });
}

function assignmentAlertsForTarget(target){
  const rows = state.assignments.filter(a=>a.target===target);
  const ps = rows.map(r=>getParticipant(r.participantId)).filter(Boolean);

  const coCount = ps.filter(p=>p.arme==="CO" && !p.debutant).length;
  const bbCount = ps.filter(p=>p.arme==="BB" && !p.debutant).length;
  const debCount = ps.filter(p=>p.debutant).length;

  const alerts = [];
  const clubCounts = {};
  for (const p of ps){
    const c = (p.club||"").trim().toLowerCase();
    if (!c) continue;
    clubCounts[c] = (clubCounts[c]||0) + 1;
  }
  for (const n of Object.values(clubCounts)){
    if (n>2) alerts.push("2+ du même club");
  }

  if (coCount >= 2) alerts.push("2+ CO sur la cible");
  if (debCount>0){
    const hasCLorCO = ps.some(p=>!p.debutant && (p.arme==="CL" || p.arme==="CO"));
    if (!hasCLorCO) alerts.push("Débutants sans CL/CO");
    if (bbCount>0) alerts.push("Débutants avec BB (éviter si possible)");
  }
  return alerts;
}

function renderAssignments(){
  const tbody = $("assignTable").querySelector("tbody");
  tbody.innerHTML = "";

  const orderSlot = {A:0,B:1,C:2,D:3};
  const rows = state.assignments
    .slice()
    .sort((a,b)=> (a.target-b.target) || (orderSlot[a.slot]-orderSlot[b.slot]));

  for (const a of rows){
    const p = getParticipant(a.participantId);
    if (!p) continue;
    const alerts = assignmentAlertsForTarget(a.target);
    const alertHtml = alerts.length
      ? alerts.map(x=>`<span class="pill bad">${esc(x)}</span>`).join(" ")
      : `<span class="pill ok">OK</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.target}</td>
      <td><span class="pill">${a.slot}</span></td>
      <td>${esc(p.nom)}</td>
      <td>${esc(p.prenom||"")}</td>
      <td><span class="pill">${esc(p.arme)}</span></td>
      <td>${p.debutant ? '<span class="pill bad">Oui</span>' : '<span class="pill ok">Non</span>'}</td>
      <td>${alertHtml}</td>
      <td><button class="btn danger" data-unassign="${p.id}">Retirer</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-unassign]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const pid = btn.dataset.unassign;
      state.assignments = state.assignments.filter(a=>a.participantId!==pid);
      saveState();
      renderAssignments();
    });
  });
}

/* ---------------- Qualif (total only) ---------------- */
function bindQualif(){
  $("qualifApplyFilters").addEventListener("click", renderQualif);
  $("qualifClearFilters").addEventListener("click", ()=>{
    $("qualifFilterTarget").value="";
    $("qualifFilterName").value="";
    renderQualif();
  });
}

function getAssignment(pid){
  return state.assignments.find(a=>a.participantId===pid) || null;
}

function renderQualif(){
  const tbody = $("qualifTable").querySelector("tbody");
  tbody.innerHTML = "";

  const filterT = $("qualifFilterTarget").value ? Number($("qualifFilterTarget").value) : null;
  const filterN = $("qualifFilterName").value.trim().toLowerCase();

  const present = state.participants.filter(p=>p.present);

  const rows = present.slice().sort((a,b)=>{
    const aa = getAssignment(a.id);
    const bb = getAssignment(b.id);
    const ta = aa?.target ?? 9999;
    const tb = bb?.target ?? 9999;
    if (ta !== tb) return ta-tb;
    return (a.nom||"").localeCompare(b.nom||"");
  }).filter(p=>{
    const asg = getAssignment(p.id);
    if (filterT && (asg?.target ?? null) !== filterT) return false;
    if (filterN){
      const s = `${p.nom} ${p.prenom||""} ${p.club||""}`.toLowerCase();
      if (!s.includes(filterN)) return false;
    }
    return true;
  });

  for (const p of rows){
    const asg = getAssignment(p.id);
    const q = state.qualif[p.id] || { total:0, validated:false };
    state.qualif[p.id] = q;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${asg ? asg.target : ""}</td>
      <td>${asg ? `<span class="pill">${asg.slot}</span>` : ""}</td>
      <td>${esc(p.nom)}</td>
      <td>${esc(p.prenom||"")}</td>
      <td>${esc(p.club||"")}</td>
      <td><span class="pill">${esc(p.arme)}</span></td>
      <td>${p.debutant ? '<span class="pill bad">Oui</span>' : '<span class="pill ok">Non</span>'}</td>
      <td>
        <input type="number" min="0" max="400" step="1"
          data-qscore="${p.id}" value="${q.total ?? 0}" ${q.validated ? "disabled":""}
          style="width:110px;" />
      </td>
      <td>
        <label class="inline">
          <input type="checkbox" data-qval="${p.id}" ${q.validated ? "checked":""} />
          <span class="pill">${q.validated ? "Oui" : "Non"}</span>
        </label>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("input[data-qscore]").forEach(inp=>{
    inp.addEventListener("change", ()=>{
      const pid = inp.dataset.qscore;
      const q = state.qualif[pid] || { total:0, validated:false };
      if (q.validated) return;
      q.total = clampInt(inp.value, 0, 9999);
      state.qualif[pid] = q;
      saveState();
    });
  });

  tbody.querySelectorAll("input[data-qval]").forEach(cb=>{
    cb.addEventListener("change", ()=>{
      const pid = cb.dataset.qval;
      const q = state.qualif[pid] || { total:0, validated:false };
      q.validated = cb.checked;
      state.qualif[pid] = q;
      saveState();
      renderQualif(); // refresh disabled state
    });
  });
}

/* ---------------- Classement ---------------- */
let lastRanking = null;

function bindClassement(){
  $("computeRanking").addEventListener("click", ()=>{
    lastRanking = computeRanking();
    renderRankingTable(lastRanking);
  });

  $("exportRankingCsv").addEventListener("click", ()=>{
    const r = lastRanking ?? computeRanking();
    const lines = [];
    lines.push(["rank","nom","prenom","club","arme","debutant","total","validated"].join(","));
    r.forEach((x,idx)=>{
      lines.push([idx+1, csv(x.nom), csv(x.prenom), csv(x.club), x.arme, x.debutant ? "1":"0", x.total, x.validated ? "1":"0"].join(","));
    });
    downloadText("classement_qualif.csv", lines.join("\n"), "text/csv");
  });
}
function csv(v){
  const s = String(v ?? "");
  return /[,"\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
}

function computeRanking(){
  const present = state.participants.filter(p=>p.present);
  const rows = present.map(p=>{
    const q = state.qualif[p.id] || { total:0, validated:false };
    return { ...p, total: clampInt(q.total ?? 0, 0, 99999), validated: !!q.validated };
  });
  rows.sort((a,b)=>{
    if (b.total !== a.total) return b.total - a.total;
    return (a.nom||"").localeCompare(b.nom||"");
  });
  return rows;
}

function renderRankingTable(rows){
  const tbody = $("rankingTable").querySelector("tbody");
  tbody.innerHTML = "";
  if (!rows) return;

  rows.forEach((p, idx)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${esc(p.nom)}</td>
      <td>${esc(p.prenom||"")}</td>
      <td>${esc(p.club||"")}</td>
      <td><span class="pill">${esc(p.arme)}</span></td>
      <td>${p.debutant ? '<span class="pill bad">Oui</span>' : '<span class="pill ok">Non</span>'}</td>
      <td><strong>${p.total}</strong></td>
      <td>${p.present ? '<span class="pill ok">Oui</span>' : '<span class="pill bad">Non</span>'}</td>
      <td>${p.validated ? '<span class="pill ok">Oui</span>' : '<span class="pill">Non</span>'}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ---------------- Duels (set scores -> set points) ---------------- */
function bindDuels(){
  $("buildBracket").addEventListener("click", ()=>{
    const ranking = computeRanking();
    if (ranking.length < 2) return alert("Il faut au moins 2 archers présents.");

    const nonValidated = ranking.filter(r=>!(state.qualif[r.id]?.validated));
    if (nonValidated.length > 0){
      if (!confirm(`Attention : ${nonValidated.length} scores qualif ne sont pas validés. Continuer quand même ?`)) return;
    }

    const cut = state.config.duelCut;
    const selected = (cut === "all") ? ranking.slice() : ranking.slice(0, Math.min(cut, ranking.length));

    state.bracket = buildDoubleElimBracket(selected, {
      top16Bye: state.config.top16Bye,
      setPointsToWin: state.config.setPointsToWin
    });

    // Reset set points to 0 on generation
    for (const m of state.bracket.matches){
      m.sp1 = 0; m.sp2 = 0;
      if (Array.isArray(m.sets)){
        for (const s of m.sets){ s.a=null; s.b=null; }
      }
      m.winnerId = null; m.loserId = null;
    }

    saveState();
    renderBrackets();
    alert("Tableaux générés.");
  });

  $("autoAssignDuelTargets").addEventListener("click", ()=>{
    if (!state.bracket) return alert("Génère d’abord les duels.");
    autoAssignDuelTargets();
    saveState();
    renderBrackets();
    alert("Cibles affectées (par round).");
  });

  $("resetBracket").addEventListener("click", ()=>{
    if (!confirm("Réinitialiser les duels ?")) return;
    state.bracket = null;
    saveState();
    renderBrackets();
  });
}

/*
  match:
  {
    id, bracket:"W"|"L"|"F", round, label,
    p1Id, p2Id,
    sets: [{a:number|null,b:number|null}, ... up to 5],
    sp1, sp2, // set points
    winnerId, loserId,
    nextWin, nextLose,
    setPointsToWin
  }
*/
function buildDoubleElimBracket(selected, opts){
  const top16Bye = !!opts.top16Bye;
  const setPointsToWin = opts.setPointsToWin ?? 5;

  const seeds = selected.map((p, idx)=>({ seed: idx+1, id: p.id }));

  const matches = [];
  const addMatch = (m)=>{ matches.push(m); return m; };
  const M = (bracket, round, label)=> addMatch({
    id: uid("m"),
    bracket, round, label,
    p1Id: null, p2Id: null,
    sets: Array.from({length:5}, ()=>({a:null,b:null})),
    sp1: 0, sp2: 0,
    winnerId: null, loserId: null,
    nextWin: null,
    nextLose: null,
    setPointsToWin,
    target: null,
    target2: null,
    lane: null
  });

  const W1 = Array.from({length:16}, (_,i)=> M("W", 1, `W1-${i+1}`));
  const W2 = Array.from({length:8},  (_,i)=> M("W", 2, `W2-${i+1}`));
  const W3 = Array.from({length:4},  (_,i)=> M("W", 3, `W3-${i+1}`));
  const W4 = Array.from({length:2},  (_,i)=> M("W", 4, `W4-${i+1}`));
  const W5 = [M("W", 5, "W5-1")];

  // winners progression
  for (let i=0;i<16;i++){
    const next = W2[Math.floor(i/2)];
    W1[i].nextWin = { matchId: next.id, slot: (i%2===0 ? "p1":"p2") };
  }
  for (let i=0;i<8;i++){
    const next = W3[Math.floor(i/2)];
    W2[i].nextWin = { matchId: next.id, slot: (i%2===0 ? "p1":"p2") };
  }
  for (let i=0;i<4;i++){
    const next = W4[Math.floor(i/2)];
    W3[i].nextWin = { matchId: next.id, slot: (i%2===0 ? "p1":"p2") };
  }
  for (let i=0;i<2;i++){
    W4[i].nextWin = { matchId: W5[0].id, slot: (i===0 ? "p1":"p2") };
  }

  const L1 = Array.from({length:8},  (_,i)=> M("L", 1, `L1-${i+1}`));
  const L2 = Array.from({length:8},  (_,i)=> M("L", 2, `L2-${i+1}`));
  const L3 = Array.from({length:4},  (_,i)=> M("L", 3, `L3-${i+1}`));
  const L4 = Array.from({length:4},  (_,i)=> M("L", 4, `L4-${i+1}`));
  const L5 = Array.from({length:2},  (_,i)=> M("L", 5, `L5-${i+1}`));
  const L6 = Array.from({length:2},  (_,i)=> M("L", 6, `L6-${i+1}`));
  const L7 = [M("L", 7, "L7-1")];
  const L8 = [M("L", 8, "L8-1")];

  const GF = M("F", 1, "Grand Final");

  // losers progression (wins)
  for (let i=0;i<8;i++) L1[i].nextWin = { matchId: L2[i].id, slot: "p1" };
  for (let i=0;i<8;i++){
    const next = L3[Math.floor(i/2)];
    L2[i].nextWin = { matchId: next.id, slot: (i%2===0 ? "p1":"p2") };
  }
  for (let i=0;i<4;i++) L3[i].nextWin = { matchId: L4[i].id, slot: "p1" };
  for (let i=0;i<4;i++){
    const next = L5[Math.floor(i/2)];
    L4[i].nextWin = { matchId: next.id, slot: (i%2===0 ? "p1":"p2") };
  }
  for (let i=0;i<2;i++) L5[i].nextWin = { matchId: L6[i].id, slot: "p1" };
  for (let i=0;i<2;i++) L6[i].nextWin = { matchId: L7[0].id, slot: (i===0 ? "p1":"p2") };
  L7[0].nextWin = { matchId: L8[0].id, slot: "p1" };
  L8[0].nextWin = { matchId: GF.id, slot: "p2" };

  // losers coming from winners
  for (let i=0;i<16;i++){
    const next = L1[Math.floor(i/2)];
    W1[i].nextLose = { matchId: next.id, slot: (i%2===0 ? "p1":"p2") };
  }
  for (let i=0;i<8;i++)  W2[i].nextLose = { matchId: L2[i].id, slot: "p2" };
  for (let i=0;i<4;i++)  W3[i].nextLose = { matchId: L4[i].id, slot: "p2" };
  for (let i=0;i<2;i++)  W4[i].nextLose = { matchId: L6[i].id, slot: "p2" };
  W5[0].nextLose = { matchId: L8[0].id, slot: "p2" };

  // Winners final to GF
  W5[0].nextWin = { matchId: GF.id, slot: "p1" };

  // Seeding helper for 32 bracket positions (standard: 1 vs 32, 16 vs 17, ...)
// Returns an array length 32 like: [1,32,16,17,8,25,...] where consecutive pairs are matches.
function seedingPositions32(){
  let arr = [1,2];
  for (let size=2; size<32; size*=2){
    const next=[];
    for (const s of arr){
      next.push(s);
      next.push((size*2 + 1) - s);
    }
    arr = next;
  }
  return arr;
}

// Fill initial W1 using standard 32 seeding.
// If top16Bye is ON and we have 48+ seeds, we create prelims for seeds 17..32 (vs 48..33) and wire their winners into W1 slots.
{
  const pos = seedingPositions32(); // 32 slots
  const slotForIndex = (idx)=> (idx % 2 === 0 ? "p1" : "p2");
  const matchIndexForSeed = (seed)=>{
    const idx = pos.indexOf(seed);
    return { idx, mIdx: Math.floor(idx/2), slot: slotForIndex(idx) };
  };

  // Clear W1 slots
  for (const m of W1){ m.p1Id=null; m.p2Id=null; }

  if (top16Bye && seeds.length >= 32){
    // Create prelim matches for seeds 17..32 vs 48..33 (17vs48 ... 32vs33)
    const Pmap = {};
    let i=0;
    for (let s=17; s<=32; s++, i++){
      const pm = M("W", 0, `P-${s}`);
      const oppSeed = 65 - s;
      pm.p1Id = seeds[s-1]?.id ?? null;
      pm.p2Id = seeds[oppSeed-1]?.id ?? null;
      autoAdvanceIfBye(pm, matches);
      Pmap[s] = pm;

      // Winner goes into the exact W1 slot where seed s sits in the 32-bracket
      const { mIdx, slot } = matchIndexForSeed(s);
      pm.nextWin = { matchId: W1[mIdx].id, slot };

      // Loser into losers round1 (simple pairing)
      pm.nextLose = { matchId: L1[Math.floor(i/2)].id, slot: (i%2===0 ? "p1":"p2") };
    }

    // Place seeds 1..16 directly into their proper W1 slots
    for (let s=1; s<=16; s++){
      const { mIdx, slot } = matchIndexForSeed(s);
      setSlot(W1[mIdx], slot, seeds[s-1]?.id ?? null);
    }

  } else {
    // Standard 32 without prelims: fill according to seeding positions.
    const ids = Array.from({length:32}, (_,i)=> seeds[i]?.id ?? null);
    for (let i=0;i<16;i++){
      const sA = pos[i*2];
      const sB = pos[i*2+1];
      W1[i].p1Id = ids[sA-1];
      W1[i].p2Id = ids[sB-1];
    }
  }
}


for (const m of W1) autoAdvanceIfBye(m, matches);

  return { matches, finalMatchId: GF.id, seedMap: Object.fromEntries(seeds.map(s=>[s.id, s.seed])) };
}

function fillStandardW1(W1, seeds32){
  while (seeds32.length < 32) seeds32.push(null);
  for (let i=0;i<16;i++){
    W1[i].p1Id = seeds32[i]?.id ?? null;
    W1[i].p2Id = seeds32[31-i]?.id ?? null;
  }
}

function findMatch(matches, id){
  return matches.find(m=>m.id===id) || null;
}
function setSlot(match, slot, pid){
  if (slot === "p1") match.p1Id = pid;
  else match.p2Id = pid;
}

function computeSetPoints(sets){
  let sp1 = 0, sp2 = 0;
  for (const s of sets){
    if (s.a == null || s.b == null) continue;
    if (s.a > s.b) sp1 += 2;
    else if (s.b > s.a) sp2 += 2;
    else { sp1 += 1; sp2 += 1; }
  }
  return { sp1, sp2 };
}

function winnerFromSetPoints(p1Id, p2Id, sp1, sp2, toWin){
  if (!p1Id || !p2Id){
    const winner = p1Id || p2Id;
    const loser = (p1Id && p2Id) ? (winner===p1Id ? p2Id : p1Id) : null;
    return { winnerId: winner, loserId: loser };
  }
  if (sp1 >= toWin && sp1 > sp2) return { winnerId: p1Id, loserId: p2Id };
  if (sp2 >= toWin && sp2 > sp1) return { winnerId: p2Id, loserId: p1Id };
  return { winnerId: null, loserId: null };
}

function autoAdvanceIfBye(match, matches){
  if (match.winnerId) return;
  const p1 = match.p1Id, p2 = match.p2Id;
  if (p1 && !p2){
    // auto-win with m.setPointsToWin points
    match.sp1 = match.setPointsToWin; match.sp2 = 0;
    match.winnerId = p1; match.loserId = null;
    propagate(match, matches);
  } else if (!p1 && p2){
    match.sp1 = 0; match.sp2 = match.setPointsToWin;
    match.winnerId = p2; match.loserId = null;
    propagate(match, matches);
  }
}

function finalizeMatch(match, sets, matches){
  match.sets = sets;
  const { sp1, sp2 } = computeSetPoints(sets);
  match.sp1 = sp1; match.sp2 = sp2;

  const res = winnerFromSetPoints(match.p1Id, match.p2Id, sp1, sp2, match.setPointsToWin);
  match.winnerId = res.winnerId;
  match.loserId = res.loserId;

  if (match.winnerId) propagate(match, matches);
}

function propagate(match, matches){
  if (match.nextWin && match.winnerId){
    const next = findMatch(matches, match.nextWin.matchId);
    if (next){
      setSlot(next, match.nextWin.slot, match.winnerId);
      autoAdvanceIfBye(next, matches);
    }
  }
  if (match.nextLose && match.loserId){
    const next = findMatch(matches, match.nextLose.matchId);
    if (next){
      setSlot(next, match.nextLose.slot, match.loserId);
      autoAdvanceIfBye(next, matches);
    }
  }
}

/* ---------------- Bracket UI ---------------- */
let modalMatchId = null;

function renderBrackets(){
  const wb = $("winnersBracket");
  const lb = $("losersBracket");
  const fb = $("finalBracket");
  wb.innerHTML = ""; lb.innerHTML=""; fb.innerHTML="";

  if (!state.bracket){
    wb.innerHTML = `<div class="note">Aucun tableau. Clique “Générer depuis classement”.</div>`;
    return;
  }

  const matches = state.bracket.matches;
  const winners = matches.filter(m=>m.bracket==="W").sort((a,b)=>a.round-b.round);
  const losers  = matches.filter(m=>m.bracket==="L").sort((a,b)=>a.round-b.round);
  const finals  = matches.filter(m=>m.bracket==="F").sort((a,b)=>a.round-b.round);

  wb.appendChild(renderBracketColumns(winners, "W"));
  lb.appendChild(renderBracketColumns(losers, "L"));
  fb.appendChild(renderBracketColumns(finals, "F"));
}

function renderBracketColumns(list, prefix){
  const wrap = document.createElement("div");
  wrap.className = "bracket";

  const rounds = [...new Set(list.map(m=>m.round))].sort((a,b)=>a-b);
  for (const r of rounds){
    const col = document.createElement("div");
    col.className = "col";
    col.innerHTML = `<div class="col-title">${prefix}${r===0 ? " Prélim." : " Round "+r}</div>`;
    const matches = list.filter(m=>m.round===r);
    for (const m of matches) col.appendChild(renderMatchCard(m));
    wrap.appendChild(col);
  }
  return wrap;
}

function renderMatchCard(m){
  const card = document.createElement("div");
  card.className = "match";
  card.dataset.mid = m.id;

  const p1 = m.p1Id ? getParticipant(m.p1Id) : null;
  const p2 = m.p2Id ? getParticipant(m.p2Id) : null;

  const seedMap = state.bracket?.seedMap || {};
  const s1n = (m.p1Id && seedMap[m.p1Id]) ? `#${seedMap[m.p1Id]} ` : "";
  const s2n = (m.p2Id && seedMap[m.p2Id]) ? `#${seedMap[m.p2Id]} ` : "";

  const p1Name = p1 ? (s1n + participantLabel(p1)) : "—";
  const p2Name = p2 ? (s2n + participantLabel(p2)) : "—";

  const sp1 = (m.sp1 ?? "");
  const sp2 = (m.sp2 ?? "");

  const p1Class = m.winnerId && m.p1Id ? (m.winnerId===m.p1Id ? "win" : "lose") : "";
  const p2Class = m.winnerId && m.p2Id ? (m.winnerId===m.p2Id ? "win" : "lose") : "";

  card.innerHTML = `
    <div class="meta">${esc(m.label)} • pts de set (1er à ${m.setPointsToWin}) ${m.target ? `• <strong>${m.target2 ? `Cibles ${m.target} & ${m.target2}` : `Cible ${m.target}`}${m.lane ? ` (${m.lane})` : ""}</strong>` : ""}</div>
    <div class="player ${p1Class}">
      <div class="name">${esc(p1Name)}</div>
      <div class="score">${esc(sp1)}</div>
    </div>
    <div class="player ${p2Class}">
      <div class="name">${esc(p2Name)}</div>
      <div class="score">${esc(sp2)}</div>
    </div>
  `;

  card.addEventListener("click", ()=> openMatchModal(m.id));
  return card;
}

/* ---------------- Modal (sets) ---------------- */
function bindModal(){
  $("modalOverlay").addEventListener("click", closeModal);
  $("modalClose").addEventListener("click", closeModal);

  $("modalSave").addEventListener("click", ()=>{
    if (!state.bracket || !modalMatchId) return;
    const m = findMatch(state.bracket.matches, modalMatchId);
    if (!m) return;

    const sets = readSetsFromModal();
    const { sp1, sp2 } = computeSetPoints(sets);
    const toWin = m.setPointsToWin;

    if (!((sp1 >= toWin && sp1 > sp2) || (sp2 >= toWin && sp2 > sp1))){
      return alert(`Score incomplet : personne n'a atteint ${toWin} points (ou égalité).`);
    }

    clearMatchDownstream(m.id);
    finalizeMatch(m, sets, state.bracket.matches);

    saveState();
    closeModal();
    renderBrackets();
  });

  $("modalClear").addEventListener("click", ()=>{
    if (!state.bracket || !modalMatchId) return;
    const m = findMatch(state.bracket.matches, modalMatchId);
    if (!m) return;
    if (!confirm("Effacer le score de ce match (et des matchs suivants dépendants) ?")) return;

    clearMatchDownstream(m.id);
    saveState();
    closeModal();
    renderBrackets();
  });
}

function openMatchModal(matchId){
  if (!state.bracket) return;
  const m = findMatch(state.bracket.matches, matchId);
  if (!m) return;

  modalMatchId = matchId;

  const p1 = m.p1Id ? getParticipant(m.p1Id) : null;
  const p2 = m.p2Id ? getParticipant(m.p2Id) : null;

  $("modalTitle").textContent = `Saisie match — ${m.label}`;
  $("modalSub").textContent = `${p1 ? participantLabel(p1) : "—"} vs ${p2 ? participantLabel(p2) : "—"}`;

  // build inputs
  const grid = $("setsGrid");
  grid.innerHTML = "";
  for (let i=0;i<5;i++){
    const row = document.createElement("div");
    row.className = "setrow";
    row.innerHTML = `
      <div class="small">Set ${i+1}</div>
      <div class="pair">
        <label>
          <span style="display:block;color:var(--muted);font-size:12px;margin-bottom:6px;">Joueur 1</span>
          <input type="number" min="0" max="100" data-seta="${i}" value="${m.sets?.[i]?.a ?? ""}" />
        </label>
        <label>
          <span style="display:block;color:var(--muted);font-size:12px;margin-bottom:6px;">Joueur 2</span>
          <input type="number" min="0" max="100" data-setb="${i}" value="${m.sets?.[i]?.b ?? ""}" />
        </label>
      </div>
    `;
    grid.appendChild(row);
  }

  // live preview
  grid.querySelectorAll("input").forEach(inp=>{
    inp.addEventListener("input", updateModalPreview);
  });
  updateModalPreview();

  $("modal").classList.add("is-open");
  $("modal").setAttribute("aria-hidden","false");
}

function readSetsFromModal(){
  const sets = Array.from({length:5}, ()=>({a:null,b:null}));
  document.querySelectorAll("input[data-seta]").forEach(inp=>{
    const i = Number(inp.dataset.seta);
    const v = inp.value === "" ? null : clampInt(inp.value, 0, 999);
    sets[i].a = v;
  });
  document.querySelectorAll("input[data-setb]").forEach(inp=>{
    const i = Number(inp.dataset.setb);
    const v = inp.value === "" ? null : clampInt(inp.value, 0, 999);
    sets[i].b = v;
  });
  return sets;
}

function updateModalPreview(){
  if (!state.bracket || !modalMatchId) return;
  const m = findMatch(state.bracket.matches, modalMatchId);
  if (!m) return;

  const sets = readSetsFromModal();
  const { sp1, sp2 } = computeSetPoints(sets);
  $("setPointsPreview").textContent = `Points de set : ${sp1} – ${sp2}`;

  const res = winnerFromSetPoints(m.p1Id, m.p2Id, sp1, sp2, m.setPointsToWin);
  const w = res.winnerId ? participantLabel(getParticipant(res.winnerId) || {nom:"?"}) : "—";
  $("winnerPreview").textContent = `Gagnant : ${w}`;
}

function closeModal(){
  modalMatchId = null;
  $("modal").classList.remove("is-open");
  $("modal").setAttribute("aria-hidden","true");
}

/* Clear match + downstream */
function clearMatchDownstream(matchId){
  const matches = state.bracket.matches;
  const visited = new Set();
  const stack = [matchId];

  function resetMatch(m){
    m.sets = Array.from({length:5}, ()=>({a:null,b:null}));
    m.sp1 = null; m.sp2 = null;
    m.winnerId = null; m.loserId = null;
  }

  while (stack.length){
    const id = stack.pop();
    if (visited.has(id)) continue;
    visited.add(id);

    const m = findMatch(matches, id);
    if (!m) continue;

    const nextIds = [];
    if (m.nextWin) nextIds.push(m.nextWin.matchId);
    if (m.nextLose) nextIds.push(m.nextLose.matchId);

    // clear downstream slots fed by this match
    for (const nid of nextIds){
      const nm = findMatch(matches, nid);
      if (!nm) continue;
      if (m.nextWin && m.nextWin.matchId === nm.id){
        if (m.nextWin.slot === "p1") nm.p1Id = null;
        if (m.nextWin.slot === "p2") nm.p2Id = null;
      }
      if (m.nextLose && m.nextLose.matchId === nm.id){
        if (m.nextLose.slot === "p1") nm.p1Id = null;
        if (m.nextLose.slot === "p2") nm.p2Id = null;
      }
      stack.push(nm.id);
    }

    resetMatch(m);
  }
}


/* ---------- Duel target allocation ---------- */
/* Affectation simple : par round, on assigne les matchs sur les cibles 1..N (puis on boucle).
   Tu peux ensuite modifier manuellement en éditant le JSON si besoin (V4: édition directe). */

function autoAssignDuelTargets(){
  const targets = state.config.targets || 28;
  const finalFromW = state.config.finalFromW ?? 3;
  const matches = state.bracket.matches;

  function isFinalPhase(mm){
    if (mm.bracket === "F") return true;
    if (mm.bracket === "W" && mm.round >= finalFromW) return true;
    if (mm.bracket === "L" && mm.round >= finalFromW) return true;
    return false;
  }

  for (const mm of matches){ mm.target = null; mm.target2 = null; mm.lane = null; }

  const rounds = [...new Set(matches.filter(x=>x.bracket!=="F").map(x=>x.round))].sort((a,b)=>a-b);

  for (const r of rounds){
    const stage = matches.filter(x=>x.round===r && x.bracket!=="F");
    if (!stage.length) continue;

    const anyFinal = stage.some(isFinalPhase);
    const nbArchers = stage.length * 2;

    stage.sort((a,b)=>(a.bracket||"").localeCompare(b.bracket||"") || (a.label||"").localeCompare(b.label||""));

    if (anyFinal){
      const neededTargets = stage.length * 2;
      if (neededTargets > targets){
        console.warn("Pas assez de cibles pour 2 cibles par duel sur ce round.");
      }
      stage.forEach((mm, i)=>{
        const t1 = (2*i) + 1;
        const t2 = (2*i) + 2;
        mm.target  = ((t1-1) % targets) + 1;
        mm.target2 = ((t2-1) % targets) + 1;
        mm.lane = "1 archer/cible";
      });
    } else {
      const allowTwoPerTarget = (nbArchers > 2*targets);
      stage.forEach((mm, i)=>{
        if (!allowTwoPerTarget){
          mm.target = (i % targets) + 1;
          mm.lane = "AB";
        } else {
          const t = Math.floor(i/2) + 1;
          mm.target = ((t-1) % targets) + 1;
          mm.lane = (i % 2 === 0) ? "AB" : "CD";
        }
      });
    }
  }

  // Grand finale(s)
  const finals = matches.filter(mm=>mm.bracket==="F");
  finals.forEach((mm, i)=>{
    const t1 = 1 + 2*i;
    const t2 = 2 + 2*i;
    mm.target  = ((t1-1) % targets) + 1;
    mm.target2 = ((t2-1) % targets) + 1;
    mm.lane = "1 archer/cible";
  });
}



/* ---------- Impression duels ---------- */
function bindDuelPrint(){
  $("printDuelPlan").addEventListener("click", ()=>{
    if (!state.bracket) return alert("Génère d’abord les duels.");
    printDuelPlan();
  });
  $("printDuelMatchSheets").addEventListener("click", ()=>{
    if (!state.bracket) return alert("Génère d’abord les duels.");
    printDuelMatchSheets();
  });
}

function matchName(pid){
  if (!pid) return "—";
  const p = getParticipant(pid);
  if (!p) return "—";
  const seed = state.bracket?.seedMap?.[pid];
  return `${seed ? "#"+seed+" " : ""}${participantLabel(p)}`;
}

function getNextInfo(m, which){
  const link = which === "win" ? m.nextWin : m.nextLose;
  if (!link) return { label:"—", target:"—" };
  const nm = findMatch(state.bracket.matches, link.matchId);
  if (!nm) return { label:"—", target:"—" };
  return { label: nm.label, target: nm.target2 ? `${m.target} & ${m.target2}` : (m.target ?? "—") };
}

function printDuelPlan(){
  const matches = state.bracket.matches.slice();
  const bracketOrder = { "W":0, "L":1, "F":2 };
  matches.sort((a,b)=>{
    const ba = bracketOrder[a.bracket] ?? 99;
    const bb = bracketOrder[b.bracket] ?? 99;
    if (ba!==bb) return ba-bb;
    if (a.round!==b.round) return a.round-b.round;
    return (a.label||"").localeCompare(b.label||"");
  });

  const rows = matches.map(m=>{
    const b = m.bracket==="W" ? "Winners" : m.bracket==="L" ? "Losers" : "Finale";
    const r = m.round===0 ? "Prélim." : "R"+m.round;
    return `<tr>
      <td>${esc(b)}</td>
      <td>${esc(r)}</td>
      <td>${esc(m.label)}</td>
      <td>${esc(m.target2 ? `${m.target} & ${m.target2}` : (m.target ?? "—"))}</td>
      <td>${esc(matchName(m.p1Id))}</td>
      <td>${esc(matchName(m.p2Id))}</td>
    </tr>`;
  }).join("");

  const html = `
    <!doctype html><html lang="fr"><head><meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Plan des duels</title>
    <style>
      @page{ size:A4; margin: 10mm; }
      body{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#111827; }
      h1{ font-size:16px; margin:0 0 8px; }
      .muted{ color:#6b7280; font-size:11px; margin-bottom:10px; }
      table{ width:100%; border-collapse:collapse; font-size:10px; }
      th,td{ border:1px solid #e5e7eb; padding:6px; }
      th{ background:#f9fafb; text-align:left; }
    </style></head><body>
      <h1>Plan des duels (matchs + cibles)</h1>
      <div class="muted">Astuce : clique “Auto-affecter cibles (duels)” avant d’imprimer pour remplir les numéros de cible.</div>
      <table>
        <thead><tr><th>Tableau</th><th>Round</th><th>Match</th><th>Cible</th><th>Joueur 1</th><th>Joueur 2</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>
  `;
  const w = window.open("", "_blank");
  w.document.open(); w.document.write(html); w.document.close(); w.focus();
}

function duelSetGrid(){
  return `
    <table>
      <thead><tr><th>Set</th><th>J1 (score set)</th><th>J2 (score set)</th><th>Pts set J1</th><th>Pts set J2</th></tr></thead>
      <tbody>
        ${[1,2,3,4,5].map(i=>`
          <tr>
            <td>${i}</td><td></td><td></td><td></td><td></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function printDuelMatchSheets(){
  const overlay = state.config.printOverlay || { enabled:false, dataUrl:null, xMm:10, yMm:10, wMm:40, opacity:0.25 };
  const matches = state.bracket.matches.slice().sort((a,b)=>{
    const bracketOrder = { "W":0, "L":1, "F":2 };
    const ba = bracketOrder[a.bracket] ?? 99;
    const bb = bracketOrder[b.bracket] ?? 99;
    if (ba!==bb) return ba-bb;
    if (a.round!==b.round) return a.round-b.round;
    return (a.label||"").localeCompare(b.label||"");
  });

  const pages = matches.map(m=>{
    const b = m.bracket==="W" ? "Winners" : m.bracket==="L" ? "Losers" : "Finale";
    const r = m.round===0 ? "Préliminaire" : `Round ${m.round}`;
    const nWin = getNextInfo(m, "win");
    const nLose = getNextInfo(m, "lose");

    return `
      <section class="page">
        ${overlay.enabled && overlay.dataUrl ? `
          <img class="overlay" src="${overlay.dataUrl}" style="
            left:${overlay.xMm}mm; top:${overlay.yMm}mm; width:${overlay.wMm}mm; opacity:${overlay.opacity};
          "/>` : ""}
        <div class="sheet">
          <div class="head">
            <div>
              <div class="h1">Feuille de match — Duels (sets)</div>
              <div class="h2">${esc(b)} • ${esc(r)} • ${esc(m.label)}</div>
            </div>
            <div class="box small">
              <div><strong>Cible</strong> : ${esc(m.target2 ? `${m.target} & ${m.target2}` : (m.target ?? "—"))}</div>
              <div><strong>1er à</strong> : ${m.setPointsToWin} pts de set</div>
              <div><strong>Couloir</strong> : ${esc(m.lane ?? "—")}</div>
            </div>
          </div>

          <div class="players">
            <div class="pbox"><div class="label">Joueur 1</div><div class="value">${esc(matchName(m.p1Id))}</div></div>
            <div class="pbox"><div class="label">Joueur 2</div><div class="value">${esc(matchName(m.p2Id))}</div></div>
          </div>

          ${duelSetGrid()}

          <div class="path">
            <div class="pbox"><div class="label">Si victoire</div><div class="value">${esc(nWin.label)} • Cible ${esc(nWin.target)}</div></div>
            <div class="pbox"><div class="label">Si défaite</div><div class="value">${esc(nLose.label)} • Cible ${esc(nLose.target)}</div></div>
          </div>

          <div class="sign">
            <div class="pbox signbox"><div class="label">Signature J1</div><div class="line"></div></div>
            <div class="pbox signbox"><div class="label">Signature J2</div><div class="line"></div></div>
          </div>
        </div>
      </section>
    `;
  }).join("");

  const html = `
    <!doctype html><html lang="fr"><head><meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Feuilles duels</title>
    <style>
      @page{ size:A4; margin: 10mm; }
      body{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#111827; }
      .page{ page-break-after: always; position:relative; width:210mm; height:297mm; }
      .overlay{ position:absolute; pointer-events:none; }
      .sheet{ padding:8mm; }
      .head{ display:flex; justify-content:space-between; gap:10mm; align-items:flex-start; }
      .h1{ font-weight:800; font-size:16px; }
      .h2{ color:#6b7280; font-size:12px; margin-top:2px; }
      .box{ border:1px solid #d1d5db; border-radius:4mm; padding:4mm; }
      .small{ font-size:12px; }
      .players{ display:grid; grid-template-columns:1fr 1fr; gap:6mm; margin-top:8mm; }
      .pbox{ border:1px solid #d1d5db; border-radius:4mm; padding:4mm; }
      .label{ color:#6b7280; font-size:11px; }
      .value{ font-size:14px; font-weight:800; margin-top:2mm; }
      table{ width:100%; border-collapse:collapse; margin-top:8mm; font-size:11px; }
      th,td{ border:1px solid #e5e7eb; padding:6px; text-align:center; }
      th{ background:#f9fafb; }
      .path{ display:grid; grid-template-columns:1fr 1fr; gap:6mm; margin-top:8mm; }
      .sign{ display:grid; grid-template-columns:1fr 1fr; gap:6mm; margin-top:10mm; }
      .signbox{ height:25mm; }
      .line{ margin-top:14mm; border-top:1px solid #9ca3af; }
      @media print{ .page{ page-break-after: always; } }
    </style></head><body>${pages}</body></html>
  `;
  const w = window.open("", "_blank");
  w.document.open(); w.document.write(html); w.document.close(); w.focus();
}

/* ---------------- Tools ---------------- */
function bindTools(){
  $("exportJson").addEventListener("click", ()=>{
    downloadText("competition_mars.json", JSON.stringify(state, null, 2), "application/json");
  });

  $("importJson").addEventListener("click", async ()=>{
    const file = $("importJsonFile").files?.[0];
    if (!file) return alert("Choisis un fichier JSON.");
    const text = await file.text();
    try{
      const obj = JSON.parse(text);
      if (!obj.participants || !obj.config) throw new Error("Format invalide");
      localStorage.setItem(KEY, JSON.stringify(obj));
      location.reload();
    } catch(e){
      alert("Import impossible: " + e.message);
    }
  });

  $("downloadCsvTemplate").addEventListener("click", ()=>{
    const tpl = "nom,prenom,club,arme,debutant,present,qualif_total,qualif_validated\nDUPONT,Camille,Club,CL,0,1,108,1\n";
    downloadText("modele_inscriptions.csv", tpl, "text/csv");
  });

  $("importCsv").addEventListener("click", async ()=>{
    const file = $("csvFile").files?.[0];
    if (!file) return alert("Choisis un CSV.");
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) return alert("CSV vide/illisible.");

    let added = 0;
    for (const r of rows){
      const nom = (r.nom||"").trim();
      if (!nom) continue;

      const p = {
        id: uid("p"),
        nom,
        prenom: (r.prenom||"").trim(),
        club: (r.club||"").trim(),
        arme: ["CL","CO","BB"].includes((r.arme||"CL").trim().toUpperCase()) ? (r.arme||"CL").trim().toUpperCase() : "CL",
        debutant: ["1","true","oui","y"].includes((r.debutant||"0").trim().toLowerCase()),
        present: !["0","false","non","n"].includes((r.present||"1").trim().toLowerCase())
      };
      state.participants.push(p);

      const total = clampInt((r.qualif_total||"0").trim(), 0, 99999);
      const validated = ["1","true","oui","y"].includes((r.qualif_validated||"0").trim().toLowerCase());
      state.qualif[p.id] = { total, validated };

      added++;
    }
    saveState();
    renderParticipants();
    renderQualif();
    alert(`Import terminé : ${added} ajoutés.`);
  });
}


/* ---------- Impression feuilles de marque (qualif) ---------- */
function bindPrint(){
  $("printQualifTargetSheets").addEventListener("click", ()=>{ printQualifByTarget(); });

  $("printQualifSheets").addEventListener("click", ()=>{
    const overlay = state.config.printOverlay || { enabled:false, dataUrl:null, xMm:10, yMm:10, wMm:40, opacity:0.25 };

    const present = state.participants.filter(p=>p.present).slice().sort((a,b)=>{
      const aa = getAssignment(a.id); const bb = getAssignment(b.id);
      const ta = aa?.target ?? 9999; const tb = bb?.target ?? 9999;
      if (ta !== tb) return ta-tb;
      return (a.nom||"").localeCompare(b.nom||"");
    });

    const pages = present.map(p=>{
      const asg = getAssignment(p.id);
      const q = state.qualif[p.id] || { total:0, validated:false };
      const target = asg ? asg.target : "—";
      const slot = asg ? asg.slot : "—";

      return `
        <section class="page">
          ${overlay.enabled && overlay.dataUrl ? `
            <img class="overlay" src="${overlay.dataUrl}" style="
              left:${overlay.xMm}mm; top:${overlay.yMm}mm; width:${overlay.wMm}mm; opacity:${overlay.opacity};
            "/>` : ""}
          <div class="sheet">
            <div class="head">
              <div>
                <div class="h1">Feuille de marque — Qualifications</div>
                <div class="h2">Compétition Salle — Mars</div>
              </div>
              <div class="box small">
                <div><strong>Cible</strong> : ${target}</div>
                <div><strong>Pos</strong> : ${slot}</div>
              </div>
            </div>

            <div class="grid">
              <div class="box">
                <div class="label">Archer</div>
                <div class="value">${esc(participantLabel(p))}</div>
              </div>
              <div class="box">
                <div class="label">Club</div>
                <div class="value">${esc(p.club||"")}</div>
              </div>
              <div class="box">
                <div class="label">Arme / statut</div>
                <div class="value">${esc(p.arme)}${p.debutant ? " • Débutant" : ""}</div>
              </div>
              <div class="box">
                <div class="label">Score final</div>
                <div class="value big">${q.total ?? ""}</div>
              </div>
            </div>

            <div class="sign">
              <div class="box signbox">
                <div class="label">Signature archer</div>
                <div class="line"></div>
              </div>
              <div class="box signbox">
                <div class="label">Signature marqueur</div>
                <div class="line"></div>
              </div>
            </div>

            <div class="foot">
              <div class="tiny">Zones / marquages : même blason • zones selon profil (CL/CO/BB/débutant)</div>
            </div>
          </div>
        </section>
      `;
    }).join("");

    const html = `
      <!doctype html><html lang="fr"><head><meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Impression — Qualifications</title>
      <style>
        @page{ size:A4; margin: 10mm; }
        body{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#111827; }
        .page{ page-break-after: always; position:relative; width:210mm; height:297mm; }
        .overlay{ position:absolute; pointer-events:none; }
        .sheet{ padding:10mm; }
        .head{ display:flex; justify-content:space-between; gap:10mm; align-items:flex-start; }
        .h1{ font-weight:800; font-size:16px; }
        .h2{ color:#6b7280; font-size:12px; margin-top:2px; }
        .grid{ display:grid; grid-template-columns: 1fr 1fr; gap:6mm; margin-top:8mm; }
        .box{ border:1px solid #d1d5db; border-radius:4mm; padding:5mm; }
        .label{ color:#6b7280; font-size:11px; }
        .value{ font-size:14px; font-weight:700; margin-top:2mm; }
        .value.big{ font-size:26px; }
        .small{ font-size:12px; }
        .sign{ display:grid; grid-template-columns: 1fr 1fr; gap:6mm; margin-top:10mm; }
        .signbox{ height:35mm; }
        .line{ margin-top:16mm; border-top:1px solid #9ca3af; }
        .foot{ position:absolute; left:10mm; right:10mm; bottom:10mm; color:#6b7280; font-size:10px; }
        .tiny{ font-size:10px; }
        @media print{ .page{ page-break-after: always; } }
      </style></head><body>${pages}</body></html>
    `;

    const w = window.open("", "_blank");
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  });
}


function blankEndTableHtml(){
  return `
    <table>
      <thead>
        <tr><th>Volée</th><th>Flèche 1</th><th>Flèche 2</th><th>Flèche 3</th><th>Total volée</th></tr>
      </thead>
      <tbody>
        ${[1,2,3,4].map(i=>`
          <tr>
            <td>${i}</td><td></td><td></td><td></td><td></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function printQualifByTarget(){
  const overlay = state.config.printOverlay || { enabled:false, dataUrl:null, xMm:10, yMm:10, wMm:40, opacity:0.25 };
  const targets = state.config.targets || 28;
  const slotOrder = {A:0,B:1,C:2,D:3};

  const assigned = state.assignments.slice().sort((a,b)=> (a.target-b.target) || (slotOrder[a.slot]-slotOrder[b.slot]));
  const perTarget = new Map();
  for (const a of assigned){
    const p = getParticipant(a.participantId);
    if (!p || !p.present) continue;
    if (!perTarget.has(a.target)) perTarget.set(a.target, []);
    perTarget.get(a.target).push({ a, p });
  }

  const pages = [];
  for (let t=1; t<=targets; t++){
    const list = (perTarget.get(t) || []).slice().sort((x,y)=> slotOrder[x.a.slot]-slotOrder[y.a.slot]);
    if (list.length === 0) continue;

    const blocks = ["A","B","C","D"].map(slot=>{
      const found = list.find(x=>x.a.slot===slot);
      const p = found?.p || null;
      const club = p?.club || "";
      const arme = p ? `${p.arme}${p.debutant ? " • Débutant" : ""}` : "";
      const name = p ? participantLabel(p) : "—";
      return `
        <div class="qblock">
          <div class="qb-head">
            <div>
              <div class="qb-name">${esc(name)}</div>
              <div class="qb-sub">Cible ${t} • Pos ${slot} • ${esc(club)} • ${esc(arme)}</div>
            </div>
            <div class="pill">Qualif</div>
          </div>
          ${blankEndTableHtml()}
          <div style="display:flex; gap:10px; margin-top:8px;">
            <div style="flex:1; border:1px solid #d1d5db; border-radius:10px; padding:8px;">
              <div style="color:#6b7280; font-size:11px;">Total</div>
              <div style="height:18px;"></div>
            </div>
            <div style="flex:1; border:1px solid #d1d5db; border-radius:10px; padding:8px;">
              <div style="color:#6b7280; font-size:11px;">Signature</div>
              <div style="height:18px; border-top:1px solid #9ca3af; margin-top:18px;"></div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    pages.push(`
      <section class="page">
        ${overlay.enabled && overlay.dataUrl ? `
          <img class="overlay" src="${overlay.dataUrl}" style="
            left:${overlay.xMm}mm; top:${overlay.yMm}mm; width:${overlay.wMm}mm; opacity:${overlay.opacity};
          "/>` : ""}
        <div class="sheet">
          <div class="head">
            <div>
              <div class="h1">Feuille de marque — Qualifications</div>
              <div class="h2">Cible ${t} • 4 volées • 3 flèches</div>
            </div>
            <div class="box small">
              <div><strong>AB/CD</strong></div>
              <div><strong>Blason</strong> : même • zones selon profil</div>
            </div>
          </div>
          <div class="sheet4">${blocks}</div>
        </div>
      </section>
    `);
  }

  if (pages.length === 0){
    alert("Aucune affectation trouvée. Fais l’auto-affectation des cibles avant d’imprimer.");
    return;
  }

  const html = `
    <!doctype html><html lang="fr"><head><meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Impression — Feuilles par cible</title>
    <style>
      @page{ size:A4; margin: 8mm; }
      body{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#111827; }
      .page{ page-break-after: always; position:relative; width:210mm; height:297mm; }
      .overlay{ position:absolute; pointer-events:none; }
      .sheet{ padding:6mm; }
      .head{ display:flex; justify-content:space-between; gap:8mm; align-items:flex-start; }
      .h1{ font-weight:800; font-size:14px; }
      .h2{ color:#6b7280; font-size:11px; margin-top:2px; }
      .box{ border:1px solid #d1d5db; border-radius:4mm; padding:4mm; }
      .small{ font-size:11px; color:#111827; }
      .sheet4{ display:grid; grid-template-columns: 1fr 1fr; gap:6mm; margin-top:6mm; }
      .qblock{ border:1px solid #d1d5db; border-radius:4mm; padding:4mm; }
      .qb-head{ display:flex; justify-content:space-between; gap:4mm; }
      .qb-name{ font-weight:800; font-size:12px; }
      .qb-sub{ color:#6b7280; font-size:10px; margin-top:1mm; }
      table{ width:100%; border-collapse:collapse; margin-top:3mm; font-size:10px; }
      th,td{ border:1px solid #e5e7eb; padding:2mm; text-align:center; }
      th{ background:#f9fafb; }
      .pill{ border:1px solid #e5e7eb; border-radius:999px; padding:1mm 2.5mm; font-size:10px; color:#374151; }
      @media print{ .page{ page-break-after: always; } }
    </style></head><body>${pages.join("")}</body></html>
  `;

  const w = window.open("", "_blank");
  w.document.open(); w.document.write(html); w.document.close(); w.focus();
}

/* ---------- Calque d'impression ---------- */
function bindOverlayControls(){
  const ov = state.config.printOverlay || (state.config.printOverlay = { enabled:false, dataUrl:null, xMm:10, yMm:10, wMm:40, opacity:0.25 });

  $("overlayEnabled").checked = !!ov.enabled;
  $("overlayX").value = ov.xMm ?? 10;
  $("overlayY").value = ov.yMm ?? 10;
  $("overlayW").value = ov.wMm ?? 40;
  $("overlayOpacity").value = ov.opacity ?? 0.25;

  $("overlayFile").addEventListener("change", async ()=>{
    const f = $("overlayFile").files?.[0];
    if (!f) return;
    const dataUrl = await readFileAsDataUrl(f);
    ov.dataUrl = dataUrl;
    saveState();
    alert("Image calque chargée.");
  });

  $("saveOverlay").addEventListener("click", ()=>{
    ov.enabled = $("overlayEnabled").checked;
    ov.xMm = Number($("overlayX").value || 10);
    ov.yMm = Number($("overlayY").value || 10);
    ov.wMm = Number($("overlayW").value || 40);
    ov.opacity = Math.max(0, Math.min(1, Number($("overlayOpacity").value || 0.25)));
    state.config.printOverlay = ov;
    saveState();
    alert("Calque enregistré.");
  });

  $("clearOverlay").addEventListener("click", ()=>{
    if (!confirm("Supprimer le calque (image + réglages) ?")) return;
    state.config.printOverlay = { enabled:false, dataUrl:null, xMm:10, yMm:10, wMm:40, opacity:0.25 };
    saveState();
    $("overlayEnabled").checked = false;
    $("overlayX").value = 10; $("overlayY").value = 10; $("overlayW").value = 40; $("overlayOpacity").value = 0.25;
    $("overlayFile").value = "";
    alert("Calque supprimé.");
  });
}

function readFileAsDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.onerror = ()=> reject(r.error);
    r.readAsDataURL(file);
  });
}


/* ---------- Vue round par round ---------- */
function bindDuelViews(){
  const showBracket = ()=>{
    $("duelBracketView").style.display = "block";
    $("duelRoundsView").style.display = "none";
  };
  const showRounds = ()=>{
    $("duelBracketView").style.display = "none";
    $("duelRoundsView").style.display = "block";
    renderRoundsList();
  };
  $("viewBracketBtn").addEventListener("click", showBracket);
  $("viewRoundsBtn").addEventListener("click", showRounds);
  showBracket();
}

function renderRoundsList(){
  const container = $("roundList");
  container.innerHTML = "";
  if (!state.bracket){
    container.innerHTML = `<div class="note">Aucun tableau. Génère d’abord les duels.</div>`;
    return;
  }
  const matches = state.bracket.matches.slice();
  const seedMap = state.bracket.seedMap || {};

  const bracketOrder = { "W":0, "L":1, "F":2 };
  matches.sort((a,b)=>{
    const ba = bracketOrder[a.bracket] ?? 99;
    const bb = bracketOrder[b.bracket] ?? 99;
    if (ba!==bb) return ba-bb;
    if (a.round!==b.round) return a.round-b.round;
    return (a.label||"").localeCompare(b.label||"");
  });

  const groups = new Map();
  for (const m of matches){
    const k = `${m.bracket}:${m.round}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }

  for (const [k, ms] of groups){
    const [b, rStr] = k.split(":");
    const r = Number(rStr);
    const title = b === "W" ? `Winners — ${r===0 ? "Préliminaire" : "Round "+r}` :
                  b === "L" ? `Losers — Round ${r}` :
                  `Finale`;
    const block = document.createElement("div");
    block.className = "round-block";
    block.innerHTML = `<h4>${title}</h4>`;

    for (const m of ms){
      const p1 = m.p1Id ? getParticipant(m.p1Id) : null;
      const p2 = m.p2Id ? getParticipant(m.p2Id) : null;
      const p1n = p1 ? `${seedMap[m.p1Id] ? "#"+seedMap[m.p1Id]+" " : ""}${participantLabel(p1)}` : "—";
      const p2n = p2 ? `${seedMap[m.p2Id] ? "#"+seedMap[m.p2Id]+" " : ""}${participantLabel(p2)}` : "—";
      const score = (m.sp1!=null && m.sp2!=null) ? `${m.sp1}–${m.sp2}` : "—";
      const target = m.target ? (m.target2 ? `Cibles ${m.target} & ${m.target2}` : `Cible ${m.target}`) : "Cible —";
      const lane = m.lane ? ` • ${m.lane}` : "";

      const item = document.createElement("div");
      item.className = "round-item";
      item.innerHTML = `
        <div class="left">
          <div class="title">${esc(m.label)}</div>
          <div class="names">${esc(p1n)} vs ${esc(p2n)}</div>
        </div>
        <div class="right">
          <span class="pill">${esc(target + lane)}</span>
          <span class="pill">${esc(score)}</span>
          <button class="btn" data-open="${m.id}">Saisir</button>
        </div>
      `;
      block.appendChild(item);
    }
    container.appendChild(block);
  }

  container.querySelectorAll("button[data-open]").forEach(btn=>{
    btn.addEventListener("click", ()=> openMatchModal(btn.dataset.open));
  });
}


function applySetPointsToWinToBracket(){
  if (!state.bracket) return;
  const v = state.config.setPointsToWin ?? 5;
  for (const m of state.bracket.matches){
    m.setPointsToWin = v;
  }
}


function updateDuelToWinLabel(){
  const el = document.getElementById("duelToWinLabel");
  if (!el) return;
  el.textContent = String(state.config.setPointsToWin ?? 5);
}

/* ---------------- Init ---------------- */
bindConfig();
bindGreffe();
bindAffectations();
bindQualif();
bindClassement();
bindDuels();
bindModal();
bindTools();
bindPrint();
bindOverlayControls();
bindDuelViews();
bindDuelPrint();

renderParticipants();
renderAssignments();
renderQualif();
renderRankingTable(null);
renderBrackets();
