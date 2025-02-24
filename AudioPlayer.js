class AudioPlayer extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                /* ...existing styles... */
                :host { display: block; max-width: 600px; }
                canvas { width: 100%; height: 100px; background: #000; }
                ul { list-style: none; padding: 0; }
                li { cursor: pointer; padding: 4px; }
                li.active { font-weight: bold; }
            </style>
            <div>
                <audio controls src=""></audio>
                <canvas></canvas>
                <ul id="playlist"></ul>
                <div class="lcd-display">
                    <span class="lcd">Track Title</span>
                </div>
            </div>
        `;
    }

    connectedCallback() {
        const audio = this.shadowRoot.querySelector('audio');
        const canvas = this.shadowRoot.querySelector('canvas');
        const playlistContainer = this.shadowRoot.querySelector('#playlist');
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
        // Set default audio source from first track if available.
        if (playlist.length && playlist[0].src) {
            audio.src = playlist[0].src;
        } else {
            audio.src = this.getAttribute('src') || "";
        }

        // Render playlist list
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
                    audio.src = item.src;
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
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.shadowColor = barColor;  // added for LCD glow effect
            ctx.shadowBlur = 10;         // increased blur for glow
            const groupSize = Math.floor(bufferLength / barCount);
            const barWidth = (canvas.width - (barCount - 1) * barSpacing) / barCount;
            let x = 0;
            for (let i = 0; i < barCount; i++) {
                let sum = 0;
                for (let j = 0; j < groupSize; j++) {
                    sum += this.dataArray[i * groupSize + j];
                }
                const avg = sum / groupSize;
                const barHeight = (avg / 255 * canvas.height) * scaleFactor;
                // Use the dot pattern as fill style for the bar
                ctx.fillStyle = dotPattern;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + barSpacing;
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
