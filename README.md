# Attendance App (React + Node)

## Run (local)

Terminal 1 (backend):

    cd server
    npm install
    npm start        # http://localhost:5001

Terminal 2 (frontend):

    cd client
    npm install
    npm run dev      # http://localhost:5173

## Deploy

Backend (Render, root directory `server`):

- Build command: `npm install`
- Start command: `npm start`
- Environment variables: `NODE_ENV=production`, `JWT_SECRET`, `ADMIN_PASSWORD`, `CORS_ORIGIN` (Netlify site URL)

Frontend (Netlify, base directory `client`):

- Build command: `npm run build`
- Publish directory: `client/dist`
- Environment variable: `VITE_API_URL` (Render backend URL)
