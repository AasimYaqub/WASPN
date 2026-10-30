(() => {
  "use strict";

  if(!window.location.pathname.endsWith("calendar-2026.html")) return;

  const STORAGE_KEY = "waspnJournalV2";
  const MONTHS = {
    Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
    Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12"
  };

  function getJournal(){
    try{
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }
    catch{
      return {};
    }
  }

  function isBrokerReconciled(day){
    if(!day || typeof day !== "object") return false;

    if(typeof day.brokerDailyNet === "number" && Number.isFinite(day.brokerDailyNet)){
      return true;
    }

    if(day.brokerJournal?.source === "TRADEZERO") return true;

    return Array.isArray(day.trades) && day.trades.some(trade =>
      trade?.brokerSource === "TRADEZERO" || Boolean(trade?.brokerSourceId)
    );
  }

  function dateKeyForCell(cell){
    const label = cell.querySelector(".date")?.textContent?.trim() || "";
    const match = /^(\d{1,2})\s+([A-Za-z]{3})/.exec(label);
    if(!match) return null;

    const month = MONTHS[match[2]];
    if(!month) return null;

    const title = document.querySelector(".month-title")?.textContent || "";
    const yearMatch = /(20\d{2})/.exec(title);
    const year = yearMatch?.[1] || "2026";
    const day = match[1].padStart(2,"0");

    return `${year}-${month}-${day}`;
  }

  function reconcileIndicators(){
    const journal = getJournal();

    document.querySelectorAll(".day.saved-day").forEach(cell => {
      const date = dateKeyForCell(cell);
      if(date && isBrokerReconciled(journal[date])){
        cell.classList.remove("saved-day");
      }
    });
  }

  let scheduled = false;
  function schedule(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      reconcileIndicators();
    });
  }

  const calendar = document.querySelector(".calendar");
  if(calendar){
    new MutationObserver(schedule).observe(calendar,{childList:true,subtree:true});
  }

  window.addEventListener("storage", schedule);
  window.addEventListener("focus", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("waspn:tradezero-journal-update", schedule);
  schedule();
})();
