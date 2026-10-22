let jsQRLoadPromise;

function loadJsQR() {
  if (typeof window.jsQR === 'function') return Promise.resolve(window.jsQR);
  if (jsQRLoadPromise) return jsQRLoadPromise;

  jsQRLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    script.async = true;
    script.dataset.furgoQrDecoder = 'true';
    script.onload = () => typeof window.jsQR === 'function'
      ? resolve(window.jsQR)
      : reject(new Error('The QR decoder did not load.'));
    script.onerror = () => reject(new Error('The QR decoder could not be downloaded.'));
    document.head.append(script);
  }).catch((error) => {
    jsQRLoadPromise = null;
    throw error;
  });

  return jsQRLoadPromise;
}

// Starts a camera QR scan using BarcodeDetector when available and jsQR on browsers without it.
export async function startQRScanner({ video, onCode, onStatus = () => {}, shouldRun = () => true }) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access requires HTTPS and a browser that supports camera input.');
  }

  let detector = null;
  if ('BarcodeDetector' in window) {
    try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { /* Use the QR decoder fallback. */ }
  }

  let decoder = null;
  if (!detector) onStatus('Starting camera and loading QR scanner…');

  if (!shouldRun()) return { stop() {} };
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  if (!shouldRun()) {
    stream.getTracks().forEach((track) => track.stop());
    return { stop() {} };
  }
  let active = true;
  let timer = null;
  const stop = () => {
    if (!active) return;
    active = false;
    window.clearTimeout(timer);
    stream.getTracks().forEach((track) => track.stop());
    video.pause();
    video.srcObject = null;
    video.hidden = true;
  };

  try {
    video.srcObject = stream;
    video.hidden = false;
    await video.play();
    if (!shouldRun()) { stop(); return { stop }; }
    if (!detector) {
      try {
        decoder = await loadJsQR();
      } catch {
        throw new Error('The QR scanner could not load. Check your internet connection or enter the code manually.');
      }
    }
    onStatus('Point the camera at the customer’s QR code.');

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const scanFrame = async () => {
      if (!active || !shouldRun() || !video.isConnected) { stop(); return; }
      try {
        let rawValue = '';
        if (detector) {
          try {
            const codes = await detector.detect(video);
            rawValue = codes.find((item) => item.rawValue)?.rawValue || '';
          } catch {
            detector = null;
            decoder ||= await loadJsQR();
          }
        }
        if (!rawValue && !detector && decoder && context && video.videoWidth && video.videoHeight) {
          const maxWidth = 720;
          const scale = Math.min(1, maxWidth / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = context.getImageData(0, 0, canvas.width, canvas.height);
          rawValue = decoder(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' })?.data || '';
        }
        if (rawValue && onCode(rawValue) === true) { stop(); return; }
      } catch (error) {
        stop();
        onStatus(error?.message || 'QR scanning stopped. Enter the code manually.');
        return;
      }
      if (active) timer = window.setTimeout(scanFrame, 220);
    };
    scanFrame();
    return { stop };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    video.hidden = true;
    throw error;
  }
}
