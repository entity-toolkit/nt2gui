export enum DataType {
  None = 'none',
  Fields = 'fields',
  Particles = 'particles',
}

export enum PlotType {
  None = 'none',
  Line = 'line',
  Pseudocolor = 'pseudocolor',
};

export interface IPlotter {
  plotType: PlotType;
  dataType: DataType;
}

export interface IPlotters {
  [key: string]: IPlotter;
}
