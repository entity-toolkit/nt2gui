import { TabNode } from "flexlayout-react";
import { IPlotters, DataType } from "../global";
import SelectionMenu from "./SelectionMenu";

interface IPickDatatypeProps {
  node: TabNode;
  plotters: IPlotters;
  onDataTypeChange: (node_id: string, newDataType: DataType) => void;
}

const PickDatatype = (props: IPickDatatypeProps) => {
  const node_id = props.node.getId();
  return (
    <SelectionMenu
      options={[
        {
          label: "fields",
          onSelect: () => props.onDataTypeChange(node_id, DataType.Fields),
        },
        {
          label: "particles",
          disabled: true,
        },
      ]}
      helperText="Particle plots will be available soon."
    />
  );
};

export default PickDatatype;
