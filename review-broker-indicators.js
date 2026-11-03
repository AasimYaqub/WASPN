(() => {
  "use strict";

  const STORAGE_KEY = "waspnJournalV2";
  const isCalendar = window.location.pathname.endsWith("calendar-2026.html");
  const isJournal = window.location.pathname.endsWith("journal.html");

  if(!isCalendar && !isJournal) return;

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

  function writeJournal(journal){
    if(window.WASPNSession?.writeJournal){
      window.WASPNSession.writeJournal(journal);
      return;
    }

    localStorage.setItem(STORAGE_KEY,JSON.stringify(journal));
  }

  function money(value){
    const n = Number(value || 0);
    if(n > 0) return "+$" + n.toFixed(2);
    if(n < 0) return "-$" + Math.abs(n).toFixed(2);
    return "$0.00";
  }

  function getNewYorkDateKey(){
    const parts = new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:"America/New_York",
        year:"numeric",
        month:"2-digit",
        day:"2-digit"
      }
    ).formatToParts(new Date());

    const values = {};
    parts.forEach(part => {
      if(part.type !== "literal") values[part.type] = part.value;
    });

    return `${values.year}-${values.month}-${values.day}`;
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

  function shouldShowWaspnDot(date,day,today){
    if(!date || !day || typeof day !== "object") return false;

    if(date === today) return true;

    return !isBrokerReconciled(day);
  }

  function reconcileIndicators(){
    if(!isCalendar) return;

    const journal = getJournal();
    const today = getNewYorkDateKey();

    document.querySelectorAll(".day:not(.empty)").forEach(cell => {
      const date = dateKeyForCell(cell);
      if(!date) return;

      cell.classList.toggle("today",date === today);
      cell.classList.toggle(
        "saved-day",
        shouldShowWaspnDot(date,journal[date],today)
      );
    });
  }

  function brokerTradeNet(trade){
    if(!trade || typeof trade !== "object") return 0;

    if(typeof trade.actualNet === "number" && Number.isFinite(trade.actualNet)){
      return Number(trade.actualNet);
    }

    if(typeof trade.netPnl === "number" && Number.isFinite(trade.netPnl)){
      return Number(trade.netPnl);
    }

    if(typeof trade.calculatedNet === "number" && Number.isFinite(trade.calculatedNet)){
      return Number(trade.calculatedNet);
    }

    if(typeof trade.brokerGrossPnl === "number" && Number.isFinite(trade.brokerGrossPnl)){
      const fees = Math.max(0,Number(trade.brokerFees || 0));
      const commission = Math.max(0,Number(trade.brokerCommission || 0));
      return Number(trade.brokerGrossPnl) - fees - commission;
    }

    return 0;
  }

  function brokerOverflowNet(date){
    const day = getJournal()[date];
    if(!Array.isArray(day?.trades)) return 0;

    return day.trades.reduce((sum,trade,index) => {
      if(index >= 5 && trade?.brokerSourceId){
        return sum + brokerTradeNet(trade);
      }
      return sum;
    },0);
  }

  function journalBaseTotal(){
    let total = 0;

    for(let i = 1; i <= 5; i++){
      const el = document.getElementById("tradePnl" + i);
      total += Number(el?.dataset?.pnl || 0);
    }

    return total;
  }

  function journalDisplayTotal(date){
    return journalBaseTotal() + brokerOverflowNet(date);
  }

  function renderJournalTotal(total){
    const daily = document.getElementById("dailyTotal");
    const top = document.getElementById("topDailyTotal");
    const formatted = money(total);
    const tone = total >= 0 ? "green" : "red";

    if(daily){
      daily.textContent = formatted;
      daily.dataset.pnl = String(total);
      daily.className = "total " + tone;
    }

    if(top){
      top.textContent = formatted;
      top.className = "summary-value " + tone;
    }
  }

  function persistJournalTotal(date,total){
    const journal = getJournal();
    const day = journal[date];
    if(!day) return;

    day.totalNet = total;
    day.lastUpdated = new Date().toISOString();
    journal[date] = day;
    writeJournal(journal);

    const status = document.getElementById("status");
    const count = Array.isArray(day.trades)
      ? day.trades.filter(trade => trade && (
          trade.ticker ||
          trade.brokerSourceId ||
          trade.entryPrice ||
          trade.exitPrice ||
          trade.shares ||
          trade.setupReason
        )).length
      : 0;

    if(status){
      status.textContent = `Saved ${date} • ${count} trade(s) • ${money(total)}`;
      status.className = "status";
      status.style.color = "";
    }
  }

  function syncJournalTotal(persist = false){
    if(!isJournal) return;

    const date = document.getElementById("tradeDate")?.value || "";
    if(!date) return;

    const total = journalDisplayTotal(date);
    renderJournalTotal(total);

    if(persist){
      persistJournalTotal(date,total);
    }
  }

  let scheduled = false;
  function schedule(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      reconcileIndicators();
      syncJournalTotal(false);
    });
  }

  if(isCalendar){
    const calendar = document.querySelector(".calendar");
    if(calendar){
      new MutationObserver(schedule).observe(calendar,{childList:true,subtree:true});
    }
  }

  if(isJournal){
    const saveBtn = document.getElementById("saveBtn");
    if(saveBtn){
      saveBtn.addEventListener("click",() => {
        setTimeout(() => syncJournalTotal(true),25);
      });
    }

    document.getElementById("tradeDate")?.addEventListener("change",() => {
      setTimeout(() => syncJournalTotal(false),0);
    });

    const tradeContainer = document.getElementById("trades");
    if(tradeContainer){
      new MutationObserver(schedule).observe(tradeContainer,{childList:true,subtree:true,attributes:true});
    }
  }

  window.addEventListener("storage", schedule);
  window.addEventListener("focus", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("waspn:tradezero-journal-update", schedule);
  schedule();
})();
