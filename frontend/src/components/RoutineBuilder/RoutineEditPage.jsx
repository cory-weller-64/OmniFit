import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getExercises, getRoutineById, updateRoutine } from '../../services/api';
import './RoutineBuilder.css';

function RoutineEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [routineName, setRoutineName] = useState('');
  const [routineNotes, setRoutineNotes] = useState('');
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('All');
  const [recentlyUsed, setRecentlyUsed] = useState([]);

  useEffect(() => {
    Promise.all([
      getExercises(),
      getRoutineById(id)
    ])
    .then(([exercises, routine]) => {
      setCatalogue(exercises);
      setRoutineName(routine.name);
      setRoutineNotes(routine.notes || '');
      
      // Map sets to be editable
      const mappedExercises = routine.exercises.map(ex => ({
        ...ex,
        instanceId: Math.random(), // Unique ID for UI
        sets: ex.sets.map(s => ({
          weight: s.target_weight.toString(),
          reps: s.target_reps.toString()
        }))
      }));
      setSelectedExercises(mappedExercises);
    })
    .catch(err => {
      console.error('Failed to fetch data:', err);
      alert('Failed to load routine.');
      navigate('/');
    })
    .finally(() => setLoading(false));

    const savedRecent = JSON.parse(localStorage.getItem('recentlyUsedExercises') || '[]');
    setRecentlyUsed(savedRecent);
  }, [id, navigate]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty && !isSaving) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, isSaving]);

  // AI Coach: Sync context whenever selected exercises change
  useEffect(() => {
    const payload = {
      currentPage: 'RoutineEditPage',
      exercises: selectedExercises
    };
    window.dispatchEvent(new CustomEvent('update-ai-coach-context', { detail: payload }));
  }, [selectedExercises]);

  // AI Coach: Listen for suggestions to apply
  useEffect(() => {
    const handleApply = (e) => {
      const suggestions = e.detail;
      
      setSelectedExercises(prev => {
        let current = [...prev];
        
        for (const s of suggestions) {
          // Handle replacement if specified
          if (s.replace_id) {
            current = current.filter(ex => (ex.exercise_id || ex.id) !== s.replace_id);
          }
          
          // Add if not already present
          if (!current.some(ex => (ex.exercise_id || ex.id) === s.id)) {
            const fullEx = catalogue.find(ex => ex.id === s.id);
            if (fullEx) {
              current.push({
                ...fullEx,
                exercise_id: fullEx.id,
                instanceId: Date.now() + Math.random(),
                sets: Array.from({ length: s.sets || 1 }, () => ({ weight: '', reps: '' }))
              });
            }
          }
        }
        return current;
      });
      setIsDirty(true);
    };
    window.addEventListener('apply-ai-suggestions', handleApply);
    return () => window.removeEventListener('apply-ai-suggestions', handleApply);
  }, [catalogue]);

  const filteredExercises = catalogue.filter(ex => {
    const matchesSearch = ex.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ex.primary_muscle_group.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMuscleGroup = selectedMuscleGroup === 'All' || ex.primary_muscle_group === selectedMuscleGroup;
    return matchesSearch && matchesMuscleGroup;
  });

  const muscleGroups = ['All', ...new Set(catalogue.map(ex => ex.primary_muscle_group))].sort();

  const addExercise = (exercise) => {
    setSelectedExercises([...selectedExercises, {
      ...exercise,
      exercise_id: exercise.id,
      instanceId: Math.random(),
      sets: [{ weight: '', reps: '' }]
    }]);

    const updatedRecent = [exercise, ...recentlyUsed.filter(e => e.id !== exercise.id)].slice(0, 5);
    setRecentlyUsed(updatedRecent);
    localStorage.setItem('recentlyUsedExercises', JSON.stringify(updatedRecent));

    setSearchTerm('');
    setIsDirty(true);
  };

  const moveExerciseUp = (index) => {
    if (index === 0) return;
    const newEx = [...selectedExercises];
    const temp = newEx[index];
    newEx[index] = newEx[index - 1];
    newEx[index - 1] = temp;
    setSelectedExercises(newEx);
    setIsDirty(true);
  };

  const moveExerciseDown = (index) => {
    if (index === selectedExercises.length - 1) return;
    const newEx = [...selectedExercises];
    const temp = newEx[index];
    newEx[index] = newEx[index + 1];
    newEx[index + 1] = temp;
    setSelectedExercises(newEx);
    setIsDirty(true);
  };

  const removeExercise = (instanceId) => {
    setSelectedExercises(selectedExercises.filter(ex => ex.instanceId !== instanceId));
    setIsDirty(true);
  };

  const addSet = (instanceId) => {
    setSelectedExercises(selectedExercises.map(ex => {
      if (ex.instanceId === instanceId) {
        return { ...ex, sets: [...ex.sets, { weight: '', reps: '' }] };
      }
      return ex;
    }));
    setIsDirty(true);
  };

  const updateSet = (instanceId, setIndex, field, value) => {
    setSelectedExercises(selectedExercises.map(ex => {
      if (ex.instanceId === instanceId) {
        const newSets = [...ex.sets];
        newSets[setIndex] = { ...newSets[setIndex], [field]: value };
        return { ...ex, sets: newSets };
      }
      return ex;
    }));
    setIsDirty(true);
  };

  const removeSet = (instanceId, setIndex) => {
    setSelectedExercises(selectedExercises.map(ex => {
      if (ex.instanceId === instanceId) {
        const newSets = ex.sets.filter((_, i) => i !== setIndex);
        return { ...ex, sets: newSets.length ? newSets : [{ weight: '', reps: '' }] };
      }
      return ex;
    }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!routineName.trim()) return alert('Please enter a routine name');
    if (selectedExercises.length === 0) return alert('Please add at least one exercise');

    setIsSaving(true);
    try {
      const payload = {
        name: routineName,
        notes: routineNotes,
        exercises: selectedExercises.map(ex => ({
          exercise_id: ex.exercise_id,
          sets: ex.sets.map(s => ({
            weight: parseFloat(s.weight) || 0,
            reps: parseInt(s.reps) || 0
          }))
        }))
      };

      await updateRoutine(id, payload);
      setIsDirty(false);
      navigate('/');
    } catch (error) {
      alert('Failed to update routine: ' + (error.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading routine...</div>;

  return (
    <div className="routine-builder">
      <div className="builder-header">
        <div className="header-top">
            <button className="btn-cyber-outline" onClick={() => navigate('/')}>← Back</button>
            <input
                type="text"
                placeholder="Enter routine name"
                value={routineName}
                onChange={(e) => {
                    setRoutineName(e.target.value);
                    setIsDirty(true);
                }}
                className="name-input"
                disabled={isSaving}
            />
        </div>
        {isDirty && <span className="dirty-indicator">Unsaved Changes</span>}
      </div>

      <div className="exercise-search">
        <div className="search-controls">
          <input
            type="text"
            placeholder="🔍 Search exercises by name or muscle..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            disabled={isSaving}
          />
          <select
            value={selectedMuscleGroup}
            onChange={(e) => setSelectedMuscleGroup(e.target.value)}
            className="muscle-filter"
            disabled={isSaving}
          >
            {muscleGroups.map(mg => (
              <option key={mg} value={mg}>{mg === 'All' ? 'All Muscles' : mg}</option>
            ))}
          </select>
        </div>

        {searchTerm && (
          <div className="search-results">
            <div className="results-header" style={{ padding: '0.5rem 1rem', background: 'rgba(6, 182, 212, 0.1)', fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>
              Search Results
            </div>
            {filteredExercises.length > 0 ? (
              filteredExercises.map(ex => (
                <div key={ex.id} className="search-item" onClick={() => addExercise(ex)}>
                  <span className="ex-name">{ex.name}</span>
                  <span className="ex-muscle">{ex.primary_muscle_group}</span>
                </div>
              ))
            ) : (
              <div className="no-results">No exercises found matching "{searchTerm}"</div>
            )}
          </div>
        )}

        {!searchTerm && (
          <div className="quick-add">
            {recentlyUsed.length > 0 && (
              <div className="recently-used">
                <h5>Recently Used</h5>
                <div className="recent-chips">
                  {recentlyUsed.map(ex => (
                    <button 
                      key={`chip-${ex.id}`} 
                      className="recent-chip"
                      onClick={() => addExercise(ex)}
                      disabled={isSaving}
                    >
                      {ex.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="selected-exercises">
        {selectedExercises.map((ex, exIndex) => (
          <div key={ex.instanceId} className="exercise-card">
            <button 
              onClick={() => removeExercise(ex.instanceId)} 
              className="btn-cyber-delete top-right"
              disabled={isSaving}
              title="Remove Exercise"
            >×</button>
            <div className="card-header">
              <div className="header-main">
                <h4>{exIndex + 1}. {ex.name}</h4>
                <div className="reorder-actions">
                  <button 
                    className="btn-reorder" 
                    onClick={() => moveExerciseUp(exIndex)}
                    disabled={isSaving || exIndex === 0}
                    title="Move Up"
                  >▲</button>
                  <button 
                    className="btn-reorder" 
                    onClick={() => moveExerciseDown(exIndex)}
                    disabled={isSaving || exIndex === selectedExercises.length - 1}
                    title="Move Down"
                  >▼</button>
                </div>
              </div>
            </div>

            <div className="sets-list">
              <div className="set-labels">
                <span>Set</span>
                <span>kg</span>
                <span>Reps</span>
                <span></span>
              </div>
              {ex.sets.map((set, setIndex) => (
                <div key={setIndex} className="set-row">
                  <span className="set-num">{setIndex + 1}</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={set.weight}
                    onChange={(e) => updateSet(ex.instanceId, setIndex, 'weight', e.target.value)}
                    disabled={isSaving}
                  />
                  <input
                    type="number"
                    placeholder="0"
                    value={set.reps}
                    onChange={(e) => updateSet(ex.instanceId, setIndex, 'reps', e.target.value)}
                    disabled={isSaving}
                  />
                  <button 
                    onClick={() => removeSet(ex.instanceId, setIndex)} 
                    className="btn-cyber-delete"
                    disabled={isSaving}
                    title="Remove Set"
                  >×</button>
                </div>
              ))}
              <button 
                onClick={() => addSet(ex.instanceId)} 
                className="btn-cyber-outline"
                style={{ width: '100%', marginTop: '1rem' }}
                disabled={isSaving}
              >+ Add Set</button>
            </div>
          </div>
        ))}
      </div>

      <div className="builder-actions">
        <button onClick={() => navigate('/')} className="btn-cyber-danger" style={{ flex: 1 }} disabled={isSaving}>Discard</button>
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-ai-coach'))} 
          className="btn-cyber-outline"
          style={{ flex: 1 }}
          disabled={isSaving}
        >
          🤖 Coach
        </button>
        <button
          onClick={handleSave}
          className="btn-cyber-primary"
          style={{ flex: 2 }}
          disabled={isSaving}
        >
          {isSaving ? 'Updating...' : 'Update Routine'}
        </button>
      </div>
    </div>
  );
}

export default RoutineEditPage;
