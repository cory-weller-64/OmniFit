# Cyber-Titan Fitness & Nutrition Tracker V2 🏋️‍♂️🤖

> **AI-Driven Coaching, Adaptive Gamification & Local-First Fitness Tracking**

A modern web application built to solve user retention challenges in fitness tracking by combining **context-aware AI coaching** (powered by Gemini), **adaptive gamification** (XP, Level progression, PR tracking, and 72-hour streak protections), and a **low-friction local-first database architecture**.

---

## ✨ Features

- 🤖 **Context-Aware AI Coach**: Persona-driven workout analysis and dynamic recommendations powered by Google Gemini 1.5 Flash.
- ⚡ **Adaptive Gamification Engine**:
  - **Dynamic XP & Leveling**: Earn volume-based XP with PR bonuses.
  - **Automated PR Detection**: Instant 1RM tracking and PR record updates.
  - **Streak Protection**: Integrated 72-hour streak grace periods and repairable freezes to combat workout dropout.
- 📊 **Dashboard & Analytics**: Track progress trends, weekly volume distributions, and physical profile targets.
- 📝 **Interactive Routine Builder**: Custom workout creation, exercise search, and drag-and-drop set logging.
- 📱 **Responsive Cyber-Titan Theme**: Low-cognitive-load, high-contrast UI designed for mobile and desktop screens.
- 💾 **Local-First SQLite Architecture**: Instant persistence and zero latency on set logging.

---

## 🏗️ Architecture & Tech Stack

### Frontend
- **Framework**: React 18 (Vite)
- **Styling**: Vanilla CSS Design Tokens (Dark Cyber-Titan Theme)
- **Icons & Visuals**: Custom SVG asset system

### Backend
- **Runtime**: Node.js & Express
- **Database**: SQLite (`sqlite3` / `sqlite` promise API)
- **AI Engine**: `@google/generative-ai` (Gemini Flash / Gemini Pro)
- **Testing**: Native integration and unit test runner

---

## 🛠️ Quickstart & Local Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0+ recommended)
- [npm](https://www.npmjs.com/)

---

### 1. Backend Setup

```bash
cd backend
npm install
```

**Environment Setup:**
1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and insert your Gemini API Key:
   ```ini
   PORT=3000
   DB_PATH=./database.sqlite
   GEMINI_API_KEY=your_gemini_api_key_here
   PRIMARY_MODEL=gemini-1.5-flash-latest
   FALLBACK_MODEL=gemini-1.5-pro-latest
   ```

**Start Backend Server:**
```bash
npm start
```
The server runs locally at `http://localhost:3000`.

---

### 2. Frontend Setup

In a new terminal window:

```bash
cd frontend
npm install
npm run dev
```
Open your browser to `http://localhost:5173`.

---

## 🧪 Running Tests

The backend includes unit tests for gamification and PR calculation algorithms, plus integration tests for streaks, live workout flows, and API endpoints.

> **Note**: Start the backend server (`npm start`) before running integration tests.

```bash
cd backend
npm test
```

---

## 📂 Repository Structure

```text
.
├── backend/
│   ├── database.js          # SQLite database schema and connection helper
│   ├── server.js            # Express REST API endpoints & Gemini AI integration
│   ├── tests/               # Unit and integration test suites
│   │   ├── integration/     # Live workout, streak, and API tests
│   │   └── unit/            # Gamification and PR calculation tests
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Dashboard, AICoachPanel, LiveWorkout, RoutineBuilder
│   │   ├── services/        # API client
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
├── .gitignore
├── LICENSE
└── README.md
```

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
