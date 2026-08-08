# Strobe Server (Javascript)

Strobe is a platform for sharing photos with family and friends. It was developed for CAB432 Cloud Computing at the Queensland University of Technology.

With thanks to Jackson Riding for the development of Strobe Server.

This is the JavaScript implementation of Strobe Server. There is also a Python implementation.

Copyright (c) 2026 Queensland University of Technology

This software is not open source and remains property of the Queensland University of Technology. Unauthorised distribution is not permitted.

## Local development

From the server folder:

1. Install dependencies
2. Seed sample data
3. Start the development server

```bash
npm install
npm run seed
npm run dev
```

### Server URL Configuration (Important)

The Node server controls where this API listens and what public URLs it returns for generated upload links.

Copy `.env.example` to `.env` and edit:

```bash
PORT=3000
HOST=0.0.0.0
PUBLIC_BASE_URL=http://localhost:3000
```

The server automatically loads `.env` from this folder. Values already set in your shell take priority over `.env`.

- `PORT`: HTTP port the API listens on.
- `HOST`: Bind host (`0.0.0.0` for all interfaces, `127.0.0.1` for local-only).
- `PUBLIC_BASE_URL`: Optional absolute base URL used when generating upload URLs returned by this API.

If `PUBLIC_BASE_URL` is empty, upload URLs are returned as relative paths.

This does not change the React client's Connected API. Use `client/.env` or the login/signup screen API control for that.

Server URL:

```text
http://localhost:3000
```

Health check:

```text
GET http://localhost:3000/health
```

## Structure

```text
server/
├─ src/
│  ├─ index.js          # Express app entry point
│  ├─ config/           # App constants and setup
│  ├─ routes/           # API route definitions
│  ├─ controllers/      # Request and response handlers
│  ├─ services/         # Business logic
│  ├─ models/           # Data access layer
│  ├─ middleware/       # Auth and error handling
│  ├─ utils/            # Shared helpers
│  └─ scripts/          # Seed and utility scripts
├─ insomnia/
│  └─ strobe-openapi.yaml  # Insomnia import file
├─ db.json              # Local database file
└─ uploads/             # Uploaded files
```

## What each command does

- `npm install`: Install project dependencies
- `npm run seed`: Reset and seed local data
- `npm run dev`: Run API with auto reload (nodemon)
- `npm start`: Run API once with Node.js
- `npm test`: No automated tests configured
- `npm run lint`: Run ESLint

## Useful notes

- Seed uses `password123` for generated users.
- The first seeded user is a moderator.
- Protected routes require a bearer token in the Authorization header.
- Import insomnia/strobe-openapi.yaml into Insomnia for ready-to-use requests.

## Insomnia

Import this file:

```text
insomnia/strobe-openapi.yaml
```

Set base URL to:

```text
http://localhost:3000
```

For protected routes, send:

```text
Authorization: Bearer <token>
```
