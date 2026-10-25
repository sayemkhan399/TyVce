import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Globe2,
  HelpCircle,
  Mic,
  MicOff,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';

const LANGUAGES = [
  { code: 'bn-BD', name: 'বাংলা (বাংলাদেশ)', flag: '🇧🇩' },
  { code: 'bn-IN', name: 'বাংলা (ভারত)', flag: '🇮🇳' },
  { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', name: 'English (UK)', flag: '🇬🇧' },
  { code: 'hi-IN', name: 'हिन्दी (India)', flag: '🇮🇳' },
  { code: 'ar-SA', name: 'العربية (Saudi Arabia)', flag: '🇸🇦' },
  { code: 'es-ES', name: 'Español (Spain)', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'Français (France)', flag: '🇫🇷' },
  { code: 'de-DE', name: 'Deutsch (Germany)', flag: '🇩🇪' },
  { code: 'ja-JP', name: '日本語 (Japan)', flag: '🇯🇵' },
  { code: 'zh-CN', name: '中文 (Simplified)', flag: '🇨🇳' },
];

const ERROR_MESSAGES = {
  'not-allowed': 'Chrome denied speech recognition. Check the microphone permission for TyVce and make sure Chrome speech services are available.',
  'service-not-allowed': 'Chrome blocked its speech recognition service. Check Chrome speech settings, your network, and any managed-browser restrictions.',
  'audio-capture': 'No microphone was found. Connect a microphone and try again.',
  network: 'Speech recognition could not connect. Check your internet connection.',
  'language-not-supported': 'This language is not supported by your browser.',
};

const appendTranscript = (current, addition) => {
  const phrase = addition.trim();
  if (!phrase) return current;
  return current ? `${current.trim()} ${phrase}` : phrase;
};

const stopMicrophoneStream = (streamRef) => {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
};

const insertTextAtCursor = async (text) => {
  const extension = globalThis.chrome;
  if (!extension?.tabs || !extension?.scripting) {
    throw new Error('Open OmniVoice from Chrome to type into a webpage.');
  }

  const [activeTab] = await extension.tabs.query({ active: true, lastFocusedWindow: true });
  if (!activeTab?.id) {
    throw new Error('No active webpage was found. Open a page and try again.');
  }

  await extension.scripting.executeScript({
    target: { tabId: activeTab.id },
    files: ['content.js'],
  });

  const result = await extension.tabs.sendMessage(activeTab.id, {
    action: 'INSERT_TEXT',
    text: `${text.trim()} `,
  });

  if (!result?.inserted) {
    throw new Error(result?.error || 'Click an editable text field on the page before speaking.');
  }
};

const openMicrophoneSettings = () => {
  const extension = globalThis.chrome;
  if (!extension?.runtime?.sendMessage) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    extension.runtime.sendMessage({ action: 'OPEN_MICROPHONE_SETTINGS' }, (response) => {
      if (extension.runtime.lastError || !response?.opened) {
        console.error('Could not open Chrome microphone settings:', extension.runtime.lastError?.message);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
};

const getMicrophoneErrorMessage = (error, stage) => {
  const name = error?.name || 'UnknownError';
  const message = error?.message || '';

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    if (stage === 'microphone' && /dismiss/i.test(message)) {
      return 'Chrome’s microphone permission prompt was dismissed. Click the microphone again and choose Allow in the prompt; dismissing it does not grant access.';
    }
    if (stage === 'recognition') {
      return 'Chrome granted microphone capture, but its speech recognition engine rejected the audio. Check that Chrome speech services are available and not blocked by a network or managed-browser policy.';
    }
    return 'Chrome denied microphone access. Allow the microphone for TyVce in Chrome, then click the microphone to retry.';
  }
  if (name === 'NotFoundError') {
    return 'No microphone was found. Connect a microphone and try again.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'Chrome could not use the microphone. Close other recording apps and check your operating system microphone settings.';
  }
  if (name === 'InvalidStateError') {
    return 'Speech recognition is already starting or running. Wait a moment, then try again.';
  }
  return `Speech recognition could not start (${name}): ${message || 'No additional details were provided.'}`;
};

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [selectedLang, setSelectedLang] = useState('bn-BD');
  const [transcript, setTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState('Ready when you are');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [showMicSettings, setShowMicSettings] = useState(false);
  const [theme, setTheme] = useState('light');
  const [copied, setCopied] = useState(false);

  const recognitionRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const shouldListenRef = useRef(false);
  const finalTranscriptRef = useRef('');

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setStatusMessage('Browser not supported');
      setErrorMessage('Speech recognition is not available in this browser. Try Chrome or Edge.');
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLang;

    recognition.onstart = () => {
      setIsStarting(false);
      setIsListening(true);
      setStatusMessage('Listening for your voice');
      setErrorMessage('');
    };

    recognition.onresult = (event) => {
      let currentInterim = '';
      let finalSpeech = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalSpeech += text;
        } else {
          currentInterim += text;
        }
      }

      if (finalSpeech.trim()) {
        finalTranscriptRef.current = appendTranscript(finalTranscriptRef.current, finalSpeech);
      }

      const visibleTranscript = appendTranscript(finalTranscriptRef.current, currentInterim);
      if (visibleTranscript) setTranscript(visibleTranscript);

      if (finalSpeech.trim()) {
        setStatusMessage('Typing at your cursor…');
        insertTextAtCursor(finalSpeech).then(
          () => setStatusMessage('Typed at your cursor'),
          (error) => {
            console.error('Could not type recognized speech:', error);
            setStatusMessage('Could not type on this page');
            setErrorMessage(error.message || 'Refresh the page and try again.');
          },
        );
      }
    };

    recognition.onerror = (event) => {
      setIsStarting(false);
      if (event.error === 'no-speech') {
        setStatusMessage('Still listening — say something when ready');
        return;
      }
      if (event.error === 'aborted') return;

      if (event.error !== 'not-allowed' && event.error !== 'service-not-allowed') {
        setShowMicSettings(false);
      }
      console.error('Speech recognition error:', event.error, event.message || '');
      setErrorMessage(
        ERROR_MESSAGES[event.error] || 'Something went wrong with speech recognition. Please try again.',
      );
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setShowMicSettings(event.error === 'not-allowed');
        shouldListenRef.current = false;
        setIsListening(false);
        setStatusMessage(
          event.error === 'not-allowed' ? 'Speech recognition permission denied' : 'Speech service unavailable',
        );
        stopMicrophoneStream(microphoneStreamRef);
      }
    };

    recognition.onend = () => {
      setIsStarting(false);
      if (shouldListenRef.current) {
        try {
          const audioTrack = microphoneStreamRef.current?.getAudioTracks()[0];
          if (!audioTrack?.readyState || audioTrack.readyState !== 'live') {
            throw new Error('The microphone audio track is no longer available.');
          }
          recognition.start(audioTrack);
          setStatusMessage('Reconnecting to microphone…');
        } catch (error) {
          console.error('Could not resume speech recognition:', error);
          shouldListenRef.current = false;
          setIsListening(false);
          setStatusMessage('Listening paused');
          stopMicrophoneStream(microphoneStreamRef);
          setErrorMessage('Listening could not resume. Press the microphone button to try again.');
        }
      } else {
        setIsListening(false);
        setStatusMessage('Session ended');
        stopMicrophoneStream(microphoneStreamRef);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current = false;
      recognition.onend = null;
      recognition.stop();
      stopMicrophoneStream(microphoneStreamRef);
      recognitionRef.current = null;
    };
  }, [selectedLang]);

  const toggleListening = async () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isListening) {
      shouldListenRef.current = false;
      recognition.stop();
      stopMicrophoneStream(microphoneStreamRef);
      setIsListening(false);
      setStatusMessage('Session ended');
      return;
    }

    if (isStarting) return;
    setShowMicSettings(false);
    setErrorMessage('');
    setIsStarting(true);
    setStatusMessage('Requesting microphone access…');
    let stage = 'microphone';
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone capture is unavailable in this Chrome context.');
      }

      const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTrack = microphoneStream.getAudioTracks()[0];
      if (!audioTrack) {
        microphoneStream.getTracks().forEach((track) => track.stop());
        throw new Error('Chrome did not provide an audio input track.');
      }

      stopMicrophoneStream(microphoneStreamRef);
      microphoneStreamRef.current = microphoneStream;
      shouldListenRef.current = true;
      recognition.lang = selectedLang;
      finalTranscriptRef.current = '';
      setTranscript('');
      setStatusMessage('Starting speech recognition…');
      stage = 'recognition';
      recognition.start(audioTrack);
    } catch (error) {
      const errorDetails = {
        name: error?.name || 'UnknownError',
        message: error?.message || String(error),
        code: error?.code,
        stage,
      };
      console.error(
        `Could not start voice typing at ${stage} stage: ${errorDetails.name}: ${errorDetails.message}`,
      );
      shouldListenRef.current = false;
      stopMicrophoneStream(microphoneStreamRef);
      setIsStarting(false);
      setStatusMessage('Could not start');
      setShowMicSettings(
        stage === 'microphone'
        && (errorDetails.name === 'NotAllowedError' || errorDetails.name === 'SecurityError'),
      );
      setErrorMessage(
        `${getMicrophoneErrorMessage(error, stage)} (${errorDetails.name}: ${errorDetails.message})`,
      );
    }
  };

  const copyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error('Could not copy transcript:', error);
      setErrorMessage('Could not copy the transcript. Check clipboard permissions.');
    }
  };

  const selectedLanguage = LANGUAGES.find((language) => language.code === selectedLang);
  const wordCount = transcript ? transcript.trim().split(/\s+/).length : 0;

  return (
    <main className={`app-shell theme-${theme}`}>
      <div className="app-card">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <img src="/fabicon.svg" alt="TyVce Logo" />
            </div>
            <div>
              <p className="brand-name">TyVce</p>
              <p className="brand-caption">VOICE WORKSPACE</p>
            </div>
          </div>
          <button
            className="icon-button theme-toggle"
            type="button"
            onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>
        </header>

        <section className={`hero-panel ${isListening ? 'is-listening' : ''}`}>
          <div className="hero-orb hero-orb-one" />
          <div className="hero-orb hero-orb-two" />
          <div className="hero-content">
            <div className={`status-pill ${isListening ? 'status-live' : ''}`}>
              <span className="status-dot" />
              {isListening ? 'LIVE SESSION' : 'VOICE TYPING'}
            </div>
            <h1>{isListening ? 'I’m listening.' : 'Speak, it’s typed.'}</h1>
            <p>
              {isListening
                ? 'Your words will appear wherever your cursor is.'
                : 'Focus a text field, then speak. Your words appear at the cursor.'}
            </p>
            <div className={`soundwave ${isListening ? 'soundwave-active' : ''}`} aria-hidden="true">
              {[12, 20, 29, 17, 36, 24, 15, 31, 20, 12, 26, 17, 34, 21, 12, 25, 16, 30, 19, 11, 23, 15, 28, 18, 12, 22, 14, 26].map(
                (height, index) => (
                  <span key={index} style={{ '--bar-height': `${height}px`, '--bar-index': index }} />
                ),
              )}
            </div>
          </div>
          <button
            className={`record-button ${isListening ? 'recording' : ''}`}
            type="button"
            onClick={toggleListening}
            disabled={!isSupported || isStarting}
            aria-label={isStarting ? 'Starting speech recognition' : isListening ? 'Stop voice typing' : 'Start voice typing'}
            aria-pressed={isListening}
          >
            {isListening ? <MicOff size={23} /> : <Mic size={23} />}
          </button>
        </section>

        <div className="session-status" role="status" aria-live="polite">
          <span className={`session-status-icon ${isListening ? 'session-status-live' : ''}`}>
            {isListening ? <AudioLines size={15} /> : <CheckCircle2 size={15} />}
          </span>
          <span className="session-status-text">{statusMessage}</span>
          {isListening && <span className="session-timer">ON AIR</span>}
        </div>

        <section className="settings-section" aria-labelledby="language-label">
          <div className="section-heading">
            <label id="language-label" htmlFor="language-select">
              <Globe2 size={15} />
              Recognition language
            </label>
            <span className="section-hint">11 LANGUAGES</span>
          </div>
          <div className={`select-wrap ${isListening || isStarting ? 'select-disabled' : ''}`}>
            <span className="language-flag" aria-hidden="true">{selectedLanguage?.flag}</span>
            <select
              id="language-select"
              value={selectedLang}
              onChange={(event) => setSelectedLang(event.target.value)}
              disabled={isListening || isStarting}
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
            </select>
            <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
          </div>
        </section>

        <section className="transcript-card" aria-labelledby="transcript-heading">
          <div className="transcript-heading">
            <div>
              <h2 id="transcript-heading">Latest transcript</h2>
              <span className="transcript-meta">{wordCount} {wordCount === 1 ? 'WORD' : 'WORDS'}</span>
            </div>
            {transcript && (
              <button
                className="copy-button"
                type="button"
                onClick={copyTranscript}
                aria-label={copied ? 'Transcript copied' : 'Copy transcript'}
              >
                {copied ? <Check size={14} /> : <Clipboard size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          <div className={`transcript-body ${transcript ? 'has-transcript' : ''}`}>
            {transcript ? (
              <p>{transcript}</p>
            ) : (
              <div className="transcript-empty">
                <Sparkles size={17} />
                <span>Your words will show up here as you speak.</span>
              </div>
            )}
          </div>
        </section>

        {errorMessage && (
          <div className="error-banner" role="alert">
            <AlertCircle size={17} />
            <div className="error-content">
              <p>{errorMessage}</p>
              {showMicSettings && (
                <button
                  className="settings-link"
                  type="button"
                  onClick={() => {
                    openMicrophoneSettings().then((opened) => {
                      if (!opened) {
                        setErrorMessage('Could not open settings automatically. Open chrome://settings/content/microphone in a Chrome tab.');
                      }
                    });
                  }}
                >
                  Open Chrome microphone settings
                </button>
              )}
            </div>
            <button
              type="button"
              className="dismiss-error"
              onClick={() => {
                setErrorMessage('');
                setShowMicSettings(false);
              }}
              aria-label="Dismiss message"
            >
              <X size={15} />
            </button>
          </div>
        )}

        <footer className="app-footer">
          <div className="privacy-note">
            <ShieldCheck size={15} />
            <span>Focus a page field first; dictated text is inserted at your cursor.</span>
          </div>
          <button
            className="help-button"
            type="button"
            title="Click into a text field before starting voice typing."
            aria-label="How to use voice typing"
          >
            <HelpCircle size={16} />
          </button>
        </footer>
      </div>
    </main>
  );
}
