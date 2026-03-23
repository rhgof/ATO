# PBO Australia's Tax Mix Dashboard — Design Spec

**Date:** 2026-03-23
**Data source:** PBO Australia's Tax Mix-Data.xlsx, sheet "Taxes 1901-2023"
**Source URL:** https://www.pbo.gov.au/sites/default/files/2024-11/PBO%20Australia%27s%20Tax%20Mix-Data.xlsx
**Pipeline output:** `Outputs/pbo-tax-mix.csv` (24,644 rows, 11 columns)

## Overview

A browser-based interactive dashboard exploring 122 years of Australian tax revenue data (1901-02 to 2022-23), covering both federal and state/territory/local government taxes. Built as a self-contained HTML/CSS/JS widget using Plotly.js — no build step, no framework.

## Data Preparation (in data.js)

### Exclude from charting

Subtotal/total rows that would cause double-counting:

- **Federal:** "Income taxation receipts total", "Indirect taxation receipts total", "Taxation receipts total"
- **State:** "Total tax", "Franchise taxes" (subtotal of liquor licences + other), "Motor Taxation - total" (subtotal of stamp duty + other)

Sub-component rows where a parent already captures them (federal):

- "Gross PAYE/PAYG withholding" (component of "Individuals and other withholding taxes")
- "Gross other individuals" (component of "Individuals and other withholding taxes")
- "Gross prescribed payments system" (component of "Individuals and other withholding taxes")
- "Individuals income tax - Individuals" (component of "Individuals and other withholding taxes")
- "Individuals income tax - Social services contribution" (component of "Individuals and other withholding taxes")
- "Gross income tax withholding" (component of "Individuals and other withholding taxes")
- "Individuals refunds" (component of "Individuals and other withholding taxes")
- "Medicare Levy" (component of "Individuals and other withholding taxes")
- "Other" (under Income taxation receipts — ambiguous, captured elsewhere)

### Federal tax group classification

Derived field `FederalGroup` for aggregate filtering:

| Group | Tax Names |
|-------|-----------|
| Individuals | Individuals and other withholding taxes |
| Company | Company tax |
| Indirect | Goods and services tax, Customs and Excise, Sales tax, Wine equalisation tax, Luxury car tax, Primary production taxes, Other taxes |
| Other Direct | Fringe benefits tax, Resource rent taxes, Superannuation taxes, Other income tax and withholding tax, Payroll tax |

### State tax categories

19 leaf-level categories after excluding subtotals (Total tax, Franchise taxes, Motor Taxation - total). Defunct taxes (zero in latest year) are hidden from Panels 1/2/3 by default, but available in Panel 4.

Defunct taxes: Entertainments, Financial institutions transactions taxes, Franchise taxes - liquor licences, Franchise taxes - other, Probate and succession duties, Special Income Tax, State Income and Dividend Taxes.

Note: Federal "Payroll tax" (abolished 1971) and state "Payroll tax" share the same name. The Pareto panel should distinguish them (e.g., "Payroll tax (Federal)" vs "Payroll tax (State)").

### For the Pareto panel

State taxes are summed across all jurisdictions per category per year to create a single national figure comparable with federal tax items.

## Architecture

Five-file structure per the interactive-dashboard pattern:

| File | Responsibility |
|------|---------------|
| `dashboard/index.html` | Container div, CDN script tags, init call |
| `dashboard/styles.css` | All styles, scoped with `.taxmix-` prefix |
| `dashboard/data.js` | Fetch CSV, parse, derive fields, aggregate, build metadata |
| `dashboard/charts.js` | Trace builders per panel, layout construction, interactions |
| `dashboard/controls.js` | State object, init, tabs, filter bar, year slider |

Namespace: `window.TaxMix`

Data loaded from: `data-csv-url` attribute on container div, pointing to `../Outputs/pbo-tax-mix.csv`

### Data-to-UI name mappings

- GovernmentLevel `"Australian Government"` → UI label "Federal"
- GovernmentLevel `"State/Territory/Local"` → UI label "State"
- Jurisdiction full names in data (e.g., "Queensland") → UI abbreviations (e.g., "QLD") where space is tight
- ValueThousands must be multiplied by 1,000 before applying $B/$M/$K formatting (e.g., ValueThousands 500,000 = $500M)

## Layout

```
+------------------------------------------------+
| Australia's Tax Mix 1901-2023                   |
| Source: PBO · pbo.gov.au · March 2026           |
+------------------------------------------------+
| [Overview] [Tax Mix] [Fed vs State] [Pareto] [Deep Dive] |
+------------------------------------------------+
| Filter Bar                                      |
| Gov Level: [Federal] [State] [Both]             |
| Federal Group: [x]Individuals [x]Company        |
|   [x]Indirect [x]Other Direct                   |
| Jurisdictions: [x]NSW [x]Vic [x]QLD [x]SA      |
|   [x]WA [x]Tas [x]NT [x]ACT                    |
+------------------------------------------------+
| Main Area (2x2 overview grid or single panel)   |
+------------------------------------------------+
```

## Panels

### Panel 1: Tax Mix Over Time (Stacked Area)

- **Question:** How has the composition of tax revenue changed over 122 years?
- **Chart:** Stacked area, X = Year (1901-2022), Y = Revenue ($'000)
- **Data:** One layer per tax. Government level toggle controls which taxes:
  - Federal: stacks the 4 federal groups (Individuals, Company, Indirect, Other Direct)
  - State: stacks active state tax categories (excluding defunct)
  - Both: two layers only (Federal total, State total) — same as Panel 2 but as stacked area. Too many layers if all categories combined.
- **Ordering:** Largest total at bottom (most stable visual base)
- **Interactions:** Hover tooltip with tax name, year, value

### Panel 2: Federal vs State Share (Line/Area)

- **Question:** How has tax power shifted between levels of government?
- **Chart:** Two areas/lines — total Federal vs total State/Territory/Local
- **Toggle:** Absolute ($) vs Percentage share
- **Data:** Sum all leaf-level federal taxes for federal total; sum all state taxes across jurisdictions for state total
- **Interactions:** Hover tooltip with level, year, value, percentage

### Panel 3: Tax Pareto (Bar + Cumulative Line)

- **Question:** What are the biggest taxes in a given year?
- **Chart:** Bars sorted largest to smallest (left to right), overlaid cumulative % line (right Y axis, 0-100%)
- **Year slider:** Select which fiscal year to display
- **Data:** All leaf-level taxes. State taxes summed across jurisdictions to create national totals. Federal and state taxes combined into one ranked list.
- **Government level toggle:** Federal only / State only / Both
- **Tooltip:** Tax name, value ($B/$M/$K), % of total, cumulative %

### Panel 4: Tax Deep Dive (Multi-line)

- **Question:** How has a specific tax evolved across jurisdictions over time?
- **Chart:** Multi-line, X = Year, Y = Revenue
- **Dropdown:** Select a specific tax category
- **Lines:** One per jurisdiction (for state taxes) or single line (for federal taxes)
- **Scope:** Full 122-year range. All taxes available including defunct/historical ones.
- **Jurisdiction checkboxes** filter which states appear
- **Interactions:** Hover tooltip with jurisdiction, year, value

## Overview Mode

- 2x2 grid of compact versions of all four panels
- Click any panel to drill into its detail tab
- No legends in overview — color dots in filter checkboxes serve as legend
- Pareto panel shows latest year in overview

## Filters

| Filter | Scope | Type |
|--------|-------|------|
| Government Level | Panels 1, 3 | Toggle: Federal / State / Both |
| Federal Group | Panel 1 (when Federal selected) | Checkboxes: Individuals, Company, Indirect, Other Direct |
| Jurisdictions | Panels 3 (state portion), 4 | Checkboxes with select all/none |
| Year | Panel 3 | Slider using YearStart (1901-2022), display as FiscalYear format (e.g., "2022-23") |
| Tax Category | Panel 4 | Dropdown |
| Absolute/Percentage | Panel 2 | Toggle |

## Value Formatting

- Values >= 1B: format as $X.XB
- Values >= 1M: format as $X.XM
- Values >= 1K: format as $X.XK
- Negative values (e.g., refunds): show with minus sign
- All source values are in $'000 (nominal, not inflation-adjusted). Note this in source attribution.

## Source Attribution

Header: "Australia's Tax Mix 1901-2023"
Subtitle: "Source: Parliamentary Budget Office · pbo.gov.au · Nominal dollars ($'000)"

## Technical Notes

- Plotly.js via CDN
- `automargin: true` on all axis titles + `Plots.resize()` after render
- No `overflow: hidden` on chart containers
- Debounced window resize handler (150ms)
- Stable color maps assigned on data load, not by filtered index
- Fixed axis ranges by default, autoscale toggle available
- PapaParse via CDN for CSV parsing
