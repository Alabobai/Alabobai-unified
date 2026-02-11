/**
 * VoiceInput Component
 * Voice recording with real-time transcription
 */

import React, { useRef, useEffect, useState } from 'react';

interface VoiceInputProps {
  isActive: boolean;
  onStart: () => void;
  onStop: () => void;
  onTranscript: (transcript: string) => void;
  deepgramApiKey?: string;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({
  isActive,
  onStart,
  onStop,
  onTranscript,
  deepgramApiKey,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const animationRef = useRef<number | null>(null);

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Set up audio analyzer for visualization
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Animate audio level
      const updateLevel = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average / 255);
        }
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      // Set up MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      // Connect to Deepgram WebSocket (if API key provided)
      if (deepgramApiKey) {
        socketRef.current = new WebSocket(
          `wss://api.deepgram.com/v1/listen?encoding=opus&sample_rate=16000&language=en-US&punctuate=true&interim_results=true`,
          ['token', deepgramApiKey]
        );

        socketRef.current.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.channel?.alternatives?.[0]?.transcript) {
            const transcript = data.channel.alternatives[0].transcript;
            if (data.is_final) {
              onTranscript(transcript);
              setInterimTranscript('');
            } else {
              setInterimTranscript(transcript);
            }
          }
        };
      }

      // Send audio data
      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(event.data);
        }
      };

      mediaRecorderRef.current.start(250); // Send chunks every 250ms
      setIsRecording(true);
      onStart();
    } catch (error) {
      console.error('[Voice] Failed to start recording:', error);
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }

    if (socketRef.current) {
      socketRef.current.close();
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    setIsRecording(false);
    setAudioLevel(0);
    onStop();
  };

  // Use Web Speech API as fallback
  useEffect(() => {
    if (isActive && !deepgramApiKey && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (final) {
          onTranscript(final);
          setInterimTranscript('');
        } else {
          setInterimTranscript(interim);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('[Voice] Speech recognition error:', event.error);
      };

      recognition.start();
      setIsRecording(true);

      return () => {
        recognition.stop();
        setIsRecording(false);
      };
    }
  }, [isActive, deepgramApiKey, onTranscript]);

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="voice-input">
      <button
        className={`voice-button ${isRecording ? 'recording' : ''}`}
        onClick={handleClick}
        title={isRecording ? 'Stop recording' : 'Start voice input'}
      >
        <div
          className="voice-ring"
          style={{
            transform: `scale(${1 + audioLevel * 0.5})`,
            opacity: audioLevel,
          }}
        />
        <svg viewBox="0 0 24 24" fill="currentColor">
          {isRecording ? (
            <rect x="6" y="6" width="12" height="12" rx="2" />
          ) : (
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z" />
          )}
        </svg>
      </button>

      {interimTranscript && (
        <div className="interim-transcript">{interimTranscript}</div>
      )}

      <style>{`
        .voice-input {
          position: relative;
          display: flex;
          align-items: center;
        }

        .voice-button {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          position: relative;
          overflow: visible;
        }

        .voice-button:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }

        .voice-button.recording {
          background: #ef4444;
          color: #fff;
        }

        .voice-ring {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 2px solid #ef4444;
          pointer-events: none;
          transition: transform 0.1s ease, opacity 0.1s ease;
        }

        .voice-button:not(.recording) .voice-ring {
          display: none;
        }

        .voice-button svg {
          width: 20px;
          height: 20px;
        }

        .interim-transcript {
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.9);
          color: rgba(255, 255, 255, 0.8);
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
          font-size: 0.75rem;
          white-space: nowrap;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 0.5rem;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(5px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default VoiceInput;
