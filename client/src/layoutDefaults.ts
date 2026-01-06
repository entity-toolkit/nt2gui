import { IJsonModel } from "flexlayout-react";
import { IUiState } from "./global";

export const initialLayout: IJsonModel = {
  global: {
    splitterEnableHandle: true,
    tabEnablePopout: false,
    tabSetMinWidth: 130,
    tabSetMinHeight: 100,
    tabSetEnableTabScrollbar: true,
    borderMinSize: 100,
    borderEnableTabScrollbar: true,
  },
  // borders: [
  //   {
  //     type: "border",
  //     location: "bottom",
  //     children: [
  //       {
  //         type: "tab",
  //         name: "JSON",
  //         component: "json",
  //         enableClose: false,
  //       },
  //     ],
  //   },
  // ],
  layout: {
    type: "row",
    children: [],
  },
  popouts: {},
};

export const initialUiState: IUiState = {
  layout: initialLayout,
  plotters: {},
  timeline: {
    current: 0,
    min: 0,
    max: 100,
    step: 1,
  },
  globalViewport: null,
};
