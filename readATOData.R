suppressMessages(library(tidyverse))
suppressMessages(library(readxl))


files <- tribble(
  ~FY, ~Path, ~`Tax`, ~PRRT, ~Range, ~LateSheets,
   "2013-14", "~/Documents/Stats/ATO/2013-14corporate-report-of-entity-tax-information.xlsx", "Combined", "", c(2, NA), "",
   "2014-15", "~/Documents/Stats/ATO/2014-15-corporate-report-of-entity-tax-information.xlsx","2014-15", "PRRT", c(1, 1905),c("2013-14"),
  "2015-16", "~/Documents/Stats/ATO/2015-16-corporate-report-of-entity-tax-information.xlsx","2015-16", "PRRT", c(1,2042),c("2013-14","2014-15"),
  "2016-17", "~/Documents/Stats/ATO/2016-17-corporate-report-of-entity-tax-information.xlsx","Income tax details", "PRRT details", c(1, NA),"",
   "2017-18", "~/Documents/Stats/ATO/2017-18-corporate-report-of-entity-tax-information.xlsx","Income tax", "PRRT", c(1, NA),"",
   "2018-19", "~/Documents/Stats/ATO/2018-19-corporate-report-of-entity-tax-information.xlsx","Income tax details", "PRRT details", c(1, NA),"",
  "2019-20", "~/Documents/Stats/ATO/2019-20-corporate-report-of-entity-tax-information.xlsx","Income tax details", "PRRT details", c(1, NA),"",
  "2020-21", "~/Documents/Stats/ATO/2020-21-corporate-report-of-entity-tax-information.xlsx","Income tax details", "PRRT details", c(1, NA),"",
)



colNames <- c("Name", "ABN", "Total income $", "Taxable income $", "Tax payable $",  "Income year")

allYears = NULL

for (fy in files$FY) {
  r <-  files[files$`FY` == fy,]
#  print(r)

  data <- read_xlsx(r$Path,sheet = r$Tax,range = cell_rows(r$Range[[1]]))
  data <- data %>%
    mutate(`Income year` = fy)
  colnames(data) <- colNames

  data <- select(data,all_of(colNames))

  latedata = NULL
  for( lfy in r$LateSheets[[1]] ) {
    if (lfy != "") {
      latedata <- read_xlsx(r$Path,sheet = lfy,skip=1)
      latedata <- latedata %>%
        mutate(`Income year` = lfy)
      colnames(latedata) <- colNames
    }
  }
  data <- bind_rows(data,latedata)

  allYears <- bind_rows(data,allYears)

}





allYears <- allYears %>%
  replace_na(list(`Total income $` = 0, `Taxable income $`=0,`Tax payable $`=0))


write_csv(allYears,"./ATO-AllYears.csv")
