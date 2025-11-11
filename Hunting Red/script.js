class ColorDetector {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.indicator = document.getElementById('detectionIndicator');
        this.statusText = document.getElementById('statusText');
        this.fpsText = document.getElementById('fpsText');
        
        this.stream = null;
        this.isRunning = false;
        this.animationFrame = null;
        this.frameCount = 0;
        this.lastFpsTime = Date.now();
        
        // Color detection settings
        this.targetColor = { r: 255, g: 0, b: 0 }; // Default red
        this.hueTolerance = 20; // Tighter tolerance
        this.saturationMin = 0.4; // Higher saturation requirement
        this.brightnessMin = 0.3; // Higher brightness requirement
        this.threshold = 0.01; // 1% of frame
        
        this.setupEventListeners();
        this.updateSettings();
    }
    
    setupEventListeners() {
        document.getElementById('startBtn').addEventListener('click', () => this.startCamera());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopCamera());
        
        document.getElementById('targetColor').addEventListener('input', (e) => {
            const hex = e.target.value;
            this.targetColor = this.hexToRgb(hex);
            this.updateSettings();
        });
        
        document.getElementById('hueTolerance').addEventListener('input', (e) => {
            this.hueTolerance = parseInt(e.target.value);
            document.getElementById('hueToleranceValue').textContent = this.hueTolerance;
        });
        
        document.getElementById('saturationMin').addEventListener('input', (e) => {
            this.saturationMin = parseInt(e.target.value) / 100;
            document.getElementById('saturationMinValue').textContent = Math.round(this.saturationMin * 100);
        });
        
        document.getElementById('brightnessMin').addEventListener('input', (e) => {
            this.brightnessMin = parseInt(e.target.value) / 100;
            document.getElementById('brightnessMinValue').textContent = Math.round(this.brightnessMin * 100);
        });
        
        document.getElementById('threshold').addEventListener('input', (e) => {
            this.threshold = parseInt(e.target.value) / 100;
            document.getElementById('thresholdValue').textContent = Math.round(this.threshold * 100);
        });
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 0, b: 0 };
    }
    
    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const diff = max - min;
        
        let h = 0;
        if (diff !== 0) {
            if (max === r) {
                h = ((g - b) / diff) % 6;
            } else if (max === g) {
                h = (b - r) / diff + 2;
            } else {
                h = (r - g) / diff + 4;
            }
        }
        h = h * 60;
        if (h < 0) h += 360;
        
        const s = max === 0 ? 0 : diff / max;
        const v = max;
        
        return { h, s, v };
    }
    
    updateSettings() {
        const targetHsv = this.rgbToHsv(this.targetColor.r, this.targetColor.g, this.targetColor.b);
        this.targetHue = targetHsv.h;
    }
    
    async startCamera() {
        try {
            this.statusText.textContent = 'Requesting camera access...';
            
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // Use back camera
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            
            this.video.srcObject = this.stream;
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    resolve();
                };
            });
            
            this.isRunning = true;
            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            this.statusText.textContent = 'Camera active - Detecting colors...';
            
            this.detectColors();
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.statusText.textContent = 'Error: ' + error.message;
            alert('Could not access camera. Please check permissions.');
        }
    }
    
    stopCamera() {
        this.isRunning = false;
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        this.video.srcObject = null;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        this.statusText.textContent = 'Camera stopped';
        
        this.indicator.classList.add('hidden');
    }
    
    detectColors() {
        if (!this.isRunning) return;
        
        // Draw current frame to canvas
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        // Get image data
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        
        // Create a mask for detected pixels
        const width = this.canvas.width;
        const height = this.canvas.height;
        const mask = new Uint8Array(width * height);
        let matchingPixels = 0;
        let totalSampled = 0;
        
        // First pass: detect matches and convert to grayscale
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            const hsv = this.rgbToHsv(r, g, b);
            
            // Check if color matches target range
            // Handle hue wrapping (red is near 0 and 360)
            let hueDiff = Math.abs(hsv.h - this.targetHue);
            if (hueDiff > 180) {
                hueDiff = 360 - hueDiff;
            }
            
            // For red specifically, also check the wrap-around case
            let isMatch = false;
            if (this.targetHue < 30 || this.targetHue > 330) {
                // Red is near the wrap-around point
                const altHue = this.targetHue > 180 ? this.targetHue - 360 : this.targetHue + 360;
                const altDiff = Math.abs(hsv.h - altHue);
                isMatch = (hueDiff <= this.hueTolerance || altDiff <= this.hueTolerance) &&
                         hsv.s >= this.saturationMin &&
                         hsv.v >= this.brightnessMin;
            } else {
                isMatch = hueDiff <= this.hueTolerance &&
                         hsv.s >= this.saturationMin &&
                         hsv.v >= this.brightnessMin;
            }
            
            const pixelIndex = i / 4;
            const x = pixelIndex % width;
            const y = Math.floor(pixelIndex / width);
            
            if (isMatch) {
                matchingPixels++;
                mask[y * width + x] = 1;
                // Keep original color for red areas
            } else {
                // Convert to grayscale for non-matching areas
                const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                data[i] = gray;     // R
                data[i + 1] = gray; // G
                data[i + 2] = gray; // B
                mask[y * width + x] = 0;
            }
            
            totalSampled++;
        }
        
        // Put modified image data back to canvas
        this.ctx.putImageData(imageData, 0, 0);
        
        // Draw outline around detected areas (simplified approach)
        this.ctx.strokeStyle = '#ff0000';
        this.ctx.lineWidth = 2;
        this.ctx.shadowColor = '#ff0000';
        this.ctx.shadowBlur = 5;
        
        // Draw outlines by checking edges
        for (let y = 0; y < height; y += 2) { // Sample every 2nd row for performance
            for (let x = 0; x < width; x += 2) { // Sample every 2nd column
                const idx = y * width + x;
                if (mask[idx] === 1) {
                    // Check if this is an edge pixel
                    const isEdge = 
                        (x === 0 || mask[y * width + (x - 1)] === 0) ||
                        (x === width - 1 || mask[y * width + (x + 1)] === 0) ||
                        (y === 0 || mask[(y - 1) * width + x] === 0) ||
                        (y === height - 1 || mask[(y + 1) * width + x] === 0);
                    
                    if (isEdge) {
                        this.ctx.strokeRect(x - 1, y - 1, 3, 3);
                    }
                }
            }
        }
        
        this.ctx.shadowBlur = 0;
        
        const matchPercentage = matchingPixels / totalSampled;
        const isDetected = matchPercentage >= this.threshold;
        
        // Update indicator only (no overlay message)
        if (isDetected) {
            this.indicator.classList.remove('hidden');
        } else {
            this.indicator.classList.add('hidden');
        }
        
        // Calculate FPS
        this.frameCount++;
        const now = Date.now();
        if (now - this.lastFpsTime >= 1000) {
            const fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsTime = now;
            this.fpsText.textContent = `FPS: ${fps}`;
        }
        
        // Continue detection loop
        this.animationFrame = requestAnimationFrame(() => this.detectColors());
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ColorDetector();
});

// Register service worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js', { scope: './' })
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.log('Service Worker registration failed', err));
    });
}

