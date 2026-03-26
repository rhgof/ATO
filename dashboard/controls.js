/* =============================================================================
   TaxMix — Controls Layer
   State management, initialization, tabs, filters, main area rendering
   ============================================================================= */

window.TaxMix = window.TaxMix || {};

TaxMix.controls = {

  state: {
    view: 'overview',
    govLevel: 'Both',
    taxmixShowPct: false,
    statesShowPct: false,
    showBothDetail: false,
    paretoYear: 2022,
    statesYear: 2022,
    deepDiveTax: null,
    selectedFederalGroups: {},
    selectedJurisdictions: {},
    allRows: [],
    metadata: null,
    colorMap: null
  },

  // =========================================================================
  // Initialization
  // =========================================================================

  init: function(selector) {
    var container = document.querySelector(selector);
    if (!container) {
      console.error('TaxMix: container not found:', selector);
      return;
    }

    var csvUrl = container.getAttribute('data-csv-url');
    if (!csvUrl) {
      container.innerHTML = '<p style="color:red;padding:20px">Error: data-csv-url attribute missing</p>';
      return;
    }

    container.innerHTML = '<p class="taxmix-loading">Loading data...</p>';
    var self = this;

    TaxMix.data.fetch(csvUrl, function(err, rows) {
      if (err) {
        container.innerHTML = '<p style="color:red;padding:20px">Error loading data: ' + err.message + '</p>';
        return;
      }

      // Process and store
      self.state.allRows = TaxMix.data.process(rows);
      self.state.metadata = TaxMix.data.buildMetadata(self.state.allRows);
      self.state.colorMap = TaxMix.data.buildColorMap(self.state.metadata);

      // Set defaults
      var years = self.state.metadata.years;
      var latestYear = years[years.length - 1].start;
      self.state.paretoYear = latestYear;
      self.state.statesYear = latestYear;

      // Default deep dive to largest state tax
      self.state.deepDiveTax = 'State/Territory/Local|' + (self.state.metadata.stateTaxes[0] || self.state.metadata.federalTaxes[0]);

      self.state.metadata.federalGroups.forEach(function(g) {
        self.state.selectedFederalGroups[g] = true;
      });
      self.state.metadata.jurisdictions.forEach(function(j) {
        self.state.selectedJurisdictions[j] = true;
      });

      // Build UI
      self.container = container;
      self.renderShell(container);
      self.renderFilters();
      self.renderMainArea();
      TaxMix.charts.updateAll(self.state);

      // Debounced resize
      var resizeTimer;
      window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
          TaxMix.charts.updateAll(self.state);
        }, 150);
      });
    });
  },

  // =========================================================================
  // Shell: Header + Tabs + Filter Container + Main Area
  // =========================================================================

  renderShell: function(container) {
    container.innerHTML = '';

    // Header
    var header = document.createElement('div');
    header.className = 'taxmix-header';
    var now = new Date();
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var dateStr = months[now.getMonth()] + ' ' + now.getFullYear();
    header.innerHTML =
      '<div class="taxmix-title">Australia\'s Tax Mix 1901\u20132023</div>' +
      '<div class="taxmix-subtitle">Nominal dollars ($\'000)</div>' +
      '<div class="taxmix-source">Source: Parliamentary Budget Office \u00B7 pbo.gov.au | @deadinlongrun.bsky.social | ' + dateStr + '</div>';
    container.appendChild(header);

    // Tabs
    var tabs = document.createElement('div');
    tabs.className = 'taxmix-tabs';
    tabs.id = 'taxmix-tabs';

    var tabDefs = [
      { id: 'overview', label: 'Overview' },
      { id: 'taxmix', label: 'Tax Mix' },
      { id: 'states', label: 'States' },
      { id: 'pareto', label: 'Pareto' },
      { id: 'deepdive', label: 'Deep Dive' }
    ];

    var self = this;
    tabDefs.forEach(function(t) {
      var btn = document.createElement('button');
      btn.className = 'taxmix-tab' + (t.id === self.state.view ? ' active' : '');
      btn.textContent = t.label;
      btn.setAttribute('data-view', t.id);
      btn.addEventListener('click', function() {
        self.state.view = t.id;
        self.updateTabs();
        self.renderFilters();
        self.renderMainArea();
        TaxMix.charts.updateAll(self.state);
      });
      tabs.appendChild(btn);
    });
    container.appendChild(tabs);

    // Filter bar
    var filters = document.createElement('div');
    filters.className = 'taxmix-filters';
    filters.id = 'taxmix-filters';
    container.appendChild(filters);

    // Main area
    var main = document.createElement('div');
    main.className = 'taxmix-main';
    main.id = 'taxmix-main';
    container.appendChild(main);
  },

  updateTabs: function() {
    var self = this;
    document.querySelectorAll('.taxmix-tab').forEach(function(tab) {
      tab.classList.toggle('active', tab.getAttribute('data-view') === self.state.view);
    });
  },

  // =========================================================================
  // Filters
  // =========================================================================

  renderFilters: function() {
    var el = document.getElementById('taxmix-filters');
    if (!el) return;
    el.innerHTML = '';
    var self = this;
    var view = this.state.view;

    // Government Level toggle (overview, taxmix, pareto)
    if (view === 'overview' || view === 'taxmix' || view === 'pareto') {
      var govGroup = this.createFilterGroup('Gov Level');
      [['Federal', 'Federal'], ['State', 'State'], ['Both', 'Federal and State']].forEach(function(pair) {
        var level = pair[0], label = pair[1];
        var btn = document.createElement('button');
        btn.className = 'taxmix-toggle-btn' + (self.state.govLevel === level ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', function() {
          self.state.govLevel = level;
          self.renderFilters();
          TaxMix.charts.updateAll(self.state);
        });
        govGroup.appendChild(btn);
      });
      el.appendChild(govGroup);
    }

    // Abs/% toggle (taxmix, states) — independent per view
    if (view === 'taxmix' || view === 'states') {
      var pctKey = view === 'taxmix' ? 'taxmixShowPct' : 'statesShowPct';
      var pctGroup = this.createFilterGroup('Display');
      ['Absolute ($)', 'Share (%)'].forEach(function(label, idx) {
        var btn = document.createElement('button');
        var isActive = (idx === 0 && !self.state[pctKey]) || (idx === 1 && self.state[pctKey]);
        btn.className = 'taxmix-toggle-btn' + (isActive ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', function() {
          self.state[pctKey] = idx === 1;
          self.renderFilters();
          TaxMix.charts.updateAll(self.state);
        });
        pctGroup.appendChild(btn);
      });
      el.appendChild(pctGroup);
    }

    // Detail toggle (taxmix when Both or Federal selected)
    if (view === 'taxmix' && (this.state.govLevel === 'Both' || this.state.govLevel === 'Federal')) {
      var detailGroup = this.createFilterGroup('Detail');
      ['Summary', 'Detail'].forEach(function(label, idx) {
        var btn = document.createElement('button');
        var isActive = (idx === 0 && !self.state.showBothDetail) || (idx === 1 && self.state.showBothDetail);
        btn.className = 'taxmix-toggle-btn' + (isActive ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', function() {
          self.state.showBothDetail = idx === 1;
          self.renderFilters();
          TaxMix.charts.updateAll(self.state);
        });
        detailGroup.appendChild(btn);
      });
      el.appendChild(detailGroup);
    }

    // Year slider (pareto)
    if (view === 'pareto') {
      var yearGroup = this.createFilterGroup('Year');
      var slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'taxmix-year-slider';
      slider.min = this.state.metadata.years[0].start;
      slider.max = this.state.metadata.years[this.state.metadata.years.length - 1].start;
      slider.value = this.state.paretoYear;

      var yearLabel = document.createElement('span');
      yearLabel.className = 'taxmix-year-label';
      var fy = this.state.metadata.years.find(function(y) { return y.start === self.state.paretoYear; });
      yearLabel.textContent = fy ? fy.fiscal : self.state.paretoYear;

      slider.addEventListener('input', function() {
        self.state.paretoYear = parseInt(slider.value);
        var fy = self.state.metadata.years.find(function(y) { return y.start === self.state.paretoYear; });
        yearLabel.textContent = fy ? fy.fiscal : self.state.paretoYear;
        TaxMix.charts.updateAll(self.state);
      });

      yearGroup.appendChild(slider);
      yearGroup.appendChild(yearLabel);
      el.appendChild(yearGroup);
    }

    // Year slider (states)
    if (view === 'states') {
      var stYearGroup = this.createFilterGroup('Year');
      var stSlider = document.createElement('input');
      stSlider.type = 'range';
      stSlider.className = 'taxmix-year-slider';
      stSlider.min = this.state.metadata.years[0].start;
      stSlider.max = this.state.metadata.years[this.state.metadata.years.length - 1].start;
      stSlider.value = this.state.statesYear;

      var stYearLabel = document.createElement('span');
      stYearLabel.className = 'taxmix-year-label';
      var stFy = this.state.metadata.years.find(function(y) { return y.start === self.state.statesYear; });
      stYearLabel.textContent = stFy ? stFy.fiscal : self.state.statesYear;

      stSlider.addEventListener('input', function() {
        self.state.statesYear = parseInt(stSlider.value);
        var fy = self.state.metadata.years.find(function(y) { return y.start === self.state.statesYear; });
        stYearLabel.textContent = fy ? fy.fiscal : self.state.statesYear;
        TaxMix.charts.updateAll(self.state);
      });

      stYearGroup.appendChild(stSlider);
      stYearGroup.appendChild(stYearLabel);
      el.appendChild(stYearGroup);
    }

    // Jurisdictions (deep dive only)
    if (view === 'deepdive') {
      var jurGroup = this.createFilterGroup('Jurisdictions');

      // Select all/none
      var allCb = document.createElement('input');
      allCb.type = 'checkbox';
      var total = this.state.metadata.jurisdictions.length;
      var selected = this.state.metadata.jurisdictions.filter(function(j) {
        return self.state.selectedJurisdictions[j];
      }).length;
      allCb.checked = selected === total;
      allCb.indeterminate = selected > 0 && selected < total;
      allCb.addEventListener('change', function() {
        self.state.metadata.jurisdictions.forEach(function(j) {
          self.state.selectedJurisdictions[j] = allCb.checked;
        });
        self.renderFilters();
        TaxMix.charts.updateAll(self.state);
      });

      var allLabel = document.createElement('label');
      allLabel.className = 'taxmix-filter-item taxmix-filter-all';
      allLabel.appendChild(allCb);
      allLabel.appendChild(document.createTextNode(' All'));
      jurGroup.appendChild(allLabel);

      this.state.metadata.jurisdictions.forEach(function(j) {
        var abbrev = TaxMix.data.JURISDICTION_ABBREV[j] || j;
        var item = self.createCheckbox(abbrev, self.state.selectedJurisdictions[j],
          self.state.colorMap[j], function(checked) {
            self.state.selectedJurisdictions[j] = checked;
            self.renderFilters();
            TaxMix.charts.updateAll(self.state);
          });
        jurGroup.appendChild(item);
      });
      el.appendChild(jurGroup);
    }

    // Tax dropdown (deep dive)
    if (view === 'deepdive') {
      var taxGroup = this.createFilterGroup('Tax');
      var select = document.createElement('select');
      select.className = 'taxmix-tax-select';

      var stateOptGroup = document.createElement('optgroup');
      stateOptGroup.label = 'State/Territory/Local';
      this.state.metadata.stateTaxes.forEach(function(t) {
        var val = 'State/Territory/Local|' + t;
        var opt = document.createElement('option');
        opt.value = val;
        opt.textContent = t;
        if (val === self.state.deepDiveTax) opt.selected = true;
        stateOptGroup.appendChild(opt);
      });
      select.appendChild(stateOptGroup);

      var fedOptGroup = document.createElement('optgroup');
      fedOptGroup.label = 'Australian Government';
      this.state.metadata.federalTaxes.forEach(function(t) {
        var val = 'Australian Government|' + t;
        var opt = document.createElement('option');
        opt.value = val;
        opt.textContent = t;
        if (val === self.state.deepDiveTax) opt.selected = true;
        fedOptGroup.appendChild(opt);
      });
      select.appendChild(fedOptGroup);

      select.addEventListener('change', function() {
        self.state.deepDiveTax = select.value;
        TaxMix.charts.updateAll(self.state);
      });

      taxGroup.appendChild(select);
      el.appendChild(taxGroup);
    }
  },

  // =========================================================================
  // Filter Helpers
  // =========================================================================

  createFilterGroup: function(label) {
    var group = document.createElement('div');
    group.className = 'taxmix-filter-group';
    var title = document.createElement('span');
    title.className = 'taxmix-filter-label';
    title.textContent = label + ':';
    group.appendChild(title);
    return group;
  },

  createCheckbox: function(label, checked, color, onChange) {
    var item = document.createElement('label');
    item.className = 'taxmix-filter-item';
    if (color) {
      var dot = document.createElement('span');
      dot.className = 'taxmix-color-dot';
      dot.style.backgroundColor = color;
      item.appendChild(dot);
    }
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.addEventListener('change', function() { onChange(cb.checked); });
    item.appendChild(cb);
    item.appendChild(document.createTextNode(' ' + label));
    return item;
  },

  // =========================================================================
  // Panel Titles & Subtitles
  // =========================================================================

  PANEL_TITLES: {
    taxmix: 'Tax Mix Over Time',
    states: 'State Comparison',
    pareto: 'Tax Pareto',
    deepdive: 'Deep Dive'
  },

  _govLevelLabel: function(level) {
    return level === 'Both' ? 'Federal and State' : level;
  },

  getSubtitle: function() {
    var state = this.state;
    var view = state.view;
    var line1 = '';

    switch (view) {
      case 'taxmix':
        line1 = this._govLevelLabel(state.govLevel);
        line1 += ' \u00B7 ' + (state.taxmixShowPct ? 'Share (%)' : 'Absolute ($)');
        if (state.govLevel !== 'State' && state.showBothDetail) line1 += ' \u00B7 Detail';
        break;
      case 'states':
        var stFy = state.metadata.years.find(function(y) { return y.start === state.statesYear; });
        line1 = (stFy ? stFy.fiscal : state.statesYear);
        line1 += ' \u00B7 ' + (state.statesShowPct ? 'Share (%)' : 'Absolute ($)');
        break;
      case 'pareto':
        var pFy = state.metadata.years.find(function(y) { return y.start === state.paretoYear; });
        line1 = (pFy ? pFy.fiscal : state.paretoYear) + ' \u00B7 ' + this._govLevelLabel(state.govLevel);
        break;
      case 'deepdive':
        var parts = (state.deepDiveTax || '').split('|');
        var govLabel = parts[0] || '';
        var taxName = parts[1] || '';
        line1 = taxName + ' \u00B7 ' + govLabel;
        var jurSummary = this._filterSummary(
          state.selectedJurisdictions,
          state.metadata.jurisdictions,
          'Jurisdictions'
        );
        line1 += '<br>' + jurSummary;
        break;
    }

    return line1;
  },

  updateSubtitle: function() {
    var el = document.getElementById('taxmix-subtitle');
    if (!el) return;
    el.innerHTML = this.getSubtitle();
  },

  _filterSummary: function(selected, options, label) {
    var names = options.filter(function(o) { return selected[o]; });
    var count = names.length;
    if (count === options.length) return label + ': All';
    if (count === 0) return label + ': None';
    var shown = names.map(function(j) {
      return TaxMix.data.JURISDICTION_ABBREV[j] || j;
    }).slice(0, 4).join(', ');
    if (names.length > 4) shown += ' etc.';
    return label + ': ' + shown + ' (' + count + ' of ' + options.length + ')';
  },

  // =========================================================================
  // Overview Panel Controls
  // =========================================================================

  _buildSelect: function(options, currentValue, onChange) {
    var sel = document.createElement('select');
    options.forEach(function(opt) {
      var o = document.createElement('option');
      if (typeof opt === 'object') {
        o.value = opt.v;
        o.textContent = opt.l;
        if (opt.v == currentValue) o.selected = true;
      } else {
        o.value = opt;
        o.textContent = opt;
        if (opt == currentValue) o.selected = true;
      }
      sel.appendChild(o);
    });
    sel.addEventListener('change', function(e) {
      e.stopPropagation();
      onChange(sel.value);
    });
    return sel;
  },

  _addOverviewControls: function(panelId, container) {
    var self = this;
    var state = this.state;

    if (panelId === 'taxmix') {
      var govSel = this._buildSelect(
        [{ v: 'Federal', l: 'Federal' }, { v: 'State', l: 'State' }, { v: 'Both', l: 'Fed & State' }],
        state.govLevel,
        function(val) {
          state.govLevel = val;
          self.renderFilters();
          TaxMix.charts.updateAll(state);
        }
      );
      container.appendChild(govSel);

      var pctBtn = document.createElement('button');
      pctBtn.textContent = state.taxmixShowPct ? '$' : '%';
      pctBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        state.taxmixShowPct = !state.taxmixShowPct;
        pctBtn.textContent = state.taxmixShowPct ? '$' : '%';
        self.renderFilters();
        TaxMix.charts.updateAll(state);
      });
      container.appendChild(pctBtn);
    }

    if (panelId === 'states') {
      var years = state.metadata.years.map(function(y) {
        return { v: y.start, l: y.fiscal };
      });
      var yearSel = this._buildSelect(years, state.statesYear, function(val) {
        state.statesYear = parseInt(val);
        TaxMix.charts.updateAll(state);
      });
      container.appendChild(yearSel);

      var pctBtn2 = document.createElement('button');
      pctBtn2.textContent = state.statesShowPct ? '$' : '%';
      pctBtn2.addEventListener('click', function(e) {
        e.stopPropagation();
        state.statesShowPct = !state.statesShowPct;
        pctBtn2.textContent = state.statesShowPct ? '$' : '%';
        self.renderFilters();
        TaxMix.charts.updateAll(state);
      });
      container.appendChild(pctBtn2);
    }

    if (panelId === 'pareto') {
      var pYears = state.metadata.years.map(function(y) {
        return { v: y.start, l: y.fiscal };
      });
      var pYearSel = this._buildSelect(pYears, state.paretoYear, function(val) {
        state.paretoYear = parseInt(val);
        TaxMix.charts.updateAll(state);
      });
      container.appendChild(pYearSel);
    }

    if (panelId === 'deepdive') {
      var taxOpts = [];
      state.metadata.stateTaxes.forEach(function(t) {
        var val = 'State/Territory/Local|' + t;
        var label = t.length > 20 ? t.substring(0, 18) + '...' : t;
        taxOpts.push({ v: val, l: label });
      });
      state.metadata.federalTaxes.forEach(function(t) {
        var val = 'Australian Government|' + t;
        var label = t.length > 20 ? t.substring(0, 18) + '...' : t;
        taxOpts.push({ v: val, l: label });
      });
      var taxSel = this._buildSelect(taxOpts, state.deepDiveTax, function(val) {
        state.deepDiveTax = val;
        TaxMix.charts.updateAll(state);
      });
      container.appendChild(taxSel);
    }
  },

  // =========================================================================
  // Main Area: Overview Grid or Detail Panel
  // =========================================================================

  renderMainArea: function() {
    var main = document.getElementById('taxmix-main');
    if (!main) return;
    main.innerHTML = '';
    var self = this;

    if (this.state.view === 'overview') {
      var grid = document.createElement('div');
      grid.className = 'taxmix-grid';

      var panels = [
        { id: 'taxmix', label: 'Tax Mix Over Time' },
        { id: 'states', label: 'State Comparison' },
        { id: 'pareto', label: 'Tax Pareto' },
        { id: 'deepdive', label: 'Deep Dive' }
      ];

      panels.forEach(function(p) {
        var panel = document.createElement('div');
        panel.className = 'taxmix-panel taxmix-panel-overview';
        panel.addEventListener('click', function(e) {
          // Don't drill down if user clicked a control
          if (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
          self.state.view = p.id;
          self.updateTabs();
          self.renderFilters();
          self.renderMainArea();
          TaxMix.charts.updateAll(self.state);
        });

        // Panel header with title + controls
        var header = document.createElement('div');
        header.className = 'taxmix-panel-header';

        var title = document.createElement('h3');
        title.textContent = self.PANEL_TITLES[p.id];
        header.appendChild(title);

        var controls = document.createElement('div');
        controls.className = 'taxmix-panel-controls';
        self._addOverviewControls(p.id, controls);
        header.appendChild(controls);

        panel.appendChild(header);

        var chart = document.createElement('div');
        chart.className = 'taxmix-panel-chart';
        chart.id = 'taxmix-overview-' + p.id;
        panel.appendChild(chart);
        grid.appendChild(panel);
      });

      main.appendChild(grid);
    } else {
      // Detail view
      var panel = document.createElement('div');
      panel.className = 'taxmix-panel taxmix-panel-detail';

      var header = document.createElement('div');
      header.className = 'taxmix-panel-header';

      var titleBlock = document.createElement('div');
      titleBlock.className = 'taxmix-panel-title-block';

      var title = document.createElement('h3');
      title.textContent = this.PANEL_TITLES[this.state.view] || '';
      titleBlock.appendChild(title);

      var subtitle = document.createElement('div');
      subtitle.className = 'taxmix-panel-subtitle';
      subtitle.id = 'taxmix-subtitle';
      titleBlock.appendChild(subtitle);

      header.appendChild(titleBlock);
      panel.appendChild(header);

      var chart = document.createElement('div');
      chart.className = 'taxmix-panel-chart';
      chart.id = 'taxmix-detail-chart';
      panel.appendChild(chart);

      var footer = document.createElement('div');
      footer.className = 'taxmix-panel-footer';
      var now2 = new Date();
      var months2 = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      var dateStr2 = months2[now2.getMonth()] + ' ' + now2.getFullYear();
      footer.textContent = 'Source: Parliamentary Budget Office \u00B7 pbo.gov.au | @deadinlongrun.bsky.social | ' + dateStr2;
      panel.appendChild(footer);

      main.appendChild(panel);
    }
  }
};

// Public init entry point
TaxMix.init = function(selector) {
  TaxMix.controls.init(selector);
};
