import { ReactNode } from "react";
import { nearestIndex } from "../../charts/scales";
import { formatNumber } from "../../lib/format";
import styles from "./SlicedFigure.module.css";

interface SlicedFigureProps {
  /** Dimensions the figure is cut along, each getting a slider. */
  sliceDims: string[];
  coords: Record<string, number[]>;
  /** Positions the user picked. */
  slices: Record<string, number>;
  /** Positions the server actually used (defaults for unpicked dims). */
  usedSlices?: Record<string, number>;
  onSliceChange: (dim: string, value: number) => void;
  children: ReactNode;
}

const formatCoordinate = (value: number) => formatNumber(value, 4);

/**
 * A figure with a slider beside it for every dimension it is sliced along.
 * Sliders step through the actual grid points of each coordinate.
 */
const SlicedFigure = ({
  sliceDims,
  coords,
  slices,
  usedSlices,
  onSliceChange,
  children,
}: SlicedFigureProps) => (
  <div className={styles.slicedFigure}>
    <div className={styles.figureArea}>{children}</div>
    {sliceDims.length > 0 && (
      <aside className={styles.sliders} aria-label="Slice positions">
        {sliceDims.map((dim) => {
          const values = coords[dim] ?? [];
          const current =
            slices[dim] ?? usedSlices?.[dim] ?? values[values.length >> 1];
          const index = nearestIndex(values, current ?? 0);
          return (
            <label key={dim} className={styles.slider}>
              <span className={styles.sliderLabel}>
                {dim} = {formatCoordinate(values[index] ?? 0)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(values.length - 1, 0)}
                step={1}
                value={index}
                disabled={values.length < 2}
                onChange={(event) =>
                  onSliceChange(dim, values[Number(event.target.value)])
                }
              />
              <span className={styles.sliderRange}>
                <span>{formatCoordinate(values[0] ?? 0)}</span>
                <span>{formatCoordinate(values[values.length - 1] ?? 0)}</span>
              </span>
            </label>
          );
        })}
      </aside>
    )}
  </div>
);

export default SlicedFigure;
