import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    getRoutineById,
    getExercises,
    createRoutine,
    updateRoutine,
    startWorkout,
    getActiveWorkout,
    addExerciseToWorkout,
    logSet,
    deleteSet,
    deleteExerciseFromWorkout,
    finishWorkout,
    getExerciseChallenge,
    completeQuest
} from '../../services/api';
import VictoryLap from './VictoryLap';
import './LiveWorkout.css';

function LiveWorkout() {
    const { routineId } = useParams();
    const navigate = useNavigate();
    const initRef = useRef(null);
    const [workout, setWorkout] = useState(null);
    const [workoutId, setWorkoutId] = useState(null);
    const [originalRoutine, setOriginalRoutine] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [timerActive, setTimerActive] = useState(false);
    const [victoryData, setVictoryData] = useState(null);
    const [toasts, setToasts] = useState([]);

    const [catalogue, setCatalogue] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('All');

    // State for active AI challenges
    const [challenges, setChallenges] = useState({}); // { exIndex: challengeObj }
    const [fetchingChallenge, setFetchingChallenge] = useState(null);

    // Toast notifications
    const addToast = (text, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, text, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    };

    // Workout initialization and session recovery
    useEffect(() => {
        if (initRef.current === routineId) return;
        initRef.current = routineId;

        const initWorkout = async () => {
            try {
                const catalogueData = await getExercises();
                setCatalogue(catalogueData);

                const activeSession = await getActiveWorkout();
                
                if (activeSession) {
                    const isSameRoutine = activeSession.routine_template_id?.toString() === routineId;
                    const isBothLive = routineId === 'live' && !activeSession.routine_template_id;

                    if (isSameRoutine || isBothLive) {
                        setWorkoutId(activeSession.id);
                        const hydratedExercises = activeSession.exercises.map(ex => ({
                            ...ex,
                            id: ex.performed_ex_id || ex.id,
                            sets: ex.sets.map(s => ({
                                ...s,
                                id: s.id || s.db_id || `res-${Math.random()}`,
                                actual_weight: s.actual_weight ?? s.weight ?? 0,
                                actual_reps: s.actual_reps ?? s.reps ?? 0,
                                is_completed: !!s.is_completed
                            }))
                        }));

                        setWorkout({
                            name: activeSession.name,
                            notes: activeSession.notes,
                            exercises: hydratedExercises
                        });
                        
                        if (activeSession.routine_template_id) {
                            const original = await getRoutineById(activeSession.routine_template_id);
                            setOriginalRoutine(original);
                        } else {
                            setOriginalRoutine({ name: 'Quick Session', exercises: [] });
                        }
                        
                        setLoading(false);
                        return;
                    } else {
                        if (window.confirm(`Resume unfinished session: "${activeSession.name}"?`)) {
                            navigate(activeSession.routine_template_id ? `/workout/${activeSession.routine_template_id}` : '/workout/live');
                            return;
                        }
                    }
                }

                if (routineId === 'live') {
                    const session = await startWorkout({ name: 'Quick Session' });
                    setWorkoutId(session.id);
                    setWorkout({ name: 'Quick Session', exercises: [] });
                    setOriginalRoutine({ name: 'Quick Session', exercises: [] });
                } else {
                    const routineData = await getRoutineById(routineId);
                    setOriginalRoutine(routineData);

                    const session = await startWorkout({
                        name: routineData.name,
                        notes: routineData.notes,
                        routine_template_id: routineId
                    });
                    setWorkoutId(session.id);

                    const initializedExercises = [];
                    for (let i = 0; i < routineData.exercises.length; i++) {
                        const ex = routineData.exercises[i];
                        const perfEx = await addExerciseToWorkout(session.id, {
                            exercise_id: ex.exercise_id,
                            position: i + 1,
                            rest_timer_s: ex.rest_timer_s
                        });

                        initializedExercises.push({
                            ...ex,
                            id: perfEx.id,
                            performed_ex_id: perfEx.id,
                            sets: ex.sets.map((s, si) => ({
                                ...s,
                                id: `init-${perfEx.id}-${si}`,
                                db_id: null,
                                is_completed: false,
                                actual_weight: s.target_weight,
                                actual_reps: s.target_reps,
                                brokenPRs: []
                            }))
                        });
                    }
                    setWorkout({ ...routineData, exercises: initializedExercises });
                }
            } catch (err) {
                console.error('Init failed:', err);
                navigate('/');
            } finally {
                setLoading(false);
            }
        };

        initWorkout();
    }, [routineId, navigate]);

    // Synchronize workout context with AI Coach
    useEffect(() => {
        if (workout) {
            window.dispatchEvent(new CustomEvent('update-ai-coach-context', { 
                detail: { currentPage: 'LiveWorkout', exercises: workout.exercises } 
            }));
        }
    }, [workout?.exercises]);

    // Apply AI-suggested exercise swaps or additions
    useEffect(() => {
        const handleApply = async (e) => {
            const suggestions = e.detail;
            if (!workout || !workoutId) return;
            
            let currentExercises = [...workout.exercises];
            let hasChanges = false;

            for (const s of suggestions) {
                let targetIndex = -1;
                if (s.replace_id) {
                    targetIndex = currentExercises.findIndex(ex => ex.exercise_id === s.replace_id);
                    if (targetIndex !== -1) {
                        try {
                            const oldEx = currentExercises[targetIndex];
                            if (oldEx.performed_ex_id) await deleteExerciseFromWorkout(oldEx.performed_ex_id);
                        } catch (err) { console.error('Swap failed:', err); }
                    }
                }

                const fullEx = catalogue.find(ex => ex.id === s.id);
                if (fullEx) {
                    try {
                        const pos = targetIndex !== -1 ? targetIndex + 1 : currentExercises.length + 1;
                        const perfEx = await addExerciseToWorkout(workoutId, {
                            exercise_id: fullEx.id,
                            position: pos,
                            rest_timer_s: 60
                        });

                        const newEx = {
                            ...fullEx,
                            exercise_id: fullEx.id,
                            performed_ex_id: perfEx.id,
                            id: perfEx.id,
                            rest_timer_s: 60,
                            sets: Array.from({ length: s.sets || 3 }, (_, i) => ({
                                id: `temp-${Date.now()}-${i}`,
                                set_number: i + 1,
                                actual_weight: s.weight || 0,
                                actual_reps: s.reps || 10,
                                is_completed: false,
                                brokenPRs: []
                            }))
                        };

                        if (targetIndex !== -1) currentExercises[targetIndex] = newEx;
                        else if (!currentExercises.some(ex => ex.exercise_id === s.id)) currentExercises.push(newEx);
                        hasChanges = true;
                    } catch (err) { console.error('Add failed:', err); }
                }
            }

            if (hasChanges) {
                setWorkout(prev => ({ ...prev, exercises: currentExercises }));
                setIsDirty(true);
            }
        };
        window.addEventListener('apply-ai-suggestions', handleApply);
        return () => window.removeEventListener('apply-ai-suggestions', handleApply);
    }, [workout, catalogue, workoutId]);

    // Workout rest timer
    useEffect(() => {
        let timer;
        if (timerActive && timeLeft > 0) {
            timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        } else if (timerActive && timeLeft === 0) {
            setTimerActive(false);
            playBeep();
        }
        return () => clearInterval(timer);
    }, [timerActive, timeLeft]);

    const playBeep = (freq = 880) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.connect(g); g.connect(ctx.destination);
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            g.gain.setValueAtTime(0, ctx.currentTime);
            g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);
            g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        } catch (e) {}
    };

    const stats = useMemo(() => {
        if (!workout) return { totalSets: 0, completedSets: 0, estXp: 0, progress: 0 };
        let t = 0, c = 0, v = 0;
        workout.exercises.forEach(ex => {
            ex.sets.forEach(s => {
                t++;
                if (s.is_completed) { c++; v += (parseFloat(s.actual_weight) || 0) * (parseInt(s.actual_reps) || 0); }
            });
        });
        return { totalSets: t, completedSets: c, estXp: Math.floor(v / 3) + (c * 50), progress: t > 0 ? (c / t) * 100 : 0 };
    }, [workout]);

    const toggleSet = async (exIndex, setIndex) => {
        const newEx = [...workout.exercises];
        const ex = newEx[exIndex];
        const set = ex.sets[setIndex];
        
        if (!ex.performed_ex_id) return alert("Session sync error. Please refresh.");

        try {
            if (!set.is_completed) {
                const res = await logSet(ex.performed_ex_id, {
                    set_number: set.set_number,
                    weight: parseFloat(set.actual_weight) || 0,
                    reps: parseInt(set.actual_reps) || 0
                });
                set.db_id = res.id;
                set.is_completed = true;
                set.brokenPRs = res.brokenPRs || [];

                // Toast Feedback
                const xpGained = Math.floor((set.actual_weight * set.actual_reps) / 3) + 50;
                addToast(`+${xpGained} XP`, 'xp');
                if (res.brokenPRs && res.brokenPRs.length > 0) {
                    addToast(`🏆 NEW RECORD: ${res.brokenPRs.join(', ')}`, 'pr');
                }

                // AI Challenge Check
                const currentChallenge = challenges[exIndex];
                if (currentChallenge && !currentChallenge.is_completed) {
                    let met = false;
                    const w = parseFloat(set.actual_weight) || 0;
                    const r = parseInt(set.actual_reps) || 0;
                    if (currentChallenge.target_metric === 'REPS' && r >= parseFloat(currentChallenge.target_value)) met = true;
                    if (currentChallenge.target_metric === 'WEIGHT' && w >= parseFloat(currentChallenge.target_value)) met = true;
                    if (currentChallenge.target_metric === 'VOLUME' && (w * r) >= parseFloat(currentChallenge.target_value)) met = true;

                    if (met) {
                        try {
                            if (currentChallenge.quest_id) {
                                await completeQuest(currentChallenge.quest_id);
                            }
                            setChallenges(prev => ({
                                ...prev,
                                [exIndex]: { ...currentChallenge, is_completed: true }
                            }));
                            addToast(`Challenge Completed! ✨`, 'xp');
                        } catch (err) {
                            console.error("Failed to complete quest", err);
                        }
                    }
                }

                setTimeLeft(ex.rest_timer_s || 60); setTimerActive(true);
            } else {
                if (set.db_id) await deleteSet(set.db_id);
                set.db_id = null; set.is_completed = false; set.brokenPRs = [];

                // Re-evaluate challenge if un-checking
                const currentChallenge = challenges[exIndex];
                if (currentChallenge && currentChallenge.is_completed) {
                    let stillMet = false;
                    for (const s of newEx[exIndex].sets) {
                        if (s.is_completed && s.id !== set.id) {
                            const w = parseFloat(s.actual_weight) || 0;
                            const r = parseInt(s.actual_reps) || 0;
                            if (currentChallenge.target_metric === 'REPS' && r >= parseFloat(currentChallenge.target_value)) stillMet = true;
                            if (currentChallenge.target_metric === 'WEIGHT' && w >= parseFloat(currentChallenge.target_value)) stillMet = true;
                            if (currentChallenge.target_metric === 'VOLUME' && (w * r) >= parseFloat(currentChallenge.target_value)) stillMet = true;
                        }
                    }
                    if (!stillMet) {
                        setChallenges(prev => ({
                            ...prev,
                            [exIndex]: { ...currentChallenge, is_completed: false }
                        }));
                    }
                }

                setTimerActive(false); setTimeLeft(0);
            }
            setWorkout({ ...workout, exercises: newEx });
            setIsDirty(true);
            setActiveExerciseIndex(exIndex);
        } catch (err) {
            alert("Connection error: Failed to sync set with server.");
        }
    };

    const handleInputChange = (exIndex, setIndex, field, val) => {
        const newEx = [...workout.exercises];
        newEx[exIndex].sets[setIndex][field] = val;
        setWorkout({ ...workout, exercises: newEx });
        setIsDirty(true);
    };

    const handleExerciseChange = (exIndex, field, val) => {
        const newEx = [...workout.exercises];
        newEx[exIndex][field] = val;
        setWorkout({ ...workout, exercises: newEx });
        setIsDirty(true);
    };

    const addSet = (exIndex) => {
        const newEx = [...workout.exercises];
        const ex = newEx[exIndex];
        const last = ex.sets[ex.sets.length - 1];
        ex.sets.push({
            id: `new-${Date.now()}-${Math.random()}`,
            db_id: null,
            set_number: ex.sets.length + 1,
            is_completed: false,
            actual_weight: last ? last.actual_weight : 0,
            actual_reps: last ? last.actual_reps : 0,
            brokenPRs: []
        });
        setWorkout({ ...workout, exercises: newEx });
        setIsDirty(true);
    };

    const removeSet = async (exIndex, setIndex) => {
        const newEx = [...workout.exercises];
        const set = newEx[exIndex].sets[setIndex];
        if (set.is_completed && set.db_id) {
            try { await deleteSet(set.db_id); } catch (e) { return alert("Delete failed"); }
        }
        newEx[exIndex].sets = newEx[exIndex].sets.filter((_, i) => i !== setIndex).map((s, i) => ({ ...s, set_number: i + 1 }));
        setWorkout({ ...workout, exercises: newEx });
        setIsDirty(true);
    };

    const removeExercise = async (exIndex) => {
        if (!window.confirm("Remove exercise?")) return;
        try {
            const ex = workout.exercises[exIndex];
            if (ex.performed_ex_id) await deleteExerciseFromWorkout(ex.performed_ex_id);
            const newEx = workout.exercises.filter((_, i) => i !== exIndex);
            setWorkout({ ...workout, exercises: newEx });
            setIsDirty(true);
        } catch (err) { alert("Delete failed."); }
    };

    const moveExerciseUp = (index) => {
        if (index === 0) return;
        const newEx = [...workout.exercises];
        [newEx[index], newEx[index - 1]] = [newEx[index - 1], newEx[index]];
        setWorkout({ ...workout, exercises: newEx });
        setActiveExerciseIndex(index - 1);
        setIsDirty(true);
    };

    const moveExerciseDown = (index) => {
        if (index === workout.exercises.length - 1) return;
        const newEx = [...workout.exercises];
        [newEx[index], newEx[index + 1]] = [newEx[index + 1], newEx[index]];
        setWorkout({ ...workout, exercises: newEx });
        setActiveExerciseIndex(index + 1);
        setIsDirty(true);
    };

    const addExercise = async (ex) => {
        try {
            const pEx = await addExerciseToWorkout(workoutId, { exercise_id: ex.id, position: workout.exercises.length + 1, rest_timer_s: 60 });
            const nEx = { 
                ...ex, 
                exercise_id: ex.id, 
                performed_ex_id: pEx.id, 
                id: pEx.id, 
                rest_timer_s: 60, 
                sets: [{ id: `s-${Date.now()}`, db_id: null, set_number: 1, is_completed: false, actual_weight: 0, actual_reps: 0, brokenPRs: [] }] 
            };
            setWorkout({ ...workout, exercises: [...workout.exercises, nEx] });
            setIsDirty(true); setShowSearch(false); setActiveExerciseIndex(workout.exercises.length);
        } catch (e) { alert("Add failed."); }
    };

    const handleGenerateChallenge = async (exIndex, e) => {
        e.stopPropagation();
        const ex = workout.exercises[exIndex];
        setFetchingChallenge(exIndex);
        try {
            const challenge = await getExerciseChallenge(ex.exercise_id, workoutId);
            setChallenges(prev => ({ ...prev, [exIndex]: challenge }));
            addToast("Challenge Generated! ⚡", "xp");
        } catch (err) {
            console.error("Challenge error:", err);
            addToast("Failed to generate challenge", "error");
        } finally {
            setFetchingChallenge(null);
        }
    };

    const handleFinish = async () => {
        if (!workout.exercises.some(ex => ex.sets.some(s => s.is_completed))) return alert("Log a set first!");
        setIsSaving(true);
        try {
            const res = await finishWorkout(workoutId);
            setIsDirty(false); setVictoryData(res);
        } catch (e) { alert("Finish failed."); } finally { setIsSaving(false); }
    };

    const muscleGroups = ['All', ...new Set(catalogue.map(ex => ex.primary_muscle_group))].sort();
    const filteredCatalogue = catalogue.filter(ex => (selectedMuscleGroup === 'All' || ex.primary_muscle_group === selectedMuscleGroup) && ex.name.toLowerCase().includes(searchTerm.toLowerCase()));

    if (loading) return <div className="loading">Loading session...</div>;
    if (!workout) return <div className="error">Session not found</div>;

    return (
        <div className="live-workout">
            <div className="toasts-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast ${t.type}`}>
                        {t.type === 'pr' && <span>🏆</span>}
                        {t.type === 'xp' && <span>✨</span>}
                        {t.text}
                    </div>
                ))}
            </div>

            {victoryData && <VictoryLap data={victoryData} onDashboard={() => navigate('/')} />}
            <div className="workout-top-title"><h1>{workout.name}</h1>{isDirty && <span className="status-badge">Live</span>}</div>
            
            <header className="workout-header">
                <div className="header-grid">
                    <div className="xp-estimate">✨ {stats.estXp} XP</div>
                    <div className="workout-progress-container">
                        <div className="progress-stats"><span>Progress</span><span>{stats.completedSets}/{stats.totalSets}</span></div>
                        <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${stats.progress}%` }}></div></div>
                    </div>
                </div>
                {timerActive && (
                    <div className="rest-timer-overlay">
                        <div className="timer-circle"><span className="timer-label">REST</span><span className="timer-value">{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</span></div>
                        <div className="timer-actions">
                            <button className="btn-adjust" onClick={() => setTimeLeft(p => Math.max(0, p - 15))}>-15s</button>
                            <button className="timer-skip" onClick={() => setTimeLeft(0)}>SKIP</button>
                            <button className="btn-adjust" onClick={() => setTimeLeft(p => p + 15)}>+15s</button>
                        </div>
                    </div>
                )}
            </header>

            <div className="exercises-list">
                {workout.exercises.map((ex, exIndex) => (
                    <div key={ex.id} className={`exercise-section ${exIndex === activeExerciseIndex ? 'active' : ''}`} onClick={() => setActiveExerciseIndex(exIndex)}>
                        <div className="exercise-info">
                            <div className="ex-title-group">
                                <h3>{ex.name}</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    {exIndex === activeExerciseIndex && <span className="active-tag">Active</span>}
                                    <div className="rest-edit-group" onClick={(e) => e.stopPropagation()} style={{ width: 'fit-content' }}>
                                        <label>Rest</label>
                                        <input 
                                            type="number" 
                                            className="rest-input-standard"
                                            value={ex.rest_timer_s === undefined ? 60 : ex.rest_timer_s}
                                            onChange={(e) => handleExerciseChange(exIndex, 'rest_timer_s', parseInt(e.target.value) || 0)}
                                            step="15"
                                            min="0"
                                        />
                                        <label>s</label>
                                    </div>
                                </div>
                            </div>
                            <div className="ex-meta-actions">
                                <div className="reorder-actions-live">
                                    <button className="btn-reorder" onClick={(e) => { e.stopPropagation(); moveExerciseUp(exIndex); }} disabled={exIndex === 0}>▲</button>
                                    <button className="btn-reorder" onClick={(e) => { e.stopPropagation(); moveExerciseDown(exIndex); }} disabled={exIndex === workout.exercises.length - 1}>▼</button>
                                </div>
                                <button className="btn-cyber-delete" onClick={(e) => { e.stopPropagation(); removeExercise(exIndex); }}>×</button>
                            </div>
                        </div>
                        <div className="ai-challenge-container" style={{ marginBottom: '15px' }}>
                            {!challenges[exIndex] ? (
                                <button 
                                    className="btn-cyber-outline" 
                                    style={{ width: '100%', padding: '8px', fontSize: '0.9rem' }}
                                    onClick={(e) => handleGenerateChallenge(exIndex, e)}
                                    disabled={fetchingChallenge === exIndex}
                                >
                                    {fetchingChallenge === exIndex ? 'Generating...' : '⚡ Generate AI Challenge'}
                                </button>
                            ) : (
                                <div style={{ 
                                    padding: '15px', 
                                    background: challenges[exIndex].is_completed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0, 255, 204, 0.1)', 
                                    border: `1px solid ${challenges[exIndex].is_completed ? 'var(--success)' : 'var(--accent)'}`, 
                                    borderRadius: '8px', 
                                    fontSize: '0.9rem', 
                                    color: challenges[exIndex].is_completed ? 'var(--success)' : 'var(--accent)', 
                                    lineHeight: '1.4',
                                    boxShadow: challenges[exIndex].is_completed ? '0 0 15px rgba(16, 185, 129, 0.2)' : 'none'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                        <strong>{challenges[exIndex].is_completed ? '✅ Challenge Completed!' : '⚡ AI Challenge'}</strong>
                                        {challenges[exIndex].is_completed && <span style={{ fontWeight: '900' }}>+{challenges[exIndex].xp_reward || 200} XP</span>}
                                    </div>
                                    <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: '500' }}>
                                        {challenges[exIndex].challenge_text}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="sets-list">
                            <div className="sets-header"><span>Set</span><span>kg</span><span>Reps</span><span>Done</span></div>
                            {ex.sets.map((set, setIndex) => (
                                <div key={set.id} className={`set-row ${set.is_completed ? 'completed' : ''}`}>
                                    <span className="set-num">{set.set_number}</span>
                                    <input type="number" className="set-input" value={set.actual_weight} onChange={(e) => handleInputChange(exIndex, setIndex, 'actual_weight', e.target.value)} disabled={set.is_completed} />
                                    <input type="number" className="set-input" value={set.actual_reps} onChange={(e) => handleInputChange(exIndex, setIndex, 'actual_reps', e.target.value)} disabled={set.is_completed} />
                                    <div className="set-actions">
                                        {set.brokenPRs?.length > 0 && <span className="pr-badge" title={set.brokenPRs.join(', ')}>🏆</span>}
                                        <button className={`check-btn ${!set.is_completed ? 'pending' : ''}`} onClick={(e) => { e.stopPropagation(); toggleSet(exIndex, setIndex); }}>✓</button>
                                        {!set.is_completed && <button className="btn-cyber-delete" onClick={(e) => { e.stopPropagation(); removeSet(exIndex, setIndex); }}>×</button>}
                                    </div>
                                </div>
                            ))}
                            <button className="btn-add-set-live" onClick={(e) => { e.stopPropagation(); addSet(exIndex); }}>+ Set</button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="workout-actions">
                <button className="btn-cyber-danger" style={{ flex: 1 }} onClick={() => navigate('/')}>Cancel</button>
                <button className="btn-cyber-outline" style={{ flex: 1 }} onClick={() => window.dispatchEvent(new CustomEvent('toggle-ai-coach'))}>🤖 Coach</button>
                <button className="btn-cyber-primary" style={{ flex: 2 }} onClick={handleFinish} disabled={isSaving}>{isSaving ? '...' : 'Finish'}</button>
            </div>
            
            <div className="live-builder-actions" style={{ marginTop: '2rem' }}>
                {!showSearch ? (
                    <button className="btn-add-ex-trigger" onClick={() => setShowSearch(true)}>+ Add Exercise</button>
                ) : (
                    <div className="live-ex-search">
                        <div className="search-row" style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus style={{ flex: 2 }} />
                            <select value={selectedMuscleGroup} onChange={(e) => setSelectedMuscleGroup(e.target.value)} style={{ flex: 1 }}>
                                {muscleGroups.map(mg => <option key={mg} value={mg}>{mg}</option>)}
                            </select>
                        </div>
                        <div className="live-search-results" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                            {filteredCatalogue.map(ex => (
                                <div key={ex.id} className="live-search-item" onClick={() => addExercise(ex)} style={{ padding: '10px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                                    {ex.name} <small style={{ color: 'var(--accent)' }}>{ex.primary_muscle_group}</small>
                                </div>
                            ))}
                        </div>
                        <button className="btn-cancel-search" onClick={() => setShowSearch(false)} style={{ width: '100%', marginTop: '10px' }}>Cancel</button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default LiveWorkout;
