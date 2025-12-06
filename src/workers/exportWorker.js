import * as Mp4Muxer from 'mp4-muxer';
import { vsSource, fsSource } from '../utils/shaders';

// WebGL Context State
let gl = null;
let program = null;
let buffers = null;
let locations = null;
let canvas = null;

// Initialize WebGL on OffscreenCanvas
function initGL(width, height) {
    canvas = new OffscreenCanvas(width, height);
    gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: true, // Often crucial for OffscreenCanvas + VideoFrame
        powerPreference: 'high-performance'
    });

    if (!gl) throw new Error("WebGL initialization failed in worker");

    // Compile Shaders
    const createShader = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(s));
            throw new Error("Shader compile failed");
        }
        return s;
    };

    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("Program link failed");
    }

    // Buffers
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]), gl.STATIC_DRAW);
    buffers = { position: buf };

    // Locations
    locations = {
        attrib: { vertex: gl.getAttribLocation(program, 'aVertexPosition') },
        uniform: {
            res: gl.getUniformLocation(program, 'uResolution'),
            time: gl.getUniformLocation(program, 'uTime'),
            speed: gl.getUniformLocation(program, 'uSpeed'),
            colors: gl.getUniformLocation(program, 'uColors'),
        }
    };
}

function renderFrame(time, speed, colors) {
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(locations.attrib.vertex, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locations.attrib.vertex);

    gl.uniform2f(locations.uniform.res, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(locations.uniform.time, time);
    gl.uniform1f(locations.uniform.speed, speed);
    
    // Flatten colors
    const flatColors = [];
    for(let i=0; i<5; i++) {
        const c = colors[i % colors.length];
        flatColors.push(c[0], c[1], c[2]);
    }
    gl.uniform3fv(locations.uniform.colors, new Float32Array(flatColors));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// Main Export Handler
self.onmessage = async (e) => {
    const { type, payload } = e.data;

    if (type === 'START_EXPORT') {
        const { width, height, fps, duration, speed, colors } = payload;
        
        try {
            initGL(width, height);

            // Setup Muxer
            const muxer = new Mp4Muxer.Muxer({
                target: new Mp4Muxer.ArrayBufferTarget(),
                video: {
                    codec: 'avc',
                    width, height, frameRate: fps
                },
                fastStart: 'in-memory',
            });

            // Setup Encoder
            const encoder = new VideoEncoder({
                output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                error: (err) => {
                    console.error("Worker Encoder Error", err);
                    self.postMessage({ type: 'ERROR', error: err.message });
                }
            });

            encoder.configure({
                codec: 'avc1.4d0033', // Main Profile Level 5.1
                width, height,
                bitrate: 25_000_000,
                framerate: fps,
                hardwareAcceleration: 'prefer-hardware'
            });

            const totalFrames = Math.ceil(duration * fps);
            const dt = 1.0 / fps;

            // Pure rendering loop
            for (let i = 0; i < totalFrames; i++) {
                // 1. Backpressure Control
                // Keep the encoder queue VERY full (30-40 frames) to ensure the GPU never waits.
                if (encoder.encodeQueueSize > 40) {
                    await new Promise(resolve => {
                        const check = () => {
                            // Resume quickly (at 35) to keep pressure high
                            if (encoder.encodeQueueSize <= 35) resolve();
                            else setTimeout(check, 0); 
                        };
                        check();
                    });
                }

                const time = i * dt;
                
                // 2. Render
                renderFrame(time, speed, colors);

                // 3. Encode
                // OffscreenCanvas can be passed directly to VideoFrame!
                const frame = new VideoFrame(canvas, {
                    timestamp: time * 1_000_000,
                    duration: dt * 1_000_000
                });
                
                try {
                    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
                } catch (e) {
                    console.error("Encoding error frame " + i, e);
                    throw e;
                } finally {
                    frame.close();
                }

                // 4. Report Progress
                // Reduce IPC overhead: Update only once per second (approx)
                if (i % 60 === 0) {
                    self.postMessage({ type: 'PROGRESS', percent: Math.round((i / totalFrames) * 100) });
                }
            }

            await encoder.flush();
            muxer.finalize();

            const { buffer } = muxer.target;
            self.postMessage({ type: 'DONE', buffer }, [buffer]); // Transfer buffer
            
        } catch (err) {
            self.postMessage({ type: 'ERROR', error: err.message });
        }
    }
};
