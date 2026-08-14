const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { getDb } = require('./database');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// AI configuration
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const PRIMARY_MODEL = process.env.PRIMARY_MODEL || "gemini-flash-latest";
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || "gemini-pro-latest";

const model = genAI ? genAI.getGenerativeModel({
  model: PRIMARY_MODEL
}, { apiVersion: 'v1beta' }) : null;

// AI Coach utilities
async function searchExercises(query) {
  const db = await getDb();
  return await db.all(
    "SELECT id, name, primary_muscle_group FROM exercises WHERE name LIKE ? LIMIT 10",
    [`%${query}%`]
  );
}

async function listByMuscle(muscle) {
  const db = await getDb();
  return await db.all(
    "SELECT id, name FROM exercises WHERE primary_muscle_group = ? LIMIT 20",
    [muscle]
  );
}

app.use(cors());
app.use(express.json());

// User identity middleware
app.use((req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    req.userId = 1; // Default development user
  } else {
    req.userId = parseInt(userId);
  }
  next();
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.get('SELECT 1');
    res.json({ status: 'ok', database: !!result });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Fetch all users
app.get('/api/users', async (req, res) => {
  try {
    const db = await getDb();
    const users = await db.all('SELECT id, username, current_xp, current_rank FROM users');
    res.json(users);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Register user
app.post('/api/users', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  try {
    const db = await getDb();
    const result = await db.run('INSERT INTO users (username) VALUES (?)', [username]);
    res.status(201).json({ id: result.lastID, username });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch exercise catalog
app.get('/api/exercises', async (req, res) => {
  try {
    const db = await getDb();
    const exercises = await db.all('SELECT * FROM exercises ORDER BY name ASC');
    res.json(exercises);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Fetch exercise history
app.get('/api/exercises/:id/history', async (req, res) => {
  try {
    const db = await getDb();
    const history = await db.all(`
      SELECT s.weight, s.reps, w.end_time
      FROM sets s
      JOIN performed_exercises pe ON s.performed_ex_id = pe.id
      JOIN workouts w ON pe.workout_id = w.id
      WHERE pe.exercise_id = ? AND w.user_id = ? AND s.is_completed = 1
      ORDER BY w.end_time DESC
      LIMIT 10
    `, [req.params.id, req.userId]);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate exercise challenge
app.post('/api/exercises/:id/challenge', async (req, res) => {
  if (!model) return res.status(503).json({ error: 'AI not configured' });

  const { workout_id } = req.body;
  const db = await getDb();
  try {
    const exercise = await db.get('SELECT name FROM exercises WHERE id = ?', [req.params.id]);
    const user = await db.get('SELECT current_rank FROM users WHERE id = ?', [req.userId]);
    const history = await db.all(`
      SELECT s.weight, s.reps 
      FROM sets s 
      JOIN performed_exercises pe ON s.performed_ex_id = pe.id 
      JOIN workouts w ON pe.workout_id = w.id
      WHERE pe.exercise_id = ? AND w.user_id = ? AND s.is_completed = 1
      ORDER BY w.end_time DESC LIMIT 10
    `, [req.params.id, req.userId]);

    const historyStr = history.length > 0
      ? history.map(h => `${h.weight}kg x ${h.reps}`).join(', ')
      : "No previous data";

    const prompt = `
      User Rank: ${user.current_rank}. 
      Current Exercise: ${exercise.name}.
      Recent History: ${historyStr}.
      
      Generate a "Battle Challenge" for this exercise right now. 
      It MUST be measurable (e.g. "Do 2 more reps than last time" or "Add 2.5kg to your top set").
      Keep it high-energy and motivating.
      
      Return ONLY a JSON object:
      {
        "challenge_text": "The catchy challenge instruction",
        "target_metric": "REPS" or "WEIGHT" or "VOLUME",
        "target_value": number (the incremental increase or total target),
        "xp_reward": 2000
      }
    `;

    let result;
    try {
      result = await model.generateContent(prompt);
    } catch (error) {
      if (error.message?.includes('429') || error.status === 429) {
        console.warn(`Primary AI Model (${PRIMARY_MODEL}) busy, attempting fallback to ${FALLBACK_MODEL}...`);
        const fallbackModel = genAI.getGenerativeModel({ model: FALLBACK_MODEL }, { apiVersion: 'v1beta' });
        result = await fallbackModel.generateContent(prompt);
      } else {
        throw error;
      }
    }
    const response = await result.response;
    const challengeData = JSON.parse(response.text().replace(/```json|```/g, '').trim());

    // Store challenge
    const questResult = await db.run(
      'INSERT INTO daily_quests (user_id, exercise_id, workout_id, title, description, target_metric, target_value, xp_reward, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)',
      [req.userId, req.params.id, workout_id || null, `Battle: ${exercise.name}`, challengeData.challenge_text, challengeData.target_metric, challengeData.target_value, challengeData.xp_reward]
    );

    challengeData.quest_id = questResult.lastID;
    res.json(challengeData);
  } catch (error) {
    console.error('Gemini API Error:', error);
    if (error.message?.includes('429') || error.status === 429) {
      return res.status(429).json({ error: 'AI Coach is busy. Please wait 60 seconds.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// API retry logic
async function retryWithBackoff(fn, maxRetries = 7, initialDelay = 5000) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRateLimit = error.message?.includes('429') || error.status === 429;
      if (!isRateLimit || i === maxRetries - 1) throw error;

      // Use a more aggressive backoff for 429s (15s minimum on later attempts)
      const delay = Math.max(initialDelay * Math.pow(2, i), 15000 * (i > 2 ? 1 : 0));
      console.warn(`Gemini Rate Limit (429). Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Routine summarization for token optimization
function summarizeRoutines(routines, detailLevel = 'summary') {
  if (!routines || !Array.isArray(routines)) return 'No existing routines';
  return routines.map(r => {
    const base = {
      name: r.name,
      muscleGroups: [...new Set((r.exercises || []).map(e => e.primary_muscle_group))].join(', ')
    };
    if (detailLevel === 'detailed') {
      base.exercises = (r.exercises || []).map(e => ({ name: e.name, sets: e.sets?.length }));
    }
    return base;
  });
}

// Demo Fallback AI Coach Generator (Runs when GEMINI_API_KEY is not configured)
async function handleMockCoachResponse(res, message, enhancedContext) {
  const lowerMsg = (message || '').toLowerCase();
  const db = await getDb();

  // Case 1: Split recommendation request (Guided Flow or general split inquiry)
  if (lowerMsg.includes('recommend') || lowerMsg.includes('split') || lowerMsg.includes('frequency') || lowerMsg.includes('fresh start') || lowerMsg.includes('complement') || lowerMsg.includes('routine') || lowerMsg.includes('plan') || lowerMsg.includes('days a week') || lowerMsg.includes('active')) {
    let splitName = 'Push / Pull / Legs (PPL)';
    let routines = ['Push Day (Chest, Shoulders, Triceps)', 'Pull Day (Back, Biceps)', 'Leg Day (Quads, Hamstrings, Calves)'];
    let reason = 'Push/Pull/Legs provides optimal frequency for muscle recovery, balanced weekly volume, and progressive overload tracking.';

    if (lowerMsg.includes('2 day') || lowerMsg.includes('full body') || lowerMsg.includes('2 days') || (enhancedContext.userProfile?.age > 60)) {
      splitName = 'Full Body Split';
      routines = ['Full Body Session A (Joint Mobility & Strength)', 'Full Body Session B (Core & Balance)'];
      reason = 'Full Body 2-3x/week maximizes training stimulus efficiency while ensuring 48-72 hours of systemic recovery between sessions.';
    } else if (lowerMsg.includes('4 day') || lowerMsg.includes('upper/lower') || lowerMsg.includes('upper lower') || lowerMsg.includes('4 days')) {
      splitName = 'Upper / Lower Split';
      routines = ['Upper Body Power', 'Lower Body Power', 'Upper Body Hypertrophy', 'Lower Body Hypertrophy'];
      reason = 'Upper/Lower 4x/week delivers targeted hypertrophy stimulus while distributing volume across distinct upper/lower movement patterns.';
    } else if (lowerMsg.includes('5 day') || lowerMsg.includes('6 day') || lowerMsg.includes('pack on muscle') || lowerMsg.includes('hypertrophy')) {
      splitName = 'Push / Pull / Legs (PPL Hypertrophy Split)';
      routines = ['Push A (Heavy)', 'Pull A (Heavy)', 'Legs A (Heavy)', 'Push B (Volume)', 'Pull B (Volume)', 'Legs B (Volume)'];
      reason = 'A 5-6 day PPL rotation allows dedicated hypertrophy volume for each muscle group with 48h recovery between similar movement patterns.';
    }

    const age = enhancedContext.userProfile?.age;
    const bmi = enhancedContext.userProfile?.bmi;
    let safetyNote = '';
    if (age && age > 50) {
      safetyNote = ' Age-aware adaptation: Emphasizing joint-friendly movement paths, warmups, and controlled eccentric tempo.';
    }
    if (bmi && parseFloat(bmi) > 30) {
      safetyNote += ' BMI-aware adaptation: Prioritizing machine-supported and stable compound exercises to reduce joint compression.';
    }

    return res.json({
      text: `Based on your profile, I recommend the **${splitName}**.\n\n${reason}${safetyNote ? '\n\n' + safetyNote : ''}\n\nWhich specific session from this split would you like to build today?`,
      split: { name: splitName, routines },
      suggestions: null,
      model_used: 'demo-mock-fallback (Demo Mode: Set GEMINI_API_KEY in backend/.env for live LLM)'
    });
  }

  // Case 2: Routine exercise generation (Push, Pull, Legs, Upper, Lower, Chest, etc.)
  if (lowerMsg.includes('push') || lowerMsg.includes('chest') || lowerMsg.includes('pull') || lowerMsg.includes('back') || lowerMsg.includes('leg') || lowerMsg.includes('upper') || lowerMsg.includes('lower') || lowerMsg.includes('generate')) {
    let targetMuscle = 'Chest';
    if (lowerMsg.includes('pull') || lowerMsg.includes('back') || lowerMsg.includes('lat')) targetMuscle = 'Lats';
    else if (lowerMsg.includes('leg') || lowerMsg.includes('quad') || lowerMsg.includes('squat')) targetMuscle = 'Quadraceps';
    else if (lowerMsg.includes('shoulder')) targetMuscle = 'Shoulders';

    const exercises = await db.all(
      'SELECT id, name, primary_muscle_group FROM exercises WHERE primary_muscle_group = ? OR primary_muscle_group = "Chest" LIMIT 4',
      [targetMuscle]
    );

    const suggestions = exercises.map((ex, idx) => ({
      id: ex.id,
      name: ex.name,
      sets: idx === 0 ? 4 : 3,
      reps: idx === 0 ? 8 : 12,
      reason: idx === 0 ? 'Primary compound strength movement for progressive overload.' : 'Hypertrophy volume targeting primary and secondary stabilizers.'
    }));

    return res.json({
      text: `Here is a structured, science-backed routine tailored to your session. Maintain controlled tempo and aim for progressive overload across your logged sets.`,
      split: null,
      suggestions: suggestions.length > 0 ? suggestions : [
        { id: 1, name: 'Bench Press (Barbell)', sets: 4, reps: 8, reason: 'Primary compound foundation.' },
        { id: 2, name: 'Incline Bench Press (Barbell)', sets: 3, reps: 10, reason: 'Upper chest hypertrophy.' },
        { id: 10, name: 'Chest Fly (Dumbbell)', sets: 3, reps: 12, reason: 'Peak contraction and stretch.' }
      ],
      model_used: 'demo-mock-fallback (Demo Mode: Set GEMINI_API_KEY in backend/.env for live LLM)'
    });
  }

  // Case 3: Live workout exercise swap or injury adaptation
  if (lowerMsg.includes('swap') || lowerMsg.includes('injury') || lowerMsg.includes('broken') || lowerMsg.includes('replace') || lowerMsg.includes('reduce duration')) {
    const chestExercises = await db.all('SELECT id, name FROM exercises WHERE primary_muscle_group = "Chest" LIMIT 2');
    const swapTarget = chestExercises[1] || { id: 2, name: 'Incline Bench Press (Barbell)' };

    return res.json({
      text: `Understood! To adapt your session while maintaining target muscle activation and protecting joint health, here is a recommended substitution:`,
      split: null,
      suggestions: [
        {
          id: swapTarget.id,
          name: swapTarget.name,
          sets: 3,
          reps: 10,
          reason: 'Joint-friendly substitution with equivalent biomechanical muscle activation.',
          replace_id: 1
        }
      ],
      model_used: 'demo-mock-fallback (Demo Mode: Set GEMINI_API_KEY in backend/.env for live LLM)'
    });
  }

  // Default General Guidance
  return res.json({
    text: `Hello! I am your OmniFit AI Coach. I can recommend evidence-based training splits (PPL, Upper/Lower, Full Body), generate custom workout routines with progressive overload parameters, and suggest real-time exercise adaptations during live workouts based on your age, BMI, and logged PRs.\n\n*(💡 Running in Demo Mode. To enable full Gemini 1.5 Flash generative reasoning, configure \`GEMINI_API_KEY\` in \`backend/.env\`.)*`,
    split: null,
    suggestions: null,
    model_used: 'demo-mock-fallback (Demo Mode: Set GEMINI_API_KEY in backend/.env for live LLM)'
  });
}

// AI Coach API
app.post('/api/ai/coach', async (req, res) => {
  const { message, history, context } = req.body;
  const db = await getDb();

  // Retrieve user profile and training history
  const userProfile = await db.get('SELECT age, weight_kg, height_cm, current_xp, current_rank FROM users WHERE id = ?', [req.userId]);
  
  // Calculate BMI
  if (userProfile && userProfile.weight_kg && userProfile.height_cm) {
    const hM = userProfile.height_cm / 100;
    userProfile.bmi = (userProfile.weight_kg / (hM * hM)).toFixed(1);
  }

  // Recent workout history
  const recentWorkouts = await db.all(`
    SELECT id, name, end_time, session_xp 
    FROM workouts 
    WHERE user_id = ? AND end_time IS NOT NULL 
    ORDER BY end_time DESC LIMIT 5
  `, [req.userId]);

  // Personal records
  const topPrs = await db.all(`
    SELECT pr.*, e.name as exercise_name 
    FROM personal_records pr 
    JOIN exercises e ON pr.exercise_id = e.id 
    WHERE pr.user_id = ? 
    ORDER BY pr.achieved_at DESC LIMIT 10
  `, [req.userId]);

  // Aggregate context
  const enhancedContext = { 
    ...(context || {}),
    userProfile,
    recentHistory: recentWorkouts,
    personalRecords: topPrs
  };

  const summarizedRoutines = summarizeRoutines(enhancedContext.existingRoutines);
  const systemInstruction = `You are an elite AI Fitness Coach. You provide expert, scientific, and encouraging advice.
  
  Current User Data:
  - Profile: ${JSON.stringify(enhancedContext.userProfile || 'No profile data')}
  - Recent Workouts: ${JSON.stringify(enhancedContext.recentHistory || 'No history')}
  - Key PRs: ${JSON.stringify(enhancedContext.personalRecords || 'No PRs')}
  - Existing Routines (Summary): ${JSON.stringify(summarizedRoutines)}
  - Workout Status: ${JSON.stringify(enhancedContext.activeWorkout || 'Not currently in a workout')}
  
  Guidelines:
  1. If a user asks for a routine or is starting a new training plan, ALWAYS recommend a suitable training split first before suggesting specific exercises.
     - 2 Days/Week: Recommend "Full Body".
     - 3 Days/Week: Recommend "Full Body" or "PPL (Push/Pull/Legs)".
     - 4 Days/Week: Recommend "Upper/Lower" or "Bro Split".
     - 5-6 Days/Week: Recommend "PPL" (twice through) or "PPL + Upper/Lower".
  2. When recommending a split, you MUST call the 'recommend_split' tool with the split name and the list of specific routines in that split.
  3. Explain WHY you chose the split based on their frequency and goals.
  4. If the user agrees to a split (e.g., "I'll go with PPL"), ask which specific routine from that split they want to generate today (e.g., "Push Day", "Pull Day", or "Leg Day").
  5. Do not generate a full exercise list until they've confirmed the split and the specific routine.
  6. If they mention "Complement My Routines", perform a deep analysis of what muscle groups they are currently training and suggest a workout that fills the gaps.
  7. Proactively analyze the user's Age and BMI to prioritize safety:
     - If Age > 50: Explicitly recommend lower-impact exercises and emphasize mobility, stability, and longer recovery times. Warn against sudden heavy eccentric loading.
     - If BMI > 30: Prioritize joint-friendly exercises (e.g., prioritizing machines or seated variations over high-impact free weights). Explicitly explain that these choices are intended to protect joint health.
  8. If a user reports an injury or that a piece of equipment/machine is broken/in use/taken during a live workout, suggest an alternative exercise.
     - DO NOT suggest high-impact exercises (e.g., jumping, heavy squats) for users with reported joint injuries or acute pain.
     - Use 'list_exercises_by_muscle' to find alternatives for the same muscle group.
     - When suggesting an alternative to a specific exercise, set the 'replace_id' field in the 'suggest_exercises' tool to the ID of the exercise being replaced.
  9. If a user reports "soreness", "fatigue", or "overtraining", suggest a "Recovery Session" or "Deload" (reducing volume and intensity by 30-50%). Explain the importance of recovery for muscle hypertrophy and injury prevention.
  10.When suggesting specific exercises, ALWAYS use the 'suggest_exercises' tool.
  11.Keep responses concise and focused on actionable fitness advice.`;

  const tools = [
    {
      functionDeclarations: [
        {
          name: "search_exercises",
          description: "Search for exercises by name in the database.",
          parameters: {
            type: "OBJECT",
            properties: {
              query: { type: "STRING", description: "The search term (e.g., 'bench press')" }
            },
            required: ["query"]
          }
        },
        {
          name: "list_exercises_by_muscle",
          description: "List exercises targeting a specific primary muscle group.",
          parameters: {
            type: "OBJECT",
            properties: {
              muscle: { type: "STRING", description: "The muscle group (e.g., 'Chest', 'Lats')" }
            },
            required: ["muscle"]
          }
        },
        {
          name: "recommend_split",
          description: "Recommend a training split and provide options to the user. Call this when suggesting a high-level split (e.g. PPL, Full Body).",
          parameters: {
            type: "OBJECT",
            properties: {
              splitName: { type: "STRING", description: "The name of the split (e.g., 'Push/Pull/Legs')" },
              routines: {
                type: "ARRAY",
                items: { type: "STRING" },
                description: "The routines included in this split (e.g., ['Push Day', 'Pull Day', 'Leg Day'])"
              }
            },
            required: ["splitName", "routines"]
          }
        },
        {
          name: "suggest_exercises",
          description: "Suggest a list of exercises to the user with specific sets and reps.",
          parameters: {
            type: "OBJECT",
            properties: {
              suggestions: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    id: { type: "NUMBER" },
                    name: { type: "STRING" },
                    sets: { type: "NUMBER" },
                    reps: { type: "NUMBER" },
                    reason: { type: "STRING" },
                    replace_id: { type: "NUMBER", description: "The ID of the exercise to replace (if this is an alternative/swap)." }
                  },
                  required: ["id", "name", "sets", "reps", "reason"]
                }
              }
            },
            required: ["suggestions"]
          }
        }
      ]
    }
  ];

  let chatHistory = (history || []).map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.text }]
  }));

  // If Gemini API is not configured, fall back to the built-in demo coach generator
  if (!genAI) {
    return await handleMockCoachResponse(res, message, enhancedContext);
  }

  try {
    let currentModelName = PRIMARY_MODEL;
    let coachModel = genAI.getGenerativeModel({
      model: currentModelName,
      systemInstruction: { parts: [{ text: systemInstruction }] }
    }, { apiVersion: 'v1beta' });

    let chat = coachModel.startChat({ history: chatHistory, tools: tools });
    let result;

    try {
      result = await retryWithBackoff(() => chat.sendMessage(message));
    } catch (error) {
      if (error.message?.includes('429') || error.status === 429) {
        console.warn(`Primary Coach Model (${PRIMARY_MODEL}) busy, falling back to ${FALLBACK_MODEL}...`);
        currentModelName = FALLBACK_MODEL;
        coachModel = genAI.getGenerativeModel({
          model: currentModelName,
          systemInstruction: { parts: [{ text: systemInstruction }] }
        }, { apiVersion: 'v1beta' });
        chat = coachModel.startChat({ history: chatHistory, tools: tools });
        result = await retryWithBackoff(() => chat.sendMessage(message));
      } else {
        throw error;
      }
    }

    let response = result.response;
    let structuredSuggestions = null;
    let structuredSplit = null;

    // Handle recursive function calls
    let turnCount = 0;
    while (response.functionCalls()?.length > 0 && turnCount < 5) {
      turnCount++;
      const calls = response.functionCalls();
      const functionResponses = [];

      for (const call of calls) {
        if (call.name === 'search_exercises') {
          const data = await searchExercises(call.args.query);
          functionResponses.push({
            functionResponse: {
              name: 'search_exercises',
              response: { content: data }
            }
          });
        } else if (call.name === 'list_exercises_by_muscle') {
          const data = await listByMuscle(call.args.muscle);
          functionResponses.push({
            functionResponse: {
              name: 'list_exercises_by_muscle',
              response: { content: data }
            }
          });
        } else if (call.name === 'recommend_split') {
          structuredSplit = {
            name: call.args.splitName,
            routines: call.args.routines
          };
          functionResponses.push({
            functionResponse: {
              name: 'recommend_split',
              response: { status: "split_recommendation_noted" }
            }
          });
        } else if (call.name === 'suggest_exercises') {
          structuredSuggestions = call.args.suggestions;
          functionResponses.push({
            functionResponse: {
              name: 'suggest_exercises',
              response: { status: "suggestions_noted" }
            }
          });
        }
      }

      // Execute model turn
      result = await retryWithBackoff(() => chat.sendMessage(functionResponses));
      response = result.response;
    }

    res.json({
      text: response.text(),
      suggestions: structuredSuggestions,
      split: structuredSplit,
      model_used: currentModelName
    });

  } catch (error) {
    console.error('Coach AI Error:', error.message);
    if (error.message?.includes('429') || error.status === 429) {
      return res.status(429).json({ error: 'AI Coach is busy. Please wait 60 seconds.' });
    }
    console.warn('Falling back to demo mock response due to AI service error...');
    return await handleMockCoachResponse(res, message, enhancedContext);
  }
});

// Complete daily quest
app.patch('/api/quests/:id/complete', async (req, res) => {
  try {
    const db = await getDb();
    const quest = await db.get('SELECT * FROM daily_quests WHERE id = ?', [req.params.id]);

    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    if (quest.user_id !== req.userId) return res.status(403).json({ error: 'Access denied' });

    await db.run('UPDATE daily_quests SET is_completed = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Quest completed!', xp_reward: quest.xp_reward });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch user routines
app.get('/api/routines', async (req, res) => {
  try {
    const db = await getDb();
    const routine = await db.all(
      'SELECT * FROM routine_templates WHERE user_id = ?',
      [req.userId]
    );
    res.json(routine);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch routine details
app.get('/api/routines/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    const routine = await db.get('SELECT * FROM routine_templates WHERE id = ?', [id]);
    if (!routine) return res.status(404).json({ error: 'Routine not found' });

    if (routine.user_id !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const exercises = await db.all(
      'SELECT re.*, e.name, e.primary_muscle_group FROM routine_exercises re JOIN exercises e ON re.exercise_id = e.id WHERE re.routine_id = ? ORDER BY re.position',
      [id]);

    for (const ex of exercises) {
      ex.sets = await db.all(
        'SELECT * FROM routine_sets WHERE routine_ex_id = ? ORDER BY set_number',
        [ex.id]
      );
    }

    routine.exercises = exercises;
    res.json(routine);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch user profile
app.get('/api/users/me', async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = await db.get('SELECT COUNT(*) as total_workouts FROM workouts WHERE user_id = ?', [req.userId]);
    user.total_workouts = stats.total_workouts;

    // Calculate BMI
    if (user.weight_kg && user.height_cm) {
      const heightM = user.height_cm / 100;
      user.bmi = (user.weight_kg / (heightM * heightM)).toFixed(1);
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update physical profile
app.patch('/api/users/me/profile', async (req, res) => {
  const { age, weight_kg, height_cm } = req.body;
  try {
    const db = await getDb();
    await db.run(
      'UPDATE users SET age = ?, weight_kg = ?, height_cm = ? WHERE id = ?',
      [age || null, weight_kg || null, height_cm || null, req.userId]
    );
    res.json({ message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete routine
app.delete('/api/routines/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  try {
    const routine = await db.get('SELECT user_id FROM routine_templates WHERE id = ?', [id]);
    if (!routine) return res.status(404).json({ error: 'Routine not found' });
    if (routine.user_id !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.run('BEGIN TRANSACTION');

    await db.run(`
      DELETE FROM routine_sets 
      WHERE routine_ex_id IN (SELECT id FROM routine_exercises WHERE routine_id = ?)
    `, [id]);

    await db.run('DELETE FROM routine_exercises WHERE routine_id = ?', [id]);
    await db.run('DELETE FROM routine_templates WHERE id = ?', [id]);

    await db.run('COMMIT');
    res.json({ message: 'Routine deleted successfully' });
  } catch (error) {
    if (db) await db.run('ROLLBACK');
    res.status(500).json({ error: 'Failed to delete routine: ' + error.message });
  }
});

// Update an existing routine template
app.put('/api/routines/:id', async (req, res) => {
  const { id } = req.params;
  const { name, notes, exercises } = req.body;
  const db = await getDb();

  try {
    const routine = await db.get('SELECT user_id FROM routine_templates WHERE id = ?', [id]);
    if (!routine) return res.status(404).json({ error: 'Routine not found' });
    if (routine.user_id !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.run('BEGIN TRANSACTION');

    await db.run(
      'UPDATE routine_templates SET name = ?, notes = ? WHERE id = ?',
      [name || 'Untitled Routine', notes || '', id]
    );

    // Refresh exercise and set data
    await db.run(`
      DELETE FROM routine_sets 
      WHERE routine_ex_id IN (SELECT id FROM routine_exercises WHERE routine_id = ?)
    `, [id]);
    await db.run('DELETE FROM routine_exercises WHERE routine_id = ?', [id]);

    if (exercises && Array.isArray(exercises)) {
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        const exResult = await db.run(
          'INSERT INTO routine_exercises (routine_id, exercise_id, position, rest_timer_s) VALUES (?, ?, ?, ?)',
          [id, ex.exercise_id, i, ex.rest_timer_s || 60]
        );
        const routineExId = exResult.lastID;

        if (ex.sets && Array.isArray(ex.sets)) {
          for (let j = 0; j < ex.sets.length; j++) {
            const set = ex.sets[j];
            await db.run(
              'INSERT INTO routine_sets (routine_ex_id, set_number, target_weight, target_reps) VALUES (?, ?, ?, ?)',
              [routineExId, j + 1, set.weight || 0, set.reps || 0]
            );
          }
        }
      }
    }

    await db.run('COMMIT');
    res.json({ message: 'Routine updated successfully' });
  } catch (error) {
    if (db) await db.run('ROLLBACK');
    res.status(500).json({ error: 'Failed to update routine: ' + error.message });
  }
});

// API root
app.get('/', (req, res) => {
  res.send('Fitness & Nutrition Tracker V2 API');
});

// Bootstrap server
getDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});

// Create routine template
app.post('/api/routines', async (req, res) => {
  const { name, notes, exercises } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Routine name is required' });
  }
  if (!exercises || !Array.isArray(exercises) || exercises.length === 0) {
    return res.status(400).json({ error: 'At least one exercise is required' });
  }

  const db = await getDb();

  try {
    await db.run('BEGIN TRANSACTION');

    const templateResult = await db.run(
      'INSERT INTO routine_templates (user_id, name, notes) VALUES (?, ?, ?)',
      [req.userId, name, notes]
    );
    const routineId = templateResult.lastID;

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      if (!ex.exercise_id) {
        throw new Error(`Exercise at position ${i} is missing an exercise_id`);
      }

      const exResult = await db.run(
        'INSERT INTO routine_exercises (routine_id, exercise_id, position, rest_timer_s) VALUES (?, ?, ?, ?)',
        [routineId, ex.exercise_id, i, ex.rest_timer_s || 60]
      );
      const routineExId = exResult.lastID;

      if (ex.sets && Array.isArray(ex.sets)) {
        for (let j = 0; j < ex.sets.length; j++) {
          const set = ex.sets[j];
          await db.run(
            'INSERT INTO routine_sets (routine_ex_id, set_number, target_weight, target_reps) VALUES (?, ?, ?, ?)',
            [routineExId, j + 1, set.weight || 0, set.reps || 0]
          );
        }
      }
    }

    await db.run('COMMIT');
    res.status(201).json({ id: routineId, message: 'Routine created!' });
  } catch (error) {
    await db.run('ROLLBACK');
    res.status(500).json({ error: 'Failed to create routine: ' + error.message });
  }
});

// Fetch active workout session
app.get('/api/workouts/active', async (req, res) => {
  try {
    const db = await getDb();
    // Retrieve ongoing session
    const workout = await db.get(
      'SELECT * FROM workouts WHERE user_id = ? AND end_time IS NULL ORDER BY start_time DESC LIMIT 1',
      [req.userId]
    );

    if (!workout) {
      return res.json(null);
    }

    // Fetch session exercises
    const exercises = await db.all(`
      SELECT pe.id as performed_ex_id, pe.exercise_id, pe.position, pe.rest_timer_s, 
             e.name, e.primary_muscle_group 
      FROM performed_exercises pe 
      JOIN exercises e ON pe.exercise_id = e.id 
      WHERE pe.workout_id = ? 
      ORDER BY pe.position
    `, [workout.id]);

    // Fetch session sets
    for (const ex of exercises) {
      // Fetch logged sets with PR markers
      const loggedSets = await db.all(`
        SELECT s.*, GROUP_CONCAT(pr.record_type) as pr_types
        FROM sets s
        LEFT JOIN personal_records pr ON s.id = pr.set_id AND pr.workout_id = ?
        WHERE s.performed_ex_id = ?
        GROUP BY s.id
        ORDER BY s.set_number
      `, [workout.id, ex.performed_ex_id]);

      if (loggedSets.length > 0) {
        ex.sets = loggedSets.map(s => ({
          ...s,
          db_id: s.id,
          actual_weight: s.weight,
          actual_reps: s.reps,
          is_completed: !!s.is_completed,
          brokenPRs: s.pr_types ? s.pr_types.split(',') : []
        }));
      } else if (workout.routine_template_id) {
        // Load template defaults
        const templateEx = await db.get(
          'SELECT id FROM routine_exercises WHERE routine_id = ? AND exercise_id = ?',
          [workout.routine_template_id, ex.exercise_id]
        );

        if (templateEx) {
          const templateSets = await db.all(
            'SELECT * FROM routine_sets WHERE routine_ex_id = ? ORDER BY set_number',
            [templateEx.id]
          );
          ex.sets = templateSets.map(s => ({
            id: `temp-resume-${s.id}`,
            db_id: null,
            set_number: s.set_number,
            actual_weight: s.target_weight,
            actual_reps: s.target_reps,
            is_completed: false,
            brokenPRs: []
          }));
        }
      }

      // Initialize default set
      if (!ex.sets || ex.sets.length === 0) {
        ex.sets = [{
          id: `temp-empty-${Date.now()}-${ex.exercise_id}`,
          db_id: null,
          set_number: 1,
          actual_weight: 0,
          actual_reps: 0,
          is_completed: false,
          brokenPRs: []
        }];
      }

      // Set unique exercise identifier
      ex.id = ex.performed_ex_id;
    }

    workout.exercises = exercises;
    res.json(workout);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save completed workout
app.post('/api/workouts', async (req, res) => {
  const { name, exercises } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Workout name is required' });
  }
  if (!exercises || !Array.isArray(exercises) || exercises.length === 0) {
    return res.status(400).json({ error: 'At least one completed set is required' });
  }

  const db = await getDb();
  let totalWeight = 0;
  let completedSets = 0;
  const newPRs = [];

  try {
    await db.run('BEGIN TRANSACTION');

    const workoutResult = await db.run(
      'INSERT INTO workouts (user_id, name, end_time) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [req.userId, name]
    );
    const workoutId = workoutResult.lastID;

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      if (!ex.exercise_id) {
        throw new Error(`Performed exercise at position ${i} is missing an exercise_id`);
      }

      const workoutExerciseResult = await db.run(
        'INSERT INTO performed_exercises (workout_id, exercise_id, position, rest_timer_s) VALUES (?, ?, ?, ?)',
        [workoutId, ex.exercise_id, i + 1, ex.rest_timer_s || 60]
      );
      const performedExerciseId = workoutExerciseResult.lastID;

      if (!ex.sets || !Array.isArray(ex.sets) || ex.sets.length === 0) {
        throw new Error(`Exercise ${ex.exercise_id} must have at least one set`);
      }

      let max1RMForExercise = 0;
      let prSet = null;

      for (const set of ex.sets) {
        await db.run(
          'INSERT INTO sets (performed_ex_id, set_number, weight, reps, is_completed) VALUES (?, ?, ?, ?, ?)',
          [performedExerciseId, set.set_number, set.weight || 0, set.reps || 0, 1]
        );

        const current1RM = (set.weight || 0) * (1 + (set.reps || 0) / 30);
        if (current1RM > max1RMForExercise) {
          max1RMForExercise = current1RM;
          prSet = set;
        }

        totalWeight += ((set.weight || 0) * (set.reps || 0));
        completedSets += 1;
      }

      const existingPR = await db.get(
        'SELECT value FROM personal_records WHERE user_id = ? AND exercise_id = ? AND record_type = "1RM"',
        [req.userId, ex.exercise_id]
      );

      if (!existingPR || max1RMForExercise > existingPR.value) {
        if (existingPR) {
          await db.run(
            'UPDATE personal_records SET value = ?, weight = ?, reps = ?, workout_id = ?, set_id = ?, achieved_at = CURRENT_TIMESTAMP WHERE user_id = ? AND exercise_id = ? AND record_type = "1RM"',
            [max1RMForExercise, prSet.weight, prSet.reps, workoutId, prSet.id || null, req.userId, ex.exercise_id]
          );
        } else {
          await db.run(
            'INSERT INTO personal_records (user_id, exercise_id, workout_id, set_id, record_type, value, weight, reps) VALUES (?, ?, ?, ?, "1RM", ?, ?, ?)',
            [req.userId, ex.exercise_id, workoutId, prSet.id || null, max1RMForExercise, prSet.weight, prSet.reps]
          );
        }

        const exerciseInfo = await db.get('SELECT name FROM exercises WHERE id = ?', [ex.exercise_id]);
        newPRs.push({
          exercise_name: exerciseInfo.name,
          one_rep_max: Math.round(max1RMForExercise * 10) / 10,
          weight: prSet.weight,
          reps: prSet.reps
        });
      }
    }

    const sessionXp = Math.floor((totalWeight / 3) + (completedSets * 50));
    await db.run('UPDATE workouts SET session_xp = ? WHERE id = ?', [sessionXp, workoutId]);
    await db.run('UPDATE users SET current_xp = current_xp + ? WHERE id = ?', [sessionXp, req.userId]);

    await db.run('COMMIT');
    res.status(201).json({
      id: workoutId,
      xpGained: sessionXp,
      newPRs,
      message: 'Workout saved!'
    });
  } catch (error) {
    if (db) await db.run('ROLLBACK');
    res.status(500).json({ error: 'Failed to save workout: ' + error.message });
  }
});

// Initialize live session
app.post('/api/workouts/start', async (req, res) => {
  const { name, notes, routine_template_id } = req.body;
  const db = await getDb();
  try {
    const result = await db.run(
      'INSERT INTO workouts (user_id, name, notes, routine_template_id, start_time) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [req.userId, name || 'New Workout', notes || '', routine_template_id || null]
    );
    res.status(201).json({ id: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start workout: ' + error.message });
  }
});

// Add exercise to session
app.post('/api/workouts/:id/exercises', async (req, res) => {
  const { id } = req.params;
  const { exercise_id, position, rest_timer_s } = req.body;
  const db = await getDb();
  try {
    const result = await db.run(
      'INSERT INTO performed_exercises (workout_id, exercise_id, position, rest_timer_s) VALUES (?, ?, ?, ?)',
      [id, exercise_id, position || 0, rest_timer_s || 60]
    );
    res.status(201).json({ id: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add exercise: ' + error.message });
  }
});

// Log workout set
app.post('/api/workouts/exercises/:performedExId/sets', async (req, res) => {
  const { performedExId } = req.params;
  const { set_number, weight, reps } = req.body;
  const db = await getDb();

  try {
    await db.run('BEGIN TRANSACTION');

    const info = await db.get(`
      SELECT pe.exercise_id, pe.workout_id 
      FROM performed_exercises pe 
      WHERE pe.id = ?
    `, [performedExId]);

    if (!info) throw new Error('Performed exercise not found');

    const result = await db.run(
      'INSERT INTO sets (performed_ex_id, set_number, weight, reps, is_completed) VALUES (?, ?, ?, ?, 1)',
      [performedExId, set_number, weight, reps]
    );
    const setId = result.lastID;

    // PR evaluation
    const metrics = [
      { type: '1RM', value: weight * (1 + reps / 30.0) },
      { type: 'HEAVIEST_WEIGHT', value: parseFloat(weight) },
      { type: 'BEST_VOLUME', value: weight * reps }
    ];

    const brokenPRs = [];
    for (const m of metrics) {
      const existing = await db.get(
        'SELECT value FROM personal_records WHERE user_id = ? AND exercise_id = ? AND record_type = ?',
        [req.userId, info.exercise_id, m.type]
      );

      if (!existing || m.value > existing.value) {
        if (existing) {
          await db.run(
            'UPDATE personal_records SET value = ?, weight = ?, reps = ?, workout_id = ?, set_id = ?, achieved_at = CURRENT_TIMESTAMP WHERE user_id = ? AND exercise_id = ? AND record_type = ?',
            [m.value, weight, reps, info.workout_id, setId, req.userId, info.exercise_id, m.type]
          );
        } else {
          await db.run(
            'INSERT INTO personal_records (user_id, exercise_id, workout_id, set_id, record_type, value, weight, reps) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [req.userId, info.exercise_id, info.workout_id, setId, m.type, m.value, weight, reps]
          );
        }
        brokenPRs.push(m.type);
      }
    }

    await db.run('COMMIT');
    res.status(201).json({ id: setId, brokenPRs });
  } catch (error) {
    if (db) await db.run('ROLLBACK');
    res.status(500).json({ error: 'Failed to log set: ' + error.message });
  }
});

// Delete set and update rewards
app.delete('/api/workouts/sets/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  try {
    await db.run('BEGIN TRANSACTION');

    // Retrieve set metadata
    const setInfo = await db.get(`
      SELECT s.*, pe.exercise_id, pe.workout_id, w.end_time, w.session_xp
      FROM sets s 
      JOIN performed_exercises pe ON s.performed_ex_id = pe.id 
      JOIN workouts w ON pe.workout_id = w.id
      WHERE s.id = ?
    `, [id]);

    if (!setInfo) {
      await db.run('ROLLBACK');
      return res.status(404).json({ error: 'Set not found' });
    }

    await db.run('DELETE FROM sets WHERE id = ?', [id]);

    // XP revocation
    if (setInfo.end_time) {
      const volXp = Math.floor((setInfo.weight * setInfo.reps) / 3);
      const setBonusXp = 50;
      const totalRevoke = volXp + setBonusXp;

      await db.run('UPDATE users SET current_xp = MAX(0, current_xp - ?) WHERE id = ?', [totalRevoke, req.userId]);
      await db.run('UPDATE workouts SET session_xp = MAX(0, session_xp - ?) WHERE id = ?', [totalRevoke, setInfo.workout_id]);
    }

    // Recalculate PRs
    const prsToRemove = await db.all(
      'SELECT record_type FROM personal_records WHERE set_id = ?',
      [id]
    );

    if (prsToRemove.length > 0) {
      for (const pr of prsToRemove) {
        let bestSet = null;
        if (pr.record_type === '1RM') {
          bestSet = await db.get(`
            SELECT s.*, pe.workout_id, (s.weight * (1 + s.reps / 30.0)) as calc_value
            FROM sets s
            JOIN performed_exercises pe ON s.performed_ex_id = pe.id
            JOIN workouts w ON pe.workout_id = w.id
            WHERE w.user_id = ? AND pe.exercise_id = ? AND s.is_completed = 1
            ORDER BY calc_value DESC LIMIT 1
          `, [req.userId, setInfo.exercise_id]);
        } else if (pr.record_type === 'HEAVIEST_WEIGHT') {
          bestSet = await db.get(`
            SELECT s.*, pe.workout_id, s.weight as calc_value
            FROM sets s
            JOIN performed_exercises pe ON s.performed_ex_id = pe.id
            JOIN workouts w ON pe.workout_id = w.id
            WHERE w.user_id = ? AND pe.exercise_id = ? AND s.is_completed = 1
            ORDER BY s.weight DESC LIMIT 1
          `, [req.userId, setInfo.exercise_id]);
        } else if (pr.record_type === 'BEST_VOLUME') {
          bestSet = await db.get(`
            SELECT s.*, pe.workout_id, (s.weight * s.reps) as calc_value
            FROM sets s
            JOIN performed_exercises pe ON s.performed_ex_id = pe.id
            JOIN workouts w ON pe.workout_id = w.id
            WHERE w.user_id = ? AND pe.exercise_id = ? AND s.is_completed = 1
            ORDER BY calc_value DESC LIMIT 1
          `, [req.userId, setInfo.exercise_id]);
        }

        await db.run('DELETE FROM personal_records WHERE user_id = ? AND exercise_id = ? AND record_type = ?', [req.userId, setInfo.exercise_id, pr.record_type]);

        if (bestSet) {
          await db.run(
            'INSERT INTO personal_records (user_id, exercise_id, workout_id, set_id, record_type, value, weight, reps) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [req.userId, setInfo.exercise_id, bestSet.workout_id, bestSet.id, pr.record_type, bestSet.calc_value, bestSet.weight, bestSet.reps]
          );
        }
      }
    }

    // Verify challenge status
    const quest = await db.get(`
      SELECT * FROM daily_quests 
      WHERE user_id = ? AND workout_id = ? AND exercise_id = ? AND is_completed = 1
    `, [req.userId, setInfo.workout_id, setInfo.exercise_id]);

    if (quest) {
      const otherSets = await db.all(`
        SELECT s.* FROM sets s
        JOIN performed_exercises pe ON s.performed_ex_id = pe.id
        WHERE pe.workout_id = ? AND pe.exercise_id = ? AND s.is_completed = 1
      `, [setInfo.workout_id, setInfo.exercise_id]);

      let stillMet = false;
      for (const s of otherSets) {
        if (quest.target_metric === 'REPS' && s.reps >= quest.target_value) stillMet = true;
        if (quest.target_metric === 'WEIGHT' && s.weight >= quest.target_value) stillMet = true;
        if (quest.target_metric === 'VOLUME' && (s.weight * s.reps) >= quest.target_value) stillMet = true;
        if (stillMet) break;
      }

      if (!stillMet) {
        await db.run('UPDATE daily_quests SET is_completed = 0 WHERE id = ?', [quest.id]);
        if (setInfo.end_time) {
          await db.run('UPDATE users SET current_xp = MAX(0, current_xp - ?) WHERE id = ?', [quest.xp_reward, req.userId]);
          await db.run('UPDATE workouts SET session_xp = MAX(0, session_xp - ?) WHERE id = ?', [quest.xp_reward, setInfo.workout_id]);
        }
      }
    }

    await db.run('COMMIT');
    res.json({ message: 'Set removed and associated rewards revoked/updated' });
  } catch (error) {
    if (db) await db.run('ROLLBACK');
    res.status(500).json({ error: 'Failed to remove set: ' + error.message });
  }
});

// Remove exercise and revoke associated rewards
app.delete('/api/workouts/exercises/:performedExId', async (req, res) => {
  const { performedExId } = req.params;
  const db = await getDb();

  try {
    await db.run('BEGIN TRANSACTION');

    // Retrieve associated sets
    const sets = await db.all('SELECT id FROM sets WHERE performed_ex_id = ?', [performedExId]);

    for (const s of sets) {
      const setInfo = await db.get(`
        SELECT s.*, pe.exercise_id, pe.workout_id, w.end_time, w.session_xp
        FROM sets s 
        JOIN performed_exercises pe ON s.performed_ex_id = pe.id 
        JOIN workouts w ON pe.workout_id = w.id
        WHERE s.id = ?
      `, [s.id]);

      if (setInfo) {
        // Revoke XP if workout was finalized
        if (setInfo.end_time) {
          const volXp = Math.floor((setInfo.weight * setInfo.reps) / 5);
          const setBonusXp = 100;
          const totalRevoke = volXp + setBonusXp;
          await db.run('UPDATE users SET current_xp = MAX(0, current_xp - ?) WHERE id = ?', [totalRevoke, req.userId]);
          await db.run('UPDATE workouts SET session_xp = MAX(0, session_xp - ?) WHERE id = ?', [totalRevoke, setInfo.workout_id]);
        }

        // Revoke any personal records achieved with this set
        const prsToRemove = await db.all('SELECT record_type FROM personal_records WHERE set_id = ?', [s.id]);
        if (prsToRemove.length > 0) {
          for (const pr of prsToRemove) {
            await db.run('DELETE FROM personal_records WHERE user_id = ? AND exercise_id = ? AND record_type = ?', [req.userId, setInfo.exercise_id, pr.record_type]);
          }
        }
      }
      await db.run('DELETE FROM sets WHERE id = ?', [s.id]);
    }

    // Evaluate challenge dependencies
    const quest = await db.get(`
      SELECT * FROM daily_quests 
      WHERE user_id = ? AND workout_id = (SELECT workout_id FROM performed_exercises WHERE id = ?) AND exercise_id = (SELECT exercise_id FROM performed_exercises WHERE id = ?) AND is_completed = 1
    `, [req.userId, performedExId, performedExId]);

    if (quest) {
      // Revert challenge state
      await db.run('UPDATE daily_quests SET is_completed = 0 WHERE id = ?', [quest.id]);

      // Revoke challenge XP reward if workout was finalized
      const workoutInfo = await db.get('SELECT end_time FROM workouts WHERE id = (SELECT workout_id FROM performed_exercises WHERE id = ?)', [performedExId]);
      if (workoutInfo?.end_time) {
        await db.run('UPDATE users SET current_xp = MAX(0, current_xp - ?) WHERE id = ?', [quest.xp_reward, req.userId]);
        await db.run('UPDATE workouts SET session_xp = MAX(0, session_xp - ?) WHERE id = (SELECT workout_id FROM performed_exercises WHERE id = ?)', [quest.xp_reward, performedExId]);
      }
    }

    // Remove exercise record
    await db.run('DELETE FROM performed_exercises WHERE id = ?', [performedExId]);

    await db.run('COMMIT');
    res.json({ message: 'Exercise and associated sets removed' });
  } catch (error) {
    if (db) await db.run('ROLLBACK');
    res.status(500).json({ error: 'Failed to remove exercise: ' + error.message });
  }
});

// Finalize session and process rewards
app.post('/api/workouts/:id/finish', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  try {
    await db.run('BEGIN TRANSACTION');

    const workoutInfo = await db.get('SELECT routine_template_id FROM workouts WHERE id = ?', [id]);
    const user = await db.get('SELECT current_xp, streak_count, last_workout_at, streak_freezes FROM users WHERE id = ?', [req.userId]);
    if (!user) throw new Error('User not found');

    const stats = await db.get(`
      SELECT SUM(s.weight * s.reps) as total_volume, COUNT(s.id) as completed_sets
      FROM sets s
      JOIN performed_exercises pe ON s.performed_ex_id = pe.id
      WHERE pe.workout_id = ? AND s.is_completed = 1
    `, [id]);

    const totalVolume = stats.total_volume || 0;
    const completedSets = stats.completed_sets || 0;

    const workoutPRs = await db.all(
      'SELECT record_type, value FROM personal_records WHERE workout_id = ?',
      [id]
    );

    let prXp = 0;
    workoutPRs.forEach(pr => {
      if (pr.record_type === '1RM') prXp += 5000;
      else if (pr.record_type === 'HEAVIEST_WEIGHT' || pr.record_type === 'BEST_VOLUME') prXp += 1000;
    });

    const volumeXp = Math.floor(totalVolume / 3);
    const setXp = completedSets * 50;

    const questResult = await db.get(`
      SELECT SUM(xp_reward) as quest_xp 
      FROM daily_quests 
      WHERE user_id = ? AND workout_id = ? AND is_completed = 1
    `, [req.userId, id]);
    const questXp = questResult.quest_xp || 0;

    const totalSessionXp = volumeXp + setXp + prXp + questXp;

    // Adaptive routine updates
    let targetsUpdated = false;
    if (workoutInfo && workoutInfo.routine_template_id) {
      const performedExercises = await db.all(
        'SELECT id, exercise_id FROM performed_exercises WHERE workout_id = ?',
        [id]
      );

      for (const pe of performedExercises) {
        const routineEx = await db.get(
          'SELECT id FROM routine_exercises WHERE routine_id = ? AND exercise_id = ?',
          [workoutInfo.routine_template_id, pe.exercise_id]
        );

        if (routineEx) {
          const actualSets = await db.all(
            'SELECT set_number, weight, reps FROM sets WHERE performed_ex_id = ? AND is_completed = 1',
            [pe.id]
          );

          for (const s of actualSets) {
            const targetSet = await db.get(
              'SELECT id, target_weight, target_reps FROM routine_sets WHERE routine_ex_id = ? AND set_number = ?',
              [routineEx.id, s.set_number]
            );

            if (targetSet) {
              if (s.reps > targetSet.target_reps || s.weight > targetSet.target_weight) {
                await db.run(
                  'UPDATE routine_sets SET target_weight = ?, target_reps = ? WHERE id = ?',
                  [s.weight, s.reps, targetSet.id]
                );
                targetsUpdated = true;
              }
            }
          }
        }
      }
    }

    // Update streak logic
    let newStreak = user.streak_count || 0;
    let freezeConsumed = false;
    const now = new Date();
    
    // Normalize date formats (SQLite vs ISO)
    let lastWorkout = null;
    if (user.last_workout_at) {
      let dateStr = user.last_workout_at;
      // Only apply manual formatting if it looks like the SQLite space-separated format
      if (typeof dateStr === 'string' && !dateStr.includes('T') && dateStr.includes(' ')) {
        dateStr = dateStr.replace(' ', 'T') + 'Z';
      }
      lastWorkout = new Date(dateStr);
    }

    if (!lastWorkout || isNaN(lastWorkout.getTime())) {
      newStreak = 1;
    } else {
      const diffHours = (now - lastWorkout) / (1000 * 60 * 60);
      if (diffHours <= 72) {
        const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const lastDate = new Date(lastWorkout.getFullYear(), lastWorkout.getMonth(), lastWorkout.getDate());
        if (nowDate > lastDate) {
          newStreak += 1;
        }
      } else if (user.streak_freezes > 0) {
        newStreak = user.streak_count;
        freezeConsumed = true;
        await db.run('UPDATE users SET streak_freezes = streak_freezes - 1 WHERE id = ?', [req.userId]);
      } else {
        newStreak = 1;
      }
    }

    let streakXp = 0;
    if (newStreak === 7 && (user.streak_count < 7)) {
      streakXp = 10000;
    } else if (newStreak === 28 && (user.streak_count < 28)) {
      streakXp = 50000;
    }

    const finalTotalSessionXp = totalSessionXp + streakXp;

    const oldLevel = Math.floor(user.current_xp / 50000) + 1;
    const newTotalXp = user.current_xp + finalTotalSessionXp;
    const newLevel = Math.floor(newTotalXp / 50000) + 1;
    const levelUpOccurred = newLevel > oldLevel;

    let grantedFreeze = false;
    if (levelUpOccurred && newLevel % 5 === 0) {
      grantedFreeze = true;
      await db.run('UPDATE users SET streak_freezes = streak_freezes + 1 WHERE id = ?', [req.userId]);
    }

    await db.run(
      'UPDATE users SET current_xp = ?, streak_count = ?, last_workout_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newTotalXp, newStreak, req.userId]
    );

    await db.run(
      'UPDATE workouts SET end_time = CURRENT_TIMESTAMP, session_xp = ? WHERE id = ?',
      [totalSessionXp, id]
    );

    // Badge processing
    const newBadges = [];
    const allBadges = await db.all('SELECT * FROM badges');
    for (const badge of allBadges) {
      const alreadyHas = await db.get('SELECT 1 FROM user_badges WHERE user_id = ? AND badge_id = ?', [req.userId, badge.id]);
      if (alreadyHas) continue;

      let achieved = false;
      if (badge.requirement_type === 'WORKOUT_COUNT') {
        const countResult = await db.get('SELECT COUNT(*) as count FROM workouts WHERE user_id = ?', [req.userId]);
        if (countResult.count >= badge.requirement_value) achieved = true;
      } else if (badge.requirement_type === 'TOTAL_VOLUME') {
        if (totalVolume >= badge.requirement_value) achieved = true;
      } else if (badge.requirement_type === 'STREAK_LENGTH') {
        if (newStreak >= badge.requirement_value) achieved = true;
      }

      if (achieved) {
        await db.run('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)', [req.userId, badge.id]);
        newBadges.push(badge);
      }
    }

    await db.run('COMMIT');

    res.json({
      message: 'Workout finished!',
      xpBreakdown: { volumeXp, setXp, prXp, questXp, streakXp, totalXp: finalTotalSessionXp },
      levelState: { oldLevel, newLevel, levelUpOccurred, grantedFreeze, currentXp: newTotalXp, xpToNextLevel: (newLevel * 50000) - newTotalXp },
      streak: { count: newStreak, isExtended: true, freezeConsumed },
      achievements: { prs: workoutPRs, badges: newBadges },
      adaptiveTargets: { updated: targetsUpdated }
    });
  } catch (error) {
    if (db) await db.run('ROLLBACK');
    res.status(500).json({ error: 'Failed to finish workout: ' + error.message });
  }
});

// Fetch workout history
app.get('/api/workouts', async (req, res) => {
  try {
    const db = await getDb();
    const workouts = await db.all(`
      SELECT w.*, 
      (SELECT COUNT(*) FROM personal_records pr WHERE pr.workout_id = w.id) as pr_count
      FROM workouts w 
      WHERE w.user_id = ? 
      ORDER BY w.end_time DESC
    `, [req.userId]);
    res.json(workouts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch workout details
app.get('/api/workouts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    const workout = await db.get('SELECT * FROM workouts WHERE id = ?', [id]);
    if (!workout) return res.status(404).json({ error: 'Workout not found' });

    if (workout.user_id !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const exercises = await db.all(`
      SELECT pe.*, e.name, e.primary_muscle_group 
      FROM performed_exercises pe 
      JOIN exercises e ON pe.exercise_id = e.id 
      WHERE pe.workout_id = ? 
      ORDER BY pe.position
    `, [id]);

    for (const ex of exercises) {
      ex.sets = await db.all(`
        SELECT s.*, pr.record_type as pr_type
        FROM sets s
        LEFT JOIN personal_records pr ON s.id = pr.set_id AND pr.workout_id = ?
        WHERE s.performed_ex_id = ?
        ORDER BY s.set_number
      `, [id, ex.id]);

      const prRecord = await db.get(
        'SELECT record_type, value FROM personal_records WHERE workout_id = ? AND exercise_id = ?',
        [id, ex.exercise_id]
      );

      if (prRecord) {
        ex.is_pr = true;
        ex.pr_details = prRecord;
      }
    }

    workout.exercises = exercises;
    res.json(workout);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch frequency analytics
app.get('/api/stats/workout-frequency', async (req, res) => {
  try {
    const db = await getDb();
    const frequency = await db.all(`
      SELECT 
        strftime('%Y-%W', end_time) as week_id,
        date(end_time, 'weekday 0', '-6 days') as week_start,
        COUNT(*) as count
      FROM workouts 
      WHERE user_id = ? AND end_time > date('now', '-30 days')
      GROUP BY week_id
      ORDER BY week_id ASC
    `, [req.userId]);
    res.json(frequency);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch muscle group volume
app.get('/api/stats/volume-by-muscle', async (req, res) => {
  try {
    const db = await getDb();
    const volumeData = await db.all(`
      SELECT 
        date(w.end_time) as date,
        e.primary_muscle_group,
        SUM(s.weight * s.reps) as volume
      FROM workouts w
      JOIN performed_exercises pe ON w.id = pe.workout_id
      JOIN exercises e ON pe.exercise_id = e.id
      JOIN sets s ON pe.id = s.performed_ex_id
      WHERE w.user_id = ? AND w.end_time > date('now', '-30 days')
      GROUP BY date, e.primary_muscle_group
      ORDER BY date ASC
    `, [req.userId]);
    res.json(volumeData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
