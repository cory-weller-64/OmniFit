import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWorkouts } from '../../services/api';
import './History.css';

function History() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWorkouts()
      .then(setWorkouts)
      .catch(err => console.error('Failed to fetch workouts:', err))
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (dateString) => {
    const options = { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  if (loading) return <div className="loading">Loading history...</div>;

  return (
    <div className="history-page">
      <header className="history-header">
        <button className="btn-cyber-outline" onClick={() => navigate('/')}>← Back</button>
        <h2>Workout History</h2>
      </header>

      <div className="history-list">
        {workouts.length === 0 ? (
          <div className="no-history">
            <p>No workouts logged yet.</p>
            <button className="btn-cyber-primary" onClick={() => navigate('/')}>Start your first workout</button>
          </div>
        ) : (
          workouts.map(workout => (
            <div key={workout.id} className="history-card" onClick={() => navigate(`/history/${workout.id}`)}>
              <div className="card-top">
                <h3>{workout.name}</h3>
                <div className="card-badges">
                  {workout.pr_count > 0 && (
                    <span className="pr-count-badge">🏆 {workout.pr_count} PR{workout.pr_count > 1 ? 's' : ''}</span>
                  )}
                  <span className="xp-badge">+{workout.session_xp} XP</span>
                </div>
              </div>
              <div className="card-meta">
                <span className="date">{formatDate(workout.end_time)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default History;
