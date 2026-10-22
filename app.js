(function () {
  "use strict";

  var DATA_INDEX_URL = "data/years/index.json";
  var DATA_YEAR_URL = "data/years/";
  var WIKISOURCE_URL = "https://zh.wikisource.org/wiki/魯迅日記";
  var MONTH_NAMES = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  var WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  var DAY_MS = 86400000;
  var yearCache = new Map();

  var state = {
    data: null,
    days: [],
    daysByDate: new Map(),
    daysByMonth: new Map(),
    months: [],
    monthByNumber: new Map(),
    appendices: [],
    appendixById: new Map(),
    peopleIndex: new Map(),
    worksIndex: new Map(),
    firstDate: "",
    lastDate: "",
    coverageFirst: "",
    coverageLast: "",
    yearIndex: null,
    yearMetaByNumber: new Map(),
    selectedYear: 0,
    targetISO: "",
    todayISO: "",
    targetInRange: false,
    selectedDate: "",
    selectedMonth: 1,
    entity: null,
    rawMode: false,
    ready: false,
    eventsBound: false,
    hashLock: false,
    loadingYear: 0
  };

  var $ = function (id) { return document.getElementById(id); };

  function pad(value) { return String(value).padStart(2, "0"); }
  function isoDate(year, month, day) { return year + "-" + pad(month) + "-" + pad(day); }
  function parseISO(iso) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!match) return null;
    var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    var dt = new Date(Date.UTC(year, month - 1, day));
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
    return dt;
  }
  function isoOf(dt) { return dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate()); }
  function addDays(iso, delta) { var dt = parseISO(iso); if (!dt) return iso; return isoOf(new Date(dt.getTime() + delta * DAY_MS)); }
  function weekdayOf(iso) { var dt = parseISO(iso); return dt ? WEEKDAYS[dt.getUTCDay()] : ""; }
  function formatDate(iso) {
    var dt = parseISO(iso);
    return dt ? dt.getUTCFullYear() + " 年 " + (dt.getUTCMonth() + 1) + " 月 " + dt.getUTCDate() + " 日" : iso;
  }
  function formatDateWithWeekday(iso) { return formatDate(iso) + " " + weekdayOf(iso); }
  function cnNumber(value) {
    var digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    if (value < 10) return digits[value];
    if (value === 10) return "十";
    if (value < 20) return "十" + digits[value - 10];
    return digits[Math.floor(value / 10)] + "十" + (value % 10 ? digits[value % 10] : "");
  }
  function monthName(month) { return MONTH_NAMES[month - 1] + "月"; }
  function monthDays(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function beijingTodayISO() {
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
      }).formatToParts(new Date());
      var values = {};
      parts.forEach(function (part) { values[part.type] = part.value; });
      return values.year + "-" + values.month + "-" + values.day;
    } catch (error) {
      var now = new Date();
      return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    }
  }

  function minus100Years(iso) {
    var dt = parseISO(iso);
    if (!dt) return iso;
    var year = dt.getUTCFullYear() - 100;
    var month = dt.getUTCMonth() + 1;
    var day = dt.getUTCDate();
    var candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
      candidate = new Date(Date.UTC(year, month - 1, day - 1));
    }
    return isoOf(candidate);
  }

  function setText(id, value) {
    var element = $(id);
    if (element) element.textContent = value == null ? "" : String(value);
  }

  function hide(element, hidden) {
    if (typeof element === "string") element = $(element);
    if (element) element.hidden = Boolean(hidden);
  }

  function announce(message) { setText("live-status", message); }

  function setNotice(message, options) {
    options = options || {};
    var notice = $("notice");
    if (!notice) return;
    notice.textContent = "";
    if (!message) { notice.hidden = true; return; }
    notice.hidden = false;
    notice.className = "notice" + (options.error ? " notice-error" : "");
    var text = document.createElement("span");
    text.textContent = message;
    notice.appendChild(text);
    if (options.retry) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "text-tool";
      button.textContent = "重新载入";
      button.addEventListener("click", function () { boot(); });
      notice.appendChild(button);
    }
  }

  // ---------- data ----------

  async function loadIndex() {
    var response = await fetch(DATA_INDEX_URL + "?v=multi-year-1", { cache: "no-store" });
    if (!response.ok) throw new Error("年份索引 HTTP " + response.status);
    var index = await response.json();
    if (!index || !Array.isArray(index.years) || !index.years.length) throw new Error("年份索引格式异常");
    state.yearIndex = index;
    state.yearMetaByNumber = new Map();
    var firsts = [];
    var lasts = [];
    index.years.forEach(function (item) {
      state.yearMetaByNumber.set(Number(item.year), item);
      firsts.push(item.first_date);
      lasts.push(item.last_date);
    });
    firsts.sort();
    lasts.sort();
    state.coverageFirst = firsts[0];
    state.coverageLast = lasts[lasts.length - 1];
    populateYearSelect();
  }

  function populateYearSelect() {
    var select = $("year-select");
    if (!select || !state.yearIndex) return;
    select.textContent = "";
    state.yearIndex.years.forEach(function (item) {
      var option = document.createElement("option");
      option.value = String(item.year);
      option.textContent = item.year + " 年";
      select.appendChild(option);
    });
  }

  function normalizeMonths(data) {
    var raw = data.metadata && data.metadata.months;
    if (Array.isArray(raw)) {
      return raw.map(function (item) {
        return {
          month: Number(item.month),
          name: item.name || monthName(Number(item.month)),
          record_count: typeof item.record_count === "number" ? item.record_count : (item.record_days ? item.record_days.length : 0),
          url: item.url || "",
          source_record_id: item.source_record_id || item.record_id || null
        };
      });
    }
    if (raw && typeof raw === "object") {
      return Object.keys(raw).map(function (key) {
        var item = raw[key] || {};
        return {
          month: Number(key),
          name: item.name || monthName(Number(key)),
          record_count: typeof item.record_count === "number" ? item.record_count : 0,
          url: item.url || "",
          source_record_id: item.record_id || null
        };
      });
    }
    return [];
  }

  function applyYearData(data, year) {
    if (!data || !Array.isArray(data.days) || !data.days.length) throw new Error(year + " 年数据缺少 days");
    var daysByDate = new Map();
    var daysByMonth = new Map();
    data.days.forEach(function (day) {
      daysByDate.set(day.date, day);
      if (!daysByMonth.has(day.month)) daysByMonth.set(day.month, []);
      daysByMonth.get(day.month).push(day);
    });
    daysByMonth.forEach(function (list) { list.sort(function (a, b) { return a.day - b.day; }); });
    var months = normalizeMonths(data);
    var monthsByNumber = new Map();
    months.forEach(function (month) {
      month.record_count = (daysByMonth.get(month.month) || []).length;
      monthsByNumber.set(month.month, month);
    });
    var appendices = Array.isArray(data.appendices) ? data.appendices : [];
    var appendixById = new Map();
    appendices.forEach(function (item) { appendixById.set(item.id, item); });
    var meta = (data.metadata && data.metadata.coverage) || data.metadata || {};
    state.data = data;
    state.days = data.days.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    state.daysByDate = daysByDate;
    state.daysByMonth = daysByMonth;
    state.months = months;
    state.monthByNumber = monthsByNumber;
    state.appendices = appendices;
    state.appendixById = appendixById;
    state.selectedYear = year;
    state.firstDate = meta.first_date || state.days[0].date;
    state.lastDate = meta.last_date || state.days[state.days.length - 1].date;
    state.ready = true;
    var select = $("year-select");
    if (select) select.value = String(year);
    buildIndexes();
    renderAllIndexes();
  }

  async function loadYear(year) {
    var number = Number(year);
    if (!state.yearMetaByNumber.has(number)) throw new Error("没有 " + year + " 年数据");
    if (yearCache.has(number)) {
      applyYearData(yearCache.get(number), number);
      return;
    }
    state.loadingYear = number;
    var response = await fetch(DATA_YEAR_URL + number + ".json?v=multi-year-1", { cache: "no-store" });
    if (!response.ok) throw new Error(number + " 年数据 HTTP " + response.status);
    var data = await response.json();
    yearCache.set(number, data);
    applyYearData(data, number);
    state.loadingYear = 0;
  }


  function buildIndexes() {
    var people = new Map();
    var works = new Map();
    state.days.forEach(function (day) {
      (day.people || []).forEach(function (person) {
        var name = person.name_in_text;
        if (!name) return;
        if (!people.has(name)) people.set(name, { name: name, dates: [], occurrences: [] });
        var item = people.get(name);
        item.dates.push(day.date);
        item.occurrences.push({ date: day.date, text: quoteFor(day.original_text, name) });
      });
      (day.works || []).forEach(function (work) {
        var title = work.name_in_text;
        if (!title) return;
        if (!works.has(title)) works.set(title, { name: title, dates: [], occurrences: [] });
        var item = works.get(title);
        item.dates.push(day.date);
        item.occurrences.push({ date: day.date, text: quoteFor(day.original_text, title) });
      });
    });
    state.peopleIndex = people;
    state.worksIndex = works;
  }

  function quoteFor(text, needle) {
    if (window.LuxunQuote && window.LuxunQuote.quoteFor) return window.LuxunQuote.quoteFor(text, needle);
    var raw = String(text || "").replace(/\s+/g, " ");
    return raw.length > 92 ? raw.slice(0, 92) + "…" : raw;
  }

  // ---------- initial chrome ----------

  function renderInitialFurniture() {
    var today = beijingTodayISO();
    var target = minus100Years(today);
    state.todayISO = today;
    state.targetISO = target;
    state.targetInRange = state.yearMetaByNumber.has(Number(target.slice(0, 4))) && state.daysByDate.has(target);
    renderTodayCard();
    renderAllIndexes();
    renderMonthTabs();
    renderCalendar();
    renderDigest();
    bindEvents();
  }

  function renderTodayCard() {
    setText("today-actual", formatDate(state.todayISO));
    var targetEntry = state.daysByDate.get(state.targetISO);
    var recordButton = $("today-button");
    if (recordButton) {
      recordButton.title = targetEntry ? "回到今天对应的日记日条" : "回到今天对应的日期；若没有日条会明确显示记录状态";
    }
  }

  // ---------- hash, date state ----------

  function initialDateFromLocation() {
    var hash = readHash();
    if (hash.date && parseISO(hash.date)) return hash.date;
    return state.targetISO;
  }

  function readHash() {
    var raw = window.location.hash ? window.location.hash.slice(1) : "";
    var params = new URLSearchParams(raw);
    return { date: params.get("d") || "", entity: params.get("e") || "" };
  }

  function writeHash(date, entity, replace) {
    if (state.hashLock) return;
    var params = new URLSearchParams();
    if (date) params.set("d", date);
    if (entity) params.set("e", entity);
    var next = "#" + params.toString();
    if (window.location.hash === next) return;
    var method = replace ? "replaceState" : "pushState";
    history[method]({ date: date, entity: entity || "" }, "", next);
  }

  function entityHashValue(entity) {
    if (!entity) return "";
    return (entity.kind === "work" ? "w:" : "p:") + entity.key;
  }

  function parseEntityHash(value) {
    if (!value) return null;
    if (value.indexOf("p:") === 0) return { kind: "person", key: value.slice(2) };
    if (value.indexOf("w:") === 0) return { kind: "work", key: value.slice(2) };
    return null;
  }

  async function applyHash() {
    var hash = readHash();
    var date = hash.date && parseISO(hash.date) ? hash.date : state.targetISO;
    var targetYear = Number(date.slice(0, 4));
    state.entity = parseEntityHash(hash.entity);
    if (targetYear !== state.selectedYear && state.yearMetaByNumber.has(targetYear)) {
      await loadYear(targetYear);
    }
    renderDate(date, { fromHash: true });
    if (state.entity) {
      openEntity(state.entity.kind, state.entity.key, { jump: false, updateHash: false, scroll: false });
    }
  }

  // ---------- main date rendering ----------

  function renderYearNote() {
    var note = $("year-note");
    if (!note) return;
    var meta = state.yearMetaByNumber.get(state.selectedYear);
    if (!meta || meta.complete || meta.kind === "baseline" || !meta.note) {
      note.hidden = true;
      note.textContent = "";
      return;
    }
    note.hidden = false;
    note.textContent = meta.note;
  }

  function renderDate(iso, options) {
    options = options || {};
    if (!parseISO(iso)) iso = state.targetISO;
    state.selectedDate = iso;
    renderYearNote();
    var dateYear = Number(iso.slice(0, 4));
    var month = Number(iso.slice(5, 7));
    if (dateYear === state.selectedYear) state.selectedMonth = month;
    var entry = dateYear === state.selectedYear ? state.daysByDate.get(iso) : null;
    if (entry) renderRecord(entry, options); else renderMissing(iso, options);
    renderMonthChrome();
    syncDateControls();
    var yearSelect = $("year-select");
    if (yearSelect && state.selectedYear) yearSelect.value = String(state.selectedYear);
    if (!options.fromHash) {
      writeHash(iso, entityHashValue(state.entity), Boolean(options.replaceHash));
    }
    announce((entry ? "已显示 " : "未找到记录：") + formatDateWithWeekday(iso));
    if (options.scroll) {
      var target = $("diary");
      if (target && !target.hidden) target.scrollIntoView({ behavior: "smooth", block: "start" });
      else if ($("missing-card") && !$("missing-card").hidden) $("missing-card").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function navigateToDate(iso, options) {
    if (!parseISO(iso)) return;
    var targetYear = Number(iso.slice(0, 4));
    if (targetYear !== state.selectedYear && state.yearMetaByNumber.has(targetYear)) {
      await loadYear(targetYear);
    }
    renderDate(iso, options);
  }

  function syncDateControls() {
    var picker = $("date-picker");
    if (picker) {
      var inRange = state.selectedDate >= state.coverageFirst && state.selectedDate <= state.coverageLast;
      picker.value = inRange ? state.selectedDate : "";
    }
    var previous = addDays(state.selectedDate, -1);
    var next = addDays(state.selectedDate, 1);
    var prevToolbar = $("prev-day");
    var nextToolbar = $("next-day");
    if (prevToolbar) prevToolbar.disabled = previous < state.coverageFirst;
    if (nextToolbar) nextToolbar.disabled = next > state.coverageLast;
    var prevEntry = $("prev-entry");
    var nextEntry = $("next-entry");
    if (prevEntry) prevEntry.disabled = previous < state.coverageFirst;
    if (nextEntry) nextEntry.disabled = next > state.coverageLast;
  }

  function renderRecord(entry, options) {
    var diary = $("diary");
    hide("missing-card", true);
    diary.hidden = false;
    hide("people-card", !(entry.people && entry.people.length));
    hide("works-card", !(entry.works && entry.works.length));
    hide("entity-card", !state.entity);
    var hasSide = Boolean((entry.people && entry.people.length) || (entry.works && entry.works.length) || state.entity);
    var grid = document.querySelector(".content-grid");
    if (grid) grid.classList.toggle("single-column", !hasSide);

    setText("entry-date", formatDate(entry.date));
    setText("entry-weekday", entry.weekday || weekdayOf(entry.date));
    var noActivityBadge = $("no-activity-badge");
    if (noActivityBadge) noActivityBadge.hidden = !entry.explicit_no_activity;
    renderOriginal(entry);
    renderAnomalies(entry);
    renderNotes(entry);
    renderTags(entry);
    renderSourceDetails(entry);
    renderAppendix(entry);
    renderEntityPanel();
    document.title = formatDate(entry.date) + " · 鲁迅日记·百年前的今天";
    $("diary").setAttribute("aria-busy", "false");
    if (options && options.focus !== false) {
      // Keep focus predictable without stealing it on initial load.
    }
  }

  function renderMissing(iso, options) {
    hide("diary", true);
    var missing = $("missing-card");
    missing.hidden = false;
    hide("people-card", true);
    hide("works-card", true);
    hide("entity-card", !state.entity);
    var missingGrid = document.querySelector(".content-grid");
    if (missingGrid) missingGrid.classList.add("single-column");
    setText("entry-date", formatDate(iso));
    setText("entry-weekday", weekdayOf(iso));
    setText("missing-date", formatDateWithWeekday(iso));
    var dateYear = Number(iso.slice(0, 4));
    var meta = state.yearMetaByNumber.get(dateYear);
    var inCoverage = iso >= state.coverageFirst && iso <= state.coverageLast;
    var status;
    var detail;
    if (meta && dateYear === meta.year && iso > meta.last_date && meta.kind === "partial_end") {
      status = formatDate(iso) + "：没有找到这一天的日条。";
      detail = "鲁迅于 1936-10-19 逝世；现存日记止于 1936-10-18。缺失不等于原文记“无事”。";
    } else if (meta && dateYear === meta.year && iso < meta.first_date && meta.kind === "partial_start") {
      status = formatDate(iso) + "：没有找到这一天的日条。";
      detail = "《壬子日记》现存文本始于 1912-05-05；此前日期不补写。缺失不等于原文记“无事”。";
    } else if (!inCoverage) {
      status = "这个日期不在收录范围内。";
      detail = "本项目收录 " + formatDate(state.coverageFirst) + " 至 " + formatDate(state.coverageLast) + " 间有可靠文献依据的现存日记；不会用别的日期替代这一天。";
    } else if (!meta) {
      status = "这个日期没有可用的年份数据。";
      detail = "该项目按年份保存日记；当前年份索引中没有这一年的记录。";
    } else if (dateYear !== state.selectedYear || !state.daysByDate.has(iso)) {
      status = formatDate(iso) + "：没有找到这一天的日条。";
      if (meta.kind === "fragments") {
        detail = "1922 年日记原稿散佚，馆方仅收许寿裳手抄本断片；这一天不在现存断片中。缺失不等于原文记“无事”。";
      } else if (meta.kind === "partial_start" && iso < meta.first_date) {
        detail = meta.note + " 缺失不等于原文记“无事”。";
      } else if (meta.kind === "partial_end" && iso > meta.last_date) {
        detail = meta.note + " 缺失不等于原文记“无事”。";
      } else {
        detail = "馆方现有月页中没有这一天的日序，或本地整理未覆盖。页面不会用相邻日期替代，也不会补写日记内容。缺失不等于原文记“无事”。";
      }
    } else {
      status = "该日已有记录，但页面尚未载入。";
      detail = "";
    }
    setText("missing-status", status);
    setText("missing-detail", detail);
    var sourceLink = $("missing-source");
    if (sourceLink) {
      var yearForLink = meta ? meta.year : dateYear;
      sourceLink.textContent = yearForLink + " 年馆方目录";
      sourceLink.href = "http://www.luxunmuseum.com.cn/cx/works.php?lid=" + yearForLink + "&tid=3";
    }
    renderMissingNeighbors(iso);
    renderEntityPanel();
    document.title = formatDate(iso) + " · 没有找到记录 · 鲁迅日记·百年前的今天";
    renderMissingMonthButton(iso);
  }

  function renderMissingMonthButton(iso) {
    var button = $("missing-month-start");
    if (!button) return;
    var dateYear = Number(iso.slice(0, 4));
    var month = Number(iso.slice(5, 7));
    var availableYear = state.yearMetaByNumber.has(dateYear) ? dateYear : state.selectedYear;
    var list = availableYear === state.selectedYear ? (state.daysByMonth.get(month) || []) : [];
    var first = list.length ? list[0].date : "";
    button.textContent = availableYear === dateYear ? "查看本月有记录的日子" : "查看 " + availableYear + " 年 " + month + " 月记录";
    button.onclick = function () {
      if (first) {
        renderDate(first, { scroll: true });
      } else if (availableYear !== state.selectedYear) {
        navigateToDate(isoDate(availableYear, month, 1), { scroll: true });
      } else {
        announce("本月没有可显示的日条。");
      }
    };
    button.disabled = false;
  }

  function firstDateOfMonth(month) {
    var list = state.daysByMonth.get(month) || [];
    return list.length ? list[0].date : "";
  }

  function renderMissingNeighbors(iso) {
    var container = $("missing-neighbors");
    if (!container) return;
    container.textContent = "";
    if (Number(iso.slice(0, 4)) !== state.selectedYear) {
      var scopeNote = document.createElement("span");
      scopeNote.className = "muted";
      scopeNote.textContent = "该日期不在当前浏览年份；请在年份选择中查看对应年份。";
      container.appendChild(scopeNote);
      return;
    }
    var before = null, after = null;
    for (var i = 0; i < state.days.length; i += 1) {
      if (state.days[i].date < iso) before = state.days[i].date;
      if (state.days[i].date > iso) { after = state.days[i].date; break; }
    }
    if (!before && !after) {
      var note = document.createElement("span");
      note.className = "muted";
      note.textContent = "本年份没有可对照的日条。";
      container.appendChild(note);
      return;
    }
    [["前一条记录", before], ["后一条记录", after]].forEach(function (pair) {
      if (!pair[1]) return;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "missing-neighbor";
      button.textContent = pair[0] + "：" + formatDate(pair[1]);
      button.addEventListener("click", function () { navigateToDate(pair[1], { scroll: true }); });
      container.appendChild(button);
    });
  }

  // ---------- entry parts ----------

  function isCjkCharacter(char) { return /[\u4e00-\u9fff]/.test(char || ""); }
  function isNormalLatinP(text, index) {
    var before = text.charAt(index - 1);
    var after = text.charAt(index + 1);
    return /[A-Za-z]/.test(before) && /[A-Za-z]/.test(after);
  }
  function pArtifactOffsets(anomalies) {
    var offsets = new Set();
    (anomalies || []).forEach(function (anomaly) {
      if (anomaly.type === "p" && Number.isInteger(anomaly.offset)) offsets.add(anomaly.offset);
    });
    return offsets;
  }
  function appendArtifactAware(container, text, options) {
    options = options || {};
    var offsets = options.offsets || new Set();
    var preserveNewlines = Boolean(options.preserveNewlines);
    for (var index = 0; index < text.length; index += 1) {
      var char = text.charAt(index);
      if (char === "\r") continue;
      if (char === "\n") {
        if (preserveNewlines) container.appendChild(document.createTextNode("\n"));
        continue;
      }
      if (char === "p") {
        var isArtifact = offsets.size ? offsets.has(index) : !isNormalLatinP(text, index);
        if (isArtifact) {
          var marker = document.createElement("span");
          marker.className = "artifact-char";
          marker.textContent = "〔p〕";
          marker.title = "馆方网页中孤立的字母 p，疑为原注释标记损坏；保留原字符并标出。";
          container.appendChild(marker);
        } else {
          container.appendChild(document.createTextNode("p"));
        }
        continue;
      }
      if (char.codePointAt(0) >= 0xE000 && char.codePointAt(0) <= 0xF8FF) {
        var pua = document.createElement("span");
        pua.className = "artifact-char";
        pua.textContent = "〔U+" + char.codePointAt(0).toString(16).toUpperCase() + "〕";
        pua.title = "馆方网页私用区字符，疑似缺字或编码异常；保留原字符。";
        container.appendChild(pua);
        continue;
      }
      if ((char === "," || char === ".") && isCjkCharacter(text.charAt(index - 1)) && isCjkCharacter(text.charAt(index + 1))) {
        container.appendChild(document.createTextNode(char === "," ? "，" : "。"));
        continue;
      }
      container.appendChild(document.createTextNode(char));
    }
  }

  function renderOriginal(entry) {
    var normalized = $("original-text");
    var raw = $("original-raw");
    normalized.textContent = "";
    appendArtifactAware(normalized, entry.original_text || "", {
      offsets: pArtifactOffsets(entry.text_anomalies),
      preserveNewlines: false,
    });
    raw.textContent = entry.original_text || "";
    normalized.hidden = state.rawMode;
    raw.hidden = !state.rawMode;
    var toggle = $("toggle-raw");
    if (toggle) {
      toggle.textContent = state.rawMode ? "显示阅读整理" : "显示馆方原始字符";
      toggle.setAttribute("aria-pressed", state.rawMode ? "true" : "false");
    }
  }

  function renderAnomalies(entry) {
    var anomalies = entry.text_anomalies || [];
    var note = $("anomaly-note");
    if (!note) return;
    if (!anomalies.length) {
      note.hidden = true;
      note.textContent = "";
      return;
    }
    var counts = {};
    anomalies.forEach(function (item) { counts[item.type] = (counts[item.type] || 0) + 1; });
    var pieces = [];
    if (counts.p) pieces.push("孤立 p " + counts.p + " 处");
    if (counts.private_use) pieces.push("私用区字符 " + counts.private_use + " 处");
    if (counts.bracket) pieces.push("方括号校改 " + counts.bracket + " 处");
    if (counts.corrected_heading) pieces.push("日序标题含校改括注");
    note.hidden = false;
    note.textContent = "原文异常提示：本日馆方转录含" + pieces.join("、") + "。原文保留，阅读区以〔p〕或〔U+…〕标出，不静默改写。";
  }

  function renderNotes(entry) {
    var block = $("daily-notes");
    var list = $("notes-list");
    if (!block || !list) return;
    list.textContent = "";
    var notes = entry.notes || [];
    if (!notes.length) {
      hide(block, true);
      return;
    }
    notes.forEach(function (note) {
      var item = document.createElement("li");
      if (typeof note === "string") {
        item.textContent = note;
      } else {
        var result = document.createElement("p");
        result.className = "note-result";
        result.textContent = note.result || note.text || "";
        item.appendChild(result);
        if (note.interpretation) {
          var interpretation = document.createElement("p");
          interpretation.className = "note-interpretation";
          interpretation.textContent = note.interpretation;
          item.appendChild(interpretation);
        }
        if (note.source) {
          var source = document.createElement("p");
          source.className = "note-source";
          source.textContent = note.source;
          item.appendChild(source);
        }
      }
      list.appendChild(item);
    });
    block.hidden = false;
  }

  function renderTags(entry) {
    var people = $("people-tags");
    var works = $("work-tags");
    if (people) {
      people.textContent = "";
      var list = entry.people || [];
      if (!list.length) {
        var empty = document.createElement("span");
        empty.className = "muted";
        empty.textContent = "本日没有识别到可索引的原文称呼。";
        people.appendChild(empty);
      }
      list.forEach(function (person) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "tag";
        chip.textContent = person.name_in_text;
        chip.title = "查看“" + person.name_in_text + "”在 " + state.selectedYear + " 年出现过的日期";
        chip.addEventListener("click", function () {
          openEntity("person", person.name_in_text, { jump: true, scroll: true });
        });
        people.appendChild(chip);
      });
    }
    if (works) {
      works.textContent = "";
      var list = entry.works || [];
      if (!list.length) {
        var emptyWork = document.createElement("span");
        emptyWork.className = "muted";
        emptyWork.textContent = "本日没有以《》标出的书名或篇名。";
        works.appendChild(emptyWork);
      }
      list.forEach(function (work) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "tag tag-work";
        chip.textContent = work.name_in_text;
        chip.title = "查看《" + work.name_in_text + "》在 " + state.selectedYear + " 年出现过的日期";
        chip.addEventListener("click", function () { openEntity("work", work.name_in_text, { jump: true, scroll: true }); });
        works.appendChild(chip);
      });
    }
    $("anomaly-note").hidden = !(entry.text_anomalies && entry.text_anomalies.length);
  }

  function renderSourceDetails(entry) {
    var body = $("source-details-body");
    if (!body) return;
    body.textContent = "";
    var source = entry.source || {};
    var metadata = state.data.metadata || {};
    var yearMeta = state.yearMetaByNumber.get(state.selectedYear) || {};
    var secondary = (entry.verification_status && entry.verification_status.secondary_collation) || "";
    if (!secondary) secondary = (entry.collation && entry.collation.compared) ? "已完成对校" : "该年未逐日与二手转录全文对校";
    var rows = [
      ["收录范围", formatDate(state.coverageFirst) + " 至 " + formatDate(state.coverageLast)],
      ["本年纪要", state.selectedYear + " 年：" + state.days.length + " 天日条；" + (yearMeta.kind === "complete" ? "馆方月页完整" : (yearMeta.note || "部分收录"))],
      ["原始文献", source.name || "北京鲁迅博物馆资料查询系统"],
      ["月度记录", source.month_record || source.version || ""],
      ["记录 ID", source.record_id ? String(source.record_id) : ""],
      ["引用范围", source.citation_scope || ""],
      ["对校状态", secondary],
      ["校勘边界", (metadata.collation && metadata.collation.limits) || "未做纸本、影印本或手稿校勘。"]
    ];
    rows.forEach(function (pair) {
      if (!pair[1]) return;
      var dt = document.createElement("dt");
      dt.textContent = pair[0];
      var dd = document.createElement("dd");
      dd.textContent = pair[1];
      body.appendChild(dt);
      body.appendChild(dd);
    });
    var official = $("official-source");
    if (official && source.url) {
      official.href = source.url;
      official.textContent = "馆方 " + state.selectedYear + " 年 " + entry.month + " 月页面 ↗";
    }
    var wikisourceLine = $("wikisource-line");
    if (wikisourceLine) wikisourceLine.hidden = state.selectedYear !== 1926;
  }

  function renderAppendix(entry) {
    var card = $("appendix-card");
    if (!card) return;
    var appendix = null;
    if (state.selectedYear === 1926 && entry.date === "1926-12-31") {
      appendix = state.appendices[0] || null;
    } else {
      var candidates = state.appendices.filter(function (item) {
        return Number(item.month) === entry.month;
      });
      if (candidates.length) {
        var monthDaysList = state.daysByMonth.get(entry.month) || [];
        var last = monthDaysList.length ? monthDaysList[monthDaysList.length - 1] : null;
        if (last && last.date === entry.date) appendix = candidates[0];
      }
    }
    if (!appendix) { card.hidden = true; return; }
    card.hidden = false;
    setText("appendix-title", appendix.title || "附录");
    setText("appendix-note", appendix.source_note || appendix.note || "");
    var appendixText = $("appendix-text");
    if (appendixText) {
      appendixText.textContent = "";
      appendArtifactAware(appendixText, appendix.original_text || "", {
        offsets: pArtifactOffsets(appendix.text_anomalies),
        preserveNewlines: true,
      });
    }
    var link = $("appendix-source");
    if (link) {
      var appendixUrl = appendix.source_url || (appendix.source && appendix.source.url);
      if (appendixUrl) link.href = appendixUrl;
      link.textContent = "馆方 " + state.selectedYear + " 年 " + entry.month + " 月页 ↗";
    }
  }

  function renderOriginalTextForRaw(entry) {
    return entry.original_text || "";
  }

  // ---------- entity panel ----------

  function openEntity(kind, key, options) {
    options = options || {};
    var index = kind === "work" ? state.worksIndex : state.peopleIndex;
    var item = index.get(key);
    if (!item) {
      setNotice("索引中没有找到“" + key + "”。", { error: true });
      return;
    }
    state.entity = { kind: kind, key: key };
    var readingGrid = document.querySelector(".content-grid");
    if (readingGrid) readingGrid.classList.remove("single-column");
    var explore = $("explore-details");
    if (explore) explore.open = true;
    var fold = $(kind === "work" ? "works-card" : "people-card");
    if (fold && fold.tagName === "DETAILS") fold.open = true;
    hide("entity-card", false);
    var title = kind === "work" ? "作品 ·《" + key + "》" : "人物称呼 · " + key;
    setText("entity-title", title);
    var dates = Array.from(new Set(item.dates)).sort();
    var label = kind === "work" ? "书名/篇名" : "原文称呼";
    setText("entity-description", "“" + key + "”在 " + state.selectedYear + " 年 " + dates.length + " 天中出现，共 " + item.occurrences.length + " 条日条记录。这里只做" + label + "的字面索引，不核证人物身份或版本全称。");
    var note = $("entity-note");
    if (note) {
      note.hidden = true;
      note.textContent = "";
    }
    var container = $("entity-occurrences");
    container.textContent = "";
    var sorted = item.occurrences.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    sorted.forEach(function (occurrence) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "occurrence";
      if (occurrence.date === state.selectedDate) row.classList.add("current");
      row.setAttribute("data-date", occurrence.date);
      var dateLine = document.createElement("span");
      dateLine.className = "occurrence-date";
      dateLine.textContent = formatDate(occurrence.date);
      var textLine = document.createElement("span");
      textLine.className = "occurrence-text";
      textLine.textContent = occurrence.text;
      row.appendChild(dateLine);
      row.appendChild(textLine);
      row.addEventListener("click", function () {
        renderDate(occurrence.date, { scroll: true });
      });
      container.appendChild(row);
    });
    if (options.jump && dates.length && dates.indexOf(state.selectedDate) === -1) {
      renderDate(dates[0], { scroll: true });
    }
    if (options.scroll !== false) {
      setTimeout(function () { $("entity-card").scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 40);
    }
    if (options.updateHash !== false) {
      writeHash(state.selectedDate, entityHashValue(state.entity), false);
    }
    announce("已打开" + title + "，共 " + item.occurrences.length + " 条记录。");
  }

  function renderEntityPanel() {
    var card = $("entity-card");
    if (!card) return;
    if (!state.entity) { card.hidden = true; return; }
    var item = (state.entity.kind === "work" ? state.worksIndex : state.peopleIndex).get(state.entity.key);
    if (!item) { state.entity = null; card.hidden = true; return; }
    hide(card, false);
    // Refresh current highlight in already-rendered occurrences.
    Array.prototype.forEach.call(card.querySelectorAll(".occurrence"), function (row) {
      var date = row.getAttribute("data-date");
      row.classList.toggle("current", date === state.selectedDate);
    });
  }

  function closeEntity() {
    state.entity = null;
    hide("entity-card", true);
    var entry = state.daysByDate.get(state.selectedDate);
    var grid = document.querySelector(".content-grid");
    if (grid && entry) grid.classList.toggle("single-column", !((entry.people && entry.people.length) || (entry.works && entry.works.length)));
    writeHash(state.selectedDate, "", false);
    announce("已关闭线索面板。");
  }

  // ---------- month chrome ----------

  function monthShift(year, month, delta) {
    var next = month + delta;
    var nextYear = year;
    if (next < 1) { nextYear -= 1; next = 12; }
    if (next > 12) { nextYear += 1; next = 1; }
    return { year: nextYear, month: next };
  }

  function renderMonthChrome() {
    renderMonthTabs();
    renderCalendar();
    renderDigest();
    var heading = $("month-heading");
    if (heading) heading.textContent = state.selectedYear + " 年 " + state.selectedMonth + " 月";
    setText("month-browse-label", "BROWSE " + state.selectedYear);
    var prevTarget = monthShift(state.selectedYear, state.selectedMonth, -1);
    var nextTarget = monthShift(state.selectedYear, state.selectedMonth, 1);
    var prev = $("prev-month");
    var next = $("next-month");
    if (prev) prev.disabled = isoDate(prevTarget.year, prevTarget.month, 1) < state.coverageFirst;
    if (next) next.disabled = isoDate(nextTarget.year, nextTarget.month, 1) > state.coverageLast;
    var label = $("month-digest-label");
    if (label) {
      var count = (state.daysByMonth.get(state.selectedMonth) || []).length;
      label.textContent = "本月日记目录 · " + count + " 天记录";
    }
  }

  function renderMonthTabs() {
    var container = $("month-tabs");
    if (!container) return;
    container.textContent = "";
    for (var month = 1; month <= 12; month += 1) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "month-tab";
      if (month === state.selectedMonth) button.classList.add("active");
      var count = (state.daysByMonth.get(month) || []).length;
      var name = document.createElement("span");
      name.textContent = monthName(month);
      var small = document.createElement("small");
      small.textContent = count + "天";
      button.appendChild(name);
      button.appendChild(small);
      button.addEventListener("click", function (monthNumber) {
        return function () { selectMonth(monthNumber); };
      }(month));
      container.appendChild(button);
    }
  }

  async function selectMonth(month) {
    if (month < 1 || month > 12) return;
    var candidate = "";
    if (state.targetISO.slice(0, 4) === String(state.selectedYear) && Number(state.targetISO.slice(5, 7)) === month) {
      candidate = state.targetISO;
    }
    if (!candidate) candidate = firstDateOfMonth(month);
    if (!candidate) candidate = isoDate(state.selectedYear, month, 1);
    await navigateToDate(candidate, { scroll: false });
  }

  async function goToMonth(delta) {
    var target = monthShift(state.selectedYear, state.selectedMonth, delta);
    if (!state.yearMetaByNumber.has(target.year)) return;
    var first = isoDate(target.year, target.month, 1);
    if (first < state.coverageFirst || first > state.coverageLast) return;
    await navigateToDate(first, { scroll: false });
  }

  function renderCalendar() {
    var container = $("calendar");
    if (!container) return;
    container.textContent = "";
    var month = state.selectedMonth;
    var total = monthDays(state.selectedYear, month);
    var firstWeekday = new Date(Date.UTC(state.selectedYear, month - 1, 1)).getUTCDay();
    ["日", "一", "二", "三", "四", "五", "六"].forEach(function (label) {
      var head = document.createElement("div");
      head.className = "calendar-weekday";
      head.textContent = label;
      container.appendChild(head);
    });
    for (var i = 0; i < firstWeekday; i += 1) {
      var blank = document.createElement("div");
      blank.className = "calendar-empty";
      blank.setAttribute("aria-hidden", "true");
      container.appendChild(blank);
    }
    for (var day = 1; day <= total; day += 1) {
      var iso = isoDate(state.selectedYear, month, day);
      var entry = state.daysByDate.get(iso);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-day";
      button.textContent = String(day);
      button.setAttribute("data-date", iso);
      button.setAttribute("aria-label", formatDate(iso) + (entry ? (entry.explicit_no_activity ? "，原文记无事" : "") : "，无日条"));
      if (!entry) button.classList.add("missing");
      if (entry && entry.explicit_no_activity) button.classList.add("no-activity");
      if (iso === state.selectedDate) button.classList.add("selected");
      if (iso === state.targetISO) button.classList.add("today-target");
      button.addEventListener("click", function (date) {
        return function () { navigateToDate(date, { scroll: true }); };
      }(iso));
      container.appendChild(button);
    }
  }

  function renderDigest() {
    var container = $("month-digest");
    if (!container) return;
    container.textContent = "";
    var month = state.selectedMonth;
    var total = monthDays(state.selectedYear, month);
    for (var day = 1; day <= total; day += 1) {
      var iso = isoDate(state.selectedYear, month, day);
      var entry = state.daysByDate.get(iso);
      var row = document.createElement("button");
      row.type = "button";
      row.className = "digest-row";
      if (!entry) row.classList.add("missing");
      if (iso === state.selectedDate) row.classList.add("current");
      var date = document.createElement("span");
      date.className = "digest-date";
      date.textContent = month + "月" + day + "日 " + weekdayOf(iso);
      var text = document.createElement("span");
      text.className = "digest-summary";
      if (!entry) {
        text.textContent = "无日条";
      } else if (entry.original_text) {
        text.textContent = quoteFor(entry.original_text);
      } else {
        text.textContent = entry.explicit_no_activity ? "原文记无事" : "（无原文）";
      }
      row.appendChild(date);
      row.appendChild(text);
      row.addEventListener("click", function (dateIso) {
        return function () { navigateToDate(dateIso, { scroll: true }); };
      }(iso));
      container.appendChild(row);
    }
    var label = $("month-digest-label");
    if (label) {
      var count = (state.daysByMonth.get(month) || []).length;
      label.textContent = "本月日记目录 · " + count + " 天记录";
    }
  }

  // ---------- index ----------

  function renderAllIndexes() {
    var hasIndex = state.peopleIndex.size > 0 || state.worksIndex.size > 0;
    hide("explore-details", !hasIndex);
    if (!hasIndex) return;
    renderPeopleIndex("");
    renderWorksIndex("");
    setText("index-count", "人物 " + state.peopleIndex.size + " 个称呼 · 作品 " + state.worksIndex.size + " 种书名/篇名");
  }

  function renderPeopleIndex(filter) {
    var container = $("people-index");
    if (!container) return;
    container.textContent = "";
    var needle = (filter || "").trim().toLowerCase();
    var rows = Array.from(state.peopleIndex.values())
      .filter(function (item) { return !needle || item.name.toLowerCase().indexOf(needle) !== -1; })
      .sort(function (a, b) { return (b.dates.length - a.dates.length) || a.name.localeCompare(b.name, "zh-CN"); });
    rows.forEach(function (item) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag index-tag";
      var name = document.createElement("span");
      name.textContent = item.name;
      var count = document.createElement("span");
      count.className = "index-count-badge";
      count.textContent = item.dates.length + "天";
      chip.appendChild(name);
      chip.appendChild(count);
      chip.addEventListener("click", function () { openEntity("person", item.name, { jump: true, scroll: true }); });
      container.appendChild(chip);
    });
    if (!rows.length) {
      var empty = document.createElement("span");
      empty.className = "muted";
      empty.textContent = "没有匹配的称呼。";
      container.appendChild(empty);
    }
    var meta = state.data && state.data.metadata.local_stats;
    setText("people-index-label", meta ? "共 " + meta.distinct_person_strings + " 个原文称呼 · 按出现天数排序" : "按出现天数排序");
  }

  function renderWorksIndex(filter) {
    var container = $("works-index");
    if (!container) return;
    container.textContent = "";
    var needle = (filter || "").trim().toLowerCase();
    var rows = Array.from(state.worksIndex.values())
      .filter(function (item) { return !needle || item.name.toLowerCase().indexOf(needle) !== -1; })
      .sort(function (a, b) { return (b.dates.length - a.dates.length) || a.name.localeCompare(b.name, "zh-CN"); });
    rows.forEach(function (item) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag tag-work index-tag";
      var name = document.createElement("span");
      name.textContent = item.name;
      var count = document.createElement("span");
      count.className = "index-count-badge";
      count.textContent = item.dates.length + "天";
      chip.appendChild(name);
      chip.appendChild(count);
      chip.addEventListener("click", function () { openEntity("work", item.name, { jump: true, scroll: true }); });
      container.appendChild(chip);
    });
    if (!rows.length) {
      var empty = document.createElement("span");
      empty.className = "muted";
      empty.textContent = "没有匹配的书名或篇名。";
      container.appendChild(empty);
    }
    var meta = state.data && state.data.metadata.local_stats;
    setText("works-index-label", meta ? "共 " + meta.distinct_title_strings + " 种 · 按原文书名号提取" : "按原文书名号提取");
  }

  // ---------- events ----------

  async function switchYear(year) {
    var number = Number(year);
    if (!state.yearMetaByNumber.has(number)) return;
    await loadYear(number);
    state.entity = null;
    hide("entity-card", true);
    var sourceDate = state.selectedDate || state.targetISO;
    var month = Number(sourceDate.slice(5, 7)) || 1;
    var day = Number(sourceDate.slice(8, 10)) || 1;
    var candidate = isoDate(number, month, day);
    if (!state.daysByDate.has(candidate)) candidate = state.days.length ? state.days[0].date : isoDate(number, 1, 1);
    renderDate(candidate, { scroll: true });
  }

  function bindEvents() {
    if (state.eventsBound) return;
    state.eventsBound = true;
    $("prev-day").addEventListener("click", function () {
      var next = addDays(state.selectedDate, -1);
      if (next < state.coverageFirst) return;
      navigateToDate(next, { scroll: true });
    });
    $("next-day").addEventListener("click", function () {
      var next = addDays(state.selectedDate, 1);
      if (next > state.coverageLast) return;
      navigateToDate(next, { scroll: true });
    });
    $("prev-entry").addEventListener("click", function () {
      var next = addDays(state.selectedDate, -1);
      if (next < state.coverageFirst) return;
      navigateToDate(next, { scroll: true });
    });
    $("next-entry").addEventListener("click", function () {
      var next = addDays(state.selectedDate, 1);
      if (next > state.coverageLast) return;
      navigateToDate(next, { scroll: true });
    });
    $("date-picker").addEventListener("change", function (event) {
      var value = event.target.value;
      if (!value) return;
      if (value < state.coverageFirst || value > state.coverageLast) {
        setNotice("日期超出收录范围；已恢复当前日期。", { error: true });
        syncDateControls();
        return;
      }
      navigateToDate(value, { scroll: true });
    });
    $("today-button").addEventListener("click", function () {
      navigateToDate(state.targetISO, { scroll: true });
    });
    $("missing-today").addEventListener("click", function () { navigateToDate(state.targetISO, { scroll: true }); });
    $("year-select").addEventListener("change", function (event) {
      switchYear(event.target.value).catch(function (error) {
        setNotice("年份载入失败：" + error.message, { error: true });
      });
    });
    $("toggle-raw").addEventListener("click", function () {
      state.rawMode = !state.rawMode;
      var entry = state.daysByDate.get(state.selectedDate);
      if (entry) renderOriginal(entry);
    });
    $("copy-link").addEventListener("click", copyCurrentLink);
    $("entity-close").addEventListener("click", closeEntity);
    $("prev-month").addEventListener("click", function () { goToMonth(-1); });
    $("next-month").addEventListener("click", function () { goToMonth(1); });
    $("people-filter").addEventListener("input", function (event) { renderPeopleIndex(event.target.value); });
    $("works-filter").addEventListener("input", function (event) { renderWorksIndex(event.target.value); });
    window.addEventListener("hashchange", function () {
      if (state.hashLock) return;
      applyHash().catch(function (error) { setNotice("链接载入失败：" + error.message, { error: true }); });
    });
    window.addEventListener("popstate", function () {
      if (state.hashLock) return;
      applyHash().catch(function (error) { setNotice("链接载入失败：" + error.message, { error: true }); });
    });
    window.addEventListener("keydown", function (event) {
      if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (event.key === "ArrowLeft") { $("prev-day").click(); }
      if (event.key === "ArrowRight") { $("next-day").click(); }
    });
  }

  function bindStaticEvents() {
    // Kept separate for readability: bindEvents is called after data load.
    bindEvents();
  }

  function copyCurrentLink() {
    var url = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        setNotice("已复制本日链接。", {});
        announce("已复制本日链接。");
      }).catch(function () { fallbackCopy(url); });
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    window.prompt("复制本日链接：", text);
  }

  // ---------- boot ----------

  async function boot() {
    setNotice("");
    var notice = $("notice");
    if (notice) notice.hidden = true;
    try {
      await loadIndex();
      var today = beijingTodayISO();
      var target = minus100Years(today);
      state.todayISO = today;
      state.targetISO = target;
      var hash = readHash();
      var initial = hash.date && parseISO(hash.date) ? hash.date : target;
      var initialYear = Number(initial.slice(0, 4));
      var initialMeta = state.yearMetaByNumber.get(initialYear);
      if (!initialMeta) {
        var targetYear = Number(target.slice(0, 4));
        initialYear = state.yearMetaByNumber.has(targetYear) ? targetYear : Number(state.yearIndex.years[0].year);
      }
      await loadYear(initialYear);
      bindEvents();
      renderInitialFurniture();
      renderDate(initial, { replaceHash: true, fromHash: true });
      var existingHash = readHash();
      if (!existingHash.date || !parseISO(existingHash.date)) {
        writeHash(initial, entityHashValue(state.entity), true);
      }
      setNotice("");
    } catch (error) {
      var diary = $("diary");
      var missing = $("missing-card");
      if (diary) diary.hidden = true;
      if (missing) missing.hidden = true;
      setNotice("数据载入失败：" + error.message + "。请确认本地静态服务器正在运行，并检查 data/years/index.json 及年份文件是否存在。", { error: true, retry: true });
      document.documentElement.setAttribute("data-load-error", "true");
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
}());
