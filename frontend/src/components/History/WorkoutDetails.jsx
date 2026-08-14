import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWorkoutById } from '../../services/api';
import './History.css';

function WorkoutDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWorkoutById(id)
      .then(setWorkout)
      .catch(err => console.error('Failed to fetch workout details:', err))
      .finally(() => setLoading(false));
  }, [id]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) return <div className="loading">Loading workout details...</div>;
  if (!workout) return <div className="error">Workout not found.</div>;

  return (
    <div className="workout-details-page">
      <header className="history-header">
        <button className="btn-cyber-outline" onClick={() => navigate('/history')}>← Back</button>
        <div className="details-title-container">
          <h2>{workout.name}</h2>
          <p className="details-date">{formatDate(workout.end_time)}</p>
        </div>
        <div className="xp-summary">
          <span className="xp-label">XP Gained</span>
          <span className="xp-value">+{workout.session_xp}</span>
        </div>
      </header>

      <div className="details-content">
        {workout.exercises.map((ex, index) => (
          <div key={ex.id} className={`exercise-detail-card ${ex.is_pr ? 'pr-highlight' : ''}`}>
            <div className="ex-header">
              <div className="ex-title-group">
                <h4>{index + 1}. {ex.name}</h4>
                {ex.is_pr && <span className="pr-badge">🏆 New PR!</span>}
              </div>
              <span className="muscle-tag">{ex.primary_muscle_group}</span>
            </div>
            
            {ex.is_pr && (
              <div className="pr-details">
                Record Achieved: <strong>{ex.pr_details.record_type.replace('_', ' ')}</strong> - {Math.round(ex.pr_details.value)}
                {ex.pr_details.record_type === '1RM' ? 'kg (Est.)' : ex.pr_details.record_type === 'HEAVIEST_WEIGHT' ? 'kg' : 'kg*reps'}
              </div>
            )}

            <table className="sets-table">
              <thead>
                <tr>
                  <th>Set</th>
                  <th>Weight (kg)</th>
                  <th>Reps</th>
                  <th>1RM Est.</th>
                  <th className="pr-col"></th>
                </tr>
              </thead>
              <tbody>
                {ex.sets.map(set => {
                  const oneRM = Math.round(set.weight * (1 + set.reps / 30));
                  return (
                    <tr key={set.id} className={set.pr_type ? 'set-pr-row' : ''}>
                      <td>{set.set_number}</td>
                      <td>{set.weight}</td>
                      <td>{set.reps}</td>
                      <td className="one-rm-col">{oneRM}kg</td>
                      <td className="pr-col">
                        {set.pr_type && <span title={set.pr_type} className="set-pr-icon">🏆</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

export default WorkoutDetails;
