import React, { useEffect, useMemo } from "react";
import { defaultPseudocolorConfig, IPseudocolorConfig } from "../global";

interface PseudocolorControlsProps {
  config: IPseudocolorConfig;
  onChange: (config: IPseudocolorConfig) => void;
}

const colorMaps = ["viridis", "plasma", "cividis", "turbo", "magma"];

const PseudocolorControls: React.FC<PseudocolorControlsProps> = ({
  config,
  onChange,
}) => {
  const defaults = useMemo(() => defaultPseudocolorConfig, []);

  useEffect(() => {
    const updates: Partial<IPseudocolorConfig> = {};

    if (!config.xCoordinate) {
      updates.xCoordinate = defaults.xCoordinate;
    }

    if (!config.yCoordinate) {
      updates.yCoordinate = defaults.yCoordinate;
    }

    if (Object.keys(updates).length) {
      onChange({ ...config, ...updates });
    }
  }, [config, defaults.xCoordinate, defaults.yCoordinate, onChange]);
  const handleInputChange = <K extends keyof IPseudocolorConfig>(
    key: K,
    value: IPseudocolorConfig[K],
  ) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="pseudocolor-grid">
      <div className="form-section">
        <div className="form-row">
          <div className="form-control">
            <label htmlFor="field-select">Field</label>
            <input
              id="field-select"
              type="text"
              placeholder="e.g. density"
              value={config.field}
              onChange={(e) => handleInputChange("field", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-row">
          <div className="form-control">
            <label htmlFor="x-coordinate">X</label>
            <input
              id="x-coordinate"
              type="text"
              placeholder="e.g. x"
              value={config.xCoordinate}
              onChange={(e) => handleInputChange("xCoordinate", e.target.value)}
            />
          </div>
          <div className="form-control">
            <label htmlFor="y-coordinate">Y</label>
            <input
              id="y-coordinate"
              type="text"
              placeholder="e.g. y"
              value={config.yCoordinate}
              onChange={(e) => handleInputChange("yCoordinate", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-row">
          <div className="form-control">
            <label htmlFor="vmin">vmin</label>
            <input
              id="vmin"
              type="number"
              placeholder={defaults.vmin?.toString() ?? "auto"}
              value={config.vmin ?? ""}
              onChange={(e) =>
                handleInputChange(
                  "vmin",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
            />
          </div>
          <div className="form-control">
            <label htmlFor="vmax">vmax</label>
            <input
              id="vmax"
              type="number"
              placeholder={defaults.vmax?.toString() ?? "auto"}
              value={config.vmax ?? ""}
              onChange={(e) =>
                handleInputChange(
                  "vmax",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-row">
          <div className="form-control">
            <label htmlFor="colorbar">Map</label>
            <select
              id="colorbar"
              value={config.colorMap}
              onChange={(e) => handleInputChange("colorMap", e.target.value)}
            >
              {colorMaps.map((map) => (
                <option key={map} value={map}>
                  {map}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PseudocolorControls;
