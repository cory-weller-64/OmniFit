import { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';
import { getWorkoutFrequency, getVolumeByMuscle } from '../../services/api';
import './Analytics.css';

function Analytics() {
  const [frequencyData, setFrequencyData] = useState([]);
  const [volumeData, setVolumeData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getWorkoutFrequency(), getVolumeByMuscle()])
      .then(([freq, vol]) => {
        setFrequencyData(freq);
        setVolumeData(processVolumeData(vol));
      })
      .catch(err => console.error('Failed to fetch analytics:', err))
      .finally(() => setLoading(false));
  }, []);

  const processVolumeData = (raw) => {
    // raw is array of { date, primary_muscle_group, volume }
    // We need it as { date, Chest: 100, Back: 200, ... }
    const grouped = raw.reduce((acc, curr) => {
      if (!acc[curr.date]) acc[curr.date] = { date: curr.date };
      acc[curr.date][curr.primary_muscle_group] = curr.volume;
      return acc;
    }, {});
    return Object.values(grouped);
  };

  const muscleGroups = [...new Set(volumeData.flatMap(d => Object.keys(d).filter(k => k !== 'date')))];
  const colors = ['#7c3aed', '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6'];

  if (loading) return <div className="analytics-loading">Loading analytics...</div>;

  return (
    <div className="analytics-section">
      <div className="chart-container">
        <h4>Workout Frequency (Sessions / Week)</h4>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={frequencyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="week_start" stroke="#888" fontSize={12} />
              <YAxis stroke="#888" fontSize={12} allowDecimals={false} />
              <Tooltip 
                contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }}
                itemStyle={{ color: '#7c3aed' }}
              />
              <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-container">
        <h4>Volume Trend by Muscle Group (kg)</h4>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <LineChart data={volumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#888" fontSize={12} />
              <YAxis stroke="#888" fontSize={12} />
              <Tooltip 
                contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }}
              />
              <Legend />
              {muscleGroups.map((mg, i) => (
                <Line 
                  key={mg} 
                  type="monotone" 
                  dataKey={mg} 
                  stroke={colors[i % colors.length]} 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
