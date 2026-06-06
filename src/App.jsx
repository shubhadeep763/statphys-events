import { useState, useEffect, useMemo } from "react";
import {
  Search, Plus, RefreshCw, ExternalLink, MapPin, Calendar, X, Filter,
  Home, Library, BookOpen, Info, ArrowRight, GraduationCap, Clock, Bookmark,
} from "lucide-react";
import SEED from "./events.json";

// ============================================================
//  CONFIG — the only thing you need to edit for behavior
// ============================================================
const CONFIG = {
  // PUBLIC SUBMISSIONS: paste a Formspree (or Netlify/Tally) endpoint to let
  // visitors submit events to you for review. Leave "" to save to the
  // visitor's own browser only (not shared).
  SUBMIT_ENDPOINT: "https://formspree.io/f/mzdqdykj",        // e.g. "https://formspree.io/f/abcdwxyz"

  // AUTO-SEARCH (Tier 2/3): paste your serverless function URL to enable the
  // "Find new" button. Leave "" on pure static hosting (button is disabled).
  FIND_NEW_ENDPOINT: "",      // e.g. "https://your-site.vercel.app/api/find-new"
};

// localStorage shim (replaces the Claude-artifact storage API)
const store = {
  get: async (k) => { const v = localStorage.getItem(k); return v ? { value: v } : null; },
  set: async (k, v) => { localStorage.setItem(k, v); },
};

const CATEGORIES = ["non-equilibrium","active matter","hydrodynamics","classical statmech","quantum non-equilibrium","quantum information","machine learning","soft matter","stochastic","biophysics"];
const CAT_STYLE = {
  "non-equilibrium":"bg-amber-50 text-amber-700 border-amber-200","active matter":"bg-rose-50 text-rose-700 border-rose-200","hydrodynamics":"bg-sky-50 text-sky-700 border-sky-200","classical statmech":"bg-slate-100 text-slate-700 border-slate-300","quantum non-equilibrium":"bg-violet-50 text-violet-700 border-violet-200","quantum information":"bg-indigo-50 text-indigo-700 border-indigo-200","machine learning":"bg-emerald-50 text-emerald-700 border-emerald-200","soft matter":"bg-orange-50 text-orange-700 border-orange-200","stochastic":"bg-teal-50 text-teal-700 border-teal-200","biophysics":"bg-lime-50 text-lime-700 border-lime-200",
};
const TYPES = ["Conference","School","Workshop","Program"];
const TYPE_STYLE = { Conference:"bg-blue-600", School:"bg-emerald-600", Workshop:"bg-purple-600", Program:"bg-stone-600" };

const RESOURCES = {
  "Program series & institutes": [
    ["ICTS-TIFR (Bengaluru)","https://www.icts.res.in/programs/upcoming"],["KITP (Santa Barbara)","https://www.kitp.ucsb.edu/programs"],["MPI-PKS (Dresden)","https://www.pks.mpg.de/"],["Galileo Galilei Institute (Florence)","https://www.ggi.infn.it/"],["Les Houches School of Physics","https://www.houches-school-physics.com/"],["Boulder Summer School","https://boulderschool.yale.edu/"],["ICTP (Trieste)","https://www.ictp.it/scientific-calendar"],["ICTP-SAIFR (São Paulo)","https://www.ictp-saifr.org/"],["Aspen Center for Physics","https://www.aspenphys.org/"],["Lake Como School","https://lakecomoschool.org/"],
  ],
  "Conference calendars & listings": [
    ["Frey Group list (LMU Munich)","https://www.theorie.physik.uni-muenchen.de/lsfrey/conferences/index.html"],["KOMET Mainz blackboard","https://www.komet1.physik.uni-mainz.de/blackboard/conferences/"],["GDR MePhy (active/soft matter)","https://mephysociety.wordpress.com/"],["CECAM workshops","https://www.cecam.org/"],["IUPAP / StatPhys (C3)","https://iupap.org/"],
  ],
  "Journals": [
    ["J. Stat. Mech. (JSTAT)","https://iopscience.iop.org/journal/1742-5468"],["Physical Review E","https://journals.aps.org/pre/"],["Physical Review X","https://journals.aps.org/prx/"],["SciPost Physics","https://scipost.org/"],["J. Statistical Physics","https://www.springer.com/journal/10955"],
  ],
};

const EVENTS_KEY = "statmech_user_events";
const MARKS_KEY = "statmech_bookmarks";
const keyOf = (e) => (e.name||"").toLowerCase().trim()+"|"+(e.start||"");
const todayMidnight = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };
const daysFrom = (iso) => Math.round((new Date(iso+"T00:00:00")-todayMidnight())/86400000);
const isUpcoming = (e) => { const r=e.end||e.start; if(!r) return true; return new Date(r+"T00:00:00")>=todayMidnight(); };
const timeBadge = (e) => { if(!e.start) return null; const d=daysFrom(e.start); if(d<0) return null; if(d===0) return "today"; if(d<7) return `in ${d} day${d>1?"s":""}`; const w=Math.round(d/7); if(w<9) return `in ${w} week${w>1?"s":""}`; return `in ${Math.round(d/30)} month${Math.round(d/30)>1?"s":""}`; };
const monthLabel = (iso) => new Date(iso+"T00:00:00").toLocaleString("en-US",{month:"long",year:"numeric"});
const prettyDate = (iso) => new Date(iso+"T00:00:00").toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric"});

export default function App() {
  const [page,setPage]=useState("home");
  const [userEvents,setUserEvents]=useState([]);
  const [bookmarks,setBookmarks]=useState(new Set());
  const [search,setSearch]=useState("");
  const [selCats,setSelCats]=useState(new Set());
  const [selType,setSelType]=useState("All");
  const [tab,setTab]=useState("upcoming");
  const [showAdd,setShowAdd]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const [msg,setMsg]=useState("");

  useEffect(()=>{(async()=>{
    try{ const r=await store.get(EVENTS_KEY); if(r&&r.value) setUserEvents(JSON.parse(r.value)); }catch(e){}
    try{ const r=await store.get(MARKS_KEY); if(r&&r.value) setBookmarks(new Set(JSON.parse(r.value))); }catch(e){}
  })()},[]);

  const persistEvents=async(list)=>{ setUserEvents(list); try{ await store.set(EVENTS_KEY,JSON.stringify(list)); }catch(e){} };
  const toggleBookmark=async(e)=>{ const k=keyOf(e); const n=new Set(bookmarks); n.has(k)?n.delete(k):n.add(k); setBookmarks(n); try{ await store.set(MARKS_KEY,JSON.stringify([...n])); }catch(er){} };

  const allEvents=useMemo(()=>{ const m=new Map(); [...SEED,...userEvents].forEach(e=>m.set(keyOf(e),e)); return [...m.values()]; },[userEvents]);

  const gotoBrowse=(o={})=>{ if(o.category) setSelCats(new Set([o.category])); if(o.search!==undefined) setSearch(o.search); if(o.tab) setTab(o.tab); setPage("browse"); };

  const handleAdd=async(ev)=>{
    if(CONFIG.SUBMIT_ENDPOINT){
      try{
        await fetch(CONFIG.SUBMIT_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(ev)});
        setMsg("Thanks! Your event was submitted for review.");
      }catch(e){ setMsg("Submission failed — please try again later."); }
      setTimeout(()=>setMsg(""),6000);
    } else {
      await persistEvents([...userEvents,ev]); // saved to THIS browser only
    }
    setShowAdd(false);
  };

  const findNew=async()=>{
    if(!CONFIG.FIND_NEW_ENDPOINT){
      setMsg("Auto-search needs the optional backend (Tier 2/3). On the static site, curate events by editing src/events.json.");
      setTimeout(()=>setMsg(""),7000); return;
    }
    setRefreshing(true); setMsg("Searching for new events…");
    try{
      const res=await fetch(CONFIG.FIND_NEW_ENDPOINT,{method:"POST"});
      const parsed=await res.json();
      const existing=new Set(allEvents.map(keyOf));
      const fresh=(parsed||[]).filter(e=>e&&e.name&&!existing.has(keyOf(e)));
      if(fresh.length){ await persistEvents([...userEvents,...fresh]); setMsg(`Added ${fresh.length} new event${fresh.length>1?"s":""}.`); }
      else setMsg("No new events found.");
    }catch(e){ setMsg("Couldn't reach the search backend."); }
    finally{ setRefreshing(false); setTimeout(()=>setMsg(""),6000); }
  };

  const nav=[["home","Home",Home],["browse","Browse",Library],["calendar","Calendar",Calendar],["deadlines","Deadlines",Clock],["saved","Saved",Bookmark],["resources","Resources",BookOpen],["about","About",Info]];
  const cp={bookmarks,onBookmark:toggleBookmark};

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 flex items-center gap-1 h-14">
          <button onClick={()=>setPage("home")} className="flex items-center gap-2 mr-2 font-semibold text-stone-900 shrink-0" style={{fontFamily:"Georgia, serif"}}>
            <span className="hidden lg:inline">StatPhys Events</span>
          </button>
          <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
            {nav.map(([id,label,Icon])=>(
              <button key={id} onClick={()=>setPage(id)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${page===id?"bg-stone-900 text-white":"text-stone-600 hover:bg-stone-100"}`}>
                <Icon className="w-4 h-4"/><span className="hidden md:inline">{label}</span>
                {id==="saved"&&bookmarks.size>0&&<span className={`text-[10px] px-1.5 rounded-full ${page==="saved"?"bg-white/20":"bg-amber-100 text-amber-700"}`}>{bookmarks.size}</span>}
              </button>
            ))}
          </div>
          <button onClick={()=>setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-sm hover:bg-amber-600 shrink-0">
            <Plus className="w-4 h-4"/><span className="hidden sm:inline">Add</span>
          </button>
        </div>
      </nav>

      {msg&&<div className="max-w-6xl mx-auto px-4 pt-3"><div className="text-sm px-3 py-2 rounded-lg bg-stone-100 border border-stone-200 text-stone-700">{msg}</div></div>}

      <main className="max-w-6xl mx-auto px-4 py-6">
        {page==="home"&&<HomePage allEvents={allEvents} gotoBrowse={gotoBrowse} setPage={setPage} findNew={findNew} refreshing={refreshing} setShowAdd={setShowAdd} {...cp}/>}
        {page==="browse"&&<BrowsePage allEvents={allEvents} search={search} setSearch={setSearch} selCats={selCats} setSelCats={setSelCats} selType={selType} setSelType={setSelType} tab={tab} setTab={setTab} findNew={findNew} refreshing={refreshing} {...cp}/>}
        {page==="calendar"&&<CalendarPage allEvents={allEvents}/>}
        {page==="deadlines"&&<DeadlinesPage allEvents={allEvents}/>}
        {page==="saved"&&<SavedPage allEvents={allEvents} gotoBrowse={gotoBrowse} {...cp}/>}
        {page==="resources"&&<ResourcesPage/>}
        {page==="about"&&<AboutPage setPage={setPage}/>}
      </main>

      <footer className="border-t border-stone-200 mt-8"><div className="max-w-6xl mx-auto px-4 py-6 text-xs text-stone-400">Curated statistical-physics events. Always confirm dates on the official page before travel.</div></footer>

      {showAdd&&<AddForm mode={CONFIG.SUBMIT_ENDPOINT?"review":"local"} onClose={()=>setShowAdd(false)} onSave={handleAdd}/>}
    </div>
  );
}

function HomePage({allEvents,gotoBrowse,setPage,findNew,refreshing,setShowAdd,bookmarks,onBookmark}){
  const [q,setQ]=useState("");
  const upcoming=allEvents.filter(isUpcoming).sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  const now=new Date();
  const openDeadlines=upcoming.filter(e=>e.deadline&&daysFrom(e.deadline)>=0).length;
  const soon=upcoming.slice(0,4);
  const catCount=(c)=>upcoming.filter(e=>(e.categories||[]).includes(c)).length;
  const stats=[[upcoming.length,"upcoming events"],[upcoming.filter(e=>e.type==="School").length,"schools"],[openDeadlines,"open deadlines"],[CATEGORIES.length,"topic areas"]];
  return (<div>
    <section className="rounded-2xl bg-gradient-to-br from-stone-900 to-stone-700 text-white p-8 sm:p-12 mb-6">
      <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight mb-3" style={{fontFamily:"Georgia, serif"}}>Statistical Physics Events</h1>
      <p className="text-stone-300 max-w-2xl text-lg mb-6">A curated hub of conferences, schools and workshops across statistical physics.</p>
      <div className="flex flex-wrap gap-2 max-w-xl">
        <div className="relative flex-1 min-w-[220px]"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&gotoBrowse({search:q})} placeholder="Search events, topics, places…" className="w-full pl-9 pr-3 py-2.5 rounded-lg text-stone-800 text-sm focus:outline-none"/></div>
        <button onClick={()=>gotoBrowse({search:q})} className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-sm font-medium">Search</button>
      </div>
    </section>
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">{stats.map(([n,l])=>(<div key={l} className="bg-white border border-stone-200 rounded-xl p-4 text-center"><div className="text-3xl font-semibold text-stone-900">{n}</div><div className="text-xs text-stone-500 mt-1">{l}</div></div>))}</section>
    <section className="mb-8"><div className="flex items-center justify-between mb-3"><h2 className="text-xl font-semibold text-stone-900" style={{fontFamily:"Georgia, serif"}}>Happening soon</h2><button onClick={()=>gotoBrowse({tab:"upcoming"})} className="text-sm text-stone-500 hover:text-stone-900 flex items-center gap-1">View all <ArrowRight className="w-4 h-4"/></button></div><div className="grid sm:grid-cols-2 gap-4">{soon.map((e,i)=><EventCard key={keyOf(e)+i} e={e} bookmarked={bookmarks.has(keyOf(e))} onBookmark={onBookmark}/>)}</div></section>
    <section className="mb-8"><h2 className="text-xl font-semibold text-stone-900 mb-3" style={{fontFamily:"Georgia, serif"}}>Browse by topic</h2><div className="flex flex-wrap gap-2">{CATEGORIES.map(c=>(<button key={c} onClick={()=>gotoBrowse({category:c})} className={`px-3 py-1.5 rounded-full text-sm border transition hover:scale-105 ${CAT_STYLE[c]}`}>{c} <span className="opacity-60">({catCount(c)})</span></button>))}</div></section>
    <section className="grid sm:grid-cols-2 gap-4">
      <div className="bg-white border border-stone-200 rounded-xl p-5"><GraduationCap className="w-6 h-6 text-stone-700 mb-2"/><h3 className="font-semibold text-stone-900 mb-1">Know an event we're missing?</h3><p className="text-sm text-stone-500 mb-3">Submit a conference or school in a few seconds.</p><button onClick={()=>setShowAdd(true)} className="text-sm px-3 py-1.5 rounded-lg bg-stone-900 text-white hover:bg-stone-700">Submit an event</button></div>
      <div className="bg-white border border-stone-200 rounded-xl p-5"><RefreshCw className="w-6 h-6 text-stone-700 mb-2"/><h3 className="font-semibold text-stone-900 mb-1">Pull in fresh events</h3><p className="text-sm text-stone-500 mb-3">Search the web for newly announced events (requires backend).</p><button onClick={findNew} disabled={refreshing} className="text-sm px-3 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 disabled:opacity-50 flex items-center gap-1.5"><RefreshCw className={`w-4 h-4 ${refreshing?"animate-spin":""}`}/> Find new events</button></div>
    </section>
  </div>);
}

function BrowsePage({allEvents,search,setSearch,selCats,setSelCats,selType,setSelType,tab,setTab,findNew,refreshing,bookmarks,onBookmark}){
  const [showFilters,setShowFilters]=useState(false);
  const toggleCat=(c)=>{const n=new Set(selCats);n.has(c)?n.delete(c):n.add(c);setSelCats(n);};
  const filtered=useMemo(()=>{const q=search.toLowerCase().trim();let l=allEvents.filter(e=>tab==="upcoming"?isUpcoming(e):!isUpcoming(e));if(q)l=l.filter(e=>[e.name,e.location,e.blurb].join(" ").toLowerCase().includes(q));if(selType!=="All")l=l.filter(e=>e.type===selType);if(selCats.size)l=l.filter(e=>(e.categories||[]).some(c=>selCats.has(c)));l.sort((a,b)=>tab==="upcoming"?(a.start||"").localeCompare(b.start||""):(b.start||"").localeCompare(a.start||""));return l;},[allEvents,tab,search,selType,selCats]);
  return (<div>
    <h1 className="text-2xl font-semibold text-stone-900 mb-4" style={{fontFamily:"Georgia, serif"}}>Browse events</h1>
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events, topics, places…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"/></div>
      <button onClick={()=>setShowFilters(s=>!s)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition ${selCats.size||selType!=="All"?"border-stone-800 bg-stone-800 text-white":"border-stone-300 bg-white hover:bg-stone-100"}`}><Filter className="w-4 h-4"/> Filters {(selCats.size||selType!=="All")&&<span>({selCats.size+(selType!=="All"?1:0)})</span>}</button>
      <button onClick={findNew} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm hover:bg-stone-100 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${refreshing?"animate-spin":""}`}/> Find new</button>
    </div>
    {showFilters&&(<div className="mb-5 p-4 rounded-xl border border-stone-200 bg-white">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Type</div>
      <div className="flex flex-wrap gap-1.5 mb-3">{["All",...TYPES].map(t=>(<button key={t} onClick={()=>setSelType(t)} className={`px-2.5 py-1 rounded-full text-xs border transition ${selType===t?"bg-stone-800 text-white border-stone-800":"bg-white text-stone-600 border-stone-300 hover:bg-stone-100"}`}>{t}</button>))}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Topic</div>
      <div className="flex flex-wrap gap-1.5">{CATEGORIES.map(c=>(<button key={c} onClick={()=>toggleCat(c)} className={`px-2.5 py-1 rounded-full text-xs border transition ${selCats.has(c)?CAT_STYLE[c]+" ring-1 ring-offset-1 ring-stone-400":"bg-white text-stone-600 border-stone-300 hover:bg-stone-100"}`}>{c}</button>))}</div>
      {(selCats.size>0||selType!=="All")&&<button onClick={()=>{setSelCats(new Set());setSelType("All");}} className="mt-3 text-xs text-stone-500 underline hover:text-stone-800">Clear filters</button>}
    </div>)}
    <div className="flex gap-1 mb-5 border-b border-stone-200">{[["upcoming","Upcoming"],["past","Past"]].map(([id,label])=>{const count=allEvents.filter(e=>id==="upcoming"?isUpcoming(e):!isUpcoming(e)).length;return(<button key={id} onClick={()=>setTab(id)} className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${tab===id?"border-stone-900 text-stone-900":"border-transparent text-stone-400 hover:text-stone-600"}`}>{label} <span className="text-xs text-stone-400">({count})</span></button>);})}</div>
    {filtered.length===0?(<div className="text-center py-16 text-stone-400">No events match. Try clearing filters.</div>):(<div className="grid sm:grid-cols-2 gap-4">{filtered.map((e,i)=><EventCard key={keyOf(e)+i} e={e} bookmarked={bookmarks.has(keyOf(e))} onBookmark={onBookmark}/>)}</div>)}
  </div>);
}

function CalendarPage({allEvents}){
  const upcoming=allEvents.filter(isUpcoming).sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  const groups={}; upcoming.forEach(e=>{const k=e.start?monthLabel(e.start):"Date TBA";(groups[k]=groups[k]||[]).push(e);});
  return (<div>
    <h1 className="text-2xl font-semibold text-stone-900 mb-1" style={{fontFamily:"Georgia, serif"}}>Calendar</h1>
    <p className="text-stone-500 text-sm mb-6">Upcoming events grouped by month.</p>
    <div className="relative"><div className="absolute left-2 top-2 bottom-2 w-px bg-stone-200 hidden sm:block"/>
      {Object.keys(groups).map(m=>(<div key={m} className="mb-8 sm:pl-8 relative"><div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-amber-500 ring-4 ring-stone-50 hidden sm:block"/><h2 className="text-lg font-semibold text-stone-800 mb-3">{m}</h2><div className="space-y-2">
        {groups[m].map((e,i)=>(<a key={keyOf(e)+i} href={e.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 bg-white border border-stone-200 rounded-lg p-3 hover:border-stone-300 hover:shadow-sm transition"><span className={`text-[10px] font-semibold uppercase tracking-wider text-white px-2 py-0.5 rounded mt-0.5 ${TYPE_STYLE[e.type]||"bg-stone-500"}`}>{e.type}</span><div className="flex-1 min-w-0"><div className="font-medium text-stone-900 group-hover:text-blue-700 leading-snug flex items-start gap-1">{e.name}<ExternalLink className="w-3 h-3 mt-1 shrink-0 opacity-0 group-hover:opacity-60"/></div><div className="text-sm text-stone-500 mt-0.5">{e.dateDisplay} · {e.location}</div></div></a>))}
      </div></div>))}
    </div>
  </div>);
}

function deadlineTone(d){ if(d<0) return "bg-stone-100 text-stone-400 border-stone-200"; if(d<=7) return "bg-rose-50 text-rose-700 border-rose-200"; if(d<=30) return "bg-amber-50 text-amber-700 border-amber-200"; return "bg-emerald-50 text-emerald-700 border-emerald-200"; }
function deadlineText(d){ if(d<0) return "closed"; if(d===0) return "due today"; return `${d} day${d>1?"s":""} left`; }
function DeadlineRow({e,dim}){ const d=e.deadline?daysFrom(e.deadline):null; return (<a href={e.url} target="_blank" rel="noopener noreferrer" className={`group flex items-center gap-3 bg-white border border-stone-200 rounded-lg p-3 hover:border-stone-300 hover:shadow-sm transition ${dim?"opacity-60":""}`}><div className="flex-1 min-w-0"><div className="font-medium text-stone-900 group-hover:text-blue-700 leading-snug truncate flex items-center gap-1">{e.name}<ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60"/></div><div className="text-xs text-stone-500 mt-0.5">Event: {e.dateDisplay} · {e.location}</div></div>{e.deadline?(<div className="text-right shrink-0"><span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${deadlineTone(d)}`}>{deadlineText(d)}</span><div className="text-[11px] text-stone-400 mt-1">{prettyDate(e.deadline)}</div></div>):(<span className="text-[11px] text-stone-400 shrink-0">check site →</span>)}</a>); }
function DeadlinesPage({allEvents}){
  const u=allEvents.filter(isUpcoming);
  const open=u.filter(e=>e.deadline&&daysFrom(e.deadline)>=0).sort((a,b)=>a.deadline.localeCompare(b.deadline));
  const unknown=u.filter(e=>!e.deadline).sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  const closed=u.filter(e=>e.deadline&&daysFrom(e.deadline)<0).sort((a,b)=>b.deadline.localeCompare(a.deadline));
  const Section=({title,children})=>(<div className="mb-7"><h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 mb-3">{title}</h2><div className="space-y-2">{children}</div></div>);
  return (<div>
    <h1 className="text-2xl font-semibold text-stone-900 mb-1" style={{fontFamily:"Georgia, serif"}}>Deadlines</h1>
    <p className="text-stone-500 text-sm mb-6">Application and registration cutoffs. Always confirm on the official page.</p>
    <Section title={`Open deadlines (${open.length})`}>{open.length?open.map((e,i)=><DeadlineRow key={keyOf(e)+i} e={e}/>):<div className="text-sm text-stone-400 py-2">No open deadlines recorded right now.</div>}</Section>
    <Section title={`Deadline not listed (${unknown.length})`}>{unknown.map((e,i)=><DeadlineRow key={keyOf(e)+i} e={e}/>)}</Section>
    {closed.length>0&&<Section title={`Closed (${closed.length})`}>{closed.map((e,i)=><DeadlineRow key={keyOf(e)+i} e={e} dim/>)}</Section>}
  </div>);
}

function SavedPage({allEvents,gotoBrowse,bookmarks,onBookmark}){
  const saved=allEvents.filter(e=>bookmarks.has(keyOf(e))).sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  return (<div>
    <h1 className="text-2xl font-semibold text-stone-900 mb-1" style={{fontFamily:"Georgia, serif"}}>Saved events</h1>
    <p className="text-stone-500 text-sm mb-6">Tap the bookmark icon on any event to save it here.</p>
    {saved.length===0?(<div className="text-center py-16"><Bookmark className="w-8 h-8 text-stone-300 mx-auto mb-3"/><p className="text-stone-400 mb-4">No saved events yet.</p><button onClick={()=>gotoBrowse({})} className="text-sm px-4 py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-700">Browse events</button></div>):(<div className="grid sm:grid-cols-2 gap-4">{saved.map((e,i)=><EventCard key={keyOf(e)+i} e={e} bookmarked onBookmark={onBookmark}/>)}</div>)}
  </div>);
}

function ResourcesPage(){
  return (<div>
    <h1 className="text-2xl font-semibold text-stone-900 mb-1" style={{fontFamily:"Georgia, serif"}}>Resources</h1>
    <p className="text-stone-500 text-sm mb-6">Institutions, calendars and journals worth bookmarking.</p>
    <div className="space-y-6">{Object.entries(RESOURCES).map(([section,links])=>(<div key={section}><h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 mb-3">{section}</h2><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{links.map(([name,url])=>(<a key={name} href={url} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between gap-2 bg-white border border-stone-200 rounded-lg px-3 py-2.5 text-sm hover:border-stone-300 hover:shadow-sm transition"><span className="text-stone-800 group-hover:text-blue-700">{name}</span><ExternalLink className="w-3.5 h-3.5 text-stone-400 shrink-0"/></a>))}</div></div>))}</div>
  </div>);
}

function AboutPage({setPage}){
  return (<div className="max-w-3xl">
    <h1 className="text-2xl font-semibold text-stone-900 mb-4" style={{fontFamily:"Georgia, serif"}}>About this site</h1>
    <div className="space-y-4 text-stone-700 leading-relaxed">
      <p>A curated hub for academic conferences, schools, workshops and programs across statistical physics, in one browsable place with links and descriptions.</p>
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4"><h3 className="font-semibold text-emerald-800 mb-2">Topics covered</h3><p className="text-sm text-emerald-900/80">Non-equilibrium, active matter, hydrodynamics, classical statmech, quantum non-equilibrium, quantum information, machine learning for statmech, soft matter, stochastic processes & large deviations, and biophysics.</p></div>
      <p>You can <button onClick={()=>setPage("browse")} className="text-blue-700 underline">browse</button>, view the <button onClick={()=>setPage("calendar")} className="text-blue-700 underline">calendar</button>, track <button onClick={()=>setPage("deadlines")} className="text-blue-700 underline">deadlines</button>, bookmark to <button onClick={()=>setPage("saved")} className="text-blue-700 underline">Saved</button>, or submit your own with the <span className="font-medium">Add</span> button.</p>
    </div>
  </div>);
}

function EventCard({e,bookmarked,onBookmark}){
  const badge=isUpcoming(e)?timeBadge(e):null;
  return (<div className="group bg-white border border-stone-200 rounded-xl p-4 hover:shadow-md hover:border-stone-300 transition flex flex-col">
    <div className="flex items-start justify-between gap-2 mb-2"><span className={`text-[10px] font-semibold uppercase tracking-wider text-white px-2 py-0.5 rounded ${TYPE_STYLE[e.type]||"bg-stone-500"}`}>{e.type}</span><div className="flex items-center gap-1.5">{badge&&<span className="text-[11px] font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full whitespace-nowrap">{badge}</span>}{onBookmark&&<button onClick={()=>onBookmark(e)} title={bookmarked?"Remove bookmark":"Save event"} className="p-1 -m-1 rounded hover:bg-stone-100 transition"><Bookmark className={`w-4 h-4 ${bookmarked?"fill-amber-500 text-amber-500":"text-stone-300 hover:text-stone-500"}`}/></button>}</div></div>
    <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-stone-900 leading-snug hover:text-blue-700 inline-flex items-start gap-1" style={{fontFamily:"Georgia, serif"}}>{e.name}<ExternalLink className="w-3.5 h-3.5 mt-1 shrink-0 opacity-0 group-hover:opacity-60"/></a>
    <div className="mt-2 space-y-1 text-sm text-stone-600"><div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-stone-400 shrink-0"/> {e.dateDisplay}</div>{e.location&&<div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0"/> {e.location}</div>}{e.deadline&&daysFrom(e.deadline)>=0&&<div className="flex items-center gap-1.5 text-stone-500"><Clock className="w-3.5 h-3.5 text-stone-400 shrink-0"/> Deadline: {prettyDate(e.deadline)} ({deadlineText(daysFrom(e.deadline))})</div>}</div>
    {e.blurb&&<p className="mt-2 text-sm text-stone-500 leading-relaxed flex-1">{e.blurb}</p>}
    <div className="mt-3 flex flex-wrap gap-1.5">{(e.categories||[]).map(c=>(<span key={c} className={`text-[11px] px-2 py-0.5 rounded-full border ${CAT_STYLE[c]||"bg-stone-50 text-stone-600 border-stone-200"}`}>{c}</span>))}</div>
  </div>);
}

function AddForm({onClose,onSave,mode}){
  const [f,setF]=useState({name:"",url:"",dateDisplay:"",start:"",end:"",location:"",type:"Conference",deadline:"",blurb:""});
  const [cats,setCats]=useState(new Set());
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const toggle=(c)=>{const n=new Set(cats);n.has(c)?n.delete(c):n.add(c);setCats(n);};
  const submit=()=>{ if(!f.name.trim()) return; const dateDisplay=f.dateDisplay.trim()||(f.start?f.start+(f.end?" – "+f.end:""):"TBA"); onSave({...f,dateDisplay,categories:[...cats]}); };
  const input="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400";
  return (<div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
    <div className="flex items-center justify-between mb-1"><h2 className="text-lg font-semibold text-stone-900">{mode==="review"?"Submit an event":"Add an event"}</h2><button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X className="w-5 h-5"/></button></div>
    <p className="text-xs text-stone-500 mb-4">{mode==="review"?"Your submission will be reviewed before it appears publicly.":"Note: this saves to your browser only and isn't shared with others."}</p>
    <div className="space-y-3">
      <div><label className="text-xs font-medium text-stone-500">Name *</label><input className={input} value={f.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Workshop on Active Matter"/></div>
      <div><label className="text-xs font-medium text-stone-500">Link (URL)</label><input className={input} value={f.url} onChange={e=>set("url",e.target.value)} placeholder="https://…"/></div>
      <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium text-stone-500">Start</label><input type="date" className={input} value={f.start} onChange={e=>set("start",e.target.value)}/></div><div><label className="text-xs font-medium text-stone-500">End</label><input type="date" className={input} value={f.end} onChange={e=>set("end",e.target.value)}/></div></div>
      <div><label className="text-xs font-medium text-stone-500">Date label (optional)</label><input className={input} value={f.dateDisplay} onChange={e=>set("dateDisplay",e.target.value)} placeholder="e.g. Aug 13–28, 2026"/></div>
      <div><label className="text-xs font-medium text-stone-500">Application / registration deadline</label><input type="date" className={input} value={f.deadline} onChange={e=>set("deadline",e.target.value)}/></div>
      <div><label className="text-xs font-medium text-stone-500">Location</label><input className={input} value={f.location} onChange={e=>set("location",e.target.value)} placeholder="City, Country"/></div>
      <div><label className="text-xs font-medium text-stone-500">Type</label><select className={input} value={f.type} onChange={e=>set("type",e.target.value)}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
      <div><label className="text-xs font-medium text-stone-500">Topics</label><div className="flex flex-wrap gap-1.5 mt-1">{CATEGORIES.map(c=>(<button key={c} onClick={()=>toggle(c)} className={`px-2.5 py-1 rounded-full text-xs border transition ${cats.has(c)?CAT_STYLE[c]+" ring-1 ring-stone-400":"bg-white text-stone-600 border-stone-300 hover:bg-stone-100"}`}>{c}</button>))}</div></div>
      <div><label className="text-xs font-medium text-stone-500">Short description</label><textarea className={input+" resize-none"} rows={2} value={f.blurb} onChange={e=>set("blurb",e.target.value)} placeholder="One sentence about the event"/></div>
    </div>
    <div className="flex justify-end gap-2 mt-5"><button onClick={onClose} className="px-4 py-2 rounded-lg border border-stone-300 text-sm hover:bg-stone-100">Cancel</button><button onClick={submit} disabled={!f.name.trim()} className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm hover:bg-stone-700 disabled:opacity-40">{mode==="review"?"Submit for review":"Save event"}</button></div>
  </div></div>);
}
