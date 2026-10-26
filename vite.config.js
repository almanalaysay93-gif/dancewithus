import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { createGas } from "./dev/gas-shim.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// Dev only: /api runs apps-script/Code.gs locally against dev/.data/sheets.json.
const localAppsScript = {
  name: "local-apps-script",
  apply: "serve",
  configureServer(server) {
    const gas = createGas({
      codePath: here("./apps-script/Code.gs"),
      dataPath: here("./dev/.data/sheets.json"),
      props: { ADMIN_PASSWORD: process.env.STEPFIT_ADMIN_PASSWORD || "stepfit-dev" },
    });
    server.middlewares.use("/api", (req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let out;
        try {
          out = req.method === "POST" ? gas.post(body) : gas.get(Object.fromEntries(new URL(req.url, "http://dev").searchParams));
        } catch (e) {
          console.error(e);
          out = { ok: false, error: "server" };
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(out));
      });
    });
  },
};

// GitHub Pages serves this repo at /dancewithus/. Local dev and previews stay at /.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/dancewithus/" : "/",
  plugins: [localAppsScript],
  build: {
    rollupOptions: {
      input: { main: here("./index.html"), admin: here("./admin.html") },
    },
  },
});
