/**
 * Database Reset Utility
 * Clears all logged workout sessions, sets, PRs, and resets user stats to fresh baseline (0 XP, 0 Streak, 0 Workouts).
 */

const { getDb } = require('../database');

async function resetDatabase() {
  try {
    const db = await getDb();

    await db.run('DELETE FROM sets');
    await db.run('DELETE FROM performed_exercises');
    await db.run('DELETE FROM workouts');
    await db.run('DELETE FROM personal_records');
    await db.run('DELETE FROM user_badges');
    await db.run('DELETE FROM daily_quests');
    await db.run('DELETE FROM routine_sets');
    await db.run('DELETE FROM routine_exercises');
    await db.run('DELETE FROM routine_templates');
    
    // Reset Users to clean baseline
    await db.run(`
      UPDATE users 
      SET username = 'OmniFit Member',
          email = 'member@omnifit.app',
          current_xp = 0, 
          current_rank = 'Novice', 
          streak_count = 0, 
          last_workout_at = NULL, 
          streak_freezes = 0, 
          age = NULL, 
          weight_kg = NULL, 
          height_cm = NULL 
      WHERE id = 1
    `);

    await db.run(`
      UPDATE users 
      SET username = 'Guest Athlete',
          email = 'guest@omnifit.app',
          current_xp = 0, 
          current_rank = 'Novice', 
          streak_count = 0, 
          last_workout_at = NULL, 
          streak_freezes = 0, 
          age = NULL, 
          weight_kg = NULL, 
          height_cm = NULL 
      WHERE id = 2
    `);

    console.log('✅ OmniFit database successfully reset to clean initial baseline:');
    console.log('   - Current XP: 0');
    console.log('   - Streak: 0');
    console.log('   - Workouts: 0');
    console.log('   - Personal Records: 0');
  } catch (error) {
    console.error('❌ Failed to reset database:', error.message);
  }
}

resetDatabase();
