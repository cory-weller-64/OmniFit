import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getUserProfile, getRoutines, deleteRoutine, getUsers, createUser, updateUserProfile } from '../../services/api';
import Analytics from './Analytics';
import './Dashboard.css';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [routines, setRoutines] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(localStorage.getItem('userId') || '1');
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  
  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({ age: '', weight_kg: '', height_cm: '' });

  useEffect(() => {
    setLoading(true);
    // Fetch dashboard data
    Promise.all([
      getUserProfile(),
      getRoutines(),
      getUsers()
    ])
      .then(([userData, routinesData, usersData]) => {
        setUser(userData);
        setRoutines(routinesData);
        setAllUsers(usersData);
        setProfileData({
          age: userData.age || '',
          weight_kg: userData.weight_kg || '',
          height_cm: userData.height_cm || ''
        });

        // Update AI Coach context
        const event = new CustomEvent('update-ai-coach-context', {
          detail: {
            userProfile: {
              age: userData.age,
              weight_kg: userData.weight_kg,
              height_cm: userData.height_cm,
              bmi: userData.bmi
            },
            existingRoutines: routinesData.map(r => ({ name: r.name, notes: r.notes }))
          }
        });
        window.dispatchEvent(event);
      })
      .catch(err => console.error('Failed to fetch dashboard data:', err))
      .finally(() => setLoading(false));
  }, [currentUserId]);

  const switchUser = (id) => {
    localStorage.setItem('userId', id);
    setCurrentUserId(id);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    try {
      const newUser = await createUser(newUsername);
      setAllUsers([...allUsers, newUser]);
      switchUser(newUser.id);
      setNewUsername('');
      setShowAddUser(false);
    } catch (err) {
      alert('Failed to create user: ' + err.message);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      await updateUserProfile(profileData);
      setUser({ ...user, ...profileData });
      setIsEditingProfile(false);

      // Update AI Coach context with new physical data
      const event = new CustomEvent('update-ai-coach-context', {
        detail: {
          userProfile: {
            ...profileData,
            bmi: user.height_cm && profileData.weight_kg ? (profileData.weight_kg / Math.pow(user.height_cm / 100, 2)).toFixed(1) : user.bmi
          }
        }
      });
      window.dispatchEvent(event);
    } catch (err) {
      alert('Failed to update profile: ' + err.message);
    }
  };

  const handleDeleteRoutine = async (id, e) => {
    e.preventDefault();
    if (window.confirm('Are you sure you want to delete this routine?')) {
      try {
        await deleteRoutine(id);
        setRoutines(routines.filter(r => r.id !== id));
      } catch (err) {
        alert('Failed to delete routine: ' + err.message);
      }
    }
  };

  if (loading && !user) return <div className="dashboard-loading">Loading Dashboard...</div>;

  const xp = user?.current_xp || 0;
  const level = Math.floor(xp / 50000) + 1;
  const xpIntoLevel = xp % 50000;
  const progressPct = (xpIntoLevel / 50000) * 100;

  // Rank Identity
  let rankTitle = "Iron Acolyte";
  let rankIcon = "🦾";
  if (level >= 50) { rankTitle = "Titan of the Gym"; rankIcon = "👑"; }
  else if (level >= 35) { rankTitle = "Iron Architect"; rankIcon = "🔨"; }
  else if (level >= 20) { rankTitle = "Vanguard of Strength"; rankIcon = "🛡️"; }
  else if (level >= 10) { rankTitle = "Barbell Disciple"; rankIcon = "🏋️"; }

  // Streak Tier
  const streak = user?.streak_count || 0;
  let streakClass = "streak-kindling";
  let streakEmoji = "🌱";
  if (streak >= 30) { streakClass = "streak-supernova"; streakEmoji = "⚡"; }
  else if (streak >= 14) { streakClass = "streak-inferno"; streakEmoji = "🟣"; }
  else if (streak >= 7) { streakClass = "streak-blaze"; streakEmoji = "🔥"; }
  else if (streak >= 3) { streakClass = "streak-kindling"; streakEmoji = "🔥"; }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="user-controls">
          <div className="user-switcher">
            <label>Switch User: </label>
            <select value={String(currentUserId)} onChange={(e) => switchUser(e.target.value)}>
              {allUsers.map(u => (
                <option key={u.id} value={String(u.id)}>
                  {u.username} (ID: {u.id})
                </option>
              ))}
            </select>
          </div>

          <div className="add-user-control">
            {!showAddUser ? (
              <button className="btn-cyber-outline" onClick={() => setShowAddUser(true)}>+ New User</button>
            ) : (
              <form onSubmit={handleCreateUser} className="add-user-form">
                <input
                  type="text"
                  placeholder="Username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn-cyber-primary">Create</button>
                <button type="button" className="btn-cyber-outline" onClick={() => setShowAddUser(false)}>Cancel</button>
              </form>
            )}
          </div>
        </div>
      </header>

      <section className="dashboard-grid">
        <div className="user-progress">
          <div className="level-card">
            <div className="streak-badge">
              <span className={`streak-icon ${streakClass}`}>{streakEmoji}</span>
              <span className="streak-count">{streak} Day Streak</span>
            </div>

            <div className="level-info">
              <div className="rank-container">
                <span className="rank-icon">{rankIcon}</span>
                <div className="rank-details">
                  <h2>Level {level}</h2>
                  <span className="rank-title">{rankTitle}</span>
                </div>
              </div>
            </div>

            <div className="xp-bar-container">
              <div className="xp-bar-fill" style={{ width: `${progressPct}%` }}></div>
            </div>
            <div className="xp-stats">
              <span>{xpIntoLevel} XP / 50000 XP</span>
            </div>

            <div className="user-stats-grid">
              <div className="stat-item">
                <span className="stat-value">{user?.total_workouts || 0}</span>
                <span className="stat-label"> Workouts</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{user?.streak_freezes || 0}</span>
                <span className="stat-label"> Freezes</span>
              </div>
            </div>
            <p className="welcome-msg">Welcome back, {user?.username}!</p>
          </div>
        </div>

        <div className="physical-profile">
          <div className="level-card">
            <h3>Physical Profile</h3>
            {!isEditingProfile ? (
              <div className="profile-display">
                <div className="user-stats-grid">
                  <div className="stat-item">
                    <span className="stat-value">{user?.age || '--'}</span>
                    <span className="stat-label"> Age</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{user?.weight_kg || '--'}</span>
                    <span className="stat-label"> Weight (kg)</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{user?.height_cm || '--'}</span>
                    <span className="stat-label"> Height (cm)</span>
                  </div>
                </div>
                {user?.bmi && (
                  <div className="bmi-display">
                    <span className="stat-label">BMI: </span>
                    <span className="stat-value">{user.bmi}</span>
                  </div>
                )}
                <button className="btn-cyber-outline" onClick={() => setIsEditingProfile(true)} style={{ width: '100%', marginTop: '1rem' }}>Edit Profile</button>
              </div>
            ) : (
              <form onSubmit={handleUpdateProfile} className="profile-form">
                <div className="form-group">
                  <label>Age</label>
                  <input
                    type="number"
                    value={profileData.age}
                    onChange={e => setProfileData({ ...profileData, age: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={profileData.weight_kg}
                    onChange={e => setProfileData({ ...profileData, weight_kg: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Height (cm)</label>
                  <input
                    type="number"
                    value={profileData.height_cm}
                    onChange={e => setProfileData({ ...profileData, height_cm: e.target.value })}
                  />
                </div>
                <div className="form-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button type="submit" className="btn-cyber-primary" style={{ flex: 1 }}>Save</button>
                  <button type="button" className="btn-cyber-outline" onClick={() => setIsEditingProfile(false)} style={{ flex: 1 }}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="routines-section">
        <div className="section-header">
          <div className="title-group">
            <h3>Your Routines</h3>
            <Link to="/history" className="history-link">View History</Link>
          </div>
          <div className="header-actions" style={{ display: 'flex', gap: '1rem' }}>
            <Link to="/workout/live" className="btn-cyber-outline" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '0 1rem' }}>Quick Start</Link>
            <Link to="/routines/new" className="btn-add-routine" style={{ textDecoration: 'none' }}>+ New Routine</Link>
          </div>
        </div>

        <div className="routine-grid">
          {routines.length === 0 ? (
            <div className="empty-state">
              <p>No routines yet for this user. Create one to get started!</p>
            </div>
          ) : (
            routines.map(routine => (
              <div key={routine.id} className="routine-card">
                <button
                  className="btn-cyber-delete top-right"
                  onClick={(e) => handleDeleteRoutine(routine.id, e)}
                  title="Delete Routine"
                >×</button>
                <div className="routine-card-header">
                  <h4>{routine.name}</h4>
                </div>
                <p className="routine-notes">{routine.notes || 'No notes'}</p>
                <div className="routine-actions" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Link to={`/workout/${routine.id}`} className='btn-start-link'>
                    <button className="btn-cyber-primary" style={{ width: '100%' }}>Start Workout</button>
                  </Link>
                  <Link to={`/routines/edit/${routine.id}`} className="edit-link" style={{ textAlign: 'center', color: 'var(--light-blue)', fontSize: '0.9rem' }}>Edit Routine</Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="analytics-dashboard">
        <div className="section-header">
          <h3>Your Progress Trends</h3>
        </div>
        <Analytics key={currentUserId} />
      </section>
    </div>
  );
}

export default Dashboard;
