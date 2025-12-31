import { TabNode } from "flexlayout-react";
import { IPlotters, DataType } from "../global";

interface IPickDatatypeProps {
  node: TabNode;
  plotters: IPlotters;
  onDataTypeChange: (node_id: string, newDataType: DataType) => void;
}

const PickDatatype = (props: IPickDatatypeProps) => {
  const node_id = props.node.getId();
  return (
    <div className="add-plot-menu">
      <input
        type="button"
        value="fields"
        onClick={() => props.onDataTypeChange(node_id, DataType.Fields)}
      />
      <input type="button" value="particles" disabled />
      <small className="helper-text">
        Particle plots will be available soon.
      </small>
    </div>
  );
};

export default PickDatatype;
