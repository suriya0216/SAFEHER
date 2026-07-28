const GUARDIAN_PENDING_SOS_KEY = 'safeher_guardian_pending_sos';
const GUARDIAN_EVENT_NAME = 'safeher:guardian-emergency';

const guardianState = {
  active: false,
  emergencyTriggered: false,
  recognition: null,
  recognitionRestartTimer: null,
  checkInTimer: null,
  locationWatchId: null,
  speechSupported: false,
  location: null,
  locationLabel: '',
  audioContext: null,
  audioStream: null,
  audioFrame: null,
  loudStartedAt: 0,
  isSpeaking: false,
  speechToken: 0,
  dialogueIndex: 0,
  transcript: [],
};

const guardianScripts = {
  'ta-IN': {
    greeting: 'ஹேய், நான் கார்னர் பேக்கரி பக்கத்தில்தான் இருக்கேன். நீ மெயின் ரோடு அருகில் இருக்கியா?',
    calm: [
      'நான் லைன்-ல இருக்கேன். வெளிச்சம் இருக்கும் பாதையிலேயே நட, நீ அடுத்த கடையை கடந்துட்டியா?',
      'சரி, உன் வேகத்திலேயே நட. நான் உனக்கு அருகில்தான் வர்றேன்; நீ மெயின் ரோடு பக்கமா இருக்கியா?'
    ],
    threat: [
      'நான் உன்னை பார்த்துட்டேன். லைட் இருக்கும் இடத்திலேயே இரு, நான் இப்போ ரோட்டை கடக்கிறேன்.',
      'பின்னாடி யாராவது இருந்தா கவலைப்படாதே. நான் இன்னும் ஒரு நிமிஷத்துல உன்னுடன் இருக்கேன்; வெளிச்சம் இருக்கும் இடத்துக்கு நட.'
    ],
    location: 'சரி, அந்த இடத்திலேயே இரு. நீ நீல கட்டிடத்தை கடந்துட்டியா, இல்ல இன்னும் மெயின் ரோடு அருகிலா இருக்கியா?',
    emergency: 'வெளிச்சம் இருக்கும் இடத்திலேயே இரு. உன் பாதுகாப்பு வட்டத்துக்கு இப்போ எச்சரிக்கை அனுப்புறேன்.',
    stopped: 'சரி, நான் standby-ல் இருக்கேன். உனக்கு தேவைப்பட்டால் மீண்டும் என்னை தொடங்கு.'
  },
  'en-IN': {
    greeting: 'Hey, I am near the corner bakery. Are you close to the main road now?',
    calm: [
      'I am still on the line. Stay on the brighter side and tell me when you pass the next shop.',
      'Keep walking at your pace. I am very close by; are you near the main road?'
    ],
    threat: [
      'I can see you walking. Stay where the lights are; I am crossing the street right now.',
      'Do not worry about anyone behind you. I am less than a minute away, so keep moving toward the brighter area.'
    ],
    location: 'Okay, stay right there. Have you passed the blue building, or are you still close to the main road?',
    emergency: 'Stay where the lights are. I am alerting your safety circle right now.',
    stopped: 'Okay, I am on standby. Start me again whenever you want a safety check-in.'
  }
};

function guardianElement(id) {
  return document.getElementById(id);
}

function guardianLanguage() {
  return guardianElement('guardianLanguage')?.value === 'en-IN' ? 'en-IN' : 'ta-IN';
}

function guardianCopy() {
  return guardianScripts[guardianLanguage()];
}

function appendGuardianMessage(kind, message) {
  const container = guardianElement('guardianConversation');
  if (!container || !message) return;

  const item = document.createElement('div');
  item.className = `guardian-message guardian-message-${kind}`;
  const label = document.createElement('span');
  label.textContent = kind === 'ai' ? 'Guardian' : 'You';
  const copy = document.createElement('p');
  copy.textContent = message;
  item.append(label, copy);
  container.appendChild(item);
  container.scrollTop = container.scrollHeight;

  guardianState.transcript.push({ kind, message, at: Date.now() });
  guardianState.transcript = guardianState.transcript.slice(-10);
}

function updateGuardianStatus(title, description, active = guardianState.active) {
  const stage = guardianElement('guardianCallStage');
  const callTitle = guardianElement('guardianCallTitle');
  const callDescription = guardianElement('guardianCallDescription');
  const heroStatus = guardianElement('guardianHeroStatus');
  const heroSub = guardianElement('guardianHeroSub');
  const topStatus = guardianElement('guardianTopStatus');

  stage?.classList.toggle('is-active', active);
  if (callTitle) callTitle.textContent = title;
  if (callDescription) callDescription.textContent = description;
  if (heroStatus) heroStatus.textContent = guardianState.emergencyTriggered ? title : active ? 'Escort active' : title;
  if (heroSub) heroSub.textContent = guardianState.emergencyTriggered ? description : active ? 'Listening for a natural check-in.' : description;
  if (topStatus) topStatus.textContent = guardianState.emergencyTriggered ? 'SOS relay started' : active ? 'Escort active' : 'On standby';
}

function speakGuardian(message) {
  if (!message || !guardianElement('guardianSpeakerToggle')?.checked || !('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();
  const speechToken = ++guardianState.speechToken;
  guardianState.isSpeaking = true;
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = guardianLanguage();
  utterance.rate = guardianLanguage() === 'ta-IN' ? 0.95 : 0.93;
  utterance.pitch = 0.92;
  utterance.volume = 1;
  const completeSpeech = () => {
    if (guardianState.speechToken === speechToken) guardianState.isSpeaking = false;
  };
  utterance.onend = completeSpeech;
  utterance.onerror = completeSpeech;
  window.speechSynthesis.speak(utterance);
}

function sayAsGuardian(message) {
  appendGuardianMessage('ai', message);
  speakGuardian(message);
}

function updateMeter(level) {
  const bars = document.querySelectorAll('.guardian-meter i');
  const activeBars = Math.max(1, Math.min(bars.length, Math.round(level * bars.length * 3)));
  bars.forEach((bar, index) => {
    const height = index < activeBars ? 7 + ((index % 5) * 4) : 5;
    bar.style.height = `${height}px`;
  });
}

function stopLoudMonitoring() {
  if (guardianState.audioFrame) {
    window.cancelAnimationFrame(guardianState.audioFrame);
    guardianState.audioFrame = null;
  }
  if (guardianState.audioStream) {
    guardianState.audioStream.getTracks().forEach(track => track.stop());
    guardianState.audioStream = null;
  }
  if (guardianState.audioContext) {
    guardianState.audioContext.close().catch(() => {});
    guardianState.audioContext = null;
  }
  guardianState.loudStartedAt = 0;
}

async function startLoudMonitoring() {
  if (guardianState.audioStream || !guardianElement('guardianLoudToggle')?.checked || !navigator.mediaDevices?.getUserMedia) return;

  try {
    guardianState.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    guardianState.audioContext = new AudioContext();
    const analyser = guardianState.audioContext.createAnalyser();
    analyser.fftSize = 1024;
    const source = guardianState.audioContext.createMediaStreamSource(guardianState.audioStream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const watchAudio = () => {
      if (!guardianState.active || guardianState.emergencyTriggered) return;

      analyser.getByteTimeDomainData(samples);
      let total = 0;
      samples.forEach(sample => {
        const value = (sample - 128) / 128;
        total += value * value;
      });
      const rms = Math.sqrt(total / samples.length);
      updateMeter(rms);

      if (guardianState.isSpeaking) {
        guardianState.loudStartedAt = 0;
        guardianState.audioFrame = window.requestAnimationFrame(watchAudio);
        return;
      }

      if (rms > 0.34) {
        guardianState.loudStartedAt ||= Date.now();
        if (Date.now() - guardianState.loudStartedAt > 900) {
          triggerGuardianEmergency('Sustained loud distress signal detected');
          return;
        }
      } else {
        guardianState.loudStartedAt = 0;
      }
      guardianState.audioFrame = window.requestAnimationFrame(watchAudio);
    };

    watchAudio();
  } catch (error) {
    appendGuardianMessage('ai', 'I could not start the loud distress check, but I am still ready for your codeword or a manual relay.');
  }
}

function stopGuardianRecognition() {
  window.clearTimeout(guardianState.recognitionRestartTimer);
  const recognition = guardianState.recognition;
  guardianState.recognition = null;
  if (recognition) {
    try {
      recognition.stop();
    } catch (error) {}
  }
}

function startGuardianRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  guardianState.speechSupported = Boolean(SpeechRecognition);
  if (!SpeechRecognition) {
    updateGuardianStatus('Escort active', 'Voice recognition is unavailable here. You can use the message field for Guardian check-ins.', true);
    return;
  }

  const recognition = new SpeechRecognition();
  guardianState.recognition = recognition;
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = guardianLanguage();

  recognition.onresult = event => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      if (!event.results[index].isFinal) continue;
      const transcript = event.results[index][0].transcript.trim();
      if (transcript && !guardianState.isSpeaking) handleGuardianInput(transcript);
    }
  };

  recognition.onerror = event => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      updateGuardianStatus('Escort active', 'Microphone permission is unavailable. Type a message to keep the safety check-in going.', true);
    }
  };

  recognition.onend = () => {
    if (!guardianState.active || guardianState.emergencyTriggered || guardianState.recognition !== recognition) return;
    guardianState.recognitionRestartTimer = window.setTimeout(() => {
      if (guardianState.active && guardianState.recognition === recognition) {
        try {
          recognition.start();
        } catch (error) {}
      }
    }, 700);
  };

  try {
    recognition.start();
  } catch (error) {}
}

function locationText(position) {
  const latitude = Number(position.coords.latitude).toFixed(5);
  const longitude = Number(position.coords.longitude).toFixed(5);
  return `Live coordinates ${latitude}, ${longitude}`;
}

function detectGuardianLocation() {
  if (!navigator.geolocation) return;

  const applyLocation = position => {
    guardianState.location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
    guardianState.locationLabel = locationText(position);
    const title = guardianElement('guardianLocationTitle');
    const detail = guardianElement('guardianLocationDetail');
    if (title) title.textContent = 'Live location ready';
    if (detail) detail.textContent = `${guardianState.locationLabel} · accuracy about ${Math.round(position.coords.accuracy)} m`;
    guardianElement('guardianLocationDot')?.classList.add('is-ready');
  };

  const handleLocationError = () => {
    const detail = guardianElement('guardianLocationDetail');
    if (detail) detail.textContent = 'Location permission was not granted. You can still use Guardian and SOS manually.';
  };

  navigator.geolocation.getCurrentPosition(
    applyLocation,
    handleLocationError,
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
  );

  if (guardianState.locationWatchId !== null) {
    navigator.geolocation.clearWatch(guardianState.locationWatchId);
  }
  guardianState.locationWatchId = navigator.geolocation.watchPosition(
    applyLocation,
    handleLocationError,
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

function stopGuardianLocationTracking() {
  if (guardianState.locationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(guardianState.locationWatchId);
  }
  guardianState.locationWatchId = null;
}

function startGuardianCheckIns() {
  window.clearInterval(guardianState.checkInTimer);
  guardianState.checkInTimer = window.setInterval(() => {
    if (!guardianState.active || guardianState.emergencyTriggered || document.hidden) return;
    sayAsGuardian(guardianReplyFor('route check-in'));
  }, 26000);
}

function stopGuardianCheckIns() {
  window.clearInterval(guardianState.checkInTimer);
  guardianState.checkInTimer = null;
}

function guardianCodeword() {
  return String(guardianElement('guardianCodeword')?.value || '').trim().toLowerCase();
}

function isGuardianEmergency(message) {
  const value = message.toLowerCase();
  const codeword = guardianCodeword();
  const emergencyPhrases = [
    'help me', 'save me', 'sos', 'emergency', 'call police', 'bring the red umbrella', 'red umbrella',
    'உதவி', 'காப்பாத்து', 'போலீஸ்', 'அவசரம்'
  ];
  return Boolean((codeword && value.includes(codeword)) || emergencyPhrases.some(phrase => value.includes(phrase)));
}

function isGuardianThreat(message) {
  return /(follow|stalk|behind me|unsafe|scared|stranger|someone|pinnaadi|bayama|threat|wrong route|stop following|பின்னாடி|பயமா|தொடர்ந்து|யாரோ)/i.test(message);
}

function isGuardianLocationReply(message) {
  return /(main road|blue building|bakery|street|shop|road|corner|bridge|signal|junction|building|near|இருக்க|ரோடு|கடை|கட்டிடம்|பக்கத்தில்)/i.test(message);
}

function guardianReplyFor(message) {
  const copy = guardianCopy();
  if (isGuardianThreat(message)) {
    const reply = copy.threat[guardianState.dialogueIndex % copy.threat.length];
    guardianState.dialogueIndex += 1;
    return reply;
  }
  if (isGuardianLocationReply(message)) return copy.location;
  const reply = copy.calm[guardianState.dialogueIndex % copy.calm.length];
  guardianState.dialogueIndex += 1;
  return reply;
}

function handleGuardianInput(message) {
  const text = String(message || '').trim();
  if (!text || guardianState.emergencyTriggered) return;

  appendGuardianMessage('user', text);
  if (isGuardianEmergency(text)) {
    triggerGuardianEmergency('Safety codeword or emergency request detected');
    return;
  }
  sayAsGuardian(guardianReplyFor(text));
}

function guardianRelayPayload(reason) {
  return {
    flag: '[TRIGGER_EMERGENCY_SOS]',
    source: 'guardian-ai',
    reason,
    language: guardianLanguage(),
    location: guardianState.location,
    locationLabel: guardianState.locationLabel,
    transcript: guardianState.transcript.slice(-6),
    createdAt: Date.now(),
  };
}

function triggerGuardianEmergency(reason) {
  if (guardianState.emergencyTriggered) return;

  guardianState.emergencyTriggered = true;
  guardianState.active = false;
  stopGuardianRecognition();
  stopLoudMonitoring();
  stopGuardianLocationTracking();
  stopGuardianCheckIns();
  updateGuardianStatus('Emergency relay started', 'Opening SafeHer SOS with the Guardian trigger reason and your latest location.', true);
  guardianElement('guardianCallStage')?.classList.add('is-emergency');
  guardianElement('guardianStartBtn').disabled = true;
  guardianElement('guardianStopBtn').disabled = true;
  guardianElement('guardianSosBtn').disabled = true;

  const payload = guardianRelayPayload(reason);
  try {
    localStorage.setItem(GUARDIAN_PENDING_SOS_KEY, JSON.stringify(payload));
  } catch (error) {}
  window.dispatchEvent(new CustomEvent(GUARDIAN_EVENT_NAME, { detail: payload }));

  const systemFlag = guardianElement('guardianSystemFlag');
  if (systemFlag) systemFlag.textContent = payload.flag;
  const alert = guardianElement('guardianAlertBanner');
  const alertMessage = guardianElement('guardianAlertMessage');
  if (alertMessage) alertMessage.textContent = `${reason}. Opening SafeHer SOS now.`;
  if (alert) alert.hidden = false;

  sayAsGuardian(guardianCopy().emergency);
  window.setTimeout(() => {
    window.location.href = 'sos.html?guardian=1';
  }, 1250);
}

function startGuardianEscort() {
  if (guardianState.active || guardianState.emergencyTriggered) return;
  guardianState.active = true;
  guardianElement('guardianStartBtn').disabled = true;
  guardianElement('guardianStopBtn').disabled = false;
  updateGuardianStatus('Escort active', 'Guardian is listening for a short check-in, your codeword, or a direct request for help.', true);
  detectGuardianLocation();
  startGuardianRecognition();
  startLoudMonitoring();
  startGuardianCheckIns();
  sayAsGuardian(guardianCopy().greeting);
}

function stopGuardianEscort() {
  if (!guardianState.active || guardianState.emergencyTriggered) return;
  guardianState.active = false;
  stopGuardianRecognition();
  stopLoudMonitoring();
  stopGuardianLocationTracking();
  stopGuardianCheckIns();
  window.speechSynthesis?.cancel();
  guardianState.isSpeaking = false;
  guardianElement('guardianStartBtn').disabled = false;
  guardianElement('guardianStopBtn').disabled = true;
  updateGuardianStatus('Guardian is ready', 'Start your escort whenever you want someone on the line.', false);
  sayAsGuardian(guardianCopy().stopped);
}

function bindGuardianControls() {
  guardianElement('guardianStartBtn')?.addEventListener('click', startGuardianEscort);
  guardianElement('guardianStopBtn')?.addEventListener('click', stopGuardianEscort);
  guardianElement('guardianSosBtn')?.addEventListener('click', () => triggerGuardianEmergency('Manual Guardian emergency relay'));
  guardianElement('guardianSendBtn')?.addEventListener('click', () => {
    const input = guardianElement('guardianTextInput');
    const value = input?.value.trim();
    if (!value) return;
    input.value = '';
    handleGuardianInput(value);
  });
  guardianElement('guardianTextInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') guardianElement('guardianSendBtn')?.click();
  });
  guardianElement('guardianLoudToggle')?.addEventListener('change', event => {
    if (!guardianState.active) return;
    if (event.target.checked) startLoudMonitoring();
    else stopLoudMonitoring();
  });
  guardianElement('guardianLanguage')?.addEventListener('change', () => {
    if (!guardianState.active) return;
    stopGuardianRecognition();
    startGuardianRecognition();
    sayAsGuardian(guardianCopy().greeting);
  });
}

document.addEventListener('DOMContentLoaded', bindGuardianControls);
window.addEventListener('beforeunload', () => {
  stopGuardianRecognition();
  stopLoudMonitoring();
  stopGuardianLocationTracking();
  stopGuardianCheckIns();
});
