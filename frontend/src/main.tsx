import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { HomeView } from "./views/HomeView";
import { DetailView } from "./views/DetailView";
import { EditView } from "./views/EditView";
import { InventoryView } from "./views/InventoryView";
import { BottleneckView } from "./views/BottleneckView";
import { prefs } from "./lib/prefs";
import "./theme.css";

// Apply the saved theme before first paint so there's no dark→light flash.
// `color-scheme` keeps native controls (selects, scrollbars) in step with it.
const _theme = prefs.theme.get();
document.documentElement.dataset.theme = _theme;
document.documentElement.style.colorScheme = _theme;

// useBlocker (編集フォームの離脱ガード) は data router でしか動かないため、
// BrowserRouter ではなく createBrowserRouter + RouterProvider を使う。
// App はカタログの provider 兼レイアウトとして <Outlet /> を描画する。
// One QueryClient for the app. LAN-only single user, so keep it conservative:
// one retry (snappy error feedback over resilience), and no window-focus refetch
// — the catalog is polled explicitly from the header controls.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: "/", element: <HomeView /> },
      { path: "/d/:id", element: <DetailView /> },
      { path: "/d/:id/edit", element: <EditView mode="edit" /> },
      { path: "/add", element: <EditView mode="add" /> },
      { path: "/inventory", element: <InventoryView /> },
      { path: "/analysis", element: <BottleneckView /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
