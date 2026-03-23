# PBO Tax Mix Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive browser-based dashboard exploring 122 years of Australian tax revenue data with four chart panels and global filters.

**Architecture:** Five-file HTML/CSS/JS widget using Plotly.js and PapaParse via CDN. Single namespace `window.TaxMix`. Data loaded from CSV via `data-csv-url` attribute. No build step.

**Tech Stack:** HTML5, CSS3 (flexbox), vanilla JS, Plotly.js (CDN), PapaParse (CDN)

**Spec:** `docs/prd/2026-03-23-pbo-tax-dashboard-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `dashboard/index.html` | Container div with `data-csv-url`, CDN script/link tags, `TaxMix.init()` call |
| `dashboard/styles.css` | All styles scoped with `.taxmix-` prefix. Flexbox layout, 85vh container, responsive breakpoint |
| `dashboard/data.js` | Fetch CSV, parse rows, filter exclusions, derive FederalGroup, aggregate by year/category, build metadata (color maps, year list, category lists) |
| `dashboard/charts.js` | One trace builder per panel (`updateTaxMix`, `updateFedState`, `updatePareto`, `updateDeepDive`), `updateAll()` dispatcher, `updatePanel(id)`, layout builders, value formatting |
| `dashboard/controls.js` | State object, `init()`, tab bar, filter bar (gov level toggle, federal group checkboxes, jurisdiction checkboxes, year slider, tax dropdown, abs/pct toggle), event handlers |

---

### Task 1: HTML Shell and CSS Foundation

**Files:**
- Create: `dashboard/index.html`
- Create: `dashboard/styles.css`

- [ ] **Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Australia's Tax Mix 1901-2023</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="styles.css">
  <script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
  <script src="https://cdn.plot.ly/plotly-2.35.0.min.js"></script>
</head>
<body>
  <div id="taxmix-app" class="taxmix" data-csv-url="../Outputs/pbo-tax-mix.csv"></div>
  <script src="data.js"></script>
  <script src="charts.js"></script>
  <script src="controls.js"></script>
  <script>TaxMix.init('#taxmix-app');</script>
</body>
</html>
```

- [ ] **Step 2: Create styles.css with layout foundation**

Core styles:
- `.taxmix` container: `display: flex; flex-direction: column; height: 85vh; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px;`
- `.taxmix-header`: `flex-shrink: 0; padding: 12px 16px;` with title (18px bold) and subtitle (12px, opacity 0.6)
- `.taxmix-tabs`: `flex-shrink: 0; display: flex; gap: 4px; padding: 0 16px; border-bottom: 1px solid #e0e0e0;` with tab buttons styled as pills
- `.taxmix-tab.active`: highlighted background
- `.taxmix-filters`: `flex-shrink: 0; padding: 8px 16px; border-bottom: 1px solid #e0e0e0;` with filter groups stacking vertically, items flowing horizontally
- `.taxmix-main`: `flex: 1; min-height: 0; position: relative;`
- `.taxmix-grid`: `display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; height: 100%; gap: 8px; padding: 8px;`
- `.taxmix-panel`: `display: flex; flex-direction: column; min-height: 0;` with header bar and chart area
- `.taxmix-panel-header`: panel title, flex-shrink 0
- `.taxmix-panel-chart`: `flex: 1; min-height: 0;`
- `.taxmix-filter-group`: label row with group name, items wrapping horizontally
- `.taxmix-filter-item label`: inline-flex with color dot and checkbox
- `.taxmix-color-dot`: `width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 4px;`
- Responsive: `@media (max-width: 600px)` grid to single column, filters stack

- [ ] **Step 3: Verify HTML loads in browser**

Open `dashboard/index.html` in browser. Should show empty page with no console errors (Plotly and PapaParse loaded from CDN).

- [ ] **Step 4: Commit**

```bash
git add dashboard/index.html dashboard/styles.css
git commit -m "feat: add dashboard HTML shell and CSS foundation"
```

---

### Task 2: Data Layer

**Files:**
- Create: `dashboard/data.js`

- [ ] **Step 1: Create data.js with namespace, constants, and exclusion lists**

```js
window.TaxMix = window.TaxMix || {};

TaxMix.data = {
  // Rows to exclude (subtotals and sub-components that cause double-counting)
  EXCLUDE_TAX_NAMES: [
    // Federal subtotals
    'Income taxation receipts total',
    'Indirect taxation receipts total',
    'Taxation receipts total',
    // State subtotals
    'Total tax',
    'Franchise taxes',
    'Motor Taxation - total',
    // Federal sub-components (children of "Individuals and other withholding taxes")
    'Gross PAYE/PAYG withholding',
    'Gross other individuals',
    'Gross prescribed payments system',
    'Individuals income tax - Individuals',
    'Individuals income tax - Social services contribution',
    'Gross income tax withholding',
    'Individuals refunds',
    'Medicare Levy',
    'Other'
  ],

  // Federal tax group classification
  FEDERAL_GROUPS: {
    'Individuals and other withholding taxes': 'Individuals',
    'Company tax': 'Company',
    'Goods and services tax': 'Indirect',
    'Customs and Excise': 'Indirect',
    'Sales tax': 'Indirect',
    'Wine equalisation tax': 'Indirect',
    'Luxury car tax': 'Indirect',
    'Primary production taxes': 'Indirect',
    'Other taxes': 'Indirect',
    'Fringe benefits tax': 'Other Direct',
    'Resource rent taxes': 'Other Direct',
    'Superannuation taxes': 'Other Direct',
    'Other income tax and withholding tax': 'Other Direct',
    'Payroll tax': 'Other Direct'
  },

  // Defunct state taxes (zero in 2022-23) — hidden from panels 1/2/3
  DEFUNCT_STATE_TAXES: [
    'Entertainments',
    'Financial institutions transactions taxes',
    'Franchise taxes - liquor licences',
    'Franchise taxes - other',
    'Probate and succession duties',
    'Special Income Tax',
    'State Income and Dividend Taxes'
  ],

  // Jurisdiction display abbreviations
  JURISDICTION_ABBREV: {
    'New South Wales': 'NSW', 'NSW': 'NSW',
    'Victoria': 'Vic', 'Queensland': 'QLD',
    'South Australia': 'SA', 'Western Australia': 'WA',
    'Tasmania': 'Tas', 'NT': 'NT', 'ACT': 'ACT',
    'Australian Government': 'Federal'
  },

  // Jurisdiction sort order (by approximate size)
  JURISDICTION_ORDER: ['NSW', 'Victoria', 'Queensland', 'Western Australia',
    'South Australia', 'Tasmania', 'ACT', 'NT'],
```

- [ ] **Step 2: Add fetch, parse, and derive functions**

```js
  fetch: function(url, callback) {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: function(results) {
        callback(null, results.data);
      },
      error: function(err) {
        callback(err, null);
      }
    });
  },

  process: function(rows) {
    // Filter out exclusions
    var filtered = rows.filter(function(r) {
      return TaxMix.data.EXCLUDE_TAX_NAMES.indexOf(r.TaxName) === -1;
    });

    // Derive fields
    filtered.forEach(function(r) {
      // Federal group
      r.FederalGroup = TaxMix.data.FEDERAL_GROUPS[r.TaxName] || null;

      // Value in dollars (ValueThousands * 1000)
      r.ValueDollars = (r.ValueThousands !== null && r.ValueThousands !== undefined)
        ? r.ValueThousands * 1000 : null;

      // Display label for Pareto (disambiguate Payroll tax)
      if (r.TaxName === 'Payroll tax' && r.GovernmentLevel === 'Australian Government') {
        r.DisplayName = 'Payroll tax (Federal)';
      } else if (r.TaxName === 'Payroll tax' && r.GovernmentLevel === 'State/Territory/Local') {
        r.DisplayName = 'Payroll tax (State)';
      } else {
        r.DisplayName = r.TaxName;
      }

      // Is defunct state tax?
      r.IsDefunct = r.GovernmentLevel === 'State/Territory/Local'
        && TaxMix.data.DEFUNCT_STATE_TAXES.indexOf(r.TaxName) !== -1;
    });

    return filtered;
  },
```

- [ ] **Step 3: Add metadata and aggregation builders**

```js
  buildMetadata: function(rows) {
    var years = [];
    var yearSet = {};
    var stateTaxes = [];
    var stateTaxSet = {};
    var federalTaxes = [];
    var federalTaxSet = {};
    var jurisdictions = [];
    var jurisdictionSet = {};
    var federalGroups = ['Individuals', 'Company', 'Indirect', 'Other Direct'];

    rows.forEach(function(r) {
      if (!yearSet[r.YearStart]) {
        yearSet[r.YearStart] = true;
        years.push({ start: r.YearStart, fiscal: r.FiscalYear });
      }
      if (r.GovernmentLevel === 'State/Territory/Local' && !stateTaxSet[r.TaxName]) {
        stateTaxSet[r.TaxName] = true;
        stateTaxes.push(r.TaxName);
      }
      if (r.GovernmentLevel === 'Australian Government' && !federalTaxSet[r.TaxName]) {
        federalTaxSet[r.TaxName] = true;
        federalTaxes.push(r.TaxName);
      }
      if (r.Jurisdiction !== 'Australian Government' && !jurisdictionSet[r.Jurisdiction]) {
        jurisdictionSet[r.Jurisdiction] = true;
        jurisdictions.push(r.Jurisdiction);
      }
    });

    years.sort(function(a, b) { return a.start - b.start; });

    // Sort jurisdictions by predefined order
    var order = TaxMix.data.JURISDICTION_ORDER;
    jurisdictions.sort(function(a, b) {
      return order.indexOf(a) - order.indexOf(b);
    });

    return {
      years: years,
      stateTaxes: stateTaxes,
      federalTaxes: federalTaxes,
      jurisdictions: jurisdictions,
      federalGroups: federalGroups,
      allTaxes: stateTaxes.concat(federalTaxes)
    };
  },

  // Aggregate state taxes: sum across jurisdictions per TaxName per year
  aggregateStateNational: function(rows) {
    var agg = {};
    rows.forEach(function(r) {
      if (r.GovernmentLevel !== 'State/Territory/Local') return;
      var key = r.TaxName + '|' + r.YearStart;
      if (!agg[key]) {
        agg[key] = { TaxName: r.TaxName, DisplayName: r.DisplayName,
          YearStart: r.YearStart, FiscalYear: r.FiscalYear,
          GovernmentLevel: r.GovernmentLevel, IsDefunct: r.IsDefunct,
          ValueDollars: 0 };
      }
      if (r.ValueDollars !== null) agg[key].ValueDollars += r.ValueDollars;
    });
    return Object.keys(agg).map(function(k) { return agg[k]; });
  },

  // Build stable color map for categories
  buildColorMap: function(metadata) {
    var palette = [
      '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
      '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
      '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
      '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5',
      '#393b79', '#637939', '#8c6d31', '#843c39', '#7b4173'
    ];
    var map = {};
    var i = 0;

    // Federal groups get first colors
    metadata.federalGroups.forEach(function(g) {
      map[g] = palette[i++ % palette.length];
    });

    // State taxes
    metadata.stateTaxes.forEach(function(t) {
      if (!map[t]) map[t] = palette[i++ % palette.length];
    });

    // Federal individual taxes
    metadata.federalTaxes.forEach(function(t) {
      if (!map[t]) map[t] = palette[i++ % palette.length];
    });

    // Gov levels
    map['Federal'] = '#1f77b4';
    map['State'] = '#ff7f0e';

    // Jurisdictions
    var jColors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
      '#9467bd', '#8c564b', '#e377c2', '#bcbd22'];
    metadata.jurisdictions.forEach(function(j, idx) {
      map[j] = jColors[idx % jColors.length];
    });

    return map;
  }
};
```

Close the `TaxMix.data` object properly at the end.

- [ ] **Step 4: Verify data loads**

Add temporary `console.log` in browser to confirm CSV parses, exclusions applied, metadata built. Check row count matches expected (~24,644 raw, fewer after exclusions).

- [ ] **Step 5: Commit**

```bash
git add dashboard/data.js
git commit -m "feat: add data layer with CSV parsing, exclusions, and metadata"
```

---

### Task 3: Charts Layer — Value Formatting and Layout Helpers

**Files:**
- Create: `dashboard/charts.js`

- [ ] **Step 1: Create charts.js with namespace, formatValue, and layout helpers**

```js
window.TaxMix = window.TaxMix || {};

TaxMix.charts = {
  // Format dollar value for display
  // Input is in dollars (already multiplied from $'000)
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

  // Standard Plotly layout defaults
  baseLayout: function(opts) {
    return {
      margin: { t: 30, r: opts.rightAxis ? 60 : 20, b: 50, l: 70 },
      hovermode: 'closest',
      showlegend: opts.showLegend !== false,
      legend: { orientation: 'h', y: -0.15 },
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

  // Render or update a panel's chart
  render: function(divId, traces, layout) {
    var div = document.getElementById(divId);
    if (!div) return;
    Plotly.react(div, traces, layout, { responsive: true, displayModeBar: false })
      .then(function() {
        setTimeout(function() { Plotly.Plots.resize(div); }, 0);
      });
  },

  // Render with mode bar (detail view)
  renderDetail: function(divId, traces, layout) {
    var div = document.getElementById(divId);
    if (!div) return;
    Plotly.react(div, traces, layout, { responsive: true })
      .then(function() {
        setTimeout(function() { Plotly.Plots.resize(div); }, 0);
      });
  },
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/charts.js
git commit -m "feat: add charts layer with formatting and layout helpers"
```

---

### Task 4: Charts — Panel 1 (Tax Mix Over Time)

**Files:**
- Modify: `dashboard/charts.js`

- [ ] **Step 1: Add Panel 1 trace builder**

```js
  // Panel 1: Tax Mix Over Time — stacked area
  buildTaxMix: function(state) {
    var govLevel = state.govLevel; // 'Federal', 'State', 'Both'
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
        if (r.GovernmentLevel === 'Australian Government') {
          if (r.FederalGroup) fedByYear[r.YearStart] = (fedByYear[r.YearStart] || 0) + r.ValueDollars;
        } else if (r.GovernmentLevel === 'State/Territory/Local' && !r.IsDefunct) {
          stateByYear[r.YearStart] = (stateByYear[r.YearStart] || 0) + r.ValueDollars;
        }
      });

      return [
        { x: years, y: years.map(function(y) { return stateByYear[y] || 0; }),
          name: 'State', stackgroup: 'one', fillcolor: colorMap['State'],
          line: { color: colorMap['State'], width: 0.5 },
          hovertemplate: 'State<br>%{x}<br>%{customdata}<extra></extra>',
          customdata: years.map(function(y) { return TaxMix.charts.formatValue(stateByYear[y]); })
        },
        { x: years, y: years.map(function(y) { return fedByYear[y] || 0; }),
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
      categories = state.metadata.stateTaxes.filter(function(t) {
        return !TaxMix.data.DEFUNCT_STATE_TAXES.includes(t);
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
      years.forEach(function(y) { totalA += byCatYear[a][y] || 0; totalB += byCatYear[b][y] || 0; });
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
```

- [ ] **Step 2: Add updateTaxMix dispatcher**

```js
  updateTaxMix: function(state, divId, isOverview) {
    var traces = TaxMix.charts.buildTaxMix(state);
    var layout = TaxMix.charts.baseLayout({
      xTitle: 'Year', yTitle: 'Revenue',
      showLegend: !isOverview, rightAxis: false
    });
    layout.title = isOverview ? { text: 'Tax Mix Over Time', font: { size: 13 } } : undefined;
    if (isOverview) {
      TaxMix.charts.render(divId, traces, layout);
    } else {
      TaxMix.charts.renderDetail(divId, traces, layout);
    }
  },
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/charts.js
git commit -m "feat: add Panel 1 tax mix stacked area chart"
```

---

### Task 5: Charts — Panel 2 (Federal vs State Share)

**Files:**
- Modify: `dashboard/charts.js`

- [ ] **Step 1: Add Panel 2 trace builder**

```js
  buildFedState: function(state) {
    var rows = state.allRows;
    var years = state.metadata.years.map(function(y) { return y.start; });
    var showPct = state.showPercentage;
    var colorMap = state.colorMap;

    var fedByYear = {};
    var stateByYear = {};
    years.forEach(function(y) { fedByYear[y] = 0; stateByYear[y] = 0; });

    rows.forEach(function(r) {
      if (r.ValueDollars === null) return;
      if (r.GovernmentLevel === 'Australian Government' && r.FederalGroup) {
        fedByYear[r.YearStart] = (fedByYear[r.YearStart] || 0) + r.ValueDollars;
      } else if (r.GovernmentLevel === 'State/Territory/Local' && !r.IsDefunct) {
        stateByYear[r.YearStart] = (stateByYear[r.YearStart] || 0) + r.ValueDollars;
      }
    });

    if (showPct) {
      var fedPct = years.map(function(y) {
        var total = fedByYear[y] + stateByYear[y];
        return total > 0 ? (fedByYear[y] / total * 100) : 0;
      });
      var statePct = years.map(function(y) {
        var total = fedByYear[y] + stateByYear[y];
        return total > 0 ? (stateByYear[y] / total * 100) : 0;
      });
      return [
        { x: years, y: statePct, name: 'State', stackgroup: 'one',
          fillcolor: colorMap['State'], line: { color: colorMap['State'], width: 0.5 },
          hovertemplate: 'State<br>%{x}<br>%{y:.1f}%<extra></extra>' },
        { x: years, y: fedPct, name: 'Federal', stackgroup: 'one',
          fillcolor: colorMap['Federal'], line: { color: colorMap['Federal'], width: 0.5 },
          hovertemplate: 'Federal<br>%{x}<br>%{y:.1f}%<extra></extra>' }
      ];
    }

    return [
      { x: years, y: years.map(function(y) { return stateByYear[y]; }),
        name: 'State', stackgroup: 'one', fillcolor: colorMap['State'],
        line: { color: colorMap['State'], width: 0.5 },
        hovertemplate: 'State<br>%{x}<br>%{customdata}<extra></extra>',
        customdata: years.map(function(y) { return TaxMix.charts.formatValue(stateByYear[y]); }) },
      { x: years, y: years.map(function(y) { return fedByYear[y]; }),
        name: 'Federal', stackgroup: 'one', fillcolor: colorMap['Federal'],
        line: { color: colorMap['Federal'], width: 0.5 },
        hovertemplate: 'Federal<br>%{x}<br>%{customdata}<extra></extra>',
        customdata: years.map(function(y) { return TaxMix.charts.formatValue(fedByYear[y]); }) }
    ];
  },

  updateFedState: function(state, divId, isOverview) {
    var traces = TaxMix.charts.buildFedState(state);
    var layout = TaxMix.charts.baseLayout({
      xTitle: 'Year', yTitle: state.showPercentage ? 'Share (%)' : 'Revenue',
      showLegend: !isOverview
    });
    layout.title = isOverview ? { text: 'Federal vs State', font: { size: 13 } } : undefined;
    if (state.showPercentage) {
      layout.yaxis.range = [0, 100];
      layout.yaxis.ticksuffix = '%';
    }
    if (isOverview) TaxMix.charts.render(divId, traces, layout);
    else TaxMix.charts.renderDetail(divId, traces, layout);
  },
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/charts.js
git commit -m "feat: add Panel 2 federal vs state share chart"
```

---

### Task 6: Charts — Panel 3 (Tax Pareto)

**Files:**
- Modify: `dashboard/charts.js`

- [ ] **Step 1: Add Panel 3 trace builder**

```js
  buildPareto: function(state) {
    var yearStart = state.paretoYear;
    var govLevel = state.govLevel;
    var rows = state.allRows;
    var colorMap = state.colorMap;

    // Aggregate: federal taxes as-is, state taxes summed across jurisdictions
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

    // Sort descending, exclude negatives
    var sorted = Object.values(taxTotals)
      .filter(function(t) { return t.value > 0; })
      .sort(function(a, b) { return b.value - a.value; });

    var grandTotal = sorted.reduce(function(s, t) { return s + t.value; }, 0);
    var cumPct = 0;
    var names = [], values = [], cumPcts = [], colors = [];
    sorted.forEach(function(t) {
      names.push(t.name);
      values.push(t.value);
      cumPct += t.value / grandTotal * 100;
      cumPcts.push(cumPct);
      colors.push(colorMap[t.name] || '#999');
    });

    var barTrace = {
      x: names, y: values, type: 'bar', name: 'Revenue',
      marker: { color: colors },
      hovertemplate: '%{x}<br>%{customdata}<br>%{meta:.1f}% of total<extra></extra>',
      customdata: values.map(function(v) { return TaxMix.charts.formatValue(v); }),
      meta: values.map(function(v) { return v / grandTotal * 100; })
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
    var traces = TaxMix.charts.buildPareto(state);
    var fiscalYear = state.metadata.years.find(function(y) {
      return y.start === state.paretoYear;
    });
    var yearLabel = fiscalYear ? fiscalYear.fiscal : state.paretoYear;
    var layout = TaxMix.charts.baseLayout({
      xTitle: '', yTitle: 'Revenue', showLegend: false, rightAxis: true
    });
    layout.title = isOverview
      ? { text: 'Tax Pareto (' + yearLabel + ')', font: { size: 13 } }
      : undefined;
    layout.yaxis2 = {
      title: { text: 'Cumulative %', automargin: true },
      overlaying: 'y', side: 'right', range: [0, 105],
      showgrid: false, ticksuffix: '%'
    };
    layout.xaxis.tickangle = -45;
    layout.margin.b = isOverview ? 80 : 120;
    if (isOverview) {
      layout.xaxis.showticklabels = false;
      layout.margin.b = 30;
      TaxMix.charts.render(divId, traces, layout);
    } else {
      TaxMix.charts.renderDetail(divId, traces, layout);
    }
  },
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/charts.js
git commit -m "feat: add Panel 3 tax pareto chart"
```

---

### Task 7: Charts — Panel 4 (Deep Dive)

**Files:**
- Modify: `dashboard/charts.js`

- [ ] **Step 1: Add Panel 4 trace builder and updateAll**

```js
  buildDeepDive: function(state) {
    var taxName = state.deepDiveTax;
    var rows = state.allRows;
    var colorMap = state.colorMap;
    var years = state.metadata.years.map(function(y) { return y.start; });

    // Find all rows for this tax
    var taxRows = rows.filter(function(r) { return r.TaxName === taxName; });
    if (taxRows.length === 0) return [];

    var isFederal = taxRows[0].GovernmentLevel === 'Australian Government';

    if (isFederal) {
      // Single line
      var byYear = {};
      taxRows.forEach(function(r) { if (r.ValueDollars !== null) byYear[r.YearStart] = r.ValueDollars; });
      return [{
        x: years, y: years.map(function(y) { return byYear[y] || null; }),
        name: taxName, mode: 'lines', line: { color: colorMap[taxName] || '#1f77b4', width: 2 },
        connectgaps: false,
        hovertemplate: taxName + '<br>%{x}<br>%{customdata}<extra></extra>',
        customdata: years.map(function(y) { return TaxMix.charts.formatValue(byYear[y]); })
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
      return {
        x: years, y: years.map(function(y) { return byJurYear[j][y] || null; }),
        name: TaxMix.data.JURISDICTION_ABBREV[j] || j,
        mode: 'lines', line: { color: colorMap[j], width: 2 },
        connectgaps: false,
        hovertemplate: (TaxMix.data.JURISDICTION_ABBREV[j] || j) + '<br>%{x}<br>%{customdata}<extra></extra>',
        customdata: years.map(function(y) { return TaxMix.charts.formatValue(byJurYear[j][y]); })
      };
    });
  },

  updateDeepDive: function(state, divId, isOverview) {
    var traces = TaxMix.charts.buildDeepDive(state);
    var layout = TaxMix.charts.baseLayout({
      xTitle: 'Year', yTitle: 'Revenue', showLegend: !isOverview
    });
    layout.title = isOverview
      ? { text: 'Deep Dive: ' + (state.deepDiveTax || ''), font: { size: 13 } }
      : undefined;
    if (isOverview) TaxMix.charts.render(divId, traces, layout);
    else TaxMix.charts.renderDetail(divId, traces, layout);
  },

  // Master update functions
  updatePanel: function(panelId, state, isOverview) {
    var divId = isOverview ? 'taxmix-overview-' + panelId : 'taxmix-detail-chart';
    switch (panelId) {
      case 'taxmix': TaxMix.charts.updateTaxMix(state, divId, isOverview); break;
      case 'fedstate': TaxMix.charts.updateFedState(state, divId, isOverview); break;
      case 'pareto': TaxMix.charts.updatePareto(state, divId, isOverview); break;
      case 'deepdive': TaxMix.charts.updateDeepDive(state, divId, isOverview); break;
    }
  },

  updateAll: function(state) {
    if (state.view === 'overview') {
      ['taxmix', 'fedstate', 'pareto', 'deepdive'].forEach(function(id) {
        TaxMix.charts.updatePanel(id, state, true);
      });
    } else {
      TaxMix.charts.updatePanel(state.view, state, false);
    }
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/charts.js
git commit -m "feat: add Panel 4 deep dive chart and updateAll dispatcher"
```

---

### Task 8: Controls Layer — State, Init, and App Shell

**Files:**
- Create: `dashboard/controls.js`

- [ ] **Step 1: Create controls.js with state object and init function**

```js
window.TaxMix = window.TaxMix || {};

TaxMix.controls = {
  state: {
    view: 'overview',        // 'overview' | 'taxmix' | 'fedstate' | 'pareto' | 'deepdive'
    govLevel: 'Both',        // 'Federal' | 'State' | 'Both'
    showPercentage: false,   // Panel 2 toggle
    paretoYear: 2022,        // Panel 3 year slider
    deepDiveTax: null,       // Panel 4 selected tax
    selectedFederalGroups: {},  // { 'Individuals': true, ... }
    selectedJurisdictions: {},  // { 'NSW': true, ... }
    allRows: [],
    metadata: null,
    colorMap: null
  },

  init: function(selector) {
    var container = document.querySelector(selector);
    if (!container) {
      console.error('TaxMix: container not found:', selector);
      return;
    }

    var csvUrl = container.getAttribute('data-csv-url');
    if (!csvUrl) {
      container.innerHTML = '<p style="color:red">Error: data-csv-url attribute missing</p>';
      return;
    }

    container.innerHTML = '<p class="taxmix-loading">Loading data...</p>';
    var self = this;

    TaxMix.data.fetch(csvUrl, function(err, rows) {
      if (err) {
        container.innerHTML = '<p style="color:red">Error loading data: ' + err.message + '</p>';
        return;
      }

      // Process and store
      self.state.allRows = TaxMix.data.process(rows);
      self.state.metadata = TaxMix.data.buildMetadata(self.state.allRows);
      self.state.colorMap = TaxMix.data.buildColorMap(self.state.metadata);

      // Set defaults
      self.state.paretoYear = self.state.metadata.years[self.state.metadata.years.length - 1].start;
      self.state.deepDiveTax = self.state.metadata.stateTaxes.indexOf('Payroll tax') !== -1
        ? 'Payroll tax' : self.state.metadata.stateTaxes[0];

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
```

- [ ] **Step 2: Add renderShell (header + tabs + filter container + main area)**

```js
  renderShell: function(container) {
    container.innerHTML = '';

    // Header
    var header = document.createElement('div');
    header.className = 'taxmix-header';
    header.innerHTML = '<div class="taxmix-title">Australia\'s Tax Mix 1901-2023</div>' +
      '<div class="taxmix-subtitle">Source: Parliamentary Budget Office · pbo.gov.au · Nominal dollars ($\'000)</div>';
    container.appendChild(header);

    // Tabs
    var tabs = document.createElement('div');
    tabs.className = 'taxmix-tabs';
    tabs.id = 'taxmix-tabs';
    var tabDefs = [
      { id: 'overview', label: 'Overview' },
      { id: 'taxmix', label: 'Tax Mix' },
      { id: 'fedstate', label: 'Fed vs State' },
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
        self.renderMainArea();
        self.renderFilters();
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
    var tabs = document.querySelectorAll('.taxmix-tab');
    var self = this;
    tabs.forEach(function(tab) {
      tab.classList.toggle('active', tab.getAttribute('data-view') === self.state.view);
    });
  },
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/controls.js
git commit -m "feat: add controls layer with state, init, and app shell"
```

---

### Task 9: Controls — Filters

**Files:**
- Modify: `dashboard/controls.js`

- [ ] **Step 1: Add renderFilters**

```js
  renderFilters: function() {
    var el = document.getElementById('taxmix-filters');
    if (!el) return;
    el.innerHTML = '';
    var self = this;
    var view = this.state.view;

    // Government Level toggle (panels 1, 3, overview)
    if (view === 'overview' || view === 'taxmix' || view === 'pareto') {
      var govGroup = this.createFilterGroup('Government Level');
      ['Federal', 'State', 'Both'].forEach(function(level) {
        var btn = document.createElement('button');
        btn.className = 'taxmix-toggle-btn' + (self.state.govLevel === level ? ' active' : '');
        btn.textContent = level;
        btn.addEventListener('click', function() {
          self.state.govLevel = level;
          self.renderFilters();
          TaxMix.charts.updateAll(self.state);
        });
        govGroup.appendChild(btn);
      });
      el.appendChild(govGroup);
    }

    // Federal Group checkboxes (panel 1 when Federal selected)
    if ((view === 'overview' || view === 'taxmix') && this.state.govLevel === 'Federal') {
      var fedGroup = this.createFilterGroup('Federal Tax Group');
      this.state.metadata.federalGroups.forEach(function(g) {
        var item = self.createCheckbox(g, self.state.selectedFederalGroups[g],
          self.state.colorMap[g], function(checked) {
            self.state.selectedFederalGroups[g] = checked;
            TaxMix.charts.updateAll(self.state);
          });
        fedGroup.appendChild(item);
      });
      el.appendChild(fedGroup);
    }

    // Jurisdictions (panels 3 state portion, 4)
    if (view === 'overview' || view === 'pareto' || view === 'deepdive') {
      var jurGroup = this.createFilterGroup('Jurisdictions');

      // Select all/none checkbox
      var allCb = document.createElement('input');
      allCb.type = 'checkbox';
      var allCount = this.state.metadata.jurisdictions.filter(function(j) {
        return self.state.selectedJurisdictions[j];
      }).length;
      allCb.checked = allCount === this.state.metadata.jurisdictions.length;
      allCb.indeterminate = allCount > 0 && allCount < this.state.metadata.jurisdictions.length;
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

    // Year slider (panel 3)
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

    // Tax dropdown (panel 4)
    if (view === 'deepdive') {
      var taxGroup = this.createFilterGroup('Tax Category');
      var select = document.createElement('select');
      select.className = 'taxmix-tax-select';

      // State taxes group
      var stateOptGroup = document.createElement('optgroup');
      stateOptGroup.label = 'State/Territory/Local';
      this.state.metadata.stateTaxes.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (t === self.state.deepDiveTax) opt.selected = true;
        stateOptGroup.appendChild(opt);
      });
      select.appendChild(stateOptGroup);

      // Federal taxes group
      var fedOptGroup = document.createElement('optgroup');
      fedOptGroup.label = 'Australian Government';
      this.state.metadata.federalTaxes.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (t === self.state.deepDiveTax) opt.selected = true;
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

    // Absolute/Percentage toggle (panel 2)
    if (view === 'fedstate') {
      var pctGroup = this.createFilterGroup('Display');
      ['Absolute ($)', 'Share (%)'].forEach(function(label, idx) {
        var btn = document.createElement('button');
        btn.className = 'taxmix-toggle-btn' + ((idx === 0 && !self.state.showPercentage) || (idx === 1 && self.state.showPercentage) ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', function() {
          self.state.showPercentage = idx === 1;
          self.renderFilters();
          TaxMix.charts.updateAll(self.state);
        });
        pctGroup.appendChild(btn);
      });
      el.appendChild(pctGroup);
    }
  },
```

- [ ] **Step 2: Add helper functions (createFilterGroup, createCheckbox)**

```js
  createFilterGroup: function(label) {
    var group = document.createElement('div');
    group.className = 'taxmix-filter-group';
    var title = document.createElement('span');
    title.className = 'taxmix-filter-label';
    title.textContent = label + ': ';
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
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/controls.js
git commit -m "feat: add filter bar with all controls"
```

---

### Task 10: Controls — Main Area Rendering (Overview + Detail)

**Files:**
- Modify: `dashboard/controls.js`

- [ ] **Step 1: Add renderMainArea**

```js
  renderMainArea: function() {
    var main = document.getElementById('taxmix-main');
    if (!main) return;
    main.innerHTML = '';
    var self = this;

    if (this.state.view === 'overview') {
      // 2x2 grid
      var grid = document.createElement('div');
      grid.className = 'taxmix-grid';

      var panels = [
        { id: 'taxmix', label: 'Tax Mix Over Time' },
        { id: 'fedstate', label: 'Federal vs State' },
        { id: 'pareto', label: 'Tax Pareto' },
        { id: 'deepdive', label: 'Deep Dive' }
      ];

      panels.forEach(function(p) {
        var panel = document.createElement('div');
        panel.className = 'taxmix-panel taxmix-panel-overview';
        panel.style.cursor = 'pointer';
        panel.addEventListener('click', function() {
          self.state.view = p.id;
          self.updateTabs();
          self.renderMainArea();
          self.renderFilters();
          TaxMix.charts.updateAll(self.state);
        });

        var chart = document.createElement('div');
        chart.className = 'taxmix-panel-chart';
        chart.id = 'taxmix-overview-' + p.id;
        panel.appendChild(chart);
        grid.appendChild(panel);
      });

      main.appendChild(grid);
    } else {
      // Detail view: single panel
      var panel = document.createElement('div');
      panel.className = 'taxmix-panel taxmix-panel-detail';

      var chart = document.createElement('div');
      chart.className = 'taxmix-panel-chart';
      chart.id = 'taxmix-detail-chart';
      panel.appendChild(chart);

      var footer = document.createElement('div');
      footer.className = 'taxmix-panel-footer';
      footer.textContent = 'Source: Parliamentary Budget Office · pbo.gov.au';
      panel.appendChild(footer);

      main.appendChild(panel);
    }
  }
};

// Public init
TaxMix.init = function(selector) {
  TaxMix.controls.init(selector);
};
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/controls.js
git commit -m "feat: add main area rendering with overview grid and detail view"
```

---

### Task 11: End-to-End Verification and Polish

**Files:**
- Modify: `dashboard/styles.css` (if needed)
- Modify: any JS file (bug fixes)

- [ ] **Step 1: Open dashboard in browser and verify**

Open `dashboard/index.html`. Check:
- Data loads without errors (check console)
- Overview shows 4 compact charts in 2x2 grid
- Clicking a panel opens detail view with full chart
- Tabs switch correctly
- Gov Level toggle updates Panels 1 and 3
- Federal Group checkboxes filter Panel 1 when Federal selected
- Jurisdiction checkboxes filter Panel 4
- Year slider updates Panel 3
- Tax dropdown updates Panel 4
- Abs/Pct toggle updates Panel 2
- Tooltips show formatted values
- Window resize re-renders charts

- [ ] **Step 2: Fix any issues found during verification**

- [ ] **Step 3: Final commit**

```bash
git add -A dashboard/
git commit -m "feat: complete PBO tax mix interactive dashboard"
```

---

### Task 12: Update Documentation

**Files:**
- Modify: `docs/prd/2026-03-23-pbo-tax-dashboard-design.md`

- [ ] **Step 1: Update spec with implementation notes**

Add a "Status" section at the top of the spec noting implementation is complete, with the dashboard location (`dashboard/index.html`) and how to run it (open in browser, served from project root).

- [ ] **Step 2: Commit**

```bash
git add docs/
git commit -m "docs: update spec with implementation status"
```
