import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getAICoachResponse } from '../../services/api';
import './AICoachPanel.css';

const AICoachPanel = ({ isOpen, onClose, context, onApplySuggestions }) => {
    const location = useLocation();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [flowContext, setFlowContext] = useState(null); // Tracks the current guided flow step
    const messagesEndRef = useRef(null);

    // Refs to hold the latest versions of callbacks to prevent stale closures
    const latestRefs = useRef({});
    const handleFlowSelection = (...args) => latestRefs.current.handleFlowSelection(...args);
    const handleSend = (...args) => latestRefs.current.handleSend(...args);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, loading]);

    // Reset chat history when navigating to a new page to keep context focused
    useEffect(() => {
        setMessages([]);
        setFlowContext(null);
        setLoading(false);
    }, [location.pathname]);



    // Task 4 Step 1: Detect new routine page and trigger flow
    useEffect(() => {
        if (isOpen && location.pathname === '/routines/new') {
            const hasStartedFlow = messages.some(m => m.flowId === 'new-routine-start');
            if (!hasStartedFlow) {
                if (context.existingRoutines?.length > 0) {
                    setMessages(prev => [...prev, {
                        role: 'model',
                        text: "Hi, I can see you're trying to start a new routine. Would you like this routine to complement your existing routines or start fresh?",
                        flowId: 'new-routine-start',
                        options: [
                            { label: 'Complement Existing Routines', value: 'COMPLEMENT', action: () => handleFlowSelection('new-routine', 'CHOOSE_TYPE', 'COMPLEMENT') },
                            { label: 'Start Fresh', value: 'FRESH', action: () => handleFlowSelection('new-routine', 'CHOOSE_TYPE', 'FRESH') }
                        ]
                    }]);
                } else {
                    triggerFrequencyStep('new-routine');
                }
            }
        }
    }, [isOpen, location.pathname, context.existingRoutines]);

    // Task 5 Step 1: Detect routine edit page and trigger flow
    useEffect(() => {
        if (isOpen && location.pathname.startsWith('/routines/edit/')) {
            const hasStartedFlow = messages.some(m => m.flowId === 'edit-routine-start');
            if (!hasStartedFlow) {
                setMessages(prev => [...prev, {
                    role: 'model',
                    text: "Hi, I can see you're trying to edit an existing routine. Would you like to completely regenerate the routine or make specific changes?",
                    flowId: 'edit-routine-start',
                    options: [
                        { label: 'Regenerate Routine', value: 'REGENERATE', action: () => handleFlowSelection('edit-routine', 'CHOOSE_TYPE', 'REGENERATE') },
                        { label: 'Make Specific Changes', value: 'CHANGES', action: () => handleFlowSelection('edit-routine', 'CHOOSE_TYPE', 'CHANGES') }
                    ]
                }]);
            }
        }
    }, [isOpen, location.pathname]);

    // Task 6 Step 1: Detect live workout and trigger flow
    useEffect(() => {
        const isLive = location.pathname.startsWith('/workout/');
        if (isOpen && isLive) {
            const hasStartedFlow = messages.some(m => m.flowId === 'live-workout-start');
            if (!hasStartedFlow) {
                setMessages(prev => [...prev, {
                    role: 'model',
                    text: "Hi! Do you want to make any changes to your current workout?",
                    flowId: 'live-workout-start',
                    options: [
                        { label: 'Reduce Duration', value: 'REDUCE_DURATION', action: () => handleFlowSelection('live-workout', 'CHOOSE_TYPE', 'REDUCE_DURATION') },
                        { label: 'Focus Muscle (Injury)', value: 'INJURY_FOCUS', action: () => handleFlowSelection('live-workout', 'CHOOSE_TYPE', 'INJURY_FOCUS') },
                        { label: 'Swap Exercise', value: 'SWAP', action: () => handleFlowSelection('live-workout', 'CHOOSE_TYPE', 'SWAP') }
                    ]
                }]);
            }
        }
    }, [isOpen, location.pathname]);

    latestRefs.current.handleFlowSelection = (flowName, stepName, value) => {
        // Log user selection as a message
        const label = Array.isArray(value) ? value.join(', ') : value;
        setMessages(prev => [...prev, { role: 'user', text: label }]);

        if (flowName === 'new-routine') {
            if (stepName === 'CHOOSE_TYPE') {
                setFlowContext(prev => ({ ...prev, [stepName]: value }));
                if (value === 'FRESH') {
                    triggerFrequencyStep(flowName);
                } else {
                    triggerComplementSelectionStep();
                }
            } else if (stepName === 'CHOOSE_FREQUENCY' || stepName === 'CHOOSE_COMPLEMENTS') {
                setFlowContext(prev => ({ ...prev, [stepName]: value }));
                triggerDurationStep(flowName);
            } else if (stepName === 'CHOOSE_DURATION') {
                generateRoutineWithFlowContext({ ...flowContext, duration: value });
            }
        } else if (flowName === 'edit-routine') {
            if (stepName === 'CHOOSE_TYPE') {
                setFlowContext(prev => ({ ...prev, [stepName]: value }));
                if (value === 'REGENERATE') {
                    triggerFrequencyStep(flowName);
                } else {
                    triggerChangeRequestStep(flowName);
                }
            } else if (stepName === 'CHOOSE_FREQUENCY') {
                setFlowContext(prev => ({ ...prev, frequency: value }));
                triggerDurationStep(flowName);
            } else if (stepName === 'ENTER_CHANGES') {
                setFlowContext(prev => ({ ...prev, changes: value }));
                triggerDurationStep(flowName);
            } else if (stepName === 'CHOOSE_DURATION') {
                modifyRoutineWithFlowContext({ ...flowContext, duration: value });
            }
        } else if (flowName === 'live-workout') {
            if (stepName === 'CHOOSE_TYPE') {
                if (value === 'REDUCE_DURATION') {
                    triggerDurationStep(flowName);
                } else if (value === 'INJURY_FOCUS') {
                    triggerMuscleFocusStep(flowName);
                } else {
                    triggerChangeRequestStep(flowName, "Which exercise do you want to swap, and why? (e.g. 'Swap Squats for Leg Press due to knee pain')");
                }
            } else if (stepName === 'CHOOSE_DURATION') {
                adaptWorkoutWithFlowContext({ type: 'DURATION', value });
            } else if (stepName === 'CHOOSE_MUSCLE') {
                adaptWorkoutWithFlowContext({ type: 'MUSCLE_FOCUS', value });
            } else if (stepName === 'ENTER_CHANGES') {
                adaptWorkoutWithFlowContext({ type: 'SWAP', value });
            }
        }
    };

    const triggerFrequencyStep = (flowName) => {
        setMessages(prev => [...prev, {
            role: 'model',
            text: "How many days per week do you want to train?",
            flowId: `${flowName}-freq`,
            options: ['2 Days', '3 Days', '4 Days', '5 Days', '6 Days'].map(d => ({
                label: d,
                value: d,
                action: () => handleFlowSelection(flowName, 'CHOOSE_FREQUENCY', d)
            }))
        }]);
    };

    const triggerComplementSelectionStep = () => {
        const routines = context.existingRoutines || [];
        setMessages(prev => [...prev, {
            role: 'model',
            text: "Which routines would you like to complement?",
            flowId: 'new-routine-compl-select',
            isMultiple: true,
            options: routines.map(r => ({ label: r.name, value: r.name })),
            onSubmit: (values) => handleFlowSelection('new-routine', 'CHOOSE_COMPLEMENTS', values)
        }]);
    };

    const triggerChangeRequestStep = (flowName, customText) => {
        setMessages(prev => [...prev, {
            role: 'model',
            text: customText || "What specific changes would you like to make to this routine?",
            flowId: `${flowName}-changes`,
            isInput: true,
            onSubmit: (val) => handleFlowSelection(flowName, 'ENTER_CHANGES', val)
        }]);
    };

    const triggerDurationStep = (flowName) => {
        setMessages(prev => [...prev, {
            role: 'model',
            text: "How much time do you have to train?",
            flowId: `${flowName}-duration`,
            options: ['30 minutes', '45 minutes', '60 minutes', '75 minutes', '90 minutes'].map(t => ({
                label: t,
                value: t,
                action: () => handleFlowSelection(flowName, 'CHOOSE_DURATION', t)
            }))
        }]);
    };

    const triggerMuscleFocusStep = (flowName) => {
        setMessages(prev => [...prev, {
            role: 'model',
            text: "Which muscle group would you like to focus on for this adaptation?",
            flowId: `${flowName}-muscle`,
            options: ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms'].map(m => ({
                label: m,
                value: m,
                action: () => handleFlowSelection(flowName, 'CHOOSE_MUSCLE', m)
            }))
        }]);
    };

    const processAIResponse = (response) => {
        let options = null;
        if (response.split) {
            options = [
                {
                    label: `Reject ${response.split.name}`,
                    value: 'REJECT',
                    action: () => handleSend(`I don't like the ${response.split.name} split. Suggest something else.`)
                },
                ...response.split.routines.map(r => ({
                    label: r,
                    value: r,
                    action: () => handleSend(`Great, let's generate the ${r} routine.`)
                }))
            ];
        }

        return {
            role: 'model',
            text: response.text,
            suggestions: response.suggestions,
            options: options
        };
    };

    const generateRoutineWithFlowContext = async (finalFlowContext) => {
        setLoading(true);
        const prompt = `Based on our guided setup:
        - Mode: ${finalFlowContext.CHOOSE_TYPE || 'Fresh Start'}
        - Frequency/Complement: ${finalFlowContext.CHOOSE_FREQUENCY || finalFlowContext.CHOOSE_COMPLEMENTS || 'N/A'}
        - Session Duration: ${finalFlowContext.duration}
        
        Please recommend a suitable training split for me. Do not generate exercises yet, just describe the split and why it fits my frequency.`;

        try {
            // Prune context for efficiency
            const prunedContext = pruneAIContext(context, { 
                includeRoutines: finalFlowContext.CHOOSE_TYPE === 'COMPLEMENT' 
            });

            const response = await getAICoachResponse(prompt, messages.slice(-10), prunedContext);
            setMessages(prev => [...prev, processAIResponse(response)]);
        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'model',
                text: 'Sorry, I encountered an error: ' + error.message
            }]);
        } finally {
            setLoading(false);
            setFlowContext(null);
        }
    };

    const modifyRoutineWithFlowContext = async (finalFlowContext) => {
        setLoading(true);
        const isRegen = finalFlowContext.CHOOSE_TYPE === 'REGENERATE';
        const prompt = isRegen
            ? `I want to completely REGENERATE my current routine.
               Desired Frequency: ${finalFlowContext.frequency}
               Session Duration: ${finalFlowContext.duration}
               Please recommend a suitable training split first.`
            : `I want to make specific changes to my current routine.
               Requested Changes: ${finalFlowContext.changes}
               Session Duration: ${finalFlowContext.duration}`;

        try {
            const prunedContext = pruneAIContext(context, { includeRoutines: true });
            const response = await getAICoachResponse(prompt, messages.slice(-10), prunedContext);
            setMessages(prev => [...prev, processAIResponse(response)]);
        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'model',
                text: 'Sorry, I encountered an error: ' + error.message
            }]);
        } finally {
            setLoading(false);
            setFlowContext(null);
        }
    };

    const adaptWorkoutWithFlowContext = async (finalFlowContext) => {
        setLoading(true);
        let prompt = "";
        if (finalFlowContext.type === 'DURATION') {
            prompt = `I have a tight schedule. Please reduce the duration of my current workout to ${finalFlowContext.value}. Keep the most impactful exercises.`;
        } else if (finalFlowContext.type === 'MUSCLE_FOCUS') {
            prompt = `I have an injury or specific goal. Please adapt my current workout to focus primarily on ${finalFlowContext.value}.`;
        } else if (finalFlowContext.type === 'SWAP') {
            prompt = `I need to swap exercises in my current workout. Requested adaptation: ${finalFlowContext.value}`;
        }

        try {
            const prunedContext = pruneAIContext(context, { includeWorkout: true });
            const response = await getAICoachResponse(prompt, messages.slice(-10), prunedContext);
            setMessages(prev => [...prev, processAIResponse(response)]);
        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'model',
                text: 'Sorry, I encountered an error: ' + error.message
            }]);
        } finally {
            setLoading(false);
            setFlowContext(null);
        }
    };

    latestRefs.current.handleSend = async (messageText) => {
        const textToSend = typeof messageText === 'string' ? messageText : input;
        if (!textToSend.trim() || loading) return;

        const userMessage = { role: 'user', text: textToSend };
        setMessages(prev => [...prev, userMessage]);

        const originalInput = input;
        if (typeof messageText !== 'string') setInput('');

        setLoading(true);

        try {
            const historyToSend = messages.slice(-6);
            
            // Check if routine data is needed for this specific query
            const needsRoutines = textToSend.toLowerCase().includes('complement') || 
                                 textToSend.toLowerCase().includes('my routines') ||
                                 textToSend.toLowerCase().includes('other routines');
            
            const prunedContext = pruneAIContext(context, { 
                includeRoutines: needsRoutines,
                includeWorkout: true // Always include workout in general chat if it exists
            });

            const response = await getAICoachResponse(textToSend, historyToSend, prunedContext);
            setMessages(prev => [...prev, processAIResponse(response)]);
        } catch (error) {
            if (typeof messageText !== 'string') setInput(originalInput);

            setMessages(prev => [...prev, {
                role: 'model',
                text: 'Sorry, I encountered an error: ' + error.message
            }]);
        } finally {
            setLoading(false);
        }
    };

    // Helper to prune large context objects to save tokens
    const pruneAIContext = (ctx, options = {}) => {
        const pruned = { 
            userProfile: ctx.userProfile,
            currentPage: ctx.currentPage
        };

        if (options.includeRoutines) {
            pruned.existingRoutines = ctx.existingRoutines;
        }

        if (options.includeWorkout) {
            pruned.activeWorkout = ctx.activeWorkout;
            pruned.exercises = ctx.exercises;
        }

        return pruned;
    };

    if (!isOpen) return null;

    return (
        <div className="ai-coach-overlay">
            <div className="ai-coach-panel">
                <div className="ai-coach-header">
                    <div className="title-group">
                        <h3>AI Coach</h3>
                        <p className="medical-disclaimer">Informational only. Not medical advice.</p>
                    </div>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="ai-coach-messages">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`message ${msg.role}`}>
                            <div className="message-content">
                                {msg.text}
                            </div>

                            {/* Render Interactive Options */}
                            {msg.options && (
                                <div className="message-options">
                                    {msg.isMultiple ? (
                                        <MultipleChoiceOptions
                                            options={msg.options}
                                            onSubmit={msg.onSubmit}
                                            disabled={loading || idx !== messages.length - 1}
                                        />
                                    ) : (
                                        msg.options.map((opt, oIdx) => (
                                            <button
                                                key={oIdx}
                                                className="option-btn"
                                                onClick={opt.action}
                                                disabled={loading || idx !== messages.length - 1}
                                            >
                                                {opt.label}
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}

                            {msg.isInput && (
                                <div className="message-options">
                                    <MessageInput
                                        onSubmit={msg.onSubmit}
                                        disabled={loading || idx !== messages.length - 1}
                                    />
                                </div>
                            )}

                            {msg.suggestions && msg.suggestions.length > 0 && (
                                <div className="suggestion-box">
                                    <h4>Suggested Exercises:</h4>
                                    <ul>
                                        {msg.suggestions.map((s, sIdx) => (
                                            <li key={sIdx} className="suggestion-item">
                                                <div className="suggestion-main">
                                                    <strong>{s.name}</strong>: {s.sets}x{s.reps}
                                                    <div className="reason">{s.reason}</div>
                                                </div>
                                                <button
                                                    className="apply-single-suggestion-btn"
                                                    onClick={() => onApplySuggestions([s])}
                                                    disabled={loading || idx !== messages.length - 1}
                                                >
                                                    {s.replace_id ? 'Swap' : 'Add'}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    {msg.suggestions.length > 1 && (
                                        <button
                                            className="apply-suggestions-btn"
                                            onClick={() => onApplySuggestions(msg.suggestions)}
                                            disabled={loading || idx !== messages.length - 1}
                                        >
                                            Apply All Suggestions
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {loading && (
                        <div className="message model thinking">
                            <div className="pulse"></div>
                            <div className="pulse"></div>
                            <div className="pulse"></div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <form className="ai-coach-input" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
                    <input
                        type="text"
                        placeholder="Ask me anything..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={loading}
                    />
                    <button type="submit" disabled={loading || !input.trim()}>
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
};

const MultipleChoiceOptions = ({ options, onSubmit, disabled }) => {
    const [selected, setSelected] = useState([]);

    const toggle = (val) => {
        if (selected.includes(val)) {
            setSelected(selected.filter(v => v !== val));
        } else {
            setSelected([...selected, val]);
        }
    };

    return (
        <div className="multiple-choice">
            {options.map((opt, i) => (
                <label key={i} className="checkbox-item">
                    <input
                        type="checkbox"
                        checked={selected.includes(opt.value)}
                        onChange={() => toggle(opt.value)}
                        disabled={disabled}
                    />
                    <span>{opt.label}</span>
                </label>
            ))}
            <button
                className="btn-cyber-primary"
                onClick={() => onSubmit(selected)}
                disabled={disabled || selected.length === 0}
                style={{ width: '100%', marginTop: '0.5rem' }}
            >
                Confirm Selection
            </button>
        </div>
    );
};

const MessageInput = ({ onSubmit, disabled }) => {
    const [val, setVal] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!val.trim()) return;
        onSubmit(val);
    };

    return (
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
            <input
                type="text"
                className="step-input"
                placeholder="Type your changes here..."
                value={val}
                onChange={(e) => setVal(e.target.value)}
                disabled={disabled}
                autoFocus
            />
            <button
                type="submit"
                className="btn-cyber-primary"
                disabled={disabled || !val.trim()}
                style={{ width: '100%', marginTop: '0.5rem' }}
            >
                Confirm Changes
            </button>
        </form>
    );
};

export default AICoachPanel;
