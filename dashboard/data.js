/* =============================================================================
   TaxMix — Data Layer
   Fetch CSV, parse, filter exclusions, derive fields, aggregate, build metadata
   ============================================================================= */

window.TaxMix = window.TaxMix || {};

TaxMix.data = {

  // Subtotals and sub-components to exclude (prevent double-counting)
  EXCLUDE_RULES: [
    // Federal subtotals
    { TaxName: 'Income taxation receipts total' },
    { TaxName: 'Indirect taxation receipts total' },
    { TaxName: 'Taxation receipts total' },
    // State subtotals
    { TaxName: 'Total tax' },
    { TaxName: 'Franchise taxes', GovernmentLevel: 'State/Territory/Local' },
    { TaxName: 'Motor Taxation - total' },
    // Federal sub-components of "Individuals and other withholding taxes"
    { TaxName: 'Gross PAYE/PAYG withholding' },
    { TaxName: 'Gross other individuals' },
    { TaxName: 'Gross prescribed payments system' },
    { TaxName: 'Individuals income tax - Individuals' },
    { TaxName: 'Individuals income tax - Social services contribution' },
    { TaxName: 'Gross income tax withholding' },
    { TaxName: 'Individuals refunds' },
    { TaxName: 'Medicare Levy' },
    // "Other" only under federal Income taxation (scoped to avoid excluding state "Other taxes")
    { TaxName: 'Other', GovernmentLevel: 'Australian Government' }
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

  // Defunct state taxes (zero in 2022-23) — hidden from panels 1/2/3, available in panel 4
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
    'NSW': 'NSW',
    'Victoria': 'Vic',
    'Queensland': 'QLD',
    'South Australia': 'SA',
    'Western Australia': 'WA',
    'Tasmania': 'Tas',
    'NT': 'NT',
    'ACT': 'ACT',
    'Australian Government': 'Federal'
  },

  // Jurisdiction sort order (by approximate size)
  JURISDICTION_ORDER: ['NSW', 'Victoria', 'Queensland', 'Western Australia',
    'South Australia', 'Tasmania', 'ACT', 'NT'],

  // -- Fetch and Parse ------------------------------------------------------

  fetch: function(url, callback) {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: function(results) { callback(null, results.data); },
      error: function(err) { callback(err, null); }
    });
  },

  // -- Process: filter exclusions, derive fields ----------------------------

  process: function(rows) {
    var self = this;

    // Build exclusion lookup
    var filtered = rows.filter(function(r) {
      for (var i = 0; i < self.EXCLUDE_RULES.length; i++) {
        var rule = self.EXCLUDE_RULES[i];
        if (r.TaxName === rule.TaxName) {
          // If rule has GovernmentLevel scope, check it
          if (rule.GovernmentLevel && r.GovernmentLevel !== rule.GovernmentLevel) continue;
          return false;
        }
      }
      return true;
    });

    // Derive fields
    filtered.forEach(function(r) {
      r.FederalGroup = self.FEDERAL_GROUPS[r.TaxName] || null;

      r.ValueDollars = (r.ValueThousands !== null && r.ValueThousands !== undefined)
        ? r.ValueThousands * 1000 : null;

      // Display label: disambiguate Payroll tax
      if (r.TaxName === 'Payroll tax' && r.GovernmentLevel === 'Australian Government') {
        r.DisplayName = 'Payroll tax (Federal)';
      } else if (r.TaxName === 'Payroll tax' && r.GovernmentLevel === 'State/Territory/Local') {
        r.DisplayName = 'Payroll tax (State)';
      } else {
        r.DisplayName = r.TaxName;
      }

      r.IsDefunct = r.GovernmentLevel === 'State/Territory/Local'
        && self.DEFUNCT_STATE_TAXES.indexOf(r.TaxName) !== -1;
    });

    return filtered;
  },

  // -- Build Metadata -------------------------------------------------------

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

    // Totals for sorting
    var stateTaxTotals = {};
    var federalTaxTotals = {};

    rows.forEach(function(r) {
      if (!yearSet[r.YearStart]) {
        yearSet[r.YearStart] = true;
        years.push({ start: r.YearStart, fiscal: r.FiscalYear });
      }
      if (r.GovernmentLevel === 'State/Territory/Local' && !stateTaxSet[r.TaxName]) {
        stateTaxSet[r.TaxName] = true;
        stateTaxes.push(r.TaxName);
        stateTaxTotals[r.TaxName] = 0;
      }
      if (r.GovernmentLevel === 'Australian Government' && !federalTaxSet[r.TaxName]) {
        federalTaxSet[r.TaxName] = true;
        federalTaxes.push(r.TaxName);
        federalTaxTotals[r.TaxName] = 0;
      }
      if (r.Jurisdiction !== 'Australian Government' && !jurisdictionSet[r.Jurisdiction]) {
        jurisdictionSet[r.Jurisdiction] = true;
        jurisdictions.push(r.Jurisdiction);
      }

      // Accumulate totals for sorting
      if (r.ValueDollars !== null) {
        if (r.GovernmentLevel === 'State/Territory/Local') {
          stateTaxTotals[r.TaxName] = (stateTaxTotals[r.TaxName] || 0) + r.ValueDollars;
        } else {
          federalTaxTotals[r.TaxName] = (federalTaxTotals[r.TaxName] || 0) + r.ValueDollars;
        }
      }
    });

    years.sort(function(a, b) { return a.start - b.start; });

    // Sort jurisdictions by predefined order
    var order = this.JURISDICTION_ORDER;
    jurisdictions.sort(function(a, b) {
      return order.indexOf(a) - order.indexOf(b);
    });

    // Sort taxes by total (largest first)
    stateTaxes.sort(function(a, b) {
      return (stateTaxTotals[b] || 0) - (stateTaxTotals[a] || 0);
    });
    federalTaxes.sort(function(a, b) {
      return (federalTaxTotals[b] || 0) - (federalTaxTotals[a] || 0);
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

  // -- Aggregate state taxes nationally (sum across jurisdictions) ----------

  aggregateStateNational: function(rows) {
    var agg = {};
    rows.forEach(function(r) {
      if (r.GovernmentLevel !== 'State/Territory/Local') return;
      var key = r.TaxName + '|' + r.YearStart;
      if (!agg[key]) {
        agg[key] = {
          TaxName: r.TaxName, DisplayName: r.DisplayName,
          YearStart: r.YearStart, FiscalYear: r.FiscalYear,
          GovernmentLevel: r.GovernmentLevel, IsDefunct: r.IsDefunct,
          ValueDollars: 0, hasValue: false
        };
      }
      if (r.ValueDollars !== null) {
        agg[key].ValueDollars += r.ValueDollars;
        agg[key].hasValue = true;
      }
    });
    return Object.keys(agg).map(function(k) {
      var row = agg[k];
      if (!row.hasValue) row.ValueDollars = null;
      return row;
    });
  },

  // -- Build stable color map -----------------------------------------------

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

    // Federal groups
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
