import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from '../Dashboard/Dashboard';
import RoutineBuilder from '../RoutineBuilder/RoutineBuilder';
import RoutineEditPage from '../RoutineBuilder/RoutineEditPage';
import LiveWorkout from '../LiveWorkout/LiveWorkout';
import History from '../History/History';
import WorkoutDetails from '../History/WorkoutDetails';
import AICoachPanel from './AICoachPanel';
import './App.css';

function App() {
  const [isCoachOpen, setIsCoachOpen] = useState(false);
  const [coachContext, setCoachContext] = useState({});

  useEffect(() => {
    // Listen for context updates from child components
    const handleUpdateContext = (e) => {
      setCoachContext(prev => ({ ...prev, ...e.detail }));
    };
    // Listen for coach toggle
    const handleToggleCoach = (e) => {
      // If detail is explicitly boolean, use it. Otherwise toggle.
      if (e.detail !== null && e.detail !== undefined && typeof e.detail === 'boolean') {
        setIsCoachOpen(e.detail);
      } else {
        setIsCoachOpen(prev => !prev);
      }
    };

    window.addEventListener('update-ai-coach-context', handleUpdateContext);
    window.addEventListener('toggle-ai-coach', handleToggleCoach);

    return () => {
      window.removeEventListener('update-ai-coach-context', handleUpdateContext);
      window.removeEventListener('toggle-ai-coach', handleToggleCoach);
    };
  }, []);

  const applySuggestions = (suggestions) => {
    const event = new CustomEvent('apply-ai-suggestions', { detail: suggestions });
    window.dispatchEvent(event);
  };

  return (
    <Router>
      <div className="app-container">
        <header style={{ position: 'relative' }}>
          <h1>Fitness Tracker V2</h1>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/routines/new" element={<RoutineBuilder />} />
            <Route path="/routines/edit/:id" element={<RoutineEditPage />} />
            <Route path="/workout/:routineId" element={<LiveWorkout />} />
            <Route path="/history" element={<History />} />
            <Route path="/history/:id" element={<WorkoutDetails />} />
          </Routes>
        </main>

        <AICoachPanel 
          isOpen={isCoachOpen} 
          onClose={() => setIsCoachOpen(false)} 
          context={coachContext}
          onApplySuggestions={applySuggestions}
        />
      </div>
    </Router>
  );
}

export default App;
