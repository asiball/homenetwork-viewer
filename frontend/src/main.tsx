import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import App from "./App";
import { HomeView } from "./views/HomeView";
import { DetailView } from "./views/DetailView";
import { EditView } from "./views/EditView";
import "./theme.css";

// useBlocker (編集フォームの離脱ガード) は data router でしか動かないため、
// BrowserRouter ではなく createBrowserRouter + RouterProvider を使う。
// App はカタログの provider 兼レイアウトとして <Outlet /> を描画する。
const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: "/", element: <HomeView /> },
      { path: "/d/:id", element: <DetailView /> },
      { path: "/d/:id/edit", element: <EditView mode="edit" /> },
      { path: "/add", element: <EditView mode="add" /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
