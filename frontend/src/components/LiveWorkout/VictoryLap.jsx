import { useState, useEffect } from 'react';
import './VictoryLap.css';

function VictoryLap({ data, onDashboard }) {
    const [stage, setStage] = useState(1);
    const { xpBreakdown, levelState, achievements, streak, adaptiveTargets } = data;

    // Optional: Add sound or confetti trigger here

    return (
        <div className="victory-lap-overlay">
            <div className="victory-card">
                {stage === 1 && (
                    <div className="xp-tally-stage">
                        <header className="victory-header">
                            <span className="victory-icon">⚔️</span>
                            <h2>Victory!</h2>
                        </header>
                        
                        <div className="xp-counters">
                            <div className="xp-item">
                                <span className="label">Volume XP</span>
                                <span className="value">+{xpBreakdown.volumeXp}</span>
                            </div>
                            <div className="xp-item">
                                <span className="label">Sets XP</span>
                                <span className="value">+{xpBreakdown.setXp}</span>
                            </div>
                            {xpBreakdown.prXp > 0 && (
                                <div className="xp-item pr-bonus">
                                    <span className="label">PR Bonuses</span>
                                    <span className="value">+{xpBreakdown.prXp}</span>
                                </div>
                            )}
                            {xpBreakdown.questXp > 0 && (
                                <div className="xp-item quest-bonus">
                                    <span className="label">Quest XP</span>
                                    <span className="value">+{xpBreakdown.questXp}</span>
                                </div>
                            )}
                            {xpBreakdown.streakXp > 0 && (
                                <div className="xp-item streak-milestone-bonus">
                                    <span className="label">Streak Milestone</span>
                                    <span className="value">+{xpBreakdown.streakXp}</span>
                                </div>
                            )}
                            <div className="xp-total">
                                <span className="label">Total Gained</span>
                                <span className="value">{xpBreakdown.totalXp} XP</span>
                            </div>
                        </div>

                        {adaptiveTargets?.updated && (
                            <div className="adaptive-alert">
                                🚀 <strong>Targets Updated!</strong> Your routine has adapted to your progress.
                            </div>
                        )}

                        <div className="level-up-container">
                            {levelState.levelUpOccurred ? (
                                <div className="level-up-badge animated">
                                    <div className="confetti-effect">🎉✨🎉</div>
                                    <h3>LEVEL UP!</h3>
                                    <span className="new-level">Lv. {levelState.newLevel}</span>
                                    {levelState.grantedFreeze && (
                                        <div className="freeze-bonus">❄️ Streak Freeze Earned!</div>
                                    )}
                                </div>
                            ) : (
                                <div className="progress-mini">
                                    <span className="label">Progress to Lv. {levelState.newLevel + 1}</span>
                                    <div className="bar-bg">
                                        <div className="bar-fill" style={{ width: `${(levelState.currentXp % 50000) / 500}%` }}></div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button className="btn-cyber-primary" style={{ width: '100%' }} onClick={() => setStage(2)}>
                            {achievements.prs.length > 0 || achievements.badges.length > 0 ? 'View Achievements' : 'Continue'}
                        </button>
                    </div>
                )}

                {stage === 2 && (
                    <div className="achievements-stage">
                        <header className="victory-header">
                            <h3>Hall of Fame</h3>
                        </header>
                        
                        <div className="achievements-scroll-area">
                            {achievements.prs.length > 0 && (
                                <div className="achievement-group">
                                    <h4>Records Broken</h4>
                                    <div className="pr-list">
                                        {achievements.prs.map((pr, i) => (
                                            <div key={i} className="pr-reveal-card">
                                                <span className="pr-type">{pr.record_type}</span>
                                                <span className="pr-val">{Math.round(pr.value * 10) / 10}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {achievements.badges.length > 0 && (
                                <div className="achievement-group">
                                    <h4>New Badges</h4>
                                    <div className="badge-unlock-list">
                                        {achievements.badges.map((badge, i) => (
                                            <div key={i} className="badge-unlock-card">
                                                <div className="badge-icon-wrap">🏆</div>
                                                <div className="badge-info">
                                                    <span className="badge-name">{badge.name}</span>
                                                    <span className="badge-desc">{badge.description}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {achievements.prs.length === 0 && achievements.badges.length === 0 && (
                                <div className="empty-achievements">
                                    <p>Consistency is the key to strength. You're building the foundation!</p>
                                </div>
                            )}
                        </div>

                        <div className="streak-victory-footer">
                            <div className="streak-flame-wrap">
                                <span className="flame-emoji">🔥</span>
                                <span className="streak-text">{streak.count} Day Streak!</span>
                            </div>
                            {streak.freezeConsumed && (
                                <div className="freeze-consumed-msg">❄️ Streak saved by a Freeze!</div>
                            )}
                        </div>

                        <button className="btn-cyber-primary" style={{ width: '100%' }} onClick={onDashboard}>Return to Dashboard</button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default VictoryLap;
