class AudioPlayer extends HTMLElement {
    constructor() {
        super();
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

        // Render playlist list and update title overlay on track change.
        const renderPlaylist = () => {
            playlistContainer.innerHTML = '';
            playlist.forEach((item, index) => {
                const li = document.createElement('li');
                li.textContent = item.title || item.src || `Track ${index + 1}`;
                li.className = index === 0 ? 'active' : '';
                li.addEventListener('click', () => {
                    // Remove active class from all
                    [...playlistContainer.children].forEach(el => el.classList.remove('active'));
                    li.classList.add('active');
                    if (this.audioContext.state === 'suspended') {
                        this.audioContext.resume();
                    }
                    audio.src = item.src;
                    // Update background image and aspect ratio if provided
                    if (item.image) { img.src = item.image; }
                    if (item.aspectRatio) { img.style.aspectRatio = item.aspectRatio; }
                    if (item.title) { titleText.textContent = item.title; }
                    audio.play();
                });
                playlistContainer.appendChild(li);
            });
        };
        renderPlaylist();

        // Create and configure the AudioContext and AnalyserNode
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);

        // Create source from the audio element and connect nodes
        this.source = this.audioContext.createMediaElementSource(audio);
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

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
        
        // Initialize currentBarHeights array if not already done or if barCount changes
        if (!this.currentBarHeights || this.currentBarHeights.length !== barCount) {
            this.currentBarHeights = new Array(barCount).fill(0);
        }

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
            requestAnimationFrame(renderFrame);
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
                if (newHeight < this.currentBarHeights[i]) {
                    this.currentBarHeights[i] = Math.max(newHeight, this.currentBarHeights[i] - fallSpeed);
                } else {
                    this.currentBarHeights[i] = newHeight;
                }
                const currentX = startX + (i * (barWidth + barSpacing));
                ctx.fillStyle = dotPattern;
                ctx.fillRect(currentX, canvas.height - this.currentBarHeights[i], barWidth, this.currentBarHeights[i]);
            }
            // Reset shadow settings after drawing
            ctx.shadowBlur = 0;
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
        // Clean up AudioContext if needed
        if (this.audioContext && this.audioContext.close) {
            this.audioContext.close();
        }
    }
}

customElements.define('audio-player', AudioPlayer);
export default AudioPlayer;
