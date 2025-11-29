const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');
const imageInput = document.getElementById('imageInput');
const previewImage = document.getElementById('previewImage');
const recordBtn = document.getElementById('recordBtn');
const statusSpan = document.getElementById('status');
const resolutionSelect = document.getElementById('resolutionSelect');
const speedRange = document.getElementById('speedRange');
const fpsSelect = document.getElementById('fpsSelect');
const durationInput = document.getElementById('durationInput');

let extractedColors = [
    [0.8, 0.2, 0.2], // Default Red
    [0.2, 0.8, 0.2], // Default Green
    [0.2, 0.2, 0.8], // Default Blue
    [0.8, 0.8, 0.2]  // Default Yellow
];

// --- Shader Sources ---

const vsSource = `
    attribute vec4 aVertexPosition;
    void main(void) {
        gl_Position = aVertexPosition;
    }
`;

const fsSource = `
    precision highp float;

    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uSpeed;
    uniform vec3 uColors[5]; // Array of 5 extracted colors

    // Simplex 2D noise (standard implementation)
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

    float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        
        // Apply speed multiplier to time
        float time = uTime * 0.15 * uSpeed; 
        
        // Layer 1: Large base movement
        float n1 = snoise(uv * 0.5 + vec2(time * 0.1, time * 0.2));
        
        // Layer 2: Detailed flow
        float n2 = snoise(uv * 1.2 - vec2(time * 0.2, time * 0.1));

        // Distort UVs slightly for liquid feel
        vec2 distUV = uv + vec2(n1, n2) * 0.2;

        // Create organic masks for blending
        // We want distinct areas of color that merge softly but maintain identity
        
        // Use raw noise mapped to [0, 1] for maximum smoothness
        float mask1 = snoise(distUV * 0.5 + vec2(time * 0.1, 0.0)) * 0.5 + 0.5;
        float mask2 = snoise(distUV * 0.6 + vec2(0.0, time * 0.15) + 10.0) * 0.5 + 0.5;
        float mask3 = snoise(distUV * 0.4 - vec2(time * 0.1, time * 0.1) + 20.0) * 0.5 + 0.5;
        float mask4 = snoise(distUV * 0.7 + vec2(time * 0.15, -time * 0.1) + 30.0) * 0.5 + 0.5;

        // Layer blending: Start with Color 0
        vec3 finalColor = uColors[0];
        
        // Mix subsequent colors using the masks directly as interpolation factors
        // This creates continuous gradients without hard edges
        finalColor = mix(finalColor, uColors[1], mask1 * 0.6); 
        finalColor = mix(finalColor, uColors[2], mask2 * 0.6);
        finalColor = mix(finalColor, uColors[3], mask3 * 0.5);
        finalColor = mix(finalColor, uColors[4], mask4 * 0.4); // Highlight/Accent

        // Add a subtle noise grain/dither to prevent banding
        float grain = fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453);
        finalColor += (grain - 0.5) * 0.03;

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

// --- WebGL Setup ---

let shaderProgram = null;
let programInfo = null;
let buffers = null;
let startTime = 0;

function initWebGL() {
    if (!gl) {
        alert('Unable to initialize WebGL. Your browser or machine may not support it.');
        return;
    }

    shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
        },
        uniformLocations: {
            resolution: gl.getUniformLocation(shaderProgram, 'uResolution'),
            time: gl.getUniformLocation(shaderProgram, 'uTime'),
            speed: gl.getUniformLocation(shaderProgram, 'uSpeed'),
            colors: gl.getUniformLocation(shaderProgram, 'uColors'),
        },
    };

    buffers = initBuffers(gl);
    startTime = Date.now();
    requestAnimationFrame(render);
}

function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }

    return shaderProgram;
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function initBuffers(gl) {
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    const positions = [
        -1.0,  1.0,
         1.0,  1.0,
        -1.0, -1.0,
         1.0, -1.0,
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    return {
        position: positionBuffer,
    };
}

// --- Rendering ---

function render(now) {
    resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(programInfo.program);

    // Set Position
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        2,
        gl.FLOAT,
        false,
        0,
        0
    );
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    // Set Uniforms
    gl.uniform2f(programInfo.uniformLocations.resolution, gl.canvas.width, gl.canvas.height);
    
    const currentTime = (Date.now() - startTime) * 0.001;
    gl.uniform1f(programInfo.uniformLocations.time, currentTime);
    
    // Set Speed Uniform
    const speed = parseFloat(speedRange.value);
    gl.uniform1f(programInfo.uniformLocations.speed, speed);

    // Flatten colors array for uniform
    let flatColors = [];
    // Ensure we always have 5 colors (repeat if necessary)
    for(let i=0; i<5; i++) {
        let c = extractedColors[i % extractedColors.length];
        flatColors.push(c[0], c[1], c[2]);
    }
    gl.uniform3fv(programInfo.uniformLocations.colors, new Float32Array(flatColors));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(render);
}

function resizeCanvasToDisplaySize(canvas) {
    const resSetting = resolutionSelect.value;
    let width, height;

    if (resSetting === 'window') {
        // Match display size
        width = canvas.clientWidth;
        height = canvas.clientHeight;
    } else {
        // Fixed resolution
        const parts = resSetting.split('x');
        width = parseInt(parts[0]);
        height = parseInt(parts[1]);
    }

    // Update canvas internal resolution if needed
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    
    // Style adjustments for Preview vs Fixed
    // If fixed resolution, we want to ensure it fits in the view without stretching visually
    if (resSetting !== 'window') {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain'; // Preserve aspect ratio in preview
    } else {
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.style.objectFit = '';
    }
}

// --- Color Extraction Logic ---

function extractColors(imgElement) {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    
    // Downscale for sampling
    tempCanvas.width = 100;
    tempCanvas.height = 100;
    
    ctx.drawImage(imgElement, 0, 0, tempCanvas.width, tempCanvas.height);
    const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
    
    let pixelColors = [];
    const step = 2; // Sample more densely

    for (let i = 0; i < imageData.length; i += 4 * step) {
        const r = imageData[i];
        const g = imageData[i+1];
        const b = imageData[i+2];
        const brightness = (r + g + b) / 3;
        
        // Less strict filtering to ensure we capture dark blues/blacks if needed,
        // but generally still prefer colorful pixels.
        if (brightness > 10 && brightness < 245) {
            pixelColors.push([r/255, g/255, b/255]);
        }
    }

    if (pixelColors.length === 0) return [[0.5,0.5,0.5]];

    // Helper to calculate distance squared
    function distSq(c1, c2) {
        return Math.pow(c1[0]-c2[0], 2) + Math.pow(c1[1]-c2[1], 2) + Math.pow(c1[2]-c2[2], 2);
    }

    // 1. Find the "Most Saturated" color as the seed
    let bestSeed = pixelColors[0];
    let maxSat = -1;
    
    // Checking a subset of pixels to find a good seed to save time
    for(let i=0; i<pixelColors.length; i+=10) {
        let c = pixelColors[i];
        let sat = Math.max(c[0],c[1],c[2]) - Math.min(c[0],c[1],c[2]);
        if(sat > maxSat) {
            maxSat = sat;
            bestSeed = c;
        }
    }

    let finalColors = [bestSeed];

    // 2. Furthest Point Sampling
    // We want 5 colors. For each new color, find the pixel that has the 
    // MAXIMUM minimum-distance to the set of already chosen colors.
    
    const targetCount = 5;
    
    // Optimization: Work with a smaller random subset of pixels to keep it fast
    const sampleSize = 1000;
    let paletteCandidates = [];
    for(let i=0; i<sampleSize; i++) {
        paletteCandidates.push(pixelColors[Math.floor(Math.random() * pixelColors.length)]);
    }

    for(let k=1; k<targetCount; k++) {
        let maxDist = -1;
        let bestCandidate = paletteCandidates[0];

        for(let i=0; i<paletteCandidates.length; i++) {
            let c = paletteCandidates[i];
            
            // Find min distance to ANY existing finalColor
            let minDistToExisting = 100.0;
            for(let j=0; j<finalColors.length; j++) {
                let d = distSq(c, finalColors[j]);
                if(d < minDistToExisting) minDistToExisting = d;
            }

            if(minDistToExisting > maxDist) {
                maxDist = minDistToExisting;
                bestCandidate = c;
            }
        }
        finalColors.push(bestCandidate);
    }

    // Fallback: if we didn't find enough distinct colors (e.g. monochrome image), fill with variants
    while(finalColors.length < 5) {
        finalColors.push(finalColors[0]);
    }

    // Optional: Sort final colors by brightness or saturation if desired
    // But random/distance order is usually interesting enough.

    return finalColors;
}

// --- Event Listeners ---

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            previewImage.src = event.target.result;
            previewImage.style.display = 'block';
            
            const img = new Image();
            img.onload = () => {
                extractedColors = extractColors(img);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// --- Recording Logic ---

recordBtn.addEventListener('click', () => {
    const fps = parseInt(fpsSelect.value) || 60;
    const stream = canvas.captureStream(fps); 
    const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 25000000 // Higher bitrate for better quality (25Mbps)
    });
    
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dynamic_background.webm';
        a.click();
        URL.revokeObjectURL(url);
        statusSpan.textContent = "Done!";
        recordBtn.disabled = false;
    };

    recorder.start();
    recordBtn.disabled = true;
    statusSpan.textContent = "Recording...";

    const durationSeconds = parseInt(durationInput.value) || 5; // Default to 5 seconds
    const durationMs = durationSeconds * 1000;
    setTimeout(() => {
        recorder.stop();
    }, durationMs);
});

// --- Init ---
initWebGL();