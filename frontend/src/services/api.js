const BASE_URL = 'http://localhost:3000/api';

async function apiFetch(endpoint, options = {}) {
    const userId = localStorage.getItem('userId') || '1';
    
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        headers: { 
            'Content-Type': 'application/json',
            'x-user-id': userId
        },
        ...options,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Network response was not ok');
    }
    return response.json();
}

// User Routes
export const getUsers = () => apiFetch('/users');
export const getUserProfile = () => apiFetch('/users/me');
export const updateUserProfile = (data) => apiFetch('/users/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(data)
});
export const createUser = (username) => apiFetch('/users', {
    method: 'POST',
    body: JSON.stringify({ username })
});

// Exercise Routes
export const getExercises = () => apiFetch('/exercises');

// Routine Routes
export const getRoutines = () => apiFetch('/routines');
export const getRoutineById = (id) => apiFetch(`/routines/${id}`);
export const createRoutine = (data) => apiFetch('/routines', {
    method: 'POST',
    body: JSON.stringify(data),
});
export const updateRoutine = (id, data) => apiFetch(`/routines/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
});
export const deleteRoutine = (id) => apiFetch(`/routines/${id}`, {
    method: 'DELETE'
});

// Workout Routes
export const saveWorkout = (data) => apiFetch('/workouts', {
    method: 'POST',
    body: JSON.stringify(data)
});
export const startWorkout = (data) => apiFetch('/workouts/start', {
    method: 'POST',
    body: JSON.stringify(data)
});

export const getActiveWorkout = () => apiFetch('/workouts/active');

export const addExerciseToWorkout = (workoutId, data) => apiFetch(`/workouts/${workoutId}/exercises`, {

    method: 'POST',
    body: JSON.stringify(data)
});
export const logSet = (performedExId, data) => apiFetch(`/workouts/exercises/${performedExId}/sets`, {
    method: 'POST',
    body: JSON.stringify(data)
});
export const deleteSet = (setId) => apiFetch(`/workouts/sets/${setId}`, {
    method: 'DELETE'
});
export const deleteExerciseFromWorkout = (performedExId) => apiFetch(`/workouts/exercises/${performedExId}`, {
    method: 'DELETE'
});
export const finishWorkout = (workoutId) => apiFetch(`/workouts/${workoutId}/finish`, {
    method: 'POST'
});
export const getWorkouts = () => apiFetch('/workouts');
export const getWorkoutById = (id) => apiFetch(`/workouts/${id}`);

// Stats Routes
export const getWorkoutFrequency = () => apiFetch('/stats/workout-frequency');
export const getVolumeByMuscle = () => apiFetch('/stats/volume-by-muscle');

// Gamification Routes
export const getExerciseChallenge = (exerciseId, workoutId) => apiFetch(`/exercises/${exerciseId}/challenge`, {
    method: 'POST',
    body: JSON.stringify({ workout_id: workoutId })
});
export const completeQuest = (questId) => apiFetch(`/quests/${questId}/complete`, {
    method: 'PATCH'
});

// AI Coach Routes
export const getAICoachResponse = (message, history, context) => apiFetch('/ai/coach', {
    method: 'POST',
    body: JSON.stringify({ message, history, context })
});
