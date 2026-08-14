const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './database.sqlite';

let db;

async function getDb() {
  if (db) return db;

  db = await open({
    filename: path.resolve(__dirname, dbPath),
    driver: sqlite3.Database
  });

  await initializeSchema(db);
  return db;
}

async function initializeSchema(db) {
  // User table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT,
      current_xp INTEGER DEFAULT 0,
      current_rank TEXT DEFAULT 'Novice',
      streak_count INTEGER DEFAULT 0,
      last_workout_at DATETIME,
      streak_freezes INTEGER DEFAULT 0,
      age INTEGER,
      weight_kg REAL,
      height_cm REAL
    )
  `);

  // Schema migrations
  try { await db.exec('ALTER TABLE users ADD COLUMN streak_count INTEGER DEFAULT 0'); } catch (e) { }
  try { await db.exec('ALTER TABLE users ADD COLUMN last_workout_at DATETIME'); } catch (e) { }
  try { await db.exec('ALTER TABLE users ADD COLUMN age INTEGER'); } catch (e) { }
  try { await db.exec('ALTER TABLE users ADD COLUMN weight_kg REAL'); } catch (e) { }
  try { await db.exec('ALTER TABLE users ADD COLUMN height_cm REAL'); } catch (e) { }

  // Exercise catalog
  await db.exec(`
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      primary_muscle_group TEXT,
      secondary_muscle_groups TEXT,
      how_to TEXT
    )
  `);

  // Routine templates
  await db.exec(`
    CREATE TABLE IF NOT EXISTS routine_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS routine_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      routine_id INTEGER,
      exercise_id INTEGER,
      position INTEGER,
      rest_timer_s INTEGER DEFAULT 60,
      FOREIGN KEY (routine_id) REFERENCES routine_templates(id),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS routine_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      routine_ex_id INTEGER,
      set_number INTEGER,
      target_weight REAL,
      target_reps INTEGER,
      FOREIGN KEY (routine_ex_id) REFERENCES routine_exercises(id)
    )
  `);

  // Workout sessions
  await db.exec(`
    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      routine_template_id INTEGER,
      name TEXT,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      session_xp INTEGER DEFAULT 0,
      notes TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (routine_template_id) REFERENCES routine_templates(id)
    )
  `);

  // Schema migrations
  try {
    await db.exec('ALTER TABLE workouts ADD COLUMN routine_template_id INTEGER');
  } catch (e) { /* ignore if already exists */ }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS performed_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id INTEGER,
      exercise_id INTEGER,
      position INTEGER,
      rest_timer_s INTEGER,
      FOREIGN KEY (workout_id) REFERENCES workouts(id),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      performed_ex_id INTEGER,
      set_number INTEGER,
      weight REAL,
      reps INTEGER,
      is_completed INTEGER DEFAULT 0,
      FOREIGN KEY (performed_ex_id) REFERENCES performed_exercises(id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS personal_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      workout_id INTEGER,
      exercise_id INTEGER,
      set_id INTEGER,
      record_type TEXT,
      value REAL,
      weight REAL,
      reps INTEGER,
      achieved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id),
      FOREIGN KEY (workout_id) REFERENCES workouts(id),
      FOREIGN KEY (set_id) REFERENCES sets(id)
    )
  `);

  // Gamification schema
  await db.exec(`
    CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      icon_path TEXT,
      requirement_type TEXT,
      requirement_value REAL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_badges (
      user_id INTEGER,
      badge_id INTEGER,
      achieved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, badge_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (badge_id) REFERENCES badges(id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS daily_quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      exercise_id INTEGER,
      workout_id INTEGER,
      title TEXT,
      description TEXT,
      target_metric TEXT,
      target_value REAL,
      xp_reward INTEGER,
      is_completed INTEGER DEFAULT 0,
      date DATE DEFAULT CURRENT_DATE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Quest schema migrations
  try {
    await db.exec('ALTER TABLE daily_quests ADD COLUMN exercise_id INTEGER');
  } catch (e) { }
  try {
    await db.exec('ALTER TABLE daily_quests ADD COLUMN workout_id INTEGER');
  } catch (e) { }
  try {
    await db.exec('ALTER TABLE daily_quests ADD COLUMN target_metric TEXT');
  } catch (e) { }
  try {
    await db.exec('ALTER TABLE daily_quests ADD COLUMN target_value REAL');
  } catch (e) { }

  // Badge seeding
  const badgeCount = await db.get('SELECT COUNT(*) as count FROM badges');
  if (badgeCount.count === 0) {
    const defaultBadges = [
      { name: 'First Steps', description: 'Complete your first workout', category: 'Consistency', icon_path: 'first_steps.svg', requirement_type: 'WORKOUT_COUNT', requirement_value: 1 },
      { name: 'The 100kg Club', description: 'Bench press 100kg for at least 1 rep', category: 'Strength', icon_path: '100kg_club.svg', requirement_type: 'BENCH_PRESS_WEIGHT', requirement_value: 100 },
      { name: 'Consistency King', description: 'Maintain a 7-day streak', category: 'Consistency', icon_path: 'consistency_king.svg', requirement_type: 'STREAK_LENGTH', requirement_value: 7 },
      { name: 'Volume Master', description: 'Lift over 10,000kg in a single workout', category: 'Strength', icon_path: 'volume_master.svg', requirement_type: 'TOTAL_VOLUME', requirement_value: 10000 },
    ];

    for (const b of defaultBadges) {
      await db.run(
        'INSERT INTO badges (name, description, category, icon_path, requirement_type, requirement_value) VALUES (?, ?, ?, ?, ?, ?)',
        [b.name, b.description, b.category, b.icon_path, b.requirement_type, b.requirement_value]
      );
    }
    console.log('Seeded default badges.');
  }

  // User seeding
  const seedUsers = [
    { id: 1, username: 'OmniFit Member', email: 'member@omnifit.app' },
    { id: 2, username: 'Guest Athlete', email: 'guest@omnifit.app' }
  ];

  for (const u of seedUsers) {
    const existing = await db.get('SELECT id FROM users WHERE id = ?', [u.id]);
    if (!existing) {
      await db.run('INSERT INTO users (id, username, email) VALUES (?, ?, ?)', [u.id, u.username, u.email]);
      console.log(`Seeded user: ${u.username}`);
    } else {
      await db.run('UPDATE users SET username = ?, email = ? WHERE id = ?', [u.username, u.email, u.id]);
    }
  }

  // Exercise seeding
  const exerciseCount = await db.get('SELECT COUNT(*) as count FROM exercises');
  if (exerciseCount.count < 84) {
    const defaultExercises = [
      // Chest
      { name: 'Bench Press (Barbell)', primary_muscle_group: 'Chest', secondary_muscle_groups: 'Triceps, Shoulders', how_to: '' },
      { name: 'Incline Bench Press (Barbell)', primary_muscle_group: 'Chest', secondary_muscle_groups: 'Triceps, Shoulders', how_to: '' },
      { name: 'Decline Bench Press (Barbell)', primary_muscle_group: 'Chest', secondary_muscle_groups: 'Triceps, Shoulders', how_to: '' },
      { name: 'Bench Press (Dumbell)', primary_muscle_group: 'Chest', secondary_muscle_groups: 'Triceps, Shoulders', how_to: '' },
      { name: 'Incline Bench Press (Dumbell)', primary_muscle_group: 'Chest', secondary_muscle_groups: 'Triceps, Shoulders', how_to: '' },
      { name: 'Decline Bench Press (Dumbell)', primary_muscle_group: 'Chest', secondary_muscle_groups: 'Triceps, Shoulders', how_to: '' },
      { name: 'Bench Press (Smith Machine)', primary_muscle_group: 'Chest', secondary_muscle_groups: 'Triceps, Shoulders', how_to: '' },
      { name: 'Incline Bench Press (Smith Machine)', primary_muscle_group: 'Chest', secondary_muscle_groups: 'Triceps, Shoulders', how_to: '' },
      { name: 'Decline Bench Press (Smith Machine)', primary_muscle_group: 'Chest', secondary_muscle_groups: 'Triceps, Shoulders', how_to: '' },
      { name: 'Chest Fly (Dumbbell)', primary_muscle_group: 'Chest', secondary_muscle_groups: '', how_to: '' },
      { name: 'Chest Fly (Cable)', primary_muscle_group: 'Chest', secondary_muscle_groups: '', how_to: '' },
      { name: 'Chest Fly (Machine)', primary_muscle_group: 'Chest', secondary_muscle_groups: '', how_to: '' },
      { name: 'Push-up', primary_muscle_group: 'Chest', secondary_muscle_groups: '', how_to: '' },
      { name: 'Push-up (Incline)', primary_muscle_group: 'Chest', secondary_muscle_groups: '', how_to: '' },
      { name: 'Push-up (Decline)', primary_muscle_group: 'Chest', secondary_muscle_groups: '', how_to: '' },
      { name: 'Push-up (Diamond)', primary_muscle_group: 'Chest', secondary_muscle_groups: '', how_to: '' },
      { name: 'Push-up (Wide)', primary_muscle_group: 'Chest', secondary_muscle_groups: '', how_to: '' },
      { name: 'Push-up (Narrow)', primary_muscle_group: 'Chest', secondary_muscle_groups: '', how_to: '' },
      { name: 'Push-up (Archer)', primary_muscle_group: 'Chest', secondary_muscle_groups: '', how_to: '' },
      // Legs
      { name: 'Squat (Barbell)', primary_muscle_group: 'Quadraceps', secondary_muscle_groups: 'Glutes, Hamstrings', how_to: '' },
      { name: 'Squat (Dumbell)', primary_muscle_group: 'Quadraceps', secondary_muscle_groups: 'Glutes, Hamstrings', how_to: '' },
      { name: 'Squat (Bodyweight)', primary_muscle_group: 'Quadraceps', secondary_muscle_groups: 'Glutes, Hamstrings', how_to: '' },
      { name: 'Squat (Smith Machine)', primary_muscle_group: 'Quadraceps', secondary_muscle_groups: 'Glutes, Hamstrings', how_to: '' },
      { name: 'Leg Press', primary_muscle_group: 'Quadraceps', secondary_muscle_groups: 'Glutes, Hamstrings', how_to: '' },
      { name: 'Leg Extension', primary_muscle_group: 'Quadraceps', secondary_muscle_groups: 'Glutes, Hamstrings', how_to: '' },
      { name: 'Leg Curl', primary_muscle_group: 'Quadraceps', secondary_muscle_groups: 'Glutes, Hamstrings', how_to: '' },
      // Back
      { name: 'Deadlift (Barbell)', primary_muscle_group: 'Glutes', secondary_muscle_groups: 'Hamstrings, Quadriceps, Lower Back, Upper Back, Lats, Traps', how_to: '' },
      { name: 'Deadlift (Dumbell)', primary_muscle_group: 'Glutes', secondary_muscle_groups: 'Hamstrings, Quadriceps, Lower Back, Upper Back, Lats, Traps', how_to: '' },
      { name: 'Deadlift (Smith Machine)', primary_muscle_group: 'Glutes', secondary_muscle_groups: 'Hamstrings, Quadriceps, Lower Back, Upper Back, Lats, Traps', how_to: '' },
      { name: 'Pull-up', primary_muscle_group: 'Lats', secondary_muscle_groups: 'Upper Back, Biceps, Forearms', how_to: '' },
      { name: 'Pull-up (Assisted)', primary_muscle_group: 'Lats', secondary_muscle_groups: 'Upper Back, Biceps, Forearms', how_to: '' },
      { name: 'Pull-up (Negative)', primary_muscle_group: 'Lats', secondary_muscle_groups: 'Upper Back, Biceps, Forearms', how_to: '' },
      { name: 'Lat Pulldown', primary_muscle_group: 'Lats', secondary_muscle_groups: 'Upper Back, Biceps, Forearms', how_to: '' },
      { name: 'Lat Pulldown (Close Grip)', primary_muscle_group: 'Lats', secondary_muscle_groups: 'Upper Back, Biceps, Forearms', how_to: '' },
      { name: 'Lat Pulldown (Wide Grip)', primary_muscle_group: 'Lats', secondary_muscle_groups: 'Upper Back, Biceps, Forearms', how_to: '' },
      { name: 'Lat Pulldown (Reverse Grip)', primary_muscle_group: 'Lats', secondary_muscle_groups: 'Upper Back, Biceps, Forearms', how_to: '' },
      { name: 'Seated Cable Row', primary_muscle_group: 'Upper Back', secondary_muscle_groups: "Lats, Biceps, Forearms", how_to: '' },
      { name: 'Seated Cable Row (Close Grip)', primary_muscle_group: 'Upper Back', secondary_muscle_groups: "Lats, Biceps, Forearms", how_to: '' },
      { name: 'Seated Cable Row (Wide Grip)', primary_muscle_group: 'Upper Back', secondary_muscle_groups: "Lats, Biceps, Forearms", how_to: '' },
      { name: 'Seated Cable Row (Reverse Grip)', primary_muscle_group: 'Upper Back', secondary_muscle_groups: "Lats, Biceps, Forearms", how_to: '' },
      // Shoulders
      { name: 'Overhead Press (Barbell)', primary_muscle_group: 'Shoulders', secondary_muscle_groups: 'Triceps', how_to: '' },
      { name: 'Overhead Press (Dumbell)', primary_muscle_group: 'Shoulders', secondary_muscle_groups: 'Triceps', how_to: '' },
      { name: 'Overhead Press (Smith Machine)', primary_muscle_group: 'Shoulders', secondary_muscle_groups: 'Triceps', how_to: '' },
      { name: 'Shoulder Press (Dumbbell)', primary_muscle_group: 'Shoulders', secondary_muscle_groups: 'Triceps', how_to: '' },
      { name: 'Shoulder Press (Machine)', primary_muscle_group: 'Shoulders', secondary_muscle_groups: 'Triceps', how_to: '' },
      { name: 'Lateral Raise (Dumbbell)', primary_muscle_group: 'Shoulders', secondary_muscle_groups: 'Triceps', how_to: '' },
      { name: 'Lateral Raise (Machine)', primary_muscle_group: 'Shoulders', secondary_muscle_groups: 'Triceps', how_to: '' },
      { name: 'Lateral Raise (Cable)', primary_muscle_group: 'Shoulders', secondary_muscle_groups: 'Triceps', how_to: '' },
      // Triceps
      { name: 'Triceps Dip', primary_muscle_group: 'Triceps', secondary_muscle_groups: 'Chest, Shoulders', how_to: '' },
      { name: 'Triceps Dip (Weighted)', primary_muscle_group: 'Triceps', secondary_muscle_groups: 'Chest, Shoulders', how_to: '' },
      { name: 'Triceps Pushdown (Assisted)', primary_muscle_group: 'Triceps', secondary_muscle_groups: 'Chest, Shoulders', how_to: '' },
      { name: 'Seated Dip Machine', primary_muscle_group: 'Triceps', secondary_muscle_groups: 'Chest, Shoulders', how_to: '' },
      { name: 'Overhead Triceps Extension (Dumbbell)', primary_muscle_group: 'Triceps', secondary_muscle_groups: '', how_to: '' },
      { name: 'Overhead Triceps Extension (Cable)', primary_muscle_group: 'Triceps', secondary_muscle_groups: '', how_to: '' },
      { name: 'Overhead Triceps Extension (Barbell)', primary_muscle_group: 'Triceps', secondary_muscle_groups: '', how_to: '' },
      // Biceps
      { name: 'Bicep Curl (Dumbbell)', primary_muscle_group: 'Biceps', secondary_muscle_groups: '', how_to: '' },
      { name: 'Bicep Curl (Barbell)', primary_muscle_group: 'Biceps', secondary_muscle_groups: '', how_to: '' },
      { name: 'Bicep Curl (Cable)', primary_muscle_group: 'Biceps', secondary_muscle_groups: '', how_to: '' },
      { name: 'Bicep Curl (Machine)', primary_muscle_group: 'Biceps', secondary_muscle_groups: '', how_to: '' },
      { name: 'Bicep Curl (EZ Bar)', primary_muscle_group: 'Biceps', secondary_muscle_groups: '', how_to: '' },
      { name: 'Hammer Curl (Dumbbell)', primary_muscle_group: 'Biceps', secondary_muscle_groups: '', how_to: '' },
      { name: 'Hammer Curl (Cable)', primary_muscle_group: 'Biceps', secondary_muscle_groups: '', how_to: '' },
      { name: 'Seated Incline Curl (Dumbbell)', primary_muscle_group: 'Biceps', secondary_muscle_groups: '', how_to: '' },
      { name: 'Preacher Curl (Dumbbell)', primary_muscle_group: 'Biceps', secondary_muscle_groups: '', how_to: '' },
      { name: 'Preacher Curl (Barbell)', primary_muscle_group: 'Biceps', secondary_muscle_groups: '', how_to: '' },
      { name: 'Cross Body Hammer Curl (Dumbbell)', primary_muscle_group: 'Biceps', secondary_muscle_groups: '', how_to: '' },
      // Forearms
      { name: 'Wrist Curl (Dumbbell)', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Wrist Curl (Barbell)', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Wrist Curl (Cable)', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Wrist Curl (Machine)', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Reverse Wrist Curl (Dumbbell)', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Reverse Wrist Curl (Barbell)', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Reverse Wrist Curl (Cable)', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Reverse Wrist Curl (Machine)', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Reverse Wrist Curl (Dumbbell)', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Reverse Wrist Curl (Barbell)', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Reverse Wrist Curl (Cable)', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Reverse Wrist Curl (Machine)', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Dead Hangs', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      { name: 'Farmer\'s Walk', primary_muscle_group: 'Forearms', secondary_muscle_groups: '', how_to: '' },
      // Abs
      { name: 'Cable Crunch', primary_muscle_group: 'Abdominals', secondary_muscle_groups: '', how_to: '' },
      { name: 'Hanging Knee Raise', primary_muscle_group: 'Abdominals', secondary_muscle_groups: 'Forearms', how_to: '' },
      { name: 'Hanging Leg Raise', primary_muscle_group: 'Abdominals', secondary_muscle_groups: 'Forearms', how_to: '' },
      { name: 'Knee Raise Parallel Bars', primary_muscle_group: 'Abdominals', secondary_muscle_groups: '', how_to: '' },
      { name: 'Leg Raise Parallel Bars', primary_muscle_group: 'Abdominals', secondary_muscle_groups: '', how_to: '' },
    ];

    for (const ex of defaultExercises) {
      await db.run(
        'INSERT INTO exercises (name, primary_muscle_group, secondary_muscle_groups, how_to) VALUES (?, ?, ?, ?)',
        [ex.name, ex.primary_muscle_group, ex.secondary_muscle_groups, ex.how_to]
      );
    }
    console.log('Seeded default exercises.');
  }
}

module.exports = { getDb };
