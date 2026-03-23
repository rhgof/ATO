/* =============================================================================
   TaxMix — Charts Layer
   Trace builders for each panel, layout construction, value formatting
   ============================================================================= */

window.TaxMix = window.TaxMix || {};

TaxMix.charts = {

  // -- Value Formatting -----------------------------------------------------

  formatValue: function(v) {
    if (v === null || v === undefined || isNaN(v)) return 'N/A';
    var neg = v < 0;
    var abs = Math.abs(v);
    var formatted;
    if (abs >= 1e9) formatted = '$' + (abs / 1e9).toFixed(1) + 'B';
    else if (abs >= 1e6) formatted = '$' + (abs / 1e6).toFixed(1) + 'M';
    else if (abs >= 1e3) formatted = '$' + (abs / 1e3).toFixed(0) + 'K';
    else formatted = '$' + abs.toFixed(0);
    return neg ? '-' + formatted : formatted;
  },

  // -- Layout Helpers -------------------------------------------------------

  baseLayout: function(opts) {
    return {
      margin: { t: opts.title ? 35 : 10, r: opts.rightAxis ? 60 : 20, b: 50, l: 70 },
      hovermode: 'closest',
      showlegend: opts.showLegend !== false,
      legend: { orientation: 'h', y: -0.15, font: { size: 11 } },
      xaxis: {
        title: { text: opts.xTitle || '', automargin: true },
        automargin: true
      },
      yaxis: {
        title: { text: opts.yTitle || '', automargin: true },
        automargin: true
      }
    };
  },

  render: function(divId, traces, layout) {
    var div = document.getElementById(divId);
    if (!div) return;
    Plotly.react(div, traces, layout, { responsive: true, displayModeBar: false })
      .then(function() {
        setTimeout(function() { Plotly.Plots.resize(div); }, 0);
      });
  },

  renderDetail: function(divId, traces, layout) {
    var div = document.getElementById(divId);
    if (!div) return;
    Plotly.react(div, traces, layout, { responsive: true })
      .then(function() {
        setTimeout(function() { Plotly.Plots.resize(div); }, 0);
      });
  },

  // =========================================================================
  // Panel 1: Tax Mix Over Time (Stacked Area)
  // =========================================================================

  buildTaxMix: function(state) {
    var govLevel = state.govLevel;
    var rows = state.allRows;
    var colorMap = state.colorMap;
    var years = state.metadata.years.map(function(y) { return y.start; });

    if (govLevel === 'Both') {
      // Two layers: Federal total, State total
      var fedByYear = {};
      var stateByYear = {};
      years.forEach(function(y) { fedByYear[y] = 0; stateByYear[y] = 0; });

      rows.forEach(function(r) {
        if (r.ValueDollars === null) return;
        if (r.GovernmentLevel === 'Australian Government' && r.FederalGroup) {
          fedByYear[r.YearStart] = (fedByYear[r.YearStart] || 0) + r.ValueDollars;
        } else if (r.GovernmentLevel === 'State/Territory/Local') {
          // Include ALL state taxes (even defunct) for accurate totals
          stateByYear[r.YearStart] = (stateByYear[r.YearStart] || 0) + r.ValueDollars;
        }
      });

      return [
        {
          x: years, y: years.map(function(y) { return stateByYear[y] || 0; }),
          name: 'State', stackgroup: 'one', fillcolor: colorMap['State'],
          line: { color: colorMap['State'], width: 0.5 },
          hovertemplate: 'State<br>%{x}<br>%{customdata}<extra></extra>',
          customdata: years.map(function(y) { return TaxMix.charts.formatValue(stateByYear[y]); })
        },
        {
          x: years, y: years.map(function(y) { return fedByYear[y] || 0; }),
          name: 'Federal', stackgroup: 'one', fillcolor: colorMap['Federal'],
          line: { color: colorMap['Federal'], width: 0.5 },
          hovertemplate: 'Federal<br>%{x}<br>%{customdata}<extra></extra>',
          customdata: years.map(function(y) { return TaxMix.charts.formatValue(fedByYear[y]); })
        }
      ];
    }

    // Federal or State mode: stack by category
    var categories, getCategory, filterFn;
    if (govLevel === 'Federal') {
      categories = state.metadata.federalGroups.filter(function(g) {
        return state.selectedFederalGroups[g];
      });
      getCategory = function(r) { return r.FederalGroup; };
      filterFn = function(r) {
        return r.GovernmentLevel === 'Australian Government' && r.FederalGroup
          && state.selectedFederalGroups[r.FederalGroup];
      };
    } else {
      // State mode: exclude defunct taxes from stacked view
      categories = state.metadata.stateTaxes.filter(function(t) {
        return TaxMix.data.DEFUNCT_STATE_TAXES.indexOf(t) === -1;
      });
      getCategory = function(r) { return r.TaxName; };
      filterFn = function(r) {
        return r.GovernmentLevel === 'State/Territory/Local' && !r.IsDefunct;
      };
    }

    // Aggregate by category and year
    var byCatYear = {};
    categories.forEach(function(c) { byCatYear[c] = {}; });
    rows.forEach(function(r) {
      if (!filterFn(r) || r.ValueDollars === null) return;
      var cat = getCategory(r);
      if (!byCatYear[cat]) return;
      byCatYear[cat][r.YearStart] = (byCatYear[cat][r.YearStart] || 0) + r.ValueDollars;
    });

    // Sort categories by total (largest at bottom = first trace)
    categories.sort(function(a, b) {
      var totalA = 0, totalB = 0;
      years.forEach(function(y) {
        totalA += byCatYear[a][y] || 0;
        totalB += byCatYear[b][y] || 0;
      });
      return totalB - totalA;
    });

    return categories.map(function(cat) {
      var vals = years.map(function(y) { return byCatYear[cat][y] || 0; });
      return {
        x: years, y: vals, name: cat, stackgroup: 'one',
        fillcolor: colorMap[cat],
        line: { color: colorMap[cat], width: 0.5 },
        hovertemplate: cat + '<br>%{x}<br>%{customdata}<extra></extra>',
        customdata: vals.map(function(v) { return TaxMix.charts.formatValue(v); })
      };
    });
  },

  updateTaxMix: function(state, divId, isOverview) {
    var traces = this.buildTaxMix(state);
    var layout = this.baseLayout({
      xTitle: 'Year', yTitle: 'Revenue',
      showLegend: !isOverview, title: isOverview
    });
    if (isOverview) layout.title = { text: 'Tax Mix Over Time', font: { size: 13 } };
    if (isOverview) this.render(divId, traces, layout);
    else this.renderDetail(divId, traces, layout);
  },

  // =========================================================================
  // Panel 2: Federal vs State Share (Stacked Area / %)
  // =========================================================================

  buildFedState: function(state) {
    var rows = state.allRows;
    var years = state.metadata.years.map(function(y) { return y.start; });
    var showPct = state.showPercentage;
    var colorMap = state.colorMap;

    var fedByYear = {};
    var stateByYear = {};
    years.forEach(function(y) { fedByYear[y] = 0; stateByYear[y] = 0; });

    // Include ALL taxes (including defunct) for accurate historical totals
    rows.forEach(function(r) {
      if (r.ValueDollars === null) return;
      if (r.GovernmentLevel === 'Australian Government' && r.FederalGroup) {
        fedByYear[r.YearStart] = (fedByYear[r.YearStart] || 0) + r.ValueDollars;
      } else if (r.GovernmentLevel === 'State/Territory/Local') {
        stateByYear[r.YearStart] = (stateByYear[r.YearStart] || 0) + r.ValueDollars;
      }
    });

    var fmt = TaxMix.charts.formatValue;

    if (showPct) {
      return [
        {
          x: years,
          y: years.map(function(y) {
            var total = fedByYear[y] + stateByYear[y];
            return total > 0 ? (stateByYear[y] / total * 100) : 0;
          }),
          name: 'State', stackgroup: 'one',
          fillcolor: colorMap['State'], line: { color: colorMap['State'], width: 0.5 },
          customdata: years.map(function(y) {
            var total = fedByYear[y] + stateByYear[y];
            var pct = total > 0 ? (stateByYear[y] / total * 100) : 0;
            return fmt(stateByYear[y]) + ' (' + pct.toFixed(1) + '%)';
          }),
          hovertemplate: 'State<br>%{x}<br>%{customdata}<extra></extra>'
        },
        {
          x: years,
          y: years.map(function(y) {
            var total = fedByYear[y] + stateByYear[y];
            return total > 0 ? (fedByYear[y] / total * 100) : 0;
          }),
          name: 'Federal', stackgroup: 'one',
          fillcolor: colorMap['Federal'], line: { color: colorMap['Federal'], width: 0.5 },
          customdata: years.map(function(y) {
            var total = fedByYear[y] + stateByYear[y];
            var pct = total > 0 ? (fedByYear[y] / total * 100) : 0;
            return fmt(fedByYear[y]) + ' (' + pct.toFixed(1) + '%)';
          }),
          hovertemplate: 'Federal<br>%{x}<br>%{customdata}<extra></extra>'
        }
      ];
    }

    // Absolute mode — show both value and percentage in tooltip
    return [
      {
        x: years,
        y: years.map(function(y) { return stateByYear[y]; }),
        name: 'State', stackgroup: 'one',
        fillcolor: colorMap['State'], line: { color: colorMap['State'], width: 0.5 },
        customdata: years.map(function(y) {
          var total = fedByYear[y] + stateByYear[y];
          var pct = total > 0 ? (stateByYear[y] / total * 100) : 0;
          return fmt(stateByYear[y]) + ' (' + pct.toFixed(1) + '%)';
        }),
        hovertemplate: 'State<br>%{x}<br>%{customdata}<extra></extra>'
      },
      {
        x: years,
        y: years.map(function(y) { return fedByYear[y]; }),
        name: 'Federal', stackgroup: 'one',
        fillcolor: colorMap['Federal'], line: { color: colorMap['Federal'], width: 0.5 },
        customdata: years.map(function(y) {
          var total = fedByYear[y] + stateByYear[y];
          var pct = total > 0 ? (fedByYear[y] / total * 100) : 0;
          return fmt(fedByYear[y]) + ' (' + pct.toFixed(1) + '%)';
        }),
        hovertemplate: 'Federal<br>%{x}<br>%{customdata}<extra></extra>'
      }
    ];
  },

  updateFedState: function(state, divId, isOverview) {
    var traces = this.buildFedState(state);
    var layout = this.baseLayout({
      xTitle: 'Year', yTitle: state.showPercentage ? 'Share (%)' : 'Revenue',
      showLegend: !isOverview, title: isOverview
    });
    if (isOverview) layout.title = { text: 'Federal vs State', font: { size: 13 } };
    if (state.showPercentage) {
      layout.yaxis.range = [0, 100];
      layout.yaxis.ticksuffix = '%';
    }
    if (isOverview) this.render(divId, traces, layout);
    else this.renderDetail(divId, traces, layout);
  },

  // =========================================================================
  // Panel 3: Tax Pareto (Bar + Cumulative Line)
  // =========================================================================

  buildPareto: function(state) {
    var yearStart = state.paretoYear;
    var govLevel = state.govLevel;
    var rows = state.allRows;
    var colorMap = state.colorMap;

    // Aggregate: federal as-is, state summed across jurisdictions
    var taxTotals = {};
    rows.forEach(function(r) {
      if (r.YearStart !== yearStart || r.ValueDollars === null) return;
      if (r.IsDefunct) return;

      var include = false;
      if (govLevel === 'Both') include = true;
      else if (govLevel === 'Federal' && r.GovernmentLevel === 'Australian Government') include = true;
      else if (govLevel === 'State' && r.GovernmentLevel === 'State/Territory/Local') include = true;

      if (!include) return;
      if (r.GovernmentLevel === 'Australian Government' && !r.FederalGroup) return;

      var key = r.DisplayName;
      if (!taxTotals[key]) taxTotals[key] = { name: key, value: 0 };
      taxTotals[key].value += r.ValueDollars;
    });

    // Sort descending, exclude negatives/zero
    var sorted = Object.values(taxTotals)
      .filter(function(t) { return t.value > 0; })
      .sort(function(a, b) { return b.value - a.value; });

    var grandTotal = sorted.reduce(function(s, t) { return s + t.value; }, 0);
    var cumPct = 0;
    var names = [], values = [], cumPcts = [], colors = [], customdata = [];

    sorted.forEach(function(t) {
      names.push(t.name);
      values.push(t.value);
      var pct = grandTotal > 0 ? (t.value / grandTotal * 100) : 0;
      cumPct += pct;
      cumPcts.push(cumPct);
      colors.push(colorMap[t.name] || '#999');
      customdata.push(
        TaxMix.charts.formatValue(t.value) + '<br>' +
        pct.toFixed(1) + '% of total<br>' +
        'Cumulative: ' + cumPct.toFixed(1) + '%'
      );
    });

    var barTrace = {
      x: names, y: values, type: 'bar', name: 'Revenue',
      marker: { color: colors },
      customdata: customdata,
      hovertemplate: '<b>%{x}</b><br>%{customdata}<extra></extra>'
    };

    var lineTrace = {
      x: names, y: cumPcts, type: 'scatter', mode: 'lines+markers',
      name: 'Cumulative %', yaxis: 'y2',
      line: { color: '#333', width: 2 },
      marker: { size: 4, color: '#333' },
      hovertemplate: '%{x}<br>Cumulative: %{y:.1f}%<extra></extra>'
    };

    return [barTrace, lineTrace];
  },

  updatePareto: function(state, divId, isOverview) {
    var traces = this.buildPareto(state);
    var fiscalYear = state.metadata.years.find(function(y) {
      return y.start === state.paretoYear;
    });
    var yearLabel = fiscalYear ? fiscalYear.fiscal : state.paretoYear;

    var layout = this.baseLayout({
      xTitle: '', yTitle: 'Revenue',
      showLegend: false, rightAxis: true, title: isOverview
    });
    if (isOverview) layout.title = { text: 'Tax Pareto (' + yearLabel + ')', font: { size: 13 } };
    layout.yaxis2 = {
      title: { text: 'Cumulative %', automargin: true },
      overlaying: 'y', side: 'right', range: [0, 105],
      showgrid: false, ticksuffix: '%'
    };

    if (isOverview) {
      layout.xaxis.showticklabels = false;
      layout.margin.b = 20;
      this.render(divId, traces, layout);
    } else {
      layout.xaxis.tickangle = -45;
      layout.margin.b = 140;
      this.renderDetail(divId, traces, layout);
    }
  },

  // =========================================================================
  // Panel 4: Deep Dive (Multi-line)
  // =========================================================================

  buildDeepDive: function(state) {
    var taxName = state.deepDiveTax;
    var rows = state.allRows;
    var colorMap = state.colorMap;
    var years = state.metadata.years.map(function(y) { return y.start; });
    var fmt = TaxMix.charts.formatValue;

    var taxRows = rows.filter(function(r) { return r.TaxName === taxName; });
    if (taxRows.length === 0) return [];

    var isFederal = taxRows[0].GovernmentLevel === 'Australian Government';

    if (isFederal) {
      var byYear = {};
      taxRows.forEach(function(r) {
        if (r.ValueDollars !== null) byYear[r.YearStart] = r.ValueDollars;
      });
      return [{
        x: years,
        y: years.map(function(y) { return byYear[y] !== undefined ? byYear[y] : null; }),
        name: taxName, mode: 'lines',
        line: { color: colorMap[taxName] || '#1f77b4', width: 2 },
        connectgaps: false,
        customdata: years.map(function(y) { return fmt(byYear[y]); }),
        hovertemplate: taxName + '<br>%{x}<br>%{customdata}<extra></extra>'
      }];
    }

    // State tax: one line per selected jurisdiction
    var jurisdictions = state.metadata.jurisdictions.filter(function(j) {
      return state.selectedJurisdictions[j];
    });

    var byJurYear = {};
    jurisdictions.forEach(function(j) { byJurYear[j] = {}; });
    taxRows.forEach(function(r) {
      if (byJurYear[r.Jurisdiction] && r.ValueDollars !== null) {
        byJurYear[r.Jurisdiction][r.YearStart] = r.ValueDollars;
      }
    });

    return jurisdictions.map(function(j) {
      var abbrev = TaxMix.data.JURISDICTION_ABBREV[j] || j;
      return {
        x: years,
        y: years.map(function(y) { return byJurYear[j][y] !== undefined ? byJurYear[j][y] : null; }),
        name: abbrev, mode: 'lines',
        line: { color: colorMap[j], width: 2 },
        connectgaps: false,
        customdata: years.map(function(y) { return fmt(byJurYear[j][y]); }),
        hovertemplate: abbrev + '<br>%{x}<br>%{customdata}<extra></extra>'
      };
    });
  },

  updateDeepDive: function(state, divId, isOverview) {
    var traces = this.buildDeepDive(state);
    var layout = this.baseLayout({
      xTitle: 'Year', yTitle: 'Revenue',
      showLegend: !isOverview, title: isOverview
    });
    if (isOverview) {
      var label = state.deepDiveTax || '';
      if (label.length > 25) label = label.substring(0, 22) + '...';
      layout.title = { text: label, font: { size: 13 } };
    }
    if (isOverview) this.render(divId, traces, layout);
    else this.renderDetail(divId, traces, layout);
  },

  // =========================================================================
  // Master Update
  // =========================================================================

  updatePanel: function(panelId, state, isOverview) {
    var divId = isOverview ? 'taxmix-overview-' + panelId : 'taxmix-detail-chart';
    switch (panelId) {
      case 'taxmix': this.updateTaxMix(state, divId, isOverview); break;
      case 'fedstate': this.updateFedState(state, divId, isOverview); break;
      case 'pareto': this.updatePareto(state, divId, isOverview); break;
      case 'deepdive': this.updateDeepDive(state, divId, isOverview); break;
    }
  },

  updateAll: function(state) {
    if (state.view === 'overview') {
      var self = this;
      ['taxmix', 'fedstate', 'pareto', 'deepdive'].forEach(function(id) {
        self.updatePanel(id, state, true);
      });
    } else {
      this.updatePanel(state.view, state, false);
    }
  }
};
