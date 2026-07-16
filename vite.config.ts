import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig, loadEnv } from "vite"

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const apiTarget = env.VITE_API_TARGET || "http://localhost:8000"
  const rayDashboardTarget =
    env.VITE_RAY_DASHBOARD_TARGET || "http://localhost:8265"
  const prometheusTarget = env.VITE_PROMETHEUS_TARGET || "http://localhost:9090"
  const grafanaTarget = env.VITE_GRAFANA_TARGET || "http://localhost:3000"
  const mlflowTarget = env.VITE_MLFLOW_TARGET || "http://localhost:5000"
  const otelTarget = env.VITE_OTEL_TARGET || "http://localhost:4318"

  return {
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/ray-dashboard": {
          target: rayDashboardTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ray-dashboard/, ""),
        },
        "/prometheus": {
          target: prometheusTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/prometheus/, ""),
        },
        "/grafana": {
          target: grafanaTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/grafana/, ""),
        },
        "/mlflow": {
          target: mlflowTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/mlflow/, ""),
        },
        "/otel": {
          target: otelTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/otel/, ""),
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
    ],
  }
})
