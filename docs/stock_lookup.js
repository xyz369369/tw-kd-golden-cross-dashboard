(function () {
  var HISTORY_URL = 'stocks_history.json?v=stock-v4';
  var input = document.getElementById('lookup-input');
  var suggestionsBox = document.getElementById('lookup-suggestions');
  var emptyState = document.getElementById('lookup-empty');
  var detail = document.getElementById('lookup-detail');
  var loadingEl = document.getElementById('lookup-loading');
  var errorEl = document.getElementById('lookup-error');
  var chartsWrap = document.getElementById('lookup-charts');
  var statsEl = document.getElementById('lookup-stats');

  // Guard against a stale cached page (old markup) paired with this script.
  if (!input || !suggestionsBox || !emptyState || !detail || !loadingEl || !errorEl || !chartsWrap || !statsEl) {
    console.error('stock_lookup.js: expected elements missing — page may be a stale cached version. Try a hard refresh (Ctrl/Cmd+Shift+R).');
    return;
  }

  var historyData = null;
  var loadPromise = null;
  var charts = {};
  var activeIndex = -1;

  function loadHistory() {
    if (loadPromise) return loadPromise;
    loadPromise = fetch(HISTORY_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) { historyData = data; return data; });
    return loadPromise;
  }

  function themeColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  function fmtNum(n) {
    if (n === null || n === undefined) return '–';
    return Number(n).toLocaleString('zh-Hant-TW');
  }

  function fmtNet(v) {
    if (v === null || v === undefined || v === 0) return '–';
    var n = Number(v);
    return (n > 0 ? '<span class="net-buy">+' : '<span class="net-sell">') + fmtNum(Math.abs(n)) + '</span>';
  }

  // ---- Autocomplete ----
  function renderSuggestions(query) {
    if (!historyData) { suggestionsBox.classList.remove('open'); return; }
    var q = query.trim().toLowerCase();
    activeIndex = -1;
    if (!q) { suggestionsBox.classList.remove('open'); suggestionsBox.innerHTML = ''; return; }

    var matches = historyData.list.filter(function (s) {
      return s.code.toLowerCase().indexOf(q) === 0 || s.name.toLowerCase().indexOf(q) !== -1;
    }).slice(0, 20);

    suggestionsBox.innerHTML = '';
    if (matches.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'lookup-suggestion-empty';
      empty.textContent = '找不到符合的股票';
      suggestionsBox.appendChild(empty);
    } else {
      matches.forEach(function (s) {
        var item = document.createElement('div');
        item.className = 'lookup-suggestion-item';
        item.dataset.code = s.code;
        item.innerHTML =
          '<span class="code">' + s.code + '</span>' +
          '<span class="name">' + s.name + '</span>' +
          '<span class="market-tag" style="margin-left:auto;">' + (s.market === 'TWSE' ? '上市' : '上櫃') + '</span>';
        item.addEventListener('click', function () { selectStock(s.code); });
        suggestionsBox.appendChild(item);
      });
    }
    suggestionsBox.classList.add('open');
  }

  function handleLoadError(err) {
    console.error('stock_lookup.js: failed to load stocks_history.json', err);
    suggestionsBox.innerHTML = '<div class="lookup-suggestion-empty">資料載入失敗，請重新整理頁面後再試一次。</div>';
    suggestionsBox.classList.add('open');
  }

  input.addEventListener('focus', function () {
    loadHistory().then(function () { renderSuggestions(input.value); }).catch(handleLoadError);
  });

  input.addEventListener('input', function () {
    if (historyData) renderSuggestions(input.value);
    else loadHistory().then(function () { renderSuggestions(input.value); }).catch(handleLoadError);
  });

  input.addEventListener('keydown', function (e) {
    var items = Array.prototype.slice.call(suggestionsBox.querySelectorAll('.lookup-suggestion-item'));
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      var target = items[activeIndex] || items[0];
      if (target) selectStock(target.dataset.code);
      return;
    } else {
      return;
    }
    items.forEach(function (it, i) { it.classList.toggle('active', i === activeIndex); });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.lookup-search-wrap')) {
      suggestionsBox.classList.remove('open');
    }
  });

  // ---- Detail panel ----
  function selectStock(code) {
    suggestionsBox.classList.remove('open');

    emptyState.style.display = 'none';
    detail.style.display = 'block';
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    chartsWrap.style.display = 'none';
    statsEl.innerHTML = '';

    loadHistory().then(function (data) {
      var targetCode = code;
      var s = data.stocks[targetCode];

      if (!s && data.list) {
        var found = data.list.find(function (item) {
          return item.code === code || item.name === code;
        });
        if (found) {
          targetCode = found.code;
          s = data.stocks[targetCode];
        }
      }

      if (!s || !s.dates || !s.dates.length) {
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        return;
      }

      input.value = targetCode + ' ' + s.name;
      renderDetail(targetCode, s);
      loadingEl.style.display = 'none';
      chartsWrap.style.display = 'block';
    }).catch(function () {
      loadingEl.style.display = 'none';
      errorEl.style.display = 'block';
    });
  }

  function hasData(arr) {
    return arr && arr.length > 0 && arr.some(function (v) { return v !== 0 && v !== null; });
  }

  function renderDetail(code, s) {
    document.getElementById('lookup-code').textContent = code;
    document.getElementById('lookup-name').textContent = s.name;
    document.getElementById('lookup-market').textContent = s.market === 'TWSE' ? '上市' : '上櫃';

    var n = s.dates.length;
    var lastClose     = s.close[n - 1];
    var lastMa        = s.ma20_close[n - 1];
    var lastVol       = s.volume[n - 1];
    var lastVolMa     = s.ma20_volume[n - 1];
    var lastK         = s.K[n - 1];
    var lastD         = s.D[n - 1];
    var lastForeignNet = s.foreign_net && s.foreign_net[n - 1] || 0;
    var lastTrustNet   = s.trust_net   && s.trust_net[n - 1]   || 0;
    var lastDealerNet  = s.dealer_net  && s.dealer_net[n - 1]  || 0;
    var lastTurnover  = s.turnover_rate && s.turnover_rate[n - 1] != null ? s.turnover_rate[n - 1] : null;
    var lastMarginBuy = s.margin_buy && s.margin_buy[n - 1] || 0;
    var lastMarginSell = s.margin_sell && s.margin_sell[n - 1] || 0;
    var lastMarginBal = s.margin_balance && s.margin_balance[n - 1] || 0;
    var lastShortBuy  = s.short_buy && s.short_buy[n - 1] || 0;
    var lastShortSell = s.short_sell && s.short_sell[n - 1] || 0;
    var lastShortBal  = s.short_balance  && s.short_balance[n - 1]  || 0;

    // 轉換法人單位：股 → 張
    function netToZhang(v) {
      return v !== 0 ? Math.round(v / 1000) : 0;
    }

    var stats = [
      ['最新收盤', lastClose != null ? lastClose.toFixed(2) : '–'],
      ['MA20', lastMa != null ? lastMa.toFixed(2) : '–'],
      ['成交量(張)', fmtNum(lastVol != null ? Math.round(lastVol / 1000) : null)],
      ['量MA20(張)', fmtNum(lastVolMa != null ? Math.round(lastVolMa / 1000) : null)],
      ['換手率', lastTurnover != null ? lastTurnover.toFixed(2) + '%' : '–'],
      ['K值', lastK != null ? lastK.toFixed(1) : '–'],
      ['D值', lastD != null ? lastD.toFixed(1) : '–'],
      ['外資買賣超(張)', null, fmtNet(netToZhang(lastForeignNet))],
      ['投信買賣超(張)', null, fmtNet(netToZhang(lastTrustNet))],
      ['自營商買賣超(張)', null, fmtNet(netToZhang(lastDealerNet))],
      ['融資買進(張)', fmtNum(lastMarginBuy)],
      ['融資賣出(張)', fmtNum(lastMarginSell)],
      ['融資餘額(張)', fmtNum(lastMarginBal)],
      ['融券買進(張)', fmtNum(lastShortBuy)],
      ['融券賣出(張)', fmtNum(lastShortSell)],
      ['融券餘額(張)', fmtNum(lastShortBal)],
      ['資料日期', s.dates[n - 1]],
    ];

    statsEl.innerHTML = stats.map(function (pair) {
      var val = pair[2] != null ? pair[2] : ('<span>' + pair[1] + '</span>');
      return '<div class="lookup-stat"><div class="stat-label">' + pair[0] + '</div><div class="stat-value">' + val + '</div></div>';
    }).join('');

    var labels = s.dates.map(function (d) { return d.slice(5); });
    var textColor = themeColor('--color-text-muted');
    var gridColor = themeColor('--color-divider');
    var primary   = themeColor('--color-primary');
    var blue      = themeColor('--color-blue');
    var success   = themeColor('--color-success');
    var danger    = themeColor('--color-danger') || '#e53935';
    var orange    = themeColor('--color-orange') || '#fb8c00';

    var commonScales = {
      x: { ticks: { color: textColor, maxTicksLimit: 10 }, grid: { color: gridColor } },
      y: { ticks: { color: textColor }, grid: { color: gridColor } }
    };
    var commonOpts = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: textColor } } },
      scales: commonScales
    };

    function makeChart(id, config) {
      if (charts[id]) charts[id].destroy();
      var canvasEl = document.getElementById(id);
      if (!canvasEl) return;
      var ctx = canvasEl.getContext('2d');
      charts[id] = new Chart(ctx, config);
    }

    // 1. 股價走勢
    makeChart('chart-price', {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: '收盤價', data: s.close, borderColor: primary, backgroundColor: primary, tension: 0.15, pointRadius: 0, borderWidth: 2 },
          { label: 'MA20', data: s.ma20_close, borderColor: blue, backgroundColor: blue, tension: 0.15, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] }
        ]
      },
      options: commonOpts
    });

    // 2. KD 指標
    makeChart('chart-kd', {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'K值', data: s.K, borderColor: primary, backgroundColor: primary, tension: 0.15, pointRadius: 0, borderWidth: 2 },
          { label: 'D值', data: s.D, borderColor: blue, backgroundColor: blue, tension: 0.15, pointRadius: 0, borderWidth: 2 }
        ]
      },
      options: Object.assign({}, commonOpts, {
        scales: Object.assign({}, commonScales, { y: Object.assign({}, commonScales.y, { min: 0, max: 100 }) })
      })
    });

    // 3. 成交量
    makeChart('chart-volume', {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { type: 'bar', label: '成交量(張)', data: s.volume.map(function (v) { return Math.round(v / 1000); }), backgroundColor: success + '99', borderWidth: 0 },
          { type: 'line', label: '量MA20(張)', data: s.ma20_volume.map(function (v) { return Math.round(v / 1000); }), borderColor: blue, backgroundColor: blue, tension: 0.15, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] }
        ]
      },
      options: commonOpts
    });

    // 4. 三大法人買賣超
    if (hasData(s.foreign_net) || hasData(s.trust_net) || hasData(s.dealer_net)) {
      makeChart('chart-instit', {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            { label: '外資(張)', data: s.foreign_net.map(function (v) { return Math.round(v / 1000); }), backgroundColor: primary + 'bb', borderWidth: 0 },
            { label: '投信(張)', data: s.trust_net.map(function (v) { return Math.round(v / 1000); }), backgroundColor: blue + 'bb', borderWidth: 0 },
            { label: '自營商(張)', data: s.dealer_net.map(function (v) { return Math.round(v / 1000); }), backgroundColor: success + 'bb', borderWidth: 0 }
          ]
        },
        options: commonOpts
      });
      document.getElementById('chart-instit-block').style.display = '';
    } else {
      document.getElementById('chart-instit-block').style.display = 'none';
    }

    // 5. 換手率
    if (hasData(s.turnover_rate)) {
      makeChart('chart-turnover', {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            { label: '換手率(%)', data: s.turnover_rate, borderColor: orange, backgroundColor: orange + '33', tension: 0.15, pointRadius: 0, borderWidth: 2, fill: true }
          ]
        },
        options: commonOpts
      });
      document.getElementById('chart-turnover-block').style.display = '';
    } else {
      document.getElementById('chart-turnover-block').style.display = 'none';
    }

    // 6. 融資融券
    if (hasData(s.margin_balance) || hasData(s.short_balance)) {
      makeChart('chart-margin', {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            { label: '融資餘額(張)', data: s.margin_balance, borderColor: danger, backgroundColor: danger + '22', tension: 0.15, pointRadius: 0, borderWidth: 2, fill: true, yAxisID: 'y' },
            { label: '融券餘額(張)', data: s.short_balance, borderColor: success, backgroundColor: success + '22', tension: 0.15, pointRadius: 0, borderWidth: 2, fill: true, yAxisID: 'y2' }
          ]
        },
        options: Object.assign({}, commonOpts, {
          scales: {
            x: commonScales.x,
            y:  { position: 'left',  ticks: { color: danger }, grid: { color: gridColor }, title: { display: true, text: '融資(張)', color: danger } },
            y2: { position: 'right', ticks: { color: success }, grid: { drawOnChartArea: false }, title: { display: true, text: '融券(張)', color: success } }
          }
        })
      });
      document.getElementById('chart-margin-block').style.display = '';
    } else {
      document.getElementById('chart-margin-block').style.display = 'none';
    }
  }

  // Auto-execute lookup when loaded with URL query param e.g. stock.html?code=2330
  var urlParams = new URLSearchParams(window.location.search);
  var initialCode = urlParams.get('code') || urlParams.get('q');
  if (initialCode) {
    loadHistory().then(function () { selectStock(initialCode); }).catch(handleLoadError);
  }
})();
