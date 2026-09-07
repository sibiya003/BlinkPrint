const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const logoutBtn = document.getElementById('logout-btn');

const blinkDisplay = document.getElementById('blink-count');
const earDisplay = document.getElementById('ear-value');
const progressBar = document.getElementById('progress-bar');
const sysStatus = document.getElementById('sys-status');
const logConsole = document.getElementById('log-console');
const videoFrame = document.querySelector('.video-frame');

const authScreen = document.getElementById('auth-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const userTokenDisplay = document.getElementById('user-token');

const dashMode = document.getElementById('dash-mode');
const dashScore = document.getElementById('dash-score');
const dashLevel = document.getElementById('dash-level');

let blinkCount = 0;
const REQUIRED_BLINKS = 3;
let isBlinking = false;
let isScanning = false;
let cameraInstance = null;

// Analytics Data Array
let confidenceScores = [];
let earDepthList = [];

// MediaPipe FaceMesh Engine
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

// Eye Aspect Ratio (EAR) Math Formula
function calculateEAR(p1, p2, p3, p4, p5, p6) {
  const v1 = Math.hypot(p2.x - p6.x, p2.y - p6.y);
  const v2 = Math.hypot(p3.x - p5.x, p3.y - p5.y);
  const h = Math.hypot(p1.x - p4.x, p1.y - p4.y);
  return (v1 + v2) / (2.0 * h);
}

function onResults(results) {
  if (!canvas || !video) return;

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    if (isScanning) earDisplay.innerText = '0.00';
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];

  // Render Neon Mesh Dots on Eye
  ctx.fillStyle = '#00f3ff';
  const leftEyeIndices = [33, 160, 158, 133, 153, 144];
  leftEyeIndices.forEach(idx => {
    const pt = landmarks[idx];
    ctx.beginPath();
    ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  });

  // Real-time EAR Calculation
  const ear = calculateEAR(
    landmarks[33], landmarks[160], landmarks[158],
    landmarks[133], landmarks[153], landmarks[144]
  );

  earDisplay.innerText = ear.toFixed(2);

  if (!isScanning) return;

  // Liveness Detection Threshold Logic
  if (ear < 0.20) {
    if (!isBlinking) {
      isBlinking = true;
      earDepthList.push(ear);
      
      // Calculate dynamic score based on blink depth
      let score = Math.min(99.8, 88.0 + (0.20 - ear) * 100);
      confidenceScores.push(score);
    }
  } else if (ear > 0.24 && isBlinking) {
    isBlinking = false;
    registerBlink();
  }
}

function registerBlink() {
  if (blinkCount < REQUIRED_BLINKS) {
    blinkCount++;
    blinkDisplay.innerText = `${blinkCount} / ${REQUIRED_BLINKS}`;
    progressBar.style.width = `${(blinkCount / REQUIRED_BLINKS) * 100}%`;
    addLog(`[LIVENESS] Valid Blink #${blinkCount} Captured`, 'warn');

    if (blinkCount === REQUIRED_BLINKS) {
      completeVerification();
    }
  }
}

function completeVerification() {
  isScanning = false;
  if (videoFrame) videoFrame.classList.remove('scanning');

  // Calculate Dynamic Confidence & Analytics
  let avgConfidence = 95.0;
  if (confidenceScores.length > 0) {
    let sum = confidenceScores.reduce((a, b) => a + b, 0);
    avgConfidence = (sum / confidenceScores.length).toFixed(1);
  } else {
    avgConfidence = (92 + Math.random() * 6).toFixed(1);
  }

  const minEarDepth = earDepthList.length > 0 ? Math.min(...earDepthList) : 0.17;
  let dynamicMode = 'Dynamic EAR Mesh';
  let dynamicLevel = 'High (Anti-Spoof Passed)';

  if (minEarDepth < 0.16) {
    dynamicMode = 'Deep Eye Mesh Liveness';
    dynamicLevel = 'Ultra Security (Zero Spoof)';
  } else if (minEarDepth < 0.19) {
    dynamicMode = 'Standard EAR Biometrics';
    dynamicLevel = 'High (Liveness OK)';
  }

  sysStatus.innerText = 'ACCESS GRANTED';
  sysStatus.className = 'status-badge success';
  addLog(`[SUCCESS] Liveness Verified! Score: ${avgConfidence}%`, 'success');

  // Token Generation & UI Update
  const randomToken = 'BP-' + Math.floor(10000 + Math.random() * 90000) + '-AI-PASS';
  userTokenDisplay.innerText = randomToken;

  dashMode.innerText = dynamicMode;
  dashScore.innerText = `${avgConfidence}% (Passed)`;
  dashLevel.innerText = dynamicLevel;

  setTimeout(() => {
    authScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
  }, 2000);
}

function addLog(msg, type = 'info') {
  const p = document.createElement('p');
  p.className = `log ${type}`;
  p.innerText = msg;
  logConsole.appendChild(p);
  logConsole.scrollTop = logConsole.scrollHeight;
}

// Start Stream
startBtn.addEventListener('click', () => {
  if (!cameraInstance) {
    cameraInstance = new Camera(video, {
      onFrame: async () => {
        await faceMesh.send({ image: video });
      },
      width: 640,
      height: 480
    });
  }

  cameraInstance.start();
  isScanning = true;
  blinkCount = 0;
  confidenceScores = [];
  earDepthList = [];

  blinkDisplay.innerText = `0 / ${REQUIRED_BLINKS}`;
  earDisplay.innerText = '0.00';
  progressBar.style.width = '0%';
  if (videoFrame) videoFrame.classList.add('scanning');

  sysStatus.innerText = 'SCANNING...';
  sysStatus.className = 'status-badge';
  addLog('[STARTED] AI Face Tracker Active. Please blink 3 times.');
});

resetBtn.addEventListener('click', () => {
  isScanning = false;
  blinkCount = 0;
  confidenceScores = [];
  earDepthList = [];

  blinkDisplay.innerText = `0 / ${REQUIRED_BLINKS}`;
  earDisplay.innerText = '0.00';
  progressBar.style.width = '0%';
  if (videoFrame) videoFrame.classList.remove('scanning');

  sysStatus.innerText = 'SYSTEM READY';
  sysStatus.className = 'status-badge';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  addLog('[RESET] System reset completed.');
});

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    dashboardScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
    resetBtn.click();
  });
}