# =============================================================================
# PBO Australia's Tax Mix - Data Pipeline
# =============================================================================
# Extracts and normalizes the "Taxes 1901-2023" sheet from the PBO Excel file
# into a clean long-format CSV suitable for interactive dashboards.
#
# Source: https://www.pbo.gov.au/sites/default/files/2024-11/PBO%20Australia%27s%20Tax%20Mix-Data.xlsx
#
# Stages:
#   01 - Ingest: read Excel, parse wide-format structure
#   02 - Normalize: pivot to long format, clean types, classify rows
#   06 - Output: final clean CSV
#
# Usage: Rscript pbo-tax-pipeline.R
# =============================================================================

library(readxl)
library(dplyr)
library(tidyr)
library(readr)

# -- Configuration -----------------------------------------------------------

inputFile <- "Inputs/PBO Australia's Tax Mix-Data.xlsx"
sheetName <- "Taxes 1901-2023"
pipelineName <- "pbo-tax"
pipelineDir <- "pipeline"
datePrefix <- format(Sys.Date(), "%Y%m%d")
outputFile <- "Outputs/pbo-tax-mix.csv"

# Row ranges for the two major sections
stateRows <- 8:248
fedRows <- 255:282

# Jurisdictions that appear as row labels under each state tax category
stateJurisdictions <- c("NSW", "Vic", "QLD", "SA", "WA", "Tas", "NT", "ACT", "Total")

# -- Helpers -----------------------------------------------------------------

makeFilename <- function(stage, description) {
  file.path(pipelineDir, paste0(datePrefix, "-", stage, "-", pipelineName, "-", description, ".csv"))
}

# =============================================================================
# Stage 01: Ingest
# =============================================================================
cat("== Stage 01: Ingest ==\n")

if (!file.exists(inputFile)) {
  stop("Input file not found: ", inputFile)
}

raw <- read_excel(inputFile, sheet = sheetName, col_names = FALSE)
cat("  Raw dimensions:", nrow(raw), "rows x", ncol(raw), "cols\n")

# Extract year headers from row 3, columns 5 onward
years <- as.character(raw[3, 5:ncol(raw)])
cat("  Years found:", length(years), "(", years[1], "to", tail(years, 1), ")\n")

# Extract the data area: col1 = label, col2 = units, cols 5+ = values
labels <- as.character(raw[[1]])
units <- as.character(raw[[2]])

# -- Parse State/Territory/Local section (rows 8-248) ------------------------

parseStateSection <- function(raw, rowRange, years) {
  results <- list()
  currentCategory <- NA_character_

  for (i in rowRange) {
    label <- labels[i]
    unit <- units[i]

    if (is.na(label)) next

    # If this row has no unit, it's a section header
    if (is.na(unit)) {
      currentCategory <- trimws(label)
      next
    }

    # Data row: jurisdiction with values
    jurisdiction <- trimws(label)
    values <- as.numeric(as.character(raw[i, 5:ncol(raw)]))

    results[[length(results) + 1]] <- tibble(
      GovernmentLevel = "State/Territory/Local",
      TaxCategory = currentCategory,
      Jurisdiction = jurisdiction,
      Unit = unit,
      Year = years,
      Value = values,
      Source = basename(inputFile)
    )
  }

  bind_rows(results)
}

# -- Parse Australian Government section (rows 255-282) ----------------------

parseFedSection <- function(raw, rowRange, years) {
  results <- list()
  currentCategory <- NA_character_

  for (i in rowRange) {
    label <- labels[i]
    unit <- units[i]

    if (is.na(label)) next

    # If no unit, it's a section header
    if (is.na(unit)) {
      currentCategory <- trimws(label)
      next
    }

    # Data row: tax line item with values
    taxName <- trimws(label)
    values <- as.numeric(as.character(raw[i, 5:ncol(raw)]))

    results[[length(results) + 1]] <- tibble(
      GovernmentLevel = "Australian Government",
      TaxCategory = currentCategory,
      Jurisdiction = "Australian Government",
      Unit = unit,
      Year = years,
      Value = values,
      Source = basename(inputFile),
      TaxName = taxName
    )
  }

  bind_rows(results)
}

stateData <- parseStateSection(raw, stateRows, years)
fedData <- parseFedSection(raw, fedRows, years)

# For state data, the TaxCategory is the tax name; for fed data, TaxName is more specific
# Unify: for state data, set TaxName = TaxCategory (the jurisdiction breakdown IS the detail)
stateData <- stateData |>
  mutate(TaxName = TaxCategory)

combined <- bind_rows(stateData, fedData)

cat("  State/Territory rows:", nrow(stateData), "\n")
cat("  Federal rows:", nrow(fedData), "\n")
cat("  Combined rows:", nrow(combined), "\n")

# Write raw combined
dir.create(pipelineDir, showWarnings = FALSE, recursive = TRUE)
write_csv(combined, makeFilename("01", "raw-combined"))
cat("  Written:", makeFilename("01", "raw-combined"), "\n")

# =============================================================================
# Stage 02: Normalize
# =============================================================================
cat("\n== Stage 02: Normalize ==\n")

normalized <- combined |>
  # Parse fiscal year: extract the start year as integer
  mutate(
    FiscalYear = Year,
    YearStart = as.integer(sub("-.*", "", Year)),
    YearEnd = YearStart + 1L
  ) |>
  # All values are in $'000 - convert to dollars for clarity
  mutate(
    ValueThousands = Value,
    ValueDollars = Value * 1000
  ) |>
  # Clean up jurisdiction names
  mutate(
    Jurisdiction = recode(
      Jurisdiction,
      "Vic" = "Victoria",
      "QLD" = "Queensland",
      "SA" = "South Australia",
      "WA" = "Western Australia",
      "Tas" = "Tasmania"
    )
  ) |>
  # Remove "Total" jurisdiction rows — validated as sum of state rows
  filter(Jurisdiction != "Total") |>
  # Select and order columns
  select(
    GovernmentLevel,
    TaxCategory,
    TaxName,
    Jurisdiction,
    FiscalYear,
    YearStart,
    YearEnd,
    Unit,
    ValueThousands,
    ValueDollars,
    Source
  ) |>
  arrange(GovernmentLevel, TaxCategory, TaxName, Jurisdiction, YearStart)

# Validation
cat("  Total rows:", nrow(normalized), "\n")
cat("  Non-NA values:", sum(!is.na(normalized$ValueThousands)), "\n")
cat("  NA values:", sum(is.na(normalized$ValueThousands)), "\n")
cat("  Year range:", min(normalized$YearStart), "-", max(normalized$YearStart), "\n")
cat("  Government levels:", paste(unique(normalized$GovernmentLevel), collapse = ", "), "\n")
cat("  Tax categories:", length(unique(normalized$TaxCategory)), "\n")
cat("  Jurisdictions:", paste(sort(unique(normalized$Jurisdiction)), collapse = ", "), "\n")

# Null rate per key column
nullRates <- normalized |>
  summarize(across(everything(), ~ mean(is.na(.x)))) |>
  pivot_longer(everything(), names_to = "Column", values_to = "NullRate") |>
  filter(NullRate > 0)

if (nrow(nullRates) > 0) {
  cat("  Columns with nulls:\n")
  for (i in seq_len(nrow(nullRates))) {
    cat(sprintf("    %-20s %.1f%%\n", nullRates$Column[i], nullRates$NullRate[i] * 100))
  }
}

write_csv(normalized, makeFilename("02", "normalized"))
cat("  Written:", makeFilename("02", "normalized"), "\n")

# =============================================================================
# Stage 06: Output
# =============================================================================
cat("\n== Stage 06: Output ==\n")

dir.create(dirname(outputFile), showWarnings = FALSE, recursive = TRUE)
write_csv(normalized, outputFile)
write_csv(normalized, makeFilename("06", "final"))

cat("  Final rows:", nrow(normalized), "\n")
cat("  Final columns:", ncol(normalized), "\n")
cat("  Column names:", paste(names(normalized), collapse = ", "), "\n")
cat("  Written:", outputFile, "\n")
cat("  Written:", makeFilename("06", "final"), "\n")

cat("\n== Pipeline complete ==\n")
