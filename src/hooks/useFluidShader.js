import { useEffect, useRef } from 'react';
import { vsSource, fsSource } from '../utils/shaders';

export function useFluidShader(canvasRef, colors, speed, width, height) {
    const contextRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Initialize WebGL
        const gl = canvas.getContext('webgl');
        if (!gl) return;

        // Shaders
        const loadShader = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vertexShader = loadShader(gl.VERTEX_SHADER, vsSource);
        const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fsSource);
        
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            return;
        }

        // Buffers
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1.0,  1.0,
             1.0,  1.0,
            -1.0, -1.0,
             1.0, -1.0,
        ]), gl.STATIC_DRAW);

        // Locations
        const attribLocations = {
            vertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
        };
        const uniformLocations = {
            resolution: gl.getUniformLocation(program, 'uResolution'),
            time: gl.getUniformLocation(program, 'uTime'),
            speed: gl.getUniformLocation(program, 'uSpeed'),
            colors: gl.getUniformLocation(program, 'uColors'),
        };

        contextRef.current = {
            gl,
            program,
            attribLocations,
            uniformLocations,
            buffers: { position: positionBuffer }
        };

    }, []); // Init only once

    // Function to render a single frame
    const renderFrame = (timeInSeconds) => {
        const ctx = contextRef.current;
        if (!ctx) return;
        const { gl, program, attribLocations, uniformLocations, buffers } = ctx;

        // Resize if needed (important for exporting at different resolutions)
        if (gl.canvas.width !== width || gl.canvas.height !== height) {
            gl.canvas.width = width;
            gl.canvas.height = height;
        }

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
        gl.vertexAttribPointer(attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(attribLocations.vertexPosition);

        // Update Uniforms
        gl.uniform2f(uniformLocations.resolution, gl.canvas.width, gl.canvas.height);
        gl.uniform1f(uniformLocations.time, timeInSeconds);
        gl.uniform1f(uniformLocations.speed, speed);

        // Colors
        const flatColors = [];
        for(let i=0; i<5; i++) {
            let c = colors[i % colors.length];
            flatColors.push(c[0], c[1], c[2]);
        }
        gl.uniform3fv(uniformLocations.colors, new Float32Array(flatColors));

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    return { renderFrame };
}
