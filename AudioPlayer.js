class AudioPlayer extends HTMLElement {
    constructor() {
        super();
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
        
        // Initialize state
        this.state = {
            backgroundImage: null,
            currentTitle: 'Track Title',
            isImageLoaded: false
        };

        // Add recording state
        this.recordingState = {
            mediaRecorder: null,
            recordedChunks: [],
            isRecording: false,
            recordingCanvas: null,
            recordingCtx: null
        };

        this.attachShadow({ mode: 'open' });
        
        const config = this.getAttribute('config') ? JSON.parse(this.getAttribute('config')) : {};
        const styling = config.styling || {};
        const controls = styling.controls || {};
        const slider = styling.slider || {};

        this.shadowRoot.innerHTML = `
            <style>
                :host { 
                    display: block; 
                    max-width: 600px; 
                }
                .player-wrapper { 
                    display: flex;
                    flex-direction: column;
                    background: #000;
                    border-radius: 8px;
                    overflow: hidden;
                }
                canvas { 
                    width: 100%;
                    aspect-ratio: 16/9;
                    background: #000;
                    display: block;
                }
                .controls {
                    position: relative;  /* Changed from absolute */
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 15px;
                    background: rgba(0,0,0,0.8);
                    backdrop-filter: blur(10px);
                }
                ul { list-style: none; padding: 0; }
                li { cursor: pointer; padding: 4px; }
                li.active { font-weight: bold; }
                .lcd-display { text-align: center; margin-top: 10px; }
                .playback-controls {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-left: 16px;
                }
                .control-button {
                    background: none;
                    border: none;
                    width: 24px;
                    height: 24px;
                    padding: 0;
                    cursor: pointer;
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center;
                }
                .control-button svg { display: none; }
                .play-button { background-image: url('${controls.playIcon || ''}'); }
                .play-button.playing { background-image: url('${controls.pauseIcon || ''}'); }
                .prev-10s { background-image: url('${controls.prevIcon || ''}'); }
                .next-10s { background-image: url('${controls.nextIcon || ''}'); }
                .volume-button { background-image: url('${controls.volumeIcon || ''}'); }
                .volume-button.muted { background-image: url('${controls.muteIcon || ''}'); }
                
                .time-slider, .volume-slider {
                    -webkit-appearance: none;
                    background: ${slider.background || '#444'};
                    border-radius: 2px;
                    height: ${slider.height || '4px'};
                }
                .time-slider::-webkit-slider-thumb,
                .volume-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: ${slider.thumbSize || '12px'};
                    height: ${slider.thumbSize || '12px'};
                    border-radius: 50%;
                    background: ${slider.thumbColor || 'white'};
                    cursor: pointer;
                    border: none;
                }
                .time-slider::-moz-range-thumb,
                .volume-slider::-moz-range-thumb {
                    width: ${slider.thumbSize || '12px'};
                    height: ${slider.thumbSize || '12px'};
                    border-radius: 50%;
                    background: ${slider.thumbColor || 'white'};
                    cursor: pointer;
                    border: none;
                }
                .playback-rate {
                    background-image: url('${controls.speedIcon || ''}');
                    padding-left: 20px;
                    background-size: 16px;
                    background-repeat: no-repeat;
                    background-position: left center;
                }
                .time-display {
                    min-width: 90px;
                    color: white;
                    font-family: monospace;
                    font-size: 12px;
                    text-align: center;
                }
                .time-slider {
                    flex-grow: 1;
                }
                .volume-control {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    margin-left: auto;
                }
                .record-control {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    margin-left: 10px;
                    color: white;
                }
                .record-checkbox {
                    width: 16px;
                    height: 16px;
                    accent-color: #ff4444;
                }
                .record-label {
                    font-size: 12px;
                    user-select: none;
                    cursor: pointer;
                }
            </style>
            <div class="player-wrapper">
                <canvas></canvas>
                <div class="controls">
                    <button class="control-button play-button" title="Play/Pause"></button>
                    <div class="time-display">0:00 / 0:00</div>
                    <input type="range" class="time-slider" min="0" max="100" value="0">
                    <div class="volume-control">
                        <button class="control-button volume-button"></button>
                        <input type="range" class="volume-slider" min="0" max="100" value="100">
                    </div>
                    <div class="playback-controls">
                        <button class="control-button prev-10s" title="Rewind 10s"></button>
                        <span class="playback-rate" title="Playback Speed">1.0x</span>
                        <button class="control-button next-10s" title="Forward 10s"></button>
                    </div>
                    <div class="record-control">
                        <input type="checkbox" class="record-checkbox" id="recordToggle">
                        <label for="recordToggle" class="record-label">Record</label>
                    </div>
                </div>
            </div>
            <audio controls src=""></audio>
            <ul id="playlist"></ul>
            <div class="lcd-display">
                <span class="lcd">Track Title</span>
            </div>
        `;
    }

    async loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                this.state.backgroundImage = img;
                this.state.isImageLoaded = true;
                resolve(img);
            };
            img.onerror = reject;
            img.src = src;
        });
    }

    setupRecordingCanvas() {
        // Create high-resolution canvas for recording
        const recordingCanvas = document.createElement('canvas');
        recordingCanvas.width = 3840;  // 4K width
        recordingCanvas.height = 2160; // 4K height
        this.recordingState.recordingCanvas = recordingCanvas;
        this.recordingState.recordingCtx = recordingCanvas.getContext('2d');
    }

    renderToCanvas(ctx, width, height) {
        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Calculate base scale relative to 1080p
        const baseWidth = 1920;
        const scale = width / baseWidth;

        // Draw background
        if (this.state.backgroundImage && this.state.isImageLoaded) {
            // Calculate aspect ratio preserving dimensions
            const imgAspect = this.state.backgroundImage.width / this.state.backgroundImage.height;
            const canvasAspect = width / height;
            let drawWidth = width;
            let drawHeight = height;
            let offsetX = 0;
            let offsetY = 0;

            if (canvasAspect > imgAspect) {
                drawHeight = width / imgAspect;
                offsetY = (height - drawHeight) / 2;
            } else {
                drawWidth = height * imgAspect;
                offsetX = (width - drawWidth) / 2;
            }

            // Draw and dim background
            ctx.drawImage(this.state.backgroundImage, offsetX, offsetY, drawWidth, drawHeight);
            ctx.fillStyle = `rgba(0, 0, 0, ${this.vizConfig?.dim || 0.3})`;
            ctx.fillRect(0, 0, width, height);
        }

        // Draw visualization if active
        if (this.analyser) {
            ctx.save();
            ctx.scale(scale, scale);
            this.renderVisualization(ctx, width/scale, height/scale);
            ctx.restore();
        }

        // Draw title with proper 4K scaling
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Scale font size based on resolution
        const fontSize = Math.round(width * 0.04); // Proportional font size
        ctx.font = `bold ${fontSize}px Arial`;
        
        // Scale stroke width based on resolution
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = Math.max(4, Math.round(4 * scale));
        
        // Position text
        const textX = width / 2;
        const textY = height * 0.2;
        
        // Draw text with scaled properties
        ctx.strokeText(this.state.currentTitle, textX, textY);
        ctx.fillStyle = 'white';
        ctx.fillText(this.state.currentTitle, textX, textY);
        
        ctx.restore();
    }

    renderCanvas() {
        const canvas = this.shadowRoot.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        this.renderToCanvas(ctx, canvas.width, canvas.height);

        // If recording, also render to recording canvas
        if (this.recordingState.isRecording && this.recordingState.recordingCanvas) {
            this.renderToCanvas(
                this.recordingState.recordingCtx,
                this.recordingState.recordingCanvas.width,
                this.recordingState.recordingCanvas.height
            );
        }
    }

    async setupAudioNodes(audio) {
        if (this.source) {
            this.source.disconnect();
        }

        // Create and configure analyzer with better timing settings
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048; // Increased for better resolution
        this.analyser.smoothingTimeConstant = 0.85; // Smoother transitions
        this.analyser.minDecibels = -90;
        this.analyser.maxDecibels = -10;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        this.source = this.audioContext.createMediaElementSource(audio);
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        
        return this.analyser.frequencyBinCount;
    }

    getFrequencyBands(barCount) {
        // Set frequency range (50Hz - 16kHz)
        const minFreq = 50;
        const maxFreq = 16000;
        const sampleRate = this.audioContext.sampleRate;
        const nyquist = sampleRate / 2;
        const bands = [];

        // Calculate frequencies for each band using logarithmic scale
        for (let i = 0; i <= barCount; i++) {
            const freq = minFreq * Math.pow(maxFreq / minFreq, i / barCount);
            const binIndex = Math.round((freq / nyquist) * this.analyser.frequencyBinCount);
            bands.push(Math.min(binIndex, this.analyser.frequencyBinCount - 1));
        }

        return bands;
    }

    renderVisualization(ctx, width, height) {
        if (!this.analyser || !this.dataArray) return;

        this.analyser.getByteFrequencyData(this.dataArray);
        const barCount = this.vizConfig?.barCount || Math.min(64, this.analyser.frequencyBinCount);
        const barSpacing = this.vizConfig?.barSpacing || 2;
        const barColor = this.vizConfig?.color || 'lime';
        const scaleFactor = this.vizConfig?.scale || 1;
        const fallSpeed = this.vizConfig?.fallSpeed || 2;
        const peakHoldTime = this.vizConfig?.peakHoldTime || 30;
        const peakDecay = this.vizConfig?.peakDecay || 0.5;

        // Get frequency band boundaries
        if (!this.frequencyBands || this.frequencyBands.length !== barCount + 1) {
            this.frequencyBands = this.getFrequencyBands(barCount);
        }

        // Create pattern once
        if (!this.dotPattern) {
            const patternCanvas = document.createElement('canvas');
            patternCanvas.width = 4;
            patternCanvas.height = 4;
            const pCtx = patternCanvas.getContext('2d');
            pCtx.fillStyle = barColor;
            pCtx.fillRect(1, 1, 2, 2);
            this.dotPattern = ctx.createPattern(patternCanvas, 'repeat');
        }

        ctx.shadowColor = barColor;
        ctx.shadowBlur = 10;
        ctx.fillStyle = this.dotPattern;
        ctx.strokeStyle = barColor;

        // Calculate dimensions
        const totalSpacing = (barCount + 1) * barSpacing;
        const barWidth = Math.floor((width - totalSpacing) / barCount);
        const startX = Math.floor((width - (barCount * (barWidth + barSpacing))) / 2);
        const centerY = Math.floor(height / 2);

        // Initialize arrays if needed
        if (!this.currentBarHeights || this.currentBarHeights.length !== barCount) {
            this.currentBarHeights = new Array(barCount).fill(0);
            this.peakHeights = new Array(barCount).fill(0);
            this.peakHoldCounters = new Array(barCount).fill(0);
        }

        // Process frequency data with logarithmic bands
        for (let i = 0; i < barCount; i++) {
            let sum = 0;
            const startBin = this.frequencyBands[i];
            const endBin = this.frequencyBands[i + 1];
            const binCount = endBin - startBin;
            
            // Average the frequencies in this band
            for (let bin = startBin; bin < endBin; bin++) {
                sum += this.dataArray[bin];
            }
            
            const value = binCount > 0 ? sum / binCount : 0;
            const currentHeight = Math.floor((value / 255) * (height / 2) * scaleFactor);

            // Update heights
            if (currentHeight < this.currentBarHeights[i]) {
                this.currentBarHeights[i] = Math.max(currentHeight, this.currentBarHeights[i] - fallSpeed);
            } else {
                this.currentBarHeights[i] = currentHeight;
            }

            // Update peaks
            if (currentHeight >= this.peakHeights[i]) {
                this.peakHeights[i] = currentHeight;
                this.peakHoldCounters[i] = peakHoldTime;
            } else {
                if (this.peakHoldCounters[i] > 0) {
                    this.peakHoldCounters[i]--;
                } else {
                    this.peakHeights[i] = Math.max(0, this.peakHeights[i] - peakDecay);
                }
            }

            // Draw bar
            const x = startX + (i * (barWidth + barSpacing));
            
            // Upper bar
            ctx.fillRect(x, centerY - this.currentBarHeights[i], barWidth, this.currentBarHeights[i]);
            // Lower bar
            ctx.fillRect(x, centerY, barWidth, this.currentBarHeights[i]);

            // Draw peaks
            ctx.setLineDash([2, 2]);
            
            // Upper peak
            ctx.beginPath();
            ctx.moveTo(x, centerY - this.peakHeights[i]);
            ctx.lineTo(x + barWidth, centerY - this.peakHeights[i]);
            ctx.stroke();
            
            // Lower peak
            ctx.beginPath();
            ctx.moveTo(x, centerY + this.peakHeights[i]);
            ctx.lineTo(x + barWidth, centerY + this.peakHeights[i]);
            ctx.stroke();
        }

        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
    }

    async startRecording(canvas, audio) {
        // Check if recording is enabled before starting
        const recordToggle = this.shadowRoot.querySelector('#recordToggle');
        if (!recordToggle.checked) return;

        try {
            // Setup high-res recording canvas if not already created
            if (!this.recordingState.recordingCanvas) {
                this.setupRecordingCanvas();
            }

            // Use recording canvas for stream
            const stream = this.recordingState.recordingCanvas.captureStream(60); // 60 FPS
            
            if (this.audioContext && this.source) {
                const audioDestination = this.audioContext.createMediaStreamDestination();
                this.source.connect(audioDestination);
                stream.addTrack(audioDestination.stream.getAudioTracks()[0]);
            }

            this.recordingState.recordedChunks = [];
            this.recordingState.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 20000000 // 20 Mbps for high quality
            });

            this.recordingState.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordingState.recordedChunks.push(event.data);
                }
            };

            this.recordingState.mediaRecorder.onstop = () => this.saveRecording();

            this.recordingState.mediaRecorder.start();
            this.recordingState.isRecording = true;
            console.log('Recording started');
        } catch (error) {
            console.error('Failed to start recording:', error);
        }
    }

    stopRecording() {
        if (this.recordingState.mediaRecorder?.state === 'recording') {
            this.recordingState.mediaRecorder.stop();
            this.recordingState.isRecording = false;
            console.log('Recording stopped');
        }
    }

    saveRecording() {
        if (this.recordingState.recordedChunks.length === 0) return;

        const blob = new Blob(this.recordingState.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `visualization-${timestamp}.webm`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
        this.recordingState.recordedChunks = [];
    }

    connectedCallback() {
        const audio = this.shadowRoot.querySelector('audio');
        const canvas = this.shadowRoot.querySelector('canvas');
        const playlistContainer = this.shadowRoot.querySelector('#playlist');
        const titleText = this.shadowRoot.querySelector('.title-text');
        const ctx = canvas.getContext('2d');
        const playButton = this.shadowRoot.querySelector('.play-button');
        const volumeButton = this.shadowRoot.querySelector('.volume-button');

        // Updated: Parse config as an object with "tracks" and "visualization" settings.
        let playlist = [];
        let vizConfig = {};
        const configAttr = this.getAttribute('config');
        if (configAttr) {
            try {
                const parsedConfig = JSON.parse(configAttr);
                playlist = Array.isArray(parsedConfig.tracks) ? parsedConfig.tracks : [];
                vizConfig = parsedConfig.visualization || {};
            } catch (e) {
                console.error('Invalid JSON in "config" attribute:', e);
            }
        }
        // Set default audio source, background image and title from first track if available.
        if (playlist.length && playlist[0].src) {
            audio.src = playlist[0].src;
            if (playlist[0].image) { this.loadImage(playlist[0].image); }
            if (playlist[0].title) { this.state.currentTitle = playlist[0].title; }
        } else {
            audio.src = this.getAttribute('src') || "";
        }
        // Apply dim setting to background if provided
        if (vizConfig.dim !== undefined) {
            this.vizConfig = vizConfig;
        }

        // Initialize audio context only on user interaction to comply with autoplay policies
        let audioNodesInitialized = false;
        let renderFrameId = null;

        const initializeAudioNodes = async () => {
            if (!audioNodesInitialized) {
                const bufferLength = await this.setupAudioNodes(audio);
                audioNodesInitialized = true;
                console.log('Audio nodes initialized, starting visualization');
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
        };

        // Render playlist list and update title overlay on track change.
        const renderPlaylist = () => {
            playlistContainer.innerHTML = '';
            playlist.forEach((item, index) => {
                const li = document.createElement('li');
                li.textContent = item.title || item.src || `Track ${index + 1}`;
                li.className = index === 0 ? 'active' : '';
                li.addEventListener('click', async () => {
                    try {
                        await initializeAudioNodes();
                        
                        [...playlistContainer.children].forEach(el => el.classList.remove('active'));
                        li.classList.add('active');
                        
                        console.log('Loading track:', item.src);
                        audio.src = item.src;
                        if (item.image) { await this.loadImage(item.image); }
                        if (item.title) { this.state.currentTitle = item.title; }
                        
                        await audio.play();
                    } catch (error) {
                        console.error('Playback failed:', error);
                        alert('Could not play audio. Please check if the audio file exists and is accessible.');
                    }
                });
                playlistContainer.appendChild(li);
            });
        };
        renderPlaylist();

        // Add audio play event listener to ensure visualization starts
        audio.addEventListener('play', async () => {
            if (!audioNodesInitialized) {
                await initializeAudioNodes();
            }
            // Start recording when playing
            if (!this.recordingState.isRecording) {
                this.startRecording(canvas, audio);
            }
        });

        // Clean up in disconnectedCallback
        this.disconnectedCallback = () => {
            if (renderFrameId) {
                cancelAnimationFrame(renderFrameId);
            }
            if (this.source) {
                this.source.disconnect();
            }
            if (this.audioContext && this.audioContext.state !== 'closed') {
                this.audioContext.close();
            }
        };

        const playbackRate = this.shadowRoot.querySelector('.playback-rate');
        const prevButton = this.shadowRoot.querySelector('.playback-controls button:first-child');
        const nextButton = this.shadowRoot.querySelector('.playback-controls button:last-child');

        // Add playback control handlers
        const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
        let currentRateIndex = 2; // Start at 1x speed

        playbackRate.addEventListener('click', () => {
            currentRateIndex = (currentRateIndex + 1) % rates.length;
            const rate = rates[currentRateIndex];
            audio.playbackRate = rate;
            playbackRate.textContent = `${rate}x`;
        });

        prevButton.addEventListener('click', () => {
            audio.currentTime = Math.max(0, audio.currentTime - 10);
        });

        nextButton.addEventListener('click', () => {
            audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
        });

        // Update play button handler
        playButton.addEventListener('click', async () => {
            try {
                await initializeAudioNodes();
                
                if (audio.paused) {
                    await audio.play();
                    playButton.classList.add('playing');
                } else {
                    audio.pause();
                    playButton.classList.remove('playing');
                }
            } catch (error) {
                console.error('Playback failed:', error);
                alert('Could not play audio. Please check if the audio file exists and is accessible.');
            }
        });

        // Update audio state change handlers
        audio.addEventListener('play', () => {
            playButton.classList.add('playing');
        });

        audio.addEventListener('pause', () => {
            playButton.classList.remove('playing');
            // Stop recording when paused
            this.stopRecording();
        });

        // Update volume button handler
        volumeButton.addEventListener('click', () => {
            const wasMuted = audio.volume === 0;
            if (wasMuted) {
                audio.volume = previousVolume || 1;
                volumeSlider.value = audio.volume * 100;
                volumeButton.classList.remove('muted');
            } else {
                previousVolume = audio.volume;
                audio.volume = 0;
                volumeSlider.value = 0;
                volumeButton.classList.add('muted');
            }
        });

        // Update audio end handler
        audio.addEventListener('ended', () => {
            playButton.classList.remove('playing');
            // Stop recording when track ends
            this.stopRecording();
        });

        // Handle loading states
        audio.addEventListener('loadstart', () => {
            playButton.disabled = true;
        });

        audio.addEventListener('canplay', () => {
            playButton.disabled = false;
        });

        // Set up canvas sizing
        const updateCanvasSize = () => {
            const canvas = this.shadowRoot.querySelector('canvas');
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            
            canvas.width = rect.width * dpr;
            canvas.height = (rect.width * 9/16) * dpr;
            
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
        };

        // Handle window resize
        window.addEventListener('resize', () => {
            updateCanvasSize();
            this.renderCanvas();
        });
        updateCanvasSize();

        // Start render loop
        const animate = () => {
            this.renderCanvas();
            this.renderFrameId = requestAnimationFrame(animate);
        };
        animate();

        // Load initial track
        if (playlist.length) {
            const firstTrack = playlist[0];
            if (firstTrack.image) {
                this.loadImage(firstTrack.image);
            }
            if (firstTrack.title) {
                this.state.currentTitle = firstTrack.title;
            }
        }

        // Add cleanup to disconnectedCallback
        const originalDisconnect = this.disconnectedCallback;
        this.disconnectedCallback = () => {
            this.stopRecording();
            originalDisconnect?.call(this);
        };

        // Add record toggle handler
        const recordToggle = this.shadowRoot.querySelector('#recordToggle');
        recordToggle.addEventListener('change', () => {
            if (!recordToggle.checked && this.recordingState.isRecording) {
                this.stopRecording();
            }
        });
    }

    getConfigTitle() {
        // Assuming config is parsed from the "config" attribute.
        try {
            const config = JSON.parse(this.getAttribute("config"));
            return config && config.tracks && config.tracks[0] && config.tracks[0].title;
        } catch (err) {
            return null;
        }
    }

    disconnectedCallback() {
        if (this.source) {
            this.source.disconnect();
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
    }
}

customElements.define('audio-player', AudioPlayer);
export default AudioPlayer;
