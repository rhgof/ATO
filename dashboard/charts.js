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
      legend: { orientation: 'h', y: -0.15, xanchor: 'left', x: 0, font: { size: 11 } },
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
    var showPct = state.taxmixShowPct;
    var showDetail = state.showBothDetail;
    var years = state.metadata.years.map(function(y) { return y.start; });
    var fmt = TaxMix.charts.formatValue;

    var categories, getCategory, filterFn;

    if (govLevel === 'Both' && !showDetail) {
      // Summary: two layers — Federal total, State total
      var fedByYear = {};
      var stateByYear = {};
      years.forEach(function(y) { fedByYear[y] = 0; stateByYear[y] = 0; });

      rows.forEach(function(r) {
        if (r.ValueDollars === null) return;
        if (r.GovernmentLevel === 'Australian Government' && r.FederalGroup) {
          fedByYear[r.YearStart] = (fedByYear[r.YearStart] || 0) + r.ValueDollars;
        } else if (r.GovernmentLevel === 'State/Territory/Local') {
          stateByYear[r.YearStart] = (stateByYear[r.YearStart] || 0) + r.ValueDollars;
        }
      });

      if (showPct) {
        return [
          {
            x: years,
            y: years.map(function(y) {
              var total = fedByYear[y] + stateByYear[y];
              return total > 0 ? (fedByYear[y] / total * 100) : 0;
            }),
            name: 'Federal', stackgroup: 'one', fillcolor: colorMap['Federal'],
            line: { color: colorMap['Federal'], width: 0.5 },
            customdata: years.map(function(y) {
              var total = fedByYear[y] + stateByYear[y];
              var pct = total > 0 ? (fedByYear[y] / total * 100) : 0;
              return fmt(fedByYear[y]) + ' (' + pct.toFixed(1) + '%)';
            }),
            hovertemplate: 'Federal<br>%{x}<br>%{customdata}<extra></extra>'
          },
          {
            x: years,
            y: years.map(function(y) {
              var total = fedByYear[y] + stateByYear[y];
              return total > 0 ? (stateByYear[y] / total * 100) : 0;
            }),
            name: 'State', stackgroup: 'one', fillcolor: colorMap['State'],
            line: { color: colorMap['State'], width: 0.5 },
            customdata: years.map(function(y) {
              var total = fedByYear[y] + stateByYear[y];
              var pct = total > 0 ? (stateByYear[y] / total * 100) : 0;
              return fmt(stateByYear[y]) + ' (' + pct.toFixed(1) + '%)';
            }),
            hovertemplate: 'State<br>%{x}<br>%{customdata}<extra></extra>'
          }
        ];
      }

      return [
        {
          x: years, y: years.map(function(y) { return fedByYear[y] || 0; }),
          name: 'Federal', stackgroup: 'one', fillcolor: colorMap['Federal'],
          line: { color: colorMap['Federal'], width: 0.5 },
          customdata: years.map(function(y) {
            var total = fedByYear[y] + stateByYear[y];
            var pct = total > 0 ? (fedByYear[y] / total * 100) : 0;
            return fmt(fedByYear[y]) + ' (' + pct.toFixed(1) + '%)';
          }),
          hovertemplate: 'Federal<br>%{x}<br>%{customdata}<extra></extra>'
        },
        {
          x: years, y: years.map(function(y) { return stateByYear[y] || 0; }),
          name: 'State', stackgroup: 'one', fillcolor: colorMap['State'],
          line: { color: colorMap['State'], width: 0.5 },
          customdata: years.map(function(y) {
            var total = fedByYear[y] + stateByYear[y];
            var pct = total > 0 ? (stateByYear[y] / total * 100) : 0;
            return fmt(stateByYear[y]) + ' (' + pct.toFixed(1) + '%)';
          }),
          hovertemplate: 'State<br>%{x}<br>%{customdata}<extra></extra>'
        }
      ];
    }

    if (govLevel === 'Both' && showDetail) {
      // Detail: all individual taxes, State first then Federal
      var stateCategories = state.metadata.stateTaxes.filter(function(t) {
        return TaxMix.data.DEFUNCT_STATE_TAXES.indexOf(t) === -1;
      });
      var fedCategories = state.metadata.federalTaxes.slice();

      // Build aggregates: state taxes summed across jurisdictions, federal by individual tax
      var stateByCatYear = {};
      stateCategories.forEach(function(c) { stateByCatYear[c] = {}; });
      var fedByCatYear = {};
      fedCategories.forEach(function(c) { fedByCatYear[c] = {}; });

      rows.forEach(function(r) {
        if (r.ValueDollars === null) return;
        if (r.GovernmentLevel === 'State/Territory/Local' && !r.IsDefunct && stateByCatYear[r.TaxName]) {
          stateByCatYear[r.TaxName][r.YearStart] = (stateByCatYear[r.TaxName][r.YearStart] || 0) + r.ValueDollars;
        } else if (r.GovernmentLevel === 'Australian Government' && r.FederalGroup && fedByCatYear[r.TaxName] !== undefined) {
          fedByCatYear[r.TaxName][r.YearStart] = (fedByCatYear[r.TaxName][r.YearStart] || 0) + r.ValueDollars;
        }
      });

      // Sort each group by total descending
      var sortByTotal = function(cats, byCatYear) {
        return cats.slice().sort(function(a, b) {
          var totalA = 0, totalB = 0;
          years.forEach(function(y) { totalA += byCatYear[a][y] || 0; totalB += byCatYear[b][y] || 0; });
          return totalB - totalA;
        });
      };

      stateCategories = sortByTotal(stateCategories, stateByCatYear);
      fedCategories = sortByTotal(fedCategories, fedByCatYear);

      // Compute year totals for percentage mode
      var yearTotals = {};
      if (showPct) {
        years.forEach(function(y) {
          var total = 0;
          stateCategories.forEach(function(c) { total += stateByCatYear[c][y] || 0; });
          fedCategories.forEach(function(c) { total += fedByCatYear[c][y] || 0; });
          yearTotals[y] = total;
        });
      }

      var traces = [];

      // Federal traces first (bottom of stack)
      fedCategories.forEach(function(cat) {
        var vals = years.map(function(y) {
          var v = fedByCatYear[cat][y] || 0;
          return showPct && yearTotals[y] > 0 ? (v / yearTotals[y] * 100) : v;
        });
        traces.push({
          x: years, y: vals, name: cat + ' (Federal)', stackgroup: 'one',
          fillcolor: colorMap[cat], line: { color: colorMap[cat], width: 0.5 },
          customdata: years.map(function(y) { return fmt(fedByCatYear[cat][y] || 0); }),
          hovertemplate: cat + ' (Federal)<br>%{x}<br>%{customdata}<extra></extra>'
        });
      });

      // State traces on top
      stateCategories.forEach(function(cat) {
        var vals = years.map(function(y) {
          var v = stateByCatYear[cat][y] || 0;
          return showPct && yearTotals[y] > 0 ? (v / yearTotals[y] * 100) : v;
        });
        traces.push({
          x: years, y: vals, name: cat + ' (State)', stackgroup: 'one',
          fillcolor: colorMap[cat], line: { color: colorMap[cat], width: 0.5 },
          customdata: years.map(function(y) { return fmt(stateByCatYear[cat][y] || 0); }),
          hovertemplate: cat + ' (State)<br>%{x}<br>%{customdata}<extra></extra>'
        });
      });

      return traces;
    }

    // Federal or State mode: stack by category
    if (govLevel === 'Federal' && showDetail) {
      // Detail: individual federal taxes
      categories = state.metadata.federalTaxes.slice();
      getCategory = function(r) { return r.TaxName; };
      filterFn = function(r) {
        return r.GovernmentLevel === 'Australian Government' && r.FederalGroup
          && state.selectedFederalGroups[r.FederalGroup];
      };
    } else if (govLevel === 'Federal') {
      categories = state.metadata.federalGroups.filter(function(g) {
        return state.selectedFederalGroups[g];
      });
      getCategory = function(r) { return r.FederalGroup; };
      filterFn = function(r) {
        return r.GovernmentLevel === 'Australian Government' && r.FederalGroup
          && state.selectedFederalGroups[r.FederalGroup];
      };
    } else {
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

    // Compute year totals for percentage mode
    var yearTotals2 = {};
    if (showPct) {
      years.forEach(function(y) {
        var total = 0;
        categories.forEach(function(c) { total += byCatYear[c][y] || 0; });
        yearTotals2[y] = total;
      });
    }

    return categories.map(function(cat) {
      var vals = years.map(function(y) {
        var v = byCatYear[cat][y] || 0;
        return showPct && yearTotals2[y] > 0 ? (v / yearTotals2[y] * 100) : v;
      });
      return {
        x: years, y: vals, name: cat, stackgroup: 'one',
        fillcolor: colorMap[cat],
        line: { color: colorMap[cat], width: 0.5 },
        customdata: years.map(function(y) { return fmt(byCatYear[cat][y] || 0); }),
        hovertemplate: cat + '<br>%{x}<br>%{customdata}<extra></extra>'
      };
    });
  },

  updateTaxMix: function(state, divId, isOverview) {
    var traces = this.buildTaxMix(state);
    var yTitle = state.taxmixShowPct ? 'Share (%)' : 'Revenue';
    var layout = this.baseLayout({
      xTitle: 'Year', yTitle: yTitle,
      showLegend: !isOverview, title: isOverview
    });
    if (isOverview) layout.title = '';
    if (state.taxmixShowPct) {
      layout.yaxis.range = [0, 100];
      layout.yaxis.ticksuffix = '%';
    }
    if (isOverview) this.render(divId, traces, layout);
    else this.renderDetail(divId, traces, layout);
  },

  // =========================================================================
  // Panel 2: State Comparison (Stacked Bar)
  // =========================================================================

  buildStateComparison: function(state) {
    var yearStart = state.statesYear;
    var showPct = state.statesShowPct;
    var rows = state.allRows;
    var colorMap = state.colorMap;
    var fmt = TaxMix.charts.formatValue;

    var jurisdictions = state.metadata.jurisdictions;

    // Always show state tax categories by jurisdiction
    var categories = state.metadata.stateTaxes.filter(function(t) {
      return TaxMix.data.DEFUNCT_STATE_TAXES.indexOf(t) === -1;
    });
    var getCategory = function(r) { return r.TaxName; };
    var filterFn = function(r) {
      return r.GovernmentLevel === 'State/Territory/Local' && !r.IsDefunct;
    };

    // Aggregate by jurisdiction and category for the selected year
    // For federal taxes, the jurisdiction is "Australian Government" — spread evenly or show as single bar
    // Actually, federal taxes don't break down by state jurisdiction — so for "Federal" and "Both" modes,
    // we can only show one bar for the whole country
    // For state taxes, we have per-jurisdiction data

    // Build data: byJurCat[jurisdiction][category] = value
    var byJurCat = {};
    jurisdictions.forEach(function(j) {
      byJurCat[j] = {};
      categories.forEach(function(c) { byJurCat[j][c] = 0; });
    });

    rows.forEach(function(r) {
      if (r.YearStart !== yearStart || r.ValueDollars === null) return;
      if (!filterFn(r)) return;
      var cat = getCategory(r);
      if (categories.indexOf(cat) === -1) return;
      var jur = r.Jurisdiction;
      if (jur === 'Australian Government') return; // Federal has no state breakdown
      if (!byJurCat[jur]) return;
      byJurCat[jur][cat] = (byJurCat[jur][cat] || 0) + r.ValueDollars;
    });

    // Compute totals per jurisdiction for percentage mode
    var jurTotals = {};
    jurisdictions.forEach(function(j) {
      var total = 0;
      categories.forEach(function(c) { total += byJurCat[j][c] || 0; });
      jurTotals[j] = total;
    });

    // Filter to categories that have some data
    var activeCategories = categories.filter(function(c) {
      var hasData = false;
      jurisdictions.forEach(function(j) {
        if (byJurCat[j][c] > 0) hasData = true;
      });
      return hasData;
    });

    // Sort categories by total across jurisdictions (largest at bottom)
    activeCategories.sort(function(a, b) {
      var totalA = 0, totalB = 0;
      jurisdictions.forEach(function(j) { totalA += byJurCat[j][a] || 0; totalB += byJurCat[j][b] || 0; });
      return totalB - totalA;
    });

    var jurLabels = jurisdictions.map(function(j) {
      return TaxMix.data.JURISDICTION_ABBREV[j] || j;
    });

    return activeCategories.map(function(cat) {
      var vals = jurisdictions.map(function(j) {
        var v = byJurCat[j][cat] || 0;
        return showPct && jurTotals[j] > 0 ? (v / jurTotals[j] * 100) : v;
      });
      return {
        x: jurLabels, y: vals, name: cat, type: 'bar',
        marker: { color: colorMap[cat] || '#999' },
        customdata: jurisdictions.map(function(j) { return fmt(byJurCat[j][cat] || 0); }),
        hovertemplate: cat + '<br>%{x}<br>%{customdata}<extra></extra>'
      };
    });
  },

  updateStateComparison: function(state, divId, isOverview) {
    var traces = this.buildStateComparison(state);
    var fiscalYear = state.metadata.years.find(function(y) {
      return y.start === state.statesYear;
    });
    var yearLabel = fiscalYear ? fiscalYear.fiscal : state.statesYear;
    var yTitle = state.statesShowPct ? 'Share (%)' : 'Revenue';

    var layout = this.baseLayout({
      xTitle: '', yTitle: yTitle,
      showLegend: !isOverview, title: isOverview
    });
    layout.barmode = 'stack';
    if (isOverview) layout.title = '';
    if (state.statesShowPct) {
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
    if (isOverview) layout.title = '';
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
    var parts = (state.deepDiveTax || '').split('|');
    var govLevel = parts[0];
    var taxName = parts[1] || parts[0];
    var rows = state.allRows;
    var colorMap = state.colorMap;
    var years = state.metadata.years.map(function(y) { return y.start; });
    var fmt = TaxMix.charts.formatValue;

    var taxRows = rows.filter(function(r) {
      return r.TaxName === taxName && r.GovernmentLevel === govLevel;
    });
    if (taxRows.length === 0) return [];

    var isFederal = govLevel === 'Australian Government';

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
    var years = state.metadata.years;
    var minYear = years[0].start;
    var maxYear = years[years.length - 1].start;

    // Find max value across all traces for stable y-axis
    var maxVal = 0;
    traces.forEach(function(t) {
      if (t.y) t.y.forEach(function(v) { if (v !== null && v > maxVal) maxVal = v; });
    });

    var layout = this.baseLayout({
      xTitle: 'Year', yTitle: 'Revenue',
      showLegend: !isOverview, title: isOverview
    });
    layout.xaxis.range = [minYear, maxYear];
    layout.yaxis.range = [0, maxVal * 1.05];
    if (isOverview) layout.title = '';
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
      case 'states': this.updateStateComparison(state, divId, isOverview); break;
      case 'pareto': this.updatePareto(state, divId, isOverview); break;
      case 'deepdive': this.updateDeepDive(state, divId, isOverview); break;
    }
  },

  updateAll: function(state) {
    if (state.view === 'overview') {
      var self = this;
      ['taxmix', 'states', 'pareto', 'deepdive'].forEach(function(id) {
        self.updatePanel(id, state, true);
      });
    } else {
      this.updatePanel(state.view, state, false);
      TaxMix.controls.updateSubtitle();
    }
  }
};
