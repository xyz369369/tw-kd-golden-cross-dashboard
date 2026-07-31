(function () {
  let allStocks = {};
  let stockList = [];
  let currentStock = null;
  let currentTab = 'basic';

  const lookupInput = document.getElementById('lookup-input');
  const lookupSuggestions = document.getElementById('lookup-suggestions');
  const lookupEmpty = document.getElementById('lookup-empty');
  const lookupDetail = document.getElementById('lookup-detail');
  const lookupLoading = document.getElementById('lookup-loading');
  const lookupError = document.getElementById('lookup-error');
  const lookupContent = document.getElementById('lookup-content');

  function fmtNum(n) {
    if (n === null || n === undefined) return '–';
    return Number(n).toLocaleString('zh-Hant-TW');
  }

  function toFixed(num, decimals) {
    if (num === null || num === undefined) return '–';
    const n = Number(num);
    if (isNaN(n)) return '–';
    return n.toFixed(decimals);
  }

  function renderSuggestions(query) {
    if (!query || query.length < 1) {
      lookupSuggestions.innerHTML = '';
      lookupSuggestions.classList.remove('open');
      return;
    }
    
    const q = query.toLowerCase();
    const matches = stockList.filter(s => 
      s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ).slice(0, 10);
    
    if (matches.length === 0) {
      lookupSuggestions.innerHTML = '';
      lookupSuggestions.classList.remove('open');
      return;
    }
    
    lookupSuggestions.innerHTML = matches.map(s => `
      <div class="suggestion-item" data-code="${s.code}" data-name="${s.name}">
        <span class="suggestion-code">${s.code}</span>
        <span class="suggestion-name">${s.name}</span>
        <span class="suggestion-market">${s.market === 'TWSE' ? '上市' : '上櫃'}</span>
      </div>
    `).join('');
    lookupSuggestions.classList.add('open');
  }

  async function fetchDividendData(code) {
    try {
      const url = "https://api.finmindtrade.com/api/v4/data";
      const params = new URLSearchParams({
        dataset: "TaiwanStockDividend",
        data_id: code,
        start_date: "2020-01-01",
        end_date: new Date().toISOString().split('T')[0]
      });
      const response = await fetch(`${url}?${params}`);
      const data = await response.json();
      if (data.status === 200 && data.data && data.data.length > 0) {
        return data.data;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch dividend data:', error);
      return null;
    }
  }

  async function fetchStockPriceData(code) {
    try {
      const url = "https://api.finmindtrade.com/api/v4/data";
      const params = new URLSearchParams({
        dataset: "TaiwanStockPrice",
        data_id: code,
        start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0]
      });
      const response = await fetch(`${url}?${params}`);
      const data = await response.json();
      if (data.status === 200 && data.data && data.data.length > 0) {
        return data.data;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch stock price data:', error);
      return null;
    }
  }

  async function fetchFinancialData(code) {
    try {
      const url = "https://api.finmindtrade.com/api/v4/data";
      const params = new URLSearchParams({
        dataset: "TaiwanStockFinancialStatements",
        data_id: code,
        start_date: "2020-01-01",
        end_date: new Date().toISOString().split('T')[0]
      });
      const response = await fetch(`${url}?${params}`);
      const data = await response.json();
      if (data.status === 200 && data.data && data.data.length > 0) {
        return data.data;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch financial data:', error);
      return null;
    }
  }

  async function fetchStockInfo(code) {
    try {
      const url = "https://api.finmindtrade.com/api/v4/data";
      const params = new URLSearchParams({
        dataset: "TaiwanStockInfo",
        data_id: code
      });
      const response = await fetch(`${url}?${params}`);
      const data = await response.json();
      if (data.status === 200 && data.data && data.data.length > 0) {
        return data.data[0];
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch stock info:', error);
      return null;
    }
  }

  async function loadStock(code) {
    lookupEmpty.style.display = 'none';
    lookupDetail.style.display = 'block';
    lookupLoading.style.display = 'block';
    lookupError.style.display = 'none';
    lookupContent.style.display = 'none';

    const stockData = allStocks[code];
    if (!stockData || !stockData.dates || !stockData.dates.length) {
      lookupLoading.style.display = 'none';
      lookupError.style.display = 'block';
      return;
    }

    const n = stockData.dates.length - 1;
    currentStock = stockData;

    // Update header
    document.getElementById('lookup-code').textContent = code;
    document.getElementById('lookup-name').textContent = stockData.name;
    document.getElementById('lookup-market').textContent = stockData.market === 'TWSE' ? '上市' : '上櫃';

    // Basic data
    document.getElementById('basic-code').textContent = code;
    document.getElementById('basic-name').textContent = stockData.name;
    document.getElementById('basic-market').textContent = stockData.market === 'TWSE' ? '上市' : '上櫃';
    document.getElementById('basic-industry').textContent = '–';
    document.getElementById('basic-close').textContent = toFixed(stockData.close[n], 2);
    document.getElementById('basic-change').textContent = '–';
    document.getElementById('basic-open').textContent = '–';
    document.getElementById('basic-high').textContent = '–';
    document.getElementById('basic-low').textContent = '–';
    document.getElementById('basic-volume').textContent = fmtNum(Math.round(stockData.volume[n] / 1000)) + ' 張';
    document.getElementById('basic-turnover').textContent = '–';
    document.getElementById('basic-transactions').textContent = '–';
    document.getElementById('basic-pe').textContent = '–';
    document.getElementById('basic-pb').textContent = '–';
    document.getElementById('basic-date').textContent = stockData.dates[n] || '–';
    document.getElementById('basic-updated').textContent = new Date().toLocaleString('zh-Hant-TW');

    // Fetch stock info for industry and other basic data
    const stockInfo = await fetchStockInfo(code);
    if (stockInfo) {
      document.getElementById('basic-industry').textContent = stockInfo.industry || '–';
    }

    // Fetch stock price data for more details
    const priceData = await fetchStockPriceData(code);
    if (priceData && priceData.length > 0) {
      const latest = priceData[priceData.length - 1];
      const prevClose = priceData.length > 1 ? priceData[priceData.length - 2].close : latest.close;
      const change = ((latest.close - prevClose) / prevClose * 100).toFixed(2);
      document.getElementById('basic-change').textContent = (change > 0 ? '+' : '') + change + '%';
      document.getElementById('basic-change').className = 'data-value ' + (change > 0 ? 'val-up' : change < 0 ? 'val-down' : '');
      document.getElementById('basic-open').textContent = toFixed(latest.open, 2);
      document.getElementById('basic-high').textContent = toFixed(latest.high, 2);
      document.getElementById('basic-low').textContent = toFixed(latest.low, 2);
      document.getElementById('basic-turnover').textContent = toFixed(latest.Trading_Volume / 100000000, 2) + ' 億';
      document.getElementById('basic-transactions').textContent = fmtNum(latest.Trading_turnover);
    }

    // Fetch dividend data
    const dividendData = await fetchDividendData(code);
    if (dividendData && dividendData.length > 0) {
      const latest = dividendData[dividendData.length - 1];
      const cashDiv = latest.CashEarningsDistribution || 0;
      const stockDiv = latest.StockEarningsDistribution || 0;
      document.getElementById('div-cash').textContent = cashDiv ? toFixed(cashDiv, 2) + ' 元' : '–';
      document.getElementById('div-stock').textContent = stockDiv ? toFixed(stockDiv, 2) : '–';
      document.getElementById('div-date').textContent = latest.CashExDividendTradingDate || '–';
      document.getElementById('div-price-before').textContent = '–';
      document.getElementById('div-price-after').textContent = '–';
      document.getElementById('div-year').textContent = latest.year || '–';
      
      // Calculate dividend yield
      const currentPrice = stockData.close[n];
      const yieldRate = cashDiv > 0 && currentPrice > 0 ? (cashDiv / currentPrice * 100).toFixed(2) : '–';
      document.getElementById('div-yield').textContent = yieldRate !== '–' ? yieldRate + '%' : '–';
      
      // Get EPS from financial data or dividend data
      document.getElementById('div-eps').textContent = '–';
    } else {
      document.getElementById('div-cash').textContent = '–';
      document.getElementById('div-stock').textContent = '–';
      document.getElementById('div-date').textContent = '–';
      document.getElementById('div-price-before').textContent = '–';
      document.getElementById('div-price-after').textContent = '–';
      document.getElementById('div-year').textContent = '–';
      document.getElementById('div-yield').textContent = '–';
      document.getElementById('div-eps').textContent = '–';
    }

    // Financial data
    const financialData = await fetchFinancialData(code);
    let bps = null;
    let eps = null;
    let revenue = null;
    let operatingIncome = null;
    let netIncome = null;
    let grossProfit = null;
    let costOfGoodsSold = null;
    
    if (financialData && financialData.length > 0) {
      // Get the latest date
      const latestDate = financialData[financialData.length - 1].date;
      const latestRecords = financialData.filter(r => r.date === latestDate);
      
      // Extract values by type
      const getValueByType = (type) => {
        const record = latestRecords.find(r => r.type === type);
        return record ? record.value : null;
      };
      
      eps = getValueByType('EPS');
      revenue = getValueByType('Revenue');
      operatingIncome = getValueByType('OperatingIncome');
      netIncome = getValueByType('IncomeAfterTaxes');
      grossProfit = getValueByType('GrossProfit');
      costOfGoodsSold = getValueByType('CostOfGoodsSold');
      
      // Calculate margins
      let grossMargin = null;
      let operatingMargin = null;
      let netMargin = null;
      
      if (revenue && grossProfit) {
        grossMargin = (grossProfit / revenue * 100);
      }
      if (revenue && operatingIncome) {
        operatingMargin = (operatingIncome / revenue * 100);
      }
      if (revenue && netIncome) {
        netMargin = (netIncome / revenue * 100);
      }
      
      document.getElementById('fin-bps').textContent = '–'; // BPS not available in this dataset
      document.getElementById('fin-eps').textContent = eps ? toFixed(eps, 2) : '–';
      document.getElementById('fin-revenue').textContent = revenue ? fmtNum(revenue / 1000000) + ' 百萬' : '–';
      document.getElementById('fin-operating-income').textContent = operatingIncome ? fmtNum(operatingIncome / 1000000) + ' 百萬' : '–';
      document.getElementById('fin-net-income').textContent = netIncome ? fmtNum(netIncome / 1000000) + ' 百萬' : '–';
      document.getElementById('fin-gross-margin').textContent = grossMargin ? toFixed(grossMargin, 2) + '%' : '–';
      document.getElementById('fin-operating-margin').textContent = operatingMargin ? toFixed(operatingMargin, 2) + '%' : '–';
      document.getElementById('fin-net-margin').textContent = netMargin ? toFixed(netMargin, 2) + '%' : '–';
      document.getElementById('fin-debt-ratio').textContent = '–'; // Debt ratio not available in this dataset
      document.getElementById('fin-current-ratio').textContent = '–'; // Current ratio not available in this dataset
    } else {
      document.getElementById('fin-bps').textContent = '–';
      document.getElementById('fin-eps').textContent = '–';
      document.getElementById('fin-revenue').textContent = '–';
      document.getElementById('fin-operating-income').textContent = '–';
      document.getElementById('fin-net-income').textContent = '–';
      document.getElementById('fin-gross-margin').textContent = '–';
      document.getElementById('fin-operating-margin').textContent = '–';
      document.getElementById('fin-net-margin').textContent = '–';
      document.getElementById('fin-debt-ratio').textContent = '–';
      document.getElementById('fin-current-ratio').textContent = '–';
    }

    // Calculate PE and PB ratios
    const currentPrice = stockData.close[n];
    if (eps && eps > 0 && currentPrice > 0) {
      const pe = (currentPrice / eps).toFixed(2);
      document.getElementById('basic-pe').textContent = pe;
    }
    if (bps && bps > 0 && currentPrice > 0) {
      const pb = (currentPrice / bps).toFixed(2);
      document.getElementById('basic-pb').textContent = pb;
    }

    // Update EPS in dividend tab
    if (eps) {
      document.getElementById('div-eps').textContent = toFixed(eps, 2);
    }

    lookupLoading.style.display = 'none';
    lookupContent.style.display = 'block';
  }

  function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'tab-' + tabName);
    });
  }

  // Event listeners
  lookupInput.addEventListener('input', (e) => {
    renderSuggestions(e.target.value.trim());
  });

  lookupInput.addEventListener('focus', () => {
    if (lookupInput.value.trim()) {
      renderSuggestions(lookupInput.value.trim());
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.lookup-search-wrap')) {
      lookupSuggestions.innerHTML = '';
      lookupSuggestions.classList.remove('open');
    }
  });

  lookupSuggestions.addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (item) {
      const code = item.dataset.code;
      lookupInput.value = code;
      lookupSuggestions.innerHTML = '';
      lookupSuggestions.classList.remove('open');
      loadStock(code);
    }
  });

  document.getElementById('data-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn) {
      switchTab(btn.dataset.tab);
    }
  });

  // Load data
  fetch('stocks_history.json?v=stock-v4')
    .then(r => {
      if (!r.ok) throw new Error('stocks_history.json fetch failed: ' + r.status);
      return r.json();
    })
    .then(data => {
      allStocks = data.stocks || {};
      stockList = data.list || [];
      document.getElementById('status-text').textContent = '資料已更新';
    })
    .catch(err => {
      console.error('Stock data load error:', err);
      document.getElementById('status-text').textContent = '資料載入失敗';
    });
})();
