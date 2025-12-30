import React from "react";

const menuItems = ["Add simulation", "Save state", "Load state", "Settings", "Help"];

const Menubar = () => {
  return (
    <nav className="menubar" aria-label="Application menu">
      <div className="menubar__items">
        {menuItems.map((item) => (
          <button key={item} type="button" className="menubar__button">
            {item}
          </button>
        ))}
      </div>
    </nav>
  );
};

export default Menubar;
