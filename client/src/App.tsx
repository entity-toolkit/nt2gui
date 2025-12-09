import { useState, useEffect } from "react";
import "./App.css";

const SERVER_URL = "http://localhost:5000";

const App = () => {
  const [count, setCount] = useState(0);

  const requestServer = async (endpoint: string) => {
    const response = await fetch(`${endpoint}`);
    const data = await response.json();
    return data;
  };

  useEffect(() => {
    requestServer(`${SERVER_URL}`).then((data) => {
      document.querySelector("#content")!.innerHTML = data.message;
    });
  }, []);

  return (
    <>
      <div id="content"></div>
    </>
  );
};

export default App;
