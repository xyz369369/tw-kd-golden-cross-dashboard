(function () {
  var input = document.getElementById('lookup-input');
  var suggestionsBox = document.getElementById('lookup-suggestions');
  var modal = document.getElementById('lookup-modal');
  var loadingEl = document.getElementById('lookup-loading');
  var errorEl = document.getElementById('lookup-error');
  var chartsWrap = document.getElementById('lookup-charts');
  var statsEl = document.getElementById('lookup-stats');

  var historyData = null; // full stocks_history.json, fetched lazily on first use
  var loadPromise = null;
  var charts = {}; // Chart.js instances, keyed by canvas id
  var activeIndex = -1;

  function loadHistory() {
    if (loadPromise) return loadPromise;
    loadPromise = fetch('stocks_history.json')
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

  input.addEventListener('focus', function () {
    loadHistory().then(function () { renderSuggestions(input.value); });
  });

  input.addEventListener('input', function () {
    if (historyData) renderSuggestions(input.value);
    else loadHistory().then(function () { renderSuggestions(input.value); });
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

  // ---- Modal ----
  function openModal() { modal.classList.add('open'); }
  function closeModal() {
    modal.classList.remove('open');
    Object.keys(charts).forEach(function (k) { charts[k].destroy(); });
    charts = {};
  }
  modal.querySelectorAll('[data-close-modal]').forEach(function (el) {
    el.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  function selectStock(code) {
    suggestionsBox.classList.remove('open');
    input.value = '';
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    chartsWrap.style.display = 'none';
    statsEl.innerHTML = '';
    openModal();

    loadHistory().then(function (data) {
      var s = data.stocks[code];
      if (!s || !s.dates || !s.dates.length) {
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        return;
      }
      renderDetail(code, s);
      loadingEl.style.display = 'none';
      chartsWrap.style.display = 'flex';
    }).catch(function () {
      loadingEl.style.display = 'none';
      errorEl.style.display = 'block';
    });
  }

  function renderDetail(code, s) {
    document.getElementById('lookup-code').textContent = code;
    document.getElementById('lookup-name').textContent = s.name;
    document.getElementById('lookup-market').textContent = s.market === 'TWSE' ? '上市' : '上櫃';

    var n = s.dates.length;
    var lastClose = s.close[n - 1];
    var lastMa = s.ma20_close[n - 1];
    var lastVol = s.volume[n - 1];
    var lastVolMa = s.ma20_volume[n - 1];
    var lastK = s.K[n - 1];
    var lastD = s.D[n - 1];

    statsEl.innerHTML = [
      ['最新收盤', lastClose != null ? lastClose.toFixed(2) : '–'],
      ['MA20', lastMa != null ? lastMa.toFixed(2) : '–'],
      ['成交量', fmtNum(lastVol)],
      ['量MA20', fmtNum(lastVolMa)],
      ['K值', lastK != null ? lastK.toFixed(1) : '–'],
      ['D值', lastD != null ? lastD.toFixed(1) : '–'],
      ['資料日期', s.dates[n - 1]]
    ].map(function (pair) {
      return '<div class="lookup-stat"><div class="stat-label">' + pair[0] + '</div><div class="stat-value">' + pair[1] + '</div></div>';
    }).join('');

    var labels = s.dates.map(function (d) { return d.slice(5); });
    var textColor = themeColor('--color-text-muted');
    var gridColor = themeColor('--color-divider');
    var primary = themeColor('--color-primary');
    var blue = themeColor('--color-blue');
    var success = themeColor('--color-success');

    var commonScales = {
      x: { ticks: { color: textColor, maxTicksLimit: 10 }, grid: { color: gridColor } },
      y: { ticks: { color: textColor }, grid: { color: gridColor } }
    };
    var commonOpts = {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: textColor } } },
      scales: commonScales
    };

    function makeChart(id, config) {
      if (charts[id]) charts[id].destroy();
      var ctx = document.getElementById(id).getContext('2d');
      charts[id] = new Chart(ctx, config);
    }

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

    makeChart('chart-volume', {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { type: 'bar', label: '成交量', data: s.volume, backgroundColor: success + '99', borderWidth: 0 },
          { type: 'line', label: '量MA20', data: s.ma20_volume, borderColor: blue, backgroundColor: blue, tension: 0.15, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] }
        ]
      },
      options: commonOpts
    });
  }
})();
