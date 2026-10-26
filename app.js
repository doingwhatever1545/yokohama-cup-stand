/*
  app.js — everything the app DOES. (index.html = what you see, style.css = how it looks.)

  ┌─────────────── HOW IT WORKS ───────────────────────────────────────────────┐
  │ DATA lives in Firebase Firestore (Google's free online database).           │
  │ Every phone with the same TEAM CODE reads and writes the same records:      │
  │                                                                             │
  │   teams/<team code>/events/<stand>              one record per stand:       │
  │                                                 name, date, float, goal,    │
  │                                                 products, combo deals       │
  │   teams/<team code>/events/<stand>/sales/<id>   one record per sale         │
  │                                                                             │
  │ Why one record per sale instead of a running total? If two people tap at    │
  │ the same moment and both change "total = 5", one change is lost. Two new    │
  │ sale records never clash. Every number on screen is ADDED UP from the sale  │
  │ records each time anything changes (see totals() and soldOf()).             │
  │                                                                             │
  │ FLOW                                                                        │
  │  1. onSnapshot(...) = "tell me whenever this data changes" → updates the    │
  │     variables `ev` (the stand) and `sales` (its sales)                      │
  │  2. every change calls render(), which redraws the whole screen             │
  │  3. buttons call sell() / takeBackOne() / save(), which write to Firebase   │
  │     → Firebase tells every phone → each phone calls render() again          │
  │                                                                             │
  │ OFFLINE: Firebase keeps a copy on the phone. With no signal, taps are saved │
  │ on the phone and sent automatically when the signal comes back.             │
  └─────────────────────────────────────────────────────────────────────────────┘

  SECTIONS (search for "// ==========")
    1 imports · 2 helpers · 3 join screen & team code · 4 Firebase start-up
    5 database helper · 6 listening to data · 7 maths (totals) · 8 selling
    9 drawing the screen · 10 Sell tab cards · 11 Goals & items · 12 saving
    13 End of day · 14 start
*/

// ========== 1. IMPORTS
// Our own settings file, then three parts of Firebase straight from Google's servers.
// The version number (10.12.2) is pinned so an update from Google can't break the app.
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  doc, collection, query, orderBy, onSnapshot, setDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ========== 2. HELPERS
const $ = id => document.getElementById(id);    // shortcut: $("sRev") = the element with id="sRev"
const yen = n => (n < 0 ? "−¥" : "¥") + Math.abs(Math.round(n||0)).toLocaleString("en-US");   // 1500 → "¥1,500"
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };   // anything → a number (blank = 0)

let fs = null, auth = null;                                // Firebase database + sign-in, set up in section 4
let teamCode = null;                                       // this phone's team code
let events = [], eventId = null, ev = null, sales = [];   // all stands, the open stand's id, its record, its sales
let eventsLoaded = false;                                  // true once the server has answered at least once
let unsubEvents = null, unsubEv = null, unsubSales = null; // "stop listening" functions
let syncInfo = {fromCache:true, pending:false};            // for the Live / Offline dot
let form = null;          // the Goals tab's working copy of the stand while you edit
let dirty = false, saveTimer = null;                       // dirty = you have changes not saved yet

function remember(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }     // per-phone memory
function forget(k){ try{ localStorage.removeItem(k); }catch(e){} }
function recall(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function toast(msg){ const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,1600); }
function showNotice(msg){ $("notice").textContent=msg||""; $("notice").hidden=!msg; }
function newId(prefix){ return (prefix||"p")+Date.now().toString(36)+Math.random().toString(36).slice(2,5); }
function slug(s){ return (String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "stand").slice(0,40); }

// ========== 3. JOIN SCREEN & TEAM CODE
// The team code is the "key" to your team's data. It becomes part of the database path,
// so phones with a different code (or no code) can't see your stands.
// Rules (also enforced in firestore.rules): 16–64 characters, a–z, 0–9 and hyphens.
function cleanCode(raw){ return String(raw||"").trim().toLowerCase().replace(/\s+/g,"-"); }
function validCode(c){ return /^[a-z0-9-]{16,64}$/.test(c); }

const configured = !Object.values(firebaseConfig).some(v => String(v).includes("PASTE_"));

function showGate(error){
  $("app").hidden = true; $("gate").hidden = false;
  $("setupMsg").hidden = configured;
  $("joinBtn").disabled = !configured;
  $("joinError").hidden = !error; $("joinError").textContent = error || "";
  if(configured) setTimeout(()=>$("teamCode").focus(), 50);
}
$("joinForm").addEventListener("submit", e => {
  e.preventDefault();                                   // stop the browser reloading the page
  const c = cleanCode($("teamCode").value);
  if(!validCode(c)){ showGate("Team codes are 16–64 characters: letters, numbers and hyphens only."); return; }
  teamCode = c; remember("teamCode", c);
  startApp();
});
// "Use a different team code": tap once to arm, tap again to confirm (phones can't show confirm boxes nicely)
$("switchTeam").addEventListener("click", e => {
  const b = e.currentTarget;
  if(b.dataset.armed!=="1"){ b.dataset.armed="1"; b.textContent="Tap again to leave this team on this phone"; return; }
  flushSave(); forget("teamCode"); location.reload();
});

// ========== 4. FIREBASE START-UP
function initFirebase(){
  const app = initializeApp(firebaseConfig);
  try {
    // keep a copy of the data on the phone → works offline and opens instantly
    fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch(e) {
    fs = initializeFirestore(app, { localCache: memoryLocalCache() });   // fallback (e.g. private browsing)
  }
  auth = getAuth(app);
}

// Anonymous sign-in: every phone gets an invisible account automatically (no email or password).
// It stops random internet traffic from using the database; the team code does the rest.
function startApp(){
  $("gate").hidden = true; $("app").hidden = false;
  $("teamShown").textContent = teamCode.slice(0,4) + "…" + teamCode.slice(-4);   // don't show the whole code
  if(!fs) initFirebase();
  setSync("", "Connecting…");
  let started = false;
  onAuthStateChanged(auth, user => {
    if(user && !started){ started = true; listenStands(); }
  });
  if(!auth.currentUser) signInAnonymously(auth).catch(err => {
    if(err.code === "auth/operation-not-allowed" || err.code === "auth/admin-restricted-operation")
      showNotice("Sign-in is switched off in Firebase. Turn on Anonymous sign-in (setup guide, step 4).");
    else if(err.code === "auth/network-request-failed")
      showNotice("No internet connection. Connect once to sign in; after that the app also works offline.");
    else showNotice("Couldn't sign in ("+err.code+"). Check the Firebase settings (setup guide, steps 4–5).");
    setSync("off","Not connected");
  });
}

function dbFail(e){
  const code = e && e.code;
  if(code==="permission-denied"){
    setSync("off","Not allowed");
    showNotice("The database refused this. Check the team code, and that the security rules are published (setup guide, step 3).");
  } else if(code==="unauthenticated"){
    setSync("off","Not signed in");
    showNotice("Not signed in. Check that Anonymous sign-in is switched on (setup guide, step 4).");
  } else if(code==="resource-exhausted"){
    setSync("off","Limit reached");
    showNotice("The free Firebase limit for today was reached. Sales on this phone are kept and sync when it resets.");
  } else {
    setSync("off","Connection problem");
  }
  console.warn("Firebase error:", e);
}

// ========== 5. DATABASE HELPER
// A small wrapper so the rest of the code can say store.doc("events/nov8").set({...})
// instead of Firebase's longer setDoc(doc(fs, "teams/<code>/events/nov8"), {...}).
// It also adds the "teams/<code>/" part to every path automatically.
const base = () => "teams/" + teamCode + "/";
const store = {
  doc(path){
    const r = doc(fs, base() + path);
    return {
      set:    data => setDoc(r, data),
      update: data => updateDoc(r, data),
      delete: ()   => deleteDoc(r),
      onSnapshot: (next, err) => onSnapshot(r, { includeMetadataChanges: true },
        s => next({ exists: s.exists(), data: () => s.data(), metadata: s.metadata }), err)
    };
  },
  collection(path){
    const c = collection(fs, base() + path);
    const wrap = q => ({
      onSnapshot: (next, err) => onSnapshot(q, { includeMetadataChanges: true },
        s => next({ docs: s.docs.map(d => ({ id: d.id, exists: true, data: () => d.data() })), metadata: s.metadata }), err),
      orderBy: (field, dir) => wrap(query(c, orderBy(field, dir || "asc")))
    });
    const api = wrap(c);
    api.doc = () => store.doc(path + "/" + doc(c).id);   // a brand-new record with a random id
    return api;
  }
};

// The Live / Offline dot next to the date
function setSync(state, text){ $("sync").className="sync "+state; $("syncText").textContent=text; }
function updateSyncDot(){
  if(!navigator.onLine || syncInfo.fromCache) setSync("off", "Offline · saving on this phone");
  else if(syncInfo.pending) setSync("", "Syncing…");
  else setSync("live", "Live");
}
window.addEventListener("online", updateSyncDot);
window.addEventListener("offline", updateSyncDot);

// ========== 6. LISTENING TO DATA
// Listen to the list of stands for this team.
function listenStands(){
  if(unsubEvents) unsubEvents();
  unsubEvents = store.collection("events").onSnapshot(snap => {
    events = snap.docs.map(d => ({id:d.id, ...d.data()}));
    events.sort((a,b)=> String(a.date||"").localeCompare(String(b.date||"")));
    if(!snap.metadata.fromCache) eventsLoaded = true;     // the server has answered at least once
    if(!eventId || !events.find(e=>e.id===eventId)){
      const saved = recall("standEvent"), today = new Date().toISOString().slice(0,10);
      const pick = events.find(e=>e.id===saved) || events.find(e=>(e.date||"") >= today) || events[events.length-1];
      if(pick) selectEvent(pick.id);
    }
    renderEventSel();
    // Only offer "set up your first stand" once the SERVER says there are none —
    // otherwise a slow connection could make it look empty when it isn't.
    $("startBox").hidden = !(eventsLoaded && events.length===0);
    syncInfo.fromCache = snap.metadata.fromCache; updateSyncDot();
    if(!events.length) render();
  }, dbFail);
}

// Open one stand: stop listening to the old one, start listening to this one + its sales.
function selectEvent(id){
  if(id===eventId) return;
  flushSave();
  eventId = id; remember("standEvent", id); form = null; dirty = false;
  if(unsubEv) unsubEv(); if(unsubSales) unsubSales();
  ev = null; sales = [];
  unsubEv = store.doc("events/"+id).onSnapshot(s => {
    ev = s.exists ? s.data() : null;
    if(!dirty && !goalsFocused()) form = null;   // take the shared version unless you're mid-edit
    render();
  }, dbFail);
  unsubSales = store.collection("events/"+id+"/sales").orderBy("at","asc").onSnapshot(s => {
    sales = s.docs.map(d => ({id:d.id, ...d.data()}));
    syncInfo = { fromCache: s.metadata.fromCache, pending: s.metadata.hasPendingWrites }; updateSyncDot();
    render();
  }, dbFail);
  renderEventSel();
}
$("eventSel").addEventListener("change", e => selectEvent(e.target.value));

function renderEventSel(){
  const sel=$("eventSel"); sel.textContent="";
  if(!events.length){ const o=document.createElement("option"); o.textContent="No stands yet"; sel.appendChild(o); sel.disabled=true; return; }
  sel.disabled=false;
  events.forEach(e => { const o=document.createElement("option"); o.value=e.id; o.textContent=e.name||e.id; o.selected = e.id===eventId; sel.appendChild(o); });
}

// First stand for a new team: the Nov 8 plan from the budget, or an empty stand.
const NOV8_PLAN = {
  name:"Nov 8 · U14 ISTAA fundraiser", date:"2026-11-08", float:10000, extraCosts:700, profitGoal:0, cashCounted:0, combos:[],
  items:[
    {id:"pocari",  name:"Pocari Sweat 500ml",       type:"drink", qty:24, cost:120, price:150, keeps:true},
    {id:"water",   name:"Water 500ml",              type:"drink", qty:24, cost:55,  price:100, keeps:true},
    {id:"jelly",   name:"Energy jelly",             type:"snack", qty:12, cost:130, price:200, keeps:true},
    {id:"snacks",  name:"Snacks (chips / cookies)", type:"snack", qty:60, cost:40,  price:100, keeps:true},
    {id:"bananas", name:"Bananas",                  type:"snack", qty:20, cost:30,  price:100, keeps:false}
  ]
};
async function createStand(id, body){
  if(events.find(e=>e.id===id)) id += "-" + Date.now().toString(36);   // never overwrite an existing stand
  store.doc("events/"+id).set(body).catch(dbFail);   // no await: works offline too
  selectEvent(id); $("startBox").hidden = true;
}
$("startNov8").addEventListener("click", () => createStand("nov8", JSON.parse(JSON.stringify(NOV8_PLAN))));
$("startEmpty").addEventListener("click", () => { createStand("stand", {name:"Snack stand", date:"", float:10000, extraCosts:0, profitGoal:0, cashCounted:0, items:[], combos:[]}); showTab("goals"); });

// What the page shows: your in-progress edits if you have any, otherwise the shared stand.
function stand(){ return form || ev || {}; }
function allItems(){ const s=stand(); return Array.isArray(s.items) ? s.items : []; }
function items(){ return allItems().filter(i => (i.name||"").trim()); }      // only products with a name
function itemById(id){ return allItems().find(i => i.id===id); }
function nameOf(id){ const f=itemById(id); return f && (f.name||"").trim() ? f.name : "Removed product"; }

// Combo deals: two different products that still exist, sold together for one price.
function allCombos(){ const s=stand(); return Array.isArray(s.combos) ? s.combos : []; }
function comboReady(c){
  const ids = Array.isArray(c.items) ? c.items : [];
  return ids.length===2 && ids[0]!==ids[1] && ids.every(id => { const it=itemById(id); return it && (it.name||"").trim(); }) && num(c.price)>0;
}
function combos(){ return allCombos().filter(comboReady); }
function comboName(c){ return (c.name||"").trim() || (c.items||[]).map(nameOf).join(" + "); }
function comboNormalPrice(c){ return (c.items||[]).reduce((a,id)=>a+num((itemById(id)||{}).price),0); }   // the two bought separately

// ========== 7. MATHS (TOTALS)
const countOf = s => num(s.count)||1;     // how many units one sale record holds (older records → 1)
// How many of one product have been sold, counting combos it was part of.
function soldOf(id){ let n=0; for(const s of sales) if(Array.isArray(s.items) && s.items.includes(id)) n += countOf(s); return n; }
// How many of one combo deal have been sold.
function comboSold(c){ let n=0; for(const s of sales) if(s.comboId===c.id) n += countOf(s); return n; }

// The plan (before the day): spend vs. best possible money in.
function plan(){
  const s=stand(), its=items();
  const spend = its.reduce((a,i)=>a+num(i.qty)*num(i.cost),0) + num(s.extraCosts);
  const maxRev = its.reduce((a,i)=>a+num(i.qty)*num(i.price),0);
  return {spend, maxRev, maxProfit:maxRev-spend, goal:num(s.profitGoal)};
}
// The live numbers (during the day), all added up from the sale records.
function totals(){
  const its=items(), p=plan();
  const revenue = sales.reduce((a,x)=>a+num(x.price),0);
  let left=0, leftVal=0, units=0;
  its.forEach(i => { const sold=soldOf(i.id); units+=sold; const l=Math.max(0,num(i.qty)-sold); left+=l; if(i.keeps) leftVal+=l*num(i.cost); });
  let comboCount=0, comboDiscount=0;
  sales.filter(x=>x.kind==="combo").forEach(x => {
    comboCount += countOf(x);
    const normal = (x.items||[]).reduce((a,id)=>a+num((itemById(id)||{}).price),0) * countOf(x);
    comboDiscount += Math.max(0, normal - num(x.price));     // how much cheaper than buying the two separately
  });
  return {revenue, spend:p.spend, profit:revenue-p.spend, left, leftVal, float:num(stand().float), units, combos:comboCount, comboDiscount, goal:p.goal};
}

// ========== 8. SELLING
// Save one sale record. `count` = how many units; `price` is the TOTAL for the record,
// `unit` is the price of one (so − can take back a single unit). Combos also store `comboId`.
// We don't wait for the server: Firebase saves it on the phone straight away and sends it when it can.
function sell(itemIds, kind, unitPrice, count, comboId){
  count = Math.max(1, Math.round(num(count)||1));
  const rec = {items:itemIds, kind, price:unitPrice*count, unit:unitPrice, count, at:Date.now()};
  if(comboId) rec.comboId = comboId;
  store.collection("events/"+eventId+"/sales").doc().set(rec).catch(err => { dbFail(err); toast("Not saved — check the connection"); });
}
// Take back ONE unit of a sale record: ×6 becomes ×5, a single sale is deleted.
function takeBackOne(rec, label){
  if(!rec) return;
  const ref = store.doc("events/"+eventId+"/sales/"+rec.id);
  const c = countOf(rec);
  const done = c>1
    ? ref.update({count:c-1, price:num(rec.price) - (rec.unit!=null ? num(rec.unit) : num(rec.price)/c)})
    : ref.delete();
  done.catch(dbFail);
  toast(label+" −1");
}
function undo(saleId){ store.doc("events/"+eventId+"/sales/"+saleId).delete().catch(dbFail); toast("Sale removed"); }

// ========== 9. DRAWING THE SCREEN
function render(){
  const its=items(), t=totals();
  $("evName").textContent = ev ? (ev.name||"Snack stand") : (events.length ? "Loading…" : "Snack stand");
  $("evDate").textContent = ev && ev.date ? new Date(ev.date+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"}) : "";

  // scoreboard
  $("sRev").textContent = yen(t.revenue);
  $("sCount").textContent = t.units+" item"+(t.units===1?"":"s")+" sold"+(t.combos?(" · "+t.combos+" combo"+(t.combos===1?"":"s")):"");
  $("sProfit").textContent = yen(t.profit);
  const pp=$("sProfitPill"); pp.textContent="";
  if(its.length){ const p=document.createElement("span"); p.className="pill "+(t.profit>=0?"good":"bad"); p.textContent = t.profit>=0 ? "Costs covered" : yen(-t.profit)+" to break even"; pp.appendChild(p); }
  $("sBox").textContent = yen(t.float + t.revenue);
  $("sFloat").textContent = "incl. "+yen(t.float)+" float";
  $("sLeft").textContent = t.left;
  $("sLeftVal").textContent = yen(t.leftVal)+" reusable in April";
  $("goalBar").hidden = !t.goal;
  if(t.goal){
    const pct = Math.max(0, Math.min(100, Math.round(t.profit/t.goal*100)));
    $("goalFill").style.width = pct+"%";
    $("goalText").textContent = "Profit goal "+yen(t.goal);
    $("goalPct").textContent = t.profit>=t.goal ? "Goal reached!" : (t.profit>0 ? pct+"% · "+yen(t.goal-t.profit)+" to go" : yen(t.goal-t.profit)+" to go");
  }

  renderTiles(its);
  renderFeed();
  renderHours();
  renderGoals();
  renderReport(its, t);
  const cc=$("cashCount");
  if(document.activeElement!==cc) cc.value = ev && ev.cashCounted ? ev.cashCounted : "";
  renderCashDiff();
}

// ========== 10. SELL TAB CARDS
// One card per product, then one per combo deal. This runs again every time ANYONE sells something,
// so before wiping the cards we remember what you'd typed in a Qty box (and where your cursor was).
function renderTiles(its){
  const tiles=$("tiles");
  const typed = {}; let focusId = null;
  tiles.querySelectorAll(".custom input").forEach(inp => { typed[inp.dataset.id] = inp.value; if(inp===document.activeElement) focusId = inp.dataset.id; });
  tiles.textContent="";
  $("tilesEmpty").hidden = its.length>0 || !ev;

  its.forEach(i => {
    const sold=soldOf(i.id), qty=num(i.qty), left=Math.max(0,qty-sold);
    // − on a product undoes its latest single sale (if it only ever sold inside a combo, − removes that combo)
    const singles = sales.filter(s => s.kind!=="combo" && (s.items||[])[0]===i.id);
    const last = singles[singles.length-1] || [...sales].reverse().find(s => (s.items||[]).includes(i.id));
    tiles.appendChild(makeTile({
      key:i.id, name:i.name, unit:num(i.price), sold, qty, left,
      stock: !qty ? "No stock count" : (left===0 ? "Sold out" : left+" left of "+qty),
      onSell: n => sell([i.id], "sale", num(i.price), n),
      onMinus: last ? () => last.kind==="combo" ? undo(last.id) : takeBackOne(last, i.name) : null,
      typed: typed[i.id]
    }));
  });

  combos().forEach(c => {
    // a combo can only be sold while BOTH products have stock left
    const lefts = c.items.map(id => { const it=itemById(id); return num(it.qty) ? Math.max(0,num(it.qty)-soldOf(id)) : Infinity; });
    const left = Math.min(...lefts), hasCount = isFinite(left);
    const recs = sales.filter(s => s.comboId===c.id);
    const saves = comboNormalPrice(c) - num(c.price);
    tiles.appendChild(makeTile({
      key:"combo-"+c.id, name:comboName(c), unit:num(c.price), sold:comboSold(c), qty: hasCount ? 1 : 0, left: hasCount ? left : 1, combo:true,
      stock: (hasCount && left===0 ? "A product is sold out" : (saves>0 ? "Saves "+yen(saves) : "Combo deal")),
      onSell: n => sell([...c.items], "combo", num(c.price), n, c.id),
      onMinus: recs.length ? () => takeBackOne(recs[recs.length-1], comboName(c)) : null,
      typed: typed["combo-"+c.id]
    }));
  });

  if(focusId && $("amt-"+focusId)) $("amt-"+focusId).focus();   // put your cursor back where it was
}

// Build one card: name, price, stock line, progress bar, − / + buttons and a Qty box.
function makeTile(o){
  const t=document.createElement("div");
  const low = !o.combo && o.qty && o.left<=Math.max(2,Math.ceil(o.qty*0.15));
  t.className = "tile"+(o.combo?" combo":"")+(o.qty && o.left===0 ? " out" : (low ? " low" : ""));
  t.innerHTML='<span class="sold"></span><button type="button" class="tap"><span class="name"></span><span class="price"></span><span class="stock"></span></button>'+
    (o.combo ? '' : '<span class="bar"><i></i></span>')+
    '<div class="ctl"><button type="button" class="minus">−</button><button type="button" class="plus">+</button></div>'+
    '<form class="custom"><input type="number" min="1" max="999" step="1" inputmode="numeric" placeholder="Qty"><button type="submit">Sell</button></form>';
  // textContent (not innerHTML) for names, so a product called "<b>" can't break the page
  t.querySelector(".sold").textContent = o.sold;
  t.querySelector(".name").textContent = o.name;
  t.querySelector(".price").textContent = yen(o.unit);
  t.querySelector(".stock").textContent = o.stock;
  if(!o.combo) t.querySelector(".bar i").style.width = (o.qty ? Math.min(100,Math.round(o.sold/o.qty*100)) : 0)+"%";

  const flash = () => { t.classList.remove("flash"); void t.offsetWidth; t.classList.add("flash"); };
  const add = () => { flash(); o.onSell(1); toast(o.name+" +1"); };
  const tap=t.querySelector(".tap"), plus=t.querySelector(".plus"), minus=t.querySelector(".minus");
  tap.setAttribute("aria-label","Sell one "+o.name+", "+yen(o.unit));
  plus.setAttribute("aria-label","Sell one "+o.name);
  minus.setAttribute("aria-label","Take back one "+o.name);
  tap.addEventListener("click", add);
  plus.addEventListener("click", add);
  minus.disabled = !o.onMinus;
  minus.addEventListener("click", () => o.onMinus && o.onMinus());

  // Qty box: type a number, press Sell (or Enter) → one record with that many units.
  const form=t.querySelector(".custom"), box=form.querySelector("input");
  box.dataset.id = o.key; box.id = "amt-"+o.key;
  box.setAttribute("aria-label","Amount of "+o.name+" to sell");
  if(o.typed!==undefined) box.value = o.typed;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const n = Math.round(num(box.value));
    if(n<1 || n>999){ box.focus(); toast("Type an amount from 1 to 999"); return; }
    box.value = "";                                       // clear first, so the redraw after the sale starts empty
    flash(); o.onSell(n); toast(o.name+" +"+n+" ("+yen(n*o.unit)+")");
  });
  return t;
}

function renderFeed(){
  const feed=$("feed"); feed.textContent="";
  const recent = sales.slice(-8).reverse();
  $("feedEmpty").hidden = recent.length>0;
  recent.forEach(s => {
    const li=document.createElement("li");
    const w=document.createElement("div"); w.className="what";
    const strong=document.createElement("strong");
    const times = countOf(s) > 1 ? " ×"+countOf(s) : "";
    const c = s.comboId ? allCombos().find(x=>x.id===s.comboId) : null;
    strong.textContent = (s.kind==="combo" ? "Combo: "+(c ? comboName(c) : (s.items||[]).map(nameOf).join(" + ")) : nameOf((s.items||[])[0])) + times;
    const tm=document.createElement("div"); tm.className="t";
    tm.textContent = new Date(s.at).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})+" · "+yen(s.price);
    w.append(strong,tm);
    const u=document.createElement("button"); u.type="button"; u.className="btn small ghost"; u.textContent="Undo";
    u.addEventListener("click",()=>undo(s.id));
    li.append(w,u); feed.appendChild(li);
  });
}

function renderHours(){
  const hrs=$("hours"); hrs.textContent="";
  const byH={}; sales.forEach(s=>{ const h=new Date(s.at).getHours(); byH[h]=(byH[h]||0)+num(s.price); });
  let lo=8, hi=17; Object.keys(byH).forEach(h=>{ h=+h; if(h<lo)lo=h; if(h>hi)hi=h; });
  const max=Math.max(1,...Object.values(byH));
  for(let h=lo; h<=hi; h++){
    const c=document.createElement("div"); c.className="h";
    const bar=document.createElement("div"); bar.className="b"; bar.style.height=Math.round(((byH[h]||0)/max)*70)+"px"; bar.title=h+":00 · "+yen(byH[h]||0);
    const l=document.createElement("div"); l.className="hl"; l.textContent=h;
    c.append(bar,l); hrs.appendChild(c);
  }
}

// ========== 11. GOALS & ITEMS
function goalsFocused(){ return $("view-goals").contains(document.activeElement) && document.activeElement.matches("input,select"); }

function renderGoals(){
  const s=stand(), p=plan();
  // the plan numbers at the top
  const kv=$("planKv"); kv.textContent="";
  const need = (target) => p.maxRev ? Math.ceil((p.spend+target)/p.maxRev*100) : 0;
  [["Spend on stock + other costs", yen(p.spend)],
   ["Money in if everything sells", yen(p.maxRev)],
   ["Best possible profit", yen(p.maxProfit), "tot"],
   ["Break even after selling", p.maxRev ? need(0)+"% of stock" : "–"]
  ].forEach(([k,v,cls])=>{ const a=document.createElement("div"); a.textContent=k; const b=document.createElement("div"); b.className="v"; b.textContent=v; if(cls){a.className=cls;b.className="v "+cls;} kv.append(a,b); });

  const adv=$("goalAdvice"); adv.textContent="";
  if(p.goal){
    const pct=need(p.goal), pill=document.createElement("span");
    if(!p.maxRev){ pill.className="pill warn"; pill.textContent="Add products to see what the goal needs"; }
    else if(pct>100){ pill.className="pill bad"; pill.textContent="Goal is more than the best possible profit ("+yen(p.maxProfit)+"). Add stock or raise prices."; }
    else { pill.className="pill "+(pct<=75?"good":"warn"); pill.textContent="You need to sell "+pct+"% of your stock to hit "+yen(p.goal)+(pct<=75?" — realistic":" — ambitious"); }
    adv.appendChild(pill);
  }

  // While you're typing in this tab, only refresh the small calculated lines —
  // rebuilding the boxes would throw away your cursor.
  if(goalsFocused() && form) { renderCalcs(); return; }
  const g=(id,v)=>{ if(document.activeElement!==$(id)) $(id).value = v ?? ""; };
  g("gGoal", s.profitGoal || ""); g("gName", s.name); g("gDate", s.date); g("gFloat", s.float); g("gExtra", s.extraCosts);

  const box=$("prods"); box.textContent="";
  $("prodsEmpty").hidden = allItems().length>0;
  allItems().forEach((it, idx) => box.appendChild(productCard(it, idx)));

  const cb=$("combos"); cb.textContent="";
  $("combosEmpty").hidden = allCombos().length>0;
  allCombos().forEach((c, idx) => cb.appendChild(comboCard(c, idx)));
}

// --- products
function productCard(it, idx){
  const c=document.createElement("div"); c.className="prod"; c.dataset.idx=idx;
  const uid = "p"+idx+"-";
  c.innerHTML =
    '<div class="top"><div class="field"><label class="label" for="'+uid+'name">Product</label><input id="'+uid+'name" data-k="name" placeholder="e.g. Aquarius 500ml"></div>'+
    '<div class="field" style="flex:0 0 100px"><label class="label" for="'+uid+'type">Type</label><select id="'+uid+'type" data-k="type"><option value="drink">Drink</option><option value="snack">Snack</option><option value="other">Other</option></select></div></div>'+
    '<div class="nums"><div class="field"><label class="label" for="'+uid+'qty">Buying</label><input id="'+uid+'qty" data-k="qty" type="number" min="0" inputmode="numeric"></div>'+
    '<div class="field"><label class="label" for="'+uid+'cost">Cost ¥</label><input id="'+uid+'cost" data-k="cost" type="number" min="0" inputmode="numeric"></div>'+
    '<div class="field"><label class="label" for="'+uid+'price">Sell ¥</label><input id="'+uid+'price" data-k="price" type="number" min="0" step="10" inputmode="numeric"></div></div>'+
    '<div class="foot"><label class="check"><input type="checkbox" data-k="keeps" id="'+uid+'keeps"> Keeps until April</label><button type="button" class="btn small danger" data-remove>Remove</button></div>'+
    '<div class="calc"></div>';
  c.querySelector('[data-k=name]').value = it.name || "";
  c.querySelector('[data-k=type]').value = it.type || "snack";
  c.querySelector('[data-k=qty]').value = it.qty ?? "";
  c.querySelector('[data-k=cost]').value = it.cost ?? "";
  c.querySelector('[data-k=price]').value = it.price ?? "";
  c.querySelector('[data-k=keeps]').checked = !!it.keeps;
  const rm = c.querySelector("[data-remove]");
  rm.addEventListener("click", () => {
    const sold = soldOf(it.id);
    if(sold && rm.dataset.armed!=="1"){ rm.dataset.armed="1"; rm.textContent="Has "+sold+" sales — tap again to remove"; return; }
    editForm(f => { f.items.splice(idx,1); });
    renderGoalsForce();
  });
  c.addEventListener("input", e => {
    const k=e.target.dataset.k; if(!k) return;
    const v = e.target.type==="checkbox" ? e.target.checked : (e.target.type==="number" ? (e.target.value===""? "" : Number(e.target.value)) : e.target.value);
    editForm(f => { f.items[idx][k] = v; });
  });
  fillProductCalc(c, it);
  return c;
}
function fillProductCalc(card, it){
  const margin = num(it.price)-num(it.cost);
  card.querySelector(".calc").textContent = (it.name||"").trim()
    ? "Profit per sale "+yen(margin)+" · if all sell "+yen(num(it.qty)*num(it.price))+(margin<0?" (selling below cost)":"")
    : "Give it a name to add its tap button";
}

// --- combo deals
// A combo card: pick product 1 and product 2 from dropdowns, set one price, optional name.
function comboCard(c, idx){
  const card=document.createElement("div"); card.className="prod"; card.dataset.cidx=idx;
  const uid="c"+idx+"-";
  const options = '<option value="">Pick a product</option>' + items().map(() => '<option></option>').join("");
  card.innerHTML =
    '<div class="nums" style="grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:end">'+
      '<div class="field"><label class="label" for="'+uid+'a">Product 1</label><select id="'+uid+'a" data-slot="0">'+options+'</select></div>'+
      '<span class="num" style="font-size:1.6rem;padding-bottom:4px">+</span>'+
      '<div class="field"><label class="label" for="'+uid+'b">Product 2</label><select id="'+uid+'b" data-slot="1">'+options+'</select></div>'+
    '</div>'+
    '<div class="nums" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr)">'+
      '<div class="field"><label class="label" for="'+uid+'price">Combo price ¥</label><input id="'+uid+'price" data-ck="price" type="number" min="0" step="10" inputmode="numeric" placeholder="e.g. 300"></div>'+
      '<div class="field"><label class="label" for="'+uid+'name">Name on the button (optional)</label><input id="'+uid+'name" data-ck="name" placeholder="e.g. Recovery pack"></div>'+
    '</div>'+
    '<div class="foot"><span class="calc"></span><button type="button" class="btn small danger" data-remove>Remove</button></div>';
  // fill the dropdowns with product names
  card.querySelectorAll("select").forEach(sel => {
    [...sel.options].slice(1).forEach((opt, k) => { const it=items()[k]; opt.value=it.id; opt.textContent=it.name+" ("+yen(it.price)+")"; });
    const chosen = (c.items||[])[+sel.dataset.slot];
    if(chosen && !items().some(i=>i.id===chosen)){ const o=document.createElement("option"); o.value=chosen; o.textContent="Removed product"; sel.appendChild(o); }
    sel.value = chosen || "";
  });
  card.querySelector('[data-ck=price]').value = c.price || "";
  card.querySelector('[data-ck=name]').value = c.name || "";

  card.addEventListener("input", e => {
    if(e.target.matches("select")){
      const slot=+e.target.dataset.slot, val=e.target.value;
      editForm(f => { const cc=f.combos[idx]; cc.items = Array.isArray(cc.items) ? cc.items.slice(0,2) : ["",""]; while(cc.items.length<2) cc.items.push(""); cc.items[slot]=val; });
    } else if(e.target.dataset.ck){
      const k=e.target.dataset.ck;
      editForm(f => { f.combos[idx][k] = k==="price" ? (e.target.value===""?"":Number(e.target.value)) : e.target.value; });
    }
  });
  const rm = card.querySelector("[data-remove]");
  rm.addEventListener("click", () => {
    const sold = comboSold(c);
    if(sold && rm.dataset.armed!=="1"){ rm.dataset.armed="1"; rm.textContent="Sold "+sold+" — tap again to remove"; return; }
    editForm(f => { f.combos.splice(idx,1); });
    renderGoalsForce();
  });
  fillComboCalc(card, c);
  return card;
}
function fillComboCalc(card, c){
  const el = card.querySelector(".calc");
  const ids = Array.isArray(c.items) ? c.items : [];
  if(ids.length<2 || !ids[0] || !ids[1]){ el.textContent = "Pick two products"; return; }
  if(ids[0]===ids[1]){ el.textContent = "Pick two different products"; return; }
  if(!num(c.price)){ el.textContent = "Set a price to add its button"; return; }
  const normal = comboNormalPrice(c);
  const cost = ids.reduce((a,id)=>a+num((itemById(id)||{}).cost),0);
  const profit = num(c.price) - cost;
  el.textContent = "Separately "+yen(normal)+" · customer saves "+yen(Math.max(0,normal-num(c.price)))+" · profit per combo "+yen(profit)+(profit<0?" (below cost)":"");
}
function renderCalcs(){
  document.querySelectorAll("#prods .prod").forEach(card => { const it=allItems()[+card.dataset.idx]; if(it) fillProductCalc(card,it); });
  document.querySelectorAll("#combos .prod").forEach(card => { const c=allCombos()[+card.dataset.cidx]; if(c) fillComboCalc(card,c); });
}

// ========== 12. SAVING
// Every edit changes your working copy (`form`) straight away, so the Sell tab updates on your
// phone instantly; 0.6 s after you stop typing, save() sends it to everyone.
function editForm(mutate){
  if(!eventId){ toast("Set up a stand first"); return; }
  if(!form) form = JSON.parse(JSON.stringify(ev || {name:"Snack stand", items:[], combos:[]}));
  if(!Array.isArray(form.items)) form.items = [];
  if(!Array.isArray(form.combos)) form.combos = [];
  mutate(form);
  dirty = true;
  $("saveState").className="save-state"; $("saveState").textContent="Saving…";
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 600);
  render();
}
async function save(){
  if(!form || !eventId) return;
  const body = JSON.parse(JSON.stringify(form));
  // tidy every product and combo so the database always has the same shape
  body.items = (body.items||[]).map(i => ({ id:i.id||newId("p"), name:String(i.name||""), type:i.type||"snack", qty:num(i.qty), cost:num(i.cost), price:num(i.price), keeps:!!i.keeps }));
  body.combos = (body.combos||[]).map(c => ({ id:c.id||newId("c"), name:String(c.name||""), items:(Array.isArray(c.items)?c.items:["",""]).slice(0,2).map(String), price:num(c.price) }));
  ["float","extraCosts","profitGoal"].forEach(k => body[k]=num(body[k]));
  body.cashCounted = ev && ev.cashCounted ? ev.cashCounted : (body.cashCounted||0);
  const pending = store.doc("events/"+eventId).set(body);
  dirty = false;
  if(!navigator.onLine){ $("saveState").className="save-state"; $("saveState").textContent="Saved on this phone · syncs when back online"; }
  try{
    await pending;                                   // resolves once the server has it
    $("saveState").className="save-state ok"; $("saveState").textContent="Saved for everyone";
  }catch(e){
    dirty = true; dbFail(e);
    $("saveState").className="save-state err"; $("saveState").textContent="Couldn't save. Your changes are still on this phone.";
  }
}
function flushSave(){ if(dirty){ clearTimeout(saveTimer); save(); } }
window.addEventListener("pagehide", flushSave);
$("view-goals").addEventListener("focusout", () => setTimeout(() => { if(!goalsFocused() && !dirty){ form=null; render(); } }, 0));

[["gGoal","profitGoal",true],["gName","name"],["gDate","date"],["gFloat","float",true],["gExtra","extraCosts",true]].forEach(([id,key,isNum]) => {
  $(id).addEventListener("input", e => editForm(f => { f[key] = isNum ? num(e.target.value) : e.target.value; }));
});

function renderGoalsForce(){ const a=document.activeElement; if(a && a.blur) a.blur(); renderGoals(); }
function focusLast(sel){
  const cards=document.querySelectorAll(sel); const last=cards[cards.length-1];
  if(last){ last.scrollIntoView({block:"center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}); const f=last.querySelector("input,select"); if(f) f.focus(); }
}
function addProduct(){
  if(!eventId){ toast("Set up a stand first"); return; }
  editForm(f => { f.items.push({id:newId("p"), name:"", type:"snack", qty:"", cost:"", price:"", keeps:true}); });
  renderGoalsForce(); focusLast("#prods .prod");
}
function addCombo(){
  if(!eventId){ toast("Set up a stand first"); return; }
  if(items().length<2){ toast("Add at least two products first"); return; }
  editForm(f => { f.combos.push({id:newId("c"), name:"", items:["",""], price:""}); });
  renderGoalsForce(); focusLast("#combos .prod");
}
$("addProd").addEventListener("click", addProduct);
$("addProd2").addEventListener("click", addProduct);
$("addCombo").addEventListener("click", addCombo);
$("goGoals").addEventListener("click", () => showTab("goals"));

// Create a new stand (e.g. for April) copying this stand's products and combos.
$("newEvent").addEventListener("click", () => {
  const name=$("newName").value.trim(); if(!name){ $("newName").focus(); return; }
  const s=stand();
  createStand(slug(name), {name, date:$("newDate").value, float:num(s.float)||10000, extraCosts:0, profitGoal:0, cashCounted:0,
    items:items().map(i=>({...i})), combos:combos().map(c=>({...c, items:[...c.items]}))});
  $("newName").value=""; $("newDate").value=""; toast("Stand created");
});

// ========== 13. END OF DAY
function renderReport(its, t){
  const rep=$("report"); rep.textContent="";
  const rows=[["Spent on stock + supplies",yen(t.spend)]];
  its.forEach(i=>rows.push(["· "+i.name, soldOf(i.id)+" sold"]));
  combos().forEach(c=>rows.push(["· Combo: "+comboName(c), comboSold(c)+" sold"]));
  if(t.combos) rows.push(["Combo discounts given", yen(t.comboDiscount)]);
  rows.push(["Money taken",yen(t.revenue)],["Cash profit",yen(t.profit),1],["Left-over stock (keeps to April)",yen(t.leftVal)],["Real result",yen(t.profit+t.leftVal),1]);
  rows.forEach(([k,v,tot])=>{ const a=document.createElement("div"); a.textContent=k; const b=document.createElement("div"); b.className="v"+(tot?" tot":""); if(tot)a.className="tot"; b.textContent=v; rep.append(a,b); });
}
function renderCashDiff(){
  const t=totals(), box=$("cashDiff"); box.textContent="";
  if(!$("cashCount").value) return;
  const diff = num($("cashCount").value) - (t.float + t.revenue);
  const p=document.createElement("span"); p.className="pill "+(Math.abs(diff)<=100?"good":"bad");
  p.textContent = Math.abs(diff)<=100 ? "Matches the sales log ("+(diff>=0?"+":"")+yen(diff)+")" : (diff>0 ? yen(diff)+" more than logged" : yen(-diff)+" less than logged")+". Check for missed taps.";
  box.appendChild(p);
}
let cashT=null;
$("cashCount").addEventListener("input",()=>{ renderCashDiff(); clearTimeout(cashT); cashT=setTimeout(()=>{ if(ev) store.doc("events/"+eventId).update({cashCounted:num($("cashCount").value)}).catch(dbFail); },700); });

// Copy one number per product (sold count, combos included) to paste into the budget sheet.
$("copySold").addEventListener("click", async ()=>{
  const lines = items().map(i=>soldOf(i.id)).join("\n");
  try{ await navigator.clipboard.writeText(lines); toast("Copied. Paste into the SOLD column"); }
  catch(e){ $("copyHint").textContent = "Copy didn't work here. Sold counts in order: "+items().map(i=>i.name+" "+soldOf(i.id)).join(", ")+". Combo discounts given: "+yen(totals().comboDiscount)+"."; }
});

// ========== 14. START
// Tabs
const TABS = ["sell","goals","close"];
function showTab(name){
  TABS.forEach(t => { $("tab-"+t).setAttribute("aria-selected", String(t===name)); $("view-"+t).hidden = t!==name; });
  remember("standTab", name);
}
TABS.forEach(t => $("tab-"+t).addEventListener("click", () => showTab(t)));
showTab(TABS.includes(recall("standTab")) ? recall("standTab") : "sell");

// Keep the phone screen awake while the app is open at the stand
async function wake(){ try{ if(navigator.wakeLock && document.visibilityState==="visible") await navigator.wakeLock.request("screen"); }catch(e){} }
document.addEventListener("visibilitychange", wake);

// The service worker (sw.js) lets the app open with no signal and makes it installable.
if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

// Go: join screen if this phone has no team code yet, otherwise straight into the app.
teamCode = recall("teamCode");
if(!configured || !teamCode || !validCode(teamCode)) showGate();
else { startApp(); wake(); }
