import React, { useState, useEffect, useRef } from 'react';
import { useAccessToken, useNhostClient } from '@nhost/react';
import axios from 'axios';

function DashboardPage() {
  const nhost = useNhostClient();
  const accessToken = useAccessToken();

  const [userEmail, setUserEmail] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // References for audio processing and WebSockets
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const transcriptContainerRef = useRef(null);

  // Buffer containing finalized sentences
  const finalizedTextRef = useRef('');
  // Buffer containing the current interim transcript text
  const interimTextRef = useRef('');

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

  // 1. Fetch User Profile & Transcript History on load
  useEffect(() => {
    fetchUserProfile();
    fetchHistory();
  }, [accessToken]);

  // Auto-scroll transcript container to bottom on transcript updates
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [liveTranscript]);

  const fetchUserProfile = async () => {
    if (!accessToken) return;
    try {
      const response = await axios.get(`${backendUrl}/api/user/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setUserEmail(response.data.email);
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError('Could not verify profile with backend.');
    }
  };

  const fetchHistory = async () => {
    if (!accessToken) return;
    setIsLoadingHistory(true);
    try {
      const response = await axios.get(`${backendUrl}/api/transcript/history`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setHistory(response.data.transcripts || []);
    } catch (err) {
      console.error('Error fetching history:', err);
      setError('Failed to load transcript history.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Clean up recording if running
      if (isRecording) {
        stopRecording();
      }
      await nhost.auth.signOut();
    } catch (err) {
      console.error('Error during logout:', err);
      setError('Logout failed.');
    }
  };

  // 2. Start Recording
  const startRecording = async () => {
    setError('');
    setInfoMessage('');
    setLiveTranscript('');
    finalizedTextRef.current = '';
    interimTextRef.current = '';

    try {
      // A. Get Mic Stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      mediaStreamRef.current = stream;

      // B. Establish WebSocket to secure backend proxy
      // Convert backend URL (http/https) to ws/wss
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = backendUrl.replace(/^https?:\/\//, '');
      const wsUrl = `${wsProtocol}//${wsHost}?token=${accessToken}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to WebSocket backend proxy');
        setInfoMessage('Recording active. Start speaking...');
        setIsRecording(true);
        setupAudioProcessing(stream);
      };

      ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          
          if (response.error) {
            setError(`Proxy error: ${response.error}`);
            stopRecording();
            return;
          }

          // Parse Deepgram response
          const alternatives = response.channel?.alternatives;
          if (alternatives && alternatives.length > 0) {
            const transcript = alternatives[0].transcript;
            
            if (transcript) {
              if (response.is_final) {
                // Speech segment is complete, commit it
                finalizedTextRef.current += (finalizedTextRef.current ? ' ' : '') + transcript;
                interimTextRef.current = '';
              } else {
                // Segment is still updating (interim)
                interimTextRef.current = transcript;
              }

              // Combine final and interim text to show on screen
              const fullText = finalizedTextRef.current + (interimTextRef.current ? ' ' + interimTextRef.current : '');
              setLiveTranscript(fullText);
            }
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket connection error:', err);
        setError('WebSocket connection error. Make sure the backend is running.');
        stopRecording();
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        if (event.code === 4001) {
          setError('Unauthorized connection. Please log in again.');
        }
        setIsRecording(false);
      };

    } catch (err) {
      console.error('Microphone access denied or error:', err);
      setError('Microphone access denied. Please verify your permissions and try again.');
      setIsRecording(false);
    }
  };

  // C. Downsample & convert audio stream to 16-bit linear PCM (Linear16)
  const setupAudioProcessing = (stream) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    
    // ScriptProcessorNode to capture chunks. Use 2048 buffer size.
    const processor = audioContext.createScriptProcessor(2048, 1, 1);
    processorRef.current = processor;

    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0); // Float32Array from channel 0
        const pcmBuffer = convertFloat32To16BitPCM(inputData);
        wsRef.current.send(pcmBuffer);
      }
    };
  };

  // Helper function to convert float32 array to 16-bit signed PCM ArrayBuffer
  const convertFloat32To16BitPCM = (float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp values between -1 and 1
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit signed integer
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); // true for little-endian
    }
    return buffer;
  };

  // 3. Stop Recording & Save to MongoDB
  const stopRecording = async () => {
    setIsRecording(false);
    setInfoMessage('Saving transcript...');

    // Close microphone stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Stop audio processors
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Combine final text and save it if it exists
    const finalSavedText = (finalizedTextRef.current + ' ' + interimTextRef.current).trim();

    if (finalSavedText.length > 0) {
      try {
        await axios.post(
          `${backendUrl}/api/transcript/save`,
          { text: finalSavedText },
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        setInfoMessage('Transcript saved successfully!');
        // Refresh history
        fetchHistory();
      } catch (err) {
        console.error('Error saving transcript:', err);
        setError('Successfully transcribed but failed to save transcript to DB.');
        setInfoMessage('');
      }
    } else {
      setInfoMessage('');
    }
  };

  // Format date helper
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="dashboard-page">
      {/* Header bar */}
      <header className="dashboard-header">
        <div className="header-logo">
          <div className="logo-icon-small">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                fill="url(#gradDash)"
              />
              <path
                d="M19 10v2a7 7 0 0 1-14 0v-2"
                stroke="url(#gradDash)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="gradDash" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" />
                  <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="logo-text-small">VoiceScribe</span>
        </div>

        <div className="user-profile">
          <span className="user-email" title={userEmail}>
            {userEmail}
          </span>
          <button onClick={handleLogout} className="btn-secondary logout-btn">
            Log Out
          </button>
        </div>
      </header>

      {/* Main content grid */}
      <main className="dashboard-content">
        <div className="recording-section card">
          <div className="card-header">
            <h2>Live Transcription</h2>
            {isRecording && <span className="badge badge-recording">Live</span>}
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="2" />
                <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="2" />
              </svg>
              {error}
            </div>
          )}

          {infoMessage && (
            <div className="alert alert-info" role="status">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
              {infoMessage}
            </div>
          )}

          {/* Action button */}
          <div className="control-panel">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`btn-record ${isRecording ? 'recording' : ''}`}
              aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
            >
              <div className="mic-wrapper">
                {isRecording ? (
                  // Stop (square) icon with pulse rings
                  <>
                    <div className="pulse-ring ring-1"></div>
                    <div className="pulse-ring ring-2"></div>
                    <svg className="icon-stop" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  </>
                ) : (
                  // Mic icon
                  <svg className="icon-mic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                )}
              </div>
              <span>{isRecording ? 'Stop Recording' : 'Start Recording'}</span>
            </button>
          </div>

          {/* Live Transcript Display Box */}
          <div 
            className="transcript-box" 
            ref={transcriptContainerRef}
            tabIndex={0}
          >
            {liveTranscript ? (
              <p className="transcript-text">
                {liveTranscript}
                {isRecording && <span className="blinking-cursor">|</span>}
              </p>
            ) : (
              <p className="placeholder-text">
                {isRecording 
                  ? 'Listening... Speak into your microphone.' 
                  : 'Your live speech transcript will appear here. Press "Start Recording" to begin.'}
              </p>
            )}
          </div>
        </div>

        {/* History Section */}
        <div className="history-section card">
          <div className="card-header">
            <h2>Saved History</h2>
            <button 
              onClick={fetchHistory} 
              className="btn-refresh" 
              title="Refresh History"
              disabled={isLoadingHistory}
            >
              <svg 
                className={isLoadingHistory ? 'spinning' : ''} 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round"
              >
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>

          <div className="history-list">
            {isLoadingHistory && history.length === 0 ? (
              <div className="loading-container">
                <div className="spinner-small" />
                <p>Loading history...</p>
              </div>
            ) : history.length > 0 ? (
              history.map((item) => (
                <div key={item._id} className="history-item">
                  <div className="history-meta">
                    <span className="history-date">{formatDate(item.createdAt)}</span>
                  </div>
                  <p className="history-text">{item.text}</p>
                </div>
              ))
            ) : (
              <p className="placeholder-text text-center py-4">
                No saved transcripts found. Record something to save to database!
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default DashboardPage;
