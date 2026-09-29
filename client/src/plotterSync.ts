import { IJsonModel } from "flexlayout-react";
import { DataType, IPlotters, PlotType } from "./global";

type LayoutNode = {
  id?: string;
  type?: string;
  component?: string;
  children?: LayoutNode[];
};

export const collectPanelIds = (layout: IJsonModel): Set<string> => {
  const panelIds = new Set<string>();

  const walk = (node: LayoutNode | undefined) => {
    if (!node) return;

    if (node.type === "tab" && node.component === "panel" && node.id) {
      panelIds.add(node.id);
    }

    node.children?.forEach(walk);
  };

  walk(layout.layout as LayoutNode);
  layout.borders?.forEach((border) => walk(border as LayoutNode));

  return panelIds;
};

export const reconcilePlotters = (
  plotters: IPlotters,
  panelIds: Set<string>,
): IPlotters => {
  let hasChanges = false;
  const nextPlotters: IPlotters = { ...plotters };

  panelIds.forEach((id) => {
    if (!nextPlotters[id]) {
      hasChanges = true;
      nextPlotters[id] = {
        plotType: PlotType.None,
        dataType: DataType.None,
        useGlobalViewport: true,
        localViewport: null,
      };
    }
  });

  Object.keys(nextPlotters).forEach((id) => {
    if (!panelIds.has(id)) {
      hasChanges = true;
      delete nextPlotters[id];
    }
  });

  return hasChanges ? nextPlotters : plotters;
};
