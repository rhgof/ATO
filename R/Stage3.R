library(tidyverse)
library(scales)
library(RUtils)



lastRow <- tribble(
  ~"TaxPercent",    ~"Current",       ~"Stage 3",       ~"July 2024",
#  0,0,0,0,
  0.450001, 100000,100000,100000
)

taxRatesRaw <- read_csv(inputFile("202425TaxRates.csv"))
taxRates <- taxRatesRaw |>
  mutate(Categories = str_replace_all(Categories,"\\%","")) |>
  mutate(Categories = parse_number(Categories,na=character())/100) |>
  rename(TaxPercent = Categories) |>
  rename(`July 2024` = `Albanese plan`) |>
  bind_rows(lastRow)

taxRates <- taxRates |>
  pivot_longer(cols = !TaxPercent, names_to = "TaxPlan", values_to = "IncomeWidth") |>
  group_by(TaxPlan) |>
  arrange(TaxPercent) |>
  mutate(IncomeBandUpper = cumsum(IncomeWidth)) |>
  mutate(IncomeBandLower = lag(IncomeBandUpper,default=0))|>
  mutate(TaxForBand = TaxPercent * IncomeWidth) |>
  filter(IncomeWidth != 0) |>
  ungroup()

taxRates <- taxRates |>
  filter(TaxPlan != "Stage 3")


chart <- ggplot(taxRates, aes(x=IncomeBandLower,y=TaxPercent,group=TaxPlan,color=TaxPlan))  +
  geom_step(linewidth=1,show.legend = TRUE) +
  geom_text(mapping = aes(label = sprintf("%2.0f%%",TaxPercent*100)),hjust=1,vjust=-1,size=3,fontface="bold",show.legend =FALSE) +
#  facet_wrap(~TaxPlan,ncol=1) +
  scale_y_continuous("Tax Rate", labels = scales::label_percent()) +
  scale_x_continuous("\nTaxable Income",breaks=seq(0,300000,25000),labels = scales::label_dollar()) +
  ggtitle("Australian Tax Rates - Current, New from July 2024") +
  scale_color_discrete(name = "Tax Rates") +
  customTheme() +
  theme(
    legend.position = c(0.1,0.8),
    axis.title.x = element_text(),
    strip.text = element_text(face="bold"),
  )


chart
saveHorizChart(fileName = "TaxRates",chart)

taxPaid <- function(income,taxRates) {
  #  print(income)
  #  print(taxRates )
  taxPaid = 0
  if (income == 0.0) return(taxPaid)
  for (i in 1:length(taxRates)) {
    band = taxRates[i,]
    if (income > band$IncomeBandUpper ) {
      taxPaid = taxPaid + band$TaxForBand
    } else if (income <= band$IncomeBandUpper && income > band$IncomeBandLower) {
      taxPaid = taxPaid + (income-band$IncomeBandLower)*band$TaxPercent
      break
    }
  }
  return(taxPaid)
}


taxPaid(100000, filter(taxRates, TaxPlan == "Current"))
taxPaid(145000, filter(taxRates, TaxPlan == "Current"))
taxPaid(200000, filter(taxRates, TaxPlan == "Current"))

lastIncomeRow <- tribble(
    ~"Income",    ~"Percentage",       ~"NoTaxpayers",
    0.0,0.0,0.0
)

incomeBands <- read_csv(inputFile("202425TaxBands-Percent.csv")) |>
  select(-`X.1`) |>
  mutate(Income = str_replace(Income,"K","")) |>
  mutate(Income = str_replace(Income,"\\+","260")) |>
  mutate(Income = parse_number(Income,na=character())*1000) |>
  mutate(Percentage = str_replace_all(Percentage,"\\%","")) |>
  mutate(Percentage = parse_number(Percentage,na=character())/100) |>
  mutate(NoTaxpayers = 15000000*Percentage) |>
  bind_rows(lastIncomeRow) |>
  arrange(Income)

#incomeBands


# ------


for (taxPlan in unique(taxRates$TaxPlan)) {
  print(taxPlan)
  incomeBands <- incomeBands |>
    rowwise() |>
    mutate({{taxPlan}} := taxPaid(Income,filter(taxRates,TaxPlan == taxPlan)))
}

incomeBandsDiffs <- incomeBands |>
  mutate(DiffProposed = Current - Proposed) |>
  mutate(DiffStage3 = Current-`Stage 3`) |>
  select(-c(Proposed,`Stage 3`)) |>
  mutate(Current = 0) |>
  rename(Proposed = DiffProposed, `Stage 3`= DiffStage3) |>
  pivot_longer(cols=!c("Income",   "Percentage", "NoTaxpayers"),
               names_to = "TaxPlan",
               values_to = "TaxDiff") |>
  group_by(TaxPlan) |>
  mutate(PercentOfIncome = ifelse(Income >0,TaxDiff/Income*100,0)) |>
  mutate(CumTaxPayers = cumsum(NoTaxpayers)) |>
  mutate(CumPercent = cumsum(Percentage))

incomeBands <- incomeBands |>
  pivot_longer(cols=!c("Income",   "Percentage", "NoTaxpayers"),
               names_to = "TaxPlan",
               values_to = "TaxPaid") |>
  group_by(TaxPlan) |>
  mutate(CumTaxPayers = cumsum(NoTaxpayers)) |>
  mutate(CumPercent = cumsum(Percentage))

incomeBands <- incomeBands |>
  mutate(CumPercentLag = lag(CumPercent,default = 0))

chart <- ggplot(incomeBands, aes(x=Income,y=TaxPaid,group=TaxPlan,color=TaxPlan))  +
  geom_line(linewidth = 1, alpha = 0.8) +
  geom_text(
    incomeBands,
    #filter(incomeBands,TaxPlan=="Current" & CumPercent <=0.90),
            mapping = aes(y=50000,label = sprintf("%2.0f%%",CumPercent*100)),color="grey30",vjust="top",nudge_y = -1000,size=2.5) +
  #  facet_wrap(~TaxPlan,ncol=1) +
  scale_y_continuous( "Tax Paid ($K)",breaks = seq(0,100000,25000),labels=scales::number(seq(0,100000,25000)/1000),
                      limits=c(0,NA), expand = c(0,0) )+
  scale_x_continuous("\nTaxable Income ($K)",
    breaks=unique(incomeBands$Income),labels=unique(incomeBands$Income/1000),
    #limits = c(0, 14996849)
    ) +
  ggtitle("Tax Cuts - Current, Stage 3, Proposed by Labor",
          #"Width of lines show % of taxpayers for that taxable income"
          ) +
  labs(caption = makeCaption("Source: ATO, Grattan Institute")) +
  customTheme() +
  theme(
    axis.title.x = element_text(),
    legend.position = c(0.1,0.9),
  )

chart
saveHorizChart(fileName = "Stage3-IncomeBands",chart)

chart <- ggplot(incomeBands, aes(x=CumTaxPayers,y=TaxPaid,group=TaxPlan,color=TaxPlan))  +
  geom_step(linewidth = 1, alpha = 0.8) +
  geom_text(
    #incomeBands,
    filter(incomeBands,TaxPlan=="Current" & CumPercent <=0.90),
    mapping = aes(y=50000,label = sprintf("%2.0f%%",CumPercent*100)),color="grey30",vjust="top",nudge_y = -1000,size=2.5) +
  #  facet_wrap(~TaxPlan,ncol=1) +
  scale_y_continuous( "Tax Paid ($K)",breaks = seq(0,100000,25000),labels=scales::number(seq(0,100000,25000)/1000),
                      limits=c(0,NA), expand = c(0,0) )+
  scale_x_continuous("\nTaxable Income ($K)",
                     breaks=unique(incomeBands$CumTaxPayers),labels=unique(incomeBands$Income/1000),
                     #limits = c(0, 14996849)
  ) +
  ggtitle("Tax Cuts - Current, Stage 3, Proposed by Labor",
          "Width of columns show % of taxpayers for that taxable income") +
  labs(caption = makeCaption("Source: ATO, Grattan Institute")) +
  customTheme() +
  theme(
    axis.title.x = element_text(),
    legend.position = c(0.1,0.9),
  )

chart
saveHorizChart(fileName = "Stage3-PercentBands",chart)

#----------
chart <- ggplot(incomeBands, aes(x=Income,y=(Income-TaxPaid),group=TaxPlan,fill=TaxPlan))  +
  geom_col(linewidth = 1, alpha = 0.9,position="dodge") +
  geom_text(
    incomeBands,
    #filter(incomeBands,TaxPlan=="Current" & CumPercent <=0.90),
    mapping = aes(y=0,label = sprintf("%2.0f%%",CumPercent*100)),color="white",vjust="bottom",nudge_y = 1000,size=2.5) +
  #  facet_wrap(~TaxPlan,ncol=1) +
  scale_y_continuous( "Income after Tax ($K)",breaks = seq(0,250000,25000),labels=scales::label_dollar(suffix="K",scale=0.001),
                      limits=c(0,NA), expand = c(0,0) )+
  scale_x_continuous("\nTaxable Income ($K)",
                     breaks=unique(incomeBands$Income),labels=unique(incomeBands$Income/1000),
                     #limits = c(0, 14996849)
  ) +
  ggtitle("Income After Tax by Taxable Income - Current, Proposed, Stage 3",
          "Also showing cumulative % of taxpayers for that taxable income"
          ) +
  labs(caption = makeCaption("Source: ATO, Grattan Institute")) +
  customTheme() +
  theme(
    axis.title.x = element_text(),
    legend.position = c(0.1,0.9),
  )

chart
saveHorizChart(fileName = "Stage3-NetIncome",chart)

#----------
chart <- ggplot(incomeBands, aes(x=Income,y=(TaxPaid),group=TaxPlan,fill=TaxPlan))  +
  geom_col(linewidth = 1, alpha = 0.9,position="dodge") +
  geom_text(
    incomeBands,
    #filter(incomeBands,TaxPlan=="Current" & CumPercent <=0.90),
    mapping = aes(y=0,label = sprintf("%2.0f%%",CumPercent*100)),color="white",vjust="bottom",nudge_y = 1000,size=2.5) +
  #  facet_wrap(~TaxPlan,ncol=1) +
  scale_y_continuous( "Income Tax ($K)",breaks = seq(0,250000,5000),labels=scales::label_dollar(suffix="K",scale=0.001),
                      limits=c(0,NA), expand = c(0,0) )+
  scale_x_continuous("\nTaxable Income ($K)",
                     breaks=unique(incomeBands$Income),labels=unique(incomeBands$Income/1000),
                     #limits = c(0, 14996849)
  ) +
  ggtitle("Income Tax by Taxable Income- Current, Proposed, Stage 3",
          "Also showing cumulative % of taxpayers for that taxable income"
  ) +
  labs(caption = makeCaption("Source: ATO, Grattan Institute")) +
  customTheme() +
  theme(
    axis.title.x = element_text(),
    legend.position = c(0.1,0.9),
  )

chart
saveHorizChart(fileName = "Stage3-TaxPaid",chart)

#---- Benefit by Tax Band ------
chart <- ggplot(incomeBandsDiffs, aes(x=Income,y=(TaxDiff),group=TaxPlan,fill=TaxPlan))  +
  geom_col(linewidth = 1, alpha = 0.9,position="dodge") +
  geom_text(
    incomeBandsDiffs,
    #filter(incomeBands,TaxPlan=="Current" & CumPercent <=0.90),
    mapping = aes(y=0,label = sprintf("%2.0f%%",CumPercent*100)),color="black",vjust="bottom",nudge_y = 100,size=2.5) +
  #  facet_wrap(~TaxPlan,ncol=1) +
  scale_y_continuous( "Annual Benefit of Tax Cuts",breaks = seq(0,250000,1000),labels=scales::label_dollar(),
                      limits=c(0,10000), expand = c(0,0) )+
  scale_x_continuous("\nTaxable Income ($K)",
                     breaks=unique(incomeBandsDiffs$Income),labels=unique(incomeBandsDiffs$Income/1000),
                     #limits = c(0, 14996849)
  ) +
  ggtitle("Annual Tax Cuts by Taxable Income- Current, Proposed, Stage 3",
          "Also showing cumulative % of taxpayers for that taxable income"
  ) +
  labs(caption = makeCaption("Source: ATO, Grattan Institute")) +
  customTheme() +
  theme(
    axis.title.x = element_text(),
    legend.position = c(0.1,0.9),
  )

chart
saveHorizChart(fileName = "Stage3-Benefits",chart)

#---- Percent of Income Tax Band ------
chart <- ggplot(incomeBandsDiffs, aes(x=Income,y=(PercentOfIncome),group=TaxPlan,fill=TaxPlan))  +
  geom_col(linewidth = 1, alpha = 0.9,position="dodge") +
  geom_text(
    incomeBandsDiffs,
    mapping = aes(y=0,label = sprintf("%2.0f%%",CumPercent*100)),
    color="black",vjust="bottom",nudge_y = .1,size=2.5) +
  scale_y_continuous( "Percent Benefit of Tax Cuts",
                      labels=scales::label_percent(scale=1,accuracy=0.1),
                      expand = c(0,0)
                      )+
  scale_x_continuous("\nTaxable Income ($K)",
                     breaks=unique(incomeBandsDiffs$Income),labels=unique(incomeBandsDiffs$Income/1000),
                     #limits = c(0, 14996849)
  ) +
  ggtitle("Percent of Income as Tax Cuts by Taxable Income - Current, Proposed, Stage 3",
          "Also showing cumulative % of taxpayers for that taxable income"
  ) +
  labs(caption = makeCaption("Source: ATO, Grattan Institute")) +
  customTheme() +
  theme(
    axis.title.x = element_text(),
    legend.position = c(0.1,0.9),
  )

chart
saveHorizChart(fileName = "Stage3-PercentBenefit",chart)


#----Rectangles ------
chart <- ggplot(incomeBands,aes(group=TaxPlan,
                                color=TaxPlan,


                                #fill=TaxPlan,
                                ))  +
  geom_rect(linewidth = 0.5,
            alpha=0.1,
            #fill = NA,
            mapping=aes(xmin=CumPercentLag,xmax=CumPercent,ymax=TaxPaid,ymin=0 )
  ) +
   geom_text(
     incomeBands,
     #filter(incomeBands,TaxPlan=="Current" & CumPercent <=0.90),
     mapping = aes(x=CumPercent, y=0,label = sprintf("%2.0f%%",CumPercent*100)),color="black",vjust="bottom",nudge_y = 1000,size=2.5) +

   scale_y_continuous( "Net Income ($)",breaks = seq(0,250000,25000),labels=scales::label_dollar(suffix="K",scale=0.001),
                       limits=c(0,NA), expand = c(0,0) )+
   scale_x_continuous("\nTaxable Income ($)",
                      breaks=unique(incomeBands$CumPercent),labels=sprintf("%iK",unique(incomeBands$Income)/1000),
  #                    #limits = c(0, 14996849)
   ) +
  #
  ggtitle("Net Income by Taxable Income- Current, Proposed, Stage 3",
          "Also showing cumulative % of taxpayers for that taxable income"
  ) +
  labs(caption = makeCaption("Source: ATO, Grattan Institute")) +
  customTheme() +
  theme(
    axis.title.x = element_text(),
    legend.position = c(0.1,0.9),
  )

chart
saveHorizChart(fileName = "Stage3-Rectangles",chart)
