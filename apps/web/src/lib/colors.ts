// Okabe-Ito derived categorical palette — colour-blind safe, works in light & dark.
export const SERIES = [
  '#0072B2', // blue
  '#E69F00', // orange
  '#009E73', // green
  '#CC79A7', // magenta
  '#D55E00', // vermillion
  '#56B4E9', // sky
  '#F0E442', // yellow
]

export const colorFor = (index: number) => SERIES[index % SERIES.length]
