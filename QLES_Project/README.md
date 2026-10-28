# QLES — Queue and Live Estimation System

A runnable student project for tracking hospital queues, discovering doctors, booking/cancelling tokens, and managing queues through an administrator dashboard.

## Features

- Patient registration and login
- Separate administrator login and dashboard
- Sample hospitals, doctors, schedules, and demo patients
- Search/filter doctors by hospital, specialty, and status
- Book and cancel tokens
- My Bookings page with token, queue position, and estimated waiting time
- Queue updates reflected automatically by polling the API every 8 seconds
- Admin controls for doctor availability and queue progress
- SQLite database that persists data locally
- Password hashing and session-based authentication

## Important demo-data notice

The included hospitals, doctors, appointments, and queue updates are **sample/demo data**. The periodic queue refresh is simulated from the local SQLite database; it is not connected to any real hospital system, live hospital API, or electronic medical record. Waiting times are estimates based on the queue and the configured average consultation duration. Do not use this demo to make urgent medical decisions.

## Requirements

- Node.js 18 or later
- npm (included with Node.js)
- VS Code (recommended)

## Run in VS Code

1. Extract `QLES_Project.zip`.
2. Open the extracted `QLES_Project` folder in VS Code.
3. Open **Terminal → New Terminal**.
4. Install dependencies:

   ```bash
   npm install
   ```

5. Start the server:

   ```bash
   npm start
   ```

6. Open http://localhost:3000 in your browser.

The SQLite database is created automatically in the `data/` folder on first launch and seeded with demo records.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Patient | `patient@qles.demo` | `Patient123!` |
| Administrator | `admin@qles.demo` | `Admin123!` |

Change demo passwords and add proper security controls before any real deployment.

## Using the application

### Patient
- Register a new account or sign in using the demo patient account.
- Browse doctors, select a date and book a token.
- Open **My bookings** to see token number, queue position and estimated waiting time.
- Cancel a booking while it is still active.

### Administrator
- Sign in using the administrator demo account.
- Open **Admin dashboard**.
- Update a doctor's status or mark the next patient as served.
- Changes are stored in SQLite and appear on patient pages after the next refresh.

## Waiting-time estimate

Estimated wait = patients ahead × doctor's average consultation duration. It is an approximation and does not account for emergencies, breaks, variable consultation lengths, or delays.

## Project structure

```text
QLES_Project/
├── server.js
├── package.json
├── README.md
├── data/                 # SQLite DB created at runtime
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```

## Troubleshooting

- **`npm` is not recognized:** install Node.js LTS from https://nodejs.org and restart VS Code.
- **Port 3000 is busy:** run PowerShell with `$env:PORT=3001; npm start`, then open http://localhost:3001.
- **Dependency install fails:** use a current Node.js LTS version and run `npm install` again.
- **Reset demo data:** stop the server, delete `data/qles.sqlite` and `data/sessions.sqlite` if present, then run `npm start` again. This deletes locally stored demo accounts and bookings.

## For a real hospital rollout

You would need hospital authorization, verified doctor schedules, integration with each hospital's queue/appointment system, secure deployment, audit logs, backups, privacy review, and appropriate safeguards for patient data. The sample data in this project is not real-time hospital information.
