class AudioPlayer extends HTMLElement {
    constructor() {
        super();
        // Initialize AudioContext only (remove analyzer setup)
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
        this.attachShadow({ mode: 'open' });
        // Updated template: add title overlay on top of the image
        this.shadowRoot.innerHTML = `
            <style>
                /* ...existing styles... */
                :host { display: block; max-width: 600px; }
                .player-wrapper { position: relative; }
                .background-image { display: block; width: 100%; }
                .title-overlay {
                    position: absolute;
                    bottom: calc(50% + 10px); /* places title just above the canvas */
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 2; 
                    color: white;
                    font-size: calc(16px + 1vw);
                    pointer-events: none;
                }
                canvas {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    pointer-events: none;
                    background: transparent;
                    width: 90%;
                    z-index: 1;
                }
                ul { list-style: none; padding: 0; }
                li { cursor: pointer; padding: 4px; }
                li.active { font-weight: bold; }
                .lcd-display { text-align: center; margin-top: 10px; }
            </style>
            <div class="player-wrapper">
                <!-- HTML element for title overlay -->
                <div class="title-overlay">
                    <span class="title-text">Track Title</span>
                </div>
                <!-- HTML element with the image -->
                <img class="background-image" src="./default-image.jpg" alt="Album Art">
                <!-- Canvas overlay centered over the image -->
                <canvas></canvas>
            </div>
            <!-- Other controls below -->
            <audio controls src=""></audio>
            <ul id="playlist"></ul>
            <div class="lcd-display">
                <span class="lcd">Track Title</span>
            </div>
        `;
    }

    async setupAudioNodes(audio) {
        // Clean up old source if it exists
        if (this.source) {
            this.source.disconnect();
        }

        // Create and configure analyzer
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        // Create and connect new source
        this.source = this.audioContext.createMediaElementSource(audio);
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        
        console.log('Audio nodes and analyzer reconnected');
        return this.analyser.frequencyBinCount; // Return buffer length for visualization
    }

    connectedCallback() {
        const audio = this.shadowRoot.querySelector('audio');
        const canvas = this.shadowRoot.querySelector('canvas');
        const playlistContainer = this.shadowRoot.querySelector('#playlist');
        const img = this.shadowRoot.querySelector('.background-image');
        const titleText = this.shadowRoot.querySelector('.title-text');
        const ctx = canvas.getContext('2d');

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
            if (playlist[0].image) { img.src = playlist[0].image; }
            if (playlist[0].aspectRatio) { img.style.aspectRatio = playlist[0].aspectRatio; }
            if (playlist[0].title) { titleText.textContent = playlist[0].title; }
        } else {
            audio.src = this.getAttribute('src') || "";
        }
        // Apply dim setting to background if provided
        if (vizConfig.dim !== undefined) {
            img.style.filter = `brightness(${vizConfig.dim})`;
        }

        // Initialize audio context only on user interaction to comply with autoplay policies
        let audioNodesInitialized = false;
        let renderFrameId = null;

        const initializeAudioNodes = async () => {
            if (!audioNodesInitialized) {
                const bufferLength = await this.setupAudioNodes(audio);
                audioNodesInitialized = true;
                console.log('Audio nodes initialized, starting visualization');
                startVisualization(bufferLength);
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
                        if (item.image) { img.src = item.image; }
                        if (item.aspectRatio) { img.style.aspectRatio = item.aspectRatio; }
                        if (item.title) { titleText.textContent = item.title; }
                        
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

        // Move visualization setup into separate function
        const startVisualization = (bufferLength) => {
            // Create and configure the AudioContext and AnalyserNode
            this.dataArray = new Uint8Array(bufferLength);

            // Ensure canvas dimensions are set
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;

            // Use visualization settings from config: scale factor, color, bar count, and bar spacing with defaults.
            const scaleFactor = vizConfig.scale || 1;
            const barColor = vizConfig.color || 'lime'; // now taken directly from config
            const barCount = vizConfig.barCount || bufferLength; // if not provided, use all frequency bins
            const barSpacing = vizConfig.barSpacing || 2;

            // Retrieve fallSpeed from config (default to 2 pixels per frame)
            const fallSpeed = vizConfig.fallSpeed || 2;
            
            // Initialize arrays for current heights and peak tracking
            if (!this.currentBarHeights || this.currentBarHeights.length !== barCount) {
                this.currentBarHeights = new Array(barCount).fill(0);
                this.peakHeights = new Array(barCount).fill(0);
                this.peakHoldCounters = new Array(barCount).fill(0);
            }

            const peakHoldTime = vizConfig.peakHoldTime || 30;  // frames to hold peak
            const peakDecay = vizConfig.peakDecay || 0.5;      // pixels per frame decay

            // Create an off-screen canvas for the dot pattern
            const patternCanvas = document.createElement('canvas');
            patternCanvas.width = 4;
            patternCanvas.height = 4;
            const pCtx = patternCanvas.getContext('2d');
            // Draw a small dot in the center
            pCtx.fillStyle = barColor;
            pCtx.fillRect(1, 1, 2, 2);
            // Create repeatable pattern
            const dotPattern = ctx.createPattern(patternCanvas, 'repeat');

            // Start rendering the frequency bars with new settings
            const renderFrame = () => {
                renderFrameId = requestAnimationFrame(renderFrame);
                if (this.analyser) {
                    this.analyser.getByteFrequencyData(this.dataArray);
                    // Instead of filling with black, clear the canvas for a transparent background
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.shadowColor = barColor;  // added for LCD glow effect
                    ctx.shadowBlur = 10;         // increased blur for glow
                    const groupSize = Math.floor(bufferLength / barCount);
                    // Compute barWidth and startX as before
                    // Add padding on sides and calculate exact bar dimensions
                    const padding = barSpacing * 2;  // padding on each side
                    const availableWidth = canvas.width - (padding * 2);  // width minus padding
                    const barWidth = (availableWidth - (barSpacing * (barCount - 1))) / barCount;
                    // Calculate starting X with padding
                    const startX = padding;

                    // Use improved logarithmic grouping for better low-frequency resolution.
                    // Define frequency exponent (default 1.5) to adjust grouping.
                    const freqExp = vizConfig.freqExp || 1.5;
                    // Define a new frequency mapping parameter alpha (default 4)
                    const alpha = vizConfig.alpha || 4;

                    // Configuration for dual-segmentation frequency mapping:
                    const linearBars = vizConfig.linearBars !== undefined ? vizConfig.linearBars : 5;
                    // linearPortion: the number of bins allocated linearly (default 30% of bufferLength)
                    const linearPortion = vizConfig.linearPortion !== undefined ? vizConfig.linearPortion : Math.floor(bufferLength * 0.3);
                    
                    for (let i = 0; i < barCount; i++) {
                        let lowerBound, upperBound;
                        if (i < linearBars) {
                            // Use linear mapping for the first linearBars bars.
                            lowerBound = Math.floor(1 + (i / linearBars) * linearPortion);
                            upperBound = Math.floor(1 + ((i + 1) / linearBars) * linearPortion);
                        } else {
                            // Use exponential mapping for bars after linearBars.
                            const expIndex = i - linearBars;
                            const expBars = barCount - linearBars;
                            lowerBound = Math.floor(linearPortion + ((Math.exp(alpha * (expIndex / expBars)) - 1) / (Math.exp(alpha) - 1)) * (bufferLength - linearPortion));
                            upperBound = Math.floor(linearPortion + ((Math.exp(alpha * ((expIndex + 1) / expBars)) - 1) / (Math.exp(alpha) - 1)) * (bufferLength - linearPortion));
                        }
                        if (upperBound <= lowerBound) {
                            upperBound = lowerBound + 1;
                        }
                        let sum = 0, count = 0;
                        for (let j = lowerBound; j < upperBound; j++) {
                            sum += this.dataArray[j];
                            count++;
                        }
                        const avg = count > 0 ? sum / count : 0;
                        const newHeight = (avg / 255 * canvas.height) * scaleFactor;
                        
                        // Update current bar height with fall speed
                        if (newHeight < this.currentBarHeights[i]) {
                            this.currentBarHeights[i] = Math.max(newHeight, this.currentBarHeights[i] - fallSpeed);
                        } else {
                            this.currentBarHeights[i] = newHeight;
                        }

                        // Update peak tracking
                        if (newHeight >= this.peakHeights[i]) {
                            this.peakHeights[i] = newHeight;
                            this.peakHoldCounters[i] = peakHoldTime;
                        } else {
                            if (this.peakHoldCounters[i] > 0) {
                                this.peakHoldCounters[i]--;
                            } else {
                                this.peakHeights[i] = Math.max(0, this.peakHeights[i] - peakDecay);
                            }
                        }

                        // Draw main bar
                        const currentX = startX + (i * (barWidth + barSpacing));
                        ctx.fillStyle = dotPattern;
                        ctx.fillRect(currentX, canvas.height - this.currentBarHeights[i], barWidth, this.currentBarHeights[i]);

                        // Draw peak line
                        const peakY = canvas.height - this.peakHeights[i];
                        ctx.setLineDash([2, 2]);  // Create dotted line
                        ctx.beginPath();
                        ctx.moveTo(currentX, peakY);
                        ctx.lineTo(currentX + barWidth, peakY);
                        ctx.strokeStyle = barColor;
                        ctx.stroke();
                        ctx.setLineDash([]);  // Reset line style
                    }
                    // Reset shadow settings after drawing
                    ctx.shadowBlur = 0;
                }
            };

            renderFrame();
        };

        // Add audio play event listener to ensure visualization starts
        audio.addEventListener('play', async () => {
            if (!audioNodesInitialized) {
                await initializeAudioNodes();
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

        renderFrame();
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
