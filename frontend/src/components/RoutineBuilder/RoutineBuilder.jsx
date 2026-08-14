import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getExercises, createRoutine } from '../../services/api';
import './RoutineBuilder.css';

function RoutineBuilder() {
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [routineName, setRoutineName] = useState('');
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('All');
  const [recentlyUsed, setRecentlyUsed] = useState([]);

  // Initialize catalogue and load user preferences
  useEffect(() => {
    getExercises()
      .then(setCatalogue)
      .catch(err => console.error('Failed to fetch exercises:', err));

    const savedRecent = JSON.parse(localStorage.getItem('recentlyUsedExercises') || '[]');
    setRecentlyUsed(savedRecent);
  }, []);

  // Browser navigation guard for unsaved state
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

  // Synchronize state with AI Coach
  useEffect(() => {
    const payload = {
      currentPage: 'RoutineBuilder',
      exercises: selectedExercises
    };
    window.dispatchEvent(new CustomEvent('update-ai-coach-context', { detail: payload }));
  }, [selectedExercises]);

  // Listener for AI Coach recommendations
  useEffect(() => {
    const handleApply = (e) => {
      const suggestions = e.detail;
      
      setSelectedExercises(prev => {
        let current = [...prev];
        
        for (const s of suggestions) {
          // Handle replacement if specified
          if (s.replace_id) {
            current = current.filter(ex => ex.id !== s.replace_id);
          }
          
          // Add if not already present
          if (!current.some(ex => ex.id === s.id)) {
            const fullEx = catalogue.find(ex => ex.id === s.id);
            if (fullEx) {
              current.push({
                ...fullEx,
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

  // Exercise catalog filtering logic
  const filteredExercises = catalogue.filter(ex => {
    const matchesSearch = ex.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ex.primary_muscle_group.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMuscleGroup = selectedMuscleGroup === 'All' || ex.primary_muscle_group === selectedMuscleGroup;
    return matchesSearch && matchesMuscleGroup;
  });

  const muscleGroups = ['All', ...new Set(catalogue.map(ex => ex.primary_muscle_group))].sort();

  // Add an exercise to the list of selected exercises
  const addExercise = (exercise) => {
    setSelectedExercises([...selectedExercises, {
      ...exercise,
      instanceId: Date.now() + Math.random(), // Unique ID for list rendering
      sets: [{ weight: '', reps: '' }] // Start with 1 empty set
    }]);

    // Update recently used
    const updatedRecent = [exercise, ...recentlyUsed.filter(e => e.id !== exercise.id)].slice(0, 5);
    setRecentlyUsed(updatedRecent);
    localStorage.setItem('recentlyUsedExercises', JSON.stringify(updatedRecent));

    setSearchTerm('');
    setIsDirty(true);
  };

  // Reorder exercises
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

  // Remove an exercise from the list of selected exercises
  const removeExercise = (instanceId) => {
    setSelectedExercises(selectedExercises.filter(ex => ex.instanceId !== instanceId));
    setIsDirty(true);
  };

  // Add a set to an exercise
  const addSet = (instanceId) => {
    setSelectedExercises(selectedExercises.map(ex => {
      if (ex.instanceId === instanceId) {
        return { ...ex, sets: [...ex.sets, { weight: '', reps: '' }] };
      }
      return ex;
    }));
    setIsDirty(true);
  };

  // Update a set
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

  // Remove a set from an exercise
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

  // PERSISTENCE: Save routine template to backend
  const handleSave = async () => {
    if (!routineName.trim()) return alert('Please enter a routine name');
    if (selectedExercises.length === 0) return alert('Please add at least one exercise');

    // Ensure all exercises have at least one set (though UI ensures it, payload check is good)
    for (const ex of selectedExercises) {
      if (ex.sets.length === 0) {
        return alert(`Exercise "${ex.name}" must have at least one set`);
      }
    }

    setIsSaving(true);
    try {
      const payload = {
        name: routineName,
        exercises: selectedExercises.map(ex => ({
          exercise_id: ex.id,
          sets: ex.sets.map(s => ({
            weight: parseFloat(s.weight) || 0,
            reps: parseInt(s.reps) || 0
          }))
        }))
      };

      await createRoutine(payload);
      setIsDirty(false); // Clear dirty flag to allow navigation
      navigate('/');
    } catch (error) {
      alert('Failed to save routine: ' + (error.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (isDirty) {
      if (window.confirm("You have unsaved changes. Are you sure you want to exit?")) {
        navigate('/');
      }
    } else {
      navigate('/');
    }
  };

  return (
    <div className="routine-builder">
      <div className="builder-header">
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
        <button onClick={handleCancel} className="btn-cyber-danger" style={{ flex: 1 }} disabled={isSaving}>Cancel</button>
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
          {isSaving ? 'Saving...' : 'Save Routine'}
        </button>
      </div>
    </div>
  );
}

export default RoutineBuilder;
