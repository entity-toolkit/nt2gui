import React, { useEffect, useRef } from "react";
import { ISimulation } from "../global";

const menuItems = [
  "Add simulation",
  "Save state",
  "Load state",
  "Settings",
  "Help",
];

interface MenubarProps {
  onAddSimulation: (path: string) => void;
  simulations: ISimulation[];
  onUnloadSimulation: (id: string) => void;
  isLoading: boolean;
}

const Menubar = ({
  onAddSimulation,
  simulations,
  onUnloadSimulation,
  isLoading,
}: MenubarProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("webkitdirectory", "true");
      fileInputRef.current.setAttribute("directory", "true");
    }
  }, []);

  const handleSelectDirectory = () => {
    fileInputRef.current?.click();
  };

  const handleMenuClick = (item: string) => {
    if (item === "Add simulation") {
      handleSelectDirectory();
    }
  };

  const handleDirectoryPicked = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const firstFile = files[0] as File & { webkitRelativePath?: string };
    const relativePath = firstFile.webkitRelativePath ?? "";
    const selectedDirectory = relativePath.split("/")[0] || firstFile.name;

    if (selectedDirectory) {
      onAddSimulation(selectedDirectory);
    }

    event.target.value = "";
  };

  return (
    <nav className="menubar" aria-label="Application menu">
      <div className="menubar__items">
        {menuItems.map((item) => (
          <button
            key={item}
            type="button"
            className="menubar__button"
            onClick={() => handleMenuClick(item)}
          >
            {item}
          </button>
        ))}
        <input
          ref={fileInputRef}
          type="file"
          className="menubar__file-input"
          onChange={handleDirectoryPicked}
        />
      </div>
      <div className="menubar__simulations" aria-live="polite">
        <div className="menubar__simulations-header">
          <span>Loaded simulations</span>
          {isLoading && <span className="menubar__status">Loading…</span>}
        </div>
        {simulations.length === 0 ? (
          <p className="menubar__empty">No simulations loaded</p>
        ) : (
          <ul className="menubar__simulation-list">
            {simulations.map((simulation) => (
              <li key={simulation.id} className="menubar__simulation-item">
                <span className="menubar__simulation-path">
                  {simulation.path}
                </span>
                <button
                  type="button"
                  className="menubar__unload"
                  onClick={() => onUnloadSimulation(simulation.id)}
                >
                  Unload
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
};

export default Menubar;
