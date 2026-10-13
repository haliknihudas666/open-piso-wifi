# 🚀 OpenPisoWiFi — Standalone Next.js Showcase

This folder contains the standalone, production-ready landing page and showcase for the **OpenPisoWiFi** project, built using the same architecture as `portal/` (**Next.js 16, React 19, Tailwind CSS v4, Lucide Icons, and TypeScript**).

It is completely decoupled from the local captive portal (`portal/`), ready for independent deployment to Vercel or any Next.js host.

---

## ⚡ Quick Deployment on Vercel

1. Link your GitHub repository in [Vercel](https://vercel.com).
2. Set the **Root Directory** to `landing`.
3. Framework Preset: **Next.js** (automatically detected).
4. Deploy!

---

## 💻 Local Development

Run from this folder:
```bash
cd landing
bun install
bun run dev
```

Or from the repository root:
```bash
bun run dev:landing
```

Open `http://localhost:3001` in your browser. (Port `3001` is used so it does not collide with `portal` running on `3000`).
