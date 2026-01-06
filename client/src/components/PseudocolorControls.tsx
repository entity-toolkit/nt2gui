import React, { useEffect, useMemo } from "react";
import { defaultPseudocolorConfig, IPseudocolorConfig } from "../global";
import styles from "./PseudocolorControls.module.css";

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
    <div className={styles.pseudocolorGrid}>
      <div className={styles.formSection}>
        <div className={styles.formRow}>
          <div className={styles.formControl}>
            <label htmlFor="field-select">field</label>
            <input
              id="field-select"
              type="text"
              placeholder="density"
              value={config.field}
              onChange={(e) => handleInputChange("field", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className={styles.formSection}>
        <div className={styles.formRow}>
          <div className={styles.formControl}>
            <label>coordinates</label>
            <input
              id="x-coordinate"
              type="text"
              placeholder="x"
              value={config.xCoordinate}
              onChange={(e) => handleInputChange("xCoordinate", e.target.value)}
            />
            <input
              id="y-coordinate"
              type="text"
              placeholder="y"
              value={config.yCoordinate}
              onChange={(e) => handleInputChange("yCoordinate", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className={styles.formSection}>
        <div className={styles.formRow}>
          <div className={styles.formControl}>
            <label htmlFor="vmin">min/max</label>
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
              step="0.01"
            />
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
              step="0.01"
            />
          </div>
        </div>
      </div>

      <div className={styles.formSection}>
        <div className={styles.formRow}>
          <div className={styles.formControl}>
            <label htmlFor="colorbar">colormap</label>
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
