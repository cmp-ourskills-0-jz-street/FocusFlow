import { useState, useEffect, useRef } from 'react';
import { wsService, MessageHandler } from '../services/websocket';
import { ApiService } from '../services/api';
import type { EmotionsData, WebSocketMessage } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AttentionDataPoint {
  time: number;
  attention: number;
}

// Constants for seeking prevention
const SEEK_TOLERANCE = 0.5; // seconds - threshold for detecting backwards seeking
const YOUTUBE_SEEK_THRESHOLD = 1; // seconds - threshold for YouTube seeking detection
const SEEK_CHECK_INTERVAL = 500; // milliseconds - how often to check for seeking

export function VideoAttentionTracker() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [player, setPlayer] = useState<YT.Player | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [calibrationPercent, setCalibrationPercent] = useState(0);
  const [attentionData, setAttentionData] = useState<AttentionDataPoint[]>([]);
  const [showGraph, setShowGraph] = useState(false);
  const [currentAttention, setCurrentAttention] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoMode, setVideoMode] = useState<'youtube' | 'file'>('youtube');
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  
  const playerRef = useRef<any>(null);
  const trackingIntervalRef = useRef<number | null>(null);
  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);
  // Use refs to capture latest values in the tracking interval
  const currentAttentionRef = useRef<number | null>(null);
  // Track last valid time for YouTube player to prevent seeking
  const lastYouTubeTimeRef = useRef<number>(0);
  const youtubeSeekCheckIntervalRef = useRef<number | null>(null);

  // Extract YouTube video ID from URL
  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  };

  // Load YouTube IFrame API
  useEffect(() => {
    // Check if API is already loaded
    if (window.YT) {
      return;
    }

    // Load YouTube IFrame API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    // API ready callback
    window.onYouTubeIframeAPIReady = () => {
      console.log('YouTube IFrame API ready');
    };
  }, []);

  // Create YouTube player when video ID changes
  useEffect(() => {
    if (!videoId || !window.YT) return;

    // Destroy existing player
    if (playerRef.current) {
      playerRef.current.destroy();
    }

    // Reset last valid time when creating new player
    lastYouTubeTimeRef.current = 0;

    // Create new player
    const newPlayer = new window.YT.Player('youtube-player', {
      height: '480',
      width: '854',
      videoId: videoId,
      playerVars: {
        // Disable keyboard controls (including arrow keys for seeking)
        disablekb: 1,
        // Disable related videos and annotations
        rel: 0,
        iv_load_policy: 3,
      },
      events: {
        onStateChange: onPlayerStateChange,
        onReady: onPlayerReady,
      },
    });

    playerRef.current = newPlayer;
    setPlayer(newPlayer);
    setShowGraph(false);
    setAttentionData([]);

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [videoId]);

  // Handle YouTube player ready event
  const onPlayerReady = async (_event: any) => {
    // Start emotions streaming automatically when video is loaded
    if (!isStreaming) {
      try {
        await ApiService.startDataStream('emotions');
        setIsStreaming(true);
      } catch (err) {
        console.error('Error starting emotions stream:', err);
        setErrorMessage('Ошибка при запуске отслеживания эмоций');
      }
    }

    // Start periodic check for seeking on YouTube player
    if (youtubeSeekCheckIntervalRef.current) {
      clearInterval(youtubeSeekCheckIntervalRef.current);
    }
    youtubeSeekCheckIntervalRef.current = window.setInterval(() => {
      if (playerRef.current && videoMode === 'youtube') {
        const currentTime = playerRef.current.getCurrentTime();
        // If user seeked backwards (more than threshold), reset to last valid time
        if (currentTime < lastYouTubeTimeRef.current - YOUTUBE_SEEK_THRESHOLD) {
          playerRef.current.seekTo(lastYouTubeTimeRef.current, true);
        } else {
          // Update last valid time only if moving forward
          lastYouTubeTimeRef.current = Math.max(lastYouTubeTimeRef.current, currentTime);
        }
      }
    }, SEEK_CHECK_INTERVAL); // Check twice per second
  };

  // Handle player state changes
  const onPlayerStateChange = (event: any) => {
    const state = event.data;
    
    if (state === YT.PlayerState.PLAYING) {
      startAttentionTracking();
    } else if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.BUFFERING) {
      // Pause tracking when video is paused or buffering
      stopAttentionTracking();
    } else if (state === YT.PlayerState.ENDED) {
      stopAttentionTracking();
      setShowGraph(true);
      // Stop seek check interval when video ends
      if (youtubeSeekCheckIntervalRef.current) {
        clearInterval(youtubeSeekCheckIntervalRef.current);
        youtubeSeekCheckIntervalRef.current = null;
      }
    }
  };

  // Listen to emotions data from WebSocket
  useEffect(() => {
    const handler: MessageHandler = (message: WebSocketMessage) => {
      if (message.type === 'emotions') {
        const data = message.data as EmotionsData;
        
        // Check if calibrating
        if (data.calibration_percent !== undefined) {
          setCalibrationPercent(data.calibration_percent);
          if (data.calibration_percent >= 100) {
            setIsCalibrated(true);
          }
        } else if (data.rel_attention !== undefined) {
          setIsCalibrated(true);
          setCurrentAttention(data.rel_attention);
          // Update refs with latest values for tracking interval
          currentAttentionRef.current = data.rel_attention;
        }
      }
    };

    wsService.addMessageHandler(handler);
    return () => wsService.removeMessageHandler(handler);
  }, []);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if file is a video
    if (!file.type.startsWith('video/')) {
      setErrorMessage('Пожалуйста, выберите видео файл.');
      return;
    }

    // Revoke previous object URL if exists to free memory
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
    }

    // Create object URL for the video file
    const url = URL.createObjectURL(file);
    setUploadedVideoUrl(url);
    setVideoMode('file');
    setVideoId(null); // Clear YouTube video
    setShowGraph(false);
    setAttentionData([]);
    setErrorMessage(null);

    // Start emotions streaming automatically when video is loaded
    if (!isStreaming) {
      try {
        await ApiService.startDataStream('emotions');
        setIsStreaming(true);
      } catch (err) {
        console.error('Error starting emotions stream:', err);
        setErrorMessage('Ошибка при запуске отслеживания эмоций');
      }
    }
  };

  // Start attention tracking (record every second)
  const startAttentionTracking = () => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
    }

    trackingIntervalRef.current = window.setInterval(() => {
      // Use refs to get the latest attention data
      if (currentAttentionRef.current === null) return;

      let currentTime = 0;
      
      // Get current time from appropriate player
      if (videoMode === 'youtube' && player) {
        currentTime = player.getCurrentTime();
      } else if (videoMode === 'file' && htmlVideoRef.current) {
        currentTime = htmlVideoRef.current.currentTime;
      } else {
        // No valid player available, skip this data point
        return;
      }

      const dataPoint: AttentionDataPoint = {
        time: Math.round(currentTime),
        attention: currentAttentionRef.current,
      };
      
      setAttentionData(prev => [...prev, dataPoint]);
    }, 1000); // Track every second
  };

  // Stop attention tracking
  const stopAttentionTracking = () => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
  };

  // Handle HTML5 video events
  useEffect(() => {
    if (!htmlVideoRef.current || videoMode !== 'file') return;

    const video = htmlVideoRef.current;
    let lastValidTime = 0;

    const handlePlay = () => {
      startAttentionTracking();
    };

    const handlePause = () => {
      stopAttentionTracking();
    };

    const handleEnded = () => {
      stopAttentionTracking();
      setShowGraph(true);
    };

    // Prevent seeking - force video back to last valid position if user tries to seek
    const handleSeeking = () => {
      const currentTime = video.currentTime;
      // Allow seeking only forward within a small threshold to account for buffering
      if (currentTime < lastValidTime - SEEK_TOLERANCE) {
        video.currentTime = lastValidTime;
      }
    };

    const handleTimeUpdate = () => {
      // Update last valid time only if video is playing forward
      if (!video.seeking) {
        lastValidTime = video.currentTime;
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedVideoUrl, videoMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAttentionTracking();
      // Stop YouTube seek check interval
      if (youtubeSeekCheckIntervalRef.current) {
        clearInterval(youtubeSeekCheckIntervalRef.current);
      }
      // Stop emotions streaming on unmount
      if (isStreaming) {
        ApiService.stopDataStream('emotions').catch(err => 
          console.error('Error stopping emotions stream:', err)
        );
      }
      // Revoke object URL on unmount to free memory
      if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedVideoUrl]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const id = extractVideoId(youtubeUrl);
    if (id) {
      setVideoId(id);
      setShowGraph(false);
      setAttentionData([]);
    } else {
      setErrorMessage('Неверная ссылка на YouTube. Пожалуйста, введите корректную ссылку.');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="video-attention-tracker">
      <div className="header">
        <h3>🎬 Отслеживание внимания при просмотре видео</h3>
        <p className="info-text">Отслеживание начнется автоматически при запуске видео</p>
      </div>

      {/* Calibration and streaming status */}
      {isStreaming && (
        <div className="control-panel">
          {!isCalibrated && (
            <div className="calibration-status">
              <p>⏳ Калибровка: {calibrationPercent.toFixed(0)}%</p>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${calibrationPercent}%` }}
                />
              </div>
            </div>
          )}
          
          {isCalibrated && (
            <div className="status-indicator success">
              ✓ Готов к отслеживанию
            </div>
          )}
        </div>
      )}

      {/* Video source selection */}
      <div className="video-source-selection">
        <div className="mode-toggle">
          <button 
            className={`mode-btn ${videoMode === 'youtube' ? 'active' : ''}`}
            onClick={() => {
              setVideoMode('youtube');
              setUploadedVideoUrl(null);
              setShowGraph(false);
              setAttentionData([]);
            }}
          >
            📺 YouTube
          </button>
          <button 
            className={`mode-btn ${videoMode === 'file' ? 'active' : ''}`}
            onClick={() => {
              setVideoMode('file');
              setVideoId(null);
              setShowGraph(false);
              setAttentionData([]);
            }}
          >
            📁 Файл
          </button>
        </div>
      </div>

      {/* YouTube URL input */}
      {videoMode === 'youtube' && (
        <div className="url-input-section">
          <form onSubmit={handleUrlSubmit}>
            <div className="input-group">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="Вставьте ссылку на YouTube видео"
                className="url-input"
              />
              <button type="submit" className="btn btn-secondary">
                Загрузить
              </button>
            </div>
          </form>
          {errorMessage && (
            <div className="error-message">
              {errorMessage}
            </div>
          )}
        </div>
      )}

      {/* File upload input */}
      {videoMode === 'file' && (
        <div className="file-input-section">
          <div className="input-group">
            <input
              type="file"
              accept="video/*"
              onChange={handleFileUpload}
              className="file-input"
              id="video-file-input"
            />
            <label htmlFor="video-file-input" className="btn btn-secondary">
              📁 Выбрать видео файл
            </label>
          </div>
          {uploadedVideoUrl && (
            <p className="file-info">✓ Видео загружено успешно</p>
          )}
          {errorMessage && (
            <div className="error-message">
              {errorMessage}
            </div>
          )}
        </div>
      )}

      {/* Current attention display */}
      {isCalibrated && currentAttention !== null && (
        <div className="current-metrics">
          <div className="metric-box">
            <span className="metric-label">Текущее внимание:</span>
            <span className="metric-value">{(currentAttention * 10).toFixed(1)}</span>
          </div>
        </div>
      )}

      {/* YouTube player */}
      {videoMode === 'youtube' && videoId && (
        <div className="video-container">
          <div id="youtube-player"></div>
        </div>
      )}

      {/* HTML5 video player */}
      {videoMode === 'file' && uploadedVideoUrl && (
        <div className="video-container">
          <video 
            ref={htmlVideoRef}
            src={uploadedVideoUrl}
            controls
            style={{ width: '100%', maxWidth: '854px', height: 'auto' }}
          >
            Ваш браузер не поддерживает video тег.
          </video>
        </div>
      )}

      {/* Attention graph or message after video ends */}
      {showGraph && (
        <div className="attention-graph">
          {attentionData.length > 0 ? (
            <>
              <h4>📊 График внимания во время просмотра</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={attentionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="time" 
                    tickFormatter={formatTime}
                    label={{ value: 'Время (мм:сс)', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis 
                    domain={[0, 1]}
                    tickFormatter={(value: number) => `${(value * 10).toFixed(0)}`}
                    label={{ value: 'Уровень', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    labelFormatter={formatTime}
                    formatter={(value: number) => `${(value * 10).toFixed(1)}`}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="attention" 
                    stroke="#8884d8" 
                    name="Внимание"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="graph-summary">
                Всего записано точек данных: {attentionData.length}
              </p>
            </>
          ) : (
            <div className="no-data-message">
              <h4>⚠️ Видео завершено</h4>
              <p>Данные о внимании не были записаны.</p>
              <p>Убедитесь, что:</p>
              <ul style={{ textAlign: 'left', margin: '10px auto', maxWidth: '400px' }}>
                <li>Видео было загружено (автоматически запускается отслеживание)</li>
                <li>Калибровка успешно завершена (100%)</li>
                <li>Устройство BrainBit подключено и передает данные</li>
                <li>Вы запустили видео и дождались его окончания</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {!videoId && !uploadedVideoUrl && (
        <div className="placeholder">
          <p>🎥 {videoMode === 'youtube' ? 'Вставьте ссылку на YouTube видео' : 'Загрузите видео файл'} чтобы начать</p>
          <p className="note">
            1. {videoMode === 'youtube' ? 'Вставьте ссылку на YouTube видео' : 'Загрузите видео файл'}<br />
            2. Дождитесь завершения калибровки<br />
            3. Запустите видео для начала отслеживания<br />
            4. Просмотрите видео до конца<br />
            5. Увидите график изменения внимания
          </p>
        </div>
      )}
    </div>
  );
}
