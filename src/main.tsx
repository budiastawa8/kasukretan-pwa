import React from "react";
import ReactDOM from "react-dom/client";
import { AppContextMenu } from "./components/layout/AppContextMenu";
import { UpdatePrompt } from "./components/pwa/UpdatePrompt";
import { BootstrapApp } from "./BootstrapApp";
import { applyUkuranTulisan, readUkuranTulisan } from "./lib/ukuran-tulisan";
import "./styles/globals.css";

applyUkuranTulisan(readUkuranTulisan());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BootstrapApp />
    <AppContextMenu />
    <UpdatePrompt />
  </React.StrictMode>
);
