import { useState, useEffect } from 'react';
import { DeviceScanner } from './components/DeviceScanner';
import { DeviceStatus } from './components/DeviceStatus';
import { SignalViewer } from './components/SignalViewer';
import { ResistanceViewer } from './components/ResistanceViewer';
import { EmotionsViewer } from './components/EmotionsViewer';
import { VideoAttentionTracker } from './components/VideoAttentionTracker';
import { wsService } from './services/websocket';
import './App.css';

function App() {
  const [connected, setConnected] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'signal' | 'resistance' | 'emotions' | 'video'>('signal');

  useEffect(() => {
    // Connect to WebSocket on mount
    wsService.connect().then(() => {
      setWsConnected(true);
    }).catch(err => {
      console.error('Failed to connect to WebSocket:', err);
    });

    return () => {
      wsService.disconnect();
    };
  }, []);

  const handleDeviceConnected = () => {
    setConnected(true);
  };

  const handleDeviceDisconnected = () => {
    setConnected(false);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>FocusFlow - BrainBit Interface</h1>
        <div className="connection-status">
          <span className={`status-indicator ${wsConnected ? 'connected' : 'disconnected'}`}>
            {wsConnected ? '🟢' : '🔴'}
          </span>
          <span>WebSocket {wsConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>

      <main className="app-main">
        {!connected ? (
          <div className="scanner-container">
            <DeviceScanner onDeviceConnected={handleDeviceConnected} />
          </div>
        ) : (
          <div className="connected-view">
            <aside className="sidebar">
              <DeviceStatus onDisconnect={handleDeviceDisconnected} />
              
              <nav className="tab-navigation">
                <button
                  className={`tab ${activeTab === 'signal' ? 'active' : ''}`}
                  onClick={() => setActiveTab('signal')}
                >
                  Signal
                </button>
                <button
                  className={`tab ${activeTab === 'resistance' ? 'active' : ''}`}
                  onClick={() => setActiveTab('resistance')}
                >
                  Resistance
                </button>
                <button
                  className={`tab ${activeTab === 'emotions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('emotions')}
                >
                  Emotions
                </button>
                <button
                  className={`tab ${activeTab === 'video' ? 'active' : ''}`}
                  onClick={() => setActiveTab('video')}
                >
                  🎬 Video
                </button>
              </nav>
            </aside>

            <div className="content">
              {activeTab === 'signal' && <SignalViewer />}
              {activeTab === 'resistance' && <ResistanceViewer />}
              {activeTab === 'emotions' && <EmotionsViewer />}
              {activeTab === 'video' && <VideoAttentionTracker />}
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Based on BrainBit SDK</p>
      </footer>
    </div>
  );
}

export default App;
