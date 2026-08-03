import { useEffect, useState } from "react";
import { apiClient } from "../lib/apiClient";

type BackendStatus = "checking" | "online" | "offline";

function App() {
  const [status, setStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    apiClient
      .get("/health")
      .then(() => setStatus("online"))
      .catch(() => setStatus("offline"));
  }, []);

  return (
    <div className="p-4 font-sans">
      <h1 className="text-lg font-semibold text-slate-900">Universal Newsletter</h1>
      <p className="mt-2 text-sm text-slate-600">
        Backend status:{" "}
        <span
          className={
            status === "online"
              ? "text-green-600"
              : status === "offline"
                ? "text-red-600"
                : "text-slate-400"
          }
        >
          {status}
        </span>
      </p>
    </div>
  );
}

export default App;
